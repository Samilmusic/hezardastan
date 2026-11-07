
create table if not exists academy_private.class_slot_claims(
 teacher_id uuid not null references public.teachers(id),weekday integer not null check(weekday between 0 and 6),class_time time not null,
 request_id uuid,student_id uuid,user_id uuid,
 primary key(teacher_id,weekday,class_time),check(num_nonnulls(request_id,student_id)=1));
revoke all on academy_private.class_slot_claims from public,anon,authenticated;
insert into academy_private.class_slot_claims(teacher_id,weekday,class_time,student_id,user_id)
select teacher_id,weekday,class_time,id,user_id from public.students where archived_at is null on conflict do nothing;
insert into academy_private.class_slot_claims(teacher_id,weekday,class_time,request_id,user_id)
select (c->>'teacher_id')::uuid,(c->>'weekday')::int,(c->>'class_time')::time,r.id,r.user_id
from public.enrollment_requests r cross join lateral jsonb_array_elements(coalesce(r.details->'courses',jsonb_build_array(r.details))) c
where r.status='pending' order by r.created_at on conflict do nothing;
create or replace function academy_private.enrollment_slots_guard() returns trigger language plpgsql security definer set search_path='' as $$
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
if exists(select 1 from public.students s where s.archived_at is null and s.teacher_id=(c->>'teacher_id')::uuid and s.weekday=(c->>'weekday')::int and abs(extract(epoch from(s.class_time-(c->>'class_time')::time)))<1200) then raise exception 'این ساعت کلاس قبلاً رزرو شده است؛ ساعت دیگری انتخاب کنید';end if;
begin
insert into academy_private.class_slot_claims(teacher_id,weekday,class_time,request_id,user_id) values((c->>'teacher_id')::uuid,(c->>'weekday')::int,(c->>'class_time')::time,new.id,new.user_id);
exception when unique_violation then raise exception 'این ساعت کلاس همین حالا رزرو شده است؛ ساعت دیگری انتخاب کنید';end;
end loop;
return new;end $$;
create or replace function academy_private.student_slot_claim_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare occupied academy_private.class_slot_claims;
begin
perform pg_advisory_xact_lock(hashtext(new.teacher_id::text));
if new.archived_at is not null then delete from academy_private.class_slot_claims where student_id=new.id;return new;end if;
select * into occupied from academy_private.class_slot_claims where teacher_id=new.teacher_id and weekday=new.weekday and class_time=new.class_time for update;
if found then
 if occupied.student_id=new.id then return new;end if;
 if occupied.request_id is not null and occupied.user_id=new.user_id and new.user_id is not null then
 update academy_private.class_slot_claims set request_id=null,student_id=new.id where teacher_id=new.teacher_id and weekday=new.weekday and class_time=new.class_time;return new;
 end if;
 raise exception 'این ساعت کلاس رزرو شده است؛ ساعت دیگری انتخاب کنید';
end if;
begin
insert into academy_private.class_slot_claims(teacher_id,weekday,class_time,student_id,user_id) values(new.teacher_id,new.weekday,new.class_time,new.id,new.user_id);
exception when unique_violation then raise exception 'این ساعت کلاس همین حالا رزرو شده است؛ ساعت دیگری انتخاب کنید';end;
return new;end $$;
revoke all on function academy_private.enrollment_slots_guard() from public,anon,authenticated;
revoke all on function academy_private.student_slot_claim_guard() from public,anon,authenticated;
drop trigger if exists enrollment_slots_guard on public.enrollment_requests;
create trigger enrollment_slots_guard before insert or update or delete on public.enrollment_requests for each row execute function academy_private.enrollment_slots_guard();
drop trigger if exists z_student_slot_claim_guard on public.students;
create trigger z_student_slot_claim_guard before insert or update on public.students for each row execute function academy_private.student_slot_claim_guard();
create or replace function public.registration_busy_slots() returns table(teacher_id uuid,weekday integer,class_time text) language sql security definer set search_path='' as $$
select c.teacher_id,c.weekday,to_char(c.class_time,'HH24:MI') from academy_private.class_slot_claims c
union select s.teacher_id,s.weekday,to_char(s.class_time,'HH24:MI') from public.students s where s.archived_at is null
$$;
revoke all on function public.registration_busy_slots() from public,anon,authenticated;
grant execute on function public.registration_busy_slots() to service_role;
