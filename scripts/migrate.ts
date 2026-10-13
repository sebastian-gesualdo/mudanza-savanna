import "./environment";
import { readFile, readdir } from "node:fs/promises";
import { database, seedMove, transaction } from "../src/server/database";
const pool = database();
try {
  await transaction(pool, async (client) => {
    await client.query("select pg_advisory_xact_lock(739351001)");
    await client.query(
      "create table if not exists app_migrations(name text primary key, applied_at timestamptz default now())",
    );
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (
        (
          await client.query("select name from app_migrations where name=$1", [
            file,
          ])
        ).rowCount
      )
        continue;
      await client.query(await readFile("supabase/migrations/" + file, "utf8"));
      await client.query("insert into app_migrations(name) values($1)", [file]);
      console.log("Aplicada:", file);
    }
    const moveId = process.argv.find((a) => a.startsWith("--move="))?.slice(7);
    if (moveId) {
      await seedMove(client, moveId);
      console.log("Mudanza y 17 ambientes preparados.");
    }
  });
} finally {
  await pool.end();
}
