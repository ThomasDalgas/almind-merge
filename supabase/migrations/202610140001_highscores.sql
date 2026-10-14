-- Almind-Merge leaderboard v1. Run once in the dedicated Supabase project.
begin;
create table public.am_players (
 id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null check(char_length(nickname) between 2 and 20),
 blocked boolean not null default false
);
create table public.am_rounds (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references auth.users(id) on delete cascade,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 score integer,
 max_tier integer,
 hidden boolean not null default false
);
create index am_rounds_player_time on public.am_rounds(player_id,started_at desc);
create index am_rounds_ranking on public.am_rounds(score desc,finished_at) where finished_at is not null and not hidden;
alter table public.am_players enable row level security;
alter table public.am_rounds enable row level security;
revoke all on public.am_players, public.am_rounds from anon, authenticated;

create function public.am_start_round() returns uuid
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); ticket uuid;
begin
 if who is null then raise exception 'Login required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 if exists(select 1 from public.am_players where id=who and blocked) then raise exception 'Player unavailable'; end if;
 if (select count(*) from public.am_rounds where player_id=who and started_at>now()-interval '1 hour')>=60 then raise exception 'Too many rounds; try later'; end if;
 insert into public.am_rounds(player_id) values(who) returning id into ticket;
 return ticket;
end $$;

-- Recompute points from a bounded event ledger; never accept a client score.
-- This checks game arithmetic/timing, not spatial physics or human play.
create function public.am_submit_round(p_round uuid,p_nickname text,p_events jsonb,p_duration integer)
returns integer language plpgsql security definer set search_path='' as $$
declare
 who uuid:=auth.uid(); r public.am_rounds; e jsonb; k text; tier int; stamp int;
 inv int[]:=array_fill(0,array[11]); points int:=0; highest int:=0; drops int:=0;
 previous_stamp int:=0; last_drop int:=-500; shakes int:=1; removals int:=1; reward int:=0;
 nick text:=btrim(p_nickname);
begin
 if who is null then raise exception 'Login required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 select * into r from public.am_rounds where id=p_round and player_id=who for update;
 if not found then raise exception 'Unknown round'; end if;
 if exists(select 1 from public.am_players where id=who and blocked) then raise exception 'Player unavailable'; end if;
 -- Idempotent network retries must not duplicate or overwrite a completed score.
 if r.finished_at is not null then return r.score; end if;
 if nick is null or char_length(nick) not between 2 and 20 or nick !~ '^[[:alnum:] _-]+$' then raise exception 'Use 2-20 letters, numbers, spaces, _ or -'; end if;
 if p_duration is null or p_duration not between 1 and 21600000 or p_duration>extract(epoch from(now()-r.started_at))*1000+2000 or now()-r.started_at>interval '24 hours' then raise exception 'Invalid round duration'; end if;
 if p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 20000 or octet_length(p_events::text)>1000000 then raise exception 'Invalid event log'; end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(e)<>'array' or jsonb_array_length(e)<>3 or (e->>1)!~'^[0-9]+$' or (e->>2)!~'^[0-9]+$' or e->>0 is null or e->>1 is null or e->>2 is null then raise exception 'Invalid event'; end if;
  k:=e->>0; tier:=(e->>1)::int; stamp:=(e->>2)::int;
  if tier not between 0 and 10 or stamp<previous_stamp or stamp>p_duration then raise exception 'Invalid event order'; end if;
  previous_stamp:=stamp;
  while reward<points/6000 loop
   reward:=reward+1;
   if reward%2=1 then removals:=removals+1; else shakes:=shakes+1; end if;
  end loop;
  if k='d' then
   if stamp-last_drop<499 or (drops<4 and tier<>0) or tier>=least(greatest(highest,3),5) then raise exception 'Invalid drop'; end if;
   drops:=drops+1;last_drop:=stamp;inv[tier+1]:=inv[tier+1]+1;points:=points+(2^(tier+1))::int;
  elsif k='m' then
   if tier>=10 or inv[tier+1]<2 then raise exception 'Invalid merge'; end if;
   inv[tier+1]:=inv[tier+1]-2;inv[tier+2]:=inv[tier+2]+1;points:=points+(2^(tier+2))::int;highest:=greatest(highest,tier+1);
  elsif k='r' then
   if removals<1 or inv[tier+1]<1 then raise exception 'Invalid removal'; end if;
   removals:=removals-1;inv[tier+1]:=inv[tier+1]-1;
  elsif k='s' then
   if shakes<1 or (select sum(v) from unnest(inv) v)=0 then raise exception 'Invalid shake'; end if;
   shakes:=shakes-1;
  else raise exception 'Unknown event'; end if;
 end loop;
 if drops<1 or points<=0 then raise exception 'Empty round'; end if;
 insert into public.am_players(id,nickname) values(who,nick)
 on conflict(id) do update set nickname=excluded.nickname;
 update public.am_rounds set finished_at=now(),score=points,max_tier=highest where id=p_round;
 return points;
end $$;

create function public.am_leaderboard(p_scope text default 'week')
returns table(place bigint,nickname text,score integer,max_tier integer,achieved_at timestamptz,is_me boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_scope is null or p_scope not in ('week','all') then raise exception 'Invalid scope'; end if;
 return query
 with best as (
  select distinct on(r.player_id) r.player_id,p.nickname,r.score,r.max_tier,r.finished_at
  from public.am_rounds r join public.am_players p on p.id=r.player_id
  where r.finished_at is not null and not r.hidden and not p.blocked
   and (p_scope='all' or r.finished_at>=date_trunc('week',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen')
  order by r.player_id,r.score desc,r.finished_at,r.id
 ), ranked as (
  select row_number() over(order by b.score desc,b.finished_at,b.player_id) as pos,b.* from best b
 )
 select q.pos,q.nickname,q.score,q.max_tier,q.finished_at,coalesce(q.player_id=auth.uid(),false)
 from ranked q where q.pos<=10 or q.player_id=auth.uid() order by q.pos;
end $$;
revoke all on function public.am_start_round() from public,anon;
revoke all on function public.am_submit_round(uuid,text,jsonb,integer) from public,anon;
revoke all on function public.am_leaderboard(text) from public;
grant execute on function public.am_start_round(),public.am_submit_round(uuid,text,jsonb,integer) to authenticated;
grant execute on function public.am_leaderboard(text) to anon,authenticated;
commit;
