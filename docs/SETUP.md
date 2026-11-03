# Setup, deployment and operations
## Environments
Use three Supabase projects (dev / staging / prod) and a Vercel project per branch. Set env vars from `.env.example` in Vercel (server vars **not** prefixed `NEXT_PUBLIC_`). Demo data is never seeded in production: there is no seed in the app; only real user rows exist.
## Deploy checklist
1. Apply `supabase/migrations/*` in order. 2. Auth: email confirmation on, SMTP configured, Site URL/redirects set. 3. Set env vars incl. `SUPABASE_SERVICE_ROLE_KEY`. 4. Storage bucket `private-files` is private (created by migration 0002). 5. Run `npm test`, `npm run test:integration` (against a throwaway DB), `npm run test:e2e`. 6. Verify `/api/health`. 7. Test desktop + mobile layouts.
## AI provider
Set `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`). Without it, analysis uses a deterministic built-in narrative, the assistant uses a keyword planner, and receipt OCR is disabled. The model never does arithmetic: it receives aggregated metrics (no ids/emails/notes) and, for the assistant, only chooses a query type; the backend computes the answer. Rate limits: 10 analyses/h, 30 questions/h per user.
## Integrations
`src/lib/integrations/registry.ts` lists providers. None is implemented: Account Aggregator access needs onboarding with an AA/TSP (FIU registration or partner agreement) and credentials. Until then the UI shows "Unavailable" and statement import/manual entry are the supported paths. Provider tokens must be stored encrypted in `integration_secrets` (service role only).
## Backup & recovery
Enable Supabase daily backups / PITR on production. Restore into a new project, re-apply storage objects if needed, and re-point env vars. Test a restore quarterly. Audit log: `audit_events`.
## Tests
Unit: `npm test`. RLS: `npm run test:integration` with `TEST_DATABASE_URL` (see `tests/integration/rls.test.ts`). E2E: `E2E_BASE_URL`, run against a staging project with email confirmation disabled so test users can sign in.

## Email verification with a 6-digit code
The app asks for a 6-digit code after sign-up (`verifyEmailCode`). Supabase only sends a code if the template contains it:
Dashboard → Authentication → Emails → **Confirm signup** → add `<p>Your verification code is <b>{{ .Token }}</b></p>` (keep `{{ .ConfirmationURL }}` as a fallback link). Code length defaults to 6 and expires after `mailer_otp_exp` (1 hour). Delivery to arbitrary addresses needs custom SMTP (Authentication → SMTP Settings).

## Bot protection (reCAPTCHA) on Create account
The sign-up page has a "I'm not a robot" checkbox and a required "I agree to the Terms & Privacy Policy" box.
1. Go to <https://www.google.com/recaptcha/admin/create>, choose **reCAPTCHA v2 → "I'm not a robot" checkbox**, and add your domain(s) (plus `localhost` while testing).
2. Put the **site key** in `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and the **secret key** in `RECAPTCHA_SECRET_KEY` (see `.env.example`), then rebuild (`npm run build`) because the site key is baked into the page.
3. With no keys set, the widget is hidden and the check is skipped (handy locally). Once the secret key is set the server **requires** a valid token and rejects sign-ups if Google can't confirm it.
Google's published test keys (always pass, "testing only" banner) are listed in `.env.example`; do not use them in production.
Each sign-up records `terms_accepted_at` and `terms_version` in the user's metadata (`TERMS_VERSION` in `src/lib/terms.ts`).

## Migrations on a hosted Supabase project
Apply every file in `supabase/migrations/` in order (SQL editor: paste a file, press Run). The latest, `20261101000008_loans.sql`, adds the `loans` and `loan_payments` tables (with the same per-user security rules as everything else). Until it is applied, **Plans → Repayments** shows a "Loans are almost ready" notice and everything else keeps working. Running a file twice errors because the objects already exist; that is harmless.

## AI summaries (optional)
Set `GEMINI_API_KEY` (free key at aistudio.google.com/apikey) or `OPENAI_API_KEY`, then restart. With both set, Gemini is tried first and OpenAI is the automatic backup; set `AI_PROVIDER=openai` to reverse that. `OPENAI_MODEL` (default `gpt-4o-mini`) and `OPENAI_VISION_MODEL` choose the models; newer reasoning models such as `gpt-5…` or `o…` are handled automatically. With Gemini the app turns off the model's hidden "thinking" so short structured answers are not cut off. Without a key everything still works: the Analytics page and the AI analysis page use a built-in plain-language analysis. Every number shown comes from the app's own calculations; the AI may only repeat them, and any sentence with an amount or percentage the app did not compute is dropped.
