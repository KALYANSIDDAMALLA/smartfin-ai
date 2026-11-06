import { describe, it, expect } from "vitest";
import { checkAmount, checkDate, checkName, checkNote, checkReference, cleanMultiline, cleanText, normalizeTags } from "@/lib/validate";

describe("dirty-data validation", () => {
  it("cleans invisible characters and spacing without changing real text", () => {
    expect(cleanText("  Big​   Bazaar\u0000 ")).toBe("Big Bazaar"); expect(cleanMultiline("a\r\n\r\n\r\n\r\nb  c")).toBe("a\n\nb c"); expect(cleanText("ＡＢＣ")).toBe("ABC");
  });
  it("accepts ordinary names, rejects junk", () => {
    for (const ok of ["Ravi", "Sharma & Sons", "Café Coffee Day", "St. Mary's Store", "O'Neil", "Priya (home)", "Tea stall #2", "राम कुमार"]) expect(checkName("Merchant", ok)).toBeNull();
    expect(checkName("Merchant", "")).toBeNull(); expect(checkName("Merchant", "", { required: true })).toMatch(/required/);
    expect(checkName("Merchant", "a")).toMatch(/at least 2/); expect(checkName("Merchant", "x".repeat(81))).toMatch(/longer than 80/);
    expect(checkName("Merchant", "https://evil.example")).toMatch(/link/); expect(checkName("Merchant", "me@upi")).toMatch(/link or email/); expect(checkName("Merchant", "visit shop.com")).toMatch(/link/);
    expect(checkName("Merchant", "98765 43210")).toMatch(/phone/); expect(checkName("Merchant", "1800 4100")).toMatch(/letters|phone/); expect(checkName("Merchant", "12345")).toMatch(/letters/);
    expect(checkName("Merchant", "<script>x</script>")).toMatch(/characters/); expect(checkName("Merchant", "aaaaaaaa")).toMatch(/random/);
    expect(checkName("Merchant", "call 1800 4100 to report", { payee: true })).toBeTruthy(); expect(checkName("Merchant", "Call Me Maybe Cafe", { payee: true })).toMatch(/message/);
  });
  it("checks amounts", () => {
    for (const ok of ["450", "450.50", "₹1,250.50", "0.01"]) expect(checkAmount(ok)).toBeNull();
    expect(checkAmount("")).toMatch(/required/); expect(checkAmount("abc")).toMatch(/number/); expect(checkAmount("0")).toMatch(/greater than 0/); expect(checkAmount("-5")).toBeTruthy();
    expect(checkAmount("1.234")).toMatch(/2 decimal/); expect(checkAmount("999999999999")).toMatch(/crore/); expect(checkAmount("", { required: false })).toBeNull();
  });
  it("checks dates", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(checkDate("2026-10-31T13:15", { now })).toBeNull(); expect(checkDate("2026-11-02T09:00", { now })).toBeNull(); // within timezone slack
    expect(checkDate("2026-12-25T09:00", { now })).toMatch(/future/); expect(checkDate("2026-12-25T09:00", { now, allowFuture: true })).toBeNull(); expect(checkDate("1999-05-01T09:00", { now, allowFuture: true })).toMatch(/2000/); expect(checkDate("1999-05-01T09:00", { now })).toMatch(/2000/); expect(checkDate("nonsense")).toMatch(/valid/); expect(checkDate("")).toMatch(/required/);
  });
  it("normalises tags and reports the unfixable ones", () => {
    expect(normalizeTags("UPI, Kotak Bank; rent,,  upi ,Rent!").tags).toEqual(["upi", "kotak-bank", "rent"]);
    expect(normalizeTags("a, ok").error).toMatch(/2–24/); expect(normalizeTags("x".repeat(30)).error).toMatch(/2–24/);
    expect(normalizeTags(Array.from({ length: 12 }, (_, i) => `tag${i}`).join(",")).error).toMatch(/at most 10/);
  });
  it("checks references and notes", () => {
    expect(checkReference("629312345678")).toBeNull(); expect(checkReference("UTR-ab12/34")).toBeNull(); expect(checkReference("")).toBeNull(); expect(checkReference("12")).toBeTruthy(); expect(checkReference("a b c d")).toBeTruthy();
    expect(checkNote("Notes", "Paid at the counter\nthanks", 100)).toBeNull(); expect(checkNote("Notes", "<b>hi</b>", 100)).toMatch(/HTML/); expect(checkNote("Notes", "x".repeat(101), 100)).toMatch(/longer than 100/); expect(checkNote("Notes", "javascript:alert(1)", 100)).toMatch(/code/);
  });
});

import { txSchema, budgetSchema } from "@/lib/server/validation";
describe("server schemas reject dirty data (authoritative, even if the browser is bypassed)", () => {
  const base = { type: "expense", amount: "450", occurredAt: "2026-10-31T13:15" };
  const issues = (o: Record<string, string>) => { const r = txSchema.safeParse({ ...base, ...o }); return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])); };
  it("accepts a clean entry and normalises it", () => {
    const r = txSchema.safeParse({ ...base, merchant: "  Sharma   Wholesale ", tags: "UPI, Kotak Bank,rent", notes: "line1\r\n\r\n\r\nline2" });
    expect(r.success && r.data).toMatchObject({ amount: 45000, merchant: "Sharma Wholesale", tags: ["upi", "kotak-bank", "rent"], notes: "line1\n\nline2" });
  });
  it("reports each bad field separately", () => {
    expect(issues({ amount: "abc" }).amount).toMatch(/number/); expect(issues({ amount: "-5" }).amount).toBeTruthy(); expect(issues({ amount: "1.999" }).amount).toMatch(/decimal/);
    expect(issues({ merchant: "1800 4100 to report" }).merchant).toBeTruthy(); expect(issues({ merchant: "https://x.co/pay" }).merchant).toMatch(/link/);
    expect(issues({ occurredAt: "2031-01-01T10:00" }).occurredAt).toMatch(/future/); expect(issues({ occurredAt: "garbage" }).occurredAt).toMatch(/valid/);
    expect(issues({ tags: "a,b" }).tags).toMatch(/2–24/); expect(issues({ notes: "<img src=x onerror=alert(1)>" }).notes).toMatch(/HTML/); expect(issues({ externalRef: "x y" }).externalRef).toMatch(/Reference/);
    const many = issues({ amount: "abc", merchant: "ab12345678", tags: "x" }); expect(Object.keys(many).sort()).toEqual(["amount", "merchant", "tags"]);
  });
  it("applies the same cleaning to other forms", () => {
    expect(budgetSchema.safeParse({ name: "Food <b>", period: "monthly", amount: "1000" }).success).toBe(false);
    expect(budgetSchema.safeParse({ name: "  Groceries  & dining ", period: "monthly", amount: "12,000" })).toMatchObject({ success: true, data: { name: "Groceries & dining", amount: 1200000 } });
  });
});
