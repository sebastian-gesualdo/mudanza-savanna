import { createGateway } from "ai";
import { DomainError } from "../domain/model";

// Public, documented Jev HTTP contract. Keep SDK authentication and answer
// validation while insulating text decisions from its experimental stateParts wire format.
// https://vercel.com/docs/ai-gateway/modalities/decision#http-api
export function decisionGateway(fetcher: typeof fetch = globalThis.fetch) {
  return createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY?.trim() || undefined,
    fetch: async (input, init) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      );
      if (
        url.origin !== "https://ai-gateway.vercel.sh" ||
        !url.pathname.endsWith("/decision-model") ||
        typeof init?.body !== "string"
      )
        throw new DomainError(
          "AI_TRANSPORT",
          "La conexión del asistente necesita revisión.",
          503,
        );
      const body = JSON.parse(init.body);
      const part = body.stateParts?.[0];
      const state =
        body.stateParts?.length === 1 && part?.type === "text"
          ? part.text
          : body.state;
      const headers = new Headers(init.headers);
      const model = headers.get("ai-model-id");
      if (model !== "typesafe-ai/jev" || typeof state !== "string")
        throw new DomainError(
          "AI_TRANSPORT",
          "La conexión del asistente necesita revisión.",
          503,
        );
      headers.delete("ai-gateway-protocol-version");
      headers.delete("ai-decision-model-specification-version");
      headers.delete("ai-model-id");
      return fetcher(new URL("/v1/evaluate", url), {
        ...init,
        headers,
        redirect: "error",
        body: JSON.stringify({ model, state, questions: body.questions }),
      });
    },
  });
}
