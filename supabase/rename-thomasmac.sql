begin;
do $$
declare old_id uuid; keep_id uuid; old_score integer; keep_score integer;
begin
 select id into old_id from public.am_players where nickname='Thomas' and name_claimed and not blocked;
 select id into keep_id from public.am_players where nickname='ThomasMac' and name_claimed and not blocked;
 if keep_id is null and old_id is not null then
  raise notice 'ThomasMac findes ikke længere som aktiv profil. Ingen ændringer.';return;
 end if;
 if old_id is null or keep_id is null then raise exception 'Kunne ikke finde begge profiler. Ingen ændringer.';end if;
 perform pg_advisory_xact_lock(hashtextextended(x::text,0)) from unnest(array[old_id,keep_id]) x order by x;
 select max(score) into old_score from public.am_rounds where player_id=old_id and not hidden;
 select max(score) into keep_score from public.am_rounds where player_id=keep_id and not hidden;
 if old_score is distinct from 18662 or keep_score is null or keep_score<=old_score then
  raise exception 'Profilerne har ændret sig. Stop og kontrollér listen igen.';
 end if;
 update public.am_players set name_claimed=false,blocked=true where id=old_id;
 update public.am_rounds set hidden=true where player_id=old_id;
 update public.am_live_sessions set expires_at=now() where player_id=old_id;
 update public.am_players set nickname='Thomas' where id=keep_id;
 update public.am_live_sessions set nickname='Thomas' where player_id=keep_id;
end $$;
commit;
select place,nickname,score from public.am_leaderboard('all');
