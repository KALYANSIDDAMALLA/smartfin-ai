/** Pure AI-provider rules (no secrets, no network), so they can be unit-tested. */
export type AiProvider = "Google Gemini" | "OpenAI";

/** OpenAI's reasoning models (gpt-5…, o1/o3/o4…) take `max_completion_tokens`, no custom temperature, and spend hidden "thinking" tokens. */
export const isReasoningModel = (model: string) => /^(gpt-5|o\d)/i.test(model.trim());

/**
 * Which providers to try, in order. AI_PROVIDER=openai or gemini puts that one first; anything else ("auto" or empty) keeps Gemini first because it has a free tier.
 * Only providers that have a key are returned, so the other one acts as an automatic fallback when the first fails.
 */
export function providerOrder(pref: string | undefined, has: { gemini: boolean; openai: boolean }): AiProvider[] {
  const p = (pref ?? "").trim().toLowerCase();
  const order: AiProvider[] = p === "openai" || p === "gpt" ? ["OpenAI", "Google Gemini"] : ["Google Gemini", "OpenAI"];
  return order.filter((x) => (x === "OpenAI" ? has.openai : has.gemini));
}

/** Request options that differ per provider/model. `maxTokens` is the visible answer size; reasoning models get extra room for their hidden thinking. */
export function completionParams(provider: AiProvider, model: string, maxTokens: number): Record<string, unknown> {
  if (provider === "Google Gemini") return { max_tokens: maxTokens, temperature: 0.2, reasoning_effort: "none" }; // Gemini 2.5 thinking would eat the token budget
  if (isReasoningModel(model)) return { max_completion_tokens: maxTokens * 4, reasoning_effort: "low" };
  return { max_tokens: maxTokens, temperature: 0.2 };
}
