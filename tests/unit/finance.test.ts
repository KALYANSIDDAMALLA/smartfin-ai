import { describe, it, expect } from "vitest";
import { parseMoney, formatMoney, percent, allocate, sum } from "@/lib/finance/money";
import { summarize, estimatedBalance } from "@/lib/finance/accounting";
import { bucketLabel } from "@/lib/finance/trends";
import { presetRange, customRange, previousRange, localDate, likeForLike } from "@/lib/finance/dates";
import { evaluateBudget, newlyCrossedThresholds, type BudgetDef } from "@/lib/finance/budget";
import { goalProgress, crossedMilestones, estimatedCompletion, monthsBetween } from "@/lib/finance/goals";
import { planSavings } from "@/lib/finance/savings";
import { detectDuplicates } from "@/lib/imports/dedupe";
import type { Tx } from "@/lib/finance/types";

let n = 0;
const tx = (o: Partial<Tx> & Pick<Tx, "type" | "amountMinor">): Tx => ({ id: `t${++n}`, occurredAt: "2026-11-10T06:00:00Z", ...o });
const month = presetRange("month", new Date("2026-11-15T06:00:00Z"));

describe("money", () => {
  it("parses without float error", () => {
    expect(parseMoney("0.10")).toBe(10);
    expect(parseMoney("1,234.5")).toBe(123450);
    expect(parseMoney("₹99")).toBe(9900);
    expect(parseMoney("19.99") + parseMoney("0.01")).toBe(2000);
  });
  it("rejects bad input and sub-paise precision", () => {
    expect(() => parseMoney("abc")).toThrow();
    expect(() => parseMoney("1.005")).toThrow();
  });
  it("formats", () => {
    expect(formatMoney(12345)).toContain("123.45");
    expect(formatMoney(-500)).toMatch(/^-/);
  });
  it("percent uses integer math", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(5, 0)).toBe(0);
  });
  it("allocate preserves total", () => {
    expect(sum(allocate(100, 3))).toBe(100);
    expect(allocate(100, 3)).toEqual([34, 33, 33]);
  });
});

describe("accounting rules", () => {
  it("income vs expense and savings rate", () => {
    const s = summarize([tx({ type: "income", amountMinor: 100000 }), tx({ type: "expense", amountMinor: 30000 })], month);
    expect(s.netCashFlowMinor).toBe(70000);
    expect(s.savingsRatePct).toBe(70);
  });
  it("savings rate is null with no income", () => {
    expect(summarize([tx({ type: "expense", amountMinor: 100 })], month).savingsRatePct).toBeNull();
  });
  it("credit card purchase is expense; bill repayment (transfer) is not a second expense", () => {
    const s = summarize([
      tx({ type: "expense", amountMinor: 50000, paymentMethod: "credit_card" }),
      tx({ type: "transfer", amountMinor: 50000, fromAccountId: "bank", toAccountId: "card" }),
    ], month);
    expect(s.netExpenseMinor).toBe(50000);
  });
  it("own-account transfers are neither income nor expense", () => {
    const s = summarize([tx({ type: "transfer", amountMinor: 99999, fromAccountId: "a", toAccountId: "b" })], month);
    expect(s.incomeMinor + s.netExpenseMinor).toBe(0);
  });
  it("refunds reduce net expense, inheriting category/channel, even from earlier period", () => {
    const orig = tx({ type: "expense", amountMinor: 20000, categoryId: "shop", channel: "online", occurredAt: "2026-10-20T06:00:00Z" });
    const cur = tx({ type: "expense", amountMinor: 10000, categoryId: "shop", channel: "online" });
    const ref = tx({ type: "refund", amountMinor: 5000, refundOfId: orig.id });
    const s = summarize([orig, cur, ref], month);
    expect(s.netExpenseMinor).toBe(5000);
    expect(s.byCategory.shop).toBe(5000);
    expect(s.onlineMinor).toBe(5000);
  });
  it("adjustments don't hit income/expense but change balance", () => {
    const a = tx({ type: "adjustment", amountMinor: 700, direction: "out", fromAccountId: "acc" });
    expect(summarize([a], month).netExpenseMinor).toBe(0);
    expect(estimatedBalance([a], "acc", 1000)).toBe(300);
  });
  it("estimated balance across transfer and expense", () => {
    const t = [tx({ type: "transfer", amountMinor: 400, fromAccountId: "a", toAccountId: "b" }), tx({ type: "expense", amountMinor: 100, fromAccountId: "a" })];
    expect(estimatedBalance(t, "a", 1000)).toBe(500);
    expect(estimatedBalance(t, "b", 0)).toBe(400);
  });
  it("splits online/offline", () => {
    const s = summarize([tx({ type: "expense", amountMinor: 100, channel: "online" }), tx({ type: "expense", amountMinor: 50, channel: "offline" })], month);
    expect([s.onlineMinor, s.offlineMinor]).toEqual([100, 50]);
  });
});

describe("dates & timezones", () => {
  it("IST day boundary: 18:31 UTC is next local day", () => {
    expect(localDate("2026-11-10T18:31:00Z")).toBe("2026-11-11");
    expect(localDate("2026-11-10T18:29:00Z")).toBe("2026-11-10");
  });
  it("month range is half-open in IST", () => {
    const edge = tx({ type: "expense", amountMinor: 1, occurredAt: "2026-10-31T18:30:00Z" }); // = Nov 1 00:00 IST
    const before = tx({ type: "expense", amountMinor: 1, occurredAt: "2026-10-31T18:29:59Z" });
    const s = summarize([edge, before], month);
    expect(s.grossExpenseMinor).toBe(1);
  });
  it("week starts Monday", () => {
    const r = presetRange("week", new Date("2026-11-01T06:00:00Z")); // Sunday
    expect(localDate(r.start)).toBe("2026-10-26");
  });
  it("custom range inclusive and previous month wraps year", () => {
    const r = customRange("2026-01-01", "2026-01-31");
    expect(localDate(new Date(r.end.getTime() - 1))).toBe("2026-01-31");
    const p = previousRange(presetRange("month", new Date("2026-01-15T00:00:00Z")), "month");
    expect(localDate(p.start)).toBe("2025-12-01");
  });
});

describe("budgets", () => {
  const b: BudgetDef = { id: "b", amountMinor: 10000, period: "monthly", categoryId: "food", alertThresholds: [50, 75, 90, 100] };
  it("computes net of refunds, category-scoped", () => {
    const e = tx({ type: "expense", amountMinor: 8000, categoryId: "food" });
    const r = tx({ type: "refund", amountMinor: 2000, refundOfId: e.id });
    const other = tx({ type: "expense", amountMinor: 99999, categoryId: "rent" });
    const ev = evaluateBudget(b, [e, r, other], month);
    expect(ev.spentMinor).toBe(6000);
    expect(ev.pctUsed).toBe(60);
    expect(ev.remainingMinor).toBe(4000);
    expect(ev.status).toBe("on_track");
  });
  it("overspend yields negative remaining and exceeded", () => {
    const ev = evaluateBudget(b, [tx({ type: "expense", amountMinor: 12000, categoryId: "food" })], month);
    expect(ev.status).toBe("exceeded");
    expect(ev.remainingMinor).toBe(-2000);
  });
  it("channel budgets", () => {
    const ob: BudgetDef = { ...b, categoryId: null, channel: "online" };
    const ev = evaluateBudget(ob, [tx({ type: "expense", amountMinor: 500, channel: "online" }), tx({ type: "expense", amountMinor: 900, channel: "offline" })], month);
    expect(ev.spentMinor).toBe(500);
  });
  it("alerts fire once per threshold", () => {
    expect(newlyCrossedThresholds(80, [50, 75, 90, 100], [])).toEqual([50, 75]);
    expect(newlyCrossedThresholds(80, [50, 75, 90, 100], [50, 75])).toEqual([]);
    expect(newlyCrossedThresholds(100, [50, 75, 90, 100], [50, 75])).toEqual([90, 100]);
  });
});

describe("goals", () => {
  const g = { targetMinor: 100000, contributedMinor: 25000, targetDate: "2027-05-01", status: "active" as const };
  it("progress and required monthly", () => {
    const p = goalProgress(g, "2026-11-01");
    expect(p.pct).toBe(25);
    expect(p.remainingMinor).toBe(75000);
    expect(p.monthsLeft).toBe(6);
    expect(p.requiredMonthlyMinor).toBe(12500);
    expect(p.reachedMilestones).toEqual([25]);
  });
  it("over-contribution caps pct at 100", () => {
    expect(goalProgress({ ...g, contributedMinor: 150000 }, "2026-11-01").pct).toBe(100);
  });
  it("milestone crossing reports only new milestones", () => {
    expect(crossedMilestones(100000, 20000, 80000)).toEqual([25, 50, 75]);
    expect(crossedMilestones(100000, 80000, 90000)).toEqual([]);
  });
  it("estimated completion; none when paused or no pace", () => {
    expect(estimatedCompletion(g, 25000, "2026-11-01")).toBe("2027-02-01");
    expect(estimatedCompletion(g, 0, "2026-11-01")).toBeNull();
    expect(estimatedCompletion({ ...g, status: "paused" }, 1000, "2026-11-01")).toBeNull();
  });
  it("goal contributions are not expenses (not in transaction summary)", () => {
    expect(summarize([], month).netExpenseMinor).toBe(0);
  });
  it("monthsBetween", () => { expect(monthsBetween("2026-11-15", "2026-11-10")).toBe(0); });
});

describe("savings planner", () => {
  it("caps recommendation at realistic availability", () => {
    const p = planSavings({ monthlyIncomeMinor: 100000, essentialMinor: 50000, discretionaryMinor: 30000, commitmentsMinor: 10000, goalsRequiredMonthlyMinor: [20000, 20000] });
    expect(p.surplusMinor).toBe(10000);
    expect(p.availableMonthlyMinor).toBe(13000);
    expect(p.recommendedMonthlyMinor).toBe(13000);
    expect(p.shortfallMonthlyMinor).toBe(27000);
    expect(p.yearlyProjectionMinor).toBe(156000);
  });
  it("deficit flagged; no negative recommendations", () => {
    const p = planSavings({ monthlyIncomeMinor: 10000, essentialMinor: 20000, discretionaryMinor: 0, commitmentsMinor: 0, goalsRequiredMonthlyMinor: [5000] });
    expect(p.isDeficit).toBe(true);
    expect(p.recommendedMonthlyMinor).toBe(0);
  });
});

describe("import duplicate detection", () => {
  const ex = [{ amountMinor: 25000, occurredAt: "2026-11-10T06:00:00Z", merchant: "Swiggy", externalRef: "R1" }];
  it("detects by external ref, fingerprint (normalized) and within batch", () => {
    const r = detectDuplicates([
      { amountMinor: 1, occurredAt: "2026-11-01T00:00:00Z", externalRef: "R1" },
      { amountMinor: 25000, occurredAt: "2026-11-10T09:00:00Z", merchant: "SWIGGY!" },
      { amountMinor: 700, occurredAt: "2026-11-11T00:00:00Z", merchant: "Cafe" },
      { amountMinor: 700, occurredAt: "2026-11-11T00:00:00Z", merchant: "cafe" },
    ], ex);
    expect(r.map((x) => x.reason)).toEqual(["external_ref", "fingerprint", undefined, "within_batch"]);
  });
});

import { trend, lastKeys, bucketKey } from "@/lib/finance/trends";
describe("trends", () => {
  const mk = (id: string, type: "income" | "expense" | "refund" | "transfer", amountMinor: number, occurredAt: string) => ({ id, type, amountMinor, occurredAt } as never);
  it("buckets by IST day, nets refunds, ignores transfers", () => {
    const txs = [mk("1", "income", 100000, "2026-10-31T20:00:00Z"), mk("2", "expense", 30000, "2026-11-01T10:00:00Z"), mk("3", "refund", 5000, "2026-11-01T11:00:00Z"), mk("4", "transfer", 99999, "2026-11-01T11:00:00Z")];
    const r = trend(txs, "daily", "Asia/Kolkata", ["2026-11-01"]);
    expect(r[0]).toMatchObject({ incomeMinor: 100000, expenseMinor: 25000, netMinor: 75000 }); // 20:00Z Oct 31 = Nov 1 IST
  });
  it("weekly keys use Monday; lastKeys ordered", () => {
    expect(bucketKey("2026-11-01T10:00:00Z", "weekly", "Asia/Kolkata")).toBe("2026-10-26");
    expect(lastKeys(new Date("2026-11-01T10:00:00Z"), "monthly", 3, "Asia/Kolkata")).toEqual(["2026-09", "2026-10", "2026-11"]);
  });
});

import { detectMapping, applyMapping, parseDate, parseStatementText, sniffKind } from "@/lib/imports/parse";
describe("import parsing", () => {
  it("parses Indian date formats and rejects impossible dates", () => {
    expect(parseDate("05/11/2026")).toBe("2026-11-04T18:30:00.000Z");
    expect(parseDate("2026-11-05")).toBe("2026-11-04T18:30:00.000Z");
    expect(parseDate("5 Nov 2026")).toBe("2026-11-04T18:30:00.000Z");
    expect(parseDate("31/02/2026")).toBeNull(); expect(parseDate("garbage")).toBeNull();
  });
  it("maps debit/credit columns and signed amounts", () => {
    const map = detectMapping(["Txn Date", "Narration", "Withdrawal Amt.", "Deposit Amt.", "Ref No"]);
    expect(applyMapping({ "Txn Date": "01/11/2026", Narration: "Swiggy", "Withdrawal Amt.": "1,250.50", "Deposit Amt.": "", "Ref No": "X1" }, map)).toMatchObject({ amountMinor: 125050, txType: "expense", externalRef: "X1" });
    expect(applyMapping({ "Txn Date": "01/11/2026", Narration: "Salary", "Withdrawal Amt.": "", "Deposit Amt.": "50000", "Ref No": "" }, map)).toMatchObject({ amountMinor: 5000000, txType: "income" });
    const m2 = detectMapping(["Date", "Description", "Amount"]);
    expect(applyMapping({ Date: "01/11/2026", Description: "x", Amount: "-99.00" }, m2)).toMatchObject({ amountMinor: 9900, txType: "expense" });
  });
  it("flags unparseable rows with low confidence and nulls", () => {
    const r = applyMapping({ Date: "??", Description: "", Amount: "abc" }, detectMapping(["Date", "Description", "Amount"]));
    expect(r.occurredAt).toBeNull(); expect(r.amountMinor).toBeNull(); expect(r.confidence).toBeLessThan(0.6);
  });
  it("extracts PDF text rows and sniffs file types", () => {
    expect(parseStatementText("01/11/2026 UPI-SWIGGY 450.00 Dr 10,000.00 Cr\nheader line")).toEqual([{ Date: "01/11/2026", Description: "UPI-SWIGGY", Amount: "450.00 Dr" }]);
    expect(sniffKind(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "pdf")).toBe("pdf");
    expect(sniffKind(new Uint8Array([0x4d, 0x5a, 0, 0]), "pdf")).toBeNull();
    expect(sniffKind(new Uint8Array([0x4d, 0x5a, 0, 0]), "csv")).toBeNull(); // NUL byte => binary
  });
});

import { parseBankMessage, findDate } from "@/lib/imports/sms";
describe("bank SMS parsing", () => {
  it("UPI debit with VPA, date and reference", () => {
    const r = parseBankMessage("Rs.450.00 debited from A/c XX1234 on 01-11-26 to VPA swiggy@icici (UPI Ref No 312345678901). Not you? Call 1800");
    expect(r).toMatchObject({ ok: true, type: "expense", amount: "450.00", date: "2026-11-01", merchant: "swiggy", methodCode: "upi", channel: "online", ref: "312345678901" });
  });
  it("card spend with merchant after 'at'", () => {
    const r = parseBankMessage("INR 1,250.50 spent on HDFC Bank Credit Card XX4321 at AMAZON PAY on 05-Nov-26. Avl limit INR 50,000");
    expect(r).toMatchObject({ ok: true, type: "expense", amount: "1250.50", date: "2026-11-05", merchant: "Amazon Pay", methodCode: "credit_card" });
  });
  it("credit is income; refunds treated as incoming", () => {
    expect(parseBankMessage("Rs 50000.00 credited to A/c XX1234 on 01/11/2026 by NEFT from ACME PVT LTD. Avl bal Rs 60000")).toMatchObject({ ok: true, type: "income", amount: "50000.00", methodCode: "neft" });
  });
  it("rejects OTPs and unparseable text", () => {
    expect(parseBankMessage("123456 is your OTP for login. Do not share with anyone.").ok).toBe(false);
    expect(parseBankMessage("Hello there, your statement is ready to view online").ok).toBe(false);
    expect(parseBankMessage("Your account was debited recently, please check").reason).toMatch(/amount/);
  });
  it("findDate rejects impossible dates", () => { expect(findDate("on 31-02-26")).toBeUndefined(); expect(findDate("on 15/08/2026")).toBe("2026-08-15"); });
});

import { extractAATransactions } from "@/lib/integrations/aa-map";
describe("account aggregator mapping", () => {
  const session = { fips: [
    { fipID: "Setu-FIP", accounts: [{ maskedAccNumber: "XXXXXX4373", status: "DELIVERED", data: { account: { transactions: { transaction: [
      { txnId: "T1", type: "DEBIT", mode: "UPI", amount: "450.00", narration: "UPI/DR/412345/SWIGGY/ICIC", transactionTimestamp: "2026-10-31T20:00:00+00:00" },
      { txnId: "T2", type: "CREDIT", amount: "50000", narration: "SALARY", valueDate: "2026-10-30" },
      { txnId: "T3", type: "DEBIT", amount: "0", narration: "bad", valueDate: "2026-10-30" },
      { txnId: "T4", type: "WEIRD", amount: "5", narration: "bad", valueDate: "2026-10-30" },
    ] } } } }] },
    { fipID: "ACME", accounts: [{ maskedAccNumber: "XXXX1111", FIstatus: "FAILED", data: null }] },
  ] };
  it("maps debits/credits, skips malformed rows, counts failed accounts", () => {
    const r = extractAATransactions(session);
    expect(r.rows).toHaveLength(2); expect(r.skipped).toBe(2); expect(r.failedAccounts).toBe(1);
    expect(r.rows[0]).toMatchObject({ Date: "2026-10-31", Debit: "450.00", Credit: "", Reference: "XXXXXX4373-T1" });
    expect(r.rows[1]).toMatchObject({ Credit: "50000.00", Debit: "" });
  });
  it("tolerates empty or missing payloads", () => { expect(extractAATransactions(null).rows).toEqual([]); expect(extractAATransactions({ fips: null }).rows).toEqual([]); });
});

import { vi, afterEach } from "vitest";
describe("setu client request shaping", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("sends credentials as headers, never in the URL, and parses provider errors", async () => {
    vi.stubEnv("SETU_CLIENT_ID", "cid"); vi.stubEnv("SETU_CLIENT_SECRET", "sec"); vi.stubEnv("SETU_PRODUCT_INSTANCE_ID", "pid");
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return calls.length === 1 ? new Response(JSON.stringify({ id: "c1", url: "https://consent", status: "PENDING" }), { status: 200 }) : new Response(JSON.stringify({ errorCode: "NotFound", errorMsg: "Consent not found" }), { status: 404 }); }));
    const { createConsent, getConsent, SetuError } = await import("@/lib/integrations/setu");
    const c = await createConsent({ vua: "9876543210", from: new Date("2025-11-01"), to: new Date("2026-11-01"), months: 12 });
    expect(c.id).toBe("c1"); expect(calls[0].url).toBe("https://fiu-sandbox.setu.co/v2/consents"); expect(calls[0].url).not.toContain("sec");
    expect(calls[0].init.headers).toMatchObject({ "x-client-id": "cid", "x-client-secret": "sec", "x-product-instance-id": "pid" });
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ vua: "9876543210", consentDuration: { unit: "MONTH", value: "12" } });
    await expect(getConsent("zzz")).rejects.toMatchObject({ status: 404, code: "NotFound" });
    expect(SetuError).toBeDefined();
  });
  it("refuses to call when credentials are missing", async () => {
    const { createConsent } = await import("@/lib/integrations/setu");
    await expect(createConsent({ vua: "1", from: new Date(), to: new Date(), months: 1 })).rejects.toMatchObject({ code: "NotConfigured" });
  });
});

import { baseScale, clampOffset, rezoomOffset, sourceRect } from "@/lib/avatar-crop";
describe("avatar crop geometry", () => {
  const V = 280;
  it("base scale covers the viewport for wide and tall images", () => {
    expect(baseScale(1400, 700, V)).toBeCloseTo(0.4); expect(baseScale(700, 1400, V)).toBeCloseTo(0.4); expect(baseScale(100, 100, V)).toBeCloseTo(2.8);
  });
  it("clamps so no empty edges show", () => {
    const dw = 560, dh = 280; // 2:1 image at cover scale
    expect(clampOffset(50, 50, dw, dh, V)).toEqual({ x: 0, y: 0 });
    expect(clampOffset(-999, -999, dw, dh, V)).toEqual({ x: V - dw, y: 0 });
  });
  it("zooming keeps the centre point fixed", () => {
    const s0 = 0.4, s1 = 0.8, w = 1400, h = 700;
    const o0 = { x: -140, y: 0 }; const o1 = rezoomOffset(o0.x, o0.y, s0, s1, w, h, V);
    const c0 = (V / 2 - o0.x) / s0, c1 = (V / 2 - o1.x) / s1; expect(c1).toBeCloseTo(c0);
  });
  it("source rect matches what the viewport shows", () => {
    const r = sourceRect(-140, 0, 0.4, V); expect(r.sx).toBeCloseTo(350); expect(r.sy).toBeCloseTo(0); expect(r.size).toBeCloseTo(700);
  });
});

import { suggestFromHistory, suggestFromRules, methodFromText } from "@/lib/finance/suggest";
describe("expense auto-fill suggestions", () => {
  const cats = [{ id: "c-food", name: "Food and groceries", kind: "expense" }, { id: "c-trans", name: "Transportation", kind: "expense" }, { id: "c-sal", name: "Salary", kind: "income" }];
  it("history: learns the usual category/method for a merchant and scales confidence with evidence", () => {
    const h = [1, 2, 3, 4].map(() => ({ merchant: "Swiggy", categoryId: "c-food", paymentMethodId: "m-upi", channel: "online" as const }));
    expect(suggestFromHistory(h, "swiggy order")).toMatchObject({ categoryId: "c-food", paymentMethodId: "m-upi", channel: "online", source: "history" });
    expect(suggestFromHistory(h, "swiggy")!.confidence).toBeGreaterThan(0.9);
    expect(suggestFromHistory(h.slice(0, 1), "swiggy")!.confidence).toBeLessThan(0.75);
  });
  it("history: conflicting past categories lower confidence; unknown merchants give nothing", () => {
    const h = [{ merchant: "Amazon", categoryId: "a" }, { merchant: "Amazon", categoryId: "b" }, { merchant: "Amazon", categoryId: "a" }];
    expect(suggestFromHistory(h, "amazon")!.confidence).toBeLessThan(0.7);
    expect(suggestFromHistory(h, "zzz store")).toBeNull();
  });
  it("rules map known merchants to the user's own categories and respect income vs expense", () => {
    expect(suggestFromRules("Zomato dinner", cats, "expense")).toMatchObject({ categoryId: "c-food", source: "rules" });
    expect(suggestFromRules("uber to office", cats, "expense")?.categoryId).toBe("c-trans");
    expect(suggestFromRules("October salary", cats, "income")?.categoryId).toBe("c-sal");
    expect(suggestFromRules("October salary", cats, "expense")).toBeNull();
    expect(suggestFromRules("random shop", cats, "expense")).toBeNull();
  });
  it("reads a payment method mentioned in the text", () => {
    const m = [{ id: "m-upi", code: "upi" }, { id: "m-cash", code: "cash" }];
    expect(methodFromText("tea stall cash", m)).toBe("m-cash"); expect(methodFromText("bills via UPI", m)).toBe("m-upi"); expect(methodFromText("bills", m)).toBeUndefined();
  });
});

import { groundedRewrite } from "@/lib/server/assistant";
describe("AI answer grounding", () => {
  it("accepts a rewrite that only reuses verified numbers", () => { expect(groundedRewrite("You spent ₹1,250.50 on Food in 2026-11-01 to 2026-11-30.", "Nice and steady: ₹1250.5 went to Food (1 to 30 Nov 2026).")).not.toBeNull(); });
  it("rejects a rewrite that invents or changes a number", () => { expect(groundedRewrite("You spent ₹450.", "You spent ₹540.")).toBeNull(); expect(groundedRewrite("You spent ₹450.", "You spent ₹450, about 20% more.")).toBeNull(); });
});

import { validateExtract, mergeSmart } from "@/lib/imports/smart";
import { parseBankMessage as pbm } from "@/lib/imports/sms";
describe("AI free-text reader safeguards", () => {
  const ctx = { today: "2026-11-01", methods: [{ id: "m-upi", code: "upi", label: "UPI", channel: "online" as const }, { id: "m-cash", code: "cash", label: "Cash", channel: "offline" as const }], categories: [{ id: "c-food", name: "Food and groceries", kind: "expense" }, { id: "c-sal", name: "Salary", kind: "income" }] };
  const text = "paid 250 to Ravi for lunch yesterday via cash";
  it("keeps verifiable fields and drops invented ones", () => {
    const ok = validateExtract({ type: "expense", amount: 250, date: "2026-10-31", merchant: "Ravi", description: "Lunch", method: "cash", category: "food and groceries", reference: "ZZ99" }, text, ctx);
    expect(ok).toMatchObject({ type: "expense", amount: "250.00", date: "2026-10-31", merchant: "Ravi", methodId: "m-cash", channel: "offline", categoryId: "c-food" }); expect(ok.ref).toBeUndefined();
    expect(validateExtract({ type: "expense", amount: 520 }, text, ctx).amount).toBeUndefined(); // 520 is not in the text
    expect(validateExtract({ amount: 250, date: "2031-01-01", method: "bitcoin", category: "Yachts" }, text, ctx)).toMatchObject({ amount: "250.00" });
    const bad = validateExtract({ amount: 250, date: "2031-01-01", method: "bitcoin", category: "Yachts" }, text, ctx); expect(bad.date).toBeUndefined(); expect(bad.methodId).toBeUndefined(); expect(bad.categoryId).toBeUndefined();
  });
  it("free text the exact reader can't parse is accepted only with verified essentials", () => {
    const local = pbm(text); const ai = validateExtract({ type: "expense", amount: 250, date: "2026-10-31", merchant: "Ravi", method: "cash", category: "Food and groceries" }, text, ctx);
    const r = mergeSmart(local, ai, ctx); expect(r).toMatchObject({ ok: true, type: "expense", amount: "250.00", usedAI: true, confidence: "medium", categoryId: "c-food" });
    expect(mergeSmart(local, validateExtract({ type: "expense", amount: 999 }, text, ctx), ctx).ok).toBe(false);
  });
  it("the exact reader wins on amount; AI fills merchant/category on a bank SMS", () => {
    const sms = "Rs.450.00 debited from A/c XX1234 on 01-11-26 to VPA swiggy@icici (UPI Ref No 312345678901)";
    const r = mergeSmart(pbm(sms), validateExtract({ type: "expense", amount: 460, merchant: "Swiggy", category: "Food and groceries" }, sms, ctx), ctx);
    expect(r).toMatchObject({ amount: "450.00", categoryId: "c-food", methodId: "m-upi", confidence: "high" }); expect(r.notes.length).toBe(0);
  });
});

import { parseSearchQuery, searchHref } from "@/lib/finance/search";
import { detectRecurring, suggestBudgets, isUnusual, quickInsights } from "@/lib/finance/automation";
describe("smart search + automation", () => {
  const ctx = { categories: [{ id: "c-food", name: "Food and groceries", kind: "expense" }, { id: "c-ent", name: "Entertainment", kind: "expense" }], methods: [{ id: "m-upi", code: "upi", label: "UPI", channel: "online" as const }, { id: "m-cash", code: "cash", label: "Cash", channel: "offline" as const }], today: new Date("2026-11-15T06:00:00Z") };
  it("turns plain English into filters", () => {
    const p = parseSearchQuery("swiggy over 500 last month via upi", ctx);
    expect(p).toMatchObject({ q: "swiggy", min: 500, method: "m-upi", from: "2026-10-01", to: "2026-10-31" });
    const g = parseSearchQuery("groceries this year cash", ctx); expect(g).toMatchObject({ cat: "c-food", method: "m-cash", from: "2026-01-01", to: "2026-12-31", q: "" });
    expect(parseSearchQuery("income last 7 days", ctx)).toMatchObject({ type: "income", from: "2026-11-09", to: "2026-11-15" });
    expect(searchHref(p)).toContain("range=custom"); expect(searchHref(p)).toContain("min=500"); expect(parseSearchQuery("netflix", ctx)).toMatchObject({ q: "netflix", chips: [] });
  });
  const mk = (id: string, merchant: string, amt: number, iso: string, type: "expense" | "income" = "expense") => ({ id, type, merchant, amountMinor: amt, occurredAt: iso } as never);
  it("detects monthly subscriptions and skips ones you already track", () => {
    const txs = ["2026-08-07", "2026-09-07", "2026-10-07"].map((d, i) => mk("n" + i, "Netflix", 64900, d + "T10:00:00Z")).concat(["2026-08-02", "2026-09-20", "2026-10-11"].map((d, i) => mk("x" + i, "Random", 5000 + i * 3000, d + "T10:00:00Z")));
    const r = detectRecurring(txs, [], new Date("2026-11-01T00:00:00Z")); expect(r).toHaveLength(1); expect(r[0]).toMatchObject({ name: "Netflix", frequency: "monthly", amountMinor: 64900, count: 3, nextDue: "2026-11-06" });
    expect(detectRecurring(txs, ["netflix"], new Date("2026-11-01T00:00:00Z"))).toHaveLength(0);
  });
  it("suggests budgets from 90-day averages and flags unusual spend", () => {
    const now = new Date("2026-11-01T00:00:00Z"); const t = [mk("a", "x", 900000, "2026-10-10T00:00:00Z"), mk("b", "x", 900000, "2026-09-10T00:00:00Z"), mk("c", "x", 900000, "2026-08-10T00:00:00Z")].map((x) => Object.assign({}, x as object, { categoryId: "c-food" }));
    expect(suggestBudgets(t as never, [{ id: "c-food", name: "Food and groceries" }], [], now)).toEqual([{ categoryId: "c-food", name: "Food and groceries", amountMinor: 950000, avgMinor: 900000 }]);
    expect(suggestBudgets(t as never, [], ["c-food"], now)).toEqual([]);
    expect(isUnusual(1500000, [200000, 250000, 180000, 220000])).toMatchObject({ unusual: true }); expect(isUnusual(300000, [200000, 250000, 180000])).toMatchObject({ unusual: false }); expect(isUnusual(900000, [100000, 100000])).toMatchObject({ unusual: false });
  });
  it("quick insights use only supplied numbers", () => {
    const i = quickInsights({ incomeMinor: 100000, netExpenseMinor: 80000, savingsRatePct: 20, byCategory: { f: 50000, s: 30000 } }, { netExpenseMinor: 50000, byCategory: { f: 20000, s: 30000 } }, (id) => (id === "f" ? "Food" : "Shopping"), (m) => `₹${m / 100}`);
    expect(i.map((x) => x.text).join(" | ")).toMatch(/Food is your biggest spend: ₹500 \(63%/); expect(i.some((x) => /60% higher/.test(x.text))).toBe(true); expect(i.some((x) => /Food rose 100%\+ versus/.test(x.text))).toBe(true); // a 150% rise is shown as 100%+ (percentages are capped at 100)
  });
});

describe("like-for-like comparison", () => {
  const tz = "Asia/Kolkata";
  it("compares a month 1 day in with the first day of the previous month, not the whole month", () => {
    const now = new Date("2026-11-01T10:00:00+05:30");
    const cur = presetRange("month", now, tz), prev = previousRange(cur, "month", tz);
    const lfl = likeForLike(cur, prev, now);
    expect(lfl.start.getTime()).toBe(prev.start.getTime());
    expect(lfl.end.getTime() - lfl.start.getTime()).toBe(now.getTime() - cur.start.getTime());
    expect(lfl.end.getTime()).toBeLessThan(prev.end.getTime());
  });
  it("never extends past the previous period (31-day month vs 28-day month)", () => {
    const now = new Date("2026-03-31T23:00:00+05:30");
    const cur = presetRange("month", now, tz), prev = previousRange(cur, "month", tz);
    expect(likeForLike(cur, prev, now).end.getTime()).toBe(prev.end.getTime());
  });
  it("leaves a finished period unchanged", () => {
    const cur = customRange("2026-09-01", "2026-09-30", tz), prev = previousRange(cur, "custom", tz);
    expect(likeForLike(cur, prev, new Date("2026-11-01T10:00:00+05:30"))).toEqual(prev);
  });
});

describe("bucket labels", () => {
  it("names the month and the week of the month", () => {
    expect(bucketLabel("2026-11", "monthly")).toBe("Nov 2026");
    expect(bucketLabel("2026-10-26", "weekly")).toBe("Wk 4 · 26 Oct");
    expect(bucketLabel("2026-11-02", "weekly")).toBe("Wk 1 · 2 Nov");
    expect(bucketLabel("2026-11-01", "daily")).toBe("1 Nov");
  });
});

import { evaluate, emi, gst } from "@/lib/calc";
import { monthGrid, occurrences, shiftMonth, dayTotals } from "@/lib/finance/calendar";
describe("calculator", () => {
  it("evaluates with precedence, brackets, decimals and unary minus", () => {
    expect(evaluate("2+3*4")).toBe(14); expect(evaluate("(2+3)*4")).toBe(20); expect(evaluate("₹1,250.50 + 249.50")).toBe(1500);
    expect(evaluate("-5+10")).toBe(5); expect(evaluate("0.1+0.2")).toBe(0.3); expect(evaluate("12×3÷4")).toBe(9);
  });
  it("handles percentages", () => { expect(evaluate("200+10%")).toBe(220); expect(evaluate("200-10%")).toBe(180); expect(evaluate("50*10%")).toBe(5); expect(evaluate("50%")).toBe(0.5); });
  it("rejects bad input instead of guessing", () => {
    for (const bad of ["", "2+", "2**3", "abc", "(2+3", "1/0", "2;alert(1)"]) expect(() => evaluate(bad)).toThrow();
  });
  it("computes EMI and GST", () => {
    const e = emi(1_000_000, 9, 120); expect(Math.round(e.monthly)).toBe(12668); expect(e.total).toBeCloseTo(e.monthly * 120);
    expect(emi(120_000, 0, 12).monthly).toBe(10_000);
    const g = gst(1000, 18, "exclusive"); expect(g.tax).toBe(180); expect(g.gross).toBe(1180); expect(g.cgst).toBe(90);
    const h = gst(1180, 18, "inclusive"); expect(Math.round(h.net)).toBe(1000); expect(Math.round(h.tax)).toBe(180);
  });
});
describe("calendar", () => {
  it("builds Monday-first weeks for the month", () => {
    const g = monthGrid("2026-11"); expect(g[0][0].ymd).toBe("2026-10-26"); expect(g[0][0].inMonth).toBe(false); expect(g[0][6].ymd).toBe("2026-11-01"); expect(g[0][6].inMonth).toBe(true);
    expect(g.every((w) => w.length === 7)).toBe(true); expect(g.flat().filter((d) => d.inMonth)).toHaveLength(30);
  });
  it("shifts months across years", () => { expect(shiftMonth("2026-01", -1)).toBe("2025-12"); expect(shiftMonth("2026-12", 1)).toBe("2027-01"); });
  it("expands recurring due dates, clamping month ends", () => {
    expect(occurrences({ nextDue: "2026-01-31", frequency: "monthly" }, "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrences({ nextDue: "2026-11-02", frequency: "weekly" }, "2026-11-01", "2026-11-30")).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
    expect(occurrences({ nextDue: "2026-12-05", frequency: "monthly" }, "2026-11-01", "2026-11-30")).toEqual([]);
    expect(occurrences({ nextDue: "2026-03-15", frequency: "quarterly" }, "2026-06-01", "2026-06-30")).toEqual(["2026-06-15"]);
  });
  it("totals per local day, refunds reduce spend, transfers ignored", () => {
    const base = { categoryId: null, merchant: null, paymentMethod: null, channel: null, fromAccountId: null, toAccountId: null, refundOfId: null, direction: null, description: null, externalRef: null };
    const t = (id: string, type: Tx["type"], amountMinor: number, occurredAt: string): Tx => ({ ...base, id, type, amountMinor, occurredAt });
    const r = dayTotals([t("1", "expense", 1000, "2026-10-31T20:00:00Z"), t("2", "refund", 300, "2026-10-31T20:30:00Z"), t("3", "income", 5000, "2026-11-01T05:00:00Z"), t("4", "transfer", 900, "2026-11-01T06:00:00Z")], "Asia/Kolkata");
    expect(r["2026-11-01"]).toEqual({ incomeMinor: 5000, expenseMinor: 700, count: 3 }); // 20:00Z = 01:30 IST next day
  });
});
