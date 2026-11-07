# QR enrollment and monthly tuition

Prepared for review; not activated on the public site.

- Student QR: https://avayehezardastan.com/portal.html#register
- Students enter national ID and a password of at least six characters; staff keep their existing login.
- Registration remains pending until the administrator reviews the requested teacher, subject, weekday and 20-minute time slot.
- Four separately settled sessions per Jalali month, beginning 1405/09. First four weekly occurrences are used; a fifth occurrence is not automatically invoiced.
- Card, bank transfer and academy payments all require a unique receipt/reference, then administrator approval.
- Pending receipts do not settle sessions; duplicate approvals and overlapping pending allocations are rejected under row locks.
- Registration and tuition rows have RLS; private admin functions check the database staff role.

## Deployment state

`db/enrollment_monthly.sql` is applied to the linked academy database. No existing student/payment records were changed. A rollback-only database test verified a two-paid/two-unpaid month, receipt submission, approval and duplicate-approval rejection. Portal script initialization and syntax pass.

`db/monthly_attendance.sql` is prepared but NOT applied: the migration confirmation expired. It must be applied and verified before activation so attendance uses the per-session ledger.

`student-enrollment` Edge Function was NOT deployed. Automatic approval review rejected the unauthenticated registration/login service because it accepts national IDs/passwords, uses a server-side service role and initially used wildcard CORS. The prepared code now restricts CORS to the academy domain and adds per-IP request throttling; deployment still requires explicit approval. Do not publish the portal changes until this endpoint and the attendance guard are active and end-to-end verified.

The QR SVG is prepared for printing but the registration destination must not be advertised before activation. Browser/mobile and real registration end-to-end verification remain pending. Secrets are environment-owned and absent from source.
