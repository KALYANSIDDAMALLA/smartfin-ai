# Free setup: Google sign-in + Gmail SMTP (verification codes)

Both are free. Do these once in your own accounts.

## A. Free verification emails via Gmail SMTP (fixes "email rate limit exceeded")
1. Google Account → Security → turn on **2-Step Verification**.
2. Google Account → Security → **App passwords** → create one named "SmartFin" → copy the 16-character password.
3. Supabase → Authentication → **SMTP Settings** → Enable custom SMTP:
   - Host `smtp.gmail.com`, Port `465`, Username = your Gmail address, Password = the app password
   - Sender email = the same Gmail address, Sender name = `SmartFin AI`
4. Supabase → Authentication → **Rate Limits** → raise "emails sent per hour" (e.g. 30; Gmail allows ~500/day).
5. Supabase → Authentication → **Emails → Confirm signup** → add: `<p>Your verification code is <b>{{ .Token }}</b></p>`
6. Supabase → Authentication → **URL Configuration** → add `http://localhost:3001/**` (and your real domain later) to Redirect URLs.

## B. Google sign-in
1. https://console.cloud.google.com → create a project (free).
2. APIs & Services → **OAuth consent screen** → External → app name, support email → add your Gmail as a *Test user*.
3. APIs & Services → Credentials → **Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `http://localhost:3001`
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Copy the Client ID and Client Secret.
5. Supabase → Authentication → Providers → **Google** → enable → paste both → Save.
6. Test: "Continue with Google" on /login or /register.

Notes: while the consent screen is in *Testing*, only listed test users can sign in. Publishing it for everyone needs a privacy-policy URL and a domain you own (Google's basic-scope review).
