-- Explicit manager correction; no session or financial history is deleted.
create table public.attendance_corrections(
 id uuid primary key default gen_random_uuid(),actor uuid not null references auth.users(id),request_key uuid not null,
 session_id uuid not null references public.sessions(id),reason text not null check(length(btrim(reason)) between 3 and 1000),
 before_status text not null check(before_status='absent'),after_status text not null check(after_status='completed'),
 before_share bigint not null,after_share bigint not null,created_at timestamptz not null default now(),
 unique(actor,request_key),unique(session_id));
alter table public.attendance_corrections enable row level security;
revoke all on public.attendance_corrections from public,anon,authenticated;
grant select on public.attendance_corrections to authenticated;
create policy attendance_corrections_manager_read on public.attendance_corrections for select to authenticated using(academy_private.is_admin());
create table academy_private.attendance_correction_context(tx bigint,session_id uuid,actor uuid not null,primary key(tx,session_id));
alter table academy_private.attendance_correction_context enable row level security;
revoke all on academy_private.attendance_correction_context from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.session_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare t public.monthly_tuition;i int;credits int;debt bigint;begin
if TG_OP='UPDATE' and old.status<>'scheduled' then
 if old.status<>'absent' or new.status<>'completed' or not academy_private.is_admin() or not exists(select 1 from academy_private.attendance_correction_context where tx=txid_current() and session_id=old.id and actor=auth.uid()) or (to_jsonb(new)-array['status','teacher_share']) is distinct from (to_jsonb(old)-array['status','teacher_share']) then raise exception 'جلسه نهایی فقط از مسیر اصلاح حضور مدیر قابل تغییر است';end if;
end if;
if new.status in('completed','absent') then
 perform 1 from public.students where id=new.student_id for update;
 select mt.* into t from public.monthly_tuition mt join public.academy_months m on m.key=mt.month_key where mt.student_id=new.student_id and mt.published and (new.starts_at at time zone 'Asia/Tehran')::date between m.starts_on and m.ends_on;
 if found then i:=array_position(t.dates,(new.starts_at at time zone 'Asia/Tehran')::date);if i is null or not t.paid[i] then raise exception 'شهریه این جلسه تأیید نشده است';end if;
 else
 if exists(select 1 from public.monthly_tuition where student_id=new.student_id) then raise exception 'جدول شهریه این ماه هنوز تأیید نشده است';end if;
 select s.opening_credit+coalesce((select sum(p.terms*4) from public.payments p where p.student_id=s.id and p.status='approved' and p.purpose='tuition'),0)-(select count(*) from public.sessions c where c.student_id=s.id and c.status in('completed','absent') and c.id<>new.id),s.opening_debt-coalesce((select sum(p.amount) from public.payments p where p.student_id=s.id and p.status='approved' and p.purpose='opening_debt'),0) into credits,debt from public.students s where s.id=new.student_id;
 if credits<=0 or debt>0 then raise exception 'شهریه تأییدشده کافی نیست';end if;
 end if;
end if;new.teacher_share:=case when new.status='completed' then 300000 else 0 end;return new;end$function$
;
create function academy_private.correct_absence(target_session uuid,reason text,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();s public.sessions;c public.attendance_corrections;old_share bigint;
begin
 if who is null or not academy_private.is_admin() then raise exception 'اصلاح حضور فقط برای مدیر مجاز است';end if;
 if request_key is null or length(btrim(coalesce(reason,''))) not between 3 and 1000 then raise exception 'دلیل اصلاح را در ۳ تا ۱۰۰۰ کاراکتر بنویسید';end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text||request_key::text,41));
 select * into c from public.attendance_corrections x where x.actor=who and x.request_key=correct_absence.request_key;
 if found then
  if c.session_id<>target_session or c.reason<>btrim(reason) then raise exception 'شناسه درخواست تکراری با اطلاعات متفاوت';end if;
  return jsonb_build_object('completed',true,'duplicate',true,'id',c.id,'session_id',c.session_id,'status',c.after_status);
 end if;
 select * into strict s from public.sessions where id=target_session;
 perform 1 from public.students where id=s.student_id and archived_at is null for update;
 if not found then raise exception 'پرونده فعال هنرجو یافت نشد';end if;
 select * into strict s from public.sessions where id=target_session for update;
 if s.status<>'absent' then raise exception 'این جلسه دیگر در وضعیت غیبت نیست؛ صفحه را به‌روزرسانی کنید';end if;
 if s.starts_at>now() then raise exception 'جلسه آینده قابل اصلاح به حاضر نیست';end if;
 old_share:=s.teacher_share;
 insert into academy_private.attendance_correction_context(tx,session_id,actor) values(txid_current(),s.id,who);
 update public.sessions set status='completed' where id=s.id returning * into s;
 delete from academy_private.attendance_correction_context where tx=txid_current() and session_id=s.id;
 insert into public.attendance_corrections(actor,request_key,session_id,reason,before_status,after_status,before_share,after_share)
 values(who,request_key,s.id,btrim(reason),'absent','completed',old_share,s.teacher_share) returning * into c;
 insert into public.academy_activity(actor,action,entity_id,details) values(who,'attendance_corrected',s.id,jsonb_build_object('correction_id',c.id,'student_id',s.student_id,'before','absent','after','completed','reason',c.reason,'before_share',old_share,'after_share',s.teacher_share));
 return jsonb_build_object('completed',true,'id',c.id,'session_id',s.id,'status',s.status);
end$$;
revoke all on function academy_private.correct_absence(uuid,text,uuid) from public,anon;grant execute on function academy_private.correct_absence(uuid,text,uuid) to authenticated;
create function public.correct_absence(target_session uuid,reason text,request_key uuid) returns jsonb language sql security invoker set search_path='' as $$select academy_private.correct_absence(target_session,reason,request_key)$$;
revoke all on function public.correct_absence(uuid,text,uuid) from public,anon;grant execute on function public.correct_absence(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
