import roomSource from "./rooms.json" with { type: "json" };
export const rooms = roomSource.rooms;
export type Kind = "box" | "bag" | "furniture" | "other";
export type Transit = "at_origin" | "in_transit" | "at_destination";
export interface Participant {
  id: string;
  nickname: string;
  version: number;
}
export interface Unit {
  id: string;
  code: string;
  kind: Kind;
  name: string;
  count: number;
  destination: string | null;
  actualRoom: string | null;
  source: string;
  packing: "open" | "closed" | "not_applicable";
  transit: Transit;
  unpacking: "not_started" | "partial" | "done" | "not_applicable";
  fragile: boolean;
  priority: boolean;
  notes: string;
  size: string;
  archived: boolean;
  declaredEmpty: boolean;
  closedBy: string | null;
  closedAt: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  splitFrom?: string;
  provenance?: { source: string; row: number; comment: string };
}
export interface Entry {
  id: string;
  unitId: string | null;
  lastUnitId: string;
  description: string;
  original: string;
  quantity: number | null;
  state: "packed" | "unpacked" | "archived";
  room: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  splitFrom?: string;
}
export interface Link {
  id: string;
  entryId: string;
  unitId: string;
  relation: string;
  version: number;
}
export type Entity = Unit | Entry | Link | Participant;
export interface Change {
  collection: "units" | "entries" | "links" | "participants";
  id: string;
  before: Entity | null;
  after: Entity;
}
export interface Event {
  id: string;
  operationId: string;
  revision: number;
  actorId: string;
  actorName: string;
  at: string;
  type: string;
  changes: Change[];
  compensates?: string;
}
export interface Receipt {
  operationId: string;
  eventId: string;
  revision: number;
  at: string;
  actorName: string;
  summary: string;
  changes: Change[];
}
export interface State {
  schemaVersion: 1;
  moveId: string;
  revision: number;
  units: Unit[];
  entries: Entry[];
  links: Link[];
  participants: Participant[];
  events: Event[];
  counters: Record<Kind, number>;
  receipts: Record<
    string,
    { fingerprint: string; actorId: string; receipt: Receipt }
  >;
}
export const prefixes: Record<Kind, string> = {
  box: "C",
  bag: "B",
  furniture: "M",
  other: "O",
};
export const kindNames: Record<Kind, string> = {
  box: "Caja",
  bag: "Bolsa",
  furniture: "Mueble",
  other: "Objeto",
};
export const transitNames: Record<Transit, string> = {
  at_origin: "En Weston Hills",
  in_transit: "En camino",
  at_destination: "En Savanna",
};
export const roomName = (key: string | null) =>
  rooms.find((r) => r.key === key)?.name ?? "Sin asignar";
export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
export function emptyState(moveId: string, participants: Participant[]): State {
  return {
    schemaVersion: 1,
    moveId,
    revision: 0,
    units: [],
    entries: [],
    links: [],
    participants,
    events: [],
    counters: { box: 0, bag: 0, furniture: 0, other: 0 },
    receipts: {},
  };
}
export function contents(state: State, unitId: string) {
  return state.entries.filter(
    (e) => e.unitId === unitId && e.state === "packed",
  );
}
export function location(unit: Unit) {
  return unit.transit === "at_destination"
    ? `Savanna · ${unit.actualRoom ? roomName(unit.actualRoom) : "habitación sin confirmar"}`
    : transitNames[unit.transit];
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
