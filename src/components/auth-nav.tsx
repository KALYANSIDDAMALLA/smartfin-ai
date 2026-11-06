import Link from "next/link";
import { Home } from "lucide-react";

/** Highlighted, with the same shine on hover as the Sign up button. Solid background so it stays readable over the background picture. */
const cls = "btn-shine inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-brand/50 bg-surface px-4 text-sm font-semibold text-brand shadow-lg shadow-brand/20 ring-1 ring-white/40 transition hover:-translate-y-px hover:border-brand hover:bg-brand/10";

/** A way back to the home page, pinned to the top right corner of the screen on the login and sign-up pages. */
export function AuthNav() {
  return (
    <nav aria-label="Page navigation" className="fixed right-3 top-3 z-30 sm:right-5 sm:top-5">
      <Link href="/" className={cls}><Home size={16} aria-hidden />Home</Link>
    </nav>
  );
}
