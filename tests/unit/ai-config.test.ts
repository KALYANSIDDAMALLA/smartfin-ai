import { describe, expect, it } from "vitest";
import { completionParams, isReasoningModel, providerOrder } from "@/lib/ai-config";

describe("AI provider order", () => {
  const both = { gemini: true, openai: true };
  it("defaults to Gemini first, OpenAI as fallback", () => expect(providerOrder(undefined, both)).toEqual(["Google Gemini", "OpenAI"]));
  it("AI_PROVIDER=openai puts OpenAI first", () => expect(providerOrder("openai", both)).toEqual(["OpenAI", "Google Gemini"]));
  it("is case-insensitive and ignores junk", () => { expect(providerOrder(" OpenAI ", both)[0]).toBe("OpenAI"); expect(providerOrder("banana", both)[0]).toBe("Google Gemini"); });
  it("only lists providers that have a key", () => { expect(providerOrder("openai", { gemini: true, openai: false })).toEqual(["Google Gemini"]); expect(providerOrder(undefined, { gemini: false, openai: true })).toEqual(["OpenAI"]); expect(providerOrder(undefined, { gemini: false, openai: false })).toEqual([]); });
});
describe("completion params", () => {
  it("classic OpenAI models use max_tokens + temperature", () => expect(completionParams("OpenAI", "gpt-4o-mini", 700)).toEqual({ max_tokens: 700, temperature: 0.2 }));
  it("reasoning models use max_completion_tokens, no temperature, extra room", () => {
    for (const m of ["gpt-5", "gpt-5-mini", "o3-mini", "o4-mini"]) { expect(isReasoningModel(m)).toBe(true); const p = completionParams("OpenAI", m, 700); expect(p).toMatchObject({ max_completion_tokens: 2800, reasoning_effort: "low" }); expect(p).not.toHaveProperty("temperature"); expect(p).not.toHaveProperty("max_tokens"); }
  });
  it("gpt-4o is not a reasoning model", () => expect(isReasoningModel("gpt-4o")).toBe(false));
  it("Gemini keeps thinking off", () => expect(completionParams("Google Gemini", "gemini-2.5-flash", 700)).toMatchObject({ max_tokens: 700, reasoning_effort: "none" }));
});
