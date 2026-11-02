import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validationState, verifyWebhookSignature, type RzpValidation } from "@/lib/integrations/razorpay";

/**
 * Razorpay + RazorpayX webhooks (test mode). Register  <your site>/api/webhooks/razorpay  in the Razorpay dashboard with the secret in RAZORPAY_WEBHOOK_SECRET.
 * Public on purpose (Razorpay has no login), so the ONLY gate is the signature on the raw body. Handlers are idempotent: Razorpay retries.
 * Orders: the webhook only attaches the payment id. Marking an EMI paid stays with the signed Checkout confirmation, so the two can never race and record it twice.
 */
type Entity = { id?: string; order_id?: string; status?: string; utr?: string | null; status_details?: { description?: string } | null };
type Event = { event?: string; payload?: { payment?: { entity?: Entity }; order?: { entity?: Entity }; payout?: { entity?: Entity }; "fund_account.validation"?: { entity?: RzpValidation } } };

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  let ev: Event; try { ev = JSON.parse(raw) as Event; } catch { return NextResponse.json({ error: "Bad body" }, { status: 400 }); }
  const db = createAdminClient(); const e = ev.event ?? "";
  try {
    if (e === "payment.captured" || e === "order.paid") {
      const pay = ev.payload?.payment?.entity; const orderId = pay?.order_id ?? ev.payload?.order?.entity?.id;
      if (orderId && pay?.id) await db.from("razorpay_orders").update({ payment_id: pay.id }).eq("order_id", orderId).is("payment_id", null);
    } else if (e.startsWith("fund_account.validation.")) {
      const v = ev.payload?.["fund_account.validation"]?.entity;
      if (v?.id) { const state = validationState(v); if (state !== "pending") await db.from("account_verifications").update({ status: state, registered_name: v.results?.registered_name?.slice(0, 200) ?? null }).eq("validation_id", v.id); }
    } else if (e.startsWith("payout.")) {
      const p = ev.payload?.payout?.entity;
      if (p?.id && p.status) await db.from("razorpayx_payouts").update({ status: p.status, utr: p.utr ?? null, failure: p.status_details?.description?.slice(0, 300) ?? null }).eq("payout_id", p.id);
    }
  } catch (err) { console.error("razorpay webhook", e, (err as Error).message); return NextResponse.json({ error: "Retry" }, { status: 500 }); } // 5xx makes Razorpay retry
  return NextResponse.json({ ok: true });
}
