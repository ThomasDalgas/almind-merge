-- One signature per RPC keeps the existing PostgREST names/arguments unambiguous.
-- DROP uses RESTRICT (the default), never CASCADE. Caller grants are restored below.
begin;
drop function public.am_save_round_logged(uuid,text,jsonb,integer,text,text,boolean);
drop function public.am_game_over(uuid,text,jsonb,integer);
drop function public.am_submit_round(uuid,text,jsonb,integer);
drop function public.am_checkpoint_round(uuid,text,jsonb,integer);
drop function public.am_save_round(uuid,text,jsonb,integer,boolean);
drop function public.am_leaderboard_v2(text);
alter table public.am_rounds drop constraint am_rounds_duration_ms_check,
 alter column duration_ms type bigint;
alter table public.am_rounds add constraint am_rounds_duration_ms_check check (duration_ms >= 0);

create or replace function public.am_save_round(p_round uuid,p_nickname text,p_events jsonb,p_duration bigint,p_final boolean)
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
revoke all on function public.am_save_round(uuid,text,jsonb,bigint,boolean) from public,anon,authenticated;

create or replace function public.am_checkpoint_round(p_round uuid,p_nickname text,p_events jsonb,p_duration bigint)
returns integer language sql security definer set search_path='' as $$
 select public.am_save_round(p_round,p_nickname,p_events,p_duration,false);
$$;
revoke all on function public.am_checkpoint_round(uuid,text,jsonb,bigint) from public,anon;
grant execute on function public.am_checkpoint_round(uuid,text,jsonb,bigint) to authenticated;

create or replace function public.am_submit_round(p_round uuid,p_nickname text,p_events jsonb,p_duration bigint)
returns integer language sql security definer set search_path='' as $$
 select public.am_save_round(p_round,p_nickname,p_events,p_duration,true);
$$;
revoke all on function public.am_submit_round(uuid,text,jsonb,bigint) from public,anon;
grant execute on function public.am_submit_round(uuid,text,jsonb,bigint) to authenticated;

create or replace function public.am_game_over(p_round uuid,p_nickname text,p_events jsonb,p_duration bigint)
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
revoke all on function public.am_game_over(uuid,text,jsonb,bigint) from public,anon;
grant execute on function public.am_game_over(uuid,text,jsonb,bigint) to authenticated;

create or replace function public.am_save_round_logged(p_round uuid,p_nickname text,p_events jsonb,p_duration bigint,p_kind text,p_version text,p_game_over boolean)
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
revoke all on function public.am_save_round_logged(uuid,text,jsonb,bigint,text,text,boolean) from public,anon;
grant execute on function public.am_save_round_logged(uuid,text,jsonb,bigint,text,text,boolean) to authenticated;

create or replace function public.am_leaderboard_v2(p_scope text default 'week')
returns table(place bigint,nickname text,score integer,max_tier integer,achieved_at timestamptz,is_me boolean,duration_ms bigint)
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
revoke all on function public.am_leaderboard_v2(text) from public;
grant execute on function public.am_leaderboard_v2(text) to anon,authenticated;

-- Private recovery only: none of the score RPCs read these client-supplied snapshots.
create table public.am_round_backups (
 round_id uuid primary key references public.am_rounds(id) on delete cascade,
 revision bigint not null check (revision>=0),
 snapshot jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.am_round_backups enable row level security;
revoke all on public.am_round_backups from public,anon,authenticated;

create function public.am_put_round_backup(p_round uuid,p_revision bigint,p_snapshot jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare who uuid:=public.am_player_id(); ended timestamptz;
begin
 if auth.uid() is null or who is null then raise exception 'Login required'; end if;
 select r.finished_at into ended from public.am_rounds r join public.am_players p on p.id=r.player_id
 where r.id=p_round and p.id=who and not p.blocked for update of r;
 if not found then raise exception 'Unknown round'; end if;
 if ended is not null then return false; end if;
 if p_revision is null or p_revision<0 or jsonb_typeof(p_snapshot) is distinct from 'object'
 or octet_length(p_snapshot::text)>6000000
 or jsonb_typeof(p_snapshot->'round') is distinct from 'object'
 or jsonb_typeof(p_snapshot->'powers') is distinct from 'object'
 or jsonb_typeof(p_snapshot->'tiles') is distinct from 'array'
 or jsonb_typeof(p_snapshot->'journal') is distinct from 'object'
 or (p_snapshot#>>'{journal,ticket,id}') is distinct from p_round::text
 or jsonb_typeof(p_snapshot->'elapsed') is distinct from 'number'
 or jsonb_typeof(p_snapshot->'time') is distinct from 'number'
 or jsonb_typeof(p_snapshot#>'{round,score}') is distinct from 'number'
 or (p_snapshot->>'elapsed')::numeric<0 or (p_snapshot->>'time')::numeric<0
 or (p_snapshot#>>'{round,score}')::numeric<0
 then raise exception 'Invalid round backup'; end if;
 insert into public.am_round_backups as previous(round_id,revision,snapshot)
 values(p_round,p_revision,p_snapshot)
 on conflict(round_id) do update set revision=excluded.revision,snapshot=excluded.snapshot,updated_at=now()
 where previous.revision<excluded.revision
 and (previous.snapshot->>'elapsed')::numeric<=(excluded.snapshot->>'elapsed')::numeric
 and (previous.snapshot->>'time')::numeric<=(excluded.snapshot->>'time')::numeric
 and (previous.snapshot#>>'{round,score}')::numeric<=(excluded.snapshot#>>'{round,score}')::numeric;
 if found then return true; end if;
 -- Idempotent network retry (including equal revision) is an acknowledged save.
 return exists(select 1 from public.am_round_backups where round_id=p_round and revision=p_revision and snapshot=p_snapshot);
end $$;
revoke all on function public.am_put_round_backup(uuid,bigint,jsonb) from public,anon;
grant execute on function public.am_put_round_backup(uuid,bigint,jsonb) to authenticated;

create function public.am_get_round_backup(p_round uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('round_id',b.round_id,'revision',b.revision,'snapshot',b.snapshot)
 from public.am_round_backups b join public.am_rounds r on r.id=b.round_id
 join public.am_players p on p.id=r.player_id
 where auth.uid() is not null and p.id=public.am_player_id() and not p.blocked
 and r.id=p_round and r.finished_at is null;
$$;
revoke all on function public.am_get_round_backup(uuid) from public,anon;
grant execute on function public.am_get_round_backup(uuid) to authenticated;

-- Once Game Over is verified the recovery copy is obsolete; releasing it never removes a score.
create function public.am_release_finished_backup() returns trigger language plpgsql
security invoker set search_path='' as $$
begin
 delete from public.am_round_backups where round_id=new.id;
 return null;
end $$;
revoke all on function public.am_release_finished_backup() from public,anon,authenticated;
create trigger am_release_finished_backup after update of finished_at on public.am_rounds
for each row when (old.finished_at is null and new.finished_at is not null)
execute function public.am_release_finished_backup();
notify pgrst,'reload schema';
commit;
