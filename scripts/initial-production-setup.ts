import "./environment";
import { readFile, writeFile } from "node:fs/promises";
import { database } from "../src/server/database";
import {
  applyInitialSetup,
  loadAuthorizedOrganizer,
  productionSetup,
  validateProductionTarget,
} from "../src/server/initial-setup";

// Temporary release hook: local builds, CI and previews never initialize production.
if (process.env.VERCEL && process.env.VERCEL_GIT_COMMIT_REF === "main") {
  let pool;
  let phase = "target_validation";
  try {
    if (process.env.VERCEL_ENV !== "production")
      throw new Error("INITIAL_SETUP_PRODUCTION_CONTEXT_REQUIRED");
    validateProductionTarget(process.env);
    pool = database();
    const schema = await readFile(
      "supabase/migrations/202610130001_initial.sql",
      "utf8",
    );
    phase = "database_initialization";
    const result = await applyInitialSetup(
      pool,
      productionSetup,
      schema,
      loadAuthorizedOrganizer,
    );
    phase = "receipt_publication";
    await writeFile(
      "public/initial-setup-status.json",
      JSON.stringify({
        status: result,
        commit: process.env.VERCEL_GIT_COMMIT_SHA,
      }) + "\n",
    );
    console.log("initial_production_setup", { result });
  } catch (error) {
    // Never log connection strings, SQL details, emails or provider response bodies.
    const name =
      error instanceof Error && error.message.startsWith("INITIAL_SETUP_")
        ? error.message
        : "INITIAL_SETUP_FAILED";
    const rawCode =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    const code =
      typeof rawCode === "string" && /^[A-Z0-9_]+$/.test(rawCode)
        ? rawCode
        : undefined;
    console.error(name, { phase, code });
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
