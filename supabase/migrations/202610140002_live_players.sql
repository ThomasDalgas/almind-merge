-- Temporary live scores are informational; verified highscores remain separate.
begin;
create table public.am_live_sessions (
 round_id uuid primary key references public.am_rounds(id) on delete cascade,
 player_id uuid not null references auth.users(id) on delete cascade,
 nickname text not null check(char_length(nickname) between 2 and 20),
 score integer not null check(score between 0 and 100000000),
 max_tier integer not null check(max_tier between 0 and 10),
 seen_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create index am_live_expiry on public.am_live_sessions(expires_at);
alter table public.am_live_sessions enable row level security;
revoke all on public.am_live_sessions from public,anon,authenticated;
create function public.am_live_players()
returns table(player_key text,nickname text,score integer,max_tier integer,is_me boolean,total_players bigint)
language sql stable security definer set search_path='' as $$
 with latest as (
  select distinct on(s.player_id) s.*
  from public.am_live_sessions s join public.am_rounds r on r.id=s.round_id
  where s.expires_at>now() and r.finished_at is null and not r.hidden
   and not exists(select 1 from public.am_players p where p.id=s.player_id and p.blocked)
  order by s.player_id,r.started_at desc,r.id
 ), ranked as (
  select l.*,count(*) over() as total,row_number() over(order by l.score desc,l.round_id) as pos from latest l
 )
 select md5('almind-live:'||q.player_id::text),q.nickname,q.score,q.max_tier,coalesce(q.player_id=auth.uid(),false),q.total
 from ranked q where q.pos<=50 or q.player_id=auth.uid() order by q.pos;
$$;
create table public.am_live_records (
 round_id uuid primary key references public.am_rounds(id) on delete cascade,
 kind text not null check(kind in ('all','week')),
 created_at timestamptz not null default now()
);
alter table public.am_live_records enable row level security;
revoke all on public.am_live_records from public,anon,authenticated;
create function public.am_record_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare best_all integer; best_week integer; category text;
begin
 if old.finished_at is not null or new.finished_at is null or new.hidden then return new; end if;
 if exists(select 1 from public.am_players where id=new.player_id and blocked) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('almind-record-notices',0));
 select max(r.score),max(r.score) filter(where r.finished_at>=date_trunc('week',new.finished_at at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen')
 into best_all,best_week from public.am_rounds r join public.am_players p on p.id=r.player_id
 where r.id<>new.id and r.finished_at is not null and not r.hidden and not p.blocked;
 if new.score>coalesce(best_all,0) then category:='all';
 elsif new.score>coalesce(best_week,0) then category:='week'; end if;
 if category is not null then
  insert into public.am_live_records(round_id,kind) values(new.id,category) on conflict do nothing;
 end if;
 delete from public.am_live_records where created_at<now()-interval '1 day';
 return new;
end $$;
revoke all on function public.am_record_notice() from public,anon,authenticated;
create trigger am_record_notice after update of finished_at on public.am_rounds
 for each row execute function public.am_record_notice();
create function public.am_live_snapshot() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'players',coalesce((select jsonb_agg(p) from public.am_live_players() p),'[]'::jsonb),
  'records',coalesce((select jsonb_agg(e order by e.created_at,e.id) from (
   select n.round_id as id,n.kind,n.created_at,p.nickname,r.score from public.am_live_records n
   join public.am_rounds r on r.id=n.round_id join public.am_players p on p.id=r.player_id
   where n.created_at>now()-interval '5 minutes' and not r.hidden and not p.blocked
   order by n.created_at desc,n.round_id limit 20
  ) e),'[]'::jsonb)
 );
$$;
revoke all on function public.am_live_snapshot() from public;
grant execute on function public.am_live_snapshot() to anon,authenticated;
create function public.am_live_update(p_round uuid,p_nickname text,p_score integer,p_max_tier integer,p_active boolean)
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
  if nick is null or nick='' then nick:='Gæst '||upper(left(md5(who::text),4)); end if;
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
revoke all on function public.am_live_players() from public;
revoke all on function public.am_live_update(uuid,text,integer,integer,boolean) from public,anon;
grant execute on function public.am_live_players() to anon,authenticated;
grant execute on function public.am_live_update(uuid,text,integer,integer,boolean) to authenticated;
commit;
