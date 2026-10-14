import { DomainError } from "../domain/model";
import { deploymentEnvironment } from "../deployment";

// Official Gateway model pages verified 2026-10-14. Per million text tokens.
// https://vercel.com/ai-gateway/models/jev
// https://vercel.com/ai-gateway/models/deepseek-v4-pro-0813
// https://vercel.com/ai-gateway/models/gpt-6.1-sol
export const verifiedPrices: Record<string, { input: number; output: number }> =
  {
    "typesafe-ai/jev": { input: 0.04, output: 0 },
    "deepseek/deepseek-v4-pro-0813": { input: 0.66, output: 1.98 },
    "openai/gpt-6.1-sol": { input: 2, output: 10 },
  };
export const defaultExtractionModel = "deepseek/deepseek-v4-pro-0813";
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
  const requested = process.env.GENERATION_MODEL?.trim();
  if (kind === "extraction" && requested?.startsWith("anthropic/"))
    throw new DomainError(
      "AI_MODEL_NOT_ALLOWED",
      "Ese modelo no está habilitado para esta mudanza.",
      503,
    );
  // Honor the organizer's model change even if Vercel retains the initial values.
  // Old price overrides belong to those old models and must not price DeepSeek.
  const replacedLegacyModel =
    kind === "extraction" &&
    Boolean(requested?.match(/^(google\/gemini-2\.5|openai\/gpt-5\.4)(?:-|$)/));
  const model =
    kind === "decision"
      ? process.env.DECISION_MODEL?.trim() || "typesafe-ai/jev"
      : replacedLegacyModel
        ? defaultExtractionModel
        : requested || defaultExtractionModel;
  const prefix = kind === "decision" ? "AI" : "GENERATION";
  const known = verifiedPrices[model];
  const inputText = !replacedLegacyModel
    ? process.env[`${prefix}_INPUT_USD_PER_MILLION`]?.trim() || undefined
    : undefined;
  const outputText = !replacedLegacyModel
    ? process.env[`${prefix}_OUTPUT_USD_PER_MILLION`]?.trim() || undefined
    : undefined;
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
    // A stale cheap-model override must never lower the verified reservation/cost.
    input: Math.max(input, known?.input ?? input),
    output: Math.max(output, known?.output ?? output),
    maxOutputTokens: kind === "decision" ? 0 : 4096,
  };
}
