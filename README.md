# آوای هزاردستان
Persian public music/art academy website with authenticated management portal, Supabase backend, and walnut/cream/gold glass styling.

## Frontend
Serve dist/ as static files. index.html is public; portal.html requests email OTP. No guest demo records are rendered. Supabase publishable key may be public; service/secret keys must never be included. Sessions are in memory and require sign-in after reload.

## Roles
Admin: all academy operations and staff assignment. Secretary: students, tuition, schedule, absence requests and notices; no expenses, salary or staff-role management. Teacher: only own schedule, minimal student names/subjects, attendance and own wage information. Students: only linked profile, payments, schedule and requests. RLS and checked RPCs enforce access.

Verified staff emails are reserved in academy_private.staff_email_assignments, never in source. Auth trigger activates reserved role after verified email. Teacher role requires teacher_id; admin can assign it from Accounts. Student email maps a verified account to their profile. Admin can also link by Auth UUID.

## Email activation
Configure Resend SMTP in Supabase Auth and include `{{ .Token }}` in the Magic Link email template for code entry. Configure Site URL/allowed redirects for the Site and avayehezardastan.com. DNS verification in Resend alone does not configure Supabase SMTP. Email delivery remains untested until SMTP is configured. No emails have been sent by this build workflow.

## Academy rules
500,000 toman/session; 20 minutes; 4 weekly sessions/term; 2,000,000 toman/term. Teacher earns 300,000 toman per completed session. Database blocks completed/absent attendance without prepaid credit or with opening debt. Teacher cancellation preserves credit and can be assigned a makeup session with in-app notice. Each single receipt of two terms grants one excused absence requested 4 days ahead. This interprets a typo in the original brief; confirm it before rollout.

Expenses, payroll settlement records, tuition receipts, rules acceptance and opening-balance JSON import are included. Payment receipts are manually verified by office; no online Iranian gateway or SMS provider is configured.

## Cutover
Choose a cutover date; import only outstanding lesson credits and confirmed debt. Do not re-enter historic payments already represented in opening credit. Bulk REST import is atomic. Supplied poster lists daily subjects, not student time slots. Real roster and time slots still need importing.

## Deployment
Dedicated Sites source remote powers hosted deployments. Source mirror: Samilmusic/hezardastan. Custom domain avayehezardastan.com is registered in Sites and awaits website DNS validation/certificate issuance. Preserve Resend DKIM/SPF and other mail DNS records.

## Validation
Node JavaScript syntax checked; browser homepage and portal reviewed; Supabase security advisors reported no issues. Transaction tests verified unpaid attendance block, paid attendance, 300,000 wage, verified staff assignment and secretary expense denial. Test accounts and transactions were rolled back. Email end-to-end and real student login have not been tested.
