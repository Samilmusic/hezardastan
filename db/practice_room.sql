-- Adds privately shared lesson samples and score images. Existing records and financial rules are untouched.
create table public.practice_materials(
 id uuid primary key default gen_random_uuid(),author uuid not null references auth.users(id),teacher_id uuid not null references public.teachers(id),
 title text not null check(length(title) between 3 and 120),kind text not null check(kind in('sample','score')),
 reusable boolean not null default false,object_path text not null unique,mime_type text not null,
 file_bytes integer not null check(file_bytes between 1 and 12582912),duration numeric,image_width integer,image_height integer,
 ready boolean not null default false,created_at timestamptz not null default now(),
 check((kind='sample' and mime_type in('audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/aac','audio/flac') and duration>0 and duration<=180 and duration is not null and image_width is null and image_height is null)
 or (kind='score' and mime_type in('image/jpeg','image/png','image/webp') and duration is null and image_width between 1 and 6000 and image_height between 1 and 6000 and image_width is not null and image_height is not null and file_bytes<=8388608))
);
create table public.practice_material_links(
 id uuid primary key default gen_random_uuid(),review_id uuid not null references public.lesson_reviews(id),material_id uuid not null references public.practice_materials(id),
 author uuid not null references auth.users(id),bpm integer check(bpm between 30 and 240),markers jsonb not null default '[]',version integer not null default 1,
 created_at timestamptz not null default now(),unique(review_id,material_id),check(jsonb_typeof(markers)='array' and jsonb_array_length(markers)<=20)
);
create table academy_private.practice_material_operations(actor uuid not null references auth.users(id),request_key uuid not null,op text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor,request_key));
alter table public.practice_materials enable row level security;alter table public.practice_material_links enable row level security;alter table academy_private.practice_material_operations enable row level security;
revoke all on public.practice_materials,public.practice_material_links from public,anon,authenticated;
revoke all on academy_private.practice_material_operations from public,anon,authenticated;
grant select on public.practice_materials,public.practice_material_links to authenticated;
create index practice_materials_author_idx on public.practice_materials(author,created_at desc);create index practice_materials_teacher_idx on public.practice_materials(teacher_id);
create index practice_material_links_material_idx on public.practice_material_links(material_id);create index practice_material_links_author_idx on public.practice_material_links(author);
create function academy_private.practice_material_owner(mid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.practice_materials m join public.academy_staff a on a.user_id=m.author and a.teacher_id=m.teacher_id and a.role in('teacher','admin') where m.id=mid and m.author=auth.uid())
$$;
create function academy_private.practice_material_read(mid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.practice_materials m where m.id=mid and
 (academy_private.practice_material_owner(m.id) or (m.ready and (academy_private.is_admin() or exists(select 1 from public.practice_material_links l join public.lesson_reviews r on r.id=l.review_id join public.students s on s.id=r.student_id where l.material_id=m.id and s.archived_at is null and academy_private.practice_access(r.student_id,r.teacher_id,false))))))
$$;
create function academy_private.practice_material_file(path text,uploading boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.practice_materials m where m.object_path=path and case when uploading then not m.ready and academy_private.practice_material_owner(m.id) else m.ready and academy_private.practice_material_read(m.id) end)
$$;
revoke all on function academy_private.practice_material_owner(uuid),academy_private.practice_material_read(uuid),academy_private.practice_material_file(text,boolean) from public,anon;
grant execute on function academy_private.practice_material_owner(uuid),academy_private.practice_material_read(uuid),academy_private.practice_material_file(text,boolean) to authenticated;
create policy practice_materials_read on public.practice_materials for select to authenticated using(academy_private.practice_material_read(id));
create policy practice_material_links_read on public.practice_material_links for select to authenticated using(exists(select 1 from public.lesson_reviews r join public.students s on s.id=r.student_id where r.id=review_id and s.archived_at is null and academy_private.practice_access(r.student_id,r.teacher_id,false)));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('academy-lessons','academy-lessons',false,12582912,array['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/aac','audio/flac','image/jpeg','image/png','image/webp']);
create policy practice_materials_upload on storage.objects for insert to authenticated with check(bucket_id='academy-lessons' and academy_private.practice_material_file(name,true));
create policy practice_materials_file_read on storage.objects for select to authenticated using(bucket_id='academy-lessons' and academy_private.practice_material_file(name,false));
create function academy_private.practice_material_action(op text,data jsonb,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();old academy_private.practice_material_operations;r public.lesson_reviews;m public.practice_materials;l public.practice_material_links;
 obj storage.objects;rid uuid;outcome jsonb;mime text;ext text;mark jsonb;
begin
 if who is null or request_key is null or data is null or jsonb_typeof(data)<>'object' or octet_length(data::text)>18000 then raise exception 'ورود و درخواست معتبر لازم است';end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,21));
 select * into old from academy_private.practice_material_operations x where x.actor=who and x.request_key=practice_material_action.request_key;
 if found then if old.op<>op or old.payload<>data then raise exception 'شناسه تکراری با محتوای متفاوت';end if;return old.result||jsonb_build_object('duplicate',true);end if;
 if (select count(*) from academy_private.practice_material_operations where actor=who and created_at>now()-interval '1 minute')>=30 then raise exception 'درخواست زیاد؛ کمی صبر کنید';end if;
 if op in('reserve','link','edit_link') then
  select * into strict r from public.lesson_reviews where id=(data->>'review_id')::uuid for share;
  if not academy_private.practice_access(r.student_id,r.teacher_id,true) then raise exception 'فقط استاد همین کلاس می‌تواند تمرین اضافه کند';end if;
 end if;
 if op='reserve' then
  if (select count(*) from public.practice_materials where author=who and not ready and created_at>now()-interval '1 day')>=30 then raise exception 'تعداد فایل‌های ناتمام زیاد است؛ بارگذاری‌های قبلی را کامل کنید';end if;
  mime:=data->>'mime_type';ext:=case mime when 'audio/mpeg' then 'mp3' when 'audio/mp4' then 'm4a' when 'audio/wav' then 'wav' when 'audio/x-wav' then 'wav' when 'audio/webm' then 'webm' when 'audio/ogg' then 'ogg' when 'audio/aac' then 'aac' when 'audio/flac' then 'flac' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  if ext is null then raise exception 'فرمت فایل مجاز نیست';end if;
  rid:=gen_random_uuid();
  insert into public.practice_materials(id,author,teacher_id,title,kind,reusable,object_path,mime_type,file_bytes,duration,image_width,image_height)
  values(rid,who,r.teacher_id,btrim(data->>'title'),data->>'kind',coalesce((data->>'reusable')::boolean,false),rid::text||'.'||ext,mime,(data->>'file_bytes')::integer,nullif(data->>'duration','')::numeric,nullif(data->>'image_width','')::integer,nullif(data->>'image_height','')::integer);
  outcome:=jsonb_build_object('completed',true,'id',rid,'object_path',rid::text||'.'||ext);
 elsif op='finalize' then
  select * into strict m from public.practice_materials where id=(data->>'id')::uuid for update;
  if not academy_private.practice_material_owner(m.id) then raise exception 'فقط صاحب فایل';end if;
  select * into strict obj from storage.objects where bucket_id='academy-lessons' and name=m.object_path;
  if coalesce((obj.metadata->>'size')::bigint,0)<>m.file_bytes or coalesce(obj.metadata->>'mimetype','')<>m.mime_type then raise exception 'مشخصات فایل بارگذاری‌شده تأیید نشد';end if;
  update public.practice_materials set ready=true where id=m.id;rid:=m.id;outcome:=jsonb_build_object('completed',true,'id',rid);
 elsif op='link' then
  select * into strict m from public.practice_materials where id=(data->>'material_id')::uuid and ready for share;
  if m.teacher_id<>r.teacher_id or not academy_private.practice_material_owner(m.id) then raise exception 'فقط نمونه متعلق به خود استاد همین کلاس';end if;
  if not m.reusable and exists(select 1 from public.practice_material_links where material_id=m.id and review_id<>r.id) then raise exception 'این فایل خصوصی است؛ برای هنرجوی دیگر قابل استفاده نیست';end if;
  if (select count(*) from public.practice_material_links where review_id=r.id)>=12 then raise exception 'هر تمرین حداکثر ۱۲ فایل دارد';end if;
  insert into public.practice_material_links(review_id,material_id,author,bpm) values(r.id,m.id,who,nullif(data->>'bpm','')::integer) returning id into rid;
  outcome:=jsonb_build_object('completed',true,'id',rid);
 elsif op='edit_link' then
  select * into strict l from public.practice_material_links where id=(data->>'id')::uuid and review_id=r.id for update;
  select * into strict m from public.practice_materials where id=l.material_id;
  if l.version<>coalesce((data->>'version')::integer,0) then raise exception 'علامت‌ها تغییر کرده‌اند؛ صفحه را تازه کنید';end if;
  if jsonb_typeof(data->'markers') is distinct from 'array' or jsonb_array_length(data->'markers')>20 then raise exception 'حداکثر ۲۰ علامت مجاز است';end if;
  if m.kind<>'score' and jsonb_array_length(data->'markers')>0 then raise exception 'علامت‌گذاری مخصوص تصویر نت است';end if;
  for mark in select value from jsonb_array_elements(data->'markers') loop
   if jsonb_typeof(mark)<>'object' or jsonb_typeof(mark->'x') is distinct from 'number' or jsonb_typeof(mark->'y') is distinct from 'number' or ((mark->>'x')::numeric between 0 and 1) is not true or ((mark->>'y')::numeric between 0 and 1) is not true or length(btrim(coalesce(mark->>'text',''))) not between 1 and 300 then raise exception 'جای علامت یا توضیح معتبر نیست';end if;
  end loop;
  update public.practice_material_links set markers=data->'markers',bpm=nullif(data->>'bpm','')::integer,version=version+1 where id=l.id;rid:=l.id;
  outcome:=jsonb_build_object('completed',true,'id',rid);
 else raise exception 'عملیات تمرین نامعتبر';end if;
 insert into academy_private.practice_material_operations(actor,request_key,op,payload,result) values(who,request_key,op,data,outcome);
 insert into public.academy_activity(actor,action,entity_id,details) values(who,'practice_material_'||op,rid,jsonb_build_object('request_key',request_key));
 return outcome;
end$$;
revoke all on function academy_private.practice_material_action(text,jsonb,uuid) from public,anon;grant execute on function academy_private.practice_material_action(text,jsonb,uuid) to authenticated;
create function public.practice_material_action(op text,data jsonb,request_key uuid) returns jsonb language sql security invoker set search_path='' as $$select academy_private.practice_material_action(op,data,request_key)$$;
revoke all on function public.practice_material_action(text,jsonb,uuid) from public,anon;grant execute on function public.practice_material_action(text,jsonb,uuid) to authenticated;
create function academy_private.practice_material_dashboard(class_id uuid,review_ids uuid[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.students;a public.academy_staff;
begin
 if auth.uid() is null or class_id is null or coalesce(cardinality(review_ids),0)>20 then raise exception 'درخواست معتبر و ورود لازم است';end if;
 select * into strict s from public.students where id=class_id and archived_at is null;
 if not academy_private.practice_access(s.id,s.teacher_id,false) then raise exception 'کلاس در دسترسی شما نیست';end if;
 select * into a from public.academy_staff where user_id=auth.uid();
 if exists(select 1 from unnest(review_ids) q(id) where not exists(select 1 from public.lesson_reviews r where r.id=q.id and r.student_id=class_id and academy_private.practice_access(r.student_id,r.teacher_id,false))) then raise exception 'تمرین در دسترسی شما نیست';end if;
 return jsonb_build_object(
 'links',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('material',to_jsonb(m)) order by l.created_at) from public.practice_material_links l join public.practice_materials m on m.id=l.material_id where l.review_id=any(review_ids) and m.ready),'[]'),
 'library',coalesce((select jsonb_agg(to_jsonb(q)) from (select m.* from public.practice_materials m where m.ready and m.reusable and m.author=auth.uid() and a.teacher_id=m.teacher_id and a.role in('admin','teacher') order by m.created_at desc limit 100)q),'[]'));
end$$;
revoke all on function academy_private.practice_material_dashboard(uuid,uuid[]) from public,anon;grant execute on function academy_private.practice_material_dashboard(uuid,uuid[]) to authenticated;
create function public.practice_material_dashboard(class_id uuid,review_ids uuid[] default '{}') returns jsonb language sql security invoker set search_path='' as $$select academy_private.practice_material_dashboard(class_id,review_ids)$$;
revoke all on function public.practice_material_dashboard(uuid,uuid[]) from public,anon;grant execute on function public.practice_material_dashboard(uuid,uuid[]) to authenticated;
