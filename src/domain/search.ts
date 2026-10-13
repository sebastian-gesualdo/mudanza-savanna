import { contents, location, normalize, roomName, State, Unit } from "./model";
export interface SearchHit {
  unit: Unit;
  evidence: string;
  historical: boolean;
  whereabouts: string;
  entryId?: string;
  approximate?: boolean;
}
export function normalizeCode(query: string) {
  const m = query.trim().match(/^([cbmo])[\s-]*0*(\d+)$/i);
  return m ? `${m[1].toUpperCase()}-${m[2].padStart(3, "0")}` : null;
}
const synonyms: Record<string, string[]> = {
  hervidor: ["pava electrica"],
  kettle: ["pava electrica", "hervidor"],
  "power strip": ["zapatilla electrica"],
  taladro: ["drill"],
  drill: ["taladro"],
};
function oneEditApart(a: string, b: string) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1)
    return false;
  let i = 0,
    j = 0,
    differences = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++differences > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return differences + (a.length - i) + (b.length - j) <= 1;
}
export function search(
  state: State,
  query: string,
  approximate = false,
): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  const terms = [q, ...(synonyms[q] ?? [])];
  const code = normalizeCode(query);
  const matches = (value: string) => {
    const normalized = normalize(value);
    return terms.some(
      (t) =>
        normalized.includes(t) ||
        (approximate &&
          t
            .split(" ")
            .every((token) =>
              normalized
                .split(/[^a-z0-9]+/)
                .some((word) => oneEditApart(token, word)),
            )),
    );
  };
  const hits: SearchHit[] = [];
  for (const unit of state.units.filter((u) => !u.archived)) {
    if (
      unit.code === code ||
      matches(
        `${unit.name} ${unit.code} ${roomName(unit.destination)} ${unit.notes}`,
      )
    )
      hits.push({
        unit,
        evidence: unit.name,
        historical: false,
        whereabouts: location(unit),
        approximate,
      });
    for (const e of state.entries.filter(
      (e) =>
        e.state !== "archived" &&
        (e.unitId === unit.id || (!e.unitId && e.lastUnitId === unit.id)),
    )) {
      const linkNames = state.links
        .filter((l) => l.entryId === e.id && l.relation !== "removed")
        .map((l) => state.units.find((u) => u.id === l.unitId)?.name ?? "")
        .join(" ");
      if (matches(e.description) || (linkNames && matches(linkNames)))
        hits.push({
          unit,
          entryId: e.id,
          evidence: e.description,
          historical: e.state !== "packed",
          approximate,
          whereabouts:
            e.state === "packed"
              ? `${unit.code} · ${location(unit)}`
              : e.room
                ? `Retirado · ${roomName(e.room)}`
                : `Estaba en ${unit.code}; se retiró y no se registró dónde quedó`,
        });
    }
  }
  return !hits.length && !approximate && !code
    ? search(state, query, true)
    : hits.slice(0, 50);
}
export function unitSummary(state: State, unit: Unit) {
  const entries = contents(state, unit.id);
  return `${unit.code} · ${unit.name}. Va a ${roomName(unit.destination)}. ${location(unit)}. ${entries.length ? entries.map((e) => e.description).join("; ") : "Sin contenido registrado."}`;
}
