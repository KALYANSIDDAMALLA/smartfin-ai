/**
 * Percentages are shown up to 100. "Spending is 1197% higher" means little to most people, so anything beyond 100 reads as "100%+"
 * (or "more than double" in sentences). The underlying numbers stay exact; only the wording is capped.
 */
export const OVER = 100;
/** "45%", "+45%", "−45%", or "100%+" when the size is over 100. */
export function pctText(p: number, signed = false): string {
  const a = Math.abs(Math.round(p)); const body = a > OVER ? "100%+" : `${a}%`;
  return (p < 0 ? "−" : signed && p > 0 ? "+" : "") + body;
}
/** "a lot more" phrasing for sentences: "45% higher", "more than double". */
export const higherBy = (p: number) => (p > OVER ? "more than double" : `${pctText(p)} higher`);
