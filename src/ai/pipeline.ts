import { createHash } from "node:crypto";
import { Pool } from "pg";
import { ChatReply, interpret } from "../domain/chat";
import { Command, command, execute, versionsFor } from "../domain/commands";
import {
  DomainError,
  kindNames,
  normalize,
  roomName,
  rooms,
  State,
} from "../domain/model";
import { search, SearchHit } from "../domain/search";
import { Actor, database, snapshot } from "../server/database";
import { aiEnabled, modelConfig } from "./config";
import {
  budgetedDecision,
  DecisionService,
  Extraction,
  ExtractionService,
  GatewayExtractionService,
  JevDecisionService,
  paidCall,
} from "./services";

export function stableId(key: string) {
  const hash = createHash("sha256").update(key).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export function compilePlan(
  state: State,
  actorId: string,
  text: string,
  plan: Extraction,
  messageId: string,
): Command {
  if (!plan.operations.length || plan.question)
    throw new DomainError(
      "AI_CLARIFY",
      plan.question || "Necesito más datos.",
      422,
    );
  const actions: Exclude<Command["action"], { type: "compound" }>[] = [];
  const refs = new Map(
    state.units.filter((u) => !u.archived).map((u) => [u.code, u.id]),
  );
  const entries = new Map(
    state.entries
      .filter((e) => e.state === "packed")
      .map((e, i) => [`E${i + 1}`, e]),
  );
  const ids = new Set<string>();
  for (const [i, op] of plan.operations.entries()) {
    if (op.room && !rooms.some((r) => r.key === op.room))
      throw new DomainError(
        "AI_INVALID",
        "El ambiente necesita revisión.",
        422,
      );
    const quote = op.sourceText;
    if (
      (op.type === "create" || op.type === "append") &&
      (!quote || !text.includes(quote))
    )
      throw new DomainError(
        "AI_EVIDENCE",
        "La descripción necesita revisión; tu texto original se conserva.",
        422,
      );
    if (
      op.count !== null &&
      !new RegExp(`(?:^|\\D)${op.count}(?:\\D|$)`).test(text)
    )
      throw new DomainError(
        "AI_EVIDENCE",
        "Confirmá la cantidad con un número.",
        422,
      );
    const unitId = op.target ? refs.get(op.target) : undefined;
    const entry = op.entry ? entries.get(op.entry) : undefined;
    if (op.type !== "create" && !unitId)
      throw new DomainError(
        "AI_REFERENCE",
        "Indicá el código de la unidad.",
        422,
      );
    if (unitId && state.units.some((u) => u.id === unitId)) ids.add(unitId);
    if (entry) {
      ids.add(entry.id);
      if (entry.unitId) ids.add(entry.unitId);
    }
    const id = stableId(`${messageId}:${i}`);
    switch (op.type) {
      case "create":
        if (!op.kind || !op.room)
          throw new DomainError(
            "AI_CLARIFY",
            "Indicá el tipo de unidad y a qué ambiente va.",
            422,
          );
        actions.push({
          type: "create_unit",
          payload: {
            id,
            kind: op.kind,
            name: quote!,
            destination: op.room,
            count: op.count ?? 1,
          },
        });
        refs.set(`new:${i + 1}`, id);
        break;
      case "append":
        actions.push({
          type: "append_content",
          payload: {
            unitId: unitId!,
            id,
            description: quote!,
            quantity: op.count,
          },
        });
        break;
      case "close":
        actions.push({ type: "close_unit", payload: { unitId: unitId! } });
        break;
      case "reopen":
        actions.push({ type: "reopen_unit", payload: { unitId: unitId! } });
        break;
      case "load":
        actions.push({
          type: "set_transit_state",
          payload: { unitId: unitId!, state: "in_transit" },
        });
        break;
      case "arrive":
        actions.push({
          type: "set_transit_state",
          payload: {
            unitId: unitId!,
            state: "at_destination",
            actualRoom: op.room,
          },
        });
        break;
      case "destination":
        actions.push({
          type: "update_unit",
          payload: { unitId: unitId!, patch: { destination: op.room } },
        });
        break;
      case "unpack":
        actions.push({
          type: "set_unpack_state",
          payload: { unitId: unitId!, state: "done", room: op.room },
        });
        break;
      case "transfer":
      case "remove":
        if (!entry)
          throw new DomainError(
            "AI_REFERENCE",
            "Indicá la entrada completa que querés mover o retirar.",
            422,
          );
        actions.push(
          op.type === "transfer"
            ? {
                type: "transfer_content",
                payload: { entryId: entry.id, targetUnitId: unitId! },
              }
            : {
                type: "unpack_content",
                payload: { entryId: entry.id, room: op.room },
              },
        );
        break;
      case "split_group":
        if (!op.count)
          throw new DomainError(
            "AI_CLARIFY",
            "Indicá cuántas unidades querés separar.",
            422,
          );
        actions.push({
          type: "split_unit_group",
          payload: {
            unitId: unitId!,
            id,
            count: op.count,
            destination: op.room,
          },
        });
        refs.set(`new:${i + 1}`, id);
        break;
    }
  }
  const c = command(
    actorId,
    actions.length === 1
      ? actions[0]
      : { type: "compound", payload: { actions } },
    versionsFor(state, [...ids]),
  );
  c.operationId = messageId;
  execute(state, c, actorId); // Preview uses the same domain validation, without persistence.
  return c;
}
export async function semanticSearch(
  actor: Actor,
  query: string,
  key: string,
  offset = 0,
  pool: Pool = database(),
  service: DecisionService = new JevDecisionService(),
) {
  const state = await snapshot(actor, pool);
  const exact = search(state, query);
  if (exact.length)
    return {
      hits: exact,
      message: "Coincidencias en el texto registrado.",
      scope: "exact",
      nextOffset: null,
      revision: state.revision,
    };
  if (Buffer.byteLength(query) > 4000)
    throw new DomainError(
      "AI_INPUT",
      "Usá una descripción más corta para buscar. Tu mensaje se conserva.",
      422,
    );
  // Descriptions are reviewed in full, not shortened snippets. Bound byte size and scope.
  const all = [
    ...state.entries.filter((e) => e.state !== "archived"),
    ...state.units
      .filter((u) => !u.archived)
      .map((u) => ({
        id: `unit:${u.id}`,
        version: u.version,
        description: u.name,
        unitId: u.id,
        lastUnitId: u.id,
      })),
  ];
  const relations = (entryId: string) =>
    state.links
      .filter((l) => l.entryId === entryId && l.relation !== "removed")
      .map((l) => ({
        link: l.id,
        version: l.version,
        relation: l.relation,
        unit: state.units.find((u) => u.id === l.unitId && !u.archived),
      }))
      .filter((l) => l.unit);
  const candidates = all.slice(offset, offset + 24);
  const hits: SearchHit[] = [];
  let reviewed = 0;
  const options = {
    match: "Evidencia directa de lo buscado, incluso sinónimos o traducción",
    clue: "Pista posible, sin confirmar el objeto específico",
    unknown: "Sin relación sustentada o datos insuficientes",
  };
  for (let block = 0; block < 3; block++) {
    const batch = candidates.slice(reviewed, reviewed + 8);
    while (
      batch.length > 1 &&
      Buffer.byteLength(
        JSON.stringify({
          query,
          records: batch.map((e, i) => ({
            key: `R${i}`,
            description: e.description,
          })),
        }),
      ) > 20000
    )
      batch.pop();
    if (!batch.length) break;
    const cacheKey = createHash("sha256")
      .update(
        JSON.stringify({
          version: 3,
          model: modelConfig("decision").model,
          query: normalize(query),
          batch: batch.map((e) => [
            e.id,
            e.version,
            relations(e.id),
            state.units.find((u) => u.id === (e.unitId ?? e.lastUnitId))
              ?.version,
          ]),
        }),
      )
      .digest("hex");
    const cached = (
      await pool.query(
        "select result from ai_read_cache where move_id=$1 and participant_id=$2 and cache_key=$3 and expires_at>now()",
        [actor.moveId, actor.participantId, cacheKey],
      )
    ).rows[0];
    const input = JSON.stringify({
      query,
      records: batch.map((e, i) => ({
        key: `R${i}`,
        description: e.description,
        related: relations(e.id).map((r) => ({
          relation: r.relation,
          name: r.unit!.name,
          code: r.unit!.code,
        })),
        unit: state.units.find((u) => u.id === (e.unitId ?? e.lastUnitId))
          ?.code,
      })),
    });
    if (Buffer.byteLength(input) > 24000)
      throw new DomainError(
        "AI_INPUT",
        "Esta descripción requiere una búsqueda manual. El texto está completo en su ficha.",
        422,
      );
    let choices: Record<string, string>;
    if (cached) choices = cached.result.choices;
    else {
      const questions = Object.fromEntries(
        batch.map((e, i) => [
          `R${i}`,
          Object.fromEntries(
            Object.entries(options).map(([key, value]) => [
              key,
              `Para el registro R${i}: ${value}`,
            ]),
          ),
        ]),
      );
      if (service.evaluate) {
        const result = await paidCall(
          actor,
          "decision",
          `${key}:semantic:${block}`,
          input,
          () => service.evaluate!(input, questions),
          pool,
        );
        choices = result.choices;
      } else {
        // Adapter for evaluation fixtures; production uses one batched Jev request.
        choices = {};
        for (const [i, e] of batch.entries())
          choices[`R${i}`] = (
            await budgetedDecision(
              actor,
              JSON.stringify({ query, description: e.description }),
              options,
              service,
              `${key}:semantic:${e.id}`,
              pool,
            )
          ).choice;
      }
      await pool.query(
        "insert into ai_read_cache(move_id,participant_id,cache_key,result,expires_at) values($1,$2,$3,$4,now()+interval '10 minutes') on conflict(move_id,participant_id,cache_key) do update set result=excluded.result,expires_at=excluded.expires_at",
        [actor.moveId, actor.participantId, cacheKey, { choices }],
      );
    }
    reviewed += batch.length;
    for (const [i, e] of batch.entries())
      if (choices[`R${i}`] === "match" || choices[`R${i}`] === "clue") {
        const found = e.id.startsWith("unit:")
          ? search(state, state.units.find((u) => u.id === e.unitId)!.code)[0]
          : search(state, e.description).find((h) => h.entryId === e.id);
        if (found)
          hits.push({
            ...found,
            evidence: `${choices[`R${i}`] === "clue" ? "Pista posible: " : ""}${found.evidence}${relations(
              e.id,
            )
              .map((r) => ` · Relación registrada: ${r.unit!.name}`)
              .join("")}`,
          });
      }
  }
  const current = await snapshot(actor, pool);
  const valid = hits.filter(
    (h) =>
      current.units.some(
        (u) => u.id === h.unit.id && u.version === h.unit.version,
      ) &&
      (!h.entryId ||
        current.entries.some(
          (e) =>
            e.id === h.entryId &&
            e.version ===
              state.entries.find((old) => old.id === h.entryId)?.version,
        )),
  );
  const next = offset + reviewed < all.length ? offset + reviewed : null;
  return {
    hits: valid,
    message:
      hits.length !== valid.length
        ? "Los registros cambiaron mientras buscaba. Repetí la consulta para verificar la ubicación actual."
        : valid.length
          ? "Encontré información relacionada; revisá la evidencia."
          : "No encontré coincidencias en los registros revisados.",
    scope: `${offset + 1}–${offset + reviewed} de ${all.length} registros`,
    nextOffset: next,
    revision: current.revision,
  };
}
export async function assist(
  actor: Actor,
  state: State,
  text: string,
  activeId: string | null,
  literal: boolean,
  messageId: string,
  pool = database(),
  decision: DecisionService = new JevDecisionService(),
  extraction: ExtractionService = new GatewayExtractionService(),
): Promise<ChatReply> {
  const rules = interpret(state, actor.participantId, text, activeId, literal);
  if (
    !aiEnabled() ||
    (literal && !rules.searchQuery && !rules.complex) ||
    (!rules.fallback && !(rules.searchQuery && !rules.hits?.length))
  )
    return rules;
  const intent = rules.searchQuery
    ? { choice: "search" }
    : await budgetedDecision(
        actor,
        JSON.stringify({
          message: text,
          activeCode: state.units.find((u) => u.id === activeId)?.code,
        }),
        {
          search: "Preguntar dónde está algo o buscar contenido o accesorios",
          close: "Cerrar una única caja o bolsa",
          reopen: "Reabrir una única caja o bolsa",
          load: "Registrar carga de una única unidad",
          arrive: "Registrar llegada de una única unidad completa",
          destination: "Cambiar destino de una única unidad",
          unpack: "Marcar desempaque completo de una única caja o bolsa",
          change:
            "Crear, agregar contenido, transferir, retirar, dividir, o varias operaciones",
          unknown: "Conversación o solicitud fuera de alcance",
          ambiguous: "No se puede determinar qué desea hacer",
        },
        decision,
        `${messageId}:intent`,
        pool,
      );
  if (intent.choice === "search") {
    const result = await semanticSearch(
      actor,
      rules.searchQuery ?? text,
      messageId,
      0,
      pool,
      decision,
    );
    return {
      text: `${result.message} Revisé ${result.scope}.`,
      hits: result.hits,
      ...(result.nextOffset !== null
        ? {
            choices: [
              {
                label: "Buscar en los siguientes registros",
                text: `/buscar-mas ${result.nextOffset} ${rules.searchQuery ?? text}`,
              },
            ],
          }
        : {}),
    };
  }
  if (
    ["close", "reopen", "load", "arrive", "destination", "unpack"].includes(
      intent.choice,
    )
  ) {
    const candidates = state.units.filter((u) => !u.archived).slice(0, 60);
    const reference = await budgetedDecision(
      actor,
      JSON.stringify({
        message: text,
        activeCode: state.units.find((u) => u.id === activeId)?.code,
      }),
      {
        ...Object.fromEntries(
          candidates.map((u) => [
            u.code,
            `Unidad ${u.code}: ${u.name}, destino ${u.destination}. Seleccionar solo si el mensaje identifica esta unidad, o se refiere inequívocamente a la unidad activa.`,
          ]),
        ),
        unknown: "No hay una referencia sustentada",
        ambiguous: "Varias unidades son plausibles",
      },
      decision,
      `${messageId}:target`,
      pool,
    );
    const selected = candidates.find((u) => u.code === reference.choice);
    if (!selected)
      return {
        text: "¿A qué unidad te referís?",
        choices: candidates.map((u) => ({
          label: `${u.code} · ${u.name}`,
          text: `${{ close: "Cerrar", reopen: "Reabrir", load: "Cargar", arrive: "Llegó", destination: "Va a", unpack: "Desempacar" }[intent.choice]} ${u.code}`,
        })),
      };
    const template: Record<string, string> = {
      close: "Cerrar",
      reopen: "Reabrir",
      load: "Cargar",
      arrive: "Llegó",
      destination: "",
      unpack: "Desempacar",
    };
    const rewritten =
      intent.choice === "destination"
        ? `${selected.code} va a ${text}`
        : `${template[intent.choice]} ${selected.code} ${text}`;
    return interpret(state, actor.participantId, rewritten, selected.id, false);
  }
  if (intent.choice !== "change")
    return {
      ...rules,
      text: "Indicá qué querés buscar o cambiar y el código de la unidad. Tu mensaje se conserva.",
    };
  const catalog = JSON.stringify({
    message: text,
    active: state.units.find((u) => u.id === activeId)?.code,
    units: state.units
      .filter((u) => !u.archived)
      .slice(0, 60)
      .map((u) => ({ code: u.code, name: u.name })),
    entries: state.entries
      .filter((e) => e.state === "packed")
      .slice(0, 60)
      .map((e, i) => ({
        key: `E${i + 1}`,
        unit: state.units.find((u) => u.id === e.unitId)?.code,
        text: e.description,
      })),
    rooms: rooms.map((r) => ({ key: r.key, name: r.name, aliases: r.aliases })),
  });
  if (Buffer.byteLength(catalog) > 24000)
    return {
      text: "El pedido abarca demasiados datos. Indicá el código y una operación a la vez.",
    };
  const result = await paidCall(
    actor,
    "extraction",
    `${messageId}:extract`,
    catalog,
    () => extraction.extract(catalog),
    pool,
  );
  if (result.plan.question) return { text: result.plan.question };
  try {
    const c = compilePlan(
      state,
      actor.participantId,
      text,
      result.plan,
      messageId,
    );
    const preview = execute(state, c, actor.participantId).receipt;
    const labels: Record<string, string> = {
      create: "Crear",
      append: "Agregar contenido",
      close: "Cerrar",
      reopen: "Reabrir",
      load: "Cargar",
      arrive: "Registrar llegada",
      destination: "Cambiar destino",
      unpack: "Retirar todo el contenido",
      transfer: "Mover entrada",
      remove: "Retirar entrada",
      split_group: "Separar lote",
    };
    const details = result.plan.operations
      .map(
        (op) =>
          `${labels[op.type]}${op.kind ? ` ${kindNames[op.kind]}` : ""}${op.count !== null ? ` · cantidad ${op.count}` : ""}${op.target ? ` · ${op.target}` : ""}${op.sourceText ? ` · “${op.sourceText}”` : ""}${op.entry ? ` · ${state.entries.filter((e) => e.state === "packed")[Number(op.entry.slice(1)) - 1]?.description ?? op.entry}` : ""}${op.room ? ` · ${roomName(op.room)}` : ""}`,
      )
      .join("\n");
    return {
      text: `Propuesta: ${preview.summary}\n${details}\nRevisá los datos antes de confirmar.`,
      choices: [
        {
          label: "Confirmar propuesta",
          action: c.action,
          versions: c.expectedVersions,
        },
      ],
    };
  } catch (e) {
    if (e instanceof DomainError) return { text: e.message };
    throw e;
  }
}
