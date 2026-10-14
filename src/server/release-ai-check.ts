import type { Pool } from "pg";
import { DomainError, rooms } from "../domain/model";
import { aiEnabled, generationEnabled, modelConfig } from "../ai/config";
import {
  budgetedDecision,
  DecisionService,
  ExtractionService,
  GatewayExtractionService,
  JevDecisionService,
  paidCall,
} from "../ai/services";
import { Actor, checkMembership, transaction } from "./database";

// Deployment-only verification, not an endpoint or an inventory command.
// Only the organizer who already logged in is eligible; no new membership is created.
export async function checkReleaseAi(
  pool: Pool,
  scope: { moveId: string; participantId: string },
  decision: DecisionService = new JevDecisionService(),
  extraction: ExtractionService = new GatewayExtractionService(),
  onStage: (
    stage: "gateway_decision" | "gateway_extraction",
    model: string,
  ) => void = () => {},
) {
  if (!aiEnabled()) return { status: "disabled" };
  const actor = await transaction(pool, async (client) => {
    const member = (
      await client.query(
        "select auth_user_id,email_normalized from move_memberships where move_id=$1 and participant_id=$2 and active=true for share",
        [scope.moveId, scope.participantId],
      )
    ).rows[0];
    if (!member?.auth_user_id)
      throw new DomainError(
        "RELEASE_AI_LOGIN_REQUIRED",
        "El organizador debe haber ingresado antes de verificar el asistente.",
        503,
      );
    const actor: Actor = {
      ...scope,
      userId: member.auth_user_id,
      email: member.email_normalized,
    };
    await checkMembership(client, actor);
    return actor;
  });
  // Each explicit deployment gets one probe; rebuilding it reuses its results.
  // A new deployment can recover after account settings change, even on the same SHA.
  const deployment =
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_URL ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "local-test";
  onStage("gateway_decision", modelConfig("decision").model);
  const selected = await budgetedDecision(
    actor,
    "Consulta de prueba: hervidor. Texto registrado ficticio: pava eléctrica.",
    {
      match: "Mismo objeto por sinónimo",
      unknown: "No hay coincidencia sustentada",
    },
    decision,
    `release-v1-20261014:${deployment}:decision`,
    pool,
  );
  if (selected.choice !== "match")
    throw new DomainError(
      "RELEASE_AI_DECISION_INVALID",
      "La decisión de prueba necesita revisión.",
      503,
    );
  if (!generationEnabled())
    return {
      status: "decision_verified",
      decisionModel: selected.model,
      generation: "disabled",
    };
  const input = JSON.stringify({
    message: "Agregá platos azules a C-001",
    units: [{ code: "C-001", name: "Caja ficticia" }],
    entries: [],
    rooms: rooms.map((r) => ({ key: r.key, name: r.name })),
  });
  onStage("gateway_extraction", modelConfig("extraction").model);
  const result = await paidCall(
    actor,
    "extraction",
    `release-v1-20261014:${deployment}:extraction`,
    input,
    () => extraction.extract(input),
    pool,
  );
  const op = result.plan.operations[0];
  if (
    result.plan.question ||
    result.plan.operations.length !== 1 ||
    op.type !== "append" ||
    op.target !== "C-001" ||
    op.sourceText !== "platos azules" ||
    op.count !== null
  )
    throw new DomainError(
      "RELEASE_AI_EXTRACTION_INVALID",
      "La extracción de prueba necesita revisión.",
      503,
    );
  return {
    status: "verified",
    decisionModel: selected.model,
    extractionModel: result.model,
  };
}
