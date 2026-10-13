import { PoolClient } from "pg";
import { backupSchema } from "./backup";
export async function restoreEmpty(client: PoolClient, raw: unknown) {
  const backup = backupSchema.parse(raw);
  await client.query("select pg_advisory_xact_lock(739351001)");
  if ((await client.query("select id from moves limit 1")).rowCount)
    throw new Error(
      "La base ya contiene una mudanza. No se reemplaza inventario existente.",
    );
  await client.query(
    "insert into moves(id,name,timezone,revision,counters,ai_budget) values($1,$2,$3,$4,$5,0)",
    [
      backup.move.id,
      backup.move.name,
      backup.move.timezone,
      backup.revision,
      backup.counters,
    ],
  );
  for (const r of backup.rooms)
    await client.query("insert into rooms(move_id,key,data) values($1,$2,$3)", [
      backup.move.id,
      r.key,
      r,
    ]);
  for (const [collection, table] of Object.entries({
    participants: "participants",
    units: "units",
    entries: "content_entries",
    links: "item_links",
  })) {
    for (const item of backup[collection as "units"])
      await client.query(
        `insert into ${table}(id,move_id,data) values($1,$2,$3)`,
        [item.id, backup.move.id, item],
      );
  }
  for (const event of backup.events)
    await client.query(
      "insert into events(id,move_id,revision,actor_id,data) values($1,$2,$3,$4,$5)",
      [event.id, backup.move.id, event.revision, event.actorId, event],
    );
  for (const [operationId, record] of Object.entries(backup.receipts ?? {}))
    await client.query(
      "insert into command_receipts(operation_id,move_id,actor_id,data) values($1,$2,$3,$4)",
      [operationId, backup.move.id, record.actorId, record],
    );
  for (const r of backup.label_reservations ?? [])
    await client.query(
      "insert into label_reservations(id,move_id,participant_id,device_id,kind,codes,used) values($1,$2,$3,$4,$5,$6,$7)",
      [
        r.id,
        backup.move.id,
        r.participant_id,
        r.device_id,
        r.kind,
        JSON.stringify(r.codes),
        JSON.stringify(r.used),
      ],
    );
  return {
    units: backup.units.length,
    entries: backup.entries.length,
    events: backup.events.length,
  };
}
