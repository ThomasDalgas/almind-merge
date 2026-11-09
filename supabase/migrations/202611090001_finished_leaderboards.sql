create or replace function public.am_leaderboard(p_scope text default 'week')
returns table(place bigint,nickname text,score integer,max_tier integer,achieved_at timestamptz,is_me boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_scope is null or p_scope not in ('week','all') then raise exception 'Invalid scope'; end if;
 return query
 with best as (
  select distinct on(r.player_id) r.player_id,p.nickname,r.score,r.max_tier,r.saved_at
  from public.am_rounds r join public.am_players p on p.id=r.player_id
  where r.finished_at is not null and r.saved_at is not null and not r.hidden and not p.blocked and p.name_claimed
   and (p_scope='all' or r.saved_at>=date_trunc('week',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen')
  order by r.player_id,r.score desc,r.saved_at,r.id
 ), ranked as (
  select row_number() over(order by b.score desc,b.saved_at,b.player_id) as pos,b.* from best b
 )
 select q.pos,q.nickname,q.score,q.max_tier,q.saved_at,coalesce(q.player_id=public.am_player_id(),false)
 from ranked q where q.pos<=10 or q.player_id=public.am_player_id() order by q.pos;
end $$;

create or replace function public.am_leaderboard_v2(p_scope text default 'week')
returns table(place bigint,nickname text,score integer,max_tier integer,achieved_at timestamptz,is_me boolean,duration_ms integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_scope is null or p_scope not in ('week','all') then raise exception 'Invalid scope'; end if;
 return query
 with best as (
  select distinct on(r.player_id) r.player_id,p.nickname,r.score,r.max_tier,r.saved_at,r.duration_ms
  from public.am_rounds r join public.am_players p on p.id=r.player_id
  where r.finished_at is not null and r.saved_at is not null and not r.hidden and not p.blocked
   and (p_scope='all' or r.saved_at>=date_trunc('week',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen')
  order by r.player_id,r.score desc,r.saved_at,r.id
 ), ranked as (
  select row_number() over(order by b.score desc,b.saved_at,b.player_id) as pos,b.* from best b
 )
 select q.pos,q.nickname,q.score,q.max_tier,q.saved_at,coalesce(q.player_id=public.am_player_id(),false),q.duration_ms
 from ranked q where q.pos<=10 or q.player_id=public.am_player_id() order by q.pos;
end $$;
