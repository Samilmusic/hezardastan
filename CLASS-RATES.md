# Class session prices and duration

Managers choose the default 500,000 toman or a custom integer session price in monthly tuition, enrollment approval and independent added-class forms. A saved month snapshots its own `session_price`; the same value becomes the class default for subsequently created months. Existing other months never reprice automatically. Student and secretary mutations are denied server-side.

A month with paid slots, pending/approved receipt, pending/approved Notex tuition claim or finalized sessions cannot be repriced. No historical receipts, payments, dates, grades or teacher payout rules are rewritten. Manager actions use the existing activity log and an explicit fee confirmation.

Net session amount is `round(session_price * (100-discount_percent)/100) - notex_credit/4`. New Notex tuition credits are monetary snapshots, guarded through private transaction context; this avoids inaccurate two-decimal percentage conversion for prices such as 600k or 700k. Existing Notex percentage credits stay unchanged. Credit always follows the current wallet reservation/approval flow.

Hajian solfege and voice-production classes occupy 30 minutes, other current courses remain 20. Interval collision checks are asymmetric: a 30m 17:00 class blocks a 17:20 start, while touching endpoints are allowed. Active rows, pending reservations, class-change previews and future session collisions all use real durations. Existing class start times stay unchanged. Registration, class changes and assistant capacity suggestions share the new timing rules.

Validation: isolated PostgreSQL roles and fixtures, class-specific receipts, preserving historical month prices, authorization denial, Notex exact-value credit and duplicate safety, actual classic-script form payloads, student read-only amounts, and desktop/mobile synthetic browser checks. Production verification compares receipt/session hashes and counts before/after migration. No production test transactions are created.
