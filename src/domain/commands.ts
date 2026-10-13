import { z } from "zod";
import {
  canonical,
  contents,
  DomainError,
  Entity,
  Entry,
  Event,
  Kind,
  normalize,
  prefixes,
  Receipt,
  rooms,
  State,
  Unit,
} from "./model";

const uuid = z.uuid();
const text = z.string().trim().min(1).max(4000);
const room = z
  .enum(rooms.map((r) => r.key) as [string, ...string[]])
  .nullable();
const version = z.number().int().positive();
const baseUnit = { unitId: uuid };
const unitPatch = z
  .object({
    name: text.optional(),
    destination: room.optional(),
    source: z.string().max(4000).optional(),
    notes: z.string().max(4000).optional(),
    fragile: z.boolean().optional(),
    priority: z.boolean().optional(),
    size: z.string().max(100).optional(),
  })
  .strict();
const create = z
  .object({
    id: uuid,
    kind: z.enum(["box", "bag", "furniture", "other"]),
    name: text,
    destination: room.default(null),
    count: z.number().int().min(1).max(10000).default(1),
    fragile: z.boolean().default(false),
    priority: z.boolean().default(false),
    code: z
      .string()
      .regex(/^[CBMO]-\d{3,}$/)
      .optional(),
    provenance: z
      .object({
        source: z.string().max(100),
        row: z.number().int().positive(),
        comment: z.string().max(4000),
      })
      .strict()
      .optional(),
  })
  .strict();
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_unit"), payload: create }).strict(),
  z
    .object({
      type: z.literal("update_unit"),
      payload: z.object({ ...baseUnit, patch: unitPatch }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("append_content"),
      payload: z
        .object({
          ...baseUnit,
          id: uuid,
          description: text,
          quantity: z.number().positive().max(10000).nullable().default(null),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("edit_content"),
      payload: z
        .object({
          entryId: uuid,
          description: text,
          quantity: z.number().positive().nullable().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("split_content"),
      payload: z
        .object({
          entryId: uuid,
          id: uuid,
          quantity: z.number().positive(),
          description: text,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("transfer_content"),
      payload: z.object({ entryId: uuid, targetUnitId: uuid }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("unpack_content"),
      payload: z.object({ entryId: uuid, room: room.default(null) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("close_unit"),
      payload: z
        .object({ ...baseUnit, declaredEmpty: z.boolean().default(false) })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("reopen_unit"),
      payload: z
        .object({ ...baseUnit, reuse: z.boolean().default(false) })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_transit_state"),
      payload: z
        .object({
          ...baseUnit,
          state: z.enum(["at_origin", "in_transit", "at_destination"]),
          actualRoom: room.default(null),
          correction: z.boolean().default(false),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_unpack_state"),
      payload: z
        .object({
          ...baseUnit,
          state: z.enum(["not_started", "partial", "done"]),
          room: room.default(null),
          correction: z.boolean().default(false),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("split_unit_group"),
      payload: z
        .object({
          ...baseUnit,
          id: uuid,
          count: z.number().int().positive(),
          destination: room,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("link_accessory"),
      payload: z
        .object({
          id: uuid,
          entryId: uuid,
          unitId: uuid,
          relation: z.enum(["accessory", "screws", "part", "other"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("unlink_accessory"),
      payload: z.object({ linkId: uuid }).strict(),
    })
    .strict(),
  ...(["archive_unit", "restore_unit"] as const).map((type) =>
    z
      .object({ type: z.literal(type), payload: z.object(baseUnit).strict() })
      .strict(),
  ),
  ...(["archive_content", "restore_content"] as const).map((type) =>
    z
      .object({
        type: z.literal(type),
        payload: z.object({ entryId: uuid }).strict(),
      })
      .strict(),
  ),
  z
    .object({
      type: z.literal("update_own_profile"),
      payload: z
        .object({ nickname: z.string().trim().min(1).max(40) })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("undo_event"),
      payload: z.object({ eventId: uuid }).strict(),
    })
    .strict(),
]);
export const commandSchema = z
  .object({
    operationId: uuid,
    expectedParticipantId: uuid,
    expectedVersions: z.record(uuid, version).default({}),
    action: z.union([
      actionSchema,
      z
        .object({
          type: z.literal("compound"),
          payload: z
            .object({ actions: z.array(actionSchema).min(1).max(20) })
            .strict(),
        })
        .strict(),
    ]),
  })
  .strict();
export type Action = z.input<typeof actionSchema>;
export type Command = z.input<typeof commandSchema>;
export function command(
  actorId: string,
  action: Command["action"],
  versions: Record<string, number> = {},
): Command {
  return {
    operationId: crypto.randomUUID(),
    expectedParticipantId: actorId,
    expectedVersions: versions,
    action,
  };
}
export function execute(
  input: State,
  raw: Command,
  actorId: string,
  at = new Date().toISOString(),
): { state: State; receipt: Receipt } {
  const c = commandSchema.parse(raw);
  const actor = input.participants.find((p) => p.id === actorId);
  if (!actor)
    throw new DomainError(
      "FORBIDDEN",
      "Esta cuenta no tiene acceso a la mudanza.",
      403,
    );
  if (c.expectedParticipantId !== actorId)
    throw new DomainError(
      "ACTOR_MISMATCH",
      "Ingresá con la cuenta que creó este pendiente.",
      409,
    );
  const fingerprint = canonical(c);
  const prior = input.receipts[c.operationId];
  if (prior) {
    if (prior.fingerprint !== fingerprint || prior.actorId !== actorId)
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        "Esta operación ya se usó con otros datos.",
        409,
      );
    return { state: input, receipt: prior.receipt };
  }
  const state = structuredClone(input);
  const summaries: string[] = [];
  const requireVersion = (entity: Entity) => {
    const original = [
      ...input.units,
      ...input.entries,
      ...input.links,
      ...input.participants,
    ].find((e) => e.id === entity.id);
    // New entities inside an explicit atomic compound have no previous version.
    if (original && c.expectedVersions[entity.id] !== original.version)
      throw new DomainError(
        "VERSION_CONFLICT",
        "Cambió desde que la viste. Revisá la versión actual.",
        409,
      );
  };
  const getUnit = (id: string, archived = false) => {
    const u = state.units.find((u) => u.id === id && (archived || !u.archived));
    if (!u)
      throw new DomainError(
        "NOT_FOUND",
        "No encontré esa unidad en esta mudanza.",
        404,
      );
    return u;
  };
  const getEntry = (id: string) => {
    const e = state.entries.find((e) => e.id === id);
    if (!e)
      throw new DomainError(
        "NOT_FOUND",
        "No encontré esa entrada en esta mudanza.",
        404,
      );
    return e;
  };
  const container = (u: Unit) => {
    if (!["box", "bag"].includes(u.kind))
      throw new DomainError(
        "NOT_CONTAINER",
        "Este objeto no es una caja o bolsa.",
      );
  };
  const editable = (u: Unit, unpack = false) => {
    container(u);
    if (u.unpacking === "done")
      throw new DomainError(
        "REUSE_REQUIRED",
        "Reabrí para reutilizar este contenedor.",
      );
    if (u.packing === "closed" && !(unpack && u.transit === "at_destination"))
      throw new DomainError(
        "CLOSED",
        "Primero reabrí la caja para cambiar su contenido.",
      );
  };
  const unique = (id: string) => {
    if (
      [...state.units, ...state.entries, ...state.links].some(
        (e) => e.id === id,
      )
    )
      throw new DomainError("DUPLICATE_ID", "Este registro ya existe.", 409);
  };
  const nextCode = (kind: Kind) =>
    `${prefixes[kind]}-${String(++state.counters[kind]).padStart(3, "0")}`;
  const apply = (a: z.output<typeof actionSchema>) => {
    switch (a.type) {
      case "create_unit": {
        const p = a.payload;
        unique(p.id);
        if (["box", "bag"].includes(p.kind) && p.count !== 1)
          throw new DomainError("COUNT", "Cada caja o bolsa es una unidad.");
        if (
          p.provenance &&
          state.units.some(
            (u) =>
              u.provenance?.source === p.provenance!.source &&
              u.provenance.row === p.provenance!.row,
          )
        )
          throw new DomainError(
            "IMPORTED",
            "Esta fila histórica ya fue importada.",
            409,
          );
        const code = p.code ?? nextCode(p.kind);
        if (
          !code.startsWith(prefixes[p.kind] + "-") ||
          state.units.some((u) => u.code === code)
        )
          throw new DomainError(
            "CODE_CONFLICT",
            "Ese código ya existe o no corresponde al tipo.",
            409,
          );
        state.counters[p.kind] = Math.max(
          state.counters[p.kind],
          Number(code.slice(2)),
        );
        const isContainer = ["box", "bag"].includes(p.kind);
        state.units.push({
          ...p,
          code,
          actualRoom: null,
          source: "",
          notes: "",
          size: "",
          packing: isContainer ? "open" : "not_applicable",
          transit: "at_origin",
          unpacking: isContainer ? "not_started" : "not_applicable",
          archived: false,
          declaredEmpty: false,
          closedBy: null,
          closedAt: null,
          version: 1,
          createdBy: actorId,
          createdAt: at,
        });
        summaries.push(`${code} · ${p.name} creada`);
        break;
      }
      case "update_unit": {
        const u = getUnit(a.payload.unitId);
        requireVersion(u);
        Object.assign(u, a.payload.patch);
        u.version++;
        summaries.push(`${u.code} actualizada`);
        break;
      }
      case "append_content": {
        const p = a.payload;
        const u = getUnit(p.unitId);
        editable(u);
        unique(p.id);
        const e: Entry = {
          id: p.id,
          unitId: u.id,
          lastUnitId: u.id,
          description: p.description,
          original: p.description,
          quantity: p.quantity,
          state: "packed",
          room: null,
          version: 1,
          createdBy: actorId,
          createdAt: at,
        };
        state.entries.push(e);
        u.version++;
        u.declaredEmpty = false;
        summaries.push(`Agregado a ${u.code}: ${p.description}`);
        break;
      }
      case "close_unit": {
        const u = getUnit(a.payload.unitId);
        requireVersion(u);
        container(u);
        if (u.packing !== "open")
          throw new DomainError("CLOSED", "Ya está cerrada.");
        if (!u.destination)
          throw new DomainError(
            "DESTINATION_REQUIRED",
            "Elegí primero a qué ambiente va.",
          );
        if (!contents(state, u.id).length && !a.payload.declaredEmpty)
          throw new DomainError(
            "CONTENT_REQUIRED",
            "Agregá contenido o confirmá que está vacía.",
          );
        u.declaredEmpty =
          !contents(state, u.id).length && a.payload.declaredEmpty;
        u.packing = "closed";
        u.closedBy = actorId;
        u.closedAt = at;
        u.version++;
        summaries.push(`${u.code} cerrada por ${actor.nickname}`);
        break;
      }
      case "reopen_unit": {
        const u = getUnit(a.payload.unitId);
        requireVersion(u);
        container(u);
        if (u.unpacking === "done" && !a.payload.reuse)
          throw new DomainError(
            "REUSE_REQUIRED",
            "Confirmá que querés reutilizarla.",
          );
        u.packing = "open";
        u.closedBy = null;
        u.closedAt = null;
        u.declaredEmpty = false;
        u.version++;
        if (a.payload.reuse) u.unpacking = "not_started";
        summaries.push(`${u.code} reabierta`);
        break;
      }
      case "set_transit_state": {
        const u = getUnit(a.payload.unitId);
        requireVersion(u);
        const order = ["at_origin", "in_transit", "at_destination"];
        if (
          order.indexOf(a.payload.state) < order.indexOf(u.transit) &&
          !a.payload.correction
        )
          throw new DomainError(
            "CORRECTION_REQUIRED",
            "Confirmá la corrección de ubicación.",
          );
        if (a.payload.state !== "at_origin") {
          if (!u.destination)
            throw new DomainError(
              "DESTINATION_REQUIRED",
              "Elegí primero a qué ambiente va.",
            );
          if (u.packing === "open")
            throw new DomainError(
              "CLOSE_REQUIRED",
              "Primero cerrá la caja o bolsa.",
            );
        }
        u.transit = a.payload.state;
        u.actualRoom =
          u.transit === "at_destination" ? a.payload.actualRoom : null;
        u.version++;
        summaries.push(
          `${u.code} · ${u.transit === "at_destination" ? "llegó a Savanna" : u.transit === "in_transit" ? "cargada" : "ubicación corregida"}`,
        );
        break;
      }
      case "set_unpack_state": {
        const u = getUnit(a.payload.unitId);
        requireVersion(u);
        container(u);
        if (u.transit !== "at_destination")
          throw new DomainError(
            "ARRIVAL_REQUIRED",
            "Registrá primero la llegada a Savanna.",
          );
        if (u.unpacking === "done" && a.payload.state !== "done")
          throw new DomainError(
            "REUSE_REQUIRED",
            "Usá Reabrir para reutilizarla.",
          );
        u.unpacking = a.payload.state;
        u.version++;
        if (u.unpacking === "done")
          for (const e of contents(state, u.id)) {
            e.state = "unpacked";
            e.lastUnitId = u.id;
            e.unitId = null;
            e.room = a.payload.room;
            e.version++;
          }
        summaries.push(
          `${u.code} · ${u.unpacking === "done" ? "desempacada" : "desempaque actualizado"}`,
        );
        break;
      }
      case "edit_content": {
        const e = getEntry(a.payload.entryId);
        requireVersion(e);
        if (e.unitId) {
          const u = getUnit(e.unitId);
          editable(u, true);
          u.version++;
        }
        e.description = a.payload.description;
        if (a.payload.quantity !== undefined) e.quantity = a.payload.quantity;
        e.version++;
        summaries.push("Contenido corregido");
        break;
      }
      case "split_content": {
        const e = getEntry(a.payload.entryId);
        requireVersion(e);
        unique(a.payload.id);
        if (!e.unitId || e.state !== "packed")
          throw new DomainError(
            "NOT_PACKED",
            "La entrada ya no está en una caja.",
          );
        const u = getUnit(e.unitId);
        editable(u, true);
        requireVersion(u);
        if (e.quantity === null || a.payload.quantity >= e.quantity)
          throw new DomainError(
            "QUANTITY_REQUIRED",
            "Para dividir, registrá una cantidad conocida y menor al total.",
          );
        state.entries.push({
          ...e,
          id: a.payload.id,
          description: a.payload.description,
          quantity: a.payload.quantity,
          splitFrom: e.id,
          version: 1,
          createdBy: actorId,
          createdAt: at,
        });
        e.quantity -= a.payload.quantity;
        e.version++;
        u.version++;
        summaries.push("Entrada dividida conservando la cantidad total");
        break;
      }
      case "transfer_content":
      case "unpack_content": {
        const e = getEntry(a.payload.entryId);
        requireVersion(e);
        if (!e.unitId || e.state !== "packed")
          throw new DomainError(
            "NOT_PACKED",
            "La entrada ya no está en una caja.",
          );
        const u = getUnit(e.unitId);
        requireVersion(u);
        editable(u, true);
        if (a.type === "unpack_content" && u.transit !== "at_destination")
          throw new DomainError(
            "ARRIVAL_REQUIRED",
            "Registrá primero la llegada a Savanna.",
          );
        e.lastUnitId = u.id;
        if (a.type === "transfer_content") {
          const target = getUnit(a.payload.targetUnitId);
          requireVersion(target);
          editable(target);
          if (target.id === u.id)
            throw new DomainError("SAME_UNIT", "Elegí otra caja.");
          e.unitId = target.id;
          e.room = null;
          target.declaredEmpty = false;
          target.version++;
          summaries.push(`Contenido transferido a ${target.code}`);
        } else {
          e.unitId = null;
          e.state = "unpacked";
          e.room = a.payload.room;
          summaries.push("Contenido retirado");
        }
        e.version++;
        u.version++;
        if (u.transit === "at_destination")
          u.unpacking = contents(state, u.id).length ? "partial" : "done";
        break;
      }
      case "split_unit_group": {
        const u = getUnit(a.payload.unitId);
        requireVersion(u);
        unique(a.payload.id);
        if (["box", "bag"].includes(u.kind) || a.payload.count >= u.count)
          throw new DomainError(
            "COUNT",
            "Elegí una cantidad menor al lote de muebles u objetos.",
          );
        if (state.links.some((l) => l.unitId === u.id))
          throw new DomainError(
            "LINK_REVIEW",
            "Revisá los accesorios antes de dividir el lote.",
          );
        u.count -= a.payload.count;
        u.version++;
        state.units.push({
          ...u,
          id: a.payload.id,
          code: nextCode(u.kind),
          count: a.payload.count,
          destination: a.payload.destination,
          splitFrom: u.id,
          provenance: undefined,
          version: 1,
          createdBy: actorId,
          createdAt: at,
        });
        summaries.push(`Lote dividido: ${a.payload.count} ${u.name}`);
        break;
      }
      case "archive_unit":
      case "restore_unit": {
        const u = getUnit(a.payload.unitId, true);
        requireVersion(u);
        u.archived = a.type === "archive_unit";
        u.version++;
        summaries.push(`${u.code} ${u.archived ? "archivada" : "restaurada"}`);
        break;
      }
      case "archive_content":
      case "restore_content": {
        const e = getEntry(a.payload.entryId);
        requireVersion(e);
        const u = getUnit(e.unitId ?? e.lastUnitId);
        requireVersion(u);
        editable(u, true);
        e.state = a.type === "archive_content" ? "archived" : "packed";
        e.unitId = e.state === "packed" ? u.id : null;
        e.version++;
        u.version++;
        summaries.push(
          e.state === "packed" ? "Entrada restaurada" : "Entrada archivada",
        );
        break;
      }
      case "link_accessory": {
        unique(a.payload.id);
        const e = getEntry(a.payload.entryId);
        requireVersion(e);
        const u = getUnit(a.payload.unitId);
        requireVersion(u);
        if (["box", "bag"].includes(u.kind))
          throw new DomainError(
            "LINK_TARGET",
            "Relacioná el accesorio con un mueble u objeto.",
          );
        if (state.links.some((l) => l.entryId === e.id && l.unitId === u.id))
          throw new DomainError("DUPLICATE_LINK", "La relación ya existe.");
        state.links.push({ ...a.payload, version: 1 });
        summaries.push("Accesorio relacionado");
        break;
      }
      case "unlink_accessory": {
        const l = state.links.find((l) => l.id === a.payload.linkId);
        if (!l)
          throw new DomainError("NOT_FOUND", "No encontré esa relación.", 404);
        requireVersion(l);
        l.relation = "removed";
        l.version++;
        summaries.push("Relación retirada");
        break;
      }
      case "update_own_profile": {
        const p = state.participants.find((p) => p.id === actorId)!;
        requireVersion(p);
        if (
          state.participants.some(
            (o) =>
              o.id !== actorId &&
              normalize(o.nickname) === normalize(a.payload.nickname),
          )
        )
          throw new DomainError("NICKNAME", "Ese apodo ya está en uso.");
        p.nickname = a.payload.nickname;
        p.version++;
        summaries.push(`Tu apodo ahora es ${p.nickname}`);
        break;
      }
      case "undo_event": {
        const event = state.events.find((e) => e.id === a.payload.eventId);
        if (!event || event.type === "undo_event")
          throw new DomainError(
            "UNDO_UNAVAILABLE",
            "No se puede deshacer ese cambio.",
          );
        for (const change of event.changes) {
          const list = state[change.collection] as Entity[];
          const current = list.find((e) => e.id === change.id);
          if (!current || canonical(current) !== canonical(change.after))
            throw new DomainError(
              "UNDO_CONFLICT",
              "Hubo cambios posteriores. Corregí el estado actual.",
              409,
            );
          requireVersion(current);
        }
        for (const change of event.changes) {
          const list = state[change.collection] as Entity[];
          const index = list.findIndex((e) => e.id === change.id);
          if (change.before)
            list[index] = {
              ...structuredClone(change.before),
              version: list[index].version + 1,
            };
          else if (change.collection === "units")
            list[index] = {
              ...list[index],
              archived: true,
              version: list[index].version + 1,
            } as Unit;
          else if (change.collection === "entries")
            list[index] = {
              ...list[index],
              state: "archived",
              unitId: null,
              version: list[index].version + 1,
            } as Entry;
          else
            throw new DomainError(
              "UNDO_UNAVAILABLE",
              "Esta relación se corrige desde la ficha.",
            );
        }
        summaries.push("Cambio deshecho; el historial se conserva");
        break;
      }
    }
  };
  const actions =
    c.action.type === "compound" ? c.action.payload.actions : [c.action];
  for (const a of actions) apply(a);
  // Validate final state too: a compensating command must not violate another entity's state.
  for (const u of state.units) {
    if (u.packing === "closed" && !u.destination)
      throw new DomainError(
        "DESTINATION_REQUIRED",
        "Una caja cerrada necesita destino.",
      );
    if (
      u.packing === "closed" &&
      u.unpacking === "not_started" &&
      !u.declaredEmpty &&
      !contents(state, u.id).length
    )
      throw new DomainError(
        "CONTENT_REQUIRED",
        "El cambio dejaría una caja cerrada sin contenido.",
      );
  }
  const changes: Event["changes"] = [];
  for (const collection of [
    "units",
    "entries",
    "links",
    "participants",
  ] as const) {
    for (const after of state[collection]) {
      const before = input[collection].find((e) => e.id === after.id) ?? null;
      if (canonical(before) !== canonical(after))
        changes.push({
          collection,
          id: after.id,
          before,
          after: structuredClone(after),
        });
    }
  }
  const event: Event = {
    id: crypto.randomUUID(),
    operationId: c.operationId,
    revision: ++state.revision,
    at,
    actorId,
    actorName: actor.nickname,
    type: c.action.type,
    changes,
    ...(c.action.type === "undo_event"
      ? { compensates: c.action.payload.eventId }
      : {}),
  };
  const receipt: Receipt = {
    operationId: c.operationId,
    eventId: event.id,
    revision: state.revision,
    at,
    actorName: actor.nickname,
    summary: summaries.join(" · "),
    changes,
  };
  state.events.push(event);
  state.receipts[c.operationId] = { fingerprint, actorId, receipt };
  return { state, receipt };
}

export function versionsFor(
  state: State,
  ids: string[],
): Record<string, number> {
  return Object.fromEntries(
    [...state.units, ...state.entries, ...state.links, ...state.participants]
      .filter((e) => ids.includes(e.id))
      .map((e) => [e.id, e.version]),
  );
}
