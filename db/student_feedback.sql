-- Additive only: does not modify academy records, registrations or payments.
create table public.student_feedback (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 kind text not null check (kind in ('suggestion','criticism','appreciation')),
 subject text not null check (char_length(btrim(subject)) between 3 and 120),
 message text not null check (char_length(btrim(message)) between 10 and 3000),
 status text not null default 'new' check(status in ('new','read')),
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index student_feedback_owner_date on public.student_feedback(user_id,created_at desc);
create index student_feedback_inbox on public.student_feedback(status,created_at desc);
alter table public.student_feedback enable row level security;
revoke all on public.student_feedback from anon,authenticated;
grant select on public.student_feedback to authenticated;
grant insert(user_id,kind,subject,message) on public.student_feedback to authenticated;
grant update(status,read_at) on public.student_feedback to authenticated;
create policy feedback_read on public.student_feedback for select to authenticated
 using (user_id=(select auth.uid()) or (select academy_private.is_admin()));
create policy feedback_submit on public.student_feedback for insert to authenticated
 with check(user_id=(select auth.uid()) and status='new' and read_at is null
 and not exists(select 1 from public.academy_staff where user_id=(select auth.uid()))
 and (exists(select 1 from public.students where user_id=(select auth.uid()))
 or exists(select 1 from public.enrollment_requests where user_id=(select auth.uid()))));
create policy feedback_manager_read on public.student_feedback for update to authenticated
 using((select academy_private.is_admin())) with check((select academy_private.is_admin()));
