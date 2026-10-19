begin;
create table if not exists public.am3d_rounds (
 id uuid primary key, player_id uuid not null references public.am_players(id),
 device_id uuid not null references auth.users(id),
 events jsonb not null default '[]', score integer not null default 0,
 max_tier integer not null default 0, duration_ms integer not null default 0,
 created_at timestamptz not null default now(), achieved_at timestamptz not null default now(),
 finished boolean not null default false, hidden boolean not null default false
);
alter table public.am3d_rounds enable row level security;
revoke all on public.am3d_rounds from public,anon,authenticated;
create index if not exists am3d_player_score on public.am3d_rounds(player_id,score desc);
create or replace function public.am3d_save_round(p_round uuid,p_profile uuid,p_events jsonb,p_duration integer,p_final boolean default false)
returns integer language plpgsql security definer set search_path='' as $$
declare who uuid:=public.am_player_id(); r public.am3d_rounds; e jsonb; k text; tier int; stamp int;
 inv int[]:=array_fill(0,array[13]); points int:=0; highest int:=0; drops int:=0;
 previous_stamp int:=0; last_drop int:=-500; shakes int:=1; removals int:=1; reward int:=0; n int;
begin
 if auth.uid() is null or who is null or p_profile is distinct from who then raise exception 'Spillerprofilen er skiftet. Resultatet tilhører en anden profil.'; end if;
 if not exists(select 1 from public.am_players where id=who and name_claimed and not blocked) then raise exception 'Spillerprofilen er ikke tilgængelig'; end if;
 if p_round is null or p_final is null or p_duration is null or p_duration not between 1 and 21600000 then raise exception 'Invalid round'; end if;
 if p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 20000 or octet_length(p_events::text)>1000000 then raise exception 'Invalid event log'; end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,303));
 select * into r from public.am3d_rounds where id=p_round for update;
 if found then
  if r.player_id<>who or r.device_id<>auth.uid() then raise exception 'Unknown round'; end if;
  if r.finished then return r.score; end if;
  n:=jsonb_array_length(r.events);
  if jsonb_array_length(p_events)<n then return r.score; end if;
  if exists(select 1 from jsonb_array_elements(r.events) with ordinality x(v,i) where x.v is distinct from p_events->(x.i::int-1)) then raise exception 'Saved events cannot change'; end if;
 else
  if (select count(*) from public.am3d_rounds where player_id=who and created_at>now()-interval '1 hour')>=120 then raise exception 'For mange runder. Prøv igen senere.'; end if;
 end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(e)<>'array' or jsonb_array_length(e)<>3 or e->>0 is null or e->>1 is null or e->>2 is null or (e->>1)!~'^[0-9]{1,2}$' or (e->>2)!~'^[0-9]{1,8}$' then raise exception 'Invalid event'; end if;
  k:=e->>0;tier:=(e->>1)::int;stamp:=(e->>2)::int;
  if tier not between 0 and 12 or stamp<previous_stamp or stamp>p_duration then raise exception 'Invalid event order'; end if;
  previous_stamp:=stamp;
  while reward<points/6000 loop
   reward:=reward+1;
   if reward%2=1 then removals:=removals+1;else shakes:=shakes+1;end if;
  end loop;
  if k='d' then
   if stamp-last_drop<499 or (drops<4 and tier<>0) or tier>=least(greatest(highest,3),6) then raise exception 'Invalid drop';end if;
   drops:=drops+1;last_drop:=stamp;inv[tier+1]:=inv[tier+1]+1;points:=points+(1<<(tier+1));
  elsif k='m' then
   if inv[tier+1]<2 then raise exception 'Invalid merge';end if;
   inv[tier+1]:=inv[tier+1]-2;
   if tier<12 then inv[tier+2]:=inv[tier+2]+1;points:=points+(1<<(tier+2));highest:=greatest(highest,tier+1);
   else points:=points+10000;end if;
  elsif k='r' then
   if removals<1 or inv[tier+1]<1 then raise exception 'Invalid removal';end if;
   removals:=removals-1;inv[tier+1]:=inv[tier+1]-1;
  elsif k='s' then
   if shakes<1 or (select sum(v) from unnest(inv) v)=0 then raise exception 'Invalid shake';end if;shakes:=shakes-1;
  else raise exception 'Unknown event';end if;
 end loop;
 if drops<1 or points<=0 then raise exception 'Empty round';end if;
 insert into public.am3d_rounds(id,player_id,device_id,events,score,max_tier,duration_ms,finished)
 values(p_round,who,auth.uid(),p_events,points,highest,p_duration,p_final)
 on conflict(id) do update set events=excluded.events,score=excluded.score,max_tier=excluded.max_tier,
 duration_ms=greatest(am3d_rounds.duration_ms,excluded.duration_ms),finished=excluded.finished,
 achieved_at=case when excluded.score>am3d_rounds.score then now() else am3d_rounds.achieved_at end;
 return points;
end $$;
create or replace function public.am3d_leaderboard(p_scope text default 'all')
returns table(place bigint,player_id uuid,nickname text,score integer,max_tier integer,achieved_at timestamptz,is_me boolean)
language sql stable security definer set search_path='' as $$
 with best as (
 select distinct on(r.player_id) r.player_id,p.nickname,r.score,r.max_tier,r.achieved_at
 from public.am3d_rounds r join public.am_players p on p.id=r.player_id
 where not r.hidden and not p.blocked and p.name_claimed and r.score>0
 and (p_scope='all' or (p_scope='week' and r.achieved_at>=date_trunc('week',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen'))
 order by r.player_id,r.score desc,r.achieved_at,r.id
 ), ranked as (select row_number() over(order by b.score desc,b.achieved_at,b.player_id) as place,b.* from best b)
 select q.*,coalesce(q.player_id=public.am_player_id(),false) from ranked q
 where q.place<=10 or q.player_id=public.am_player_id() order by q.place;
$$;
revoke all on function public.am3d_save_round(uuid,uuid,jsonb,integer,boolean) from public,anon;
grant execute on function public.am3d_save_round(uuid,uuid,jsonb,integer,boolean) to authenticated;
revoke all on function public.am3d_leaderboard(text) from public;
grant execute on function public.am3d_leaderboard(text) to anon,authenticated;
commit;
