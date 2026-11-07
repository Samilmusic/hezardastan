create or replace function academy_private.enrollment_action(op text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.enrollment_requests;t public.monthly_tuition;p public.monthly_receipts;s public.students;sid uuid;tid uuid;m public.academy_months;ds date[];flags boolean[];sl int[];n int;begin
if auth.uid() is null then raise exception 'ورود لازم است';end if;
if op in('approve','reject','month','review') and not academy_private.is_admin() then raise exception 'فقط مدیر مجاز است';end if;
if op in('approve','reject') then
 select * into strict r from public.enrollment_requests where id=(data->>'id')::uuid for update;
 if r.status<>'pending' then raise exception 'این درخواست قبلاً بررسی شده است';end if;
 if op='reject' then update public.enrollment_requests set status='rejected',review_note=data->>'note',reviewed_at=now() where id=r.id;
 else
 tid:=(data->>'teacher_id')::uuid;
 if not exists(select 1 from public.teachers where id=tid and (data->>'subject')=any(subjects)) then raise exception 'رشته و استاد هماهنگ نیستند';end if;
 if (data->>'weekday')::int not between 0 and 6 or extract(minute from (data->>'class_time')::time)::int%20<>0 or extract(second from (data->>'class_time')::time)<>0 then raise exception 'زمان باید در گام‌های ۲۰ دقیقه باشد';end if;
 select * into s from public.students where national_id=r.national_id for update;
 if found then
 if exists(select 1 from public.academy_staff where user_id=s.user_id) then raise exception 'پرونده به حساب کارکنان متصل است؛ بررسی هویت لازم است';end if;
 update public.students set user_id=r.user_id,teacher_id=tid,subject=data->>'subject',weekday=(data->>'weekday')::int,class_time=(data->>'class_time')::time where id=s.id returning id into sid;
 else
 insert into public.students(user_id,first_name,last_name,father_name,national_id,mobile,birth_date,home_phone,address,teacher_id,subject,weekday,class_time,rules_accepted_at) values(r.user_id,r.details->>'first_name',r.details->>'last_name',r.details->>'father_name',r.national_id,r.details->>'mobile',(r.details->>'birth_date')::date,r.details->>'home_phone',r.details->>'address',tid,data->>'subject',(data->>'weekday')::int,(data->>'class_time')::time,now()) returning id into sid;
 end if;
 update public.enrollment_requests set status='approved',student_id=sid,review_note=coalesce(data->>'note',''),reviewed_at=now() where id=r.id;
 end if;
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),op,r.id,data);return jsonb_build_object('student_id',sid);
elsif op='month' then
 sid:=(data->>'student_id')::uuid;select * into strict s from public.students where id=sid for update;select * into strict m from public.academy_months where key=data->>'month_key';
 select array_agg(d::date order by d) into ds from(select d from generate_series(m.starts_on::timestamp,m.ends_on::timestamp,interval '1 day') d where extract(dow from d)=s.weekday order by d limit 4) q;
 select array_agg(value::boolean order by ordinality) into flags from jsonb_array_elements_text(data->'paid') with ordinality;
 if cardinality(flags)<>4 or array_position(flags,null) is not null then raise exception 'چهار وضعیت پرداخت لازم است';end if;
 select * into t from public.monthly_tuition where student_id=sid and month_key=m.key for update;
 if found then
 if exists(select 1 from public.monthly_receipts where tuition_id=t.id and status in('approved','pending')) then raise exception 'ماه دارای رسید است؛ ابتدا رسید را بررسی کنید و از دوباره‌شماری جلوگیری کنید';end if;
 update public.monthly_tuition set paid=flags,published=true,note=coalesce(data->>'note','') where id=t.id returning id into tid;
 else insert into public.monthly_tuition(student_id,month_key,dates,paid,published,note) values(sid,m.key,ds,flags,true,coalesce(data->>'note','')) returning id into tid;end if;
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),op,tid,data);return jsonb_build_object('id',tid);
elsif op='submit' then
 select * into strict t from public.monthly_tuition where id=(data->>'id')::uuid and published for update;
 if not exists(select 1 from public.students where id=t.student_id and user_id=auth.uid()) then raise exception 'فقط پرونده خودتان';end if;
 select array_agg(v::int order by v::int) into sl from (select distinct value v from jsonb_array_elements_text(data->'slots')) q;
 if coalesce(cardinality(sl),0)<1 or exists(select 1 from unnest(sl) k where k not between 1 and 4 or t.paid[k]) then raise exception 'جلسات انتخابی نامعتبر یا پرداخت‌شده‌اند';end if;
 if exists(select 1 from public.monthly_receipts where tuition_id=t.id and status='pending' and slots&&sl) then raise exception 'برای این جلسات رسید در انتظار دارید';end if;
 insert into public.monthly_receipts(tuition_id,user_id,slots,amount,method,reference) values(t.id,auth.uid(),sl,cardinality(sl)*500000,data->>'method',btrim(data->>'reference')) returning id into tid;
 insert into public.academy_activity(actor,action,entity_id) values(auth.uid(),'receipt_submitted',tid);return jsonb_build_object('id',tid);
elsif op='review' then
 select * into strict p from public.monthly_receipts where id=(data->>'id')::uuid for update;
 if p.status<>'pending' then raise exception 'رسید قبلاً بررسی شده است';end if;
 select * into strict t from public.monthly_tuition where id=p.tuition_id for update;
 if data->>'status' not in('approved','rejected') then raise exception 'وضعیت نامعتبر';end if;
 if data->>'status'='approved' then foreach n in array p.slots loop if t.paid[n] then raise exception 'این جلسه قبلاً تسویه شده است';end if;t.paid[n]:=true;end loop;update public.monthly_tuition set paid=t.paid where id=t.id;end if;
 update public.monthly_receipts set status=data->>'status',note=coalesce(data->>'note',''),reviewed_at=now(),reviewed_by=auth.uid() where id=p.id;
 insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),'receipt_review',p.id,data);return '{}';
end if;raise exception 'عملیات نامعتبر';end$$;