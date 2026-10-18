-- Compact per-round counters; no new table or event history. Old clients remain compatible.
begin;
alter table public.am_rounds add column if not exists round_log jsonb;
create or replace function public.am_save_round(p_round uuid,p_nickname text,p_events jsonb,p_duration integer,p_final boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare
 who uuid:=public.am_player_id(); r public.am_rounds; e jsonb; k text; tier int; stamp int;
 inv int[]:=array_fill(0,array[11]); points int:=0; highest int:=0; drops int:=0;
 previous_stamp int:=0; last_drop int:=-500; shakes int:=1; removals int:=1; reward int:=0;
 nick text:=btrim(p_nickname); merges int:=0; pairs int:=0; used_shakes int:=0; used_removals int:=0;
begin
 if who is null then raise exception 'Login required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 select * into r from public.am_rounds where id=p_round and player_id=public.am_round_owner(p_round) for update;
 if not found then raise exception 'Unknown round'; end if;
 who:=r.player_id;
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
   merges:=merges+1;if tier=10 then pairs:=pairs+1;end if;
   if inv[tier+1]<2 then raise exception 'Invalid merge'; end if;
   inv[tier+1]:=inv[tier+1]-2;
   if tier<10 then
    inv[tier+2]:=inv[tier+2]+1;points:=points+(2^(tier+2))::int;highest:=greatest(highest,tier+1);
   end if;
  elsif k='b' then
   merges:=merges+1;pairs:=pairs+1;
   if tier<>10 or inv[11]<2 then raise exception 'Invalid Svend bonus'; end if;
   inv[11]:=inv[11]-2;points:=points+10000;
  elsif k='r' then
   used_removals:=used_removals+1;
   if removals<1 or inv[tier+1]<1 then raise exception 'Invalid removal'; end if;
   removals:=removals-1;inv[tier+1]:=inv[tier+1]-1;
  elsif k='s' then
   used_shakes:=used_shakes+1;
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
 round_log=coalesce(round_log,'{}'::jsonb)||jsonb_build_object('drops',drops,'merges',merges,'svend_pairs',pairs,'shakes',used_shakes,'removals',used_removals,'outcome',case when p_final then 'ended' else 'unfinished' end),
 score=points,max_tier=highest,duration_ms=greatest(coalesce(duration_ms,0),p_duration) where id=p_round;
 return points;
end $$;

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
 if r.finished_at is null then
  update public.am_rounds set round_log=round_log||jsonb_build_object('outcome','gameover') where id=p_round and finished_at is not null and round_log is not null;
 end if;
 return points;
end $$;
revoke all on function public.am_game_over(uuid,text,jsonb,integer) from public,anon;
grant execute on function public.am_game_over(uuid,text,jsonb,integer) to authenticated;


-- New clients attach only version and ending metadata; counters come from validated events.
create or replace function public.am_save_round_logged(p_round uuid,p_nickname text,p_events jsonb,p_duration integer,p_kind text,p_version text,p_game_over boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.am_rounds; points int; who uuid:=public.am_player_id();
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 if p_kind is null or p_kind not in ('checkpoint','submit','gameover') or p_game_over is null then raise exception 'Invalid save kind';end if;
 if p_version is not null and (length(p_version)>32 or p_version !~ '^[0-9]+[.][0-9]+[.][0-9]+$') then raise exception 'Invalid version';end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 select * into r from public.am_rounds where id=p_round and player_id=public.am_round_owner(p_round) for update;
 if not found then raise exception 'Unknown round';end if;
 if p_kind='checkpoint' then points:=public.am_checkpoint_round(p_round,p_nickname,p_events,p_duration);
 elsif p_kind='gameover' then points:=public.am_game_over(p_round,p_nickname,p_events,p_duration);
 else points:=public.am_submit_round(p_round,p_nickname,p_events,p_duration);end if;
 if r.finished_at is null then
  update public.am_rounds set round_log=round_log||jsonb_build_object('version',coalesce(round_log->>'version',p_version),'outcome',case when finished_at is null then 'unfinished' when p_game_over then 'gameover' else 'restarted' end)
  where id=p_round and round_log is not null;
 end if;
 return points;
end $$;
revoke all on function public.am_save_round_logged(uuid,text,jsonb,integer,text,text,boolean) from public,anon;
grant execute on function public.am_save_round_logged(uuid,text,jsonb,integer,text,text,boolean) to authenticated;
create or replace function public.ag_admin_player(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.am_players; rounds jsonb; history jsonb; devices integer;
begin
 perform public.ag_require_admin();
 select * into p from public.am_players where id=p_player;
 if not found then raise exception 'Spilleren findes ikke.';end if;
 select count(*) into devices from (
  select p.id as device_id where not exists(select 1 from public.am_player_devices where device_id=p.id)
  union select device_id from public.am_player_devices where player_id=p.id
 ) d;
 select coalesce(jsonb_agg(x order by x.started_at desc),'[]'::jsonb) into rounds from (
  select id,started_at,score,hidden,saved_at,finished_at,duration_ms,round_log from public.am_rounds where player_id=p.id order by started_at desc,id limit 20
 ) x;
 select coalesce(jsonb_agg(x order by x.id desc),'[]'::jsonb) into history from (
  select id,action,before_state,after_state,created_at from public.ag_admin_audit where player_id=p.id order by id desc limit 20
 ) x;
 return jsonb_build_object('player',to_jsonb(p),'devices',devices,'rounds',rounds,'history',history,
  'best',coalesce((select max(score) from public.am_rounds where player_id=p.id and not hidden and saved_at is not null),0),
  'has_code',exists(select 1 from public.am_player_codes where player_id=p.id));
end $$;


commit;
