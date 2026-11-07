-- Add current month without changing any existing tuition or payment history.
insert into public.academy_months(key,starts_on,ends_on)
values ('1405/08','2026-10-23','2026-11-21') on conflict (key) do nothing;

-- Reuse the checked engine; failure in either operation rolls back both.
create or replace function public.approve_enrollment_with_tuition(data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
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
  'paid',data->'paid','note',coalesce(data->>'note','')));
 return approved || jsonb_build_object('tuition_id',tuition->>'id');
end $$;
revoke all on function public.approve_enrollment_with_tuition(jsonb) from public, anon;
grant execute on function public.approve_enrollment_with_tuition(jsonb) to authenticated;
