import { type Minor } from "./money";

export interface PlannerInput {
  monthlyIncomeMinor: Minor;
  essentialMinor: Minor;
  discretionaryMinor: Minor;
  commitmentsMinor: Minor; // EMIs, rent already in essentials? -> caller must not double count
  goalsRequiredMonthlyMinor: Minor[]; // per-goal required monthly contribution
  /** Fraction (in %) of the discretionary spend we consider realistically trimmable. Default 10. */
  trimmableDiscretionaryPct?: number;
}

/**
 * Realistic plan: only free monthly surplus (income - all outflows) plus a modest trim of
 * discretionary spend is considered available. Current savings balance is NOT assumed spendable.
 */
export function planSavings(i: PlannerInput) {
  const outflow = i.essentialMinor + i.discretionaryMinor + i.commitmentsMinor;
  const surplus = i.monthlyIncomeMinor - outflow;
  const trim = Math.floor((i.discretionaryMinor * (i.trimmableDiscretionaryPct ?? 10)) / 100);
  const availableMonthly = Math.max(0, surplus) + (surplus >= 0 || i.discretionaryMinor > 0 ? trim : 0);
  const requiredMonthly = i.goalsRequiredMonthlyMinor.reduce((a, b) => a + b, 0);
  const recommendedMonthly = Math.min(requiredMonthly, availableMonthly);
  return {
    surplusMinor: surplus,
    availableMonthlyMinor: availableMonthly,
    requiredMonthlyMinor: requiredMonthly,
    recommendedMonthlyMinor: recommendedMonthly,
    recommendedWeeklyMinor: Math.ceil((recommendedMonthly * 12) / 52),
    recommendedDailyMinor: Math.ceil((recommendedMonthly * 12) / 365),
    yearlyProjectionMinor: recommendedMonthly * 12,
    shortfallMonthlyMinor: Math.max(0, requiredMonthly - availableMonthly),
    isDeficit: surplus < 0,
  };
}
