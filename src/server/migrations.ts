import { readFile, readdir } from "node:fs/promises";
import type { Pool } from "pg";
import { transaction } from "./database";

export async function applyMigrations(pool: Pool) {
  return transaction(pool, async (client) => {
    await client.query("select pg_advisory_xact_lock(739351001)");
    await client.query(
      "create table if not exists app_migrations(name text primary key,applied_at timestamptz default now())",
    );
    await client.query(
      "alter table app_migrations enable row level security; revoke all on table app_migrations from public",
    );
    for (const role of ["anon", "authenticated"])
      if (
        (await client.query("select 1 from pg_roles where rolname=$1", [role]))
          .rowCount
      )
        await client.query(`revoke all on table app_migrations from ${role}`);
    const applied: string[] = [];
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
      applied.push(file);
    }
    return applied;
  });
}
