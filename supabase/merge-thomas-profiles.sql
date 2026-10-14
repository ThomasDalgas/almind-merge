-- Merge the two requested profiles once, keeping every round and the highest score.
begin;
create table if not exists public.am_profile_merge_log (
 operation text primary key,
 source_id uuid not null,
 target_id uuid not null,
 merged_at timestamptz not null default now()
);
alter table public.am_profile_merge_log enable row level security;
revoke all on public.am_profile_merge_log from public,anon,authenticated;

do $$
declare source uuid; target uuid; locked_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('merge-thomas-thomasmac-20261014',0));
 if exists(select 1 from public.am_profile_merge_log where operation='thomas-thomasmac-20261014') then
  raise notice 'Profilerne er allerede samlet.';return;
 end if;
 select id into target from public.am_players where public.am_name_key(nickname)='thomas' and name_claimed and not blocked;
 select id into source from public.am_players where public.am_name_key(nickname)='thomasmac' and name_claimed and not blocked;
 if source is null or target is null or source=target then
  raise exception 'Kunne ikke finde de to aktive profiler Thomas og ThomasMac. Ingen ændringer udført.';
 end if;
 -- Serialize with round starts, checkpoints, name changes and code generation.
 for locked_id in select x from unnest(array[source,target]) x order by x loop
  perform pg_advisory_xact_lock(hashtextextended(locked_id::text,0));
 end loop;
 -- Preserve round IDs and originating devices, including unfinished uploads.
 update public.am_rounds set player_id=target where player_id=source;
 update public.am_live_sessions set player_id=target,nickname='Thomas' where player_id in(source,target);
 update public.am_player_devices set player_id=target where player_id=source;
 insert into public.am_player_devices(device_id,player_id) values(source,target),(target,target)
 on conflict(device_id) do update set player_id=excluded.player_id;
 -- Keep Thomas's existing code, or reuse ThomasMac's code when Thomas has none.
 insert into public.am_player_codes(player_id,code_hash,changed_at)
 select target,code_hash,changed_at from public.am_player_codes where player_id=source
 on conflict(player_id) do nothing;
 update public.am_players set name_claimed=false,blocked=true where id=source;
 update public.am_players set nickname='Thomas' where id=target;
 insert into public.am_profile_merge_log(operation,source_id,target_id)
 values('thomas-thomasmac-20261014',source,target);
end $$;
commit;

select place,nickname,score from public.am_leaderboard('all');
-- Storage snapshot: no player details or secrets.
select pg_size_pretty(pg_database_size(current_database())) as database_size,
 pg_size_pretty(coalesce(sum(pg_total_relation_size(c.oid)),0)::bigint) as game_tables_and_indexes
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname like 'am\_%' escape '\';
