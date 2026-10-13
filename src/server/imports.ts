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
