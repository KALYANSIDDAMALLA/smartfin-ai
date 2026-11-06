/** Calculator maths. No eval(): a small recursive-descent parser supporting + - × ÷ ( ) % and decimals. */
export function evaluate(input: string): number {
  const s = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/[₹,\s]/g, "");
  if (!s) throw new Error("Empty");
  let i = 0;
  const peek = () => s[i];
  // A trailing % means "percent of": 200+10% -> 220, 50*10% -> 5.
  function number(): number {
    const m = /^\d*\.?\d+/.exec(s.slice(i)); if (!m) throw new Error("Invalid expression");
    i += m[0].length; return Number(m[0]);
  }
  function factor(): number {
    if (peek() === "-") { i++; return -factor(); }
    if (peek() === "+") { i++; return factor(); }
    let v: number;
    if (peek() === "(") { i++; v = expr(); if (peek() !== ")") throw new Error("Missing )"); i++; } else v = number();
    return v;
  }
  function percentOf(v: number, base: number | null) { return base === null ? v / 100 : (base * v) / 100; }
  function term(): number {
    let v = factor();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      if (peek() === "%") { i++; v = v / 100; continue; }
      const op = s[i++]; let r = factor();
      if (peek() === "%") { i++; r = r / 100; }
      if (op === "/") { if (r === 0) throw new Error("Cannot divide by zero"); v /= r; } else v *= r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++]; let r = term();
      if (s[i - 1] === "%" ) r = percentOf(r * 100, v); // "200+10%": the % applies to the left-hand value
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const out = expr();
  if (i < s.length) throw new Error("Invalid expression");
  if (!Number.isFinite(out)) throw new Error("Invalid result");
  return Math.round(out * 1e9) / 1e9;
}

/** Monthly EMI for a reducing-balance loan. Rate is the annual % (e.g. 9.5). */
export function emi(principal: number, annualRatePct: number, months: number) {
  if (!(principal > 0) || !(months > 0) || annualRatePct < 0) throw new Error("Enter a positive amount and tenure");
  const r = annualRatePct / 12 / 100;
  const monthly = r === 0 ? principal / months : (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);
  const total = monthly * months;
  return { monthly, total, interest: total - principal };
}

/** GST: "exclusive" = amount excludes GST (add it); "inclusive" = amount already includes GST (split it). */
export function gst(amount: number, ratePct: number, mode: "exclusive" | "inclusive") {
  if (!(amount >= 0) || !(ratePct >= 0)) throw new Error("Enter a valid amount and rate");
  const net = mode === "exclusive" ? amount : amount / (1 + ratePct / 100);
  const tax = net * (ratePct / 100);
  return { net, tax, gross: net + tax, cgst: tax / 2, sgst: tax / 2 };
}
