import "./environment";
import { readFile } from "node:fs/promises";
import { restoreEmpty } from "../src/server/restore";
import { database, transaction } from "../src/server/database";
const file = process.argv[2];
if (!file || process.argv[3] !== "--empty-test-database")
  throw new Error(
    "Uso: npm run backup:restore -- respaldo.json --empty-test-database (solo base de prueba vacía).",
  );
if (process.env.APP_ENV === "production")
  throw new Error(
    "La restauración automática está limitada a una base de prueba vacía.",
  );
const backup = JSON.parse(await readFile(file, "utf8"));
const pool = database();
try {
  await transaction(pool, async (client) => {
    const counts = await restoreEmpty(client, backup);
    console.log(
      `Restauradas ${counts.units} unidades, ${counts.entries} entradas y ${counts.events} eventos. No se restauran accesos. IA bloqueada con presupuesto 0 hasta reconciliar consumo.`,
    );
  });
} finally {
  await pool.end();
}
