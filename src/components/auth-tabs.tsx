"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

/** Log in / Create account switch at the top of the auth card (only on those two pages). */
export function AuthTabs() {
  const path = usePathname(); if (path !== "/login" && path !== "/register") return null;
  const tab = (href: string, label: string) => { const on = path === href;
    return <Link href={href} aria-current={on ? "page" : undefined} className={cn("grid h-9 place-items-center rounded-lg text-sm transition", on ? "bg-surface font-semibold text-brand shadow-sm ring-1 ring-brand/25" : "text-muted hover:text-fg")}>{label}</Link>; };
  return <nav aria-label="Log in or create an account" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface2/60 p-1">{tab("/login", "Log in")}{tab("/register", "Create account")}</nav>;
}
