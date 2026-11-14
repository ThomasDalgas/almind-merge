-- Operator-only one-off activation. Substitute exact reviewed values locally.
-- Keep this operation separate from schema migrations and from every client RPC.
do $approved$
declare
 ticket constant uuid:='ROUND_UUID'; rev constant bigint:=BACKUP_REVISION;
 expected_score constant integer:=APPROVED_SCORE; nick constant text:='PLAYER_NAME';
 old_points constant integer:=PREVIOUS_SCORE;
 digest constant text:='SNAPSHOT_SHA256';
 r public.am_rounds; b public.am_round_backups; s jsonb;
 inventory integer[]:=array_fill(0,array[11]); t jsonb; tier integer;
 sim bigint; wall bigint; last_drop_sim bigint; drop_wall bigint; actual_drops int;
 lvl int; available_shakes int; available_removals int; baseline_tier int; n int;
begin
 select * into strict r from public.am_rounds where id=ticket for update;
 select * into strict b from public.am_round_backups where round_id=ticket for update;
 s:=b.snapshot;
 if r.finished_at is not null or r.hidden or r.score is distinct from old_points or
 not exists(select from public.am_players where id=r.player_id and nickname=nick and name_claimed and not blocked)
 or b.revision<>rev or encode(sha256(convert_to(s::text,'UTF8')),'hex')<>digest
 or s#>>'{journal,ticket,id}' is distinct from ticket::text or s#>>'{journal,nickname}' is distinct from nick
 or s#>'{journal,invalid}' is distinct from 'true'::jsonb or s#>'{journal,final}' is distinct from 'false'::jsonb
 or (s#>>'{round,score}')::int is distinct from expected_score or expected_score<old_points
 then raise exception 'Recovery preconditions changed';end if;
 if jsonb_typeof(s#>'{journal,events}')='array' then n:=jsonb_array_length(s#>'{journal,events}');
 else n:=jsonb_array_length(s#>'{journal,eventBlocks}')*512+jsonb_array_length(s#>'{journal,tail}');end if;
 if n is distinct from 20000 or exists(select from public.am_stream_state where round_id=ticket)
 or exists(select from public.am_round_recoveries where round_id=ticket) then raise exception 'Recovery cursor conflict';end if;
 actual_drops:=(s#>>'{round,drops}')::int; baseline_tier:=(s#>>'{round,maxTier}')::int;
 lvl:=(s->>'rewardLevel')::int; available_shakes:=(s#>>'{powers,shake}')::int;available_removals:=(s#>>'{powers,remove}')::int;
 wall:=round((s->>'elapsed')::numeric*1000);sim:=round((s->>'time')::numeric*1000);
 last_drop_sim:=round((s#>>'{round,lastDrop}')::numeric*1000);
 -- Game maps playSeconds() to max(sim,active-wall); true wall timestamp of
 -- last drop wasn't retained in its snapshot. Use exactly the same remaining
 -- cooldown as the real simulation, including on immediate reopen.
 drop_wall:=wall-(sim-last_drop_sim);
 if sim>wall or last_drop_sim>sim or lvl<>expected_score/6000 or baseline_tier not between 0 and 10 or available_shakes not between 0 and 1+lvl/2
 or available_removals not between 0 and 1+(lvl+1)/2 or wall>extract(epoch from(now()-r.started_at))*1000+2000 then raise exception 'Unexpected baseline facts';end if;
 for t in select value from jsonb_array_elements(s->'tiles') loop
  tier:=(t->>'tier')::int;if tier is null or tier not between 0 and baseline_tier then raise exception 'Invalid tile';end if;
  inventory[tier+1]:=inventory[tier+1]+1;
 end loop;
 insert into public.am_round_recoveries(round_id,revision,cursor_at_approval,backup_at,previous_score,previous_log,previous_saved_at,previous_duration,snapshot)
 values(ticket,rev,n,b.updated_at,r.score,r.round_log,r.saved_at,r.duration_ms,s);
 insert into public.am_stream_state(round_id,inv,points,highest,drops,previous_stamp,last_drop,shakes,removals,reward,merges,pairs,used_shakes,used_removals,event_no,modern,prev_sim,last_sim_drop)
 values(ticket,inventory,expected_score,baseline_tier,actual_drops,wall,drop_wall,available_shakes,available_removals,lvl,
 coalesce((r.round_log->>'merges')::int,0),coalesce((r.round_log->>'svend_pairs')::int,0),
 1+lvl/2-available_shakes,1+(lvl+1)/2-available_removals,n,true,sim,last_drop_sim);
 -- Merge/pair totals in the missing gap cannot be reconstructed. Keep those
 -- counters as lower bounds, rather than fabricating events for the gap.
 update public.am_rounds set score=expected_score,max_tier=baseline_tier,duration_ms=wall,saved_at=b.updated_at,
 round_log=r.round_log||jsonb_build_object('outcome','unfinished','drops',actual_drops,
 'shakes',1+lvl/2-available_shakes,'removals',1+(lvl+1)/2-available_removals,
 'recovery_source','operator_approved_snapshot','approved_baseline_score',expected_score,'merge_totals_partial',true)
 where id=ticket;
end $approved$;
