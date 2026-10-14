import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { command, versionsFor } from "../src/domain/commands";
import {
  Actor,
  bindMembership,
  executeCommand,
  loadState,
  seedMove,
  snapshot,
  transaction,
} from "../src/server/database";
import { reserveBudget, paidCall } from "../src/ai/services";
import { processMessage, resolveProposal } from "../src/server/chat";
import { semanticSearch } from "../src/ai/pipeline";
import { previewImport, commitImport } from "../src/server/imports";
import { checkReleaseAi } from "../src/server/release-ai-check";
import { applyMigrations } from "../src/server/migrations";
import { exportInventory } from "../src/server/backup";
import { restoreEmpty } from "../src/server/restore";
import {
  applyInitialSetup,
  loadAuthorizedOrganizer,
  validateProductionTarget,
} from "../src/server/initial-setup";

const mockedSession = vi.hoisted(() => ({ actor: null as Actor | null }));
vi.mock("../src/server/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/server/auth")>();
  return {
    ...original,
    authenticate: async () => {
      if (!mockedSession.actor)
        throw new (await import("../src/domain/model")).DomainError(
          "SESSION_REQUIRED",
          "Ingresá con Google.",
          401,
        );
      return mockedSession.actor;
    },
  };
});
const pg = new EmbeddedPostgres({
  databaseDir: `/tmp/gesualdo-test-${process.pid}`,
  user: "postgres",
  password: "local-test-only",
  port: 16432,
  persistent: false,
  initdbFlags: ["--locale=C", "--encoding=UTF8"],
  onLog: () => {},
  onError: () => {},
});
let pool: Pool;
async function closePool(connectionPool: Pool) {
  const count = connectionPool.totalCount;
  const removed = new Promise<void>((resolve) => {
    if (!count) return resolve();
    let remaining = count;
    const onRemove = () => {
      if (--remaining === 0) {
        connectionPool.off("remove", onRemove);
        resolve();
      }
    };
    connectionPool.on("remove", onRemove);
  });
  await connectionPool.end();
  // pg-pool removes clients before their sockets finish closing.
  await removed;
}
const moveId = crypto.randomUUID();
const actorId = crypto.randomUUID();
const userId = crypto.randomUUID();
const actor: Actor = {
  moveId,
  participantId: actorId,
  userId,
  email: "test@example.invalid",
};
const unitId = crypto.randomUUID();
beforeAll(async () => {
  await pg.initialise();
  await pg.start();
  pool = new Pool({
    host: "127.0.0.1",
    port: 16432,
    user: "postgres",
    password: "local-test-only",
    database: "postgres",
    max: 5,
  });
  await pool.query(
    "create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated;",
  );
  await pool.query(
    await readFile("supabase/migrations/202610130001_initial.sql", "utf8"),
  );
  await pool.query(
    await readFile("supabase/migrations/202610140001_complete_v1.sql", "utf8"),
  );
  await transaction(pool, async (client) => {
    await seedMove(client, moveId);
    await client.query("insert into auth.users(id) values($1)", [userId]);
    await client.query(
      "insert into participants(id,move_id,data) values($1,$2,$3)",
      [actorId, moveId, { id: actorId, nickname: "Test", version: 1 }],
    );
    await client.query(
      "insert into move_memberships(id,move_id,participant_id,auth_user_id,email_normalized) values($1,$2,$3,$4,$5)",
      [crypto.randomUUID(), moveId, actorId, userId, actor.email],
    );
  });
  await executeCommand(
    actor,
    command(actorId, {
      type: "create_unit",
      payload: {
        id: unitId,
        kind: "box",
        name: "Test",
        destination: "kitchen",
      },
    }),
    undefined,
    pool,
  );
});
afterAll(async () => {
  if (pool) await closePool(pool);
  await pg.stop();
});
describe("PostgreSQL real: transacciones, aislamiento y permisos", () => {
  it("el acceso inicial usa únicamente el autor del commit inmutable confirmado", async () => {
    const response = {
      sha: "7e11abd8f9e3c849b0a9b85336645f4a6ec0b25f",
      author: { login: "sebastian-gesualdo" },
      commit: { author: { email: "organizer@example.invalid" } },
    };
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      fetch.mockResolvedValueOnce(new Response(JSON.stringify(response)));
      expect(await loadAuthorizedOrganizer()).toEqual({
        email: "organizer@example.invalid",
        nickname: "Sebas",
      });
      fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...response, author: { login: "someone-else" } }),
        ),
      );
      await expect(loadAuthorizedOrganizer()).rejects.toThrow(
        "ORGANIZER_MISMATCH",
      );
      fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ ...response, sha: "another-commit" })),
      );
      await expect(loadAuthorizedOrganizer()).rejects.toThrow(
        "ORGANIZER_MISMATCH",
      );
    } finally {
      fetch.mockRestore();
    }
  });
  it("inicialización autorizada concurrente conserva datos y no reactiva accesos al repetirse", async () => {
    await pool.query("create database initial_setup_test");
    const initial = new Pool({
      host: "127.0.0.1",
      port: 16432,
      user: "postgres",
      password: "local-test-only",
      database: "initial_setup_test",
      max: 2,
    });
    try {
      await initial.query(
        "create schema auth; create table auth.users(id uuid primary key)",
      );
      const plan = {
        projectRef: "test-project",
        moveId: crypto.randomUUID(),
        participantId: crypto.randomUUID(),
        membershipId: crypto.randomUUID(),
      };
      const schema = await readFile(
        "supabase/migrations/202610130001_initial.sql",
        "utf8",
      );
      let resolutions = 0;
      const organizer = async () => {
        resolutions++;
        return { email: "organizer@example.invalid", nickname: "Organizador" };
      };
      const results = await Promise.all([
        applyInitialSetup(initial, plan, schema, organizer),
        applyInitialSetup(initial, plan, schema, organizer),
      ]);
      expect(results.sort()).toEqual(["already_applied", "applied"]);
      expect(resolutions).toBe(1);
      expect(
        Number((await initial.query("select count(*) n from rooms")).rows[0].n),
      ).toBe(17);
      expect(
        Number(
          (await initial.query("select count(*) n from move_memberships"))
            .rows[0].n,
        ),
      ).toBe(1);
      await initial.query(
        "update moves set revision=7,ai_budget=2; update move_memberships set active=false",
      );
      expect(
        await applyInitialSetup(initial, plan, schema, async () => {
          throw new Error("Must not resolve organizer again");
        }),
      ).toBe("already_applied");
      const saved = (
        await initial.query("select revision,ai_budget from moves")
      ).rows[0];
      expect(Number(saved.revision)).toBe(7);
      expect(Number(saved.ai_budget)).toBe(2);
      expect(
        (await initial.query("select active from move_memberships")).rows[0]
          .active,
      ).toBe(false);
      const second = { ...plan, moveId: crypto.randomUUID() };
      await expect(
        applyInitialSetup(initial, second, schema, organizer),
      ).rejects.toThrow("EXISTING_MOVE");
      expect(
        Number((await initial.query("select count(*) n from moves")).rows[0].n),
      ).toBe(1);
      expect(
        Number(
          (await initial.query("select count(*) n from app_migrations")).rows[0]
            .n,
        ),
      ).toBe(2);
    } finally {
      await closePool(initial);
    }
  });
  it("rechaza una conexión de otro proyecto o sin TLS antes de inicializar producción", () => {
    const env = {
      SUPABASE_URL: "https://jncnmxsiylhqeycqhhya.supabase.co",
      DATABASE_URL:
        "postgresql://postgres.jncnmxsiylhqeycqhhya:fixture@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      APP_BASE_URL: "https://mudanza-savanna.vercel.app",
      SUPABASE_PUBLISHABLE_KEY: "fixture-only",
    };
    expect(() => validateProductionTarget(env)).not.toThrow();
    expect(() =>
      validateProductionTarget({
        ...env,
        DATABASE_URL: "invalid-private-value",
      }),
    ).toThrow("INITIAL_SETUP_INVALID_DATABASE_URL");
    expect(() =>
      validateProductionTarget({ ...env, APP_BASE_URL: "" }),
    ).toThrow("INITIAL_SETUP_MISSING_APP_BASE_URL");
    expect(() =>
      validateProductionTarget({
        ...env,
        DATABASE_URL: env.DATABASE_URL.replace(
          "postgres.jncnmxsiylhqeycqhhya",
          "postgres.other-project",
        ),
      }),
    ).toThrow("TARGET_MISMATCH");
    expect(() =>
      validateProductionTarget({ ...env, DATABASE_SSL: "false" }),
    ).toThrow("TARGET_MISMATCH");
    expect(() =>
      validateProductionTarget({
        ...env,
        APP_BASE_URL: "https://another-app.vercel.app",
      }),
    ).toThrow("TARGET_MISMATCH");
  });
  it("seed idempotente y acceso directo de anon/authenticated denegado", async () => {
    await transaction(pool, (client) => seedMove(client, moveId));
    expect(
      Number(
        (
          await pool.query("select count(*) n from rooms where move_id=$1", [
            moveId,
          ])
        ).rows[0].n,
      ),
    ).toBe(17);
    const client = await pool.connect();
    try {
      await client.query("set role anon");
      await expect(client.query("select * from units")).rejects.toThrow(
        "permission denied",
      );
      await client.query("reset role");
      await client.query("set role authenticated");
      await expect(
        client.query("select * from move_memberships"),
      ).rejects.toThrow("permission denied");
    } finally {
      await client.query("reset role");
      client.release();
    }
  });
  it("adiciones concurrentes conservan ambas y reintentar no duplica", async () => {
    const a = command(actorId, {
      type: "append_content",
      payload: { id: crypto.randomUUID(), unitId, description: "A" },
    });
    const b = command(actorId, {
      type: "append_content",
      payload: { id: crypto.randomUUID(), unitId, description: "B" },
    });
    const receipts = await Promise.all([
      executeCommand(actor, a, undefined, pool),
      executeCommand(actor, b, undefined, pool),
    ]);
    const retry = await executeCommand(actor, a, undefined, pool);
    expect(retry).toEqual(receipts[0]);
    const s = await snapshot(actor, pool);
    expect(s.entries).toHaveLength(2);
    expect(s.events.map((e) => e.revision)).toEqual([1, 2, 3]);
  });
  it("compuestos fallidos revierten y conflictos no sobrescriben", async () => {
    const s = await snapshot(actor, pool);
    const before = s.revision;
    const bad = command(
      actorId,
      {
        type: "compound",
        payload: {
          actions: [
            {
              type: "append_content",
              payload: {
                id: crypto.randomUUID(),
                unitId,
                description: "No persistir",
              },
            },
            {
              type: "update_unit",
              payload: { unitId, patch: { destination: null } },
            },
            { type: "close_unit", payload: { unitId } },
          ],
        },
      },
      versionsFor(s, [unitId]),
    );
    await expect(executeCommand(actor, bad, undefined, pool)).rejects.toThrow(
      "ambiente",
    );
    expect((await snapshot(actor, pool)).revision).toBe(before);
    expect((await snapshot(actor, pool)).entries).toHaveLength(2);
    const close = command(
      actorId,
      { type: "close_unit", payload: { unitId } },
      versionsFor(s, [unitId]),
    );
    await executeCommand(actor, close, undefined, pool);
    const stale = command(
      actorId,
      {
        type: "update_unit",
        payload: { unitId, patch: { destination: "office" } },
      },
      versionsFor(s, [unitId]),
    );
    await expect(executeCommand(actor, stale, undefined, pool)).rejects.toThrow(
      "Cambió",
    );
  });
  it("las relaciones a otra mudanza fallan en PostgreSQL", async () => {
    const otherMove = crypto.randomUUID();
    const otherUnit = crypto.randomUUID();
    await transaction(pool, (client) => seedMove(client, otherMove));
    await expect(
      pool.query("insert into units(id,move_id,data) values($1,$2,$3)", [
        otherUnit,
        otherMove,
        {
          id: otherUnit,
          code: "O-001",
          kind: "other",
          destination: null,
          actualRoom: null,
          createdBy: actorId,
          version: 1,
          count: 1,
          transit: "at_origin",
          packing: "not_applicable",
          unpacking: "not_applicable",
        },
      ]),
    ).rejects.toThrow("foreign key");
  });
  it("dos reservas concurrentes no gastan el mismo saldo", async () => {
    process.env.AI_REQUEST_RESERVE_USD = "0.006";
    await pool.query("update moves set ai_budget=0.01 where id=$1", [moveId]);
    const result = await Promise.allSettled([
      reserveBudget(actor, "test", crypto.randomUUID(), pool),
      reserveBudget(actor, "test", crypto.randomUUID(), pool),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      Number(
        (
          await pool.query(
            "select sum(reserved) n from ai_usage where move_id=$1",
            [moveId],
          )
        ).rows[0].n,
      ),
    ).toBe(0.006);
  });
  it("respaldo restaura en otra base vacía y conserva IDs, autores, códigos y recibos", async () => {
    const original = await snapshot(actor, pool);
    const backup = exportInventory(original);
    await pg.createDatabase("gesualdo_restore");
    const restored = new Pool({
      host: "127.0.0.1",
      port: 16432,
      user: "postgres",
      password: "local-test-only",
      database: "gesualdo_restore",
    });
    try {
      await restored.query(
        "create schema auth; create table auth.users(id uuid primary key)",
      );
      await restored.query(
        await readFile("supabase/migrations/202610130001_initial.sql", "utf8"),
      );
      await transaction(restored, (c) => restoreEmpty(c, backup));
      await expect(snapshot(actor, restored)).rejects.toThrow("acceso");
      const read = await transaction(restored, (c) => loadState(c, moveId));
      expect(read.units).toEqual(original.units);
      expect(read.entries).toEqual(original.entries);
      expect(read.events).toEqual(original.events);
      expect(read.receipts).toEqual(original.receipts);
      expect(
        Number(
          (await restored.query("select ai_budget from moves")).rows[0]
            .ai_budget,
        ),
      ).toBe(0);
      await restored.query("insert into auth.users(id) values($1)", [userId]);
      await restored.query(
        "insert into move_memberships(id,move_id,participant_id,auth_user_id,email_normalized) values($1,$2,$3,$4,$5)",
        [crypto.randomUUID(), moveId, actorId, userId, actor.email],
      );
      await executeCommand(
        actor,
        command(
          actorId,
          { type: "reopen_unit", payload: { unitId } },
          versionsFor(read, [unitId]),
        ),
        undefined,
        restored,
      );
      const current = await snapshot(actor, restored);
      await executeCommand(
        actor,
        command(
          actorId,
          { type: "close_unit", payload: { unitId } },
          versionsFor(current, [unitId]),
        ),
        undefined,
        restored,
      );
      expect((await snapshot(actor, restored)).events).toHaveLength(
        original.events.length + 2,
      );
      await expect(
        transaction(restored, (c) => restoreEmpty(c, backup)),
      ).rejects.toThrow("ya contiene");
    } finally {
      await closePool(restored);
    }
  }, 60000);
  it("primeros logins simultáneos vinculan un único participante y revocación bloquea pedidos", async () => {
    await pool.query(
      "update move_memberships set auth_user_id=null where participant_id=$1",
      [actorId],
    );
    const user = {
      id: userId,
      email: actor.email,
      identities: [
        {
          provider: "google",
          identity_data: { email: actor.email, email_verified: true },
        },
      ],
    };
    const [a, b] = await Promise.all([
      bindMembership(user, pool),
      bindMembership(user, pool),
    ]);
    expect(a.participantId).toBe(b.participantId);
    await expect(
      bindMembership(
        {
          ...user,
          email: "uninvited@example.invalid",
          identities: [
            {
              provider: "google",
              identity_data: {
                email: "uninvited@example.invalid",
                email_verified: true,
              },
            },
          ],
        },
        pool,
      ),
    ).rejects.toThrow("acceso");
    await pool.query(
      "update move_memberships set active=false where participant_id=$1",
      [actorId],
    );
    await expect(snapshot(actor, pool)).rejects.toThrow("acceso");
    await expect(
      executeCommand(
        actor,
        command(actorId, {
          type: "create_unit",
          payload: { id: crypto.randomUUID(), kind: "other", name: "Denied" },
        }),
        undefined,
        pool,
      ),
    ).rejects.toThrow("acceso");
    expect(
      Number((await pool.query("select count(*) n from events")).rows[0].n),
    ).toBeGreaterThan(0);
  });
});

async function freshActor(sharedMoveId = crypto.randomUUID()) {
  const a = {
    moveId: sharedMoveId,
    participantId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    email: `${crypto.randomUUID()}@example.invalid`,
  };
  await transaction(pool, async (client) => {
    await seedMove(client, a.moveId);
    await client.query("insert into auth.users(id) values($1)", [a.userId]);
    await client.query(
      "insert into participants(id,move_id,data) values($1,$2,$3)",
      [
        a.participantId,
        a.moveId,
        {
          id: a.participantId,
          nickname: `Test ${a.participantId.slice(0, 8)}`,
          version: 1,
        },
      ],
    );
    await client.query(
      "insert into move_memberships(id,move_id,participant_id,auth_user_id,email_normalized) values($1,$2,$3,$4,$5)",
      [crypto.randomUUID(), a.moveId, a.participantId, a.userId, a.email],
    );
  });
  return a;
}
async function chatFixture() {
  const a = await freshActor();
  const conversationId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const box = crypto.randomUUID();
  await pool.query(
    "insert into conversations(id,move_id,participant_id,device_id) values($1,$2,$3,$4)",
    [conversationId, a.moveId, a.participantId, deviceId],
  );
  await executeCommand(
    a,
    command(a.participantId, {
      type: "create_unit",
      payload: {
        id: box,
        kind: "box",
        name: "Caja AI",
        destination: "kitchen",
      },
    }),
    deviceId,
    pool,
  );
  return {
    a,
    box,
    request: {
      messageId: crypto.randomUUID(),
      conversationId,
      deviceId,
      expectedParticipantId: a.participantId,
      text: "Pedido libre",
      activeUnitId: box,
      literal: false,
    },
  };
}
describe("chat IA y lotes en PostgreSQL real", { timeout: 60000 }, () => {
  it("reintentos concurrentes usan una lease y el proveedor no bloquea escrituras", async () => {
    const { a, box, request } = await chatFixture();
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => (release = resolve));
    const entered = new Promise<void>((resolve) => (started = resolve));
    const assistant = vi.fn(async () => {
      started();
      await waiting;
      return { text: "Respuesta persistida" };
    });
    const first = processMessage(a, request, pool, assistant);
    await entered;
    const second = await processMessage(a, request, pool, assistant);
    expect(second.processing).toBe(true);
    await executeCommand(
      a,
      command(a.participantId, {
        type: "append_content",
        payload: {
          unitId: box,
          id: crypto.randomUUID(),
          description: "Cambio concurrente",
        },
      }),
      undefined,
      pool,
    );
    release();
    expect((await first).text).toBe("Respuesta persistida");
    expect((await processMessage(a, request, pool, assistant)).text).toBe(
      "Respuesta persistida",
    );
    expect(assistant).toHaveBeenCalledTimes(1);
    await expect(
      processMessage(a, { ...request, text: "Otro payload" }, pool, assistant),
    ).rejects.toThrow("otros datos");
  });
  it("confirma una propuesta una vez y rechaza propuestas obsoletas o de otra cuenta", async () => {
    const { a, box, request } = await chatFixture();
    const state = await snapshot(a, pool);
    const proposal = await processMessage(a, request, pool, async () => ({
      text: "Cerrar",
      choices: [
        {
          label: "Confirmar",
          action: {
            type: "close_unit" as const,
            payload: { unitId: box, declaredEmpty: true },
          },
          versions: versionsFor(state, [box]),
        },
      ],
    }));
    expect(proposal.choices?.[0].proposal?.messageId).toBe(request.messageId);
    const resolve = {
      operationId: crypto.randomUUID(),
      choiceIndex: 0,
      expectedParticipantId: a.participantId,
      deviceId: request.deviceId,
    };
    const first = await resolveProposal(a, request.messageId, resolve, pool);
    const retry = await resolveProposal(
      a,
      request.messageId,
      { ...resolve, operationId: crypto.randomUUID() },
      pool,
    );
    expect(retry.receipt).toEqual(first.receipt);
    const outsider = await freshActor();
    await expect(
      resolveProposal(
        outsider,
        request.messageId,
        { ...resolve, expectedParticipantId: outsider.participantId },
        pool,
      ),
    ).rejects.toThrow("no encontrada");
    const next = { ...request, messageId: crypto.randomUUID() };
    await processMessage(a, next, pool, async () => ({
      text: "Reabrir",
      choices: [
        {
          label: "Confirmar",
          action: { type: "reopen_unit" as const, payload: { unitId: box } },
          versions: versionsFor(await snapshot(a, pool), [box]),
        },
      ],
    }));
    await pool.query(
      "update messages set response=jsonb_set(response,'{expiresAt}',to_jsonb('2000-01-01T00:00:00Z'::text)) where id=$1",
      [next.messageId],
    );
    await expect(
      resolveProposal(a, next.messageId, resolve, pool),
    ).rejects.toThrow("venció");
  });
  it("revocar durante la llamada impide finalizar y no toca inventario", async () => {
    const { a, request } = await chatFixture();
    await expect(
      processMessage(a, request, pool, async () => {
        await pool.query(
          "update move_memberships set active=false where move_id=$1",
          [a.moveId],
        );
        return { text: "No se puede publicar" };
      }),
    ).rejects.toThrow("acceso");
    expect(
      (
        await pool.query("select response from messages where id=$1", [
          request.messageId,
        ])
      ).rows[0].response,
    ).toBeNull();
  });
  it("una consulta pagada se reutiliza y un timeout no se redispara", async () => {
    const a = await freshActor();
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("AI_REQUEST_RESERVE_USD", "0.001");
    try {
      const fn = vi.fn(async () => ({
        model: "typesafe-ai/jev",
        inputTokens: 100,
        outputTokens: 0,
        choice: "match",
      }));
      const key = crypto.randomUUID();
      await paidCall(a, "decision", key, "texto", fn, pool);
      await paidCall(a, "decision", key, "texto", fn, pool);
      expect(fn).toHaveBeenCalledTimes(1);
      await expect(
        paidCall(a, "decision", key, "otros datos", fn, pool),
      ).rejects.toThrow("otros datos");
      const broken = vi.fn(async () => {
        throw new Error("timeout");
      });
      const failedKey = crypto.randomUUID();
      await expect(
        paidCall(a, "decision", failedKey, "texto", broken, pool),
      ).rejects.toThrow("timeout");
      await expect(
        paidCall(a, "decision", failedKey, "texto", broken, pool),
      ).rejects.toThrow("pendiente");
      expect(broken).toHaveBeenCalledTimes(1);
      const usage = (
        await pool.query(
          "select cost,reserved,status from ai_usage where request_key=$1",
          [failedKey],
        )
      ).rows[0];
      expect(usage.cost).toBeNull();
      expect(Number(usage.reserved)).toBeGreaterThan(0);
      expect(usage.status).toBe("unreconciled");
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("preview no importa; lotes fallidos revierten enteros y reintentos no duplican", async () => {
    const a = await freshActor();
    const preview = await previewImport(a, pool);
    expect(preview.candidates).toHaveLength(145);
    expect((await snapshot(a, pool)).units).toHaveLength(0);
    const deviceId = crypto.randomUUID();
    const rows = preview.candidates.slice(0, 2).map((c) => ({
      row: c.row,
      exists: true,
      kind: "furniture" as const,
      name: c.name,
      count: 1,
      destination: "kitchen",
    }));
    const payload = {
      sessionId: preview.sessionId,
      deviceId,
      expectedParticipantId: a.participantId,
      rows,
    };
    await expect(
      commitImport(
        a,
        { ...payload, rows: [rows[0], { ...rows[1], row: 99999 }] },
        pool,
      ),
    ).rejects.toThrow("no encontrada");
    expect((await snapshot(a, pool)).units).toHaveLength(0);
    const result = await commitImport(a, payload, pool);
    expect((await commitImport(a, payload, pool)).rows).toEqual(result.rows);
    expect((await snapshot(a, pool)).units).toHaveLength(2);
    const remaining = preview.candidates[2];
    await commitImport(
      a,
      { ...payload, rows: [{ ...rows[0], row: remaining.row, exists: false }] },
      pool,
    );
    expect((await snapshot(a, pool)).units).toHaveLength(2);
    expect((await previewImport(a, pool)).sessionId).toBe(preview.sessionId);
  });
  it("la migración es repetible y conserva inventario y presupuesto", async () => {
    const { a } = await chatFixture();
    const before = await snapshot(a, pool);
    await applyMigrations(pool);
    expect(await applyMigrations(pool)).toEqual([]);
    expect(await snapshot(a, pool)).toEqual(before);
    expect(
      Number(
        (
          await pool.query("select ai_budget from moves where id=$1", [
            a.moveId,
          ])
        ).rows[0].ai_budget,
      ),
    ).toBe(5);
  });
});

it("HTTP autenticado valida origen, actor, recuperación y deltas entre dos participantes", async () => {
  const { a, box, request } = await chatFixture();
  const other = await freshActor(a.moveId);
  const globals = globalThis as unknown as { gesualdoPool?: Pool };
  const previous = globals.gesualdoPool;
  globals.gesualdoPool = pool;
  vi.stubEnv("APP_BASE_URL", "http://local.test");
  vi.stubEnv("AI_ENABLED", "false");
  try {
    const { GET, POST } = await import("../app/api/[...path]/route");
    const req = (
      path: string,
      payload: unknown,
      origin = "http://local.test",
    ) =>
      new Request(`http://local.test/api/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", origin },
        body: JSON.stringify(payload),
      });
    mockedSession.actor = null;
    expect(
      (await GET(new Request("http://local.test/api/bootstrap"))).status,
    ).toBe(401);
    mockedSession.actor = a;
    expect(
      (await POST(req("chat/messages", request, "http://foreign.test"))).status,
    ).toBe(403);
    expect(
      (
        await POST(
          req("chat/messages", {
            ...request,
            expectedParticipantId: other.participantId,
          }),
        )
      ).status,
    ).toBe(409);
    const action = command(a.participantId, {
      type: "append_content",
      payload: {
        id: crypto.randomUUID(),
        unitId: box,
        description: "Respuesta HTTP perdida",
      },
    });
    action.operationId = request.messageId;
    const payload = { ...request, structuredCommand: action };
    const first = await POST(req("chat/messages", payload));
    expect(first.status).toBe(200);
    const receipt = (await first.json()).receipt;
    expect(
      (await (await POST(req("chat/messages", payload))).json()).receipt,
    ).toEqual(receipt);
    const cursor = await GET(
      new Request("http://local.test/api/sync?after=0&limit=1"),
    );
    const page = await cursor.json();
    expect(page.events).toHaveLength(1);
    expect(page.hasMore).toBe(true);
    const rest = await (
      await GET(
        new Request(
          `http://local.test/api/sync?after=${page.nextCursor}&limit=100`,
        ),
      )
    ).json();
    expect(rest.nextCursor).toBe(receipt.revision);
    expect(rest.events[0].operationId).toBe(request.messageId);
    mockedSession.actor = other;
    expect(
      (
        await GET(
          new Request(
            `http://local.test/api/chat/messages/${request.messageId}`,
          ),
        )
      ).status,
    ).toBe(404);
  } finally {
    mockedSession.actor = null;
    globals.gesualdoPool = previous;
    vi.unstubAllEnvs();
  }
}, 60000);

it("búsqueda semántica cacheada respeta versiones y nunca elimina resultados exactos", async () => {
  const { a, box } = await chatFixture();
  const entry = crypto.randomUUID();
  await executeCommand(
    a,
    command(a.participantId, {
      type: "append_content",
      payload: { id: entry, unitId: box, description: "Pava eléctrica" },
    }),
    undefined,
    pool,
  );
  vi.stubEnv("AI_ENABLED", "true");
  try {
    const evaluate = vi.fn(
      async (
        _text: string,
        questions: Record<string, Record<string, string>>,
      ) => ({
        choices: Object.fromEntries(
          Object.keys(questions).map((key) => [
            key,
            key === "R0" ? "match" : "unknown",
          ]),
        ),
        model: "typesafe-ai/jev",
        inputTokens: 100,
        outputTokens: 0,
      }),
    );
    const service = { choose: vi.fn(), evaluate };
    const found = await semanticSearch(
      a,
      "aparato para hervir",
      crypto.randomUUID(),
      0,
      pool,
      service,
    );
    expect(found.hits.some((h) => h.entryId === entry)).toBe(true);
    await semanticSearch(
      a,
      "aparato para hervir",
      crypto.randomUUID(),
      0,
      pool,
      service,
    );
    expect(evaluate).toHaveBeenCalledTimes(1);
    const exact = await semanticSearch(
      a,
      "hervidor",
      crypto.randomUUID(),
      0,
      pool,
      service,
    );
    expect(exact.scope).toBe("exact");
    expect(exact.hits).toHaveLength(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
    const modifying = {
      choose: vi.fn(),
      evaluate: async (
        _text: string,
        questions: Record<string, Record<string, string>>,
      ) => {
        const current = await snapshot(a, pool);
        await executeCommand(
          a,
          command(
            a.participantId,
            {
              type: "edit_content",
              payload: { entryId: entry, description: "Zapatos" },
            },
            versionsFor(current, [entry]),
          ),
          undefined,
          pool,
        );
        return {
          choices: Object.fromEntries(
            Object.keys(questions).map((key) => [
              key,
              key === "R0" ? "match" : "unknown",
            ]),
          ),
          model: "typesafe-ai/jev",
          inputTokens: 100,
          outputTokens: 0,
        };
      },
    };
    const changed = await semanticSearch(
      a,
      "calentar agua",
      crypto.randomUUID(),
      0,
      pool,
      modifying,
    );
    expect(changed.hits).toHaveLength(0);
    expect(changed.message).toContain("cambiaron");
  } finally {
    vi.unstubAllEnvs();
  }
}, 60000);

it("confirmación de IA rechaza cualquier referencia que cambió, incluso una adición", async () => {
  const { a, box, request } = await chatFixture();
  const state = await snapshot(a, pool);
  await processMessage(a, request, pool, async () => ({
    text: "Propuesta",
    choices: [
      {
        label: "Confirmar",
        action: {
          type: "append_content" as const,
          payload: {
            unitId: box,
            id: crypto.randomUUID(),
            description: "Platos",
          },
        },
        versions: versionsFor(state, [box]),
      },
    ],
  }));
  await executeCommand(
    a,
    command(
      a.participantId,
      {
        type: "update_unit",
        payload: { unitId: box, patch: { name: "Otra descripción" } },
      },
      versionsFor(state, [box]),
    ),
    undefined,
    pool,
  );
  await expect(
    resolveProposal(
      a,
      request.messageId,
      {
        operationId: crypto.randomUUID(),
        choiceIndex: 0,
        expectedParticipantId: a.participantId,
        deviceId: request.deviceId,
      },
      pool,
    ),
  ).rejects.toThrow("cambiaron");
  expect((await snapshot(a, pool)).entries).toHaveLength(0);
}, 60000);

it("verificación del release usa dos etapas recuperables, sin cambiar inventario ni accesos", async () => {
  const { a } = await chatFixture();
  const before = await snapshot(a, pool);
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("AI_ENABLED", "false");
  vi.stubEnv("GENERATION_ENABLED", "false");
  const decision = {
    choose: vi.fn(async () => ({
      choice: "match",
      model: "typesafe-ai/jev",
      inputTokens: 50,
      outputTokens: 0,
    })),
  };
  const extraction = {
    extract: vi.fn(async () => ({
      plan: {
        question: null,
        operations: [
          {
            type: "append" as const,
            target: "C-001",
            entry: null,
            sourceText: "platos azules",
            kind: null,
            room: null,
            count: null,
          },
        ],
      },
      model: "deepseek/deepseek-v4-pro-0813",
      inputTokens: 100,
      outputTokens: 100,
    })),
  };
  try {
    const stages = vi.fn();
    expect(
      (await checkReleaseAi(pool, a, decision, extraction, stages)).status,
    ).toBe("verified");
    expect(stages.mock.calls).toEqual([
      ["gateway_decision", "typesafe-ai/jev"],
      ["gateway_extraction", "deepseek/deepseek-v4-pro-0813"],
    ]);
    expect((await checkReleaseAi(pool, a, decision, extraction)).status).toBe(
      "verified",
    );
    expect(decision.choose).toHaveBeenCalledTimes(1);
    expect(extraction.extract).toHaveBeenCalledTimes(1);
    expect(await snapshot(a, pool)).toEqual(before);
    await pool.query(
      "update move_memberships set active=false where move_id=$1",
      [a.moveId],
    );
    await expect(checkReleaseAi(pool, a, decision, extraction)).rejects.toThrow(
      "ingresado",
    );
    expect(decision.choose).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllEnvs();
  }
}, 60000);

it.each(["deepseek/deepseek-v4-pro-0813", "openai/gpt-6.1-sol"])(
  "%s no llama al proveedor si el saldo no cubre su reserva real",
  async (model) => {
    const a = await freshActor();
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("GENERATION_ENABLED", "true");
    vi.stubEnv("GENERATION_MODEL", model);
    vi.stubEnv("GENERATION_INPUT_USD_PER_MILLION", "0.1");
    vi.stubEnv("GENERATION_OUTPUT_USD_PER_MILLION", "0.4");
    const run = vi.fn(async () => ({
      model,
      inputTokens: 50,
      outputTokens: 100,
    }));
    try {
      await pool.query("update moves set ai_budget=0.01 where id=$1", [
        a.moveId,
      ]);
      await expect(
        paidCall(
          a,
          "extraction",
          crypto.randomUUID(),
          "Pedido ficticio",
          run,
          pool,
        ),
      ).rejects.toMatchObject({ code: "AI_BUDGET" });
      expect(run).not.toHaveBeenCalled();
      expect(
        (
          await pool.query("select id from ai_usage where move_id=$1", [
            a.moveId,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  },
);

it("respuesta estructurada conserva el UUID real de la unidad activa", async () => {
  const { a, request } = await chatFixture();
  const id = crypto.randomUUID();
  const c = command(a.participantId, {
    type: "create_unit",
    payload: { id, kind: "box", name: "Nueva caja", destination: "kitchen" },
  });
  c.operationId = request.messageId;
  const response = await processMessage(
    a,
    { ...request, text: "Crear caja para cocina", structuredCommand: c },
    pool,
  );
  expect(response.activeUnitId).toBe(id);
  expect(response.receipt?.changes.some((change) => change.id === id)).toBe(
    true,
  );
});
