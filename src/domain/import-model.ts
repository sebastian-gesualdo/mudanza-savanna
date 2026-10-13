export interface HistoricalCandidate {
  row: number;
  source: string;
  name: string;
  count: number;
  comment: string;
  oldRoom: string;
  action: string;
  warnings: string[];
  container: boolean;
}
export const demoCandidates: HistoricalCandidate[] = [
  {
    row: 1,
    source: "demo-history",
    name: "Escritorio de ejemplo",
    count: 1,
    comment: "Revisar si sigue existiendo.",
    oldRoom: "Oficina anterior · ejemplo",
    action: "OK",
    warnings: [],
    container: false,
  },
  {
    row: 2,
    source: "demo-history",
    name: "Sillas de ejemplo",
    count: 6,
    comment: "",
    oldRoom: "Comedor anterior · ejemplo",
    action: "OK",
    warnings: ["La cantidad actual requiere revisión."],
    container: false,
  },
];
