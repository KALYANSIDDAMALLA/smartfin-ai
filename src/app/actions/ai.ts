"use server";
import { revalidatePath } from "next/cache";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { resolveRange } from "@/lib/server/range";
import { generateInsight } from "@/lib/server/insights";
import { generateCoachPlan } from "@/lib/server/coach";
import { answerQuestion } from "@/lib/server/assistant";
import type { FormState } from "./auth";

export async function runAnalysis(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`ai:${a.user.id}`, 10, 60 * 60_000).ok) return { error: "AI usage limit reached. Try again later." };
  const { data: prof } = await a.supabase.from("profiles").select("timezone,currency").eq("id", a.user.id).single(); const tz = prof?.timezone ?? "Asia/Kolkata";
  const { range, prev } = resolveRange({ range: String(fd.get("range") ?? "month"), from: String(fd.get("from") ?? "") || undefined, to: String(fd.get("to") ?? "") || undefined }, tz);
  try { const r = await generateInsight(a.supabase, a.user.id, range, prev, tz, prof?.currency ?? "INR"); revalidatePath("/analytics", "layout"); return { ok: r.fallback ? "Generated with built-in analysis (AI provider unavailable)." : "Analysis generated." }; }
  catch { return { error: "Could not generate analysis." }; }
}

export async function askAssistant(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`ask:${a.user.id}`, 30, 60 * 60_000).ok) return { error: "Question limit reached. Try again later." };
  const q = String(fd.get("question") ?? "").trim().slice(0, 300); if (q.length < 3) return { error: "Ask a question." };
  const { data: prof } = await a.supabase.from("profiles").select("timezone").eq("id", a.user.id).single();
  let convId = String(fd.get("conversationId") ?? "");
  if (!convId) { const { data } = await a.supabase.from("ai_conversations").insert({ user_id: a.user.id, title: q.slice(0, 60) }).select("id").single(); convId = data?.id ?? ""; }
  try {
    const ans = await answerQuestion(a.supabase, prof?.timezone ?? "Asia/Kolkata", q);
    await a.supabase.from("ai_messages").insert([{ user_id: a.user.id, conversation_id: convId, role: "user", content: q }, { user_id: a.user.id, conversation_id: convId, role: "assistant", content: `${ans.text}\n\n(Period: ${ans.period})` }]);
  } catch { return { error: "Could not answer right now." }; }
  revalidatePath("/ai/assistant"); return { ok: "Answered." };
}

export async function clearConversations(): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  await a.supabase.from("ai_conversations").delete().eq("user_id", a.user.id); revalidatePath("/ai/assistant"); return { ok: "History cleared." };
}

export async function writeCoachPlan(): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`coach:${a.user.id}`, 10, 60 * 60_000).ok) return { error: "Plan limit reached. Try again later." };
  const { data: prof } = await a.supabase.from("profiles").select("timezone,currency").eq("id", a.user.id).single();
  try { const r = await generateCoachPlan(a.supabase, a.user.id, prof?.timezone ?? "Asia/Kolkata", prof?.currency ?? "INR"); revalidatePath("/ai/analysis"); return { ok: r.fallback ? "Plan built from your numbers." : "Your 30-day plan is ready." }; }
  catch { return { error: "Could not write the plan right now." }; }
}
