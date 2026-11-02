import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { razorpayConfigured, razorpayLiveKeyBlocked, razorpayxConfigured, verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/integrations/razorpay";

const sign = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");
const ENV = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAYX_ACCOUNT_NUMBER"] as const;
afterEach(() => { for (const k of ENV) delete process.env[k]; });

describe("Checkout signature", () => {
  const secret = "test_secret";
  it("accepts the HMAC of order_id|payment_id", () => expect(verifyCheckoutSignature("order_A", "pay_B", sign(secret, "order_A|pay_B"), secret)).toBe(true));
  it("rejects a tampered order, payment or signature", () => {
    const good = sign(secret, "order_A|pay_B");
    expect(verifyCheckoutSignature("order_X", "pay_B", good, secret)).toBe(false);
    expect(verifyCheckoutSignature("order_A", "pay_X", good, secret)).toBe(false);
    expect(verifyCheckoutSignature("order_A", "pay_B", good.replace(/.$/, "0"), secret)).toBe(false);
  });
  it("rejects a signature made with another secret, and empty input", () => {
    expect(verifyCheckoutSignature("order_A", "pay_B", sign("other", "order_A|pay_B"), secret)).toBe(false);
    expect(verifyCheckoutSignature("", "", "", secret)).toBe(false);
    expect(verifyCheckoutSignature("order_A", "pay_B", "short", secret)).toBe(false);
  });
});

describe("Webhook signature", () => {
  const body = JSON.stringify({ event: "payout.processed" });
  it("accepts the HMAC of the raw body", () => expect(verifyWebhookSignature(body, sign("whsec", body), "whsec")).toBe(true));
  it("rejects a changed body, a missing signature and a missing secret", () => {
    expect(verifyWebhookSignature(body + " ", sign("whsec", body), "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, null, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, sign("", body), "")).toBe(false);
  });
});

describe("Test-mode guard", () => {
  it("is off with no keys", () => { expect(razorpayConfigured()).toBe(false); expect(razorpayLiveKeyBlocked()).toBe(false); });
  it("accepts test keys; RazorpayX also needs the account number", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc"; process.env.RAZORPAY_KEY_SECRET = "s";
    expect(razorpayConfigured()).toBe(true); expect(razorpayxConfigured()).toBe(false);
    process.env.RAZORPAYX_ACCOUNT_NUMBER = "2323230000000000"; expect(razorpayxConfigured()).toBe(true);
  });
  it("refuses live keys", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_live_abc"; process.env.RAZORPAY_KEY_SECRET = "s"; process.env.RAZORPAYX_ACCOUNT_NUMBER = "1";
    expect(razorpayConfigured()).toBe(false); expect(razorpayxConfigured()).toBe(false); expect(razorpayLiveKeyBlocked()).toBe(true);
  });
});
