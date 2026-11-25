# Teacher earnings after management discounts

Session earnings are calculated in Postgres as `round(round(month.session_price * (100 - month.discount_percent) / 100) * 0.60)`. Only completed lessons earn a share; other statuses remain zero. A missing monthly record retains the legacy 300,000 toman rule. Notex credit remains a separate academy-funded credit and is not reinterpreted as a management percentage discount.

The month snapshot is used, not today's class default. Existing price/receipt/Notex restrictions and attendance validation are preserved. Correcting an absence uses the same net share. Allowed tuition percentage edits reprice completed sessions within that month. Archived records remain immutable.

The internal share-only transaction context is inaccessible to public, anonymous and authenticated roles. Each actual repair stores old/new share, tuition basis and actor in a private revision table and academy activity. A repeat recalculation with unchanged amounts creates no second revision. Payroll limits use historical session instructors and preserve actual payouts, even if a later authorized revision creates an overpayment balance. UI displays payable balance or excess recorded payouts.

## Verified 25 November 2026

- Production contained 45 completed sessions and no payroll records at inspection. Nine earnings needed correction: combined shares 2,700,000 → 2,250,000 toman. Nine audited repairs completed; remaining mismatches and residual correction contexts: zero. No student, tuition, receipt, attendance identity or payroll records were deleted.
- Five focused tests passed: audited backfill, 20%/50%/100% discounts, custom rates, immutable paid-month prices, corrected absences, historical instructor settlement, duplicate recalculation, non-manager restrictions, overpayment guard and report display.
- Security advisory comparison: private deny-all tables intentionally have RLS without client policies; existing leaked-password protection warning remains unchanged. No secret or public privileged endpoint added.

Migration: `db/teacher_share_discounts.sql`, applied as `teacher_earnings_after_management_discount`.
