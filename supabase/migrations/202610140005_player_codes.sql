-- Persistent private player codes and shared profiles. Safe to run again.
begin;
create table if not exists public.am_player_devices (
 device_id uuid primary key references auth.users(id) on delete cascade,
 player_id uuid not null references public.am_players(id) on delete cascade
);
create table if not exists public.am_player_codes (
 player_id uuid primary key references public.am_players(id) on delete cascade,
 code_hash text not null,
 changed_at timestamptz not null default now()
);
create table if not exists public.am_code_attempts (
 device_id uuid primary key references auth.users(id) on delete cascade,
 attempts integer not null default 0,
 window_start timestamptz not null default now()
);
alter table public.am_player_devices enable row level security;
alter table public.am_player_codes enable row level security;
alter table public.am_code_attempts enable row level security;
revoke all on public.am_player_devices,public.am_player_codes,public.am_code_attempts from public,anon,authenticated;
alter table public.am_rounds add column if not exists device_id uuid references auth.users(id);
update public.am_rounds set device_id=player_id where device_id is null;

create or replace function public.am_player_id() returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce((select player_id from public.am_player_devices where device_id=auth.uid()),auth.uid());
$$;
revoke all on function public.am_player_id() from public,anon,authenticated;

-- A queued round stays with its original profile even if this device switches profile.
create or replace function public.am_round_owner(p_round uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select r.player_id from public.am_rounds r where r.id=p_round
 and (r.player_id=public.am_player_id() or r.device_id=auth.uid());
$$;
revoke all on function public.am_round_owner(uuid) from public,anon,authenticated;

-- Keep the existing score validator and permissions; use the shared profile identity.
do $$
declare f record; definition text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (
  'am_start_round','am_save_round','am_claim_name','am_player_profile',
  'am_leaderboard','am_live_update','am_live_players'
 ) loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'auth.uid()','public.am_player_id()');
  definition:=replace(definition,
   'insert into public.am_rounds(player_id) values(who)',
   'insert into public.am_rounds(player_id,device_id) values(who,auth.uid())');
  definition:=replace(definition,
   'where id=p_round and player_id=who for update;',
   'where id=p_round and player_id=public.am_round_owner(p_round) for update;');
  definition:=replace(definition,
   'if not found then raise exception ''Unknown round''; end if;',
   'if not found then raise exception ''Unknown round''; end if; who:=r.player_id;');
  execute definition;
 end loop;
end $$;
-- Explicitly set this function so rerunning cannot change device identity semantics.
create or replace function public.am_start_round() returns uuid
language plpgsql security definer set search_path='' as $$
declare who uuid:=public.am_player_id(); ticket uuid;
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 if exists(select 1 from public.am_players where id=who and blocked) then raise exception 'Player unavailable'; end if;
 if (select count(*) from public.am_rounds where player_id=who and started_at>now()-interval '1 hour')>=60 then raise exception 'Too many rounds; try later'; end if;
 insert into public.am_rounds(player_id,device_id) values(who,auth.uid()) returning id into ticket;
 return ticket;
end $$;

create or replace function public.am_player_profile() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'nickname',p.nickname,'claimed',p.name_claimed and not p.blocked,
 'has_code',exists(select 1 from public.am_player_codes c where c.player_id=p.id),
 'best',coalesce((select max(score) from public.am_rounds r where r.player_id=p.id and not r.hidden and r.saved_at is not null),0))
 from public.am_players p where p.id=public.am_player_id();
$$;

create or replace function public.am_create_player_code() returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=public.am_player_id(); code text; nick text;
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 select nickname into nick from public.am_players where id=who and name_claimed and not blocked;
 if not found then raise exception 'Vælg et ledigt spillernavn først.'; end if;
 code:=upper(left(replace(gen_random_uuid()::text,'-',''),10));
 insert into public.am_player_codes(player_id,code_hash) values(who,encode(sha256(convert_to(code,'UTF8')),'hex'))
 on conflict(player_id) do update set code_hash=excluded.code_hash,changed_at=now();
 return jsonb_build_object('nickname',nick,'code',left(code,5)||'-'||right(code,5));
end $$;

create or replace function public.am_use_player_code(p_nickname text,p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare device uuid:=auth.uid(); target uuid; attempt public.am_code_attempts;
 code text:=upper(regexp_replace(coalesce(p_code,''),'[-[:space:]]','','g'));
begin
 if device is null then raise exception 'Login required'; end if;
 insert into public.am_code_attempts(device_id) values(device) on conflict do nothing;
 select * into attempt from public.am_code_attempts where device_id=device for update;
 if attempt.window_start<=now()-interval '15 minutes' then
  update public.am_code_attempts set attempts=0,window_start=now() where device_id=device;
  attempt.attempts:=0;
 end if;
 if attempt.attempts>=5 then return jsonb_build_object('error','For mange forsøg. Vent 15 minutter og prøv igen.'); end if;
 -- Return errors instead of raising: failed attempts must stay counted.
 update public.am_code_attempts set attempts=attempts+1 where device_id=device;
 select p.id into target from public.am_players p join public.am_player_codes c on c.player_id=p.id
 where p.name_claimed and not p.blocked and public.am_name_key(p.nickname)=public.am_name_key(p_nickname)
 and code ~ '^[0-9A-F]{10}$' and c.code_hash=encode(sha256(convert_to(code,'UTF8')),'hex')
 for update of c;
 if not found then return jsonb_build_object('error','Navn eller spillerkode er forkert.'); end if;
 insert into public.am_player_devices(device_id,player_id) values(device,target)
 on conflict(device_id) do update set player_id=excluded.player_id;
 return jsonb_build_object('ok',true,'profile',public.am_player_profile());
end $$;
revoke all on function public.am_create_player_code(),public.am_use_player_code(text,text) from public,anon;
grant execute on function public.am_create_player_code(),public.am_use_player_code(text,text) to authenticated;
commit;
