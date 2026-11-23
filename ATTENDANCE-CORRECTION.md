# Correcting a wrongly recorded absence

In the manager's daily/weekly/monthly attendance cards, an absent session has an “اصلاح به حاضر” action. The compact confirmation form shows the learner, course, date/time, old/new status and requires an editable reason. It updates the same session through `correct_absence`, preserving its ID, teacher ownership snapshot, time, tuition paid flags and consumed-session count. The existing attendance guard calculates the completed-session teacher share once; no payroll payment or receipt is created.

Only a verified database admin role can correct an active student's already-started absent session. Teachers, secretaries, students and anonymous callers are denied. Ordinary PATCH requests cannot change finalized sessions, and client-set configuration cannot enable the private transaction context.

The operation locks the existing class/session, stores an immutable manager-only audit record and activity entry, and returns the previous successful result for identical retries. Reusing a request key with different content or correcting an already completed session is rejected. This intentionally supports absence-to-present correction, not reopening or deleting finalized lessons.

Validation uses isolated PostgreSQL and browser fixtures, not real student mutations: permission denial, receipt/tuition and teacher snapshot preservation, consumed-session count, teacher share, one audit entry, retry/double-click behavior, offline failure and account changes. Mobile at 390px and desktop were visually checked. No production attendance record was automatically selected or corrected during release.
