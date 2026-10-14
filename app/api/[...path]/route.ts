import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authClient, checkOrigin } from "@/server/auth";
import {
  Actor,
  checkMembership,
  database,
  executeCommand,
  exportSnapshot,
  lockMove,
  snapshot,
  transaction,
} from "@/server/database";
import { commandSchema } from "@/domain/commands";
import { DomainError, rooms } from "@/domain/model";
import { processMessage, resolveProposal } from "@/server/chat";
import { semanticSearch } from "@/ai/pipeline";
import { aiEnabled } from "@/ai/config";
import {
  budgetedDecision,
  GatewayExtractionService,
  paidCall,
} from "@/ai/services";
import { search } from "@/domain/search";
import { exportInventory, unitsCsv } from "@/server/backup";
import { previewImport, commitImport } from "@/server/imports";

export const runtime = "nodejs";
export const maxDuration = 90;
const headers = { "Cache-Control": "private, no-store" };
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers });
async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > 100000)
    throw new DomainError(
      "BODY_SIZE",
      "La solicitud es demasiado grande.",
      400,
    );
  try {
    return JSON.parse(raw);
  } catch {
    throw new DomainError("INVALID_JSON", "Solicitud inválida.", 400);
  }
}
const id = (value: string | null) => z.uuid().parse(value);
const ownConversation = async (actor: Actor, conversationId: string) => {
  const row = (
    await database().query(
      "select * from conversations where id=$1 and move_id=$2 and participant_id=$3",
      [id(conversationId), actor.moveId, actor.participantId],
    )
  ).rows[0];
  if (!row)
    throw new DomainError("NOT_FOUND", "Conversación no encontrada.", 404);
  return row;
};
async function handle(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.slice(5).split("/");
  const route = path.join("/");
  try {
    if (request.method !== "GET") checkOrigin(request);
    if (route === "auth/google" && request.method === "POST") {
      const client = await authClient();
      const result = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: new URL("/auth/callback", process.env.APP_BASE_URL!).href,
          scopes: "openid email profile",
          queryParams: { prompt: "select_account" },
        },
      });
      if (result.error || !result.data.url)
        throw new DomainError(
          "OAUTH",
          "No pudimos iniciar Google. Intentá nuevamente.",
          503,
        );
      return NextResponse.redirect(result.data.url, { status: 303, headers });
    }
    if (route === "auth/signout" && request.method === "POST") {
      const { error } = await (
        await authClient()
      ).auth.signOut({ scope: "local" });
      if (error)
        throw new DomainError(
          "SIGNOUT",
          "No se pudo completar la salida del servidor.",
          503,
        );
      return json({ ok: true });
    }
    const actor = await authenticate();
    if (route === "bootstrap" && request.method === "GET") {
      const state = await snapshot(actor);
      return json({
        account: { userId: actor.userId, email: actor.email },
        participant: state.participants.find(
          (p) => p.id === actor.participantId,
        ),
        move: { id: actor.moveId, name: "Casa de los Gesualdo" },
        rooms,
        participants: state.participants,
        capabilities: { ai: aiEnabled() },
      });
    }
    if (route === "commands" && request.method === "POST") {
      const b = z
        .object({ command: commandSchema, deviceId: z.uuid() })
        .strict()
        .parse(await body(request));
      try {
        return json({
          status: "applied",
          receipt: await executeCommand(actor, b.command, b.deviceId),
        });
      } catch (e) {
        if (e instanceof DomainError && e.status === 409)
          return json(
            {
              code: e.code,
              message: e.message,
              snapshot: await snapshot(actor),
            },
            409,
          );
        throw e;
      }
    }
    if (
      path[0] === "commands" &&
      path.length === 2 &&
      request.method === "GET"
    ) {
      const record = (await snapshot(actor)).receipts[id(path[1])];
      if (!record || record.actorId !== actor.participantId)
        throw new DomainError("NOT_FOUND", "Recibo no encontrado.", 404);
      return json(record.receipt);
    }
    if (route === "labels/reserve" && request.method === "POST") {
      const b = z
        .object({
          operationId: z.uuid(),
          deviceId: z.uuid(),
          expectedParticipantId: z.uuid(),
          kind: z.enum(["box", "bag", "furniture", "other"]),
          count: z.number().int().min(1).max(10),
        })
        .strict()
        .parse(await body(request));
      if (b.expectedParticipantId !== actor.participantId)
        throw new DomainError("ACTOR_MISMATCH", "La cuenta cambió.", 409);
      return json(
        await transaction(database(), async (client) => {
          await lockMove(client, actor.moveId);
          await checkMembership(client, actor);
          const previous = (
            await client.query("select * from label_reservations where id=$1", [
              b.operationId,
            ])
          ).rows[0];
          if (previous) {
            if (
              previous.move_id !== actor.moveId ||
              previous.participant_id !== actor.participantId ||
              previous.device_id !== b.deviceId ||
              previous.kind !== b.kind ||
              previous.codes.length !== b.count
            )
              throw new DomainError(
                "IDEMPOTENCY_CONFLICT",
                "La reserva tiene otros datos.",
                409,
              );
            return { codes: previous.codes };
          }
          const move = (
            await client.query("select counters from moves where id=$1", [
              actor.moveId,
            ])
          ).rows[0];
          const prefixes = { box: "C", bag: "B", furniture: "M", other: "O" };
          const codes = Array.from(
            { length: b.count },
            () =>
              `${prefixes[b.kind]}-${String(++move.counters[b.kind]).padStart(3, "0")}`,
          );
          await client.query("update moves set counters=$2 where id=$1", [
            actor.moveId,
            move.counters,
          ]);
          await client.query(
            "insert into label_reservations(id,move_id,participant_id,device_id,kind,codes) values($1,$2,$3,$4,$5,$6)",
            [
              b.operationId,
              actor.moveId,
              actor.participantId,
              b.deviceId,
              b.kind,
              JSON.stringify(codes),
            ],
          );
          return { codes };
        }),
      );
    }
    if (route === "conversations" && request.method === "POST") {
      const b = z
        .object({ id: z.uuid(), deviceId: z.uuid() })
        .strict()
        .parse(await body(request));
      await database().query(
        "insert into conversations(id,move_id,participant_id,device_id) values($1,$2,$3,$4) on conflict do nothing",
        [b.id, actor.moveId, actor.participantId, b.deviceId],
      );
      return json(await ownConversation(actor, b.id));
    }
    if (
      path[0] === "conversations" &&
      path[2] === "context" &&
      request.method === "PATCH"
    ) {
      await ownConversation(actor, path[1]);
      const b = z
        .object({
          activeUnitId: z.uuid().nullable(),
          expectedVersion: z.number().int().positive(),
          expectedParticipantId: z.uuid(),
        })
        .strict()
        .parse(await body(request));
      if (b.expectedParticipantId !== actor.participantId)
        throw new DomainError("ACTOR_MISMATCH", "La cuenta cambió.", 409);
      return json(
        await transaction(database(), async (client) => {
          await lockMove(client, actor.moveId);
          await checkMembership(client, actor);
          if (
            b.activeUnitId &&
            !(
              await client.query(
                "select id from units where id=$1 and move_id=$2",
                [b.activeUnitId, actor.moveId],
              )
            ).rowCount
          )
            throw new DomainError("NOT_FOUND", "Unidad no encontrada.", 404);
          const updated = (
            await client.query(
              "update conversations set active_unit_id=$4,version=version+1 where id=$1 and move_id=$2 and participant_id=$3 and version=$5 returning *",
              [
                path[1],
                actor.moveId,
                actor.participantId,
                b.activeUnitId,
                b.expectedVersion,
              ],
            )
          ).rows[0];
          if (!updated)
            throw new DomainError(
              "CONTEXT_CONFLICT",
              "Cambió el contexto de la conversación.",
              409,
            );
          return updated;
        }),
      );
    }
    if (route === "chat/messages" && request.method === "POST") {
      const result = await processMessage(actor, await body(request));
      return json(result, result.processing ? 202 : 200);
    }
    if (
      path[0] === "chat" &&
      path[1] === "messages" &&
      path[3] === "resolve" &&
      request.method === "POST"
    )
      return json(
        await resolveProposal(actor, id(path[2]), await body(request)),
      );
    if (
      path[0] === "chat" &&
      path[1] === "messages" &&
      path.length === 3 &&
      request.method === "GET"
    ) {
      const m = (
        await database().query(
          "select response,status from messages where id=$1 and move_id=$2 and participant_id=$3",
          [id(path[2]), actor.moveId, actor.participantId],
        )
      ).rows[0];
      if (!m) throw new DomainError("NOT_FOUND", "Mensaje no encontrado.", 404);
      return json(m);
    }
    if (
      path[0] === "conversations" &&
      path[2] === "messages" &&
      request.method === "GET"
    ) {
      await ownConversation(actor, path[1]);
      return json(
        (
          await database().query(
            "select id,request,response,status from messages where conversation_id=$1 and participant_id=$2 order by created_at limit 200",
            [path[1], actor.participantId],
          )
        ).rows,
      );
    }
    if (route === "imports/preview" && request.method === "POST")
      return json(await previewImport(actor));
    if (route === "imports/commit" && request.method === "POST")
      return json(await commitImport(actor, await body(request)));
    if (route === "search/semantic" && request.method === "POST") {
      const b = z
        .object({
          query: z.string().trim().min(1).max(4000),
          expectedParticipantId: z.uuid(),
        })
        .strict()
        .parse(await body(request));
      if (b.expectedParticipantId !== actor.participantId)
        throw new DomainError("ACTOR_MISMATCH", "La cuenta cambió.", 409);
      return json(await semanticSearch(actor, b.query, crypto.randomUUID()));
    }
    if (route === "usage" && request.method === "GET") {
      const used = (
        await database().query(
          "select coalesce(sum(cost),0) spent,coalesce(sum(reserved) filter(where cost is null),0) reserved from ai_usage where move_id=$1",
          [actor.moveId],
        )
      ).rows[0];
      return json({
        ...used,
        enabled: aiEnabled(),
        budget: (
          await database().query("select ai_budget from moves where id=$1", [
            actor.moveId,
          ])
        ).rows[0].ai_budget,
      });
    }
    if (route === "ai/check" && request.method === "POST") {
      const b = z
        .object({ operationId: z.uuid(), expectedParticipantId: z.uuid() })
        .strict()
        .parse(await body(request));
      if (b.expectedParticipantId !== actor.participantId)
        throw new DomainError("ACTOR_MISMATCH", "La cuenta cambió.", 409);
      const decision = await budgetedDecision(
        actor,
        "Buscar hervidor. Registro: pava eléctrica.",
        { match: "Mismo objeto por sinónimo", unknown: "Sin coincidencia" },
        undefined,
        `${b.operationId}:check:decision`,
      );
      const input = JSON.stringify({
        message: "Agregá platos azules a C-001",
        units: [{ code: "C-001", name: "Caja" }],
        entries: [],
        rooms,
      });
      const extracted = await paidCall(
        actor,
        "extraction",
        `${b.operationId}:check:extract`,
        input,
        () => new GatewayExtractionService().extract(input),
      );
      const valid =
        extracted.plan.operations.length === 1 &&
        extracted.plan.operations[0].type === "append" &&
        extracted.plan.operations[0].sourceText === "platos azules" &&
        extracted.plan.operations[0].target === "C-001";
      return json({
        ok: decision.choice === "match" && valid,
        message:
          decision.choice === "match" && valid
            ? "El asistente respondió y la extracción fue válida. No se cambió el inventario."
            : "El proveedor respondió, pero la interpretación de prueba necesita revisión. Los cambios siguen requiriendo confirmación.",
      });
    }
    if (route === "sync" && request.method === "GET") {
      const after = z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(url.searchParams.get("after") ?? "0");
      const limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .parse(url.searchParams.get("limit") ?? "50");
      return json(
        await transaction(database(), async (client) => {
          const head = (
            await client.query(
              "select revision,counters from moves where id=$1 for share",
              [actor.moveId],
            )
          ).rows[0];
          await checkMembership(client, actor);
          if (after > Number(head.revision))
            throw new DomainError(
              "SYNC_CURSOR",
              "La revisión local no corresponde a esta mudanza.",
              409,
            );
          const events = (
            await client.query(
              "select data from events where move_id=$1 and revision>$2 order by revision limit $3",
              [actor.moveId, after, limit],
            )
          ).rows.map((row) => row.data);
          const nextCursor = events.at(-1)?.revision ?? after;
          return {
            events,
            nextCursor,
            hasMore: nextCursor < Number(head.revision),
            headRevision: Number(head.revision),
            counters: head.counters,
          };
        }),
      );
    }
    if (request.method === "GET") {
      const state = await snapshot(actor);
      if (route === "inventory/snapshot") return json(state);
      if (route === "units")
        return json({
          units: state.units.filter(
            (u) =>
              !u.archived &&
              (!url.searchParams.get("room") ||
                u.destination === url.searchParams.get("room")),
          ),
          revision: state.revision,
        });
      if (path[0] === "units" && path[1]) {
        const unit = state.units.find((u) => u.id === id(path[1]));
        if (!unit)
          throw new DomainError("NOT_FOUND", "Unidad no encontrada.", 404);
        const events = state.events.filter((e) =>
          e.changes.some((c) => c.id === unit.id),
        );
        return json(
          path[2] === "events"
            ? events
            : {
                unit,
                entries: state.entries.filter(
                  (e) => e.unitId === unit.id || e.lastUnitId === unit.id,
                ),
                events,
              },
        );
      }
      if (route === "search")
        return json({
          hits: search(
            state,
            z
              .string()
              .max(4000)
              .parse(url.searchParams.get("q") ?? ""),
          ),
          revision: state.revision,
        });
      if (route === "exports") {
        if (url.searchParams.get("format") === "csv")
          return new Response(unitsCsv(state), {
            headers: {
              ...headers,
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="unidades.csv"',
            },
          });
        const backup = await exportSnapshot(actor);
        return json({
          ...exportInventory(backup.state),
          label_reservations: backup.reservations,
        });
      }
    }
    throw new DomainError("NOT_FOUND", "Ruta no encontrada.", 404);
  } catch (e) {
    if (e instanceof DomainError)
      return json({ code: e.code, message: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json(
        {
          code: "INVALID_REQUEST",
          message: "Revisá los datos de la solicitud.",
        },
        400,
      );
    console.error("request_failed", {
      route,
      error: e instanceof Error ? e.name : "Unknown",
    });
    return json(
      {
        code: "UNAVAILABLE",
        message: "No se pudo confirmar el cambio. Tus pendientes se conservan.",
      },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
