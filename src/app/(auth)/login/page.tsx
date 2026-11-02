import { GoogleButton } from "@/components/google-button";
import { AuthForm } from "@/components/auth-form";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { login, resendVerification } from "@/app/actions/auth";
export const metadata = { title: "Log in" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string }> }) {
  const sp = await searchParams;
  return (<>
    {sp.error && <p role="alert" className="mb-3 text-sm text-bad">That verification or reset link is invalid or expired. Request a new one below.</p>}
    {sp.deleted && <p role="status" className="mb-3 text-sm text-good">Your account was deleted.</p>}
    <AuthForm mode="login" action={login} next={sp.next} />
    <GoogleButton next={sp.next} />
    <details className="mt-5 border-t border-line pt-4 text-sm"><summary className="cursor-pointer text-brand">Didn&apos;t get your verification email?</summary>
      <ActionForm action={resendVerification} submit="Resend verification email" variant="outline" className="mt-3"><Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field></ActionForm></details>
  </>);
}
