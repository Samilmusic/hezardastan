# Manager absence correction

Managers can use “اصلاح به حاضر” on an absent session, review the learner/course/time, edit a required reason and explicitly confirm. The same session becomes completed; its identity, time, instructor snapshot, receipts, paid tuition flags and consumed-session count remain unchanged. The existing attendance rule calculates the completed-session teacher share once. No receipt or payroll payment is created.

Server authorization verifies the real admin role. Direct PATCH of finalized lessons remains blocked. A private transaction context allows this exact absent-to-completed transition only. The manager-only immutable audit table and activity entry record the actor, reason, original/new status and teacher shares. Unique request keys and session locking prevent duplicate corrections; identical retries return the previous result.

Before the execution environment disconnected, 11 focused automated tests passed, including isolated PostgreSQL permission denial, unchanged financial snapshots, instructor/session identity preservation, exact share, single audit, retries, double-click prevention and account changes. Synthetic mobile (390px) and desktop browser flows were checked. No production learner attendance was automatically corrected.
