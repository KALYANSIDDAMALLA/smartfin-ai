import { GoogleButton } from "./google-button";
import { AuthForm } from "./auth-form";
import { ActionForm } from "./action-form";
import { Field, Input } from "./ui";
import { login, register, resendVerification } from "@/app/actions/auth";
import { phoneOtpAvailable } from "@/lib/server/phone-otp";
import { mailConfigured } from "@/lib/server/mail";

export type LoginSP = { next?: string; error?: string; error_description?: string; deleted?: string };

/** The log-in form body, shared by the full /login page and the pop-up version. */
export function LoginBody({ sp }: { sp: LoginSP }) {
  return (<>
    {sp.error && <p role="alert" className="mb-3 text-sm text-bad">{sp.error === "link" ? "That verification or reset link is invalid or expired. Request a new one below." : "Sign-in with Google couldn't be completed. Please try again, or log in with your email and password."}</p>}
    {sp.deleted && <p role="status" className="mb-3 text-sm text-good">Your account was deleted.</p>}
    <AuthForm mode="login" action={login} next={sp.next} />
    <GoogleButton next={sp.next} />
    <details className="mt-5 border-t border-line pt-4 text-sm"><summary className="cursor-pointer text-brand">Didn&apos;t get your verification email?</summary>
      <ActionForm action={resendVerification} submit="Resend verification email" variant="outline" className="mt-3"><Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field></ActionForm></details>
  </>);
}

/** The sign-up form body, shared by the full /register page and the pop-up version. */
export function RegisterBody() { return <><AuthForm mode="register" action={register} phoneOtp={phoneOtpAvailable()} emailCodes={mailConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY} /><GoogleButton signup /></>; }
