alter table public.students add column email text;
create unique index students_email_unique on public.students(lower(email)) where email is not null;
create function academy_private.link_verified_student() returns trigger language plpgsql security definer set search_path='' as $$begin
if new.email_confirmed_at is not null then
update public.students set user_id=new.id where lower(email)=lower(new.email) and (user_id is null or user_id=new.id);
end if;return new;end$$;
revoke all on function academy_private.link_verified_student() from public;
create trigger academy_verified_student after insert or update of email_confirmed_at,email on auth.users for each row execute function academy_private.link_verified_student();
