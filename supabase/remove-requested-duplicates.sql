-- Requested 14 October: Niklas #4 (7138) and Thomas #5 (10).
-- Identify profiles by the exact observed round; repeat-safe, no rank-based deletion.
begin;
create temporary table am_requested_removals on commit drop as
 select distinct r.player_id from public.am_rounds r join public.am_players p on p.id=r.player_id
 where (p.nickname='Niklas' and r.score=7138 and r.saved_at='2026-10-14T09:53:06.562831+00:00')
    or (p.nickname='Thomas' and r.score=10 and r.saved_at='2026-10-14T15:45:19.575092+00:00');
do $$ begin
 if (select count(*) from am_requested_removals)<>2 then
  raise exception 'De to valgte poster har ændret sig. Stop og kontrollér ranglisten igen.';
 end if;
end $$;
update public.am_rounds set hidden=true where player_id in(select player_id from am_requested_removals);
commit;
