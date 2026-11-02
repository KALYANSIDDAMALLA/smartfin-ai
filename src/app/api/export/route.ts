import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
const TABLES = ["profiles", "user_preferences", "accounts", "categories", "payment_methods", "transactions", "recurring_rules", "loans", "loan_payments", "budgets", "financial_goals", "goal_contributions", "savings_plans", "notifications", "ai_insights", "ai_conversations", "ai_messages", "import_batches", "integration_connections", "integration_consents"];
/** Full personal-data export. Every query runs as the user, so RLS guarantees only their rows. */
export async function GET() {
  const a = await getUserOrNull(); if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`export:${a.user.id}`, 5, 10 * 60_000).ok) return NextResponse.json({ error: "Too many exports" }, { status: 429 });
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), email: a.user.email };
  for (const t of TABLES) { const { data } = await a.supabase.from(t).select("*").limit(100000); out[t] = data ?? []; }
  return new NextResponse(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="smartfin-export.json"', "Cache-Control": "private, no-store" } });
}
