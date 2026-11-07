-- Canonical learner identity; legacy students IDs remain course registration IDs.
-- No student, receipt, attendance or payment rows are deleted.
create table public.learner_profiles(id uuid primary key default gen_random_uuid(),national_id text not null unique check(national_id~'^[0-9]{10}$'),user_id uuid unique references auth.users(id),archived_at timestamptz,archived_by uuid references auth.users(id),archive_reason text,created_at timestamptz not null default now(),check((archived_at is null and archived_by is null and archive_reason is null) or (archived_at is not null and archived_by is not null and length(btrim(archive_reason)) between 3 and 1000)));
alter table public.learner_profiles enable row level security;
revoke all on public.learner_profiles from anon,authenticated;
grant select on public.learner_profiles to authenticated;
create policy learner_profile_read on public.learner_profiles for select to authenticated using((select academy_private.is_office()));
insert into public.learner_profiles(id,national_id,user_id,created_at) select id,national_id,user_id,coalesce(created_at,now()) from public.students;
alter table public.students add column profile_id uuid references public.learner_profiles(id),add column archived_at timestamptz;
update public.students set profile_id=id;
alter table public.students alter column profile_id set not null;
-- Replace one-course uniqueness with one canonical identity and independent slots.
alter table public.students drop constraint students_national_id_key,drop constraint students_user_id_key,drop constraint students_teacher_id_weekday_class_time_key;
drop index public.students_email_unique;
create index students_profile_id on public.students(profile_id);
create index students_user_id on public.students(user_id);
create index students_national_id on public.students(national_id);
create index students_email on public.students(lower(email)) where email is not null;
create unique index students_active_teacher_slot on public.students(teacher_id,weekday,class_time) where archived_at is null;
comment on table public.students is 'Course registrations grouped by learner_profiles. Legacy name and IDs preserve ledger foreign keys.';

create function academy_private.class_profile_guard() returns trigger language plpgsql security definer set search_path='' as $$declare p public.learner_profiles;linked uuid;begin
if TG_OP='INSERT' then
 new.email:=nullif(lower(btrim(new.email)),'');
 if new.email is not null then select id into linked from auth.users where lower(email)=new.email and email_confirmed_at is not null;if linked is not null then new.user_id:=linked;end if;end if;
 perform pg_advisory_xact_lock(hashtext('learner:'||new.national_id));
 if new.profile_id is null then
  if exists(select 1 from public.learner_profiles where national_id=new.national_id) then raise exception 'این هنرجو پرونده دارد؛ از افزودن کلاس در پرونده استفاده کنید';end if;
  insert into public.learner_profiles(national_id,user_id) values(new.national_id,new.user_id) returning * into p;new.profile_id:=p.id;
 else
  if not academy_private.is_admin() then raise exception 'افزودن کلاس فقط توسط مدیر مجاز است';end if;
  select * into strict p from public.learner_profiles where id=new.profile_id for update;
 end if;
else
 if new.profile_id is distinct from old.profile_id or new.national_id is distinct from old.national_id then raise exception 'هویت هنرجو قابل جابه‌جایی نیست';end if;
 select * into strict p from public.learner_profiles where id=new.profile_id for update;
 if new.user_id is distinct from old.user_id then
  if auth.uid() is not null and not academy_private.is_admin() then raise exception 'اتصال حساب فقط توسط مدیر مجاز است';end if;
  if exists(select 1 from public.academy_staff where user_id=p.user_id) then raise exception 'پرونده به حساب کارکنان متصل است';end if;
  update public.learner_profiles set user_id=new.user_id where id=p.id;p.user_id:=new.user_id;
 end if;
end if;
if p.national_id is distinct from new.national_id or p.user_id is distinct from new.user_id then raise exception 'کلاس باید به همان هویت و حساب هنرجو متصل باشد';end if;
if TG_OP='INSERT' and p.archived_at is not null then raise exception 'هنرجو حذف شده است؛ ابتدا بازیابی کنید';end if;
if new.archived_at is distinct from p.archived_at then raise exception 'برای حذف یا بازیابی از عملیات پرونده استفاده کنید';end if;
return new;end $$;
revoke all on function academy_private.class_profile_guard() from public,anon,authenticated;
create trigger a_student_profile before insert or update on public.students for each row execute function academy_private.class_profile_guard();
create function academy_private.sync_learner_account() returns trigger language plpgsql security definer set search_path='' as $$begin
if new.user_id is distinct from old.user_id then update public.students set user_id=new.user_id where profile_id=new.profile_id and id<>new.id and user_id is distinct from new.user_id;end if;return new;end $$;
revoke all on function academy_private.sync_learner_account() from public,anon,authenticated;
create trigger student_account_sync after update of user_id on public.students for each row execute function academy_private.sync_learner_account();

create or replace function public.student_guard() returns trigger language plpgsql set search_path='' as $$begin
if new.archived_at is not null then return new;end if;
perform pg_advisory_xact_lock(hashtext(new.teacher_id::text));
if not exists(select 1 from public.teachers t where t.id=new.teacher_id and new.subject=any(t.subjects)) then raise exception 'رشته با استاد مطابقت ندارد';end if;
if TG_OP='INSERT' then if extract(minute from new.class_time)::int%20<>0 or extract(second from new.class_time)<>0 then raise exception 'ساعت باید در گام‌های ۲۰ دقیقه باشد';end if;end if;
if exists(select 1 from public.students s where s.id<>new.id and s.archived_at is null and s.weekday=new.weekday and (s.teacher_id=new.teacher_id or s.profile_id=new.profile_id) and abs(extract(epoch from (s.class_time-new.class_time)))<1200) then raise exception 'تداخل کلاس ۲۰ دقیقه‌ای استاد یا هنرجو';end if;
if TG_OP='UPDATE' and (old.weekday,old.class_time,old.teacher_id) is distinct from (new.weekday,new.class_time,new.teacher_id) then raise exception 'زمان و استاد کلاس ثابت است؛ کلاس دیگری اضافه کنید';end if;return new;end $$;

create function academy_private.learner_action(op text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare source public.students;p public.learner_profiles;course uuid;tuition jsonb;reason text;begin
if auth.uid() is null or not academy_private.is_admin() then raise exception 'فقط مدیر مجاز است';end if;
select * into strict source from public.students where id=(data->>'student_id')::uuid;
select * into strict p from public.learner_profiles where id=source.profile_id for update;
if op='add_class' then
 if p.archived_at is not null then raise exception 'هنرجو حذف شده است؛ ابتدا بازیابی کنید';end if;
 if jsonb_typeof(data->'paid') is distinct from 'array' then raise exception 'وضعیت چهار جلسه لازم است';end if;
 if jsonb_array_length(data->'paid')<>4 or exists(select 1 from jsonb_array_elements(data->'paid') v where jsonb_typeof(v)<>'boolean') then raise exception 'چهار وضعیت پرداخت معتبر لازم است';end if;
 if nullif(data->>'month_key','') is null then raise exception 'ماه شهریه را انتخاب کنید';end if;
 insert into public.students(profile_id,user_id,national_id,first_name,last_name,father_name,mobile,birth_date,home_phone,address,email,rules_accepted_at,teacher_id,subject,weekday,class_time,opening_note)
 values(p.id,p.user_id,p.national_id,source.first_name,source.last_name,source.father_name,source.mobile,source.birth_date,source.home_phone,source.address,source.email,source.rules_accepted_at,(data->>'teacher_id')::uuid,data->>'subject',(data->>'weekday')::int,(data->>'class_time')::time,'کلاس جدید؛ ماندهٔ قبلی منتقل نشده است') returning id into course;
 tuition:=academy_private.enrollment_action('month',jsonb_build_object('student_id',course,'month_key',data->>'month_key','paid',data->'paid','note',coalesce(data->>'note','')));
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),'add_class',p.id,jsonb_build_object('student_name',source.first_name||' '||source.last_name,'class_id',course,'teacher_id',data->>'teacher_id','month_key',data->>'month_key'));
 return jsonb_build_object('student_id',course,'profile_id',p.id,'tuition_id',tuition->>'id');
elsif op in('archive','restore') then
 reason:=btrim(coalesce(data->>'reason',''));if length(reason) not between 3 and 1000 then raise exception 'دلیل را بین ۳ تا ۱۰۰۰ حرف وارد کنید';end if;
 if op='archive' then
  if p.archived_at is not null then raise exception 'هنرجو قبلاً حذف شده است';end if;
  update public.learner_profiles set archived_at=now(),archived_by=auth.uid(),archive_reason=reason where id=p.id;
  update public.students set archived_at=now() where profile_id=p.id;
 else
  if p.archived_at is null then raise exception 'هنرجو فعال است';end if;
  update public.learner_profiles set archived_at=null,archived_by=null,archive_reason=null where id=p.id;
  update public.students set archived_at=null where profile_id=p.id;
 end if;
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),case when op='archive' then 'archive_student' else 'restore_student' end,p.id,jsonb_build_object('student_name',source.first_name||' '||source.last_name,'reason',reason,'class_count',(select count(*) from public.students where profile_id=p.id)));
 return jsonb_build_object('profile_id',p.id);
end if;raise exception 'عملیات نامعتبر';end $$;
revoke all on function academy_private.learner_action(text,jsonb) from public,anon;
grant execute on function academy_private.learner_action(text,jsonb) to authenticated;
create function public.learner_action(op text,data jsonb) returns jsonb language sql security invoker set search_path='' as $$select academy_private.learner_action(op,data)$$;
revoke all on function public.learner_action(text,jsonb) from public,anon;
grant execute on function public.learner_action(text,jsonb) to authenticated;
revoke delete on public.students from authenticated;
create function academy_private.prevent_learner_delete() returns trigger language plpgsql set search_path='' as $$begin raise exception 'حذف دائمی مجاز نیست؛ حذف با دلیل را در پرونده انتخاب کنید';end $$;
revoke all on function academy_private.prevent_learner_delete() from public,anon,authenticated;
create trigger student_no_hard_delete before delete on public.students for each row execute function academy_private.prevent_learner_delete();
create function academy_private.active_class_session_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
if exists(select 1 from public.students where id=new.student_id and archived_at is not null) and (TG_OP='INSERT' or new.status in('scheduled','completed','absent')) then raise exception 'ثبت جلسه برای هنرجوی حذف‌شده مجاز نیست';end if;return new;end $$;
revoke all on function academy_private.active_class_session_guard() from public,anon,authenticated;
create trigger a_active_class_session before insert or update on public.sessions for each row execute function academy_private.active_class_session_guard();
