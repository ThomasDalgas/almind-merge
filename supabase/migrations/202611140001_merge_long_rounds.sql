-- Replay legacy journals unchanged; derive chain bonuses from consumed merge outputs.
create or replace function public.am_save_round(p_round uuid,p_nickname text,p_events jsonb,p_duration integer,p_final boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare
 who uuid:=public.am_player_id(); r public.am_rounds; e jsonb; k text; tier int; stamp int;
 inv int[]:=array_fill(0,array[11]); points int:=0; highest int:=0; drops int:=0;
 previous_stamp int:=0; last_drop int:=-500; shakes int:=1; removals int:=1; reward int:=0;
 nick text:=btrim(p_nickname); merges int:=0; pairs int:=0; used_shakes int:=0; used_removals int:=0;
 -- Modern merge outputs have one identity: their producing journal position.
 -- Inventory left by a legacy prefix and unmerged drops have reference zero.
 tracked int[]:=array_fill(0,array[11]); origin_tier int[]; origin_ms int[]; origin_depth int[];
 event_no int:=0; modern boolean:=false; sim int; prev_sim int:=0; last_sim_drop int:=-500;
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
 if p_duration is null or p_duration not between 1 and 21600000 or p_duration>extract(epoch from(now()-r.started_at))*1000+2000 then raise exception 'Invalid round duration'; end if;
 -- At most 43,287 drops fit within 6 h at the validator's 499 ms minimum.
 -- Merges plus removals cannot exceed drops (each reduces inventory by at least one).
 -- One drop contributes at most 32 base units, ≤10 merge tiers at ×5 per unit,
 -- plus ≤10,000 per 4,096 units cleared. At one shake per 12,000 points,
 -- fewer than 6,200 additional shake events are possible even with this overestimate.
 -- Allow 100,000 events; 60 bytes/event covers six bounded fields in canonical JSON.
 if p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 100000 or octet_length(p_events::text)>6000000 then raise exception 'Invalid event log'; end if;
 origin_tier:=array_fill(-1,array[jsonb_array_length(p_events)]);
 origin_ms:=array_fill(0,array[jsonb_array_length(p_events)]);
 origin_depth:=array_fill(0,array[jsonb_array_length(p_events)]);
 for e in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(e)<>'array' or jsonb_array_length(e) not in (3,6) or (e->>1)!~'^[0-9]+$' or (e->>2)!~'^[0-9]+$' or e->>0 is null or e->>1 is null or e->>2 is null then raise exception 'Invalid event'; end if;
  k:=e->>0; tier:=(e->>1)::int; stamp:=(e->>2)::int;
  if tier not between 0 and 10 or stamp<previous_stamp or stamp>p_duration then raise exception 'Invalid event order'; end if;
  event_no:=event_no+1;depth:=1;
  if jsonb_array_length(e)=6 then
   modern:=true;
   if coalesce(e->>3,'') !~ '^[0-9]+$' or coalesce(e->>4,'') !~ '^[0-9]+$' or coalesce(e->>5,'') !~ '^[0-9]+$' then raise exception 'Invalid chain event'; end if;
   sim:=(e->>3)::int;ref_a:=(e->>4)::int;ref_b:=(e->>5)::int;
   if sim<prev_sim or sim>stamp+1 then raise exception 'Invalid simulation clock'; end if;
   prev_sim:=sim;
   if k='d' then
    if sim-last_sim_drop<499 then raise exception 'Invalid simulation drop'; end if;
    last_sim_drop:=sim;
   end if;
   if k in ('m','b') then refs:=array[ref_a,ref_b];
   elsif k='r' and ref_b=0 then refs:=array[ref_a];
   elsif k in ('d','s') and ref_a=0 and ref_b=0 then refs:='{}';
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
  if k='d' then
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
