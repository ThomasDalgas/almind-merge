-- Run in the EXISTING Almind Merge Supabase project after the player-code migration.
-- Uses am_player_id() so linked devices share one family profile.
begin;
create table if not exists public.aa_matches (
 id uuid primary key default gen_random_uuid(),
 code text unique not null,
 host uuid not null references public.am_players(id),
 guest uuid references public.am_players(id),
 seed bigint not null,
 mode text not null check(mode in ('basic','standard','greedy')),
 shots jsonb not null default '[]'::jsonb,
 version integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists aa_matches_updated on public.aa_matches(updated_at);
alter table public.aa_matches enable row level security;
revoke all on public.aa_matches from public,anon,authenticated;
create or replace function public.aa_state(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.aa_matches; who uuid:=public.am_player_id();
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 select * into m from public.aa_matches where code=upper(btrim(p_code));
 if not found or who not in (m.host,m.guest) then raise exception 'Kamp ikke fundet'; end if;
 return jsonb_build_object('code',m.code,'seed',m.seed,'mode',m.mode,'shots',m.shots,'version',m.version,'seat',case when who=m.host then 0 else 1 end,'ready',m.guest is not null,'host_name',(select nickname from public.am_players where id=m.host),'guest_name',(select nickname from public.am_players where id=m.guest));
end $$;
create or replace function public.aa_host(p_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=public.am_player_id(); c text; m public.aa_matches;
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 if p_mode not in ('basic','standard','greedy') then raise exception 'Ugyldig pointmodel'; end if;
 if not exists(select 1 from public.am_players where id=who and name_claimed and not blocked) then raise exception 'Vælg et spillernavn først'; end if;
 if (select count(*) from public.aa_matches where host=who and created_at>now()-interval '1 hour')>=20 then raise exception 'For mange kampe'; end if;
 loop
  c:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  begin insert into public.aa_matches(code,host,seed,mode) values(c,who,floor(random()*4294967296)::bigint,p_mode) returning * into m; exit;
  exception when unique_violation then null; end;
 end loop;
 return public.aa_state(c);
end $$;
create or replace function public.aa_join(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=public.am_player_id(); m public.aa_matches; c text:=upper(btrim(p_code));
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 if not exists(select 1 from public.am_players where id=who and name_claimed and not blocked) then raise exception 'Vælg et spillernavn først'; end if;
 select * into m from public.aa_matches where code=c for update;
 if not found then raise exception 'Kampkode ikke fundet'; end if;
 if m.host=who then return public.aa_state(c); end if;
 if m.guest is not null and m.guest<>who then raise exception 'Kampen er fuld'; end if;
 if m.created_at<now()-interval '24 hours' then raise exception 'Kampen er udløbet'; end if;
 update public.aa_matches set guest=who,updated_at=now() where id=m.id and guest is null;
 return public.aa_state(c);
end $$;
create or replace function public.aa_fire(p_code text,p_version integer,p_angle integer,p_power integer,p_weapon text) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=public.am_player_id(); m public.aa_matches; seat integer;
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 select * into m from public.aa_matches where code=upper(btrim(p_code)) for update;
 if not found or m.guest is null or who not in (m.host,m.guest) then raise exception 'Kamp ikke klar'; end if;
 if m.created_at<now()-interval '24 hours' then raise exception 'Kampen er udløbet'; end if;
 if p_version<>m.version then raise exception 'Kampen er ændret. Prøv igen.'; end if;
 seat:=case when who=m.host then 0 else 1 end;
 if seat<>m.version%2 then raise exception 'Det er ikke din tur'; end if;
 if p_angle not between 5 and 85 or p_power not between 10 and 100 or p_weapon not in ('shell','heavy','cluster') then raise exception 'Ugyldigt skud'; end if;
 if m.version>=200 then raise exception 'Kampen er afsluttet'; end if;
 update public.aa_matches set shots=shots||jsonb_build_array(jsonb_build_object('angle',p_angle,'power',p_power,'weapon',p_weapon)),version=version+1,updated_at=now() where id=m.id;
 return public.aa_state(m.code);
end $$;
revoke all on function public.aa_state(text),public.aa_host(text),public.aa_join(text),public.aa_fire(text,integer,integer,integer,text) from public,anon;
grant execute on function public.aa_state(text),public.aa_host(text),public.aa_join(text),public.aa_fire(text,integer,integer,integer,text) to authenticated;
commit;
