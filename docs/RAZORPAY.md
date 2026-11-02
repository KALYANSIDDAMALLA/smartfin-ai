# Razorpay + RazorpayX (test mode)

Two test-mode flows, nothing live:

| Flow | Where | What happens |
|---|---|---|
| **Pay an EMI with Razorpay** | Repayments → each active loan → *Pay with Razorpay (test)* | Server creates an order for the next instalment (amount comes from the database, never the browser) → Razorpay Checkout → server verifies the signature → the EMI is recorded exactly as *Mark EMI paid* does. |
| **Send a UPI payout with RazorpayX** | *Send money (test)* in the sidebar (`/payouts`) | Server creates a contact and UPI fund account, then a payout with an idempotency key. Status is kept in `razorpayx_payouts` and updated by the webhook. |

| **Verify / Send money / Add money per account** | *Bank account links → Your accounts → each account → Razorpay (test)* | **Verify:** RazorpayX ₹1 "penny drop" to a UPI id; shows the registered name and a *Verified* badge (the UPI id is not stored). **Send money:** a test payout tied to the account, history shown under it. **Add money:** Razorpay Checkout; a verified payment is recorded as income on that account. |

Razorpay does **not** read bank balances or transactions; that stays with the Account Aggregator on the same page.
Run migrations `…009` and then `…010` (`20261101000010_razorpay_accounts.sql`) first. Verify and Send money need `RAZORPAYX_ACCOUNT_NUMBER`; Add money only needs the Razorpay keys. Add the webhook events `fund_account.validation.completed` and `fund_account.validation.failed` too.

Not built yet: subscriptions / paid plans (needs a pricing decision), recording a payout as a ledger expense, live mode.

## Setup (about 10 minutes)

1. **Run the migration** `supabase/migrations/20261101000009_razorpay.sql` (adds `razorpay_orders` and `razorpayx_payouts`, both with RLS).
2. **Razorpay dashboard → switch to Test Mode → Account & Settings → API Keys → Generate Test Key.** Put them in `.env.local`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxx
   ```
   Keys that don't start with `rzp_test_` are refused by the app on purpose.
3. **RazorpayX** (payouts): open the RazorpayX dashboard in test mode and copy the test **account number** (the one shown under *Banking → Current account*):
   ```
   RAZORPAYX_ACCOUNT_NUMBER=2323230000000000
   ```
   RazorpayX uses the same API keys as Razorpay.
4. **Webhook** (Razorpay dashboard → Developers → Webhooks → Add): URL `https://<your-public-url>/api/webhooks/razorpay`, choose a secret, and put it in `.env.local`:
   ```
   RAZORPAY_WEBHOOK_SECRET=the-secret-you-typed
   ```
   Events: `payment.captured`, `order.paid`, and the `payout.*` events. For local testing, expose localhost with a tunnel (e.g. `ngrok http 3000`).
5. Restart `next dev`.

## Trying it

- **EMI:** add a loan, press *Pay with Razorpay (test)*, use a [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-details/) (e.g. `4111 1111 1111 1111`, any future expiry, any CVV, OTP `1234` on the mock bank page) or test UPI `success@razorpay`. The EMI appears in Transactions and the loan's progress moves.
- **Payout:** `/payouts`, payee name, UPI ID `success@razorpay`, an amount up to ₹10,000. Status starts `queued`/`processing` and becomes `processed` when the webhook arrives. Use `failure@razorpay` to see a failure.

## How money is kept safe

- Amounts are read from the database on the server. The browser only gets the public key id and the order id.
- A Checkout success is trusted only after the **HMAC signature** (`order_id|payment_id`, key secret) is verified.
- An order flips `created → paid` in one conditional update, so a double click, a retry or two tabs can record the EMI **once**. The loan's unique `(loan_id, installment_no)` is a second guard.
- The webhook is public (`/api/webhooks/*` skips the login redirect) and is gated **only** by the signature of the raw body. For orders it merely attaches the payment id; it never records an EMI.
- Payouts send an `X-Payout-Idempotency` key, are limited to ₹10,000 and 10 per hour per user, and only a masked UPI id is stored.
- No secret ever reaches the browser or the database.

## Known limitations

- If the browser closes after paying but before the confirmation call, the money moved but the EMI is not recorded automatically; use *Mark EMI paid*. (A reconciliation job that reads the webhook's `payment_id` would close this.)
- Test mode only. Going live needs Razorpay KYC, RazorpayX activation, and a review of this code (limits, refunds, reconciliation, GST on fees).
