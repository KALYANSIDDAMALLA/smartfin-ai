import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { demoLiveBlock, isDemoEmail, razorpayConfigured, razorpayIsLive, razorpayKeyMismatch, razorpayMode, razorpayxConfigured, testTag, verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/integrations/razorpay";

const sign = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");
const ENV = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAYX_ACCOUNT_NUMBER", "RAZORPAY_MODE", "VERCEL_ENV", "RAZORPAY_ALLOW_LIVE_LOCAL"] as const;
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
  it("is off with no keys", () => { expect(razorpayConfigured()).toBe(false); expect(razorpayKeyMismatch()).toBe(false); });
  it("accepts test keys; RazorpayX also needs the account number", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc"; process.env.RAZORPAY_KEY_SECRET = "s";
    expect(razorpayConfigured()).toBe(true); expect(razorpayxConfigured()).toBe(false);
    process.env.RAZORPAYX_ACCOUNT_NUMBER = "2323230000000000"; expect(razorpayxConfigured()).toBe(true);
  });
  it("refuses live keys", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_live_abc"; process.env.RAZORPAY_KEY_SECRET = "s"; process.env.RAZORPAYX_ACCOUNT_NUMBER = "1";
    expect(razorpayConfigured()).toBe(false); expect(razorpayxConfigured()).toBe(false); expect(razorpayKeyMismatch()).toBe(true);
  });
});

describe("Demo-account guard", () => {
  const goLive = () => { process.env.RAZORPAY_MODE = "live"; process.env.VERCEL_ENV = "production"; };
  it("recognises the shared demo logins, any case, and nothing else", () => {
    for (const e of ["priya.demo@smartfin.demo", "ARJUN.DEMO@SMARTFIN.DEMO", " x@smartfin.demo "]) expect(isDemoEmail(e)).toBe(true);
    for (const e of ["real@gmail.com", "me@smartfin.demo.evil.com", "demo@smartfin.ai", "", null, undefined]) expect(isDemoEmail(e)).toBe(false);
  });
  it("blocks demo users in LIVE mode with a clear message", () => { goLive(); expect(demoLiveBlock("priya.demo@smartfin.demo")).toMatch(/demo account can't make real payments/); });
  it("never blocks real users in live mode", () => { goLive(); expect(demoLiveBlock("someone@gmail.com")).toBeNull(); expect(demoLiveBlock(undefined)).toBeNull(); });
  it("does not block demo users in test mode (no real money there)", () => { expect(demoLiveBlock("priya.demo@smartfin.demo")).toBeNull(); });
});

describe("Live-mode switch (safe by default)", () => {
  const live = (k = "rzp_live_abc") => { process.env.RAZORPAY_MODE = "live"; process.env.RAZORPAY_KEY_ID = k; process.env.RAZORPAY_KEY_SECRET = "s"; };
  it("defaults to test mode and labels it", () => { expect(razorpayMode()).toBe("test"); expect(razorpayIsLive()).toBe(false); expect(testTag()).toBe(" (test)"); });
  it("RAZORPAY_MODE=live alone is NOT enough: localhost and previews stay in test mode and reject live keys", () => {
    live(); expect(razorpayMode()).toBe("test"); expect(razorpayConfigured()).toBe(false); expect(razorpayKeyMismatch()).toBe(true);
    process.env.VERCEL_ENV = "preview"; expect(razorpayMode()).toBe("test");
  });
  it("goes live only on the production deployment with live keys", () => {
    live(); process.env.VERCEL_ENV = "production";
    expect(razorpayMode()).toBe("live"); expect(testTag()).toBe(""); expect(razorpayConfigured()).toBe(true); expect(razorpayKeyMismatch()).toBe(false);
  });
  it("in live mode a test key switches Razorpay off instead of guessing", () => {
    live("rzp_test_abc"); process.env.VERCEL_ENV = "production";
    expect(razorpayMode()).toBe("live"); expect(razorpayConfigured()).toBe(false); expect(razorpayKeyMismatch()).toBe(true);
  });
  it("live mode on a local machine needs an explicit opt-in", () => {
    live(); process.env.RAZORPAY_ALLOW_LIVE_LOCAL = "1"; expect(razorpayMode()).toBe("live"); expect(razorpayConfigured()).toBe(true);
  });
  it("a mode other than exactly 'live' is test", () => { process.env.RAZORPAY_MODE = "LIVE"; process.env.VERCEL_ENV = "production"; expect(razorpayMode()).toBe("test"); });
});
