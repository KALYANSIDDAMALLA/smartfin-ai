import { localDate } from "../finance/dates";

export interface Candidate {
  amountMinor: number;
  occurredAt: string;
  merchant?: string | null;
  description?: string | null;
  externalRef?: string | null;
}

export const normalizeText = (s?: string | null) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Deterministic fingerprint: local date + amount + normalized merchant/description. */
export function fingerprint(c: Candidate, tz = "Asia/Kolkata"): string {
  return [localDate(c.occurredAt, tz), c.amountMinor, normalizeText(c.merchant ?? c.description)].join("|");
}

export type DupResult = { duplicate: boolean; reason?: "external_ref" | "fingerprint" | "within_batch" };

/** Check staged rows against existing rows and against each other. Does not mutate inputs. */
export function detectDuplicates(staged: Candidate[], existing: Candidate[], tz = "Asia/Kolkata"): DupResult[] {
  const refs = new Set(existing.map((e) => e.externalRef).filter(Boolean) as string[]);
  const fps = new Set(existing.map((e) => fingerprint(e, tz)));
  const seen = new Set<string>();
  return staged.map((s) => {
    if (s.externalRef && refs.has(s.externalRef)) return { duplicate: true, reason: "external_ref" };
    const fp = fingerprint(s, tz);
    if (fps.has(fp)) return { duplicate: true, reason: "fingerprint" };
    const key = s.externalRef ? `ref:${s.externalRef}` : `fp:${fp}`;
    if (seen.has(key)) return { duplicate: true, reason: "within_batch" };
    seen.add(key);
    return { duplicate: false };
  });
}
