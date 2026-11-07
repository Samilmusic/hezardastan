# QR enrollment and monthly tuition

Prepared for review; not activated on the public site.

- Student QR: https://avayehezardastan.com/portal.html#register
- Students enter national ID and a password of at least six characters; staff keep their existing login.
- Registration remains pending until the administrator reviews the requested teacher, subject, weekday and 20-minute time slot.
- Four separately settled sessions per Jalali month, beginning 1405/09. First four weekly occurrences are used; a fifth occurrence is not automatically invoiced.
- Card, bank transfer and academy payments all require a unique receipt/reference, then administrator approval.
- Pending receipts do not settle sessions; duplicate approvals and overlapping pending allocations are rejected under row locks.
- Registration and tuition rows have RLS; private admin functions check the database staff role.

## Activation verification

The owner explicitly approved deployment of the national-ID/password endpoint on 2026-11-07. The Edge Function is active with domain-restricted CORS and request throttling. Monthly attendance guard and registration audit trigger are applied in place, preserving legacy records.

Verified: real temporary email-free registration and national-ID/password login; rollback-only approval of that request; four-session month allocation; paid-session admission; unpaid-session rejection; and administrator receipt approval. Temporary account and test logs were removed after verification. Staff retain email login and the portal rejects email-login accounts lacking a staff role.
