import { Pool, PoolClient } from "pg";
import { Command, execute } from "../domain/commands";
import { DomainError, emptyState, Entity, rooms, State } from "../domain/model";

const globalPg = globalThis as unknown as { gesualdoPool?: Pool };
export function database() {
  if (!process.env.DATABASE_URL)
    throw new DomainError(
      "SETUP_REQUIRED",
      "Falta configurar la conexión de la mudanza.",
      503,
    );
  if (!globalPg.gesualdoPool) {
    globalPg.gesualdoPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      ssl:
        process.env.DATABASE_SSL === "false"
          ? false
          : { rejectUnauthorized: true },
      connectionTimeoutMillis: 10000,
    });
    globalPg.gesualdoPool.on("error", (error) =>
      console.error("database_idle_error", { name: error.name }),
    );
  }
  return globalPg.gesualdoPool;
}
export interface Actor {
  userId: string;
  participantId: string;
  moveId: string;
  email: string;
}
export async function transaction<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
export async function lockMove(client: PoolClient, moveId: string) {
  if (
    !(
      await client.query("select id from moves where id=$1 for update", [
        moveId,
      ])
    ).rowCount
  )
    throw new DomainError("NOT_FOUND", "Mudanza no encontrada.", 404);
}
export async function checkMembership(client: PoolClient, actor: Actor) {
  const result = await client.query(
    "select id from move_memberships where move_id=$1 and participant_id=$2 and auth_user_id=$3 and active=true",
    [actor.moveId, actor.participantId, actor.userId],
  );
  if (!result.rowCount)
    throw new DomainError(
      "FORBIDDEN",
      "Esta cuenta no tiene acceso a la mudanza.",
      403,
    );
}
export async function loadState(
  client: PoolClient,
  moveId: string,
): Promise<State> {
  const move = (await client.query("select * from moves where id=$1", [moveId]))
    .rows[0];
  if (!move) throw new DomainError("NOT_FOUND", "Mudanza no encontrada.", 404);
  const state = emptyState(moveId, []);
  state.revision = Number(move.revision);
  state.counters = move.counters;
  for (const [collection, table] of Object.entries({
    units: "units",
    entries: "content_entries",
    links: "item_links",
    participants: "participants",
    events: "events",
  })) {
    const result = await client.query(
      `select data from ${table} where move_id=$1${table === "events" ? " order by revision" : " order by id"}`,
      [moveId],
    );
    (state[collection as "units"] as Entity[]) = result.rows.map((r) => r.data);
  }
  const receipts = await client.query(
    "select operation_id,data from command_receipts where move_id=$1",
    [moveId],
  );
  state.receipts = Object.fromEntries(
    receipts.rows.map((r) => [r.operation_id, r.data]),
  );
  return state;
}
export async function snapshot(actor: Actor, pool = database()) {
  return transaction(pool, async (client) => {
    await client.query("select id from moves where id=$1 for share", [
      actor.moveId,
    ]);
    await checkMembership(client, actor);
    return loadState(client, actor.moveId);
  });
}
export async function exportSnapshot(actor: Actor, pool = database()) {
  return transaction(pool, async (client) => {
    await client.query("select id from moves where id=$1 for share", [
      actor.moveId,
    ]);
    await checkMembership(client, actor);
    const state = await loadState(client, actor.moveId);
    const reservations = (
      await client.query(
        "select id,participant_id,device_id,kind,codes,used from label_reservations where move_id=$1",
        [actor.moveId],
      )
    ).rows;
    return { state, reservations };
  });
}
export async function persistChanges(
  client: PoolClient,
  state: State,
  operationId: string,
) {
  const record = state.receipts[operationId];
  const tables = {
    units: "units",
    entries: "content_entries",
    links: "item_links",
    participants: "participants",
  };
  // Only touched rows are written, in foreign-key order. No whole-inventory replacement.
  for (const collection of [
    "participants",
    "units",
    "entries",
    "links",
  ] as const) {
    for (const change of record.receipt.changes.filter(
      (c) => c.collection === collection,
    )) {
      if (change.before) {
        const result = await client.query(
          `update ${tables[collection]} set data=$3 where id=$1 and move_id=$2`,
          [change.id, state.moveId, change.after],
        );
        if (result.rowCount !== 1)
          throw new DomainError(
            "NOT_FOUND",
            "El registro no pertenece a esta mudanza.",
            404,
          );
      } else {
        await client.query(
          `insert into ${tables[collection]}(id,move_id,data) values($1,$2,$3)`,
          [change.id, state.moveId, change.after],
        );
      }
    }
  }
  const event = state.events.find((e) => e.id === record.receipt.eventId)!;
  await client.query("update moves set revision=$2,counters=$3 where id=$1", [
    state.moveId,
    state.revision,
    state.counters,
  ]);
  await client.query(
    "insert into events(id,move_id,revision,actor_id,data) values($1,$2,$3,$4,$5)",
    [event.id, state.moveId, event.revision, event.actorId, event],
  );
  await client.query(
    "insert into command_receipts(operation_id,move_id,actor_id,data) values($1,$2,$3,$4)",
    [operationId, state.moveId, event.actorId, record],
  );
}
export async function executeInTransaction(
  client: PoolClient,
  actor: Actor,
  raw: Command,
  deviceId?: string,
) {
  await checkMembership(client, actor);
  const state = await loadState(client, actor.moveId);
  // The domain validates the actor even when recovering a committed receipt.
  const parsed = execute(state, raw, actor.participantId);
  if (state.receipts[raw.operationId]) return parsed.receipt;
  const actions =
    raw.action.type === "compound" ? raw.action.payload.actions : [raw.action];
  for (const a of actions)
    if (a.type === "create_unit" && a.payload.code) {
      if (!deviceId)
        throw new DomainError(
          "RESERVATION",
          "Falta identificar el dispositivo de la etiqueta.",
        );
      const reservation = (
        await client.query(
          "select * from label_reservations where move_id=$1 and participant_id=$2 and device_id=$3 and codes ? $4 for update",
          [actor.moveId, actor.participantId, deviceId, a.payload.code],
        )
      ).rows[0];
      if (!reservation || reservation.used.includes(a.payload.code))
        throw new DomainError(
          "RESERVATION",
          "El código no está reservado para este dispositivo.",
          409,
        );
      await client.query(
        "update label_reservations set used=used || $2::jsonb where id=$1",
        [reservation.id, JSON.stringify([a.payload.code])],
      );
    }
  await persistChanges(client, parsed.state, raw.operationId);
  return parsed.receipt;
}
export async function executeCommand(
  actor: Actor,
  raw: Command,
  deviceId?: string,
  pool = database(),
) {
  return transaction(pool, async (client) => {
    await lockMove(client, actor.moveId);
    return executeInTransaction(client, actor, raw, deviceId);
  });
}
export async function seedMove(client: PoolClient, moveId: string) {
  const budget = Number(process.env.AI_BUDGET_USD ?? 5);
  if (!Number.isFinite(budget) || budget < 0)
    throw new DomainError(
      "BUDGET_CONFIGURATION",
      "Revisá el presupuesto configurado.",
      503,
    );
  await client.query(
    "insert into moves(id,name,ai_budget) values($1,$2,$3) on conflict do nothing",
    [moveId, "Casa de los Gesualdo", budget],
  );
  for (const room of rooms)
    await client.query(
      "insert into rooms(move_id,key,data) values($1,$2,$3) on conflict do nothing",
      [moveId, room.key, room],
    );
}
export async function bindMembership(
  user: {
    id: string;
    email?: string;
    identities?: {
      provider: string;
      identity_data?: Record<string, unknown>;
    }[];
  },
  pool = database(),
): Promise<Actor> {
  const google = user.identities?.find((i) => i.provider === "google");
  if (
    !user.email ||
    !google ||
    google.identity_data?.email_verified !== true ||
    String(google.identity_data.email).trim().toLowerCase() !==
      user.email.trim().toLowerCase()
  )
    throw new DomainError(
      "GOOGLE_REQUIRED",
      "Ingresá con una cuenta Google verificada.",
      403,
    );
  const email = user.email.trim().toLowerCase();
  return transaction(pool, async (client) => {
    const membership = (
      await client.query(
        "select * from move_memberships where email_normalized=$1 and active=true",
        [email],
      )
    ).rows;
    if (membership.length !== 1)
      throw new DomainError(
        "FORBIDDEN",
        "Esta cuenta no tiene acceso a la mudanza.",
        403,
      );
    const m = membership[0];
    await lockMove(client, m.move_id);
    const current = (
      await client.query(
        "select * from move_memberships where id=$1 for update",
        [m.id],
      )
    ).rows[0];
    if (
      !current.active ||
      (current.auth_user_id && current.auth_user_id !== user.id) ||
      (!current.auth_user_id && current.linked_at)
    )
      throw new DomainError(
        "FORBIDDEN",
        "Esta cuenta no tiene acceso a la mudanza.",
        403,
      );
    if (!current.auth_user_id)
      await client.query(
        "update move_memberships set auth_user_id=$2,linked_at=now() where id=$1",
        [m.id, user.id],
      );
    return {
      userId: user.id,
      participantId: m.participant_id,
      moveId: m.move_id,
      email,
    };
  });
}
