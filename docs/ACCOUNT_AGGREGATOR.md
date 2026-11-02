# Bank sync via Account Aggregator (Setu)

SmartFin reads your bank's transactions only through India's Account Aggregator framework, with your consent. Payments from PhonePe, Google Pay, Paytm etc. appear because they debit your linked bank account. Nothing is read from the apps themselves.

## Flow
1. **Connect** (Integrations): you enter your bank-linked mobile number and tick the consent box. The server asks Setu for a consent request and redirects you to Setu's consent screen. You pick accounts and approve with your bank's OTP — SmartFin never sees credentials.
2. **Check status**: after approving, press "I've approved — check status". The connection becomes *Connected* and a `granted` consent is logged.
3. **Sync now**: the server creates a data session, waits briefly for the bank, and fetches transactions. They are **staged for review** (Imports → review page), never written straight to the ledger, so transfers and card-bill payments can be fixed before they affect totals. Duplicates are flagged by reference and by date+amount+description.
4. **Disconnect**: revokes the consent at Setu first, then records `revoked`.

## Setup (free sandbox)
1. Sign up at https://bridge.setu.co → create an FIU product (Account Aggregator, sandbox).
2. Copy **client id**, **client secret** and **product instance id** into `.env.local`:
   `SETU_CLIENT_ID`, `SETU_CLIENT_SECRET`, `SETU_PRODUCT_INSTANCE_ID` (optional `SETU_BASE_URL`, default sandbox `https://fiu-sandbox.setu.co`).
3. In Bridge set the redirect/return URL to `<your site>/integrations`.
4. Run migration `supabase/migrations/20261101000004_account_aggregator.sql` (SQL editor).
5. Restart the app. The Integrations page shows **Available**; use Setu's sandbox test users to try the flow.

## Not verified / limits
- Written from Setu's public docs and **not yet run against a live sandbox** (no credentials were available). Header names (`x-client-id`, `x-client-secret`, `x-product-instance-id`) and the `/v2` path prefix (`SETU_API_PREFIX`) must be confirmed with Setu's Postman collection.
- No webhooks yet: status is pulled when you press the buttons. Setu's webhook signature scheme isn't documented publicly; add webhooks only after confirming it.
- Going live needs Setu production approval (and fees); Sahamati/RBI rules apply to the FIU role. Legal review required before launch.
- Consent covers 12 months of history; re-consent when it expires.
- A payment also added by SMS paste may appear twice (different reference types). Delete one, or untick it in the review.
