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
import { reserveBudget } from "../src/ai/services";
import { exportInventory } from "../src/server/backup";
import { restoreEmpty } from "../src/server/restore";
import {
  applyInitialSetup,
  loadAuthorizedOrganizer,
  validateProductionTarget,
} from "../src/server/initial-setup";

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
  });
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
