create function academy_private.reserve_staff(staff_email text,staff_role text,staff_teacher uuid default null) returns void language plpgsql security definer set search_path='' as $$begin
if not academy_private.is_admin() then raise exception 'فقط مدیر مجاز است';end if;
if staff_role not in ('admin','secretary','teacher') or staff_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then raise exception 'ایمیل یا نقش نامعتبر';end if;
if staff_role='teacher' and staff_teacher is null then raise exception 'استاد را انتخاب کنید';end if;
insert into academy_private.staff_email_assignments(email,role,teacher_id) values(lower(trim(staff_email)),staff_role,case when staff_role='teacher' then staff_teacher else null end) on conflict(email) do update set role=excluded.role,teacher_id=excluded.teacher_id;
insert into public.academy_staff(user_id,role,teacher_id) select u.id,a.role,a.teacher_id from auth.users u join academy_private.staff_email_assignments a on lower(u.email)=a.email where u.email_confirmed_at is not null and a.email=lower(trim(staff_email)) on conflict(user_id) do update set role=excluded.role,teacher_id=excluded.teacher_id;
end$$;
revoke all on function academy_private.reserve_staff(text,text,uuid) from public;grant execute on function academy_private.reserve_staff(text,text,uuid) to authenticated;
create function public.assign_academy_staff(staff_email text,staff_role text,staff_teacher uuid default null) returns void language sql security invoker set search_path='' as $$select academy_private.reserve_staff(staff_email,staff_role,staff_teacher)$$;
revoke all on function public.assign_academy_staff(text,text,uuid) from public;grant execute on function public.assign_academy_staff(text,text,uuid) to authenticated;
