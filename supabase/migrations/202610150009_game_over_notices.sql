-- Explicit Game Over events; checkpoints, restarts and stale offline uploads stay quiet.
begin;
create table if not exists public.am_game_over_notices (
 round_id uuid primary key references public.am_rounds(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.am_game_over_notices enable row level security;
revoke all on public.am_game_over_notices from public,anon,authenticated;
create index if not exists am_game_over_notices_created on public.am_game_over_notices(created_at);

create or replace function public.am_game_over(p_round uuid,p_nickname text,p_events jsonb,p_duration integer)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.am_rounds; points integer; who uuid:=public.am_player_id();
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 select * into r from public.am_rounds where id=p_round for update;
 if not found or public.am_round_owner(p_round) is null then raise exception 'Unknown round'; end if;
 points:=public.am_save_round(p_round,p_nickname,p_events,p_duration,true);
 -- Recently active presence is required, including the inactive update sent at Game Over.
 -- A retry of a finished round must not create a new notification.
 if r.finished_at is null and exists(select 1 from public.am_rounds where id=p_round and finished_at is not null)
 and exists(select 1 from public.am_live_sessions where round_id=p_round and seen_at>now()-interval '60 seconds') then
  insert into public.am_game_over_notices(round_id) values(p_round) on conflict do nothing;
 end if;
 delete from public.am_game_over_notices where created_at<now()-interval '1 day';
 return points;
end $$;
revoke all on function public.am_game_over(uuid,text,jsonb,integer) from public,anon;
grant execute on function public.am_game_over(uuid,text,jsonb,integer) to authenticated;

create or replace function public.am_live_snapshot() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'players',coalesce((select jsonb_agg(p) from public.am_live_players() p),'[]'::jsonb),
  'records',coalesce((select jsonb_agg(e order by e.created_at,e.id) from (
   select n.round_id as id,n.kind,n.created_at,p.nickname,r.score from public.am_live_records n
   join public.am_rounds r on r.id=n.round_id join public.am_players p on p.id=r.player_id
   where n.created_at>now()-interval '5 minutes' and not r.hidden and not p.blocked
   order by n.created_at desc,n.round_id limit 20
  ) e),'[]'::jsonb),
  'gameovers',coalesce((select jsonb_agg(e order by e.created_at,e.id) from (
   select n.round_id as id,n.created_at,p.nickname,r.score,
    coalesce(r.player_id=public.am_player_id(),false) as is_me
   from public.am_game_over_notices n
   join public.am_rounds r on r.id=n.round_id join public.am_players p on p.id=r.player_id
   where n.created_at>now()-interval '1 minute' and not r.hidden and not p.blocked
   order by n.created_at desc,n.round_id limit 20
  ) e),'[]'::jsonb)
 );
$$;
revoke all on function public.am_live_snapshot() from public;
grant execute on function public.am_live_snapshot() to anon,authenticated;
commit;
