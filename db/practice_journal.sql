-- Educational journal only. No existing student/session/payment records are modified.
create table public.lesson_reviews(
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.students(id),teacher_id uuid not null references public.teachers(id),author uuid not null references auth.users(id),
 session_id uuid unique references public.sessions(id),lesson_date date not null,lesson_time time not null,
 score integer not null check(score between 1 and 10),strengths text not null default '' check(length(strengths)<=2000),challenges text not null check(length(challenges) between 3 and 2000),practice text not null check(length(practice) between 3 and 3000),practice_minutes integer not null check(practice_minutes between 5 and 120),due_date date,
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(student_id,lesson_date,lesson_time)
);
create index lesson_reviews_class_idx on public.lesson_reviews(student_id,lesson_date desc,lesson_time desc);
create index lesson_reviews_teacher_idx on public.lesson_reviews(teacher_id);
create index lesson_reviews_author_idx on public.lesson_reviews(author);
alter table public.lesson_reviews enable row level security;
create table public.practice_audio(
 id uuid primary key,actor uuid not null references auth.users(id),student_id uuid not null references public.students(id),review_id uuid not null references public.lesson_reviews(id),review_version integer not null default 1,parent_id uuid references public.practice_audio(id),kind text not null check(kind in('performance','feedback')),object_path text not null unique,mime_type text not null,file_bytes integer not null check(file_bytes between 1 and 12582912),duration numeric not null check(duration>0 and duration<=180),position_seconds numeric not null default 0 check(position_seconds>=0 and position_seconds<=180),ready boolean not null default false,created_at timestamptz not null default now(),published_at timestamptz
);
create index practice_audio_class_idx on public.practice_audio(student_id,published_at);
create index practice_audio_review_idx on public.practice_audio(review_id,created_at desc);
create index practice_audio_parent_idx on public.practice_audio(parent_id);
create index practice_audio_actor_idx on public.practice_audio(actor,created_at desc);
alter table public.practice_audio enable row level security;
create table public.practice_annotations(
 id uuid primary key default gen_random_uuid(),audio_id uuid not null references public.practice_audio(id),author uuid not null references auth.users(id),position_seconds numeric not null check(position_seconds>=0 and position_seconds<=180),message text not null check(length(message) between 3 and 2000),created_at timestamptz not null default now()
);
create index practice_annotations_audio_idx on public.practice_annotations(audio_id,position_seconds);
create index practice_annotations_author_idx on public.practice_annotations(author);
alter table public.practice_annotations enable row level security;
create table academy_private.practice_operations(actor uuid not null references auth.users(id),request_key uuid not null,op text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor,request_key));
alter table academy_private.practice_operations enable row level security;
revoke all on academy_private.practice_operations from public,anon,authenticated;
create function academy_private.practice_access(sid uuid,tid uuid,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.students s where s.id=sid and (
  (not writing and (academy_private.is_admin() or (s.user_id=auth.uid() and not exists(select 1 from public.academy_staff where user_id=auth.uid())))) or
  (s.archived_at is null and s.teacher_id=tid and exists(select 1 from public.academy_staff a where a.user_id=auth.uid() and a.role in('teacher','admin') and a.teacher_id=tid))
 ))
$$;
revoke all on function academy_private.practice_access(uuid,uuid,boolean) from public,anon;grant execute on function academy_private.practice_access(uuid,uuid,boolean) to authenticated;
create function academy_private.practice_audio_access(aid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.practice_audio a join public.lesson_reviews r on r.id=a.review_id where a.id=aid and a.ready and academy_private.practice_access(r.student_id,r.teacher_id,false))
$$;
revoke all on function academy_private.practice_audio_access(uuid) from public,anon;grant execute on function academy_private.practice_audio_access(uuid) to authenticated;
create policy lesson_reviews_read on public.lesson_reviews for select to authenticated using(academy_private.practice_access(student_id,teacher_id,false));
create policy practice_audio_read on public.practice_audio for select to authenticated using(academy_private.practice_audio_access(id));
create policy practice_annotations_read on public.practice_annotations for select to authenticated using(academy_private.practice_audio_access(audio_id));
grant select on public.lesson_reviews,public.practice_audio,public.practice_annotations to authenticated;
create function academy_private.practice_file_access(path text,uploading boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.practice_audio a join public.lesson_reviews r on r.id=a.review_id where a.object_path=path and case when uploading then a.actor=auth.uid() and not a.ready and a.created_at>now()-interval '30 minutes' and exists(select 1 from public.students s where s.id=a.student_id and s.archived_at is null and ((a.kind='performance' and s.user_id=auth.uid() and not exists(select 1 from public.academy_staff where user_id=auth.uid())) or (a.kind='feedback' and academy_private.practice_access(r.student_id,r.teacher_id,true)))) else a.ready and academy_private.practice_access(r.student_id,r.teacher_id,false) end)
$$;
revoke all on function academy_private.practice_file_access(text,boolean) from public,anon;grant execute on function academy_private.practice_file_access(text,boolean) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('academy-practice','academy-practice',false,12582912,array['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/aac','audio/flac']);
create policy academy_practice_upload on storage.objects for insert to authenticated with check(bucket_id='academy-practice' and academy_private.practice_file_access(name,true));
create policy academy_practice_read on storage.objects for select to authenticated using(bucket_id='academy-practice' and academy_private.practice_file_access(name,false));
create function academy_private.practice_action(op text,data jsonb,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();a public.academy_staff;s public.students;r public.lesson_reviews;f public.practice_audio;p public.practice_audio;prev academy_private.practice_operations;rid uuid;body jsonb;before_row jsonb;ld date;lt time;duration numeric;pos numeric;mime text;ext text;obj storage.objects;
begin
 if who is null or request_key is null or octet_length(data::text)>18000 then raise exception 'درخواست معتبر و ورود لازم است';end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,1));
 select * into prev from academy_private.practice_operations x where x.actor=who and x.request_key=practice_action.request_key;
 if found then if prev.op<>op or prev.payload<>data then raise exception 'شناسه تکراری با محتوای متفاوت';end if;return prev.result||jsonb_build_object('duplicate',true);end if;
 if (select count(*) from academy_private.practice_operations where actor=who and created_at>now()-interval '1 minute')>=20 then raise exception 'درخواست زیاد؛ کمی صبر کنید';end if;
 select * into a from public.academy_staff where user_id=who;
 if op='review' then
  select * into strict s from public.students where id=(data->>'student_id')::uuid and archived_at is null for share;
  if not academy_private.practice_access(s.id,s.teacher_id,true) then raise exception 'فقط استاد همین کلاس می‌تواند ارزیابی ثبت کند';end if;
  ld:=(data->>'lesson_date')::date;lt:=(data->>'lesson_time')::time;
  if ld is null or lt is null or ld>(now() at time zone 'Asia/Tehran')::date then raise exception 'تاریخ و ساعت جلسه معتبر نیست؛ جلسه آینده امتیاز ندارد';end if;
  if nullif(data->>'session_id','') is not null then
   if not exists(select 1 from public.sessions c where c.id=(data->>'session_id')::uuid and c.student_id=s.id and c.status='completed' and (c.starts_at at time zone 'Asia/Tehran')::date=ld and (c.starts_at at time zone 'Asia/Tehran')::time=lt) then raise exception 'جلسه برگزارشده با این کلاس و تاریخ هماهنگ نیست';end if;
  end if;
  if nullif(data->>'id','') is null then
   insert into public.lesson_reviews(student_id,teacher_id,author,session_id,lesson_date,lesson_time,score,strengths,challenges,practice,practice_minutes,due_date) values(s.id,s.teacher_id,who,nullif(data->>'session_id','')::uuid,ld,lt,(data->>'score')::integer,btrim(coalesce(data->>'strengths','')),btrim(data->>'challenges'),btrim(data->>'practice'),(data->>'practice_minutes')::integer,nullif(data->>'due_date','')::date) returning * into r;
  else
   select * into strict r from public.lesson_reviews where id=(data->>'id')::uuid and student_id=s.id and teacher_id=s.teacher_id for update;
   if r.version<>coalesce((data->>'version')::int,0) then raise exception 'این ارزیابی تغییر کرده؛ تازه‌سازی و دوباره بررسی کنید';end if;
   if r.lesson_date<>ld or r.lesson_time<>lt or r.session_id is distinct from nullif(data->>'session_id','')::uuid then raise exception 'هویت جلسه در ویرایش قابل تغییر نیست';end if;
   before_row:=to_jsonb(r);
   update public.lesson_reviews set score=(data->>'score')::int,strengths=btrim(coalesce(data->>'strengths','')),challenges=btrim(data->>'challenges'),practice=btrim(data->>'practice'),practice_minutes=(data->>'practice_minutes')::int,due_date=nullif(data->>'due_date','')::date,version=version+1,updated_at=now() where id=r.id returning * into r;
  end if;
  if r.due_date is not null and r.due_date<r.lesson_date then raise exception 'مهلت تمرین قبل از تاریخ جلسه است';end if;
  rid:=r.id;body:=jsonb_build_object('completed',true,'id',rid,'version',r.version);
 elsif op='reserve_audio' then
  select * into strict r from public.lesson_reviews where id=(data->>'review_id')::uuid for share;
  select * into strict s from public.students where id=r.student_id and archived_at is null for share;
  if data->>'kind'='performance' then
   if a.user_id is not null or s.user_id is distinct from who then raise exception 'فقط هنرجوی همین کلاس می‌تواند اجرای خود را بفرستد';end if;
   if (select count(*) from public.practice_audio where review_id=r.id and actor=who and kind='performance')>=10 then raise exception 'برای هر تکلیف حداکثر ۱۰ فایل قابل ارسال است';end if;
  elsif data->>'kind'='feedback' then
   if not academy_private.practice_access(s.id,r.teacher_id,true) then raise exception 'فقط استاد همین کلاس';end if;
   select * into strict p from public.practice_audio where id=(data->>'parent_id')::uuid and review_id=r.id and kind='performance' and ready for share;
  else raise exception 'نوع فایل نامعتبر';end if;
  mime:=data->>'mime_type';ext:=case mime when 'audio/mpeg' then 'mp3' when 'audio/mp4' then 'm4a' when 'audio/wav' then 'wav' when 'audio/x-wav' then 'wav' when 'audio/webm' then 'webm' when 'audio/ogg' then 'ogg' when 'audio/aac' then 'aac' when 'audio/flac' then 'flac' end;
  duration:=(data->>'duration')::numeric;pos:=coalesce((data->>'position_seconds')::numeric,0);
  if ext is null or duration is null or pos is null or pos<0 or (p.id is not null and pos>p.duration) then raise exception 'فرمت یا موقعیت صوت معتبر نیست';end if;
  rid:=gen_random_uuid();
  insert into public.practice_audio(id,actor,student_id,review_id,review_version,parent_id,kind,object_path,mime_type,file_bytes,duration,position_seconds) values(rid,who,s.id,r.id,r.version,p.id,data->>'kind',s.id::text||'/'||rid::text||'.'||ext,mime,(data->>'file_bytes')::int,duration,pos) returning * into f;
  body:=jsonb_build_object('id',f.id,'object_path',f.object_path,'ready',false);
 elsif op='finalize_audio' then
  select * into strict f from public.practice_audio where id=(data->>'id')::uuid and actor=who for update;
  select * into strict r from public.lesson_reviews where id=f.review_id;
  select * into strict s from public.students where id=r.student_id and archived_at is null for share;
  if not ((f.kind='performance' and a.user_id is null and s.user_id is not distinct from who) or (f.kind='feedback' and academy_private.practice_access(s.id,r.teacher_id,true))) then raise exception 'دسترسی فایل تغییر کرده است';end if;
  select * into strict obj from storage.objects where bucket_id='academy-practice' and name=f.object_path;
  if coalesce((obj.metadata->>'size')::bigint,0)<>f.file_bytes or coalesce(obj.metadata->>'mimetype','')<>f.mime_type then raise exception 'مشخصات فایل بارگذاری‌شده تأیید نشد';end if;
  update public.practice_audio set ready=true,published_at=coalesce(published_at,now()) where id=f.id;
  rid:=f.id;body:=jsonb_build_object('completed',true,'id',rid,'ready',true);
 elsif op='annotate' then
  select * into strict f from public.practice_audio where id=(data->>'audio_id')::uuid and ready and kind='performance' for share;
  select * into strict r from public.lesson_reviews where id=f.review_id;
  if not academy_private.practice_access(r.student_id,r.teacher_id,true) then raise exception 'فقط استاد همین کلاس';end if;
  pos:=(data->>'position_seconds')::numeric;
  if pos is null or pos<0 or pos>f.duration then raise exception 'ثانیه انتخابی خارج از فایل است';end if;
  insert into public.practice_annotations(audio_id,author,position_seconds,message) values(f.id,who,pos,btrim(data->>'message')) returning id into rid;
  body:=jsonb_build_object('completed',true,'id',rid);
 else raise exception 'عملیات آموزشی نامعتبر';end if;
 insert into academy_private.practice_operations(actor,request_key,op,payload,result) values(who,request_key,op,data,body);
 insert into public.academy_activity(actor,action,entity_id,details) values(who,'practice_'||op,rid,jsonb_build_object('request_key',request_key,'previous_version',before_row));
 return body;
end$$;
revoke all on function academy_private.practice_action(text,jsonb,uuid) from public,anon;grant execute on function academy_private.practice_action(text,jsonb,uuid) to authenticated;
create function public.practice_action(op text,data jsonb,request_key uuid) returns jsonb language sql security invoker set search_path='' as $$select academy_private.practice_action(op,data,request_key)$$;
revoke all on function public.practice_action(text,jsonb,uuid) from public,anon;grant execute on function public.practice_action(text,jsonb,uuid) to authenticated;
create function academy_private.practice_dashboard(student_id uuid default null,page_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();a public.academy_staff;sid uuid;cs jsonb;rs jsonb;aud jsonb;notes jsonb;compare jsonb;
begin
 if who is null or page_offset<0 or page_offset>10000 then raise exception 'ورود و صفحه معتبر لازم است';end if;
 select * into a from public.academy_staff where user_id=who;
 if a.role='secretary' then raise exception 'ارزیابی آموزشی در دسترسی منشی نیست';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.last_name,q.first_name,q.subject),'[]') into cs from (
 select s.id,s.first_name,s.last_name,s.subject,s.teacher_id,t.name teacher_name,s.weekday,s.class_time,
 (select jsonb_build_object('id',r.id,'score',r.score,'lesson_date',r.lesson_date,'practice',r.practice,'due_date',r.due_date) from public.lesson_reviews r where r.student_id=s.id and academy_private.practice_access(r.student_id,r.teacher_id,false) order by r.lesson_date desc,r.lesson_time desc limit 1) latest_review,
 (select count(*) from public.sessions c where c.student_id=s.id and c.status='completed' and not exists(select 1 from public.lesson_reviews r where r.session_id=c.id or (r.student_id=s.id and r.lesson_date=(c.starts_at at time zone 'Asia/Tehran')::date and r.lesson_time=(c.starts_at at time zone 'Asia/Tehran')::time))) unreviewed_sessions,
 (select count(*) from public.lesson_reviews r where r.student_id=s.id and academy_private.practice_access(r.student_id,r.teacher_id,false) and r.due_date<(now() at time zone 'Asia/Tehran')::date and not exists(select 1 from public.practice_audio x where x.review_id=r.id and x.kind='performance' and x.ready)) overdue_practice,
 (select count(*) from public.practice_audio x join public.lesson_reviews r on r.id=x.review_id where x.student_id=s.id and x.kind='performance' and x.ready and academy_private.practice_access(r.student_id,r.teacher_id,false) and not exists(select 1 from public.practice_annotations n where n.audio_id=x.id) and not exists(select 1 from public.practice_audio n where n.parent_id=x.id and n.kind='feedback' and n.ready)) pending_feedback
 from public.students s join public.teachers t on t.id=s.teacher_id where s.archived_at is null and (a.role='admin' or (a.role='teacher' and a.teacher_id=s.teacher_id) or (a.user_id is null and s.user_id=who))
 )q;
 sid:=coalesce(student_id,(cs->0->>'id')::uuid);
 if sid is null then return jsonb_build_object('classes',cs,'reviews','[]'::jsonb,'audio','[]'::jsonb,'annotations','[]'::jsonb,'comparison','[]'::jsonb,'sessions','[]'::jsonb,'scores','[]'::jsonb,'role',coalesce(a.role,'student'),'teacher_id',a.teacher_id,'total_reviews',0);end if;
 if not exists(select 1 from jsonb_array_elements(cs) v where v->>'id'=sid::text) then raise exception 'کلاس در دسترسی شما نیست';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.lesson_date desc,q.lesson_time desc),'[]') into rs from (select * from public.lesson_reviews r where r.student_id=sid and academy_private.practice_access(r.student_id,r.teacher_id,false) order by lesson_date desc,lesson_time desc limit 20 offset page_offset)q;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]') into aud from public.practice_audio x where x.ready and exists(select 1 from jsonb_array_elements(rs) r where (r->>'id')::uuid=x.review_id);
 select coalesce(jsonb_agg(to_jsonb(n) order by n.position_seconds),'[]') into notes from public.practice_annotations n where exists(select 1 from jsonb_array_elements(aud) x where (x->>'id')::uuid=n.audio_id);
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into compare from (select x.* from public.practice_audio x join public.lesson_reviews r on r.id=x.review_id where x.student_id=sid and x.kind='performance' and x.ready and academy_private.practice_access(r.student_id,r.teacher_id,false) and x.id in((select a2.id from public.practice_audio a2 where a2.student_id=sid and a2.kind='performance' and a2.ready and academy_private.practice_audio_access(a2.id) order by a2.published_at limit 1),(select a3.id from public.practice_audio a3 where a3.student_id=sid and a3.kind='performance' and a3.ready and academy_private.practice_audio_access(a3.id) order by a3.published_at desc limit 1)) order by x.published_at)q;
 return jsonb_build_object('classes',cs,'selected',sid,'role',coalesce(a.role,'student'),'teacher_id',a.teacher_id,'reviews',rs,'audio',aud,'annotations',notes,'comparison',compare,'offset',page_offset,
 'total_reviews',(select count(*) from public.lesson_reviews r where r.student_id=sid and academy_private.practice_access(r.student_id,r.teacher_id,false)),
 'scores',(select coalesce(jsonb_agg(to_jsonb(q) order by q.lesson_date,q.lesson_time),'[]') from (select r.id,r.lesson_date,r.lesson_time,r.score from public.lesson_reviews r where r.student_id=sid and academy_private.practice_access(r.student_id,r.teacher_id,false) order by lesson_date desc,lesson_time desc limit 30)q),
 'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'starts_at',c.starts_at,'status',c.status) order by c.starts_at desc),'[]') from public.sessions c where c.student_id=sid and c.status='completed' and c.starts_at<=now()));
end$$;
revoke all on function academy_private.practice_dashboard(uuid,integer) from public,anon;grant execute on function academy_private.practice_dashboard(uuid,integer) to authenticated;
create function public.practice_dashboard(student_id uuid default null,page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select academy_private.practice_dashboard(student_id,page_offset)$$;
revoke all on function public.practice_dashboard(uuid,integer) from public,anon;grant execute on function public.practice_dashboard(uuid,integer) to authenticated;
