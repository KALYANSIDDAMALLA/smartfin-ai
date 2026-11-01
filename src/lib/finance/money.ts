/** Money is always integer minor units (paise). Never use floats for totals. */
export type Minor = number; // safe-integer paise

export function assertMinor(n: number): Minor {
  if (!Number.isSafeInteger(n)) throw new Error(`Invalid minor-unit amount: ${n}`);
  return n;
}

/** Parse a user-entered decimal string ("1,234.50", "₹99") to paise without float math. */
export function parseMoney(input: string, minorDigits = 2): Minor {
  const cleaned = input.replace(/[₹$€£,\s]/g, "");
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!m) throw new Error(`Invalid amount: "${input}"`);
  const [, neg, whole, frac = ""] = m;
  if (frac.length > minorDigits) {
    if (/[1-9]/.test(frac.slice(minorDigits))) throw new Error(`Too many decimal places: "${input}"`);
  }
  const fracPadded = (frac + "0".repeat(minorDigits)).slice(0, minorDigits);
  const value = Number(whole) * 10 ** minorDigits + Number(fracPadded || 0);
  return assertMinor(neg ? -value : value);
}

export function formatMoney(minor: Minor, currency = "INR", locale = "en-IN"): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  // Format the whole part via Intl (integer only, safe), then append exact fractional paise.
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(whole);
  return `${sign}${parts.replace(/\.00$/, "")}${frac ? "." + String(frac).padStart(2, "0") : ""}`;
}

export function sum(values: Minor[]): Minor {
  return values.reduce((a, b) => assertMinor(a + b), 0);
}

/** Integer percentage x/y*100 rounded half-up, using integer math only. Returns 0 if y<=0. */
export function percent(part: Minor, whole: Minor): number {
  if (whole <= 0) return 0;
  return Math.floor((part * 200 + whole) / (whole * 2));
}

/** Split `total` into n parts, distributing remainder paise so sum is exact. */
export function allocate(total: Minor, n: number): Minor[] {
  if (n <= 0) throw new Error("n must be > 0");
  const base = Math.trunc(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < Math.abs(rem) ? Math.sign(rem) : 0));
}

/** Integer ceil division for positive values. */
export function ceilDiv(a: Minor, b: number): Minor {
  if (b <= 0) throw new Error("divisor must be > 0");
  return Math.ceil(a / b);
}
