-- Only expose a small summary for exactly the rows visible on the leaderboard.
-- There is intentionally no public lookup of arbitrary round IDs or journals.
begin;
create function public.am_leaderboard_v3(p_scope text default 'week')
returns table(place bigint,nickname text,score integer,max_tier integer,achieved_at timestamptz,is_me boolean,duration_ms bigint,round_id uuid,round_log jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_scope is null or p_scope not in ('week','all') then raise exception 'Invalid scope'; end if;
 return query
 with best as (
  select distinct on(r.player_id) r.id,r.player_id,p.nickname,r.score,r.max_tier,r.saved_at,r.duration_ms,r.round_log
  from public.am_rounds r join public.am_players p on p.id=r.player_id
  where r.finished_at is not null and r.saved_at is not null and not r.hidden and not p.blocked
   and (p_scope='all' or r.saved_at>=date_trunc('week',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen')
  order by r.player_id,r.score desc,r.saved_at,r.id
 ), ranked as (
  select row_number() over(order by b.score desc,b.saved_at,b.player_id) as pos,b.* from best b
 )
 select q.pos,q.nickname,q.score,q.max_tier,q.saved_at,coalesce(q.player_id=public.am_player_id(),false),q.duration_ms,q.id,
  case when q.round_log is null then null else jsonb_build_object(
   'actions',(q.round_log->>'drops')::bigint+(q.round_log->>'merges')::bigint+(q.round_log->>'shakes')::bigint+(q.round_log->>'removals')::bigint,
   'drops',q.round_log->'drops','merges',q.round_log->'merges','svend_pairs',q.round_log->'svend_pairs',
   'shakes',q.round_log->'shakes','removals',q.round_log->'removals',
   'complete',q.round_log ?& array['drops','merges','svend_pairs','shakes','removals']
    and not coalesce((q.round_log->>'merge_totals_partial')::boolean,false)
    and not exists(select 1 from public.am_round_recoveries a where a.round_id=q.id)
  ) end
 from ranked q where q.pos<=10 or q.player_id=public.am_player_id() order by q.pos;
end $$;
revoke all on function public.am_leaderboard_v3(text) from public;
grant execute on function public.am_leaderboard_v3(text) to anon,authenticated;
commit;
