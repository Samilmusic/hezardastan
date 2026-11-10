alter table public.monthly_tuition add column discount_percent numeric not null default 0 check(discount_percent>=0 and discount_percent<=100 and discount_percent=round(discount_percent,2));
-- Preserve existing authorization, row locks, payment checks and activity records.
do $migration$
declare definition text;
begin
select pg_get_functiondef('academy_private.enrollment_action(text,jsonb)'::regprocedure) into definition;
definition:=replace(definition,'sl int[];n int;begin','sl int[];n int;discount numeric;begin');
definition:=replace(definition, $old$elsif op='month' then$old$, $new$elsif op='month' then
 discount:=case when data ? 'discount_percent' then (data->>'discount_percent')::numeric else null end;
 if data ? 'discount_percent' and (discount is null or discount<0 or discount>100 or discount<>round(discount,2)) then raise exception 'درصد تخفیف باید بین صفر و صد و حداکثر دو رقم اعشار باشد';end if;$new$);
definition:=replace(definition,'set paid=flags,published=true','set discount_percent=coalesce(discount,t.discount_percent),paid=flags,published=true');
definition:=replace(definition,'monthly_tuition(student_id,month_key,dates,paid,published,note) values(sid,m.key,ds,flags,true,','monthly_tuition(student_id,month_key,dates,paid,published,discount_percent,note) values(sid,m.key,ds,flags,true,coalesce(discount,0),');
definition:=replace(definition,'cardinality(sl)*500000','cardinality(sl)*round(500000*(100-t.discount_percent)/100)');
definition:=replace(definition,'select * into t from public.monthly_tuition where student_id=sid', $free$if discount=100 then flags:=array[true,true,true,true];end if;select * into t from public.monthly_tuition where student_id=sid$free$);
if position('discount numeric' in definition)=0 or position('t.discount_percent)/100' in definition)=0 then raise exception 'Tuition engine changed; review migration';end if;
execute definition;
select pg_get_functiondef('public.approve_enrollment_with_tuition(jsonb)'::regprocedure) into definition;
definition:=replace(definition,'''paid'',data->''paid'',''note''','''discount_percent'',coalesce(data->''discount_percent'',''0''::jsonb),''paid'',data->''paid'',''note''');execute definition;
select pg_get_functiondef('academy_private.learner_action(text,jsonb)'::regprocedure) into definition;
definition:=replace(definition,'''paid'',data->''paid'',''note''','''discount_percent'',coalesce(data->''discount_percent'',''0''::jsonb),''paid'',data->''paid'',''note''');execute definition;
end $migration$;
