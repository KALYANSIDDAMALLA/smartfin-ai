# Run SmartFin AI in GitHub Codespaces

A private, cloud copy of the app on GitHub's machines. Only you can open it, and only while the codespace is running. It is **not** a public site.

## One-time setup

1. **Add secrets** (GitHub → your profile → Settings → Codespaces → Secrets → *New secret*, repository access: `smartfin-ai`).
   Copy the values from your local `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required)
   - `SUPABASE_SERVICE_ROLE_KEY` (notifications, account deletion, webhooks)
   - `GEMINI_API_KEY`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` (optional)
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAYX_ACCOUNT_NUMBER` (optional, **test keys only**, see `docs/RAZORPAY.md`)
2. **Open it:** repo page → green **Code** button → **Codespaces** → **Create codespace on `worktree-demo-linked-accounts`** (or `main` once merged).
3. Wait for `npm ci` and the dev server. A browser tab opens on `https://<name>-3000.app.github.dev` (sign in to GitHub if asked).

## Supabase login settings (needed for sign-in to work)

The forwarded address changes per codespace. In Supabase → Authentication → URL Configuration, add this to **Redirect URLs**:

```
https://*-3000.app.github.dev/**
```

(Google sign-in also needs that origin allowed in your Google OAuth settings.)

## Razorpay webhook from a codespace

The forwarded port is **private**, so Razorpay can't reach it. To test webhooks, set port 3000 to **Public** in the *Ports* tab, use `https://<name>-3000.app.github.dev/api/webhooks/razorpay` as the webhook URL, and set the port back to Private when you're done. The EMI payment works without the webhook.

## Cost and housekeeping

- Free accounts have a monthly allowance of core-hours; a codespace stops after 30 minutes idle by default.
- Delete codespaces you no longer need (github.com/codespaces).
- Secrets live in GitHub, never in the repo.
