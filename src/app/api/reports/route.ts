import { NextResponse, type NextRequest } from "next/server";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { resolveRange } from "@/lib/server/range";
import { buildReport, reportName, toCsv, toPdf, toXlsx } from "@/lib/server/reports";

export const runtime = "nodejs";
/** Reports are generated on demand from the caller's own rows (RLS-scoped). There are no report IDs/URLs to guess. */
export async function GET(req: NextRequest) {
  const a = await getUserOrNull(); if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`report:${a.user.id}`, 20, 10 * 60_000).ok) return NextResponse.json({ error: "Too many exports" }, { status: 429 });
  const sp = Object.fromEntries(req.nextUrl.searchParams); const format = sp.format;
  if (!["csv", "xlsx", "pdf"].includes(format)) return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  const { data: prof } = await a.supabase.from("profiles").select("timezone,currency").eq("id", a.user.id).single();
  const { range } = resolveRange(sp, prof?.timezone ?? "Asia/Kolkata");
  const rep = await buildReport(a.supabase, range, prof?.currency ?? "INR");
  const h = (type: string, ext: string) => ({ "Content-Type": type, "Content-Disposition": `attachment; filename="${reportName(range, ext)}"`, "Cache-Control": "private, no-store" });
  if (format === "csv") return new NextResponse(toCsv(rep), { headers: h("text/csv; charset=utf-8", "csv") });
  if (format === "xlsx") return new NextResponse(new Uint8Array(toXlsx(rep)), { headers: h("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx") });
  return new NextResponse(new Uint8Array(await toPdf(rep, range)), { headers: h("application/pdf", "pdf") });
}
