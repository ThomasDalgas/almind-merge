CREATE OR REPLACE FUNCTION public.am_live_update(p_round uuid, p_nickname text, p_score integer, p_max_tier integer, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare who uuid:=public.am_player_id(); r public.am_rounds; nick text:=btrim(p_nickname);
begin
 if who is null then raise exception 'Login required'; end if;
 select * into r from public.am_rounds
 where id=p_round and player_id=public.am_round_owner(p_round) for update;
 if not found then raise exception 'Unknown round'; end if; who:=r.player_id;
 if not coalesce(p_active,false) then
  update public.am_live_sessions set expires_at=now()
  where round_id=p_round and player_id=who;
 else
  if r.finished_at is not null or r.hidden then
   raise exception 'Round unavailable';
  end if;
  if exists(select 1 from public.am_players where id=who and blocked) then
   raise exception 'Player unavailable';
  end if;
  select p.nickname into nick
  from public.am_players p where p.id=who and p.name_claimed;
  if nick is null then raise exception 'Vælg et ledigt spillernavn først.'; end if;
  if char_length(nick) not between 2 and 20 or nick !~ '^[[:alnum:] _-]+$' then
   raise exception 'Invalid nickname';
  end if;
  if p_score is null or p_score not between 0 and 100000000
     or p_max_tier is null or p_max_tier not between 0 and 10 then
   raise exception 'Invalid live score';
  end if;
  insert into public.am_live_sessions(
   round_id,player_id,nickname,score,max_tier,seen_at,expires_at
  )
  values(p_round,who,nick,p_score,p_max_tier,now(),now()+interval '20 seconds')
  on conflict(round_id) do update
  set nickname=excluded.nickname,score=excluded.score,max_tier=excluded.max_tier,
      seen_at=excluded.seen_at,expires_at=excluded.expires_at;
 end if;
 delete from public.am_live_sessions where expires_at<now()-interval '1 hour';
 return public.am_live_snapshot();
end $function$;
