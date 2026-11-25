-- Correct the existing session earnings; retain attendance, receipt and payroll history.
create table academy_private.teacher_share_revisions(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.sessions(id),
 tuition_id uuid not null references public.monthly_tuition(id),actor uuid references auth.users(id),
 previous_share bigint not null,new_share bigint not null,session_price bigint not null,discount_percent numeric not null,
 reason text not null,created_at timestamptz not null default now());
alter table academy_private.teacher_share_revisions enable row level security;
revoke all on academy_private.teacher_share_revisions from public,anon,authenticated;
create table academy_private.teacher_share_reprice_context(tx bigint not null,session_id uuid not null,primary key(tx,session_id));
alter table academy_private.teacher_share_reprice_context enable row level security;
revoke all on academy_private.teacher_share_reprice_context from public,anon,authenticated;

create function academy_private.discounted_teacher_share(class_id uuid,session_at timestamptz) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce((select round(round(t.session_price*(100-t.discount_percent)/100.0)*60/100.0)::bigint
 from public.monthly_tuition t join public.academy_months m on m.key=t.month_key
 where t.student_id=class_id and t.published and (session_at at time zone 'Asia/Tehran')::date between m.starts_on and m.ends_on),300000::bigint)
$$;
revoke all on function academy_private.discounted_teacher_share(uuid,timestamptz) from public,anon,authenticated;

-- No public bypass: only the internal tuition trigger can create this transaction context.
-- Retain every existing attendance authorization and payment check outside this narrow share-only update.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.session_guard()'::regprocedure) into definition;
 if position('then 300000 else 0' in definition)=0 or position(E'begin\nif TG_OP' in definition)=0 then raise exception 'Session guard changed; review share migration';end if;
 definition:=replace(definition,E'begin\nif TG_OP',E'begin\nif TG_OP=''UPDATE'' and (to_jsonb(new)-''teacher_share'')=(to_jsonb(old)-''teacher_share'') and exists(select 1 from academy_private.teacher_share_reprice_context x where x.tx=txid_current() and x.session_id=old.id) then\n new.teacher_share:=case when new.status=''completed'' then academy_private.discounted_teacher_share(new.student_id,new.starts_at) else 0 end;return new;\nend if;\nif TG_OP');
 definition:=replace(definition,'then 300000 else 0','then academy_private.discounted_teacher_share(new.student_id,new.starts_at) else 0');
 execute definition;
end$migration$;

create function academy_private.reprice_teacher_month(target_tuition uuid,why text) returns integer
language plpgsql security definer set search_path='' as $$
declare t public.monthly_tuition;m public.academy_months;s public.sessions;new_share bigint;n integer:=0;
begin
 select * into strict t from public.monthly_tuition where id=target_tuition;
 if not t.published then return 0;end if;
 select * into strict m from public.academy_months where key=t.month_key;
 -- Archived classes remain immutable. New tuition and attendance for them are already forbidden.
 if not exists(select 1 from public.students where id=t.student_id and archived_at is null) then return 0;end if;
 for s in select c.* from public.sessions c where c.student_id=t.student_id and c.status='completed'
 and (c.starts_at at time zone 'Asia/Tehran')::date between m.starts_on and m.ends_on order by c.id for update loop
  new_share:=academy_private.discounted_teacher_share(s.student_id,s.starts_at);
  if new_share=s.teacher_share then continue;end if;
  insert into academy_private.teacher_share_reprice_context values(txid_current(),s.id);
  update public.sessions set teacher_share=new_share where id=s.id;
  delete from academy_private.teacher_share_reprice_context where tx=txid_current() and session_id=s.id;
  insert into academy_private.teacher_share_revisions(session_id,tuition_id,actor,previous_share,new_share,session_price,discount_percent,reason)
  values(s.id,t.id,auth.uid(),s.teacher_share,new_share,t.session_price,t.discount_percent,why);
  insert into public.academy_activity(actor,action,entity_id,details) values(auth.uid(),'teacher_share_recalculated',s.id,
  jsonb_build_object('tuition_id',t.id,'month_key',t.month_key,'before_share',s.teacher_share,'after_share',new_share,'session_price',t.session_price,'discount_percent',t.discount_percent,'reason',why));
  n:=n+1;
 end loop;return n;
end$$;
revoke all on function academy_private.reprice_teacher_month(uuid,text) from public,anon,authenticated;
create function academy_private.tuition_teacher_share_sync() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.session_price,new.discount_percent,new.published) is not distinct from (old.session_price,old.discount_percent,old.published) then return new;end if;
 perform academy_private.reprice_teacher_month(new.id,'tuition_rate_or_discount_changed');return new;
end$$;
revoke all on function academy_private.tuition_teacher_share_sync() from public,anon,authenticated;
create trigger teacher_share_tuition_sync after insert or update of session_price,discount_percent,published on public.monthly_tuition for each row execute function academy_private.tuition_teacher_share_sync();

-- Settle the session's historical instructor, not the class's current instructor after a transfer.
create or replace function public.payroll_guard() returns trigger language plpgsql set search_path='' as $$
declare earned bigint;paid bigint;begin
 perform pg_advisory_xact_lock(hashtext(new.teacher_id::text));
 select coalesce(sum(c.teacher_share),0) into earned from public.sessions c join public.students s on s.id=c.student_id
 left join public.session_instructors i on i.session_id=c.id where c.status='completed' and coalesce(i.teacher_id,s.teacher_id)=new.teacher_id;
 select coalesce(sum(p.amount),0) into paid from public.payroll p where p.teacher_id=new.teacher_id;
 if new.amount>earned-paid then raise exception 'مبلغ بیشتر از دستمزد تسویه‌نشده استاد است';end if;return new;
end$$;
revoke all on function public.payroll_guard() from public,anon,authenticated;

-- One-time, audited repair. Re-running the recalculation cannot create duplicate adjustments.
do $$declare t record;begin
 for t in select id from public.monthly_tuition where published order by student_id,month_key loop
  perform academy_private.reprice_teacher_month(t.id,'historical_fixed_share_bug_repair');
 end loop;
end$$;
