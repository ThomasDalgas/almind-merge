-- Unique browser-owned names; existing best-scoring profiles retain their names.
begin;
create function public.am_name_key(value text) returns text
language sql immutable strict set search_path='' as $$
 select lower(regexp_replace(btrim(value),'[[:space:]]+',' ','g'));
$$;
alter table public.am_players add column name_claimed boolean not null default true;
with ranked as (
 select p.id,row_number() over(partition by public.am_name_key(p.nickname)
 order by coalesce(b.score,-1) desc,b.saved_at nulls last,p.id) as pos
 from public.am_players p left join lateral (
  select r.score,r.saved_at from public.am_rounds r where r.player_id=p.id and not r.hidden and r.saved_at is not null
  order by r.score desc,r.saved_at,r.id limit 1
 ) b on true
)
update public.am_players p set name_claimed=false from ranked x where p.id=x.id and x.pos>1;
create unique index am_players_unique_name on public.am_players(public.am_name_key(nickname)) where name_claimed;
create function public.am_claim_name(p_nickname text) returns text
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); nick text:=regexp_replace(btrim(p_nickname),'[[:space:]]+',' ','g');
begin
 if who is null then raise exception 'Login required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 if exists(select 1 from public.am_players where id=who and blocked) then raise exception 'Player unavailable'; end if;
 if nick is null or char_length(nick) not between 2 and 20 or nick !~ '^[[:alnum:] _-]+$' then raise exception 'Brug 2–20 bogstaver, tal, mellemrum, _ eller -.'; end if;
 insert into public.am_players(id,nickname,name_claimed) values(who,nick,true)
 on conflict(id) do update set nickname=excluded.nickname,name_claimed=true;
 update public.am_live_sessions set nickname=nick where player_id=who;
 return nick;
 exception when unique_violation then raise exception 'Navnet er allerede i brug. Vælg et andet navn.';
end $$;
create function public.am_player_profile() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('nickname',nickname,'claimed',name_claimed and not blocked)
 from public.am_players where id=auth.uid();
$$;
revoke all on function public.am_claim_name(text),public.am_player_profile() from public,anon;
grant execute on function public.am_claim_name(text),public.am_player_profile() to authenticated;
create or replace function public.am_save_round(p_round uuid,p_nickname text,p_events jsonb,p_duration integer,p_final boolean)
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
 if p_duration is null or p_duration not between 1 and 21600000 or p_duration>extract(epoch from(now()-r.started_at))*1000+2000 then raise exception 'Invalid round duration'; end if;
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
 if points<coalesce(r.score,0) then return r.score; end if;
 if drops<1 or points<=0 then raise exception 'Empty round'; end if;
 -- Checkpoints may contain an old name. Only explicit claims can rename a profile.
 if not exists(select 1 from public.am_players where id=who) then
  perform public.am_claim_name(nick);
 elsif exists(select 1 from public.am_players where id=who and not name_claimed) then
  raise exception 'Vælg et ledigt spillernavn, før scoren kan gemmes.';
 end if;
 update public.am_rounds set finished_at=case when p_final then now() else null end,
 saved_at=case when score is null or points>score then now() else saved_at end,
 score=points,max_tier=highest where id=p_round;
 return points;
end $$;

create or replace function public.am_leaderboard(p_scope text default 'week')
returns table(place bigint,nickname text,score integer,max_tier integer,achieved_at timestamptz,is_me boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_scope is null or p_scope not in ('week','all') then raise exception 'Invalid scope'; end if;
 return query
 with best as (
  select distinct on(r.player_id) r.player_id,p.nickname,r.score,r.max_tier,r.saved_at
  from public.am_rounds r join public.am_players p on p.id=r.player_id
  where r.saved_at is not null and not r.hidden and not p.blocked and p.name_claimed
   and (p_scope='all' or r.saved_at>=date_trunc('week',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen')
  order by r.player_id,r.score desc,r.saved_at,r.id
 ), ranked as (
  select row_number() over(order by b.score desc,b.saved_at,b.player_id) as pos,b.* from best b
 )
 select q.pos,q.nickname,q.score,q.max_tier,q.saved_at,coalesce(q.player_id=auth.uid(),false)
 from ranked q where q.pos<=10 or q.player_id=auth.uid() order by q.pos;
end $$;

create or replace function public.am_live_update(p_round uuid,p_nickname text,p_score integer,p_max_tier integer,p_active boolean)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); r public.am_rounds; nick text:=btrim(p_nickname);
begin
 if who is null then raise exception 'Login required'; end if;
 select * into r from public.am_rounds where id=p_round and player_id=who for update;
 if not found then raise exception 'Unknown round'; end if;
 if not coalesce(p_active,false) then
  update public.am_live_sessions set expires_at=now() where round_id=p_round and player_id=who;
 else
  if r.finished_at is not null or r.hidden or r.started_at<now()-interval '24 hours' then raise exception 'Round unavailable'; end if;
  if exists(select 1 from public.am_players where id=who and blocked) then raise exception 'Player unavailable'; end if;
  select p.nickname into nick from public.am_players p where p.id=who and p.name_claimed;
  if nick is null then raise exception 'Vælg et ledigt spillernavn først.'; end if;
  if char_length(nick) not between 2 and 20 or nick !~ '^[[:alnum:] _-]+$' then raise exception 'Invalid nickname'; end if;
  if p_score is null or p_score not between 0 and 100000000 or p_max_tier is null or p_max_tier not between 0 and 10 then raise exception 'Invalid live score'; end if;
  insert into public.am_live_sessions(round_id,player_id,nickname,score,max_tier,seen_at,expires_at)
   values(p_round,who,nick,p_score,p_max_tier,now(),now()+interval '20 seconds')
  on conflict(round_id) do update set nickname=excluded.nickname,score=excluded.score,max_tier=excluded.max_tier,seen_at=excluded.seen_at,expires_at=excluded.expires_at;
 end if;
 -- Presence is disposable; avoid accumulating abandoned sessions indefinitely.
 delete from public.am_live_sessions where expires_at<now()-interval '1 hour';
 return public.am_live_snapshot();
end $$;

delete from public.am_live_sessions where player_id in (select id from public.am_players where not name_claimed);
commit;
