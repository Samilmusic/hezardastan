create table public.academy_months(key text primary key,starts_on date not null,ends_on date not null);
create table public.enrollment_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null unique references auth.users(id),national_id text not null unique check(national_id~'^[0-9]{10}$'),details jsonb not null,status text not null default 'pending' check(status in('pending','approved','rejected')),student_id uuid references public.students(id),review_note text not null default '',created_at timestamptz not null default now(),reviewed_at timestamptz);
create table public.monthly_tuition(id uuid primary key default gen_random_uuid(),student_id uuid not null references public.students(id),month_key text not null references public.academy_months(key),dates date[] not null check(cardinality(dates)=4),paid boolean[] not null default array[false,false,false,false] check(cardinality(paid)=4),published boolean not null default false,note text not null default '',unique(student_id,month_key));
create table public.monthly_receipts(id uuid primary key default gen_random_uuid(),tuition_id uuid not null references public.monthly_tuition(id),user_id uuid not null references auth.users(id),slots integer[] not null,amount bigint not null,method text not null check(method in('card','bank','office')),reference text not null unique check(length(reference) between 4 and 64),status text not null default 'pending' check(status in('pending','approved','rejected')),note text not null default '',created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references auth.users(id));
create table public.academy_activity(id bigint generated always as identity primary key,actor uuid references auth.users(id),action text not null,entity_id uuid,details jsonb not null default '{}',created_at timestamptz not null default now());
create table academy_private.signup_limits(bucket text primary key,hits int not null,started timestamptz not null);
alter table public.academy_months enable row level security;alter table public.enrollment_requests enable row level security;alter table public.monthly_tuition enable row level security;alter table public.monthly_receipts enable row level security;alter table public.academy_activity enable row level security;
grant select on public.academy_months,public.enrollment_requests,public.monthly_tuition,public.monthly_receipts,public.academy_activity to authenticated;
create policy months_read on public.academy_months for select to authenticated using(true);
create policy enrollment_read on public.enrollment_requests for select to authenticated using(user_id=auth.uid() or academy_private.is_admin());
create policy tuition_read on public.monthly_tuition for select to authenticated using(academy_private.is_admin() or (published and exists(select 1 from public.students s where s.id=student_id and s.user_id=auth.uid())));
create policy receipt_read on public.monthly_receipts for select to authenticated using(user_id=auth.uid() or academy_private.is_admin());
create policy activity_read on public.academy_activity for select to authenticated using(academy_private.is_admin());
create function public.enrollment_rate_limit(bucket_key text) returns boolean language plpgsql security definer set search_path='' as $$declare n int;begin insert into academy_private.signup_limits values(bucket_key,1,now()) on conflict(bucket) do update set hits=case when signup_limits.started<now()-interval '1 hour' then 1 else signup_limits.hits+1 end,started=case when signup_limits.started<now()-interval '1 hour' then now() else signup_limits.started end returning hits into n;return n<=10;end$$;
revoke all on function public.enrollment_rate_limit(text) from public,anon,authenticated;grant execute on function public.enrollment_rate_limit(text) to service_role;
create function academy_private.enrollment_action(op text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.enrollment_requests;t public.monthly_tuition;p public.monthly_receipts;s public.students;sid uuid;tid uuid;m public.academy_months;ds date[];flags boolean[];sl int[];n int;begin
if auth.uid() is null then raise exception 'ورود لازم است';end if;
if op in('approve','reject','month','review') and not academy_private.is_admin() then raise exception 'فقط مدیر مجاز است';end if;
if op in('approve','reject') then
 select * into strict r from public.enrollment_requests where id=(data->>'id')::uuid for update;
 if r.status<>'pending' then raise exception 'این درخواست قبلاً بررسی شده است';end if;
 if op='reject' then update public.enrollment_requests set status='rejected',review_note=data->>'note',reviewed_at=now() where id=r.id;
 else
 tid:=(data->>'teacher_id')::uuid;
 if not exists(select 1 from public.teachers where id=tid and (data->>'subject')=any(subjects)) then raise exception 'رشته و استاد هماهنگ نیستند';end if;
 if (data->>'weekday')::int not between 0 and 6 or extract(minute from (data->>'class_time')::time)::int%20<>0 or extract(second from (data->>'class_time')::time)<>0 then raise exception 'زمان باید در گام‌های ۲۰ دقیقه باشد';end if;
 select * into s from public.students where national_id=r.national_id for update;
 if found then
 if s.user_id is not null and s.user_id<>r.user_id then raise exception 'پرونده به حساب دیگری متصل است؛ ابتدا هویت را بررسی کنید';end if;
 update public.students set user_id=r.user_id,teacher_id=tid,subject=data->>'subject',weekday=(data->>'weekday')::int,class_time=(data->>'class_time')::time where id=s.id returning id into sid;
 else
 insert into public.students(user_id,first_name,last_name,father_name,national_id,mobile,birth_date,home_phone,address,teacher_id,subject,weekday,class_time,rules_accepted_at) values(r.user_id,r.details->>'first_name',r.details->>'last_name',r.details->>'father_name',r.national_id,r.details->>'mobile',(r.details->>'birth_date')::date,r.details->>'home_phone',r.details->>'address',tid,data->>'subject',(data->>'weekday')::int,(data->>'class_time')::time,now()) returning id into sid;
 end if;
 update public.enrollment_requests set status='approved',student_id=sid,review_note=coalesce(data->>'note',''),reviewed_at=now() where id=r.id;
 end if;
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),op,r.id,data);return jsonb_build_object('student_id',sid);
elsif op='month' then
 sid:=(data->>'student_id')::uuid;select * into strict s from public.students where id=sid for update;select * into strict m from public.academy_months where key=data->>'month_key';
 select array_agg(d::date order by d) into ds from(select d from generate_series(m.starts_on::timestamp,m.ends_on::timestamp,interval '1 day') d where extract(dow from d)=s.weekday order by d limit 4) q;
 select array_agg(value::boolean order by ordinality) into flags from jsonb_array_elements_text(data->'paid') with ordinality;
 if cardinality(flags)<>4 or array_position(flags,null) is not null then raise exception 'چهار وضعیت پرداخت لازم است';end if;
 select * into t from public.monthly_tuition where student_id=sid and month_key=m.key for update;
 if found then
 if exists(select 1 from public.monthly_receipts where tuition_id=t.id and status in('approved','pending')) then raise exception 'ماه دارای رسید است؛ ابتدا رسید را بررسی کنید و از دوباره‌شماری جلوگیری کنید';end if;
 update public.monthly_tuition set paid=flags,published=true,note=coalesce(data->>'note','') where id=t.id returning id into tid;
 else insert into public.monthly_tuition(student_id,month_key,dates,paid,published,note) values(sid,m.key,ds,flags,true,coalesce(data->>'note','')) returning id into tid;end if;
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),op,tid,data);return jsonb_build_object('id',tid);
elsif op='submit' then
 select * into strict t from public.monthly_tuition where id=(data->>'id')::uuid and published for update;
 if not exists(select 1 from public.students where id=t.student_id and user_id=auth.uid()) then raise exception 'فقط پرونده خودتان';end if;
 select array_agg(v::int order by v::int) into sl from (select distinct value v from jsonb_array_elements_text(data->'slots')) q;
 if coalesce(cardinality(sl),0)<1 or exists(select 1 from unnest(sl) k where k not between 1 and 4 or t.paid[k]) then raise exception 'جلسات انتخابی نامعتبر یا پرداخت‌شده‌اند';end if;
 if exists(select 1 from public.monthly_receipts where tuition_id=t.id and status='pending' and slots&&sl) then raise exception 'برای این جلسات رسید در انتظار دارید';end if;
 insert into public.monthly_receipts(tuition_id,user_id,slots,amount,method,reference) values(t.id,auth.uid(),sl,cardinality(sl)*500000,data->>'method',btrim(data->>'reference')) returning id into tid;
 insert into public.academy_activity(actor,action,entity_id) values(auth.uid(),'receipt_submitted',tid);return jsonb_build_object('id',tid);
elsif op='review' then
 select * into strict p from public.monthly_receipts where id=(data->>'id')::uuid for update;
 if p.status<>'pending' then raise exception 'رسید قبلاً بررسی شده است';end if;
 select * into strict t from public.monthly_tuition where id=p.tuition_id for update;
 if data->>'status' not in('approved','rejected') then raise exception 'وضعیت نامعتبر';end if;
 if data->>'status'='approved' then foreach n in array p.slots loop if t.paid[n] then raise exception 'این جلسه قبلاً تسویه شده است';end if;t.paid[n]:=true;end loop;update public.monthly_tuition set paid=t.paid where id=t.id;end if;
 update public.monthly_receipts set status=data->>'status',note=coalesce(data->>'note',''),reviewed_at=now(),reviewed_by=auth.uid() where id=p.id;
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),'receipt_review',p.id,data);return '{}';
end if;raise exception 'عملیات نامعتبر';end$$;
revoke all on function academy_private.enrollment_action(text,jsonb) from public,anon;grant execute on function academy_private.enrollment_action(text,jsonb) to authenticated;
create function public.enrollment_action(op text,data jsonb) returns jsonb language sql security invoker set search_path='' as $$select academy_private.enrollment_action(op,data)$$;
revoke all on function public.enrollment_action(text,jsonb) from public,anon;grant execute on function public.enrollment_action(text,jsonb) to authenticated;
insert into public.academy_months(key,starts_on,ends_on) values ('1405/09','2026-11-22','2026-12-21'),('1405/10','2026-12-22','2027-01-20'),('1405/11','2027-01-21','2027-02-19'),('1405/12','2027-02-20','2027-03-20'),('1406/01','2027-03-21','2027-04-20'),('1406/02','2027-04-21','2027-05-21'),('1406/03','2027-05-22','2027-06-21'),('1406/04','2027-06-22','2027-07-22'),('1406/05','2027-07-23','2027-08-22'),('1406/06','2027-08-23','2027-09-22'),('1406/07','2027-09-23','2027-10-22'),('1406/08','2027-10-23','2027-11-21'),('1406/09','2027-11-22','2027-12-21'),('1406/10','2027-12-22','2028-01-20'),('1406/11','2028-01-21','2028-02-19'),('1406/12','2028-02-20','2028-03-19'),('1407/01','2028-03-20','2028-04-19'),('1407/02','2028-04-20','2028-05-20'),('1407/03','2028-05-21','2028-06-20'),('1407/04','2028-06-21','2028-07-21'),('1407/05','2028-07-22','2028-08-21'),('1407/06','2028-08-22','2028-09-21'),('1407/07','2028-09-22','2028-10-21'),('1407/08','2028-10-22','2028-11-20'),('1407/09','2028-11-21','2028-12-20'),('1407/10','2028-12-21','2029-01-19'),('1407/11','2029-01-20','2029-02-18'),('1407/12','2029-02-19','2029-03-19'),('1408/01','2029-03-20','2029-04-19'),('1408/02','2029-04-20','2029-05-20'),('1408/03','2029-05-21','2029-06-20'),('1408/04','2029-06-21','2029-07-21'),('1408/05','2029-07-22','2029-08-21'),('1408/06','2029-08-22','2029-09-21'),('1408/07','2029-09-22','2029-10-21'),('1408/08','2029-10-22','2029-11-20'),('1408/09','2029-11-21','2029-12-20'),('1408/10','2029-12-21','2030-01-19'),('1408/11','2030-01-20','2030-02-18'),('1408/12','2030-02-19','2030-03-20');
