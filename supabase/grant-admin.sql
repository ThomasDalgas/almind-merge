-- Run after migration 007 and after creating your confirmed email user
-- in Supabase Authentication > Users. Never grants access to a game identity.
begin;
do $$
declare administrator uuid;
begin
 select id into strict administrator from auth.users
 where lower(email)='thomas@funken.dk'
   and email_confirmed_at is not null and not coalesce(is_anonymous,true);
 insert into public.ag_admins(user_id,enabled) values(administrator,true)
 on conflict(user_id) do update set enabled=true;
 exception when no_data_found then
  raise exception 'Opret først thomas@funken.dk som bekræftet bruger under Authentication > Users. Det er en separat konto fra din Supabase-dashboardkonto.';
 when too_many_rows then raise exception 'Flere konti med samme mail. Kontrollér Authentication > Users.';
end $$;
commit;
