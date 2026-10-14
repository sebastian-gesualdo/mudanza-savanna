import "./environment";
import { database } from "../src/server/database";
import { validateProductionTarget } from "../src/server/initial-setup";
import { applyMigrations } from "../src/server/migrations";
// Temporary, reviewed release step. No seed, membership changes or budget reset.
if (process.env.VERCEL_ENV === "production") {
  if (process.env.VERCEL_GIT_COMMIT_REF !== "main")
    throw new Error("RELEASE_MAIN_REQUIRED");
  validateProductionTarget(process.env);
  const pool = database();
  try {
    console.log("RELEASE_MIGRATIONS", await applyMigrations(pool));
  } catch (error) {
    console.error("RELEASE_MIGRATIONS_FAILED", {
      code: (error as { code?: string }).code,
    });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
