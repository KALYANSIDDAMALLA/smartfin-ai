"use client";
import { useActionState } from "react";
import { signInWithGoogle } from "@/app/actions/auth";
import { ErrorNote, cn } from "./ui";

const G = () => (<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.5 7l7.3 5.7c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>);

/** "Sign in with Google" (or "Sign up with Google" on the sign-up page) + divider. Place at the top of login/register. */
export function GoogleButton({ next, signup = false }: { next?: string; signup?: boolean }) {
  const [state, action, pending] = useActionState(signInWithGoogle, undefined);
  return (
    <div className="mt-2">
      <div className="mb-2 flex items-center gap-3 text-xs text-muted" role="separator"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
      <form action={action}>{next && <input type="hidden" name="next" value={next} />}
        <button disabled={pending} className={cn("inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface text-sm font-medium transition hover:bg-surface2 disabled:opacity-50")}><G />{pending ? "Redirecting…" : (signup ? "Sign up with Google" : "Sign in with Google")}</button></form>
      {state?.error && <div className="mt-2"><ErrorNote>{state.error}</ErrorNote></div>}
    </div>
  );
}
