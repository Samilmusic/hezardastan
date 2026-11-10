create table academy_private.student_password_resets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 code_hash bytea not null, issued_by uuid not null references auth.users(id),
 issued_at timestamptz not null default now(), expires_at timestamptz not null,
 used_at timestamptz, attempts integer not null default 0 check(attempts between 0 and 5)
);
alter table academy_private.student_password_resets enable row level security;
revoke all on academy_private.student_password_resets from public,anon,authenticated;

create function academy_private.issue_student_password_reset(student_id uuid,reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.students; code text; expiry timestamptz; previous timestamptz;
begin
 if auth.uid() is null or not exists(select 1 from public.academy_staff where user_id=auth.uid() and role in('admin','secretary')) then raise exception 'فقط مدیر و منشی مجازند';end if;
 if reason is null or length(btrim(reason))<3 or length(reason)>500 then raise exception 'دلیل و روش احراز هویت را بنویسید';end if;
 select * into strict s from public.students where id=student_id and archived_at is null for update;
 if s.user_id is null or exists(select 1 from public.academy_staff where user_id=s.user_id) or not exists(select 1 from auth.users where id=s.user_id and email=s.national_id||'@students.avayehezardastan.com') then raise exception 'این حساب هنرجویی فعال نیست یا به کارکنان تعلق دارد';end if;
 select issued_at into previous from academy_private.student_password_resets where user_id=s.user_id;
 if previous>now()-interval '30 seconds' then raise exception 'برای صدور دوباره ۳۰ ثانیه صبر کنید';end if;
 code:=upper(encode(extensions.gen_random_bytes(8),'hex'));expiry:=now()+interval '30 minutes';
 insert into academy_private.student_password_resets(user_id,code_hash,issued_by,expires_at) values(s.user_id,extensions.digest(code,'sha256'),auth.uid(),expiry)
 on conflict(user_id) do update set code_hash=excluded.code_hash,issued_by=excluded.issued_by,issued_at=now(),expires_at=excluded.expires_at,used_at=null,attempts=0;
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),'password_reset_issued',s.id,jsonb_build_object('reason',btrim(reason),'expires_at',expiry));
 return jsonb_build_object('temporary_code',code,'expires_at',expiry);
end $$;
revoke all on function academy_private.issue_student_password_reset(uuid,text) from public,anon;
grant execute on function academy_private.issue_student_password_reset(uuid,text) to authenticated;
create function public.issue_student_password_reset(student_id uuid,reason text) returns jsonb language sql security invoker set search_path='' as $$ select academy_private.issue_student_password_reset(student_id,reason) $$;
revoke all on function public.issue_student_password_reset(uuid,text) from public,anon;
grant execute on function public.issue_student_password_reset(uuid,text) to authenticated;

create function academy_private.consume_student_password_reset(national_id_input text,temporary_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r academy_private.student_password_resets;s public.students;
begin
 select * into s from public.students where national_id=national_id_input and archived_at is null and user_id is not null order by created_at,id limit 1;
 if not found or exists(select 1 from public.academy_staff where user_id=s.user_id) then return jsonb_build_object('valid',false);end if;
 select * into r from academy_private.student_password_resets where user_id=s.user_id for update;
 if not found or r.used_at is not null or r.expires_at<=now() or r.attempts>=5 then return jsonb_build_object('valid',false);end if;
 if r.code_hash<>extensions.digest(upper(temporary_code),'sha256') then
  update academy_private.student_password_resets set attempts=attempts+1 where user_id=s.user_id;
  return jsonb_build_object('valid',false);
 end if;
 update academy_private.student_password_resets set used_at=now() where user_id=s.user_id;
 insert into public.academy_activity(actor,action,entity_id,details) values(s.user_id,'password_reset_redeemed',s.id,'{}'::jsonb);
 return jsonb_build_object('valid',true,'user_id',s.user_id,'student_id',s.id);
end $$;
revoke all on function academy_private.consume_student_password_reset(text,text) from public,anon,authenticated;
grant execute on function academy_private.consume_student_password_reset(text,text) to service_role;
grant usage on schema academy_private to service_role;
create function public.consume_student_password_reset(national_id_input text,temporary_code text) returns jsonb language sql security invoker set search_path='' as $$ select academy_private.consume_student_password_reset(national_id_input,temporary_code) $$;
revoke all on function public.consume_student_password_reset(text,text) from public,anon,authenticated;
grant execute on function public.consume_student_password_reset(text,text) to service_role;
