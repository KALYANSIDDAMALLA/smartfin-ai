-- Removes the Razorpay / RazorpayX bookkeeping tables added by 20261101000009 and 20261101000010. The feature has been removed from the app.
-- Run this ONLY if you want the (test-mode) data gone; the app no longer reads these tables, so skipping it is harmless.
-- It deletes rows permanently: razorpay order ids, top-up and payout history, account verification results. Ledger transactions are NOT touched.
drop table if exists account_verifications;
drop table if exists razorpay_topups;
drop table if exists razorpay_orders;
drop table if exists razorpayx_payouts;
