import Link from "next/link";
import { Home } from "lucide-react";

const cls = "inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 shadow-sm text-sm font-medium transition hover:-translate-y-px hover:border-brand/50 hover:text-brand hover:shadow-lg";

/** Just a way back to the home page (the browser's own back button is not duplicated here). */
export function AuthNav() {
  return (
    <nav aria-label="Page navigation" className="mb-3 flex items-center justify-end">
      <Link href="/" className={cls}><Home size={16} aria-hidden />Home</Link>
    </nav>
  );
}
