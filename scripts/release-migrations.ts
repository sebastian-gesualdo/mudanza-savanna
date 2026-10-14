import "./environment";
import { database } from "../src/server/database";
import { checkReleaseAi } from "../src/server/release-ai-check";
import {
  productionSetup,
  validateProductionTarget,
} from "../src/server/initial-setup";
import { applyMigrations } from "../src/server/migrations";
import { DomainError } from "../src/domain/model";
import { aiDiagnostics } from "../src/ai/diagnostics";
import {
  JevDecisionService,
  GatewayExtractionService,
} from "../src/ai/services";
// Temporary, reviewed release step. No seed, membership changes or budget reset.
if (process.env.VERCEL_ENV === "production") {
  if (process.env.VERCEL_GIT_COMMIT_REF !== "main")
    throw new Error("RELEASE_MAIN_REQUIRED");
  validateProductionTarget(process.env);
  const pool = database();
  let phase = "database_migration";
  try {
    console.log("RELEASE_MIGRATIONS", await applyMigrations(pool));
    phase = "gateway_validation";
    const result = await checkReleaseAi(
      pool,
      productionSetup,
      new JevDecisionService(),
      new GatewayExtractionService(),
      (stage, model) => {
        phase = stage;
        console.log("RELEASE_AI_STAGE", { stage, model });
      },
    );
    if (result.status !== "verified")
      throw new DomainError(
        "RELEASE_AI_DISABLED",
        "Esta publicación requiere verificar ambos modelos activos.",
        503,
      );
    console.log("RELEASE_AI_CHECK", result);
  } catch (error) {
    console.error("RELEASE_SETUP_FAILED", {
      phase,
      ...aiDiagnostics(error),
    });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
