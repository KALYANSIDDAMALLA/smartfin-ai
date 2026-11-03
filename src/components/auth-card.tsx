"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

/** The white card on the auth pages (not on sign-up): wider for the two-column forms, with a small "other page" link underneath instead of tabs. */
export function AuthCard({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const wide = path === "/register" || path === "/reset-password"; const bare = path === "/register"; // sign-up: fields sit straight on the background picture, no card
  return (
    <div className={cn("mx-auto w-full", bare ? "p-1" : "rounded-2xl border border-line bg-surface p-5 shadow-2xl shadow-indigo-900/15 sm:p-7", wide ? "max-w-xl" : "max-w-md")}>
      {children}
      {path === "/register" && <p className="mt-3 border-t border-line pt-3 text-center text-sm text-muted">Already have an account? <a href="/login" className="font-semibold text-brand hover:underline">Log in</a></p>}
      {path === "/login" && <p className="mt-5 border-t border-line pt-4 text-center text-sm text-muted">New to SmartFin AI? <Link href="/register" className="font-semibold text-brand hover:underline">Create an account</Link></p>}
    </div>
  );
}
