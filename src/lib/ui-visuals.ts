import { ArrowLeftRight, Baby, BadgeCheck, Banknote, Bike, BookOpen, Boxes, Bus, CalendarSync, CarFront, Clapperboard, Coffee, Cpu, CreditCard, Droplets, Dumbbell, Flame, Fuel, Gamepad2, Gift, GraduationCap, HandCoins, HandHeart, HeartPulse, Home, KeyRound, Landmark, Laptop, Megaphone, Music, Package, PartyPopper, PawPrint, Percent, PiggyBank, Pill, Plane, QrCode, Receipt, Repeat, Scissors, Shapes, ShieldCheck, ShoppingBag, ShoppingBasket, ShoppingCart, Smartphone, Smile, Store, Tag, Ticket, TrendingUp, UserRound, Users, UtensilsCrossed, Wallet, Wifi, Wrench, Zap, type LucideIcon } from "lucide-react";

export interface Visual { icon: LucideIcon; hue: number }
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

const CATEGORY: [RegExp, LucideIcon, number][] = [
  [/^person$/i, UserRound, 262], [/^other$/i, Shapes, 222], // exact names first: "Person" must not fall into "Personal"
  [/coffee|cafe|tea\b/i, Coffee, 30], [/food|dining|restaurant|meal|eating/i, UtensilsCrossed, 24], [/grocer/i, ShoppingBasket, 100], [/shop|cloth|fashion|apparel/i, ShoppingBag, 322],
  [/fuel|petrol|diesel/i, Fuel, 14], [/bike|cycle/i, Bike, 190], [/transport|cab|taxi|metro|bus\b/i, Bus, 205], [/vehicle|parking|toll|\bcar\b/i, CarFront, 212],
  [/book/i, BookOpen, 250], [/educat|school|course|tuition|college/i, GraduationCap, 258],
  [/pharmac|medicine|pill/i, Pill, 342], [/health|medic|doctor|hospital|clinic/i, HeartPulse, 352],
  [/rental|tenant/i, KeyRound, 172], [/rent|housing|mortgage/i, Home, 160],
  [/internet|wifi|broadband/i, Wifi, 198], [/phone|mobile|recharge/i, Smartphone, 216], [/water/i, Droplets, 196], [/\bgas\b|cylinder/i, Flame, 18], [/utilit|electric|bill/i, Zap, 44],
  [/party|outing/i, PartyPopper, 318], [/game|gaming/i, Gamepad2, 140], [/music/i, Music, 292], [/entertain|movie|film|cinema/i, Clapperboard, 286],
  [/travel|trip|holiday|flight/i, Plane, 192], [/subscri|membership/i, CalendarSync, 266], [/personal|self care|grooming/i, Smile, 216], [/salon|beauty/i, Scissors, 330],
  [/insur/i, ShieldCheck, 175], [/loan|emi|debt|credit card/i, HandCoins, 10], [/saving/i, PiggyBank, 332], [/donat|charity|temple|church/i, HandHeart, 345],
  [/kid|child|baby/i, Baby, 200], [/\bpet|dog|\bcat\b/i, PawPrint, 36], [/fitness|gym|sport/i, Dumbbell, 152], [/electronic|gadget|computer/i, Cpu, 232], [/repair|maintenance/i, Wrench, 38],
  [/salary|wages? received|paycheck/i, Banknote, 150], [/business|sales|revenue/i, Store, 26], [/freelanc|consult/i, Laptop, 232], [/interest/i, Percent, 96],
  [/invest|dividend|stock|mutual/i, TrendingUp, 142], [/gift|bonus|reward|cashback/i, Gift, 332],
  [/inventory|stock/i, Boxes, 35], [/staff|salaries|employee/i, Users, 200], [/gst|tax/i, Receipt, 8], [/market|ads|advert/i, Megaphone, 300],
  [/packag|courier/i, Package, 55], [/professional|fees/i, BadgeCheck, 240], [/ticket|event/i, Ticket, 20],
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
