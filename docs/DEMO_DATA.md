# Demo data (development / demo only)
`supabase/seed/demo_seed.sql` creates two fake users (Priya, Arjun); `supabase/seed/demo_seed_business.sql` adds a third, a business owner (Rohan), and can be re-run on its own without touching the others with full example data; `supabase/seed/demo_cleanup.sql` removes them.
Everything is deterministic (same data every run) and dated relative to the day you run it, so there is always activity for Today / This week / This month.

| Login | Password |
|---|---|
| priya.demo@smartfin.demo | Demo@12345 |
| arjun.demo@smartfin.demo | Demo@12345 |
| rohan.demo@smartfin.demo | Demo@12345 |

## Priya Sharma — salaried, 2 years (~1,370 transactions)
- **Daily:** tea/lunch/cab most days, today and yesterday filled in. **Weekly:** Sunday groceries, weekend dinners/movies, weekday commutes. **Monthly:** salary, rent, EMI, utilities, subscriptions, gym, credit-card bill. **Quarterly/yearly:** interest, freelance, dividend, Diwali bonus, tax refund, insurance premium, Amazon Prime, trips (flight + hotel).
- **Every transaction type:** income, expense, 10 refunds linked to original purchases, 24 credit-card-bill *transfers* between her two accounts (not counted as expenses), 1 manual adjustment, 1 soft-deleted entry (excluded from totals).
- **Every channel/method:** UPI, GPay, PhonePe, debit/credit card, net banking, cash. Tags, notes, descriptions and UPI references on selected rows; 3 uncategorised rows (to try auto-categorise).
- **Budgets (8):** daily, weekly, monthly, yearly; by category; online-only and cash-only. **Goals (4):** active, completed, paused, plus a withdrawal. **Recurring (8)** incl. one paused. **Savings plan.**
- **Imports:** a confirmed CSV with imported rows, an XLSX waiting in the review queue (1 duplicate, 1 low-confidence/incomplete row), and a failed PDF.
- **AI:** one saved analysis and a short assistant chat — built from her real numbers (clearly "built-in analysis"), plus unusual-spend candidates (₹14,999 and ₹9,800 purchases).
- **Notifications:** 10 across budget, goal, unusual, recurring, import, AI and summary (7 unread).

## Arjun Rao — student, 1 year (~510 transactions)
Daily canteen/chai and bus, monthly mess/allowance/recharge/Spotify, quarterly scholarship, yearly college fee and books, 4 budgets (daily/weekly/monthly/yearly), 2 goals, 3 recurring items, notifications. Proves users only see their own data.

## Rohan Mehta — shop owner (retail + wholesale), 2 years (~7,400 transactions)
- **Daily:** 6–12 counter sales (UPI, cash, cards, wallets), staff tea, courier/packaging. **Weekly:** stock purchases (some with supplier credit-note refunds), wholesale/B2B payments, Amazon/Flipkart payouts, cash-drawer-to-bank deposits (transfers).
- **Monthly:** rent, 3 staff salaries, business loan EMI, electricity, internet, billing software, accountant, ads, GST payment, owner drawings (a transfer, not an expense). **Quarterly/yearly:** advance tax, interest, insurance, licence, maintenance, equipment, Diwali staff bonus; busier Oct–Nov.
- **Business categories:** Inventory & stock, Staff salaries, GST & taxes, Marketing & ads, Packaging & courier, Professional fees. **3 accounts** (current, cash drawer, owner personal), 8 budgets, 4 goals, 12 recurring (1 paused), a bank statement in the import review queue, notifications and a saved assistant chat.
- Load it with: SQL Editor → paste `demo_seed_business.sql` → uncomment the `allow_demo` line → Run.

## Not included (on purpose)
No bank connection / sync history: fake provider connectivity would be misleading. Connect a real bank under Bank account links once Setu credentials are set.

## Run
Supabase → SQL Editor → paste the seed → uncomment `set smartfin.allow_demo = 'on';` (safety switch) → Run. Re-running resets the demo users.
**Remove the demo accounts (cleanup script) before real users sign up — the password is public.**

## Demo loans (optional, after migration 8)
`supabase/seed/demo_loans.sql` adds sample loans to **all three** demo logins. Run it in the SQL editor **after** `20261101000008_loans.sql` and the demo seeds. It is safe to run again (it replaces only these demo users' loans) and skips any demo user that does not exist.

| Login | Loans |
|---|---|
| priya.demo@smartfin.demo | Home loan (HDFC Bank, ₹6.6 lakh, EMI ₹6,500, ~17 paid) · Personal loan (ICICI Bank, ₹1.5 lakh, 24 months, ~6 paid) |
| arjun.demo@smartfin.demo | Education loan (SBI, ₹4 lakh, 84 months, repayment starts in ~8 months, none paid) · Phone EMI (0% interest, 12 months, ~3 paid) |
| rohan.demo@smartfin.demo | Business loan (ICICI Bank, ₹12.87 lakh, EMI ₹28,000, ~13 paid) · Delivery van loan (HDFC Bank, ₹6 lakh, 36 months, ~3 paid) |

Dates are relative to the day you run it, so every loan has paid EMIs behind it and the next one coming up.
