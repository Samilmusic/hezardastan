-- Additive assistant storage. Existing academy records and finance rules are untouched.
create table public.hezarava_records (
 id uuid primary key default gen_random_uuid(), actor uuid not null references auth.users(id),
 kind text not null check(kind in ('request','teacher_note')), student_id uuid not null references public.students(id),
 subject text not null, message text not null check(length(message) between 3 and 3000), practice text not null default '',
 status text not null default 'pending' check(status in ('pending','reviewed','rejected')), review_note text not null default '', created_at timestamptz not null default now()
);
create index hezarava_records_actor_idx on public.hezarava_records(actor,created_at desc);
create index hezarava_records_student_idx on public.hezarava_records(student_id);
alter table public.hezarava_records enable row level security;
create function academy_private.hezarava_teacher(sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.students s join public.academy_staff a on a.teacher_id=s.teacher_id where s.id=sid and s.archived_at is null and a.user_id=auth.uid() and a.role in('teacher','admin'))
$$;
revoke all on function academy_private.hezarava_teacher(uuid) from public,anon;grant execute on function academy_private.hezarava_teacher(uuid) to authenticated;
create policy hezarava_read on public.hezarava_records for select to authenticated using(academy_private.is_admin() or (actor=auth.uid() and (kind='request' or academy_private.hezarava_teacher(student_id))));
grant select on public.hezarava_records to authenticated;
create table academy_private.hezarava_operations (
 id uuid primary key default gen_random_uuid(),actor uuid not null references auth.users(id),request_key uuid not null,
 actor_role text not null,kind text not null,payload jsonb not null,preview jsonb not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '10 minutes',result jsonb,unique(actor,request_key)
);
alter table academy_private.hezarava_operations enable row level security;
revoke all on academy_private.hezarava_operations from public,anon,authenticated;
create table academy_private.hezarava_rate(actor uuid primary key,started timestamptz not null default now(),hits integer not null default 0);
alter table academy_private.hezarava_rate enable row level security;
revoke all on academy_private.hezarava_rate from public,anon,authenticated;
create function academy_private.hezarava_throttle() returns void language plpgsql security definer set search_path='' as $$declare n integer;begin
 if auth.uid() is null then raise exception 'ورود لازم است';end if;
 insert into academy_private.hezarava_rate(actor,hits) values(auth.uid(),1) on conflict(actor) do update set hits=case when hezarava_rate.started<now()-interval '1 minute' then 1 else hezarava_rate.hits+1 end,started=case when hezarava_rate.started<now()-interval '1 minute' then now() else hezarava_rate.started end returning hits into n;
 if n>30 then raise exception 'درخواست‌های زیاد؛ یک دقیقه دیگر تلاش کنید';end if;
end$$;
revoke all on function academy_private.hezarava_throttle() from public,anon;grant execute on function academy_private.hezarava_throttle() to authenticated;
create function public.hezarava_throttle() returns void language sql security invoker set search_path='' as $$select academy_private.hezarava_throttle()$$;
revoke all on function public.hezarava_throttle() from public,anon;grant execute on function public.hezarava_throttle() to authenticated;
create function academy_private.hezarava_action(command text,operation uuid,request_key uuid,action_kind text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();r text;tid uuid;o academy_private.hezarava_operations;s public.students;rec public.hezarava_records;preview jsonb;rid uuid;body jsonb;
begin
 if who is null then raise exception 'ورود لازم است';end if;
 select a.role,a.teacher_id into r,tid from public.academy_staff a where a.user_id=who;r:=coalesce(r,'student');
 if command='prepare' then
  if request_key is null or octet_length(data::text)>12000 then raise exception 'درخواست نامعتبر';end if;
  perform pg_advisory_xact_lock(hashtextextended(who::text,0));
  select * into o from academy_private.hezarava_operations x where x.actor=who and x.request_key=hezarava_action.request_key;
  if found then if o.payload<>data or o.kind<>action_kind then raise exception 'شناسه تکراری با محتوای متفاوت';end if;return jsonb_build_object('id',o.id,'preview',o.preview,'expires_at',o.expires_at,'completed',o.result is not null,'result',o.result);end if;
  if (select count(*) from academy_private.hezarava_operations x where x.actor=who and created_at>now()-interval '1 minute')>=10 then raise exception 'تعداد پیش‌نویس زیاد است؛ کمی صبر کنید';end if;
 elsif command='confirm' then
  select * into strict o from academy_private.hezarava_operations x where x.id=operation and x.actor=who for update;
  if o.result is not null then return o.result||jsonb_build_object('duplicate',true);end if;
  if o.expires_at<now() or o.actor_role<>r then raise exception 'پیش‌نمایش منقضی شده یا دسترسی تغییر کرده؛ دوباره بررسی کنید';end if;
  data:=o.payload;action_kind:=o.kind;
 else raise exception 'عملیات نامعتبر';end if;
 if action_kind='feedback' then
  if r<>'student' or not exists(select 1 from public.students where user_id=who and archived_at is null) then raise exception 'این بخش برای هنرجوی فعال است';end if;
  if coalesce(data->>'kind','') not in('suggestion','criticism','appreciation') or length(btrim(coalesce(data->>'subject','')) ) not between 3 and 120 or length(btrim(coalesce(data->>'message',''))) not between 10 and 3000 then raise exception 'موضوع یا متن پیام معتبر نیست';end if;
  preview:=jsonb_build_object('title','ارسال پیام برای مدیر','subject',data->>'subject','message',data->>'message','notice','نام شما همراه پیام برای مدیر ثبت می‌شود.');
 elsif action_kind in('request','teacher_note','notice') then
  select * into strict s from public.students where id=(data->>'student_id')::uuid and archived_at is null for share;
  if length(btrim(coalesce(data->>'message',''))) not between 3 and 3000 then raise exception 'متن باید ۳ تا ۳۰۰۰ کاراکتر باشد';end if;
  if action_kind='teacher_note' then
   if r not in('teacher','admin') or tid is null or tid<>s.teacher_id then raise exception 'فقط کلاس خود استاد';end if;
   if length(coalesce(data->>'practice',''))>3000 then raise exception 'تمرین بیش از حد طولانی است';end if;
   preview:=jsonb_build_object('title','ثبت یادداشت و تمرین استاد','notice','یادداشت برای همین کلاس و نویسنده ثبت می‌شود؛ تغییر حضور و غیاب نیست.','practice',data->>'practice');
  elsif action_kind='notice' then
   if r not in('admin','secretary') then raise exception 'دسترسی دفتر لازم است';end if;
   preview:=jsonb_build_object('title','ارسال پیام در پرتال هنرجو','notice','فقط در پرتال؛ ارسال پیامک یا ایمیل متصل نیست.');
  else
   if not coalesce(((r='student' and s.user_id=who) or (r in('teacher','admin') and tid=s.teacher_id)),false) then raise exception 'فقط کلاس خودتان';end if;
   if coalesce(data->>'kind','') not in('time_change','makeup','absence') then raise exception 'نوع درخواست نامعتبر';end if;
   preview:=jsonb_build_object('title','ثبت درخواست برای مدیریت','notice','این فقط ثبت درخواست است؛ برنامه، حضور و غیاب یا جبرانی تأیید نمی‌شود.');
  end if;
  preview:=preview||jsonb_build_object('class',s.subject||' · '||s.first_name||' '||s.last_name,'message',data->>'message');
 elsif action_kind='review_request' then
  if r<>'admin' then raise exception 'فقط مدیر';end if;
  select * into strict rec from public.hezarava_records where id=(data->>'id')::uuid and kind='request' and status='pending' for update;
  if coalesce(data->>'status','') not in('reviewed','rejected') or length(coalesce(data->>'review_note',''))>3000 then raise exception 'نتیجه نامعتبر';end if;
  preview:=jsonb_build_object('title','ثبت نتیجه بررسی درخواست','message',rec.message,'status',data->>'status','notice','فقط وضعیت درخواست تغییر می‌کند؛ تغییر برنامه باید از تقویم انجام شود.','review_note',data->>'review_note');
 else raise exception 'عملیات پشتیبانی نمی‌شود';end if;
 if command='prepare' then
  insert into academy_private.hezarava_operations(actor,request_key,actor_role,kind,payload,preview) values(who,request_key,r,action_kind,data,preview) returning * into o;
  return jsonb_build_object('id',o.id,'preview',preview,'expires_at',o.expires_at,'completed',false);
 end if;
 if action_kind='feedback' then
  insert into public.student_feedback(user_id,kind,subject,message) values(who,data->>'kind',btrim(data->>'subject'),btrim(data->>'message')) returning id into rid;
 elsif action_kind='notice' then
  insert into public.notices(student_id,message) values(s.id,btrim(data->>'message')) returning id into rid;
 elsif action_kind='review_request' then
  update public.hezarava_records set status=data->>'status',review_note=coalesce(data->>'review_note','') where id=rec.id returning id into rid;
 else
  insert into public.hezarava_records(actor,kind,student_id,subject,message,practice) values(who,action_kind,s.id,case when action_kind='teacher_note' then 'یادداشت جلسه' else data->>'kind' end,btrim(data->>'message'),coalesce(data->>'practice','')) returning id into rid;
 end if;
 body:=jsonb_build_object('completed',true,'record_id',rid,'operation_id',o.id,'kind',action_kind);
 insert into public.academy_activity(actor,action,entity_id,details) values(who,'hezarava_'||action_kind,rid,jsonb_build_object('operation_id',o.id));
 update academy_private.hezarava_operations set result=body where id=o.id;
 return body;
end$$;
revoke all on function academy_private.hezarava_action(text,uuid,uuid,text,jsonb) from public,anon;grant execute on function academy_private.hezarava_action(text,uuid,uuid,text,jsonb) to authenticated;
create function public.hezarava_prepare(request_key uuid,action_kind text,data jsonb) returns jsonb language sql security invoker set search_path='' as $$select academy_private.hezarava_action('prepare',null,request_key,action_kind,data)$$;
create function public.hezarava_confirm(operation uuid) returns jsonb language sql security invoker set search_path='' as $$select academy_private.hezarava_action('confirm',operation,null,null,null)$$;
revoke all on function public.hezarava_prepare(uuid,text,jsonb),public.hezarava_confirm(uuid) from public,anon;
grant execute on function public.hezarava_prepare(uuid,text,jsonb),public.hezarava_confirm(uuid) to authenticated;
