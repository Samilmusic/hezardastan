create function academy_private.enrollment_log() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.academy_activity(actor,action,entity_id) values(new.user_id,'registration_submitted',new.id);return new;end$$;
revoke all on function academy_private.enrollment_log() from public,anon,authenticated;
create trigger enrollment_log after insert on public.enrollment_requests for each row execute function academy_private.enrollment_log();
-- Preserve the original term guard for records that have not been migrated.
alter function public.session_guard() rename to legacy_session_guard;
create function public.session_guard() returns trigger language plpgsql security definer set search_path='' as $$declare t public.monthly_tuition;i int;credits int;debt bigint;begin
if TG_OP='UPDATE' and old.status<>'scheduled' then raise exception 'جلسه نهایی شده قابل تغییر نیست';end if;
if new.status in('completed','absent') then
 perform 1 from public.students where id=new.student_id for update;
 select mt.* into t from public.monthly_tuition mt join public.academy_months m on m.key=mt.month_key where mt.student_id=new.student_id and mt.published and (new.starts_at at time zone 'Asia/Tehran')::date between m.starts_on and m.ends_on;
 if found then i:=array_position(t.dates,(new.starts_at at time zone 'Asia/Tehran')::date);if i is null or not t.paid[i] then raise exception 'شهریه این جلسه تأیید نشده است';end if;
 else
 if exists(select 1 from public.monthly_tuition where student_id=new.student_id) then raise exception 'جدول شهریه این ماه هنوز تأیید نشده است';end if;
 select s.opening_credit+coalesce((select sum(p.terms*4) from public.payments p where p.student_id=s.id and p.status='approved' and p.purpose='tuition'),0)-(select count(*) from public.sessions c where c.student_id=s.id and c.status in('completed','absent') and c.id<>new.id),s.opening_debt-coalesce((select sum(p.amount) from public.payments p where p.student_id=s.id and p.status='approved' and p.purpose='opening_debt'),0) into credits,debt from public.students s where s.id=new.student_id;
 if credits<=0 or debt>0 then raise exception 'شهریه تأییدشده کافی نیست';end if;
 end if;
end if;new.teacher_share:=case when new.status='completed' then 300000 else 0 end;return new;end$$;
-- Rebind the existing attendance trigger to the new implementation.
drop trigger if exists session_guard on public.sessions;

create trigger session_guard before insert or update on public.sessions for each row execute function public.session_guard();
revoke all on function public.session_guard() from public,anon,authenticated;
