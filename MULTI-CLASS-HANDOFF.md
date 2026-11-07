# Academy multi-class and archive update

Avaye Hezardastan only: Site appgprj_6ae71cf9269481919e539bb6ec6aab86; Supabase azastzjxnzjaloxmnbfd; GitHub Samilmusic/hezardastan.

One canonical learner_profiles identity groups independent course registrations. Legacy students registration IDs and all financial foreign keys are retained. New classes copy identity/contact information, never opening balances. An admin RPC creates the new course and its independent four-session tuition in one transaction. Both teacher and learner time conflicts are prevented. Account linking synchronizes across courses. The CRM counts people once and the student portal shows every course under the same account.

Remove-with-reason archives every course for that learner, preserving tuition, payments, attendance and payroll. An audit record retains manager, reason, name and time. Active choices exclude archived learners. Permanent deletion is blocked. Restore rejects occupied fixed slots and rolls the entire action back. Internal archive reasons are office-only. Admin RPCs check the database staff role.

Apply db/multiple_classes_and_archive.sql followed by db/multiple_classes_engine.sql in one migration before publishing. The engine file derives from the inspected live function, preserving staff-account relink protections. SQL replaces old one-course uniqueness constraints with canonical identity uniqueness and active teacher-slot uniqueness; no student or payment rows are deleted.

Verification: npm ci --prefix auth/browser; node --test tests/*.test.cjs. Eleven tests include a real in-memory PostgreSQL engine applying the complete baseline and migration, testing preservation of old payment data, independent balances, conflict rejection, rollback on invalid tuition, RLS, role checks, account sync, archive and restore. Production must also pass rollback-only QA after native migration confirmation. Do not claim publication while confirmation is expired.

Rollback: redeploy frontend version 32 if needed. Do not restore the old unique constraints after creating multiple courses, and never discard historical course/financial rows.
