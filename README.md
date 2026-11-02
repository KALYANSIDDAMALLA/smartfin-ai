# SmartFin AI

Multi-user personal finance tracker for India (₹, Asia/Kolkata): transactions, budgets, goals, a savings planner, loans and repayments, imports, reports, bank account links, an analytics page with a financial-health score, and an AI coach. Next.js (App Router) + Supabase (Postgres, Auth, Storage, RLS) + OpenAI (optional).
It tracks finances only — it is not a bank/wallet and never moves money.

## Quick start
```bash
cp .env.example .env.local        # fill Supabase URL, anon key, service-role key
# apply supabase/migrations/*.sql in order (Supabase SQL editor or `supabase db push`)
npm install && npm run dev        # http://localhost:3000
```
Supabase dashboard: Auth → enable email confirmations, set Site URL + redirect `…/auth/callback`; configure SMTP for production email delivery.

## Scripts
`npm run dev | build | lint | test` · `npm run test:integration` (needs `TEST_DATABASE_URL`, proves RLS isolation) · `npm run test:e2e` (Playwright, see docs/SETUP.md)

## Structure
`src/lib/finance` pure accounting/budget/goal/savings/trend logic (unit-tested) · `src/lib/server` data access, AI, imports, reports · `src/app/actions` server actions (identity always from session) · `supabase/migrations` schema + RLS.
Docs: [docs/SETUP.md](docs/SETUP.md) (deploy, AI, integrations, backup) · [docs/ACCOUNTING.md](docs/ACCOUNTING.md) · [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md)
