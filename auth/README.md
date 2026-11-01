# Email OTP activation

In Supabase Authentication → Email Templates, replace BOTH Confirm signup and Magic Link bodies with `email-otp.html`. Set each subject to `کد تأیید ورود | آوای هزاردستان`. The `{{ .Token }}` placeholder must remain unchanged. Do not use `{{ .ConfirmationURL }}`. Keep email confirmation enabled. This is configuration, not SQL.

First visit: portal → first sign-in → email OTP → verify email → choose and confirm password → role-specific portal. Return visits: email and password. Recovery: request email OTP → verify → choose new password. Roles remain determined by academy_staff/RLS; no role comes from frontend metadata.

Never log passwords, verification codes, tokens, or service keys. Email delivery and an actual account sign-in require testing after template configuration.
