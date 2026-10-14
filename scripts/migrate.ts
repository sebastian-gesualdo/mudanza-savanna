import "./environment";
import { applyMigrations } from "../src/server/migrations";
import { database, seedMove, transaction } from "../src/server/database";
const pool = database();
try {
  for (const file of await applyMigrations(pool))
    console.log("Aplicada:", file);
  const moveId = process.argv.find((a) => a.startsWith("--move="))?.slice(7);
  if (moveId) await transaction(pool, (client) => seedMove(client, moveId));
} finally {
  await pool.end();
}
