import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/server/ratelimit";
import { hashToken, ingestSms, TOKEN_RE } from "@/lib/server/sms-ingest";

/**
 * Receives one forwarded bank/UPI SMS from the user's phone. Public (the phone has no login), so the ONLY gate is a private token that is checked
 * by its SHA-256 hash. Accepts JSON ({"message": "..."}), form fields, or the raw message as text/plain. The token goes in
 * `Authorization: Bearer sfn_...` (or `X-SmartFin-Token`; `?token=` exists for forwarder apps that cannot set headers, but URLs get logged, so avoid it).
 * Messages are only staged for the user's review, never written straight to the ledger.
 */
export const dynamic = "force-dynamic";
const MAX = 8_000;
const KEYS = ["message", "text", "body", "sms", "content", "msg"];
const deny = () => NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!rateLimit(`sms-ip:${ip}`, 120, 60_000).ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  const url = new URL(req.url);
  const token = (req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-smartfin-token") ?? url.searchParams.get("token") ?? "").trim();
  if (!TOKEN_RE.test(token)) return deny();
  const h = hashToken(token);
  if (!rateLimit(`sms-tok:${h}`, 30, 60_000).ok) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });

  const db = createAdminClient();
  const { data: row } = await db.from("sms_forwarding").select("user_id,received_count").eq("token_hash", h).maybeSingle();
  if (!row) return deny();

  const raw = (await req.text()).slice(0, MAX * 2); const ct = req.headers.get("content-type") ?? "";
  let message = "";
  if (ct.includes("json")) { try { const j = JSON.parse(raw) as Record<string, unknown>; const k = KEYS.find((x) => typeof j[x] === "string"); message = k ? String(j[k]) : ""; } catch { /* falls through to 400 */ } }
  else if (ct.includes("x-www-form-urlencoded")) { const p = new URLSearchParams(raw); message = KEYS.map((k) => p.get(k)).find(Boolean) ?? ""; }
  else message = raw;
  if (!message.trim()) return NextResponse.json({ ok: false, error: "No message found. Send JSON like {\"message\": \"<sms text>\"}." }, { status: 400 });
  if (message.length > MAX) return NextResponse.json({ ok: false, error: "Message too long" }, { status: 413 });

  try {
    const r = await ingestSms(row.user_id, message);
    await db.from("sms_forwarding").update({ last_used_at: new Date().toISOString(), received_count: (row.received_count ?? 0) + (r.status === "staged" ? 1 : 0) }).eq("user_id", row.user_id);
    return NextResponse.json({ ok: true, status: r.status, ...(r.reason ? { reason: r.reason } : {}) });
  } catch (e) { console.error("sms ingest", (e as Error).message); return NextResponse.json({ ok: false, error: "Could not save the message. Try again." }, { status: 500 }); } // 5xx so forwarder apps retry
}
