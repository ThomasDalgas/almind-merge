-- Administrative recovery for a specifically reviewed backup. Nothing here mints
-- recovery from a client upload; only an operator may install an approved row.
begin;
create table public.am_round_recoveries(
 round_id uuid primary key references public.am_rounds(id) on delete cascade,
 id uuid not null unique default gen_random_uuid(),
 revision bigint not null, cursor_at_approval bigint not null check(cursor_at_approval>0),
 approved_at timestamptz not null default now(), backup_at timestamptz not null,
 previous_score integer not null, previous_log jsonb not null, previous_saved_at timestamptz,
 previous_duration bigint, snapshot jsonb not null
);
alter table public.am_round_recoveries enable row level security;
revoke all on public.am_round_recoveries from public,anon,authenticated;

create function public.am_round_recovery(p_round uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'revision',a.revision,'cursor',a.cursor_at_approval,'server_cursor',s.event_no,'score',(a.snapshot#>>'{round,score}')::int,'snapshot',a.snapshot)
 from public.am_round_recoveries a join public.am_rounds r on r.id=a.round_id
 join public.am_stream_state s on s.round_id=r.id join public.am_players p on p.id=r.player_id
 where auth.uid() is not null and p.id=public.am_player_id() and not p.blocked and r.id=p_round and r.finished_at is null;
$$;
revoke all on function public.am_round_recovery(uuid) from public,anon,authenticated;
grant execute on function public.am_round_recovery(uuid) to authenticated;

-- Retain the existing validator as a private implementation. Serialize adoption
-- and writes on the round so an already open stale tab cannot close a seeded round.
alter function public.am_save_round(uuid,text,jsonb,bigint,boolean) rename to am_replay_full_private;
revoke all on function public.am_replay_full_private(uuid,text,jsonb,bigint,boolean) from public,anon,authenticated;
create function public.am_save_round(p_round uuid,p_nickname text,p_events jsonb,p_duration bigint,p_final boolean)
returns integer language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 perform pg_advisory_xact_lock(hashtextextended(public.am_player_id()::text,0));
 perform 1 from public.am_rounds where id=p_round and player_id=public.am_round_owner(p_round) for update;
 if not found then raise exception 'Unknown round';end if;
 if exists(select from public.am_round_recoveries where round_id=p_round) then raise exception 'Approved recovery required';end if;
 return public.am_replay_full_private(p_round,p_nickname,p_events,p_duration,p_final);
end $$;
revoke all on function public.am_save_round(uuid,text,jsonb,bigint,boolean) from public,anon,authenticated;

alter function public.am_stream_round(uuid,bigint,jsonb,bigint,text,text,boolean) rename to am_replay_stream_private;
revoke all on function public.am_replay_stream_private(uuid,bigint,jsonb,bigint,text,text,boolean) from public,anon,authenticated;
create function public.am_stream_round(p_round uuid,p_offset bigint,p_events jsonb,p_duration bigint,p_kind text,p_version text,p_game_over boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 perform pg_advisory_xact_lock(hashtextextended(public.am_player_id()::text,0));
 perform 1 from public.am_rounds where id=p_round and player_id=public.am_round_owner(p_round) for update;
 if not found then raise exception 'Unknown round';end if;
 if exists(select from public.am_round_recoveries where round_id=p_round) then raise exception 'Approved recovery required';end if;
 return public.am_replay_stream_private(p_round,p_offset,p_events,p_duration,p_kind,p_version,p_game_over);
end $$;
revoke all on function public.am_stream_round(uuid,bigint,jsonb,bigint,text,text,boolean) from public,anon,authenticated;
grant execute on function public.am_stream_round(uuid,bigint,jsonb,bigint,text,text,boolean) to authenticated;

create function public.am_stream_recovered_round(p_recovery uuid,p_round uuid,p_offset bigint,p_events jsonb,p_duration bigint,p_kind text,p_version text,p_game_over boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select from public.am_round_recoveries a join public.am_rounds r on r.id=a.round_id
 join public.am_players p on p.id=r.player_id where a.id=p_recovery and r.id=p_round and not p.blocked and p.id=public.am_player_id())
 then raise exception 'Unknown recovery';end if;
 return public.am_replay_stream_private(p_round,p_offset,p_events,p_duration,p_kind,p_version,p_game_over);
end $$;
revoke all on function public.am_stream_recovered_round(uuid,uuid,bigint,jsonb,bigint,text,text,boolean) from public,anon,authenticated;
grant execute on function public.am_stream_recovered_round(uuid,uuid,bigint,jsonb,bigint,text,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
