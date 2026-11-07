create or replace function public.approve_multi_enrollment(data jsonb) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; c jsonb; courses jsonb:=data->'courses'; seen text[]:='{}'; k text;
begin
if auth.uid() is null or not academy_private.is_admin() then raise exception 'فقط مدیر مجاز است'; end if;
if jsonb_typeof(courses) is distinct from 'array' then raise exception 'فهرست کلاس‌ها لازم است';end if;
if jsonb_array_length(courses) not between 1 and 10 then raise exception 'تعداد کلاس معتبر نیست';end if;
for c in select value from jsonb_array_elements(courses) loop
if not exists(select 1 from public.teachers t where t.id=(c->>'teacher_id')::uuid and c->>'subject'=any(t.subjects)) then raise exception 'استاد و رشته هماهنگ نیستند';end if;
k:=(c->>'teacher_id')||':'||(c->>'subject');if k=any(seen) then raise exception 'کلاس تکراری';end if;seen:=array_append(seen,k);
end loop;
result:=public.approve_enrollment_with_tuition((data-'courses')||(courses->0));
for c in select value from jsonb_array_elements(courses) with ordinality as x(value,n) where n>1 loop
perform public.learner_action('add_class',(data-'courses'-'id')||c||jsonb_build_object('student_id',result->>'student_id'));
end loop;
return result||jsonb_build_object('class_count',jsonb_array_length(courses));
end $$;
revoke all on function public.approve_multi_enrollment(jsonb) from public,anon;
grant execute on function public.approve_multi_enrollment(jsonb) to authenticated;