-- Per-class defaults and immutable monthly price snapshots, amounts in toman.
alter table public.students add column session_price bigint not null default 500000 check(session_price between 1000 and 10000000);
alter table public.monthly_tuition add column session_price bigint not null default 500000 check(session_price between 1000 and 10000000);
alter table public.monthly_tuition add column notex_credit bigint not null default 0 check(notex_credit>=0 and notex_credit%1000=0);
create table academy_private.notex_credit_context(tx bigint,tuition_id uuid,credit bigint,primary key(tx,tuition_id));
alter table academy_private.notex_credit_context enable row level security;
revoke all on academy_private.notex_credit_context from public,anon,authenticated;
create function academy_private.notex_credit_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if (tg_op='INSERT' and new.notex_credit<>0) or (tg_op='UPDATE' and new.notex_credit<>old.notex_credit) then
  if auth.uid() is null or not academy_private.is_admin() or not exists(select 1 from academy_private.notex_credit_context where tx=txid_current() and tuition_id=new.id and credit=new.notex_credit) then raise exception 'اعتبار نوتکس فقط از مسیر تأیید درخواست ثبت می‌شود';end if;
 end if;return new;
end$$;
revoke all on function academy_private.notex_credit_guard() from public,anon,authenticated;
create trigger b_notex_credit_guard before insert or update on public.monthly_tuition for each row execute function academy_private.notex_credit_guard();
create function academy_private.class_minutes(tid uuid,subject text) returns integer language sql stable security definer set search_path='' as $$select case when exists(select 1 from public.teachers where id=tid and name='حاجیان') and replace(replace(subject,' ',''),'‌','') in('سلفژ','صداسازی','سلفژوصداسازی') then 30 else 20 end$$;
revoke all on function academy_private.class_minutes(uuid,text) from public,anon;
grant execute on function academy_private.class_minutes(uuid,text) to authenticated,service_role;
create function academy_private.slot_overlap(a time,ad integer,b time,bd integer) returns boolean language sql immutable set search_path='' as $$select extract(epoch from a)<extract(epoch from b)+bd*60 and extract(epoch from b)<extract(epoch from a)+ad*60$$;
revoke all on function academy_private.slot_overlap(time,integer,time,integer) from public,anon;
grant execute on function academy_private.slot_overlap(time,integer,time,integer) to authenticated,service_role;
-- Preserve final lessons, existing receipts and previously published prices.
create function academy_private.price_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='students' then
  if (tg_op='INSERT' and new.session_price<>500000) or (tg_op='UPDATE' and new.session_price<>old.session_price) then
   if auth.uid() is null or not academy_private.is_admin() then raise exception 'تنظیم مبلغ هر جلسه فقط برای مدیر است';end if;
  end if;
 else
  if tg_op='UPDATE' and new.session_price<>old.session_price then
   if auth.uid() is null or not academy_private.is_admin() then raise exception 'تنظیم مبلغ هر جلسه فقط برای مدیر است';end if;
   if true=any(old.paid) or exists(select 1 from public.monthly_receipts where tuition_id=old.id and status in('pending','approved')) or exists(select 1 from public.notex_requests where kind='tuition' and status in('pending','approved') and data->'data'->>'tuition_id'=old.id::text) or exists(select 1 from public.sessions where student_id=old.student_id and status<>'scheduled' and (starts_at at time zone 'Asia/Tehran')::date=any(old.dates)) then raise exception 'مبلغ ماه دارای پرداخت، رسید، اعتبار نوتکس یا جلسه نهایی قابل تغییر نیست؛ ماه بدون سابقه انتخاب کنید';end if;
  elsif tg_op='INSERT' and new.session_price<>500000 and (auth.uid() is null or not academy_private.is_admin()) then raise exception 'تنظیم مبلغ فقط برای مدیر است';end if;
 end if;return new;
end$$;
revoke all on function academy_private.price_guard() from public,anon,authenticated;
create trigger a_price_guard before insert or update on public.students for each row execute function academy_private.price_guard();
create trigger a_price_guard before insert or update on public.monthly_tuition for each row execute function academy_private.price_guard();


CREATE OR REPLACE FUNCTION academy_private.enrollment_action(op text, data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.enrollment_requests;t public.monthly_tuition;p public.monthly_receipts;s public.students;sid uuid;tid uuid;m public.academy_months;ds date[];flags boolean[];sl int[];n int;discount numeric;price bigint;begin
if auth.uid() is null then raise exception 'ورود لازم است';end if;
if op in('approve','reject','month','review') and not academy_private.is_admin() then raise exception 'فقط مدیر مجاز است';end if;
if op in('approve','reject') then
 select * into strict r from public.enrollment_requests where id=(data->>'id')::uuid for update;
 if r.status<>'pending' then raise exception 'این درخواست قبلاً بررسی شده است';end if;
 if op='reject' then update public.enrollment_requests set status='rejected',review_note=data->>'note',reviewed_at=now() where id=r.id;
 else
 tid:=(data->>'teacher_id')::uuid;
 if not exists(select 1 from public.teachers where id=tid and (data->>'subject')=any(subjects)) then raise exception 'رشته و استاد هماهنگ نیستند';end if;
 if (data->>'weekday')::int not between 0 and 6 or extract(minute from (data->>'class_time')::time)::int%(case when academy_private.class_minutes(tid,data->>'subject')=30 then 10 else 20 end)<>0 or extract(second from (data->>'class_time')::time)<>0 then raise exception 'زمان باید در گام‌های ۲۰ دقیقه باشد';end if;
 select * into s from public.students where national_id=r.national_id order by (teacher_id=tid and subject=data->>'subject') desc,created_at,id limit 1 for update;
 if found then
 if s.archived_at is not null then raise exception 'هنرجو حذف شده است؛ ابتدا بازیابی کنید';end if;
 if exists(select 1 from public.academy_staff where user_id=s.user_id) then raise exception 'پرونده به حساب کارکنان متصل است؛ بررسی هویت لازم است';end if;
 update public.students set user_id=r.user_id,teacher_id=tid,subject=data->>'subject',weekday=(data->>'weekday')::int,class_time=(data->>'class_time')::time where id=s.id returning id into sid;
 else
 insert into public.students(user_id,first_name,last_name,father_name,national_id,mobile,birth_date,home_phone,address,teacher_id,subject,weekday,class_time,rules_accepted_at) values(r.user_id,r.details->>'first_name',r.details->>'last_name',r.details->>'father_name',r.national_id,r.details->>'mobile',(r.details->>'birth_date')::date,r.details->>'home_phone',r.details->>'address',tid,data->>'subject',(data->>'weekday')::int,(data->>'class_time')::time,now()) returning id into sid;
 end if;
 update public.enrollment_requests set status='approved',student_id=sid,review_note=coalesce(data->>'note',''),reviewed_at=now() where id=r.id;
 end if;
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),op,r.id,data);return jsonb_build_object('student_id',sid);
elsif op='month' then
 discount:=case when data ? 'discount_percent' then (data->>'discount_percent')::numeric else null end;
 if data ? 'discount_percent' and (discount is null or discount<0 or discount>100 or discount<>round(discount,2)) then raise exception 'درصد تخفیف باید بین صفر و صد و حداکثر دو رقم اعشار باشد';end if;
 sid:=(data->>'student_id')::uuid;select * into strict s from public.students where id=sid for update;if s.archived_at is not null then raise exception 'برای هنرجوی حذف‌شده شهریه جدید ثبت نکنید';end if;select * into strict m from public.academy_months where key=data->>'month_key';
 select array_agg(d::date order by d) into ds from(select d from generate_series(m.starts_on::timestamp,m.ends_on::timestamp,interval '1 day') d where extract(dow from d)=s.weekday order by d limit 4) q;
 select array_agg(value::boolean order by ordinality) into flags from jsonb_array_elements_text(data->'paid') with ordinality;
 if cardinality(flags)<>4 or array_position(flags,null) is not null then raise exception 'چهار وضعیت پرداخت لازم است';end if;
 if discount=100 then flags:=array[true,true,true,true];end if;select * into t from public.monthly_tuition where student_id=sid and month_key=m.key for update;
 price:=coalesce((data->>'session_price')::bigint,t.session_price,s.session_price);if price not between 1000 and 10000000 then raise exception 'مبلغ جلسه معتبر نیست';end if;
 if found then
 if exists(select 1 from public.monthly_receipts where tuition_id=t.id and status in('approved','pending')) then raise exception 'ماه دارای رسید است؛ ابتدا رسید را بررسی کنید و از دوباره‌شماری جلوگیری کنید';end if;
 update public.monthly_tuition set session_price=price,discount_percent=coalesce(discount,t.discount_percent),paid=flags,published=true,note=coalesce(data->>'note','') where id=t.id returning id into tid;
 else insert into public.monthly_tuition(student_id,month_key,dates,paid,published,session_price,discount_percent,note) values(sid,m.key,ds,flags,true,price,coalesce(discount,0),coalesce(data->>'note','')) returning id into tid;end if;
 if data ? 'session_price' then update public.students set session_price=price where id=sid;end if;
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),op,tid,data||jsonb_build_object('session_price',price,'previous_session_price',t.session_price));return jsonb_build_object('id',tid);
elsif op='submit' then
 select * into strict t from public.monthly_tuition where id=(data->>'id')::uuid and published for update;
 if not exists(select 1 from public.students where id=t.student_id and user_id=auth.uid()) then raise exception 'فقط پرونده خودتان';end if;
 select array_agg(v::int order by v::int) into sl from (select distinct value v from jsonb_array_elements_text(data->'slots')) q;
 if coalesce(cardinality(sl),0)<1 or exists(select 1 from unnest(sl) k where k not between 1 and 4 or t.paid[k]) then raise exception 'جلسات انتخابی نامعتبر یا پرداخت‌شده‌اند';end if;
 if exists(select 1 from public.monthly_receipts where tuition_id=t.id and status='pending' and slots&&sl) then raise exception 'برای این جلسات رسید در انتظار دارید';end if;
 insert into public.monthly_receipts(tuition_id,user_id,slots,amount,method,reference) values(t.id,auth.uid(),sl,cardinality(sl)*(round(t.session_price*(100-t.discount_percent)/100)-t.notex_credit/4),data->>'method',btrim(data->>'reference')) returning id into tid;
 insert into public.academy_activity(actor,action,entity_id) values(auth.uid(),'receipt_submitted',tid);return jsonb_build_object('id',tid);
elsif op='review' then
 select * into strict p from public.monthly_receipts where id=(data->>'id')::uuid for update;
 if p.status<>'pending' then raise exception 'رسید قبلاً بررسی شده است';end if;
 select * into strict t from public.monthly_tuition where id=p.tuition_id for update;
 if data->>'status' not in('approved','rejected') then raise exception 'وضعیت نامعتبر';end if;
 if data->>'status'='approved' then foreach n in array p.slots loop if t.paid[n] then raise exception 'این جلسه قبلاً تسویه شده است';end if;t.paid[n]:=true;end loop;update public.monthly_tuition set paid=t.paid where id=t.id;end if;
 update public.monthly_receipts set status=data->>'status',note=coalesce(data->>'note',''),reviewed_at=now(),reviewed_by=auth.uid() where id=p.id;
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),'receipt_review',p.id,data);return '{}';
end if;raise exception 'عملیات نامعتبر';end$function$
;

CREATE OR REPLACE FUNCTION public.approve_enrollment_with_tuition(data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare approved jsonb; tuition jsonb;
begin
 if jsonb_typeof(data->'paid') is distinct from 'array' then
  raise exception 'وضعیت چهار جلسه را مشخص کنید';
 end if;
 if jsonb_array_length(data->'paid') <> 4 or exists (
  select 1 from jsonb_array_elements(data->'paid') value
  where jsonb_typeof(value) <> 'boolean'
 ) then raise exception 'وضعیت چهار جلسه باید پرداخت‌شده یا پرداخت‌نشده باشد';end if;
 if nullif(data->>'month_key','') is null then raise exception 'ماه شهریه را انتخاب کنید';end if;
 approved := academy_private.enrollment_action('approve',data);
 tuition := academy_private.enrollment_action('month',jsonb_build_object(
  'student_id',approved->>'student_id','month_key',data->>'month_key',
  'discount_percent',coalesce(data->'discount_percent','0'::jsonb),'paid',data->'paid','session_price',data->'session_price','note',coalesce(data->>'note','')));
 return approved || jsonb_build_object('tuition_id',tuition->>'id');
end $function$
;

CREATE OR REPLACE FUNCTION academy_private.learner_action(op text, data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare source public.students;p public.learner_profiles;course uuid;tuition jsonb;reason text;begin
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
 tuition:=academy_private.enrollment_action('month',jsonb_build_object('student_id',course,'month_key',data->>'month_key','discount_percent',coalesce(data->'discount_percent','0'::jsonb),'paid',data->'paid','session_price',data->'session_price','note',coalesce(data->>'note','')));
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
end if;raise exception 'عملیات نامعتبر';end $function$
;

CREATE OR REPLACE FUNCTION academy_private.notex_quote(kind text, data jsonb, ignore_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 expected:=4*round(m.session_price*(100-coalesce(m.discount_percent,0))/100.0)-m.notex_credit;
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
 points:=(data->>'points')::bigint;value:=points*1000;expected:=4*round(m.session_price*(100-coalesce(m.discount_percent,0))/100.0)-m.notex_credit;
 if points<=0 or value>floor(expected*policy.tuition_cap) or expected-value<greatest(1200000,4*m.session_price*0.75) then raise exception 'تعداد امتیاز از سقف مجاز شهریه این ماه بیشتر است';end if;keys:=array_append(keys,'redeem:'||m.id::text);
 else raise exception 'نوع عملیات معتبر نیست';end if;
 if points is null or points<=0 then raise exception 'امتیاز معتبر نیست';end if;
 if exists(select 1 from academy_private.notex_sources where source_key=any(keys) and request_id is distinct from ignore_request) then raise exception 'برای این ماه قبلاً پاداش یا مصرف رزرو شده است';end if;
 return jsonb_build_object('student_id',s.id,'profile_id',s.profile_id,'kind',kind,'points',points,'value_toman',value,'source_keys',keys,'data',data,'catalog_name',item.name,'price',item.price,'remaining_cash',item.price-value);
end$function$
;

CREATE OR REPLACE FUNCTION academy_private.notex_action(op text, data jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 insert into academy_private.notex_credit_context(tx,tuition_id,credit) select txid_current(),id,notex_credit+r.value_toman from public.monthly_tuition where id=(r.data->'data'->>'tuition_id')::uuid;
 update public.monthly_tuition set notex_credit=notex_credit+r.value_toman,note=note||E'\nاعتبار نوتکس: '||r.value_toman::text||' تومان · '||r.id::text where id=(r.data->'data'->>'tuition_id')::uuid;
 delete from academy_private.notex_credit_context where tx=txid_current() and tuition_id=(r.data->'data'->>'tuition_id')::uuid;
 end if;
 end if;
 update public.notex_requests set status=case when op='approve' then 'approved' else 'rejected' end,note=btrim(notex_action.data->>'note'),reviewed_by=who,reviewed_at=now() where id=r.id;
 insert into public.notices(student_id,message) values(r.student_id,'درخواست نوتکس '||case when op='approve' then 'تأیید شد: ' else 'رد شد: ' end||btrim(notex_action.data->>'note'));
 else raise exception 'عملیات معتبر نیست';end if;
 insert into public.academy_activity(actor,action,entity_id,details) values(who,'notex_'||op,r.id,jsonb_build_object('kind',r.kind,'points',r.points,'value_toman',r.value_toman));
 return jsonb_build_object('completed',true,'id',r.id);
end$function$
;

CREATE OR REPLACE FUNCTION public.student_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
if new.archived_at is not null then return new;end if;
if tg_op='UPDATE' and (new.teacher_id,new.weekday,new.class_time,new.subject,new.profile_id,new.archived_at) is not distinct from (old.teacher_id,old.weekday,old.class_time,old.subject,old.profile_id,old.archived_at) then return new;end if;
perform pg_advisory_xact_lock(hashtext(new.teacher_id::text));
if not exists(select 1 from public.teachers t where t.id=new.teacher_id and new.subject=any(t.subjects)) then raise exception 'رشته با استاد مطابقت ندارد';end if;
if TG_OP='INSERT' then if extract(minute from new.class_time)::int%(case when academy_private.class_minutes(new.teacher_id,new.subject)=30 then 10 else 20 end)<>0 or extract(second from new.class_time)<>0 then raise exception 'ساعت باید در گام‌های ۲۰ دقیقه باشد';end if;end if;
if exists(select 1 from public.students s where s.id<>new.id and s.archived_at is null and s.weekday=new.weekday and (s.teacher_id=new.teacher_id or s.profile_id=new.profile_id) and academy_private.slot_overlap(s.class_time,academy_private.class_minutes(s.teacher_id,s.subject),new.class_time,academy_private.class_minutes(new.teacher_id,new.subject))) then raise exception 'تداخل زمان کلاس استاد یا هنرجو';end if;
if TG_OP='UPDATE' and (old.weekday,old.class_time,old.teacher_id) is distinct from (new.weekday,new.class_time,new.teacher_id) and not academy_private.schedule_change_authorized(new.id) then raise exception 'تغییر برنامه فقط از مسیر مجاز مدیر انجام می‌شود';end if;return new;end $function$
;

alter table academy_private.class_slot_claims add column duration_minutes integer not null default 20 check(duration_minutes in(20,30));

update academy_private.class_slot_claims c set duration_minutes=academy_private.class_minutes(s.teacher_id,s.subject) from public.students s where c.student_id=s.id;

update academy_private.class_slot_claims c set duration_minutes=academy_private.class_minutes(c.teacher_id,q.value->>'subject') from public.enrollment_requests r cross join lateral jsonb_array_elements(coalesce(r.details->'courses',jsonb_build_array(r.details))) q where c.request_id=r.id and c.teacher_id=(q.value->>'teacher_id')::uuid and c.weekday=(q.value->>'weekday')::int and c.class_time=(q.value->>'class_time')::time;

CREATE OR REPLACE FUNCTION academy_private.enrollment_slots_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb; courses jsonb; occupied academy_private.class_slot_claims;
begin
if tg_op='DELETE' then delete from academy_private.class_slot_claims where request_id=old.id;return old;end if;
if new.status<>'pending' then delete from academy_private.class_slot_claims where request_id=new.id;return new;end if;
courses:=coalesce(new.details->'courses',jsonb_build_array(new.details));
if jsonb_typeof(courses)<>'array' or jsonb_array_length(courses) not between 1 and 10 then raise exception 'فهرست کلاس معتبر نیست';end if;
for c in select value from jsonb_array_elements(courses) order by value->>'teacher_id',value->>'weekday',value->>'class_time' loop
perform pg_advisory_xact_lock(hashtext(c->>'teacher_id'));
end loop;
delete from academy_private.class_slot_claims where request_id=new.id;
for c in select value from jsonb_array_elements(courses) loop
if exists(select 1 from public.students s where s.archived_at is null and s.teacher_id=(c->>'teacher_id')::uuid and s.weekday=(c->>'weekday')::int and academy_private.slot_overlap(s.class_time,academy_private.class_minutes(s.teacher_id,s.subject),(c->>'class_time')::time,academy_private.class_minutes((c->>'teacher_id')::uuid,c->>'subject'))) then raise exception 'این ساعت کلاس قبلاً رزرو شده است؛ ساعت دیگری انتخاب کنید';end if;
if exists(select 1 from academy_private.class_slot_claims x where x.weekday=(c->>'weekday')::int and (x.teacher_id=(c->>'teacher_id')::uuid or x.user_id=new.user_id) and academy_private.slot_overlap(x.class_time,x.duration_minutes,(c->>'class_time')::time,academy_private.class_minutes((c->>'teacher_id')::uuid,c->>'subject'))) then raise exception 'زمان کلاس با رزرو دیگری تداخل دارد';end if;
begin
insert into academy_private.class_slot_claims(teacher_id,weekday,class_time,request_id,user_id,duration_minutes) values((c->>'teacher_id')::uuid,(c->>'weekday')::int,(c->>'class_time')::time,new.id,new.user_id,academy_private.class_minutes((c->>'teacher_id')::uuid,c->>'subject'));
exception when unique_violation then raise exception 'این ساعت کلاس همین حالا رزرو شده است؛ ساعت دیگری انتخاب کنید';end;
end loop;
return new;end $function$
;

CREATE OR REPLACE FUNCTION academy_private.student_slot_claim_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare occupied academy_private.class_slot_claims;
begin
perform pg_advisory_xact_lock(hashtext(new.teacher_id::text));
if new.archived_at is not null then delete from academy_private.class_slot_claims where student_id=new.id;return new;end if;
if tg_op='UPDATE' and (new.teacher_id,new.weekday,new.class_time,new.subject,new.archived_at) is not distinct from (old.teacher_id,old.weekday,old.class_time,old.subject,old.archived_at) then return new;end if;
if exists(select 1 from academy_private.class_slot_claims x where x.student_id is distinct from new.id and x.teacher_id=new.teacher_id and x.weekday=new.weekday and not(x.user_id is not distinct from new.user_id and new.user_id is not null and x.request_id is not null) and academy_private.slot_overlap(x.class_time,x.duration_minutes,new.class_time,academy_private.class_minutes(new.teacher_id,new.subject))) then raise exception 'تداخل با رزرو کلاس';end if;
select * into occupied from academy_private.class_slot_claims where teacher_id=new.teacher_id and weekday=new.weekday and class_time=new.class_time for update;
if found then
 if occupied.student_id=new.id then return new;end if;
 if occupied.request_id is not null and occupied.user_id=new.user_id and new.user_id is not null then
 update academy_private.class_slot_claims set request_id=null,student_id=new.id,duration_minutes=academy_private.class_minutes(new.teacher_id,new.subject) where teacher_id=new.teacher_id and weekday=new.weekday and class_time=new.class_time;return new;
 end if;
 raise exception 'این ساعت کلاس رزرو شده است؛ ساعت دیگری انتخاب کنید';
end if;
begin
insert into academy_private.class_slot_claims(teacher_id,weekday,class_time,student_id,user_id,duration_minutes) values(new.teacher_id,new.weekday,new.class_time,new.id,new.user_id,academy_private.class_minutes(new.teacher_id,new.subject));
exception when unique_violation then raise exception 'این ساعت کلاس همین حالا رزرو شده است؛ ساعت دیگری انتخاب کنید';end;
return new;end $function$
;

CREATE OR REPLACE FUNCTION academy_private.class_change_plan(sid uuid, tid uuid, wd integer, tm time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.students;t public.teachers;mt public.monthly_tuition;m public.academy_months;ds date[];candidates date[];locked_dates date[];indices integer[];i integer;k integer;date_now date:=(now() at time zone 'Asia/Tehran')::date;months jsonb:='[]';planned jsonb:='[]';c public.sessions;nd date;ns timestamptz;finger text;old jsonb;target jsonb;v jsonb;other jsonb;
begin
 if auth.uid() is null then raise exception 'ورود لازم است';end if;
 select * into strict s from public.students where id=sid and archived_at is null;
 if not (academy_private.is_admin() or (s.user_id is not distinct from auth.uid() and not exists(select 1 from public.academy_staff where user_id=auth.uid()))) then raise exception 'فقط پرونده خودتان یا مدیر';end if;
 select * into strict t from public.teachers where id=tid;
 if not coalesce(s.subject=any(t.subjects),false) then raise exception 'استاد جدید باید مدرس همین رشته باشد';end if;
 if wd is null or wd not between 0 and 6 or not(wd=any(academy_private.change_course_days(tid,s.subject))) then raise exception 'روز انتخابی در برنامه این رشته نیست';end if;
 if tm is null or tm<'10:00' or tm>'22:40' or (extract(epoch from tm)+academy_private.class_minutes(tid,s.subject)*60)>82800 or extract(minute from tm)::int%(case when academy_private.class_minutes(tid,s.subject)=30 then 10 else 20 end)<>0 or extract(second from tm)<>0 then raise exception 'ساعت مجاز از ۱۰:۰۰ تا ۲۲:۴۰ انتخاب شود';end if;
 if (s.teacher_id,s.weekday,s.class_time) is not distinct from (tid,wd,tm) then raise exception 'برنامه جدید با برنامه فعلی یکسان است';end if;
 if exists(select 1 from public.students x where x.id<>sid and x.archived_at is null and x.weekday=wd and (x.teacher_id=tid or x.profile_id=s.profile_id) and academy_private.slot_overlap(x.class_time,academy_private.class_minutes(x.teacher_id,x.subject),tm,academy_private.class_minutes(tid,s.subject))) or exists(select 1 from academy_private.class_slot_claims x where x.teacher_id=tid and x.weekday=wd and x.student_id is distinct from sid and academy_private.slot_overlap(x.class_time,x.duration_minutes,tm,academy_private.class_minutes(tid,s.subject))) then raise exception 'این زمان با کلاس دیگر هنرجو، استاد یا ثبت‌نام رزروشده تداخل دارد';end if;
 old:=jsonb_build_object('teacher_id',s.teacher_id,'weekday',s.weekday,'class_time',s.class_time,'subject',s.subject,'duration_minutes',academy_private.class_minutes(s.teacher_id,s.subject));
 target:=jsonb_build_object('teacher_id',tid,'weekday',wd,'class_time',tm,'subject',s.subject,'duration_minutes',academy_private.class_minutes(tid,s.subject));
 for mt in select * from public.monthly_tuition where student_id=sid order by month_key,id loop
  ds:=mt.dates;
  if wd<>s.weekday then
   select * into strict m from public.academy_months where key=mt.month_key;indices:='{}';locked_dates:='{}';
   for i in 1..cardinality(ds) loop
    if (ds[i]+s.class_time) at time zone 'Asia/Tehran'>now() and not exists(select 1 from public.sessions x where x.student_id=sid and (x.starts_at at time zone 'Asia/Tehran')::date=ds[i] and x.status<>'scheduled') then indices:=array_append(indices,i);else locked_dates:=array_append(locked_dates,ds[i]);end if;
   end loop;
   if cardinality(indices)>0 then
    select array_agg(d::date order by d) into candidates from generate_series(m.starts_on::timestamp,m.ends_on::timestamp,interval '1 day') d where extract(dow from d)=wd and ((d::date+tm) at time zone 'Asia/Tehran')>now() and not(d::date=any(locked_dates));
    if coalesce(cardinality(candidates),0)<cardinality(indices) then raise exception 'روز جدید برای همه جلسات باقی‌مانده ماه % جا ندارد؛ ابتدا جلسات همین ماه را با دفتر تعیین تکلیف کنید یا روز دیگری انتخاب کنید',mt.month_key;end if;
    k:=1;foreach i in array indices loop ds[i]:=candidates[k];k:=k+1;end loop;
   end if;
  end if;
  if ds is distinct from mt.dates then months:=months||jsonb_build_array(jsonb_build_object('id',mt.id,'month_key',mt.month_key,'before',mt.dates,'after',ds));end if;
 end loop;
 for c in select * from public.sessions where student_id=sid and status='scheduled' and starts_at>now() and makeup_for is null order by starts_at,id loop
  nd:=(c.starts_at at time zone 'Asia/Tehran')::date;
  for v in select value from jsonb_array_elements(months) loop
   select array_position(array(select value::date from jsonb_array_elements_text(v->'before')),nd) into i;
   if i is not null then nd:=(v->'after'->>(i-1))::date;exit;end if;
  end loop;
  if wd<>s.weekday and extract(dow from nd)<>wd then nd:=nd+((wd-extract(dow from nd)::int+7)%7);end if;
  ns:=(nd+tm) at time zone 'Asia/Tehran';if ns<=now() then ns:=ns+interval '7 days';end if;
  planned:=planned||jsonb_build_array(jsonb_build_object('id',c.id,'before',c.starts_at,'after',ns,'teacher_id',tid));
 end loop;
 for v in select value from jsonb_array_elements(planned) loop
  if exists(select 1 from jsonb_array_elements(planned) x where x->>'id'<>v->>'id' and (x->>'after')::timestamptz<(v->>'after')::timestamptz+make_interval(mins=>academy_private.class_minutes(tid,s.subject)) and (v->>'after')::timestamptz<(x->>'after')::timestamptz+make_interval(mins=>academy_private.class_minutes(tid,s.subject))) or exists(select 1 from public.sessions x join public.students xs on xs.id=x.student_id left join public.session_instructors a on a.session_id=x.id where xs.archived_at is null and x.status='scheduled' and x.id not in(select (q->>'id')::uuid from jsonb_array_elements(planned) q) and (coalesce(a.teacher_id,xs.teacher_id)=tid or xs.profile_id=s.profile_id) and x.starts_at<(v->>'after')::timestamptz+make_interval(mins=>academy_private.class_minutes(tid,s.subject)) and (v->>'after')::timestamptz<x.starts_at+make_interval(mins=>academy_private.class_minutes(coalesce(a.teacher_id,xs.teacher_id),xs.subject))) then raise exception 'زمان جدید با یک جلسه مشخص یا جبرانی تداخل دارد';end if;
 end loop;
 finger:=md5(jsonb_build_object('old',old,'target',target,'months',months,'sessions',planned)::text);
 return jsonb_build_object('student_id',sid,'student_name',s.first_name||' '||s.last_name,'before',old,'after',target,'months',months,'sessions',planned,'preview_hash',finger,'notice','پرداخت‌ها، شناسه کلاس، سوابق جلسات نهایی و جبرانی‌های تعیین‌شده حفظ می‌شوند. تغییر از تأیید مدیر اعمال می‌شود.');
end$function$
;

CREATE OR REPLACE FUNCTION academy_private.class_change_slots(sid uuid, tid uuid, wd integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare s public.students;begin
 if auth.uid() is null then raise exception 'ورود لازم است';end if;select * into strict s from public.students where id=sid and archived_at is null;
 if not(academy_private.is_admin() or (s.user_id is not distinct from auth.uid() and not exists(select 1 from public.academy_staff where user_id=auth.uid()))) then raise exception 'کلاس مجاز نیست';end if;
 return (select jsonb_agg(jsonb_build_object('time',to_char(('10:00'::time+n*interval '10 minutes')::time,'HH24:MI'),'busy',exists(select 1 from academy_private.class_slot_claims x where x.teacher_id=tid and x.weekday=wd and x.student_id is distinct from sid and academy_private.slot_overlap(x.class_time,x.duration_minutes,('10:00'::time+n*interval '10 minutes')::time,academy_private.class_minutes(tid,s.subject))) or exists(select 1 from public.students x where x.id<>sid and x.archived_at is null and x.weekday=wd and (x.teacher_id=tid or x.profile_id=s.profile_id) and academy_private.slot_overlap(x.class_time,academy_private.class_minutes(x.teacher_id,x.subject),('10:00'::time+n*interval '10 minutes')::time,academy_private.class_minutes(tid,s.subject)))) order by n) from generate_series(0,76) n where (academy_private.class_minutes(tid,s.subject)=30 or n%2=0) and 600+n*10+academy_private.class_minutes(tid,s.subject)<=1380);
end$function$
;
-- Public availability contains occupied slots only, never learner identity.
create function public.registration_busy_slots_timed() returns table(teacher_id uuid,weekday integer,class_time text,duration_minutes integer) language sql security definer set search_path='' as $$
select c.teacher_id,c.weekday,to_char(c.class_time,'HH24:MI'),c.duration_minutes from academy_private.class_slot_claims c
union select s.teacher_id,s.weekday,to_char(s.class_time,'HH24:MI'),academy_private.class_minutes(s.teacher_id,s.subject) from public.students s where s.archived_at is null
$$;
revoke all on function public.registration_busy_slots_timed() from public,anon,authenticated;grant execute on function public.registration_busy_slots_timed() to service_role;

notify pgrst, 'reload schema';
