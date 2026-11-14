-- Additive loyalty wallet. No historical financial records are rewritten.
create table public.notex_catalog(id uuid primary key default gen_random_uuid(),kind text not null check(kind in('cafe','studio')),name text not null,price bigint not null check(price>0),active boolean not null default true);
insert into public.notex_catalog(kind,name,price) values
('cafe','چای سیاه تک‌نفره',50000),('cafe','چای ترش',65000),('cafe','دمنوش به‌لیمو',65000),('cafe','دمنوش آویشن',65000),('cafe','دمنوش گل گاوزبان',65000),('cafe','دمنوش بهارنارنج',65000),('cafe','دمنوش نعنا فلفلی',65000),
('studio','ضبط · یک ساعت',1500000),('studio','آهنگسازی و ساخت ملودی',7000000),('studio','تنظیم',20000000),('studio','میکس و مستر',8000000),('studio','تنظیم، ضبط و میکس پست اینستاگرام',5000000),('studio','تنظیم، ضبط، میکس و فیلم‌برداری پست اینستاگرام',7000000),('studio','آهنگ، تنظیم، میکس و مستر',35000000),('studio','شعر، آهنگ، تنظیم، میکس و مستر',40000000),('studio','شعر، آهنگ، تنظیم، میکس و مستر با یک ساز زنده',45000000);
create table public.notex_ledger(id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.learner_profiles(id),delta bigint not null check(delta<>0),label text not null,source_key text unique not null,created_at timestamptz not null default now());
create index notex_ledger_profile on public.notex_ledger(profile_id,created_at desc);
create table public.notex_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),profile_id uuid not null references public.learner_profiles(id),student_id uuid not null references public.students(id),kind text not null check(kind in('prepaid','ontime','grade','cafe','studio','tuition')),data jsonb not null,points bigint not null check(points>0),value_toman bigint not null check(value_toman>0),status text not null default 'pending' check(status in('pending','approved','rejected')),note text not null default '',request_key uuid not null,created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references auth.users(id),unique(user_id,request_key));
create index notex_requests_profile on public.notex_requests(profile_id,created_at desc);
create index notex_requests_pending on public.notex_requests(created_at) where status='pending';
create table academy_private.notex_sources(source_key text primary key,request_id uuid not null references public.notex_requests(id));
alter table academy_private.notex_sources enable row level security;revoke all on academy_private.notex_sources from public,anon,authenticated;
alter table public.notex_catalog enable row level security;alter table public.notex_ledger enable row level security;alter table public.notex_requests enable row level security;
revoke all on public.notex_catalog,public.notex_ledger,public.notex_requests from public,anon,authenticated;
grant select on public.notex_catalog,public.notex_ledger,public.notex_requests to authenticated;
create policy notex_catalog_read on public.notex_catalog for select to authenticated using(true);
create policy notex_ledger_read on public.notex_ledger for select to authenticated using(academy_private.is_admin() or exists(select 1 from public.students s where s.profile_id=notex_ledger.profile_id and s.user_id=auth.uid() and s.archived_at is null));
create policy notex_requests_read on public.notex_requests for select to authenticated using(academy_private.is_admin() or user_id=auth.uid() or exists(select 1 from public.students s where s.profile_id=notex_requests.profile_id and s.user_id=auth.uid() and s.archived_at is null));
create table public.notex_policy(id boolean primary key default true check(id),prepaid2 numeric not null default .05 check(prepaid2 between 0 and .20),prepaid3 numeric not null default .08 check(prepaid3 between 0 and .20),prepaid4 numeric not null default .10 check(prepaid4 between 0 and .20),tuition_cap numeric not null default .15 check(tuition_cap between 0 and .15),studio_cap numeric not null default .40 check(studio_cap between 0 and .40),cafe_monthly integer not null default 200 check(cafe_monthly between 0 and 1000),enabled boolean not null default true);
insert into public.notex_policy(id) values(true);alter table public.notex_policy enable row level security;revoke all on public.notex_policy from public,anon,authenticated;grant select on public.notex_policy to authenticated;create policy notex_policy_read on public.notex_policy for select to authenticated using(true);
create function academy_private.notex_quote(kind text,data jsonb,ignore_request uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare policy public.notex_policy;s public.students;m public.monthly_tuition;item public.notex_catalog;n integer;cash bigint:=0;points bigint;value bigint;avg_score numeric;ids uuid[];keys text[]:='{}';dates date[]:='{}';first_paid date;last_paid date;receipt_cash bigint;expected bigint;
begin
 if auth.uid() is null then raise exception 'ورود لازم است';end if;select * into strict policy from public.notex_policy where id; if not policy.enabled then raise exception 'ثبت درخواست نوتکس موقتاً متوقف است';end if;
 select * into strict s from public.students where id=(data->>'student_id')::uuid and archived_at is null;
 if not(academy_private.is_admin() or (s.user_id=auth.uid() and not exists(select 1 from public.academy_staff where user_id=auth.uid()))) then raise exception 'فقط کلاس خود هنرجو یا مدیر';end if;
 if kind in('prepaid','ontime','grade') then
 select array_agg(distinct v::uuid) into ids from jsonb_array_elements_text(data->'tuition_ids') v;n:=coalesce(cardinality(ids),0);
 if (kind='prepaid' and n not in(2,3,4,12)) or (kind<>'prepaid' and n<>1) then raise exception 'تعداد ماه‌های انتخابی معتبر نیست';end if;
 for m in select * from public.monthly_tuition where id=any(ids) order by month_key loop
 if m.student_id<>s.id or not m.published then raise exception 'ماه متعلق به این کلاس نیست یا منتشر نشده';end if;
 if kind='grade' then
 select avg(r.score),count(distinct r.lesson_date) into avg_score,n from public.lesson_reviews r join public.sessions c on c.id=r.session_id and c.student_id=r.student_id and c.status='completed' where r.student_id=s.id and r.lesson_date=any(m.dates) and r.lesson_date=(c.starts_at at time zone 'Asia/Tehran')::date and r.lesson_date<=(now() at time zone 'Asia/Tehran')::date;
 if n<>4 or avg_score<8 then raise exception 'چهار جلسه برگزارشده با ارزیابی میانگین حداقل ۸ لازم است';end if;
 points:=case when avg_score>=9 then 40 else 20 end;value:=points*1000;keys:=array_append(keys,'grade:'||m.id::text);
 else
 if m.paid<>array[true,true,true,true] then raise exception 'شهریه هر چهار جلسه باید تأیید شده باشد';end if;
 expected:=4*round(500000*(100-coalesce(m.discount_percent,0))/100.0);
 select coalesce(sum(r.amount),0),min((r.created_at at time zone 'Asia/Tehran')::date),max((r.created_at at time zone 'Asia/Tehran')::date) into receipt_cash,first_paid,last_paid from public.monthly_receipts r where r.tuition_id=m.id and r.status='approved' and r.reviewed_at is not null;
 if receipt_cash<>expected or last_paid>(select min(d) from unnest(m.dates) d) then raise exception 'رسید نقدی کامل و به‌موقع تأییدشده برای این ماه لازم است؛ تسویه دستی کافی نیست';end if;
 cash:=cash+receipt_cash;keys:=array_append(keys,'payment:'||m.id::text);select array_append(dates,starts_on) into dates from public.academy_months where key=m.month_key;
 end if;
 end loop;
 if cardinality(keys)<>cardinality(ids) then raise exception 'ماه یافت نشد';end if;
 if kind='prepaid' then
 -- All months must belong to one advance purchase, before the first month starts.

 if (select count(*) from public.academy_months where starts_on between (select min(x) from unnest(dates)x) and (select max(x) from unnest(dates)x))<>cardinality(ids) then raise exception 'ماه‌ها باید پیوسته باشند';end if;
 if exists(select 1 from public.monthly_receipts r where r.tuition_id=any(ids) and r.status='approved' and (r.created_at at time zone 'Asia/Tehran')::date>(select min(x) from unnest(dates)x)) then raise exception 'پرداخت باید پیش از شروع اولین ماه بسته باشد';end if;
 points:=floor(case cardinality(ids) when 2 then cash*policy.prepaid2 when 3 then cash*policy.prepaid3 when 4 then cash*policy.prepaid4 when 12 then cash/12.0 end/1000);value:=points*1000;
 elsif kind='ontime' then points:=20;value:=20000;end if;
 elsif kind in('cafe','studio') then
 select * into strict item from public.notex_catalog where id=(data->>'catalog_id')::uuid and active and notex_catalog.kind=notex_quote.kind;
 points:=case when kind='cafe' then ceil(item.price/1000.0) else (data->>'points')::bigint end;value:=points*case when kind='studio' then 2000 else 1000 end;
 if points<=0 or value>item.price or (kind='studio' and value>floor(item.price*policy.studio_cap)) then raise exception 'تعداد امتیاز از سقف مجاز مصرف استودیو بیشتر است';end if;
 if kind='cafe' and not exists(select 1 from public.academy_months where (now() at time zone 'Asia/Tehran')::date between starts_on and ends_on) then raise exception 'تقویم ماه جاری تعریف نشده است';end if;
 if kind='cafe' and points+coalesce((select sum(q.points) from public.notex_requests q where q.id is distinct from ignore_request and q.profile_id=s.profile_id and q.kind='cafe' and q.status<>'rejected' and (q.created_at at time zone 'Asia/Tehran')::date between (select starts_on from public.academy_months where (now() at time zone 'Asia/Tehran')::date between starts_on and ends_on) and (select ends_on from public.academy_months where (now() at time zone 'Asia/Tehran')::date between starts_on and ends_on)),0)>policy.cafe_monthly then raise exception 'سقف ماهانه کافه تکمیل شده است';end if;
 elsif kind='tuition' then
 select * into strict m from public.monthly_tuition where id=(data->>'tuition_id')::uuid and student_id=s.id and published;
 if m.paid<>array[false,false,false,false] or exists(select 1 from public.monthly_receipts where tuition_id=m.id and status in('pending','approved')) then raise exception 'ماه دارای پرداخت یا رسید است؛ ماه آینده بدون رسید انتخاب شود';end if;
 points:=(data->>'points')::bigint;value:=points*1000;expected:=4*round(500000*(100-coalesce(m.discount_percent,0))/100.0);
 if points<=0 or value>floor(expected*policy.tuition_cap) or expected-value<1500000 then raise exception 'تعداد امتیاز از سقف مجاز شهریه این ماه بیشتر است';end if;keys:=array_append(keys,'redeem:'||m.id::text);
 else raise exception 'نوع عملیات معتبر نیست';end if;
 if points is null or points<=0 then raise exception 'امتیاز معتبر نیست';end if;
 if exists(select 1 from academy_private.notex_sources where source_key=any(keys) and request_id is distinct from ignore_request) then raise exception 'برای این ماه قبلاً پاداش یا مصرف رزرو شده است';end if;
 return jsonb_build_object('student_id',s.id,'profile_id',s.profile_id,'kind',kind,'points',points,'value_toman',value,'source_keys',keys,'data',data,'catalog_name',item.name,'price',item.price,'remaining_cash',item.price-value);
end$$;
revoke all on function academy_private.notex_quote(text,jsonb,uuid) from public,anon;grant execute on function academy_private.notex_quote(text,jsonb,uuid) to authenticated;
create function public.notex_preview(kind text,data jsonb) returns jsonb language sql security invoker set search_path='' as $$select academy_private.notex_quote(kind,data)$$;
revoke all on function public.notex_preview(text,jsonb) from public,anon;grant execute on function public.notex_preview(text,jsonb) to authenticated;
create function academy_private.notex_action(op text,data jsonb,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();s public.students;r public.notex_requests;q jsonb;v text;balance bigint;spend boolean;m public.monthly_tuition;rid uuid;
begin
 if who is null or request_key is null or octet_length(data::text)>6000 then raise exception 'درخواست معتبر نیست';end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,27));
 if op='settings' then
 if not academy_private.is_admin() then raise exception 'فقط مدیر';end if;
 if length(btrim(coalesce(data->>'note',''))) not between 3 and 1000 then raise exception 'دلیل تنظیم لازم است';end if;
 update public.notex_policy set prepaid2=(data->>'prepaid2')::numeric,prepaid3=(data->>'prepaid3')::numeric,prepaid4=(data->>'prepaid4')::numeric,tuition_cap=(data->>'tuition_cap')::numeric,studio_cap=(data->>'studio_cap')::numeric,cafe_monthly=(data->>'cafe_monthly')::integer,enabled=(data->>'enabled')::boolean where id;
 insert into public.academy_activity(actor,action,details) values(who,'notex_settings',data);return jsonb_build_object('completed',true);
 elsif op='request' then
 select * into r from public.notex_requests x where x.user_id=who and x.request_key=notex_action.request_key;
 if found then if r.kind<>notex_action.data->>'kind' or r.data->'data'<>notex_action.data->'payload' then raise exception 'شناسه تکراری با داده متفاوت';end if;return jsonb_build_object('completed',true,'id',r.id,'duplicate',true);end if;
 if (select count(*) from public.notex_requests where user_id=who and created_at>now()-interval '1 hour')>=30 then raise exception 'درخواست زیاد است؛ بعداً تلاش کنید';end if;
 select * into strict s from public.students where id=(notex_action.data->'payload'->>'student_id')::uuid and archived_at is null;
 perform pg_advisory_xact_lock(hashtextextended(s.profile_id::text,28));
 q:=academy_private.notex_quote(notex_action.data->>'kind',notex_action.data->'payload');
 if coalesce(notex_action.data->>'preview_hash','')<>md5(q::text) then raise exception 'پیش‌نمایش تغییر کرده؛ دوباره بررسی کنید';end if;
 spend:=notex_action.data->>'kind' in('cafe','studio','tuition');
 select coalesce(sum(delta),0) into balance from public.notex_ledger where profile_id=s.profile_id;
 if spend and balance<(q->>'points')::bigint then raise exception 'موجودی نوتکس کافی نیست';end if;
 insert into public.notex_requests(user_id,profile_id,student_id,kind,data,points,value_toman,request_key) values(who,s.profile_id,s.id,notex_action.data->>'kind',q,(q->>'points')::bigint,(q->>'value_toman')::bigint,request_key) returning * into r;
 for v in select jsonb_array_elements_text(q->'source_keys') loop insert into academy_private.notex_sources values(v,r.id);end loop;
 if spend then insert into public.notex_ledger(profile_id,delta,label,source_key) values(s.profile_id,-r.points,'رزرو مصرف نوتکس','reserve:'||r.id);end if;
 elsif op in('approve','reject') then
 if not academy_private.is_admin() then raise exception 'بررسی فقط توسط مدیر';end if;
 select * into strict r from public.notex_requests where id=(notex_action.data->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(r.profile_id::text,28));
 select * into strict r from public.notex_requests where id=r.id for update;
 if r.status=(case when op='approve' then 'approved' else 'rejected' end) then return jsonb_build_object('completed',true,'id',r.id,'duplicate',true);end if;
 if r.status<>'pending' then raise exception 'درخواست قبلاً بررسی شده';end if;
 if length(btrim(coalesce(notex_action.data->>'note',''))) not between 3 and 1000 then raise exception 'توضیح بررسی لازم است';end if;
 spend:=r.kind in('cafe','studio','tuition');
 if op='reject' then
 if spend then insert into public.notex_ledger(profile_id,delta,label,source_key) values(r.profile_id,r.points,'آزادسازی رزرو ردشده','return:'||r.id);end if;
 delete from academy_private.notex_sources where request_id=r.id;
 else
 perform 1 from public.monthly_tuition where id in(select (x)::uuid from jsonb_array_elements_text(coalesce(r.data->'data'->'tuition_ids','[]')) x) order by id for update;
 if r.kind='tuition' then perform 1 from public.monthly_tuition where id=(r.data->'data'->>'tuition_id')::uuid for update;end if;
 q:=academy_private.notex_quote(r.kind,r.data->'data',r.id);
 if q<>r.data then raise exception 'داده مبنا تغییر کرده؛ درخواست را رد و با پیش‌نمایش تازه ثبت کنید';end if;
 if not spend then insert into public.notex_ledger(profile_id,delta,label,source_key) values(r.profile_id,r.points,case r.kind when 'grade' then 'پاداش پیشرفت آموزشی' when 'prepaid' then 'پاداش همراهی چندماهه' else 'پاداش پرداخت به‌موقع' end,'earn:'||r.id);
 elsif r.kind='tuition' then
 update public.monthly_tuition set discount_percent=discount_percent+r.value_toman/20000.0,note=note||E'\nاعتبار نوتکس: '||r.value_toman::text||' تومان · '||r.id::text where id=(r.data->'data'->>'tuition_id')::uuid;
 end if;
 end if;
 update public.notex_requests set status=case when op='approve' then 'approved' else 'rejected' end,note=btrim(notex_action.data->>'note'),reviewed_by=who,reviewed_at=now() where id=r.id;
 insert into public.notices(student_id,message) values(r.student_id,'درخواست نوتکس '||case when op='approve' then 'تأیید شد: ' else 'رد شد: ' end||btrim(notex_action.data->>'note'));
 else raise exception 'عملیات معتبر نیست';end if;
 insert into public.academy_activity(actor,action,entity_id,details) values(who,'notex_'||op,r.id,jsonb_build_object('kind',r.kind,'points',r.points,'value_toman',r.value_toman));
 return jsonb_build_object('completed',true,'id',r.id);
end$$;
revoke all on function academy_private.notex_action(text,jsonb,uuid) from public,anon;grant execute on function academy_private.notex_action(text,jsonb,uuid) to authenticated;
create function public.notex_action(op text,data jsonb,request_key uuid) returns jsonb language sql security invoker set search_path='' as $$select academy_private.notex_action(op,data,request_key)$$;
revoke all on function public.notex_action(text,jsonb,uuid) from public,anon;grant execute on function public.notex_action(text,jsonb,uuid) to authenticated;
create function academy_private.notex_dashboard() returns jsonb language plpgsql security definer set search_path='' as $$declare who uuid:=auth.uid();is_manager boolean:=academy_private.is_admin();begin
 if who is null or (not is_manager and exists(select 1 from public.academy_staff where user_id=who)) then raise exception 'این بخش برای هنرجو و مدیر است';end if;
 return jsonb_build_object('totals',case when is_manager then jsonb_build_object('available',coalesce((select sum(delta) from public.notex_ledger),0),'reserved',coalesce((select sum(points) from public.notex_requests where status='pending' and kind in('cafe','studio','tuition')),0),'awaiting_award',coalesce((select sum(points) from public.notex_requests where status='pending' and kind in('grade','prepaid','ontime')),0)) else null end,'policy',(select to_jsonb(p) from public.notex_policy p where id),'role',case when is_manager then 'admin' else 'student' end,'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'profile_id',s.profile_id,'name',s.first_name||' '||s.last_name,'subject',s.subject)),'[]') from public.students s where s.archived_at is null and(is_manager or s.user_id=who)),
 'wallets',(select coalesce(jsonb_agg(jsonb_build_object('profile_id',p.id,'balance',coalesce((select sum(delta) from public.notex_ledger where profile_id=p.id),0))),'[]') from public.learner_profiles p where p.archived_at is null and(is_manager or p.user_id=who)),
 'catalog',(select coalesce(jsonb_agg(to_jsonb(c) order by kind,price),'[]') from public.notex_catalog c where active),
 'months',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'student_id',m.student_id,'month_key',m.month_key,'paid',m.paid,'discount_percent',m.discount_percent) order by m.month_key),'[]') from public.monthly_tuition m join public.students s on s.id=m.student_id where s.archived_at is null and m.published and(is_manager or s.user_id=who)),
 'ledger',(select coalesce(jsonb_agg(to_jsonb(l) order by created_at desc),'[]') from(select l.* from public.notex_ledger l where is_manager or exists(select 1 from public.students s where s.profile_id=l.profile_id and s.user_id=who and s.archived_at is null) order by created_at desc limit 100)l),
 'requests',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc),'[]') from(select * from public.notex_requests where is_manager or user_id=who or exists(select 1 from public.students s where s.profile_id=notex_requests.profile_id and s.user_id=who and s.archived_at is null) order by (status='pending') desc,created_at desc limit 200)r));
end$$;
revoke all on function academy_private.notex_dashboard() from public,anon;grant execute on function academy_private.notex_dashboard() to authenticated;
create function public.notex_dashboard() returns jsonb language sql security invoker set search_path='' as $$select academy_private.notex_dashboard()$$;
revoke all on function public.notex_dashboard() from public,anon;grant execute on function public.notex_dashboard() to authenticated;
-- Fingerprint added by the public preview wrapper; always computed by the database.
create or replace function public.notex_preview(kind text,data jsonb) returns jsonb language sql security invoker set search_path='' as $$select q||jsonb_build_object('preview_hash',md5(q::text)) from(select academy_private.notex_quote(kind,data) q)x$$;
-- A completed four-lesson evaluation automatically queues an award for review.
-- It never issues money or points from an unverified educational-only note.
create function academy_private.notex_grade_queue() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.students;m public.monthly_tuition;average numeric;n integer;points bigint;rid uuid;q jsonb;k text;payload jsonb;
begin
 select * into s from public.students where id=new.student_id and archived_at is null;
 if not found or s.user_id is null or not exists(select 1 from public.notex_policy where id and enabled) then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(s.profile_id::text,28));
 for m in select * from public.monthly_tuition where student_id=s.id and published and new.lesson_date=any(dates) loop
 k:='grade:'||m.id::text;if exists(select 1 from academy_private.notex_sources where source_key=k) then continue;end if;
 select avg(r.score),count(distinct r.lesson_date) into average,n from public.lesson_reviews r join public.sessions c on c.id=r.session_id and c.student_id=r.student_id and c.status='completed' where r.student_id=s.id and r.lesson_date=any(m.dates) and r.lesson_date=(c.starts_at at time zone 'Asia/Tehran')::date and r.lesson_date<=(now() at time zone 'Asia/Tehran')::date;
 if n<>4 or average<8 then continue;end if;
 points:=case when average>=9 then 40 else 20 end;
 payload:=jsonb_build_object('student_id',s.id,'tuition_ids',jsonb_build_array(m.id));
 q:=jsonb_build_object('student_id',s.id,'profile_id',s.profile_id,'kind','grade','points',points,'value_toman',points*1000,'source_keys',jsonb_build_array(k),'data',payload,'catalog_name',null,'price',null,'remaining_cash',null);
 insert into public.notex_requests(user_id,profile_id,student_id,kind,data,points,value_toman,request_key) values(s.user_id,s.profile_id,s.id,'grade',q,points,points*1000,gen_random_uuid()) returning id into rid;
 insert into academy_private.notex_sources values(k,rid);
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),'notex_grade_queued',rid,jsonb_build_object('student_id',s.id,'points',points));
 end loop;return new;
end$$;
revoke all on function academy_private.notex_grade_queue() from public,anon,authenticated;
create trigger notex_grade_queue after insert or update of score,session_id,lesson_date on public.lesson_reviews for each row execute function academy_private.notex_grade_queue();
-- Once a credit is fulfilled, a later manual tuition edit cannot erase its value.
create function academy_private.notex_tuition_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.discount_percent is distinct from old.discount_percent and exists(select 1 from public.notex_requests r where r.kind='tuition' and r.status='approved' and (r.data->'data'->>'tuition_id')::uuid=new.id) then raise exception 'این ماه اعتبار نوتکس مصرف‌شده دارد؛ تغییر مجدد درصد مجاز نیست';end if;return new;
end$$;
revoke all on function academy_private.notex_tuition_guard() from public,anon,authenticated;
create trigger notex_tuition_guard before update of discount_percent on public.monthly_tuition for each row execute function academy_private.notex_tuition_guard();
