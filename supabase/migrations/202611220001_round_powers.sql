-- Preserve ownership, inventory, timing and score validation in both replay paths.
-- Activation affects only this round and remains part of its ordered journal.
begin;
alter table public.am_stream_state add column unlimited_powers boolean not null default false;
create or replace function public.am_replay_full_private(p_round uuid,p_nickname text,p_events jsonb,p_duration bigint,p_final boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare
 who uuid:=public.am_player_id(); r public.am_rounds; e jsonb; k text; tier int; stamp bigint;
 inv int[]:=array_fill(0,array[11]); points int:=0; highest int:=0; drops int:=0;
 previous_stamp bigint:=0; last_drop bigint:=-500; shakes int:=1; removals int:=1; reward int:=0;
 nick text:=btrim(p_nickname); merges int:=0; pairs int:=0; used_shakes int:=0; used_removals int:=0;
 -- Modern merge outputs have one identity: their producing journal position.
 -- Inventory left by a legacy prefix and unmerged drops have reference zero.
 tracked int[]:=array_fill(0,array[11]); origin_tier int[]; origin_ms bigint[]; origin_depth int[];
 event_no int:=0; modern boolean:=false; sim bigint; prev_sim bigint:=0; last_sim_drop bigint:=-500;
 unlimited boolean:=false;
 ref_a int; ref_b int; ref int; needed int; depth int; refs int[];
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
 if p_duration is null or p_duration<1 or p_duration>extract(epoch from(now()-r.started_at))*1000+2000 then raise exception 'Invalid round duration'; end if;
 -- Independent resource limits on replay; time itself has no fixed cap.
 if p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 100000 or octet_length(p_events::text)>6000000 then raise exception 'Invalid event log'; end if;
 origin_tier:=array_fill(-1,array[jsonb_array_length(p_events)]);
 origin_ms:=array_fill(0::bigint,array[jsonb_array_length(p_events)]);
 origin_depth:=array_fill(0,array[jsonb_array_length(p_events)]);
 for e in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(e)<>'array' or jsonb_array_length(e) not in (3,6) or (e->>1)!~'^[0-9]+$' or (e->>2)!~'^[0-9]+$' or e->>0 is null or e->>1 is null or e->>2 is null then raise exception 'Invalid event'; end if;
  k:=e->>0; tier:=(e->>1)::int; stamp:=(e->>2)::bigint;
  if tier not between 0 and 10 or stamp<previous_stamp or stamp>p_duration then raise exception 'Invalid event order'; end if;
  event_no:=event_no+1;depth:=1;
  if jsonb_array_length(e)=6 then
   modern:=true;
   if coalesce(e->>3,'') !~ '^[0-9]+$' or coalesce(e->>4,'') !~ '^[0-9]+$' or coalesce(e->>5,'') !~ '^[0-9]+$' then raise exception 'Invalid chain event'; end if;
   sim:=(e->>3)::bigint;ref_a:=(e->>4)::int;ref_b:=(e->>5)::int;
   if sim<prev_sim or sim>stamp+1 then raise exception 'Invalid simulation clock'; end if;
   prev_sim:=sim;
   if k='d' then
    if sim-last_sim_drop<499 then raise exception 'Invalid simulation drop'; end if;
    last_sim_drop:=sim;
   end if;
   if k in ('m','b') then refs:=array[ref_a,ref_b];
   elsif k='r' and ref_b=0 then refs:=array[ref_a];
   elsif k in ('d','s','u') and ref_a=0 and ref_b=0 then refs:='{}';
   else raise exception 'Invalid chain references'; end if;
   needed:=0;
   foreach ref in array refs loop
    if ref=0 then needed:=needed+1;
    elsif ref<1 or ref>=event_no or origin_tier[ref]<>tier then raise exception 'Invalid chain parent';
    else
     if sim-origin_ms[ref]<=2000 then depth:=greatest(depth,least(5,origin_depth[ref]+1)); end if;
     origin_tier[ref]:=-1;
    end if;
   end loop;
   if needed>inv[tier+1]-tracked[tier+1] then raise exception 'Invalid untracked tile'; end if;
   tracked[tier+1]:=tracked[tier+1]-(cardinality(refs)-needed);
  elsif modern then raise exception 'Legacy event after chain event';
  end if;
  previous_stamp:=stamp;
  while reward<points/6000 loop
   reward:=reward+1;
   if reward%2=1 then removals:=removals+1; else shakes:=shakes+1; end if;
  end loop;
  if k='u' then
   if tier<>0 then raise exception 'Invalid power activation';end if;
   unlimited:=true;
  elsif k='d' then
   if stamp-last_drop<499 or (drops<4 and tier<>0) or tier>=least(greatest(highest,3),5) then raise exception 'Invalid drop'; end if;
   drops:=drops+1;last_drop:=stamp;inv[tier+1]:=inv[tier+1]+1;points:=points+(2^(tier+1))::int;
  elsif k='m' then
   merges:=merges+1;if tier=10 then pairs:=pairs+1;end if;
   if inv[tier+1]<2 then raise exception 'Invalid merge'; end if;
   inv[tier+1]:=inv[tier+1]-2;
   if tier<10 then
    if modern then
     origin_tier[event_no]:=tier+1;origin_ms[event_no]:=sim;origin_depth[event_no]:=depth;
     tracked[tier+2]:=tracked[tier+2]+1;
    end if;
    inv[tier+2]:=inv[tier+2]+1;points:=points+depth*(2^(tier+2))::int;highest:=greatest(highest,tier+1);
   end if;
  elsif k='b' then
   merges:=merges+1;pairs:=pairs+1;
   if tier<>10 or inv[11]<2 then raise exception 'Invalid Svend bonus'; end if;
   inv[11]:=inv[11]-2;points:=points+10000;
  elsif k='r' then
   used_removals:=used_removals+1;
   if (not unlimited and removals<1) or inv[tier+1]<1 then raise exception 'Invalid removal'; end if;
   if not unlimited then removals:=removals-1;end if;inv[tier+1]:=inv[tier+1]-1;
  elsif k='s' then
   used_shakes:=used_shakes+1;
   if (not unlimited and shakes<1) or (select sum(v) from unnest(inv) v)=0 then raise exception 'Invalid shake'; end if;
   if not unlimited then shakes:=shakes-1;end if;
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
create or replace function public.am_replay_stream_private(p_round uuid,p_offset bigint,p_events jsonb,p_duration bigint,p_kind text,p_version text,p_game_over boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 who uuid:=public.am_player_id(); r public.am_rounds; state public.am_stream_state;
 e jsonb;k text;tier int;stamp bigint;sim bigint;ref_a bigint;ref_b bigint;ref bigint;refs bigint[];
 unlimited boolean:=false;
 needed int;depth int;origin_ms bigint;origin_depth int;count_events int;
 inv integer[]; points integer; highest integer; drops integer; previous_stamp bigint; last_drop bigint; shakes integer; removals integer; reward integer; merges integer; pairs integer; used_shakes integer; used_removals integer; tracked integer[]; event_no bigint; modern boolean; prev_sim bigint; last_sim_drop bigint;
begin
 if auth.uid() is null or who is null then raise exception 'Login required';end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 select * into r from public.am_rounds where id=p_round and player_id=public.am_round_owner(p_round) for update;
 if not found then raise exception 'Unknown round';end if;
 if not exists(select 1 from public.am_players p where p.id=r.player_id and p.name_claimed and not p.blocked) then raise exception 'Player unavailable';end if;
 if p_kind is null or p_kind not in ('part','checkpoint','submit','gameover') or p_offset is null or p_offset<0 or p_game_over is null then raise exception 'Invalid stream request';end if;
 if p_version is not null and (length(p_version)>32 or p_version !~ '^[0-9]+[.][0-9]+[.][0-9]+$') then raise exception 'Invalid version';end if;
 if p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>1024 or octet_length(p_events::text)>100000 then raise exception 'Invalid event batch';end if;
 count_events:=jsonb_array_length(p_events);
 select * into state from public.am_stream_state where round_id=p_round;
 if r.finished_at is not null or (p_offset=0 and count_events=0 and p_kind='part') or p_offset<coalesce(state.event_no,0) then
  return jsonb_build_object('cursor',coalesce(state.event_no,0),'score',coalesce(r.score,0),'finished',r.finished_at is not null);
 end if;
 if p_offset<>coalesce(state.event_no,0) then raise exception 'Invalid stream offset';end if;
 if p_duration is null or p_duration<1 or p_duration>extract(epoch from(now()-r.started_at))*1000+2000 or p_duration<coalesce(state.previous_stamp,0) then raise exception 'Invalid round duration';end if;
 if state.round_id is null then insert into public.am_stream_state(round_id) values(p_round) returning * into state;end if;
 unlimited:=state.unlimited_powers;
 inv:=state.inv; points:=state.points; highest:=state.highest; drops:=state.drops; previous_stamp:=state.previous_stamp; last_drop:=state.last_drop; shakes:=state.shakes; removals:=state.removals; reward:=state.reward; merges:=state.merges; pairs:=state.pairs; used_shakes:=state.used_shakes; used_removals:=state.used_removals; tracked:=state.tracked; event_no:=state.event_no; modern:=state.modern; prev_sim:=state.prev_sim; last_sim_drop:=state.last_sim_drop;
 for e in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(e)<>'array' or jsonb_array_length(e) not in (3,6) or (e->>1)!~'^[0-9]+$' or (e->>2)!~'^[0-9]+$' or e->>0 is null or e->>1 is null or e->>2 is null then raise exception 'Invalid event'; end if;
  k:=e->>0; tier:=(e->>1)::int; stamp:=(e->>2)::bigint;
  if tier not between 0 and 10 or stamp<previous_stamp or stamp>p_duration then raise exception 'Invalid event order'; end if;
  event_no:=event_no+1;depth:=1;
  if jsonb_array_length(e)=6 then
   modern:=true;
   if coalesce(e->>3,'') !~ '^[0-9]+$' or coalesce(e->>4,'') !~ '^[0-9]+$' or coalesce(e->>5,'') !~ '^[0-9]+$' then raise exception 'Invalid chain event'; end if;
   sim:=(e->>3)::bigint;ref_a:=(e->>4)::bigint;ref_b:=(e->>5)::bigint;
   if sim<prev_sim or sim>stamp+1 then raise exception 'Invalid simulation clock'; end if;
   prev_sim:=sim;
   if k='d' then
    if sim-last_sim_drop<499 then raise exception 'Invalid simulation drop'; end if;
    last_sim_drop:=sim;
   end if;
   if k in ('m','b') then refs:=array[ref_a,ref_b];
   elsif k='r' and ref_b=0 then refs:=array[ref_a];
   elsif k in ('d','s','u') and ref_a=0 and ref_b=0 then refs:='{}';
   else raise exception 'Invalid chain references'; end if;
   needed:=0;
   foreach ref in array refs loop
    if ref=0 then needed:=needed+1;
    elsif ref<1 or ref>=event_no then raise exception 'Invalid chain parent';
    else
     delete from public.am_stream_origins where round_id=p_round and producer=ref and tile_tier=tier returning sim_ms,chain_depth into origin_ms,origin_depth;
     if not found then raise exception 'Invalid chain parent'; end if;
     if sim-origin_ms<=2000 then depth:=greatest(depth,least(5,origin_depth+1)); end if;
    end if;
   end loop;
   if needed>inv[tier+1]-tracked[tier+1] then raise exception 'Invalid untracked tile'; end if;
   tracked[tier+1]:=tracked[tier+1]-(cardinality(refs)-needed);
  elsif modern then raise exception 'Legacy event after chain event';
  end if;
  previous_stamp:=stamp;
  while reward<points/6000 loop
   reward:=reward+1;
   if reward%2=1 then removals:=removals+1; else shakes:=shakes+1; end if;
  end loop;
  if k='u' then
   if tier<>0 then raise exception 'Invalid power activation';end if;
   unlimited:=true;
  elsif k='d' then
   if stamp-last_drop<499 or (drops<4 and tier<>0) or tier>=least(greatest(highest,3),5) then raise exception 'Invalid drop'; end if;
   drops:=drops+1;last_drop:=stamp;inv[tier+1]:=inv[tier+1]+1;points:=points+(2^(tier+1))::int;
  elsif k='m' then
   merges:=merges+1;if tier=10 then pairs:=pairs+1;end if;
   if inv[tier+1]<2 then raise exception 'Invalid merge'; end if;
   inv[tier+1]:=inv[tier+1]-2;
   if tier<10 then
    if modern then
     insert into public.am_stream_origins(round_id,producer,tile_tier,sim_ms,chain_depth) values (p_round,event_no,tier+1,sim,depth);
     tracked[tier+2]:=tracked[tier+2]+1;
    end if;
    inv[tier+2]:=inv[tier+2]+1;points:=points+depth*(2^(tier+2))::int;highest:=greatest(highest,tier+1);
   end if;
  elsif k='b' then
   merges:=merges+1;pairs:=pairs+1;
   if tier<>10 or inv[11]<2 then raise exception 'Invalid Svend bonus'; end if;
   inv[11]:=inv[11]-2;points:=points+10000;
  elsif k='r' then
   used_removals:=used_removals+1;
   if (not unlimited and removals<1) or inv[tier+1]<1 then raise exception 'Invalid removal'; end if;
   if not unlimited then removals:=removals-1;end if;inv[tier+1]:=inv[tier+1]-1;
  elsif k='s' then
   used_shakes:=used_shakes+1;
   if (not unlimited and shakes<1) or (select sum(v) from unnest(inv) v)=0 then raise exception 'Invalid shake'; end if;
   if not unlimited then shakes:=shakes-1;end if;
  else raise exception 'Unknown event'; end if;
 end loop;

 state.inv:=inv; state.points:=points; state.highest:=highest; state.drops:=drops; state.previous_stamp:=previous_stamp; state.last_drop:=last_drop; state.shakes:=shakes; state.removals:=removals; state.reward:=reward; state.merges:=merges; state.pairs:=pairs; state.used_shakes:=used_shakes; state.used_removals:=used_removals; state.tracked:=tracked; state.event_no:=event_no; state.modern:=modern; state.prev_sim:=prev_sim; state.last_sim_drop:=last_sim_drop;
 update public.am_stream_state set (inv, points, highest, drops, previous_stamp, last_drop, shakes, removals, reward, merges, pairs, used_shakes, used_removals, tracked, event_no, modern, prev_sim, last_sim_drop)=(state.inv, state.points, state.highest, state.drops, state.previous_stamp, state.last_drop, state.shakes, state.removals, state.reward, state.merges, state.pairs, state.used_shakes, state.used_removals, state.tracked, state.event_no, state.modern, state.prev_sim, state.last_sim_drop) where round_id=p_round;
 update public.am_stream_state set unlimited_powers=unlimited where round_id=p_round;
 if p_kind<>'part' then
  if drops<1 or points<=0 or points<coalesce(r.score,0) then raise exception 'Incomplete journal';end if;
  update public.am_rounds set finished_at=case when p_kind!='checkpoint' then now() else null end,
   saved_at=case when score is null or points>score then now() else saved_at end,
   round_log=coalesce(round_log,'{}'::jsonb)||jsonb_build_object('drops',drops,'merges',merges,'svend_pairs',pairs,'shakes',used_shakes,'removals',used_removals,'version',coalesce(round_log->>'version',p_version),'outcome',case when p_kind='checkpoint' then 'unfinished' when p_game_over then 'gameover' else 'restarted' end),
   score=points,max_tier=highest,duration_ms=greatest(coalesce(duration_ms,0),p_duration) where id=p_round;
  if p_kind='gameover' and exists(select 1 from public.am_live_sessions where round_id=p_round and seen_at>now()-interval '60 seconds') then
   insert into public.am_game_over_notices(round_id) values(p_round) on conflict do nothing;
   delete from public.am_game_over_notices where created_at<now()-interval '1 day';
  end if;
  if p_kind!='checkpoint' then delete from public.am_stream_origins where round_id=p_round;end if;
 end if;
 return jsonb_build_object('cursor',event_no,'score',case when p_kind='part' then coalesce(r.score,0) else points end,'finished',p_kind in ('submit','gameover'));
end $$;
revoke all on function public.am_replay_full_private(uuid,text,jsonb,bigint,boolean) from public,anon,authenticated;
revoke all on function public.am_replay_stream_private(uuid,bigint,jsonb,bigint,text,text,boolean) from public,anon,authenticated;
commit;
