import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfilPayment } from "@/lib/server/billing";
import { verifyWebhookSignature } from "@/lib/integrations/razorpay";

/**
 * Razorpay webhook. Register  <your site>/api/webhooks/razorpay  in Razorpay Dashboard > Webhooks (events: payment.captured, order.paid, payment.failed)
 * and put the secret you choose there in RAZORPAY_WEBHOOK_SECRET.
 * Public on purpose (Razorpay has no login), so the ONLY gate is the signature on the RAW body. It is also the safety net for customers who pay
 * and then close the tab before our confirmation runs. fulfil_payment() is idempotent, so Razorpay retries and duplicate events are harmless.
 */
type Entity = { id?: string; order_id?: string; amount?: number; currency?: string; status?: string; error_description?: string | null };
type Event = { event?: string; payload?: { payment?: { entity?: Entity } } };

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  let ev: Event; try { ev = JSON.parse(raw) as Event; } catch { return NextResponse.json({ error: "Bad body" }, { status: 400 }); }
  const e = ev.event ?? ""; const eventId = req.headers.get("x-razorpay-event-id");
  try {
    const db = createAdminClient();
    if (eventId && (await db.from("payment_events").select("event_id").eq("event_id", eventId).maybeSingle()).data) return NextResponse.json({ ok: true, duplicate: true });
    const pay = ev.payload?.payment?.entity;
    if ((e === "payment.captured" || e === "order.paid") && pay?.id && pay.order_id && typeof pay.amount === "number" && pay.currency) {
      const r = await fulfilPayment(pay.order_id, pay.id, pay.amount, pay.currency);
      if (r === "mismatch" || r === "conflict") console.error("razorpay webhook refused", r, pay.order_id, pay.id);
    } else if (e === "payment.failed" && pay?.order_id) {
      await db.from("payment_orders").update({ status: "failed", failure_reason: (pay.error_description ?? "Payment failed").slice(0, 300) }).eq("order_id", pay.order_id).in("status", ["created", "failed", "cancelled"]);
    }
    if (eventId) await db.from("payment_events").upsert({ event_id: eventId, event: e }, { onConflict: "event_id", ignoreDuplicates: true });
  } catch (err) { console.error("razorpay webhook", e, (err as Error).message); return NextResponse.json({ error: "Retry" }, { status: 500 }); } // 5xx makes Razorpay retry
  return NextResponse.json({ ok: true });
}
