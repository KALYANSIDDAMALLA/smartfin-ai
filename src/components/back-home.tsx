import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** The "← SmartFin AI" way back to the home page, shown at the top of the public text pages (Contact, Privacy, Terms) as a highlighted button. */
export function BackHome() {
  return (
    <Link href="/" className="btn-shine inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-brand/45 bg-brand/10 px-4 py-2 font-semibold text-brand shadow-sm transition hover:border-brand hover:bg-brand/20">
      <ArrowLeft size={16} aria-hidden />SmartFin AI
    </Link>
  );
}
