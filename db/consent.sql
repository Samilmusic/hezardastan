create function academy_private.accept_rules() returns void language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null then raise exception 'ابتدا وارد شوید';end if;
update public.students set rules_accepted_at=now() where user_id=auth.uid();
if not found then raise exception 'پرونده به حساب شما متصل نیست';end if;end$$;
revoke all on function academy_private.accept_rules() from public;grant execute on function academy_private.accept_rules() to authenticated;
create function public.accept_academy_rules() returns void language sql security invoker set search_path='' as $$select academy_private.accept_rules()$$;
revoke all on function public.accept_academy_rules() from public;grant execute on function public.accept_academy_rules() to authenticated;
