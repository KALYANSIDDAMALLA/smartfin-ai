import "server-only";

/** Where Google verifies a reCAPTCHA token. */
const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/** True when the secret key is configured, i.e. the captcha must be passed. Without a key the check is skipped (local development). */
export const recaptchaEnforced = () => !!process.env.RECAPTCHA_SECRET_KEY;

const DEMO_SECRET = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe"; let warned = false;
/** Google's demo secret accepts every token, so using it in production means no bot protection at all. Log it loudly (once). */
function warnIfDemoInProduction(secret: string) { if (!warned && secret === DEMO_SECRET && process.env.NODE_ENV === "production") { warned = true; console.warn("[recaptcha] The Google DEMO secret key is in use: every token passes. Create real keys before real users sign up."); } }

/**
 * Verifies a reCAPTCHA v2 token with Google. Fails closed: once the secret key is set, a missing token, a rejected token or an unreachable
 * Google all count as "not verified". Tokens are single-use and expire after about two minutes.
 */
export async function verifyRecaptcha(token: string | null | undefined, remoteIp?: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY; if (!secret) return true; warnIfDemoInProduction(secret);
  if (!token || token.length < 20 || token.length > 4096) return false;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const body = new URLSearchParams({ secret, response: token }); if (remoteIp && remoteIp !== "local") body.set("remoteip", remoteIp);
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: ctl.signal, headers: { "content-type": "application/x-www-form-urlencoded" } });
    if (!res.ok) return false; const j = (await res.json()) as { success?: boolean }; return j.success === true;
  } catch { return false; } finally { clearTimeout(timer); }
}
