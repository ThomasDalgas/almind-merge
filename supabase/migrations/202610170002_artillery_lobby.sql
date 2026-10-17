-- Artilleri only: shared profiles are read, never renamed or relinked in Merge.
begin;
create table if not exists public.aa_device_profiles(device_id uuid primary key references auth.users(id) on delete cascade,player_id uuid not null references public.am_players(id));
create table if not exists public.aa_presence(player_id uuid primary key references public.am_players(id),seen_at timestamptz not null default now(),available boolean not null default true);
create table if not exists public.aa_invitations(id uuid primary key default gen_random_uuid(),sender uuid not null references public.am_players(id),recipient uuid not null references public.am_players(id),code text not null references public.aa_matches(code),status text not null default 'pending',expires_at timestamptz not null default now()+interval '2 minutes',created_at timestamptz not null default now());
create table if not exists public.aa_pair_requests(id uuid primary key default gen_random_uuid(),device_id uuid not null references auth.users(id),player_id uuid not null references public.am_players(id),digits text not null,status text not null default 'pending',expires_at timestamptz not null default now()+interval '3 minutes',created_at timestamptz not null default now());
alter table public.aa_device_profiles enable row level security;
alter table public.aa_presence enable row level security;
alter table public.aa_invitations enable row level security;
alter table public.aa_pair_requests enable row level security;
revoke all on public.aa_device_profiles,public.aa_presence,public.aa_invitations,public.aa_pair_requests from public,anon,authenticated;
create or replace function public.aa_player_id() returns uuid language sql stable security definer set search_path='' as $$ select coalesce((select player_id from public.aa_device_profiles where device_id=auth.uid()),public.am_player_id()); $$;
revoke all on function public.aa_player_id() from public,anon,authenticated;
-- Only Artilleri RPCs change identity resolution. No am_* functions are modified.
do $$ declare f record; begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('aa_state','aa_host','aa_join','aa_fire') loop execute replace(pg_get_functiondef(f.oid),'public.am_player_id()','public.aa_player_id()'); end loop; end $$;
create or replace function public.aa_profile() returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('nickname',nickname,'claimed',name_claimed and not blocked) from public.am_players where id=public.aa_player_id() and auth.uid() is not null; $$;
create or replace function public.aa_lobby(p_available boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=public.aa_player_id(); begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 if not exists(select 1 from public.am_players where id=who and name_claimed and not blocked) then raise exception 'Tilknyt din Almind Games-profil først'; end if;
 insert into public.aa_presence(player_id,seen_at,available) values(who,now(),coalesce(p_available,false)) on conflict(player_id) do update set seen_at=excluded.seen_at,available=excluded.available;
 return jsonb_build_object('players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.nickname) order by p.nickname) from public.aa_presence s join public.am_players p on p.id=s.player_id where s.seen_at>now()-interval '30 seconds' and s.available and p.name_claimed and not p.blocked and p.id<>who),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',p.nickname,'incoming',i.recipient=who,'status',i.status,'code',i.code) order by i.created_at desc) from public.aa_invitations i join public.am_players p on p.id=case when i.recipient=who then i.sender else i.recipient end where who in(i.sender,i.recipient) and i.expires_at>now() and i.status in('pending','accepted')),'[]'::jsonb),
 'pairing',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'digits',r.digits) order by r.created_at) from public.aa_pair_requests r where r.player_id=who and r.device_id<>auth.uid() and r.status='pending' and r.expires_at>now()),'[]'::jsonb));
end $$;
create or replace function public.aa_invite(p_player uuid,p_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=public.aa_player_id(); state jsonb; invitation uuid; begin
 if auth.uid() is null or p_player is null or p_player=who then raise exception 'Vælg en anden spiller'; end if;
 perform pg_advisory_xact_lock(hashtextextended('aa-invite:'||who::text,0));
 if not exists(select 1 from public.aa_presence s join public.am_players p on p.id=s.player_id where p.id=p_player and s.available and s.seen_at>now()-interval '30 seconds' and p.name_claimed and not p.blocked) then raise exception 'Spilleren er ikke længere klar'; end if;
 if exists(select 1 from public.aa_invitations where sender=who and status='pending' and expires_at>now()) then raise exception 'Du har allerede en invitation ude. Vent på svar.'; end if;
 state:=public.aa_host(p_mode);
 insert into public.aa_invitations(sender,recipient,code) values(who,p_player,state->>'code') returning id into invitation;
 return jsonb_build_object('id',invitation);
end $$;
create or replace function public.aa_reply(p_invite uuid,p_accept boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=public.aa_player_id(); i public.aa_invitations; begin
 select * into i from public.aa_invitations where id=p_invite for update;
 if auth.uid() is null or not found or i.recipient is distinct from who or i.expires_at<=now() or i.status<>'pending' then raise exception 'Invitationen er udløbet'; end if;
 if not coalesce(p_accept,false) then update public.aa_invitations set status='declined' where id=i.id; return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('aa-accept:'||least(i.sender::text,i.recipient::text),0));
 perform pg_advisory_xact_lock(hashtextextended('aa-accept:'||greatest(i.sender::text,i.recipient::text),0));
 if (select count(*) from public.aa_presence s join public.am_players p on p.id=s.player_id where s.player_id in(i.sender,i.recipient) and s.available and s.seen_at>now()-interval '30 seconds' and p.name_claimed and not p.blocked)<>2 then raise exception 'En af spillerne er ikke længere klar'; end if;
 perform public.aa_join(i.code);
 update public.aa_invitations set status='accepted' where id=i.id;
 update public.aa_presence set available=false where player_id in(i.sender,i.recipient);
 update public.aa_invitations set status='declined' where id<>i.id and status='pending' and (sender in(i.sender,i.recipient) or recipient in(i.sender,i.recipient));
 return public.aa_state(i.code);
end $$;
create or replace function public.aa_pair_start(p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; r public.aa_pair_requests; begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('aa-pair:'||auth.uid()::text,0));
 if (select count(*) from public.aa_pair_requests where device_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then raise exception 'For mange anmodninger. Prøv senere.'; end if;
 select id into target from public.am_players where public.am_name_key(nickname)=public.am_name_key(p_name) and name_claimed and not blocked;
 if target is null then raise exception 'Profilen blev ikke fundet. Opret nye profiler i Almind Merge.'; end if;
 update public.aa_pair_requests set status='cancelled' where device_id=auth.uid() and status='pending';
 insert into public.aa_pair_requests(device_id,player_id,digits) values(auth.uid(),target,lpad(floor(random()*100)::integer::text,2,'0')) returning * into r;
 return jsonb_build_object('id',r.id,'digits',r.digits);
end $$;
create or replace function public.aa_pair_status(p_request uuid) returns text language sql stable security definer set search_path='' as $$ select case when expires_at<=now() then 'expired' else status end from public.aa_pair_requests where id=p_request and device_id=auth.uid(); $$;
create or replace function public.aa_pair_reply(p_request uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare r public.aa_pair_requests; who uuid:=public.aa_player_id(); begin
 select * into r from public.aa_pair_requests where id=p_request for update;
 if auth.uid() is null or not found or r.player_id is distinct from who or r.device_id=auth.uid() or r.status<>'pending' or r.expires_at<=now() then raise exception 'Anmodningen er udløbet'; end if;
 if not exists(select 1 from public.am_players where id=who and name_claimed and not blocked) then raise exception 'Profilen er ikke tilgængelig'; end if;
 if coalesce(p_accept,false) then insert into public.aa_device_profiles(device_id,player_id) values(r.device_id,r.player_id) on conflict(device_id) do update set player_id=excluded.player_id; end if;
 update public.aa_pair_requests set status=case when coalesce(p_accept,false) then 'approved' else 'declined' end where id=r.id;
end $$;
revoke all on function public.aa_profile(),public.aa_lobby(boolean),public.aa_invite(uuid,text),public.aa_reply(uuid,boolean),public.aa_pair_start(text),public.aa_pair_status(uuid),public.aa_pair_reply(uuid,boolean) from public,anon;
grant execute on function public.aa_profile(),public.aa_lobby(boolean),public.aa_invite(uuid,text),public.aa_reply(uuid,boolean),public.aa_pair_start(text),public.aa_pair_status(uuid),public.aa_pair_reply(uuid,boolean) to authenticated;
commit;
