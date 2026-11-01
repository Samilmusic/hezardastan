create function public.student_guard() returns trigger language plpgsql set search_path='' as $$begin
perform pg_advisory_xact_lock(hashtext(new.teacher_id::text));
if not exists(select 1 from public.teachers t where t.id=new.teacher_id and new.subject=any(t.subjects)) then raise exception 'رشته با استاد مطابقت ندارد';end if;
if exists(select 1 from public.students s where s.id<>new.id and s.teacher_id=new.teacher_id and s.weekday=new.weekday and abs(extract(epoch from (s.class_time-new.class_time)))<1200) then raise exception 'تداخل کلاس ۲۰ دقیقه‌ای استاد';end if;
if TG_OP='UPDATE' and (old.weekday,old.class_time,old.teacher_id) is distinct from (new.weekday,new.class_time,new.teacher_id) then raise exception 'زمان و استاد هنرجو ثابت است؛ انتقال باید توسط مدیریت بررسی شود';end if;return new;end$$;
create trigger student_guard before insert or update on public.students for each row execute function public.student_guard();
create table public.payroll(id uuid primary key default gen_random_uuid(),teacher_id uuid not null references public.teachers(id),amount bigint not null check(amount>0),reference text not null unique,created_at timestamptz not null default now());
alter table public.payroll enable row level security;
create policy admin_all on public.payroll for all to authenticated using(academy_private.is_admin()) with check(academy_private.is_admin());
grant select,insert on public.payroll to authenticated;
create function public.payroll_guard() returns trigger language plpgsql set search_path='' as $$declare earned bigint;paid bigint;begin
perform pg_advisory_xact_lock(hashtext(new.teacher_id::text));
select coalesce(sum(c.teacher_share),0) into earned from public.sessions c join public.students s on s.id=c.student_id where s.teacher_id=new.teacher_id;
select coalesce(sum(p.amount),0) into paid from public.payroll p where p.teacher_id=new.teacher_id;
if new.amount>earned-paid then raise exception 'مبلغ بیشتر از دستمزد تسویه‌نشده استاد است';end if;return new;end$$;
create trigger payroll_guard before insert on public.payroll for each row execute function public.payroll_guard();
