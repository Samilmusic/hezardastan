alter table public.academy_staff drop constraint academy_staff_role_check;
alter table public.academy_staff add constraint academy_staff_role_check check(role in ('admin','secretary','teacher'));
alter table public.academy_staff add column teacher_id uuid references public.teachers(id);
create table academy_private.staff_email_assignments(email text primary key,role text not null check(role in ('admin','secretary','teacher')),teacher_id uuid references public.teachers(id));
revoke all on academy_private.staff_email_assignments from public,anon,authenticated;
create function academy_private.assign_verified_staff() returns trigger language plpgsql security definer set search_path='' as $$begin
if new.email_confirmed_at is not null then
insert into public.academy_staff(user_id,role,teacher_id) select new.id,a.role,a.teacher_id from academy_private.staff_email_assignments a where lower(a.email)=lower(new.email) on conflict(user_id) do update set role=excluded.role,teacher_id=excluded.teacher_id;
end if;return new;end$$;
revoke all on function academy_private.assign_verified_staff() from public;
create trigger academy_verified_staff after insert or update of email_confirmed_at,email on auth.users for each row execute function academy_private.assign_verified_staff();
create function academy_private.is_office() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.academy_staff where user_id=auth.uid() and role in ('admin','secretary'))$$;
revoke all on function academy_private.is_office() from public;grant execute on function academy_private.is_office() to authenticated;
create policy office_select on public.students for select to authenticated using(academy_private.is_office());
create policy office_insert on public.students for insert to authenticated with check(academy_private.is_office());
create policy office_update on public.students for update to authenticated using(academy_private.is_office()) with check(academy_private.is_office());
create policy office_select on public.sessions for select to authenticated using(academy_private.is_office());
create policy office_insert on public.sessions for insert to authenticated with check(academy_private.is_office());
create policy office_update on public.sessions for update to authenticated using(academy_private.is_office()) with check(academy_private.is_office());
create policy office_select on public.payments for select to authenticated using(academy_private.is_office());
create policy office_insert on public.payments for insert to authenticated with check(academy_private.is_office());
create policy office_update on public.payments for update to authenticated using(academy_private.is_office()) with check(academy_private.is_office());
create policy office_select on public.absence_requests for select to authenticated using(academy_private.is_office());
create policy office_insert on public.absence_requests for insert to authenticated with check(academy_private.is_office());
create policy office_update on public.absence_requests for update to authenticated using(academy_private.is_office()) with check(academy_private.is_office());
create policy office_select on public.notices for select to authenticated using(academy_private.is_office());
create policy office_insert on public.notices for insert to authenticated with check(academy_private.is_office());
create policy office_update on public.notices for update to authenticated using(academy_private.is_office()) with check(academy_private.is_office());
create function academy_private.teacher_dashboard() returns jsonb language plpgsql security definer set search_path='' as $$declare tid uuid;begin
select teacher_id into tid from public.academy_staff where user_id=auth.uid() and role='teacher';
if tid is null then raise exception 'دسترسی استاد معتبر نیست';end if;
return jsonb_build_object('teachers',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.teachers t where id=tid),'students',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'first_name',s.first_name,'last_name',s.last_name,'subject',s.subject,'teacher_id',s.teacher_id,'weekday',s.weekday,'class_time',s.class_time,'opening_credit',0,'opening_debt',0)),'[]') from public.students s where teacher_id=tid),'sessions',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.sessions c join public.students s on s.id=c.student_id where s.teacher_id=tid),'payroll',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.payroll p where teacher_id=tid));end$$;
revoke all on function academy_private.teacher_dashboard() from public;grant execute on function academy_private.teacher_dashboard() to authenticated;
create function public.my_teacher_dashboard() returns jsonb language sql security invoker set search_path='' as $$select academy_private.teacher_dashboard()$$;
revoke all on function public.my_teacher_dashboard() from public;grant execute on function public.my_teacher_dashboard() to authenticated;
create function academy_private.mark_teacher_session(session_id uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null or new_status not in ('completed','absent','teacher_cancelled') then raise exception 'درخواست نامعتبر';end if;
if not exists(select 1 from public.sessions c join public.students s on s.id=c.student_id join public.academy_staff a on a.teacher_id=s.teacher_id where a.user_id=auth.uid() and a.role='teacher' and c.id=session_id) then raise exception 'دسترسی غیرمجاز';end if;
update public.sessions set status=new_status where id=session_id;
if new_status='teacher_cancelled' then insert into public.notices(student_id,message) select student_id,'استاد عدم حضور خود را اعلام کرد. زمان جبرانی توسط دفتر اعلام می‌شود.' from public.sessions where id=session_id;end if;
end$$;
revoke all on function academy_private.mark_teacher_session(uuid,text) from public;grant execute on function academy_private.mark_teacher_session(uuid,text) to authenticated;
create function public.mark_my_session(session_id uuid,new_status text) returns void language sql security invoker set search_path='' as $$select academy_private.mark_teacher_session(session_id,new_status)$$;
revoke all on function public.mark_my_session(uuid,text) from public;grant execute on function public.mark_my_session(uuid,text) to authenticated;
