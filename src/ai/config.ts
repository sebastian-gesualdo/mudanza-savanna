import { DomainError } from "../domain/model";
import { deploymentEnvironment } from "../deployment";

// Official Gateway model pages verified 2026-10-14. Per million text tokens.
// https://vercel.com/ai-gateway/models/jev
// https://vercel.com/ai-gateway/models/gemini-2.5-flash-lite
// https://vercel.com/ai-gateway/models/gpt-5.4-nano
export const verifiedPrices: Record<string, { input: number; output: number }> =
  {
    "typesafe-ai/jev": { input: 0.04, output: 0 },
    "google/gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
    "openai/gpt-5.4-nano": { input: 0.2, output: 1.25 },
  };
export function aiEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  // The organizer requested production activation. Legacy setup flags only opt in
  // local/test environments; explicit DISABLED switches remain available to operators.
  return (
    env.AI_DISABLED !== "true" &&
    (deploymentEnvironment(env) === "production" || env.AI_ENABLED === "true")
  );
}
export function generationEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    aiEnabled(env) &&
    env.GENERATION_DISABLED !== "true" &&
    (deploymentEnvironment(env) === "production" ||
      env.GENERATION_ENABLED === "true")
  );
}
export function modelConfig(kind: "decision" | "extraction") {
  const model =
    kind === "decision"
      ? process.env.DECISION_MODEL?.trim() || "typesafe-ai/jev"
      : process.env.GENERATION_MODEL?.trim() || "google/gemini-2.5-flash-lite";
  const prefix = kind === "decision" ? "AI" : "GENERATION";
  const known = verifiedPrices[model];
  const inputText =
    process.env[`${prefix}_INPUT_USD_PER_MILLION`]?.trim() || undefined;
  const outputText =
    process.env[`${prefix}_OUTPUT_USD_PER_MILLION`]?.trim() || undefined;
  const input = inputText !== undefined ? Number(inputText) : known?.input;
  const output = outputText !== undefined ? Number(outputText) : known?.output;
  if (
    input === undefined ||
    output === undefined ||
    !Number.isFinite(input) ||
    !Number.isFinite(output) ||
    input < 0 ||
    output < 0
  )
    throw new DomainError(
      "AI_PRICING_REQUIRED",
      "Falta verificar las tarifas del asistente. Podés usar los controles manuales.",
      503,
    );
  return {
    model,
    input,
    output,
    maxOutputTokens: kind === "decision" ? 0 : 1800,
  };
}
