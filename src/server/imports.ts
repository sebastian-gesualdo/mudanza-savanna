import source from "../../docs/references/legacy-inventory.json";
import comparison from "../../docs/references/legacy-quote-comparison.json";
import type { HistoricalCandidate } from "../domain/import-model";
export const historicalCandidates: HistoricalCandidate[] = source.rows.map(
  (row) => {
    const cells = row.cells as Record<string, string | number>;
    const warnings = comparison.rows
      .filter((r) =>
        (r.cells as Record<string, unknown>).L?.toString().includes(
          `Inventory!C${row.row}:`,
        ),
      )
      .filter((r) => (r.cells as Record<string, unknown>).A !== "OK")
      .map((r) => (r.cells as Record<string, unknown>).G as string);
    return {
      row: row.row,
      source: source.source_sha256,
      name: String(cells.C),
      count: Number(cells.D),
      comment: String(cells.E ?? ""),
      oldRoom: String(cells.A ?? cells.B),
      action: String(cells.F),
      warnings,
      container:
        /Containers \/ Boxes \/ Bins/.test(String(cells.B)) ||
        /Plastic Bin XL/.test(String(cells.C)),
    };
  },
);

import { z } from "zod";
import { canonical, DomainError, rooms } from "../domain/model";
import { stableId } from "../ai/pipeline";
import {
  Actor,
  checkMembership,
  database,
  executeInTransaction,
  lockMove,
  transaction,
} from "./database";
const reviewSchema = z
  .object({
    row: z.number().int().positive(),
    exists: z.boolean(),
    kind: z.enum(["box", "bag", "furniture", "other"]),
    name: z.string().trim().min(1).max(4000),
    count: z.number().int().min(1).max(10000),
    destination: z
      .enum(rooms.map((r) => r.key) as [string, ...string[]])
      .nullable(),
  })
  .strict();
export async function previewImport(actor: Actor, pool = database()) {
  return transaction(pool, async (client) => {
    await lockMove(client, actor.moveId);
    await checkMembership(client, actor);
    let session = (
      await client.query(
        "select * from import_sources where move_id=$1 and participant_id=$2 and source_hash=$3 order by created_at desc limit 1",
        [actor.moveId, actor.participantId, source.source_sha256],
      )
    ).rows[0];
    if (!session) {
      const sourceId = crypto.randomUUID();
      session = (
        await client.query(
          "insert into import_sources(id,move_id,participant_id,source_hash,source_name) values($1,$2,$3,$4,$5) returning *",
          [
            sourceId,
            actor.moveId,
            actor.participantId,
            source.source_sha256,
            "Inventario histórico",
          ],
        )
      ).rows[0];
      await client.query(
        "insert into import_rows(move_id,source_id,row_number,original) select $1,$2,(item->>'row')::int,item from jsonb_array_elements($3::jsonb) item",
        [actor.moveId, sourceId, JSON.stringify(historicalCandidates)],
      );
    }
    const rows = (
      await client.query(
        "select row_number,status,decision,unit_id from import_rows where move_id=$1 and source_id=$2 order by row_number",
        [actor.moveId, session.id],
      )
    ).rows;
    return {
      sessionId: session.id,
      revision: session.revision,
      candidates: historicalCandidates,
      rows,
    };
  });
}
export async function commitImport(
  actor: Actor,
  raw: unknown,
  pool = database(),
) {
  const b = z
    .object({
      sessionId: z.uuid(),
      deviceId: z.uuid(),
      expectedParticipantId: z.uuid(),
      rows: z.array(reviewSchema).min(1).max(20),
    })
    .strict()
    .parse(raw);
  if (b.expectedParticipantId !== actor.participantId)
    throw new DomainError("ACTOR_MISMATCH", "La cuenta cambió.", 409);
  if (new Set(b.rows.map((r) => r.row)).size !== b.rows.length)
    throw new DomainError("IMPORT_ROWS", "Una fila está repetida.", 400);
  return transaction(pool, async (client) => {
    await lockMove(client, actor.moveId);
    await checkMembership(client, actor);
    const session = (
      await client.query(
        "select * from import_sources where id=$1 and move_id=$2 and participant_id=$3",
        [b.sessionId, actor.moveId, actor.participantId],
      )
    ).rows[0];
    if (!session)
      throw new DomainError("NOT_FOUND", "Importación no encontrada.", 404);
    const results = [];
    for (const decision of b.rows) {
      const row = (
        await client.query(
          "select * from import_rows where move_id=$1 and source_id=$2 and row_number=$3",
          [actor.moveId, b.sessionId, decision.row],
        )
      ).rows[0];
      if (!row)
        throw new DomainError(
          "NOT_FOUND",
          "Fila histórica no encontrada.",
          404,
        );
      if (row.status !== "pending") {
        if (canonical(row.decision) !== canonical(decision))
          throw new DomainError(
            "IDEMPOTENCY_CONFLICT",
            "Esta fila ya fue revisada con otros datos.",
            409,
          );
        results.push({
          row: decision.row,
          status: row.status,
          unitId: row.unit_id,
        });
        continue;
      }
      if (!decision.exists) {
        await client.query(
          "update import_rows set status='excluded',decision=$4 where move_id=$1 and source_id=$2 and row_number=$3",
          [actor.moveId, b.sessionId, decision.row, decision],
        );
        results.push({ row: decision.row, status: "excluded" });
        continue;
      }
      const original = row.original as HistoricalCandidate;
      // Unique provenance also prevents duplicate import through a new session/account.
      const prior = (
        await client.query(
          "select id from units where move_id=$1 and data->'provenance'->>'source'=$2 and (data->'provenance'->>'row')::int=$3",
          [actor.moveId, original.source, decision.row],
        )
      ).rows[0];
      let unitId = prior?.id;
      if (!unitId) {
        unitId = stableId(
          `${actor.moveId}:import:${original.source}:${decision.row}`,
        );
        const operationId = stableId(`${unitId}:operation`);
        await executeInTransaction(
          client,
          actor,
          {
            operationId,
            expectedParticipantId: actor.participantId,
            expectedVersions: {},
            action: {
              type: "create_unit",
              payload: {
                id: unitId,
                kind: decision.kind,
                name: decision.name,
                count: decision.count,
                destination: decision.destination,
                provenance: {
                  source: original.source,
                  row: original.row,
                  comment: original.comment,
                },
              },
            },
          },
          b.deviceId,
        );
      }
      await client.query(
        "update import_rows set status='applied',decision=$4,unit_id=$5 where move_id=$1 and source_id=$2 and row_number=$3",
        [actor.moveId, b.sessionId, decision.row, decision, unitId],
      );
      results.push({ row: decision.row, status: "applied", unitId });
    }
    await client.query(
      "update import_sources set revision=revision+1 where id=$1",
      [b.sessionId],
    );
    return { rows: results };
  });
}
