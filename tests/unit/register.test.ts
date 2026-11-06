import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const signUp = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signUp } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4", origin: "http://localhost:3002" }) }));
vi.mock("@/lib/server/ratelimit", () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));

const form = (o: Record<string, string> = {}) => { const fd = new FormData(); const base = { firstName: "Priya", lastName: "Sharma", email: "priya@example.com", password: "Str0ng!pass", confirm: "Str0ng!pass", terms: "on", ...o }; for (const [k, v] of Object.entries(base)) if (v !== undefined) fd.set(k, v); return fd; };
const realFetch = globalThis.fetch;
beforeEach(() => { signUp.mockClear(); delete process.env.RECAPTCHA_SECRET_KEY; });
afterEach(() => { globalThis.fetch = realFetch; delete process.env.RECAPTCHA_SECRET_KEY; });

describe("create account: terms and reCAPTCHA", () => {
  it("requires the Terms box and never calls Supabase without it", async () => {
    const { register } = await import("@/app/actions/auth");
    const fd = form(); fd.delete("terms"); const r = await register(undefined, fd);
    expect(r?.error).toMatch(/agree to the Terms/); expect(signUp).not.toHaveBeenCalled();
  });
  it("records when and which Terms were accepted", async () => {
    const { register } = await import("@/app/actions/auth"); const { TERMS_VERSION } = await import("@/lib/terms");
    const r = await register(undefined, form()); expect(r?.ok).toBeTruthy();
    const opts = (signUp.mock.calls[0] as unknown as [{ options: { data: Record<string, string> } }])[0].options.data;
    expect(opts.terms_version).toBe(TERMS_VERSION); expect(new Date(opts.terms_accepted_at).getTime()).toBeGreaterThan(Date.now() - 5000);
  });
  it("skips the captcha when no secret key is configured (local development)", async () => {
    const { register } = await import("@/app/actions/auth"); const f = vi.fn(); globalThis.fetch = f as unknown as typeof fetch;
    expect((await register(undefined, form()))?.ok).toBeTruthy(); expect(f).not.toHaveBeenCalled();
  });
  it("blocks sign-up unless Google confirms the token, and fails closed if Google is unreachable", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret"; const { register } = await import("@/app/actions/auth");
    expect((await register(undefined, form()))?.error).toMatch(/not a robot/); // no token at all
    const tok = "x".repeat(40);
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })) as unknown as typeof fetch;
    expect((await register(undefined, form({ "g-recaptcha-response": tok })))?.error).toMatch(/not a robot/);
    globalThis.fetch = vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    expect((await register(undefined, form({ "g-recaptcha-response": tok })))?.error).toMatch(/not a robot/);
    expect(signUp).not.toHaveBeenCalled();
    const ok = vi.fn(async (_u: unknown, init?: RequestInit) => { expect(String(init?.body)).toContain("secret=secret"); expect(String(init?.body)).toContain("remoteip=1.2.3.4"); return new Response(JSON.stringify({ success: true }), { status: 200 }); });
    globalThis.fetch = ok as unknown as typeof fetch;
    expect((await register(undefined, form({ "g-recaptcha-response": tok })))?.ok).toBeTruthy(); expect(signUp).toHaveBeenCalledTimes(1);
  });
});
