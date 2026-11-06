import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(); const updates: Record<string, unknown>[] = []; const events = new Set<string>();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc,
    from: (t: string) => ({
      select: () => ({ eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: t === "payment_events" && events.has(v) ? { event_id: v } : null }) }) }),
      update: (u: Record<string, unknown>) => { updates.push(u); return { eq: () => ({ in: async () => ({}) }) }; },
      upsert: async (r: { event_id: string }) => { events.add(r.event_id); return {}; },
    }),
  }),
}));

import { POST } from "@/app/api/webhooks/razorpay/route";
import { verifyCheckoutSignature, verifyWebhookSignature, razorpayConfigured, razorpayMode } from "@/lib/integrations/razorpay";
import { PAID_PLANS, isPlanCode, paymentsEnabled } from "@/lib/billing/plans";

const sign = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");
const ENV = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "PAYMENTS_ENABLED", "PRO_MONTHLY_PRICE_INR", "PRO_YEARLY_PRICE_INR"];
beforeEach(() => { rpc.mockReset(); updates.length = 0; events.clear(); process.env.RAZORPAY_WEBHOOK_SECRET = "whsec"; });
afterEach(() => { for (const k of ENV) delete process.env[k]; });

describe("Checkout signature", () => {
  const secret = "key_secret";
  it("accepts HMAC(order_id|payment_id)", () => expect(verifyCheckoutSignature("order_A", "pay_B", sign(secret, "order_A|pay_B"), secret)).toBe(true));
  it("rejects tampered order, payment, signature, other secret, and empty input", () => {
    const good = sign(secret, "order_A|pay_B");
    expect(verifyCheckoutSignature("order_X", "pay_B", good, secret)).toBe(false);
    expect(verifyCheckoutSignature("order_A", "pay_X", good, secret)).toBe(false);
    expect(verifyCheckoutSignature("order_A", "pay_B", good.replace(/.$/, "0"), secret)).toBe(false);
    expect(verifyCheckoutSignature("order_A", "pay_B", sign("other", "order_A|pay_B"), secret)).toBe(false);
    expect(verifyCheckoutSignature("", "", "", secret)).toBe(false);
  });
});

describe("Webhook signature", () => {
  it("accepts the HMAC of the raw body only", () => {
    expect(verifyWebhookSignature("{\"a\":1}", sign("whsec", "{\"a\":1}"), "whsec")).toBe(true);
    expect(verifyWebhookSignature("{\"a\": 1}", sign("whsec", "{\"a\":1}"), "whsec")).toBe(false); // re-serialised body must fail
    expect(verifyWebhookSignature("{}", null, "whsec")).toBe(false);
    expect(verifyWebhookSignature("{}", sign("whsec", "{}"), "")).toBe(false);
  });
});

describe("Plans and config", () => {
  it("prices come from the server (₹99 / ₹999 default) and can be overridden", () => {
    expect(PAID_PLANS().pro_monthly.amountMinor).toBe(9900); expect(PAID_PLANS().pro_yearly.amountMinor).toBe(99900);
    process.env.PRO_MONTHLY_PRICE_INR = "149"; expect(PAID_PLANS().pro_monthly.amountMinor).toBe(14900);
    process.env.PRO_MONTHLY_PRICE_INR = "-5"; expect(PAID_PLANS().pro_monthly.amountMinor).toBe(9900); // junk falls back
  });
  it("only known plan codes are accepted", () => { expect(isPlanCode("pro_monthly")).toBe(true); expect(isPlanCode("pro_free")).toBe(false); expect(isPlanCode(undefined)).toBe(false); });
  it("payments stay off unless PAYMENTS_ENABLED is exactly 'true'", () => { expect(paymentsEnabled()).toBe(false); process.env.PAYMENTS_ENABLED = "1"; expect(paymentsEnabled()).toBe(false); process.env.PAYMENTS_ENABLED = "true"; expect(paymentsEnabled()).toBe(true); });
  it("mode follows the key prefix; unknown keys are not configured", () => {
    expect(razorpayConfigured()).toBe(false);
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc"; process.env.RAZORPAY_KEY_SECRET = "s"; expect(razorpayConfigured()).toBe(true); expect(razorpayMode()).toBe("test");
    process.env.RAZORPAY_KEY_ID = "rzp_live_abc"; expect(razorpayMode()).toBe("live");
    process.env.RAZORPAY_KEY_ID = "nonsense"; expect(razorpayConfigured()).toBe(false);
  });
});

describe("Webhook route", () => {
  const body = (event: string, extra: object = {}) => JSON.stringify({ event, payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 9900, currency: "INR", ...extra } } } });
  const post = (raw: string, sig: string | null, id = "evt_1") => POST(new Request("http://x/api/webhooks/razorpay", { method: "POST", body: raw, headers: { ...(sig ? { "x-razorpay-signature": sig } : {}), "x-razorpay-event-id": id } }));

  it("rejects a missing or wrong signature and never touches the database", async () => {
    const raw = body("payment.captured");
    expect((await post(raw, null)).status).toBe(400);
    expect((await post(raw, sign("wrong", raw))).status).toBe(400);
    expect((await post(raw, sign("whsec", raw + " "))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("fulfils a verified captured payment with the amount and currency from Razorpay", async () => {
    rpc.mockResolvedValue({ data: "paid", error: null }); const raw = body("payment.captured");
    expect((await post(raw, sign("whsec", raw))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("fulfil_payment", { p_order_id: "order_1", p_payment_id: "pay_1", p_amount_minor: 9900, p_currency: "INR" });
  });
  it("ignores an event id it has already processed (duplicate delivery)", async () => {
    rpc.mockResolvedValue({ data: "paid", error: null }); const raw = body("payment.captured"); const s = sign("whsec", raw);
    await post(raw, s, "evt_dup"); const second = await post(raw, s, "evt_dup");
    expect(rpc).toHaveBeenCalledTimes(1); expect(await second.json()).toMatchObject({ duplicate: true });
  });
  it("asks Razorpay to retry (500) when the database fails, so a paid order is not lost", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } }); const raw = body("payment.captured");
    expect((await post(raw, sign("whsec", raw))).status).toBe(500);
  });
  it("records a failed payment without fulfilling anything", async () => {
    const raw = body("payment.failed", { error_description: "Card declined" });
    expect((await post(raw, sign("whsec", raw))).status).toBe(200);
    expect(rpc).not.toHaveBeenCalled(); expect(updates[0]).toMatchObject({ status: "failed", failure_reason: "Card declined" });
  });
  it("ignores unrelated events and malformed bodies safely", async () => {
    const raw = body("refund.created"); expect((await post(raw, sign("whsec", raw))).status).toBe(200); expect(rpc).not.toHaveBeenCalled();
    expect((await post("not json", sign("whsec", "not json"))).status).toBe(400);
  });
});
