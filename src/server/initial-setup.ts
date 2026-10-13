import { Pool } from "pg";
import { z } from "zod";
import { seedMove, transaction } from "./database";

export interface InitialSetup {
  projectRef: string;
  moveId: string;
  participantId: string;
  membershipId: string;
}

// This deployment is explicitly authorized for the organizer's existing project.
export const productionSetup: InitialSetup = {
  projectRef: "jncnmxsiylhqeycqhhya",
  moveId: "18ffcf41-5b03-40d8-86f0-028e9f6fdb1c",
  participantId: "17b57b84-09c3-4fa0-a63d-8611946d3741",
  membershipId: "58b50044-37ff-4a34-bdb6-51931c5174aa",
};
const migration = "202610130001_initial.sql";

export function validateProductionTarget(
  env: Readonly<Record<string, string | undefined>>,
) {
  const parse = (name: string) => {
    if (!env[name]) throw new Error(`INITIAL_SETUP_MISSING_${name}`);
    try {
      return new URL(env[name]);
    } catch {
      throw new Error(`INITIAL_SETUP_INVALID_${name}`);
    }
  };
  const api = parse("SUPABASE_URL");
  const db = parse("DATABASE_URL");
  const app = parse("APP_BASE_URL");
  const ref = productionSetup.projectRef;
  const direct = db.hostname === `db.${ref}.supabase.co`;
  const pooled =
    db.hostname.endsWith(".pooler.supabase.com") &&
    decodeURIComponent(db.username) === `postgres.${ref}`;
  if (api.protocol !== "https:" || api.hostname !== `${ref}.supabase.co`)
    throw new Error("INITIAL_SETUP_TARGET_MISMATCH_SUPABASE_URL");
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    (!direct && !pooled)
  )
    throw new Error("INITIAL_SETUP_TARGET_MISMATCH_DATABASE_URL");
  if (env.DATABASE_SSL === "false")
    throw new Error("INITIAL_SETUP_TARGET_MISMATCH_TLS");
  if (app.origin !== "https://mudanza-savanna.vercel.app")
    throw new Error("INITIAL_SETUP_TARGET_MISMATCH_APP_BASE_URL");
  if (!env.SUPABASE_PUBLISHABLE_KEY)
    throw new Error("INITIAL_SETUP_MISSING_SUPABASE_PUBLISHABLE_KEY");
}

// The organizer confirmed that this immutable commit's author email is their Google account.
// Read the existing Git metadata at runtime; no email allowlist is added to repository files.
export async function loadAuthorizedOrganizer() {
  const sha = "7e11abd8f9e3c849b0a9b85336645f4a6ec0b25f";
  const response = await fetch(
    `https://api.github.com/repos/sebastian-gesualdo/mudanza-savanna/commits/${sha}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "mudanza-savanna-setup",
      },
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    },
  );
  if (!response.ok) throw new Error("INITIAL_SETUP_ORGANIZER_UNAVAILABLE");
  const commit = await response.json();
  if (commit.sha !== sha || commit.author?.login !== "sebastian-gesualdo")
    throw new Error("INITIAL_SETUP_ORGANIZER_MISMATCH");
  return {
    email: z.email().parse(commit.commit?.author?.email),
    nickname: "Sebas",
  };
}

export async function applyInitialSetup(
  pool: Pool,
  plan: InitialSetup,
  schema: string,
  loadOrganizer: () => Promise<{ email: string; nickname: string }>,
) {
  for (const id of [plan.moveId, plan.participantId, plan.membershipId])
    z.uuid().parse(id);
  const marker = `initial-production-setup:${plan.projectRef}:${plan.moveId}`;
  return transaction(pool, async (client) => {
    await client.query("select pg_advisory_xact_lock(739351001)");
    const existing = (
      await client.query(
        "select to_regclass('public.moves') moves,to_regclass('public.app_migrations') migrations",
      )
    ).rows[0];
    if (existing.moves && !existing.migrations)
      throw new Error("INITIAL_SETUP_EXISTING_SCHEMA_REQUIRES_REVIEW");
    if (
      existing.migrations &&
      (
        await client.query("select name from app_migrations where name=$1", [
          marker,
        ])
      ).rowCount
    )
      return "already_applied" as const;
    await client.query(
      "create table if not exists app_migrations(name text primary key,applied_at timestamptz default now())",
    );
    await client.query(
      "alter table app_migrations enable row level security; revoke all on table app_migrations from public,anon,authenticated",
    );
    if (
      (
        await client.query("select name from app_migrations where name=$1", [
          marker,
        ])
      ).rowCount
    )
      return "already_applied" as const;
    const organizer = await loadOrganizer();
    const email = z.email().parse(organizer.email).trim().toLowerCase();
    const nickname = z.string().trim().min(1).max(40).parse(organizer.nickname);
    if (
      !(
        await client.query("select name from app_migrations where name=$1", [
          migration,
        ])
      ).rowCount
    ) {
      await client.query(schema);
      await client.query("insert into app_migrations(name) values($1)", [
        migration,
      ]);
    }
    if (
      (
        await client.query("select id from moves where id<>$1 limit 1", [
          plan.moveId,
        ])
      ).rowCount
    )
      throw new Error("INITIAL_SETUP_EXISTING_MOVE_REQUIRES_REVIEW");
    await seedMove(client, plan.moveId);
    const member = (
      await client.query(
        "select participant_id from move_memberships where move_id=$1 and email_normalized=$2",
        [plan.moveId, email],
      )
    ).rows[0];
    if (!member) {
      await client.query(
        "insert into participants(id,move_id,data) values($1,$2,$3)",
        [
          plan.participantId,
          plan.moveId,
          { id: plan.participantId, nickname, version: 1 },
        ],
      );
      await client.query(
        "insert into move_memberships(id,move_id,participant_id,email_normalized) values($1,$2,$3,$4)",
        [plan.membershipId, plan.moveId, plan.participantId, email],
      );
    }
    await client.query("insert into app_migrations(name) values($1)", [marker]);
    return "applied" as const;
  });
}
