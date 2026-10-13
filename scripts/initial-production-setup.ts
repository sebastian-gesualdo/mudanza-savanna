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
  try {
    if (process.env.VERCEL_ENV !== "production")
      throw new Error("INITIAL_SETUP_PRODUCTION_CONTEXT_REQUIRED");
    validateProductionTarget(process.env);
    pool = database();
    const schema = await readFile(
      "supabase/migrations/202610130001_initial.sql",
      "utf8",
    );
    const result = await applyInitialSetup(
      pool,
      productionSetup,
      schema,
      loadAuthorizedOrganizer,
    );
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
    console.error(name);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
