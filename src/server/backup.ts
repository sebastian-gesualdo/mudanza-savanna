import { z } from "zod";
import { State, rooms } from "../domain/model";
export function exportInventory(state: State) {
  return {
    schema_version: 1 as const,
    exported_at: new Date().toISOString(),
    move: {
      id: state.moveId,
      name: "Casa de los Gesualdo",
      timezone: "America/New_York",
    },
    revision: state.revision,
    rooms,
    participants: state.participants,
    units: state.units,
    entries: state.entries,
    links: state.links,
    events: state.events,
    counters: state.counters,
    receipts: state.receipts,
  };
}
export const backupSchema = z
  .object({
    schema_version: z.literal(1),
    exported_at: z.iso.datetime(),
    move: z.object({ id: z.uuid(), name: z.string(), timezone: z.string() }),
    revision: z.number().int().nonnegative(),
    rooms: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        aliases: z.array(z.string()),
      }),
    ),
    participants: z.array(
      z.object({
        id: z.uuid(),
        nickname: z.string(),
        version: z.number().int().positive(),
      }),
    ),
    units: z.array(
      z
        .object({ id: z.uuid(), code: z.string(), createdBy: z.uuid() })
        .passthrough(),
    ),
    entries: z.array(
      z
        .object({
          id: z.uuid(),
          unitId: z.uuid().nullable(),
          lastUnitId: z.uuid(),
        })
        .passthrough(),
    ),
    links: z.array(
      z
        .object({ id: z.uuid(), entryId: z.uuid(), unitId: z.uuid() })
        .passthrough(),
    ),
    events: z.array(
      z
        .object({
          id: z.uuid(),
          revision: z.number().int().positive(),
          actorId: z.uuid(),
        })
        .passthrough(),
    ),
    counters: z.object({
      box: z.number().int().nonnegative(),
      bag: z.number().int().nonnegative(),
      furniture: z.number().int().nonnegative(),
      other: z.number().int().nonnegative(),
    }),
    label_reservations: z
      .array(
        z.object({
          id: z.uuid(),
          participant_id: z.uuid(),
          device_id: z.uuid(),
          kind: z.string(),
          codes: z.array(z.string()),
          used: z.array(z.string()),
        }),
      )
      .optional(),
    receipts: z
      .record(
        z.uuid(),
        z.object({
          fingerprint: z.string(),
          actorId: z.uuid(),
          receipt: z
            .object({
              operationId: z.uuid(),
              eventId: z.uuid(),
              revision: z.number().int().positive(),
            })
            .passthrough(),
        }),
      )
      .optional(),
  })
  .strict();
const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};
export function unitsCsv(state: State) {
  return (
    "\ufeff" +
    [
      [
        "Código",
        "Nombre",
        "Tipo",
        "Cantidad",
        "Destino",
        "Ubicación real",
        "Traslado",
        "Archivada",
      ],
      ...state.units.map((u) => [
        u.code,
        u.name,
        u.kind,
        u.count,
        u.destination,
        u.actualRoom,
        u.transit,
        u.archived,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
