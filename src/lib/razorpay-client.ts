"use client";
/** Browser side of Razorpay Checkout: loads their script once and types the global it adds. */
export type RzpCheckout = new (o: Record<string, unknown>) => { open(): void; on(ev: string, cb: (r: { error?: { description?: string } }) => void): void };
declare global { interface Window { Razorpay?: RzpCheckout } }

export const loadCheckout = () => new Promise<boolean>((res) => {
  if (window.Razorpay) return res(true);
  const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s);
});
