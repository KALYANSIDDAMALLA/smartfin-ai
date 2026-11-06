# Payments (Razorpay) and plans

Everyone is on the **Free** plan and every feature is free. **Pro** (₹99/month or ₹999/year by default, one-time payments that do not auto-renew) is built but hidden: the Plans page shows "Pro, coming soon" until you turn payments on. Nothing in the app is gated by plan yet.

## How a payment works
1. Customer clicks **Choose monthly / yearly** on `/pricing`. The browser sends only a plan code.
2. Server (`createPlanOrder`) looks up the price, creates a Razorpay order with the official SDK, and stores a `payment_orders` row (customer id, name, email, order id, amount, currency, status `created`). A recent unpaid order for the same plan is reused, so double clicks do not create duplicates.
3. Razorpay Checkout opens (UPI, cards, net banking, wallets). A loading overlay shows while we confirm.
4. On success the server (`confirmPlanPayment`) **verifies the signature**, asks Razorpay for the real payment (order id, amount, currency, captured), and calls `fulfil_payment()`.
5. `fulfil_payment()` (SQL, one transaction, row-locked) checks the amount and currency against what was stored at order time, marks the order paid, records the payment id and time, and grants/extends Pro. A second call (retry, double click, webhook) returns `duplicate` and changes nothing.
6. The **webhook** (`/api/webhooks/razorpay`) calls the same function, so a customer who pays and closes the tab still gets Pro. It verifies the signature on the raw body and ignores event ids it has already processed.
7. Failure or cancel: the order is marked `failed` / `cancelled` (never if already paid), the customer sees a failure page with **Try again**. Pro is only ever set by `fulfil_payment()`, never by the browser.

Clients can read only their own rows and can never write to `user_plans` / `payment_orders`; all writes use the server's service-role key.

## Environment variables
| Variable | Where | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | server | `rzp_test_…` now, `rzp_live_…` for live. Safe to show in the browser, but we send it per order. |
| `RAZORPAY_KEY_SECRET` | server only | Never `NEXT_PUBLIC_*`, never committed. |
| `RAZORPAY_WEBHOOK_SECRET` | server only | You choose it when creating the webhook. Different from the key secret. |
| `PAYMENTS_ENABLED` | server | Exactly `true` to show Pro and allow payment. Default off. |
| `PRO_MONTHLY_PRICE_INR`, `PRO_YEARLY_PRICE_INR` | server, optional | Whole rupees. Default 99 and 999. |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Already needed for other features; payments write with it. |

## Set up in Test Mode (no real money)
1. Run `supabase/migrations/20261101000013_billing.sql` in the Supabase SQL editor. (Do **not** run 009 to 011, those are the old removed Razorpay tables.)
2. Razorpay Dashboard → switch to **Test Mode** → Account & Settings → API Keys → Generate. Put the Key ID and Secret in `.env.local`.
3. Webhook: Dashboard → Webhooks → Add. URL `https://<your site>/api/webhooks/razorpay`, secret = `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured`, `order.paid`, `payment.failed`. For local testing, expose localhost with a tunnel (e.g. `ngrok http 3000`) and use that URL.
4. Set `PAYMENTS_ENABLED=true`, run `npm run dev`, open `/pricing`.
5. Test payments: UPI id `success@razorpay` (pays) or `failure@razorpay` (fails); test card `4111 1111 1111 1111`, any future expiry, any CVV (Razorpay shows the OTP page; choose Success/Failure). Close the window to test cancel. Pay twice quickly to check duplicates; use the dashboard's "Resend" on a webhook to check duplicate delivery.

## Switch to Live Mode
1. Complete Razorpay KYC and get **Live Mode** activated.
2. Dashboard → Live Mode → generate live API keys. Create a **new** live webhook (same URL and events) with its own secret.
3. In the hosting provider (Vercel) set `RAZORPAY_KEY_ID=rzp_live_…`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` to the live values and redeploy. The mode follows the key prefix; there is no other switch. Orders store which mode created them.
4. Make one small real payment yourself (set `PRO_MONTHLY_PRICE_INR=1` temporarily), check the order is `paid` and Pro is active, refund it from the dashboard, then restore the price.
5. Keep test keys only in local `.env.local`. Never commit secrets; if a key is ever pasted into chat or committed, roll it in the dashboard.

## Testing
- `npm test` covers signature checks, pricing, flag/mode logic and the webhook route (bad signature, duplicate event, DB failure retry, failed payment).
- `TEST_DATABASE_URL=… npm run test:integration` proves `fulfil_payment()` is idempotent, rejects wrong amounts, and that users cannot write plans or call it.

## Not included yet
Auto-renewing subscriptions, refunds from inside the app (do them in the Razorpay dashboard), invoices/GST receipts, and feature gating by plan.
