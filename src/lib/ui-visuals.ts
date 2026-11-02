import { Utensils, ShoppingBag, Car, GraduationCap, HeartPulse, Home, Zap, Clapperboard, Plane, Repeat, User, Shield, Landmark, Briefcase, Store, Laptop, Building2, Percent, TrendingUp, Gift, Tag, Boxes, Users, Receipt, Megaphone, Package, BadgeCheck, Smartphone, CreditCard, ArrowLeftRight, Banknote, Wallet, ShoppingCart, Wifi, QrCode, type LucideIcon } from "lucide-react";

export interface Visual { icon: LucideIcon; hue: number }
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

const CATEGORY: [RegExp, LucideIcon, number][] = [
  [/food|grocer|dining|restaurant/i, Utensils, 28], [/shop/i, ShoppingBag, 320], [/transport|fuel|travel by|cab/i, Car, 205], [/educat|school|course/i, GraduationCap, 255], [/health|medic/i, HeartPulse, 350],
  [/rent/i, Home, 160], [/utilit|electric|bill/i, Zap, 45], [/entertain|movie/i, Clapperboard, 285], [/travel|trip/i, Plane, 190], [/subscri/i, Repeat, 265], [/personal/i, User, 215],
  [/insur/i, Shield, 175], [/loan|emi/i, Landmark, 12], [/salary/i, Briefcase, 150], [/business/i, Store, 25], [/freelanc/i, Laptop, 230], [/rental/i, Building2, 170], [/interest/i, Percent, 95],
  [/invest|dividend/i, TrendingUp, 140], [/gift/i, Gift, 330], [/inventory|stock/i, Boxes, 35], [/staff|salaries|wages/i, Users, 200], [/gst|tax/i, Receipt, 8], [/market|ads/i, Megaphone, 300],
  [/packag|courier/i, Package, 55], [/professional|fees/i, BadgeCheck, 240],
];
/** Icon + colour for a category name (custom categories get a stable colour from their name). */
export function categoryVisual(name: string): Visual {
  const m = CATEGORY.find(([re]) => re.test(name)); return m ? { icon: m[1], hue: m[2] } : { icon: Tag, hue: name ? hash(name) : 230 };
}
const METHOD: Record<string, Visual> = {
  upi: { icon: QrCode, hue: 150 }, gpay: { icon: Smartphone, hue: 215 }, phonepe: { icon: Smartphone, hue: 270 }, paytm: { icon: Smartphone, hue: 200 }, bhim: { icon: QrCode, hue: 25 },
  debit_card: { icon: CreditCard, hue: 230 }, credit_card: { icon: CreditCard, hue: 300 }, contactless: { icon: Wifi, hue: 190 }, net_banking: { icon: Landmark, hue: 210 },
  neft: { icon: ArrowLeftRight, hue: 245 }, rtgs: { icon: ArrowLeftRight, hue: 255 }, imps: { icon: ArrowLeftRight, hue: 235 }, wallet: { icon: Wallet, hue: 40 },
  ecommerce: { icon: ShoppingCart, hue: 20 }, subscription: { icon: Repeat, hue: 265 }, cash: { icon: Banknote, hue: 140 },
};
export const methodVisual = (code: string): Visual => METHOD[code] ?? { icon: CreditCard, hue: 230 };

/** Icon + colour for a payment method shown only by its label (e.g. "Google Pay"). */
export function methodVisualByLabel(label: string): Visual {
  const l = label.toLowerCase();
  const code = /phone ?pe/.test(l) ? "phonepe" : /google|gpay/.test(l) ? "gpay" : /paytm/.test(l) ? "paytm" : /bhim/.test(l) ? "bhim" : /^upi/.test(l) ? "upi" : /credit/.test(l) ? "credit_card" : /debit/.test(l) ? "debit_card"
    : /contactless/.test(l) ? "contactless" : /net ?banking/.test(l) ? "net_banking" : /neft/.test(l) ? "neft" : /rtgs/.test(l) ? "rtgs" : /imps/.test(l) ? "imps" : /wallet/.test(l) ? "wallet" : /commerce/.test(l) ? "ecommerce" : /subscription/.test(l) ? "subscription" : /cash/.test(l) ? "cash" : "";
  return methodVisual(code);
}
