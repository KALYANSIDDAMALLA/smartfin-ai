import Link from "next/link";
import { Logo } from "@/components/logo";
import { AuthNav } from "@/components/auth-nav";
import { AuthCard } from "@/components/auth-card";

/** One centred form on a soft gradient colour (no picture, no side panel). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[linear-gradient(135deg,#c7d2fe,#ddd6fe_50%,#fbcfe8)] dark:bg-[linear-gradient(135deg,#0b0d2a,#16124a_55%,#2a1458)]">
      <AuthNav />
      <main className="flex min-h-dvh flex-col items-center justify-center px-4 pb-14 pt-16 sm:px-8 sm:pt-14 [@media(min-width:640px)_and_(max-height:900px)]:py-6">
        <Link href="/" aria-label="SmartFin AI home" className="mb-3 text-brand"><Logo size={30} textClassName="text-xl" /></Link>
        <AuthCard>{children}</AuthCard>
      </main>
    </div>
  );
}
