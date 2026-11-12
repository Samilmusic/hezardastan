-- Authorized schedule changes preserve class identity and all financial records.
create table public.class_change_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),student_id uuid not null references public.students(id),previous_schedule jsonb not null,requested_schedule jsonb not null,reason text not null check(length(reason) between 5 and 1000),status text not null default 'pending' check(status in('pending','approved','rejected','superseded')),approved_schedule jsonb,review_note text not null default '',reviewed_by uuid references auth.users(id),created_at timestamptz not null default now(),reviewed_at timestamptz);
create unique index class_change_one_pending on public.class_change_requests(student_id) where status='pending';
create index class_change_class_idx on public.class_change_requests(student_id,created_at desc);
create index class_change_user_idx on public.class_change_requests(user_id,created_at desc);
alter table public.class_change_requests enable row level security;
create policy class_change_read on public.class_change_requests for select to authenticated using(academy_private.is_admin() or (user_id=auth.uid() and exists(select 1 from public.students s where s.id=student_id and s.user_id=auth.uid())));
revoke all on public.class_change_requests from public,anon,authenticated;
grant select on public.class_change_requests to authenticated;
create table academy_private.class_change_operations(actor uuid not null,request_key uuid not null,op text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor,request_key));
create table academy_private.class_change_context(tx bigint not null,student_id uuid not null,actor uuid not null,primary key(tx,student_id));
alter table academy_private.class_change_operations enable row level security;alter table academy_private.class_change_context enable row level security;
revoke all on academy_private.class_change_operations,academy_private.class_change_context from public,anon,authenticated;
create function academy_private.schedule_change_authorized(sid uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and academy_private.is_admin() and exists(select 1 from academy_private.class_change_context where tx=txid_current() and student_id=sid and actor=auth.uid())$$;
revoke all on function academy_private.schedule_change_authorized(uuid) from public,anon;grant execute on function academy_private.schedule_change_authorized(uuid) to authenticated;
do $$declare def text;old text:='then raise exception ''زمان و استاد کلاس ثابت است؛ کلاس دیگری اضافه کنید'';';begin
 select pg_get_functiondef('public.student_guard()'::regprocedure) into def;
 if position(old in def)=0 then raise exception 'student_guard changed; review schedule migration';end if;
 def:=replace(def,old,'and not academy_private.schedule_change_authorized(new.id) then raise exception ''تغییر برنامه فقط از مسیر مجاز مدیر انجام می‌شود'';');execute def;
end$$;
-- Snapshot instructor separately: completed session rows and shares stay byte-for-byte unchanged.
create table public.session_instructors(session_id uuid primary key references public.sessions(id),teacher_id uuid not null references public.teachers(id));
create index session_instructors_teacher_idx on public.session_instructors(teacher_id);
alter table public.session_instructors enable row level security;
insert into public.session_instructors select c.id,s.teacher_id from public.sessions c join public.students s on s.id=c.student_id;
create policy session_instructors_read on public.session_instructors for select to authenticated using(academy_private.is_office() or exists(select 1 from public.academy_staff a where a.user_id=auth.uid() and a.role='teacher' and a.teacher_id=session_instructors.teacher_id) or exists(select 1 from public.sessions c join public.students s on s.id=c.student_id where c.id=session_id and s.user_id=auth.uid()));
revoke all on public.session_instructors from public,anon,authenticated;
grant select on public.session_instructors to authenticated;
create function academy_private.snapshot_session_instructor() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.session_instructors(session_id,teacher_id) select new.id,teacher_id from public.students where id=new.student_id;return new;end$$;
revoke all on function academy_private.snapshot_session_instructor() from public,anon,authenticated;
create trigger session_instructor_snapshot after insert on public.sessions for each row execute function academy_private.snapshot_session_instructor();
create function academy_private.change_course_days(tid uuid,course text) returns integer[] language plpgsql stable security definer set search_path='' as $$
declare w jsonb:= '[{"weekday":6,"subjects":["هنگ درام","داربوکا","جیمبی","دف","ارف","ویولن","نقاشی","عکاسی و فیلم‌برداری"]},{"weekday":0,"subjects":["دف","کاخن","کالیمبا","موسیقی کودک","سازشناسی کودکان"]},{"weekday":1,"subjects":["گیتار فلامنکو","ویولن","ترومپت","آهنگسازی","تنظیم","صدابرداری","فن بیان","نقاشی","دف","دی جی"]},{"weekday":2,"subjects":["گیتار","سلفژ","آواز","کلارینت","ترومپت","نی","ویولن","تئوری موسیقی"]},{"weekday":3,"subjects":["تنبک","پیانو","درام","ملودیکا","کیبورد","ویولن","ترومپت","نقاشی"]},{"weekday":4,"subjects":["سنتور","تار","سه‌تار","عود","دف","تنبک","ویولن","موسیقی کودک"]}]';target text;ds integer[];
begin
 target:=replace(replace(regexp_replace(course,'[[:space:]‌]','','g'),'ي','ی'),'ك','ک');
 select array_agg(distinct (d->>'weekday')::int) into ds from jsonb_array_elements(w) d cross join lateral jsonb_array_elements_text(d->'subjects') v where replace(replace(regexp_replace(v,'[[:space:]‌]','','g'),'ي','ی'),'ك','ک')=any(case target when 'آهنگسازیوتنظیم' then array['آهنگسازی','تنظیم'] when 'فیلمبرداریوعکاسی' then array['عکاسیوفیلمبرداری'] when 'صداسازی' then array['آواز'] else array[target] end);
 if ds is null then select array_agg(distinct (d->>'weekday')::int) into ds from public.teachers t cross join unnest(t.subjects) sub cross join jsonb_array_elements(w) d cross join jsonb_array_elements_text(d->'subjects') v where t.id=tid and replace(regexp_replace(v,'[[:space:]‌]','','g'),'ي','ی')=replace(regexp_replace(sub,'[[:space:]‌]','','g'),'ي','ی');end if;
 return coalesce(ds,'{}');
end$$;
revoke all on function academy_private.change_course_days(uuid,text) from public,anon;grant execute on function academy_private.change_course_days(uuid,text) to authenticated;
create function academy_private.class_change_plan(sid uuid,tid uuid,wd integer,tm time) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.students;t public.teachers;mt public.monthly_tuition;m public.academy_months;ds date[];candidates date[];locked_dates date[];indices integer[];i integer;k integer;date_now date:=(now() at time zone 'Asia/Tehran')::date;months jsonb:='[]';planned jsonb:='[]';c public.sessions;nd date;ns timestamptz;finger text;old jsonb;target jsonb;v jsonb;other jsonb;
begin
 if auth.uid() is null then raise exception 'ورود لازم است';end if;
 select * into strict s from public.students where id=sid and archived_at is null;
 if not (academy_private.is_admin() or (s.user_id is not distinct from auth.uid() and not exists(select 1 from public.academy_staff where user_id=auth.uid()))) then raise exception 'فقط پرونده خودتان یا مدیر';end if;
 select * into strict t from public.teachers where id=tid;
 if not coalesce(s.subject=any(t.subjects),false) then raise exception 'استاد جدید باید مدرس همین رشته باشد';end if;
 if wd is null or wd not between 0 and 6 or not(wd=any(academy_private.change_course_days(tid,s.subject))) then raise exception 'روز انتخابی در برنامه این رشته نیست';end if;
 if tm is null or tm<'10:00' or tm>'22:40' or extract(minute from tm)::int%20<>0 or extract(second from tm)<>0 then raise exception 'ساعت در گام‌های ۲۰ دقیقه از ۱۰:۰۰ تا ۲۲:۴۰ انتخاب شود';end if;
 if (s.teacher_id,s.weekday,s.class_time) is not distinct from (tid,wd,tm) then raise exception 'برنامه جدید با برنامه فعلی یکسان است';end if;
 if exists(select 1 from public.students x where x.id<>sid and x.archived_at is null and x.weekday=wd and (x.teacher_id=tid or x.profile_id=s.profile_id) and abs(extract(epoch from(x.class_time-tm)))<1200) or exists(select 1 from academy_private.class_slot_claims x where x.teacher_id=tid and x.weekday=wd and x.student_id is distinct from sid and abs(extract(epoch from(x.class_time-tm)))<1200) then raise exception 'این زمان با کلاس دیگر هنرجو، استاد یا ثبت‌نام رزروشده تداخل دارد';end if;
 old:=jsonb_build_object('teacher_id',s.teacher_id,'weekday',s.weekday,'class_time',s.class_time,'subject',s.subject);
 target:=jsonb_build_object('teacher_id',tid,'weekday',wd,'class_time',tm,'subject',s.subject);
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
  if exists(select 1 from jsonb_array_elements(planned) x where x->>'id'<>v->>'id' and abs(extract(epoch from((x->>'after')::timestamptz-(v->>'after')::timestamptz)))<1200) or exists(select 1 from public.sessions x join public.students xs on xs.id=x.student_id left join public.session_instructors a on a.session_id=x.id where xs.archived_at is null and x.status='scheduled' and x.id not in(select (q->>'id')::uuid from jsonb_array_elements(planned) q) and (coalesce(a.teacher_id,xs.teacher_id)=tid or xs.profile_id=s.profile_id) and abs(extract(epoch from(x.starts_at-(v->>'after')::timestamptz)))<1200) then raise exception 'زمان جدید با یک جلسه مشخص یا جبرانی تداخل دارد';end if;
 end loop;
 finger:=md5(jsonb_build_object('old',old,'target',target,'months',months,'sessions',planned)::text);
 return jsonb_build_object('student_id',sid,'student_name',s.first_name||' '||s.last_name,'before',old,'after',target,'months',months,'sessions',planned,'preview_hash',finger,'notice','پرداخت‌ها، شناسه کلاس، سوابق جلسات نهایی و جبرانی‌های تعیین‌شده حفظ می‌شوند. تغییر از تأیید مدیر اعمال می‌شود.');
end$$;
revoke all on function academy_private.class_change_plan(uuid,uuid,integer,time) from public,anon;grant execute on function academy_private.class_change_plan(uuid,uuid,integer,time) to authenticated;
create function public.class_change_preview(student_id uuid,teacher_id uuid,weekday integer,class_time time) returns jsonb language sql security invoker set search_path='' as $$select academy_private.class_change_plan(student_id,teacher_id,weekday,class_time)$$;
revoke all on function public.class_change_preview(uuid,uuid,integer,time) from public,anon;grant execute on function public.class_change_preview(uuid,uuid,integer,time) to authenticated;
-- Preserve the existing received-income attribution when a class changes instructor.
-- These are metadata snapshots, never financial ledger writes.
create table public.class_payment_instructors(record_key text primary key,student_id uuid not null references public.students(id),teacher_id uuid not null references public.teachers(id));
alter table public.class_payment_instructors enable row level security;
create policy class_payment_instructors_read on public.class_payment_instructors for select to authenticated using(academy_private.is_admin());
revoke all on public.class_payment_instructors from public,anon,authenticated;
grant select on public.class_payment_instructors to authenticated;
create function academy_private.class_change_action(op text,data jsonb,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();s public.students;r public.class_change_requests;previous academy_private.class_change_operations;p jsonb;v jsonb;rid uuid;body jsonb;tid uuid;wd integer;tm time;teacher_name text;day_names text[]:=array['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];lock_tid uuid;
begin
 if who is null or request_key is null or octet_length(data::text)>8000 then raise exception 'ورود و درخواست معتبر لازم است';end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,3));
 select * into previous from academy_private.class_change_operations x where actor=who and x.request_key=class_change_action.request_key;
 if found then if previous.op<>op or previous.payload<>data then raise exception 'شناسه تکراری با محتوای متفاوت';end if;return previous.result||jsonb_build_object('duplicate',true);end if;
 if (select count(*) from academy_private.class_change_operations where actor=who and created_at>now()-interval '1 minute')>=15 then raise exception 'درخواست زیاد؛ کمی بعد تلاش کنید';end if;
 if op in('approve','reject') then
  if not academy_private.is_admin() then raise exception 'بررسی فقط توسط مدیر';end if;
  select * into strict r from public.class_change_requests where id=(data->>'id')::uuid and status='pending' for update;
  rid:=r.id;
 end if;
 if op='reject' then
  if length(btrim(coalesce(data->>'note',''))) not between 3 and 1000 then raise exception 'دلیل رد درخواست را بنویسید';end if;
  update public.class_change_requests set status='rejected',review_note=btrim(data->>'note'),reviewed_by=who,reviewed_at=now() where id=r.id;
  insert into public.notices(student_id,message) values(r.student_id,'درخواست تغییر برنامه بررسی و رد شد: '||btrim(data->>'note'));
  body:=jsonb_build_object('completed',true,'id',r.id,'status','rejected');
 elsif op in('request','apply','approve') then
  if op<>'request' and not academy_private.is_admin() then raise exception 'تغییر مستقیم یا تأیید فقط توسط مدیر';end if;
  select * into strict s from public.students where id=coalesce(r.student_id,(data->>'student_id')::uuid) and archived_at is null for update;
  if op='request' and (s.user_id is distinct from who or exists(select 1 from public.academy_staff where user_id=who)) then raise exception 'فقط درخواست کلاس خود هنرجو';end if;
  tid:=(data->>'teacher_id')::uuid;wd:=(data->>'weekday')::integer;tm:=(data->>'class_time')::time;
  perform pg_advisory_xact_lock(hashtextextended(s.profile_id::text,8));
  for lock_tid in select distinct t from unnest(array[s.teacher_id,tid]) t order by t loop perform pg_advisory_xact_lock(hashtext(lock_tid::text));end loop;
  perform 1 from public.monthly_tuition where student_id=s.id order by id for update;
  perform 1 from public.sessions where student_id=s.id and status='scheduled' and starts_at>now() order by id for update;
  p:=academy_private.class_change_plan(s.id,tid,wd,tm);
  if coalesce(data->>'preview_hash','')<>p->>'preview_hash' then raise exception 'اطلاعات برنامه تغییر کرده؛ پیش‌نمایش تازه بگیرید';end if;
  if op='request' then
   if length(btrim(coalesce(data->>'reason',''))) not between 5 and 1000 then raise exception 'دلیل درخواست را در ۵ تا ۱۰۰۰ کاراکتر بنویسید';end if;
   if exists(select 1 from public.class_change_requests where student_id=s.id and status='pending') then raise exception 'این کلاس یک درخواست در انتظار بررسی دارد';end if;
   insert into public.class_change_requests(user_id,student_id,previous_schedule,requested_schedule,reason) values(who,s.id,p->'before',p->'after',btrim(data->>'reason')) returning id into rid;
   body:=jsonb_build_object('completed',true,'id',rid,'status','pending');
  else
   if op='approve' and r.previous_schedule<>p->'before' then raise exception 'برنامه فعلی با زمان ثبت درخواست فرق دارد؛ درخواست را دوباره بررسی کنید';end if;
   if op='apply' and length(btrim(coalesce(data->>'note',''))) not between 3 and 1000 then raise exception 'توضیح تغییر مستقیم لازم است';end if;
   insert into public.class_payment_instructors(record_key,student_id,teacher_id)
   select x.key,s.id,s.teacher_id from (
    select id::text as key from public.payments where student_id=s.id
    union all select 'monthly-receipt:'||receipt.id::text from public.monthly_receipts receipt join public.monthly_tuition m on m.id=receipt.tuition_id where m.student_id=s.id
    union all select 'monthly-manual:'||m.id::text from public.monthly_tuition m where m.student_id=s.id and true=any(m.paid)
   ) x on conflict do nothing;
   insert into academy_private.class_change_context values(txid_current(),s.id,who);
   delete from academy_private.class_slot_claims where student_id=s.id;
   update public.students set teacher_id=tid,weekday=wd,class_time=tm where id=s.id;
   delete from academy_private.class_change_context where tx=txid_current() and student_id=s.id;
   for v in select value from jsonb_array_elements(p->'months') loop
    update public.monthly_tuition set dates=array(select value::date from jsonb_array_elements_text(v->'after')) where id=(v->>'id')::uuid;
   end loop;
   -- Temporary distinct times prevent unique collisions while shifting several scheduled rows atomically.
   for v in select value from jsonb_array_elements(p->'sessions') loop update public.sessions set starts_at=starts_at+interval '100 years' where id=(v->>'id')::uuid;end loop;
   for v in select value from jsonb_array_elements(p->'sessions') loop
    update public.sessions set starts_at=(v->>'after')::timestamptz where id=(v->>'id')::uuid;
    update public.session_instructors set teacher_id=tid where session_id=(v->>'id')::uuid;
   end loop;
   select name into teacher_name from public.teachers where id=tid;
   if op='approve' then update public.class_change_requests set status='approved',approved_schedule=p->'after',review_note=coalesce(data->>'note',''),reviewed_by=who,reviewed_at=now() where id=r.id;
   else update public.class_change_requests set status='superseded',review_note='برنامه این کلاس مستقیماً توسط مدیر تغییر کرد.',reviewed_by=who,reviewed_at=now() where student_id=s.id and status='pending';rid:=s.id;end if;
   insert into public.notices(student_id,message) values(s.id,'برنامه کلاس '||s.subject||' تغییر کرد: استاد '||teacher_name||'، '||day_names[wd+1]||' ساعت '||to_char(tm,'HH24:MI')||'. شهریه و سوابق قبلی حفظ شده‌اند.');
   body:=jsonb_build_object('completed',true,'id',rid,'student_id',s.id,'status','approved','applied',true);
  end if;
 else raise exception 'عملیات نامعتبر';end if;
 insert into academy_private.class_change_operations(actor,request_key,op,payload,result) values(who,request_key,op,data,body);
 insert into public.academy_activity(actor,action,entity_id,details) values(who,'class_change_'||op,rid,jsonb_build_object('request_key',request_key,'plan',p,'note',data->>'note'));
 return body;
end$$;
revoke all on function academy_private.class_change_action(text,jsonb,uuid) from public,anon;grant execute on function academy_private.class_change_action(text,jsonb,uuid) to authenticated;
create function public.class_change_action(op text,data jsonb,request_key uuid) returns jsonb language sql security invoker set search_path='' as $$select academy_private.class_change_action(op,data,request_key)$$;
revoke all on function public.class_change_action(text,jsonb,uuid) from public,anon;grant execute on function public.class_change_action(text,jsonb,uuid) to authenticated;
create function academy_private.class_change_info() returns jsonb language plpgsql security definer set search_path='' as $$declare who uuid:=auth.uid();r text;begin
 if who is null then raise exception 'ورود لازم است';end if;
 select role into r from public.academy_staff where user_id=who;r:=coalesce(r,'student');if r not in('admin','student') then raise exception 'این بخش برای مدیر و هنرجو است';end if;
 return jsonb_build_object('role',r,'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'first_name',s.first_name,'last_name',s.last_name,'subject',s.subject,'teacher_id',s.teacher_id,'weekday',s.weekday,'class_time',s.class_time) order by s.last_name,s.subject),'[]') from public.students s where s.archived_at is null and (r='admin' or s.user_id=who)),
 'teachers',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'subjects',t.subjects,'subject_days',(select jsonb_object_agg(x,to_jsonb(academy_private.change_course_days(t.id,x))) from unnest(t.subjects) x)) order by t.name),'[]') from public.teachers t),
 'requests',(select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]') from (select x.* from public.class_change_requests x join public.students s on s.id=x.student_id where s.archived_at is null and (r='admin' or (x.user_id=who and s.user_id=who)) order by x.created_at desc limit 200)q));
end$$;
revoke all on function academy_private.class_change_info() from public,anon;grant execute on function academy_private.class_change_info() to authenticated;
create function public.class_change_info() returns jsonb language sql security invoker set search_path='' as $$select academy_private.class_change_info()$$;
revoke all on function public.class_change_info() from public,anon;grant execute on function public.class_change_info() to authenticated;
create function academy_private.class_change_slots(sid uuid,tid uuid,wd integer) returns jsonb language plpgsql security definer set search_path='' as $$declare s public.students;begin
 if auth.uid() is null then raise exception 'ورود لازم است';end if;select * into strict s from public.students where id=sid and archived_at is null;
 if not(academy_private.is_admin() or (s.user_id is not distinct from auth.uid() and not exists(select 1 from public.academy_staff where user_id=auth.uid()))) then raise exception 'کلاس مجاز نیست';end if;
 return (select jsonb_agg(jsonb_build_object('time',to_char(('10:00'::time+n*interval '20 minutes')::time,'HH24:MI'),'busy',exists(select 1 from academy_private.class_slot_claims x where x.teacher_id=tid and x.weekday=wd and x.student_id is distinct from sid and abs(extract(epoch from(x.class_time-('10:00'::time+n*interval '20 minutes')::time)))<1200) or exists(select 1 from public.students x where x.id<>sid and x.archived_at is null and x.weekday=wd and (x.teacher_id=tid or x.profile_id=s.profile_id) and abs(extract(epoch from(x.class_time-('10:00'::time+n*interval '20 minutes')::time)))<1200)) order by n) from generate_series(0,38) n);
end$$;
revoke all on function academy_private.class_change_slots(uuid,uuid,integer) from public,anon;grant execute on function academy_private.class_change_slots(uuid,uuid,integer) to authenticated;
create function public.class_change_slots(student_id uuid,teacher_id uuid,weekday integer) returns jsonb language sql security invoker set search_path='' as $$select academy_private.class_change_slots(student_id,teacher_id,weekday)$$;
revoke all on function public.class_change_slots(uuid,uuid,integer) from public,anon;grant execute on function public.class_change_slots(uuid,uuid,integer) to authenticated;
create or replace function academy_private.teacher_dashboard() returns jsonb language plpgsql security definer set search_path='' as $$declare tid uuid;begin
 select teacher_id into tid from public.academy_staff where user_id=auth.uid() and role='teacher';if tid is null then raise exception 'دسترسی استاد معتبر نیست';end if;
 return jsonb_build_object('teachers',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.teachers t where id=tid),'students',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'profile_id',s.profile_id,'archived_at',s.archived_at,'first_name',s.first_name,'last_name',s.last_name,'subject',s.subject,'teacher_id',s.teacher_id,'weekday',s.weekday,'class_time',s.class_time,'opening_credit',0,'opening_debt',0)),'[]') from public.students s where teacher_id=tid),'sessions',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('teacher_id',a.teacher_id,'student_name',s.first_name||' '||s.last_name,'subject',s.subject,'class_archived_at',s.archived_at)),'[]') from public.sessions c join public.session_instructors a on a.session_id=c.id join public.students s on s.id=c.student_id where a.teacher_id=tid),'payroll',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.payroll p where teacher_id=tid));
end$$;

-- Session ownership follows its snapshot, including explicitly preserved makeup sessions.
create or replace function academy_private.mark_teacher_session(session_id uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or new_status not in ('completed','absent','teacher_cancelled') then raise exception 'درخواست نامعتبر';end if;
 if not exists(select 1 from public.sessions c join public.session_instructors i on i.session_id=c.id join public.students s on s.id=c.student_id join public.academy_staff a on a.teacher_id=i.teacher_id where a.user_id=auth.uid() and a.role='teacher' and c.id=session_id and s.archived_at is null) then raise exception 'دسترسی غیرمجاز';end if;
 update public.sessions set status=new_status where id=session_id;
 if new_status='teacher_cancelled' then insert into public.notices(student_id,message) select student_id,'استاد عدم حضور خود را اعلام کرد. زمان جبرانی توسط دفتر اعلام می‌شود.' from public.sessions where id=session_id;end if;
end$$;
