# آوای هزاردستان
Persian RTL academy management app. Static frontend uses Supabase REST + Auth; all mutations require authenticated admin RLS. Never add a service key to frontend.

## Setup
Open dist/index.html via HTTP. Database project: azastzjxnzjaloxmnbfd (hezardastan connection). Applied schema in db/. Auth uses existing email/password accounts; create accounts using Supabase Auth, then assign administrator with `insert into public.academy_staff(user_id,role) values ('AUTH_USER_UUID','admin');`. Link students through student profile user_id. No auto-admin or shared password. Sessions are memory-only; sign in after reload.

## Implemented
13 instructors; student profiles and fixed slots; term receipts; credit checks at database level; 60% teacher wage on completed sessions; expenses; payroll settlement records; cancellation/makeup notices; student read isolation; absence requests; opening-balance JSON import. Uploaded rules and weekly subject poster preserved.

## Operational decisions
500,000 toman/session, 4 sessions/term, 20 minutes/session. Each receipt of two terms grants one excused absence, submitted 4 days beforehand. This is an interpretation of a typo in the brief and must be confirmed. Students with opening debt remain blocked until manager reconciles it. Existing money/credits must not be counted twice. All class timestamps use Tehran +03:30.

## Remaining activation
No real roster or time slots were provided. No admin identity was provided; setup of that identity is required. Online Iranian gateway, SMS provider and self-registration are not configured. Notices are in-app. Rules acceptance is recorded with an authenticated timestamp; this is not an electronic signature service. No public marketing landing page yet; this delivery focuses on requested management panel. Source is mirrored in Samilmusic/hezardastan. Dedicated Sites remote handles hosting. Production deployment is owner-private until explicit audience change. Use a hosting audience appropriate for student access before real rollout.

## Import
Download JSON template from import tab. Enter remaining lesson credits and outstanding debt at cutover. Confirm against paper ledger before submitting. Bulk REST insert is atomic. Current roster must be supplied separately.
