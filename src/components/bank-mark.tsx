"use client";
import { useState } from "react";
import { Landmark } from "lucide-react";
import { bankFromName, bankHue, bankLogoUrl } from "@/lib/banks";
import { cn } from "./ui";

/** Tile for a bank or account: the bank's own icon when we can match the name and the icon loads, otherwise the coloured building. */
export function BankMark({ label, className, iconSize = 16 }: { label: string; className?: string; iconSize?: number }) {
  const [bad, setBad] = useState(false); const bank = bankFromName(label); const logo = bank ? bankLogoUrl(bank.id) : undefined;
  if (logo && !bad) return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-white ring-1 ring-black/10", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} className="h-3/5 w-3/5 object-contain" /></span>);
  return <span className={cn("grid shrink-0 place-items-center text-white", className)} style={{ background: `hsl(${bankHue(label)} 60% 45%)` }}><Landmark size={iconSize} aria-hidden /></span>;
}
