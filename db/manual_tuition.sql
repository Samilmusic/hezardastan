-- Opening balances are snapshots; historic payments are not re-issued as new terms.
alter table public.students add column opening_paid bigint not null default 0 check(opening_paid>=0), add column balance_date date not null default current_date, add column opening_note text not null default '';
alter table public.payments drop constraint payments_check, drop constraint payments_terms_check;
alter table public.payments add column purpose text not null default 'tuition' check(purpose in ('tuition','opening_debt')), add column status text not null default 'approved' check(status in ('pending','approved','rejected')), add column submitted_by uuid references auth.users(id), add column reviewed_by uuid references auth.users(id), add column reviewed_at timestamptz, add column review_note text not null default '', add column payer_note text not null default '', add column paid_on date not null default current_date;
alter table public.payments add constraint payment_amount_valid check(amount>0 and ((purpose='tuition' and terms in(1,2) and amount=terms*2000000) or (purpose='opening_debt' and terms=0)));
create index payments_student_status on public.payments(student_id,status);
create table public.tuition_bank_account(id boolean primary key default true check(id),holder text not null default '',card text not null default '' check(card='' or card ~ '^[0-9]{16}$'),iban text not null default '' check(iban='' or iban ~ '^IR[0-9]{24}$'),bank_name text not null default '',instructions text not null default '',updated_at timestamptz not null default now());
insert into public.tuition_bank_account(id) values(true);
alter table public.tuition_bank_account enable row level security;
grant select,update on public.tuition_bank_account to authenticated;
create policy account_read on public.tuition_bank_account for select to authenticated using(true);
create policy account_admin_update on public.tuition_bank_account for update to authenticated using(academy_private.is_admin()) with check(academy_private.is_admin());
create policy student_submit_payment on public.payments for insert to authenticated with check(status='pending' and submitted_by=(select auth.uid()) and exists(select 1 from public.students s where s.id=student_id and s.user_id=(select auth.uid())));
create function academy_private.payment_review_guard() returns trigger language plpgsql security definer set search_path='' as $$declare remaining bigint;begin
if auth.uid() is null then raise exception 'ورود لازم است';end if;
if TG_OP='DELETE' then raise exception 'سابقه مالی قابل حذف نیست';end if;
perform 1 from public.students where id=new.student_id for update;
new.reference:=btrim(new.reference);
if length(new.reference)<4 or length(new.reference)>64 then raise exception 'شماره پیگیری باید ۴ تا ۶۴ کاراکتر باشد';end if;
if new.paid_on>current_date then raise exception 'تاریخ واریز نمی‌تواند آینده باشد';end if;
if TG_OP='INSERT' then
 if not academy_private.is_office() then
  if not exists(select 1 from public.students where id=new.student_id and user_id=auth.uid()) or new.status<>'pending' then raise exception 'ثبت فقط برای پرونده خودتان مجاز است';end if;
  if not exists(select 1 from public.tuition_bank_account where holder<>'' and card<>'' and iban<>'') then raise exception 'حساب بانکی آموزشگاه هنوز تکمیل نشده است';end if;
 end if;
 if new.status not in('pending','approved') then raise exception 'وضعیت اولیه نامعتبر';end if;
 new.submitted_by:=auth.uid();new.reviewed_by:=null;new.reviewed_at:=null;new.review_note:='';
else
 if not academy_private.is_office() or old.status<>'pending' or new.status not in('approved','rejected') then raise exception 'فقط پرداخت در انتظار را می‌توان بررسی کرد';end if;
 if (to_jsonb(new)-array['status','review_note','reviewed_at','reviewed_by']) is distinct from (to_jsonb(old)-array['status','review_note','reviewed_at','reviewed_by']) then raise exception 'مشخصات واریز قابل تغییر نیست';end if;
 if new.status='rejected' and length(btrim(new.review_note))<3 then raise exception 'دلیل رد را بنویسید';end if;
end if;
if new.purpose='opening_debt' and new.status<>'rejected' then
 select s.opening_debt-coalesce((select sum(amount) from public.payments p where p.student_id=s.id and p.status='approved' and p.purpose='opening_debt' and p.id<>new.id),0) into remaining from public.students s where s.id=new.student_id;
 if new.amount>remaining then raise exception 'مبلغ بیشتر از مانده بدهی انتقالی است';end if;
end if;
if new.status='approved' then new.reviewed_by:=auth.uid();new.reviewed_at:=now();elsif new.status='rejected' then new.reviewed_by:=auth.uid();new.reviewed_at:=now();end if;
return new;end$$;
revoke all on function academy_private.payment_review_guard() from public,anon,authenticated;
create trigger payment_review_guard before insert or update or delete on public.payments for each row execute function academy_private.payment_review_guard();
create function academy_private.student_opening_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
if TG_OP='UPDATE' and (old.opening_paid,old.opening_debt,old.opening_credit,old.balance_date) is distinct from (new.opening_paid,new.opening_debt,new.opening_credit,new.balance_date) then raise exception 'مانده افتتاحیه پس از ثبت قابل تغییر مستقیم نیست؛ با مدیر برای اصلاح مستند هماهنگ کنید';end if;
if TG_OP='INSERT' then
 new.email:=nullif(lower(btrim(new.email)),'');
 if new.email is not null then select id into new.user_id from auth.users where lower(email)=new.email and email_confirmed_at is not null;end if;
end if;return new;end$$;
revoke all on function academy_private.student_opening_guard() from public,anon,authenticated;
create trigger student_opening_guard before insert or update on public.students for each row execute function academy_private.student_opening_guard();
create or replace function public.session_guard() returns trigger language plpgsql set search_path='' as $$declare credits int;debt bigint;begin
if TG_OP='UPDATE' and old.status<>'scheduled' then raise exception 'جلسه نهایی شده قابل تغییر نیست';end if;
if new.status in ('completed','absent') then
perform 1 from public.students where id=new.student_id for update;
select s.opening_credit+coalesce((select sum(p.terms*4) from public.payments p where p.student_id=s.id and p.status='approved' and p.purpose='tuition'),0)-(select count(*) from public.sessions c where c.student_id=s.id and c.status in ('completed','absent') and c.id<>new.id),s.opening_debt-coalesce((select sum(p.amount) from public.payments p where p.student_id=s.id and p.status='approved' and p.purpose='opening_debt'),0) into credits,debt from public.students s where s.id=new.student_id;
if credits<=0 or debt>0 then raise exception 'شهریه تأییدشده کافی نیست؛ حضور مجاز نیست';end if;
end if;new.teacher_share:=case when new.status='completed' then 300000 else 0 end;return new;end$$;
-- Pending receipts never create absence entitlements.
create or replace function public.absence_guard() returns trigger language plpgsql set search_path='' as $$declare start_time timestamptz;allowed int;used int;begin
select starts_at into start_time from public.sessions where id=new.session_id and student_id=new.student_id and status='scheduled';
if start_time is null or start_time<now()+interval '4 days' then raise exception 'اعلام غیبت حداقل ۴ روز قبل لازم است';end if;
select coalesce(sum(terms/2),0) into allowed from public.payments where student_id=new.student_id and status='approved' and purpose='tuition';
select count(*) into used from public.absence_requests where student_id=new.student_id and status<>'rejected' and id<>new.id;
if used>=allowed then raise exception 'سهمیه غیبت مجاز ندارید';end if;return new;end$$;
