# QR enrollment and monthly tuition

Active on the public site.

- Student QR: https://avayehezardastan.com/portal.html#register
- Students enter national ID and a password of at least six characters; staff keep their existing login.
- Registration remains pending until the administrator reviews the requested teacher, subject, weekday and 20-minute time slot.
- Four separately settled sessions per Jalali month, beginning 1405/08. First four weekly occurrences are used; a fifth occurrence is not automatically invoiced.
- Card, bank transfer and academy payments all require a unique receipt/reference, then administrator approval.
- Pending receipts do not settle sessions; duplicate approvals and overlapping pending allocations are rejected under row locks.
- Registration and tuition rows have RLS; private admin functions check the database staff role.

## Activation verification

The owner explicitly approved deployment of the national-ID/password endpoint on 2026-11-07. The Edge Function is active with domain-restricted CORS and request throttling. Monthly attendance guard and registration audit trigger are applied in place, preserving legacy records.

Verified: real temporary email-free registration and national-ID/password login; rollback-only approval of that request; four-session month allocation; paid-session admission; unpaid-session rejection; and administrator receipt approval. Temporary account and test logs were removed after verification. Staff retain email login and the portal rejects email-login accounts lacking a staff role.


## Portal reliability update — 2026-11-07

- Official Supabase browser auth SDK persists the session and rotates refresh tokens. Restore verifies the current user and re-reads the staff role. A network outage does not discard the saved session. Explicit logout clears private cached records.
- Header refresh reloads all portal datasets without navigation or logout. Visible idle portals poll every 30 seconds and refresh on focus; open forms are preserved.
- Monthly receipt rendering now passes an array to the table renderer. Both tuition navigation entries open the monthly view.
- Approval uses `approve_enrollment_with_tuition`: registration approval and four tuition statuses commit in one database transaction, retaining the existing checked engine and RLS. New statuses default to unpaid. Existing receipts and payment history are preserved.
- Aban 1405 calendar entry is added without modifying existing tuition rows. The review dialog previews the first four occurrences of the selected weekday.
- Registration details span the form width; mobile ledgers become cards, and month cards use four session tiles (two columns on mobile).

Validation: `npm ci --prefix auth/browser`, `npm run build --prefix auth/browser`, `node --test tests/*.test.cjs` (7 passing tests). Tests cover saved-session restore, expired-token refresh deduplication, logout, role validation, offline retry, in-place refresh, atomic UI payload, receipt rendering and month dates. Database rollback-only QA verified failed tuition rolls back approval, valid approval publishes four statuses, duplicate approval fails, and student approval fails. Synthetic data only; all database QA changes rolled back. Browser layout QA covered 375, 768 and 1280 px with no horizontal overflow in review/edit forms; monthly view and edit action opened. Native Safari was not tested.

Rollback: redeploy the previous Site version to restore the earlier frontend. The added RPC and calendar entry are additive and can remain; neither rewrites historical records. Do not delete any populated tuition records during rollback.

The complete classic-script page is also tested with the actual bundled SDK, including a stored session and role lookup. The old global `URL` constant was renamed to avoid shadowing the browser URL constructor.
