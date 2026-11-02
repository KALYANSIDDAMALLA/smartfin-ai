import { IndianRupee, LayoutDashboard, ArrowLeftRight, PlusCircle, Wallet, Smartphone, Banknote, BarChart3, PiggyBank, Sparkles, MessageSquare, Target, Coins, HandCoins, Upload, FileText, Landmark, Settings, CalendarClock, ClipboardList, Database, BrainCircuit, Bell, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; kw?: string }
export interface NavGroup { group: string; icon: LucideIcon; items: NavItem[] }

/** Sidebar structure. `kw` are extra words the header search matches (e.g. typing "emi" finds Repayments). */
export const NAV: NavGroup[] = [
  { group: "Money", icon: IndianRupee, items: [
    { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, kw: "ledger history list expenses income transfers refunds search filter" },
    { href: "/expenses/new", label: "Add expense", icon: PlusCircle, kw: "new spend record paste sms bank alert draft" },
    { href: "/income", label: "Income", icon: Wallet, kw: "salary earn received add income draft" },
    { href: "/payments/online", label: "Online payments", icon: Smartphone, kw: "upi gpay phonepe paytm card net banking digital" },
    { href: "/payments/offline", label: "Offline payments", icon: Banknote, kw: "cash counter physical" },
  ]},
  { group: "Plans", icon: ClipboardList, items: [
    { href: "/budgets", label: "Budgets", icon: PiggyBank, kw: "budget budgets limit cap spending alert threshold" },
    { href: "/goals", label: "Goals", icon: Target, kw: "goal goals target save contribution milestone" },
    { href: "/savings", label: "Savings planner", icon: Coins, kw: "savings planner plan save monthly rate emergency how much to save" },
    { href: "/repayments", label: "Repayments", icon: HandCoins, kw: "loan loans emi repay repayment mortgage subscription rent bill due reminder recurring repeat interest outstanding" },
  ]},
  { group: "AI", icon: Sparkles, items: [
    { href: "/ai/analysis", label: "AI analysis", icon: BrainCircuit, kw: "ai analysis insights coach save savings what if plan budget cut reduce trim goal advice 30 day simulator" },
    { href: "/ai/assistant", label: "AI assistant", icon: MessageSquare, kw: "ask chat question" },
  ]},
  { group: "Data", icon: Database, items: [
    { href: "/imports", label: "Imports & receipts", icon: Upload, kw: "import csv excel xlsx pdf statement receipt upload ocr" },
    { href: "/reports", label: "Reports", icon: FileText, kw: "export download pdf csv" },
  ]},
];

/** Analytics is ONE page (Daily / Weekly / Monthly / Yearly are tabs on it), placed right after the last module group. */
export const ANALYTICS_ITEM: NavItem = { href: "/analytics", label: "Analytics", icon: BarChart3, kw: "analytics analysis daily weekly monthly yearly trend chart health score forecast insights" };
/** Bank account links (formerly "Integrations") is a single item right after Analytics, not inside the Data group. */
export const INTEGRATIONS_ITEM: NavItem = { href: "/integrations", label: "Bank account links", icon: Landmark, kw: "integrations integration bank account link connect sync account aggregator setu phonepe consent" };
/** Dashboard sits outside the module groups, pinned at the top of the sidebar. */
export const DASHBOARD_ITEM: NavItem = { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, kw: "home overview kpi summary net expenses income savings" };
/** Calendar & drafts sits outside the module groups, right after the last one. */
export const CALENDAR_ITEM: NavItem = { href: "/calendar", label: "Calendar & drafts", icon: CalendarClock, kw: "calendar date dates due draft drafts planned upcoming overdue" };
/** Notifications sits outside the module groups, right after Calendar & drafts (Settings is last). */
export const NOTIFICATIONS_ITEM: NavItem = { href: "/notifications", label: "Notifications", icon: Bell, kw: "alerts unread messages budget goal due reminders" };
/** Settings sits outside the module groups, pinned at the bottom of the sidebar. */
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings, kw: "profile picture photo password delete account currency timezone notifications preferences" };
export const NAV_ITEMS = [{ ...DASHBOARD_ITEM, group: "Home" }, ...NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group }))), { ...ANALYTICS_ITEM, group: "Analytics" }, { ...INTEGRATIONS_ITEM, group: "Bank account links" }, { ...CALENDAR_ITEM, group: "Plans" }, { ...SETTINGS_ITEM, group: "Account" }, { ...NOTIFICATIONS_ITEM, group: "Account" }];

/** Page-wise suggestions shown when the search box is clicked: ideas for transaction searches, then related pages. */
export const PAGE_HINTS: { prefix: string; searches: string[]; related: string[] }[] = [
  { prefix: "/dashboard", searches: ["expenses over 1000 this month", "income this year", "upi last month"], related: ["/analytics", "/ai/analysis", "/calendar"] },
  { prefix: "/transactions", searches: ["cash this week", "expenses over 5000 last month", "refunds this year"], related: ["/expenses/new", "/imports", "/reports"] },
  { prefix: "/expenses", searches: ["expenses today", "online expenses this week"], related: ["/transactions", "/calendar", "/imports"] },
  { prefix: "/income", searches: ["income this month", "income over 10000 this year"], related: ["/transactions", "/calendar", "/analytics"] },
  { prefix: "/payments", searches: ["upi this month", "cash last month", "credit card this year"], related: ["/payments/online", "/payments/offline", "/analytics"] },
  { prefix: "/analytics", searches: ["expenses this year", "income last month", "expenses over 2000 this week"], related: ["/ai/analysis", "/budgets", "/transactions"] },
  { prefix: "/budgets", searches: ["expenses this month", "online expenses this month", "cash this month"], related: ["/transactions", "/analytics", "/ai/analysis"] },
  { prefix: "/goals", searches: ["income this month"], related: ["/savings", "/budgets", "/calendar"] },
  { prefix: "/savings", searches: ["income this month", "expenses this month"], related: ["/goals", "/budgets", "/repayments"] },
  { prefix: "/repayments", searches: ["expenses this month", "payments last month"], related: ["/calendar", "/budgets", "/transactions"] },
  { prefix: "/calendar", searches: ["expenses today", "expenses this week"], related: ["/expenses/new", "/repayments", "/goals"] },
  { prefix: "/ai", searches: ["expenses last month", "refunds this year"], related: ["/ai/analysis", "/ai/assistant", "/reports"] },
  { prefix: "/imports", searches: ["expenses last month"], related: ["/transactions", "/integrations", "/reports"] },
  { prefix: "/reports", searches: ["expenses this year", "income this year"], related: ["/transactions", "/analytics", "/imports"] },
];
export const DEFAULT_HINT = { searches: ["expenses over 1000 this month", "income this year", "upi last month"], related: ["/calendar", "/expenses/new", "/reports"] };
export const hintsFor = (path: string) => PAGE_HINTS.find((h) => path === h.prefix || path.startsWith(h.prefix + "/")) ?? DEFAULT_HINT;
