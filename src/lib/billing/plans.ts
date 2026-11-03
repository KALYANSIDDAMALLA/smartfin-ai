/**
 * Plans. The browser never sends an amount: it sends a plan code, and the server looks the price up here.
 * Prices are in paise (minor units). Override with PRO_MONTHLY_PRICE_INR / PRO_YEARLY_PRICE_INR (whole rupees) without a code change.
 * Everyone is on "free" until PAYMENTS_ENABLED=true; nothing in the app is gated yet.
 */
export type PlanCode = "pro_monthly" | "pro_yearly";
export interface PaidPlan { code: PlanCode; label: string; amountMinor: number; periodDays: number; per: string }

const rupees = (env: string | undefined, fallback: number) => { const n = Number(env); return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : fallback; };

export const PAID_PLANS = (): Record<PlanCode, PaidPlan> => ({
  pro_monthly: { code: "pro_monthly", label: "Pro, monthly", amountMinor: rupees(process.env.PRO_MONTHLY_PRICE_INR, 99) * 100, periodDays: 30, per: "month" },
  pro_yearly: { code: "pro_yearly", label: "Pro, yearly", amountMinor: rupees(process.env.PRO_YEARLY_PRICE_INR, 999) * 100, periodDays: 365, per: "year" },
});
export const isPlanCode = (v: unknown): v is PlanCode => v === "pro_monthly" || v === "pro_yearly";

/** Off by default: the pricing page shows "Pro, coming soon" and no payment can start until this is "true". */
export const paymentsEnabled = () => process.env.PAYMENTS_ENABLED === "true";

export const FREE_FEATURES = ["Unlimited transactions, budgets and goals", "Imports, receipts and reports", "AI analysis and assistant", "Loans and EMI tracking"];
export const PRO_FEATURES = ["Everything in Free", "Higher AI limits", "Priority support", "Early access to new features"];
