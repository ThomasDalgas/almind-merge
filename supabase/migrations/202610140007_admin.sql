-- AlmindGames admin. Repeat-safe; never grants rights to game profiles automatically.
begin;
create table if not exists public.ag_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.ag_admin_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null,
 player_id uuid not null,
 action text not null,
 before_state jsonb not null,
 after_state jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists ag_admin_audit_player on public.ag_admin_audit(player_id,id desc);
create table if not exists public.ag_games (
 slug text primary key,title text not null,path text not null,enabled boolean not null default true
);
insert into public.ag_games(slug,title,path) values('almind-merge','Almind-Merge','/') on conflict(slug) do nothing;
alter table public.ag_admins enable row level security;
alter table public.ag_admin_audit enable row level security;
alter table public.ag_games enable row level security;
revoke all on public.ag_admins,public.ag_admin_audit,public.ag_games from public,anon,authenticated;
revoke all on sequence public.ag_admin_audit_id_seq from public,anon,authenticated;
alter table public.am_players add column if not exists admin_revision bigint not null default 0;

create or replace function public.ag_bump_player_revision() returns trigger
language plpgsql set search_path='' as $$
begin new.admin_revision:=old.admin_revision+1;return new;end $$;
revoke all on function public.ag_bump_player_revision() from public,anon,authenticated;
drop trigger if exists ag_player_revision on public.am_players;
create trigger ag_player_revision before update on public.am_players for each row execute function public.ag_bump_player_revision();

create or replace function public.ag_require_admin() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare who uuid:=auth.uid();
begin
 if who is null or not exists(
  select 1 from public.ag_admins a join auth.users u on u.id=a.user_id
  where a.user_id=who and a.enabled and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,true)
 ) then raise exception 'Administratoradgang kræves.' using errcode='42501';end if;
 return who;
end $$;
revoke all on function public.ag_require_admin() from public,anon,authenticated;

create or replace function public.ag_admin_me() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid:=public.ag_require_admin();
begin return jsonb_build_object('email',(select email from auth.users where id=who),
 'games',(select jsonb_agg(g order by g.title) from public.ag_games g where enabled));end $$;

create or replace function public.ag_admin_players(p_search text default '',p_status text default 'active',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total integer;
begin
 perform public.ag_require_admin();
 if p_status is null or p_status not in ('active','archived','all') or p_offset is null or p_offset<0 or p_offset>100000 or char_length(coalesce(p_search,''))>100 then raise exception 'Ugyldig søgning.';end if;
 select count(*) into total from public.am_players p
 where (p_status='all' or (p_status='archived')=p.blocked)
 and strpos(public.am_name_key(p.nickname),public.am_name_key(coalesce(p_search,'')))>0;
 select coalesce(jsonb_agg(x order by x.nickname,x.id),'[]'::jsonb) into result from (
  select p.id,p.nickname,p.blocked,p.name_claimed,p.admin_revision,
   coalesce((select max(score) from public.am_rounds r where r.player_id=p.id and not r.hidden and r.saved_at is not null),0) as best,
   (select max(started_at) from public.am_rounds r where r.player_id=p.id) as last_played
  from public.am_players p where (p_status='all' or (p_status='archived')=p.blocked)
   and strpos(public.am_name_key(p.nickname),public.am_name_key(coalesce(p_search,'')))>0
  order by p.nickname,p.id limit 25 offset p_offset
 ) x;
 return jsonb_build_object('players',result,'total',total);
end $$;

create or replace function public.ag_admin_player(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.am_players; rounds jsonb; history jsonb; devices integer;
begin
 perform public.ag_require_admin();
 select * into p from public.am_players where id=p_player;
 if not found then raise exception 'Spilleren findes ikke.';end if;
 select count(*) into devices from (
  select p.id as device_id where not exists(select 1 from public.am_player_devices where device_id=p.id)
  union select device_id from public.am_player_devices where player_id=p.id
 ) d;
 select coalesce(jsonb_agg(x order by x.started_at desc),'[]'::jsonb) into rounds from (
  select id,started_at,score,hidden,saved_at,finished_at from public.am_rounds where player_id=p.id order by started_at desc,id limit 20
 ) x;
 select coalesce(jsonb_agg(x order by x.id desc),'[]'::jsonb) into history from (
  select id,action,before_state,after_state,created_at from public.ag_admin_audit where player_id=p.id order by id desc limit 20
 ) x;
 return jsonb_build_object('player',to_jsonb(p),'devices',devices,'rounds',rounds,'history',history,
  'best',coalesce((select max(score) from public.am_rounds where player_id=p.id and not hidden and saved_at is not null),0),
  'has_code',exists(select 1 from public.am_player_codes where player_id=p.id));
end $$;

create or replace function public.ag_admin_update_player(p_player uuid,p_action text,p_expected_revision bigint,p_name text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.ag_require_admin(); old_p public.am_players; new_p public.am_players; nick text; code text;
begin
 if p_action is null or p_action not in ('rename','archive','restore','reset_code') then raise exception 'Ukendt handling.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_player::text,0));
 select * into old_p from public.am_players where id=p_player for update;
 if not found then raise exception 'Spilleren findes ikke.';end if;
 if p_expected_revision is distinct from old_p.admin_revision then raise exception 'Spilleren er ændret siden sidst. Opdater og prøv igen.';end if;
 if p_action='rename' then
  nick:=regexp_replace(btrim(p_name),'[[:space:]]+',' ','g');
  if nick is null or char_length(nick) not between 2 and 20 or nick !~ '^[[:alnum:] _-]+$' then raise exception 'Brug 2–20 bogstaver, tal, mellemrum, _ eller -.';end if;
  update public.am_players set nickname=nick,name_claimed=not blocked where id=p_player;
  update public.am_live_sessions set nickname=nick where player_id=p_player;
 elsif p_action='archive' then
  if old_p.blocked then raise exception 'Spilleren er allerede slettet fra spillet.';end if;
  update public.am_players set blocked=true,name_claimed=false where id=p_player;
  delete from public.am_player_codes where player_id=p_player;
  delete from public.am_live_sessions where player_id=p_player;
 elsif p_action='restore' then
  if not old_p.blocked then raise exception 'Spilleren er allerede aktiv.';end if;
  update public.am_players set blocked=false,name_claimed=true where id=p_player;
 elsif p_action='reset_code' then
  if old_p.blocked or not old_p.name_claimed then raise exception 'Spilleren skal være aktiv og have et ledigt navn.';end if;
  code:=upper(left(replace(gen_random_uuid()::text,'-',''),10));
  insert into public.am_player_codes(player_id,code_hash,changed_at)
   values(p_player,encode(sha256(convert_to(code,'UTF8')),'hex'),now())
   on conflict(player_id) do update set code_hash=excluded.code_hash,changed_at=excluded.changed_at;
  update public.am_players set admin_revision=admin_revision+1 where id=p_player;
 end if;
 select * into new_p from public.am_players where id=p_player;
 insert into public.ag_admin_audit(actor_id,player_id,action,before_state,after_state)
  values(actor,p_player,p_action,to_jsonb(old_p),to_jsonb(new_p));
 return jsonb_build_object('player',to_jsonb(new_p),'code',case when code is not null then left(code,5)||'-'||right(code,5) end);
 exception when unique_violation then raise exception 'Navnet er allerede i brug af en aktiv profil.';
end $$;

revoke all on function public.ag_admin_me(),public.ag_admin_players(text,text,integer),public.ag_admin_player(uuid),public.ag_admin_update_player(uuid,text,bigint,text) from public,anon;
grant execute on function public.ag_admin_me(),public.ag_admin_players(text,text,integer),public.ag_admin_player(uuid),public.ag_admin_update_player(uuid,text,bigint,text) to authenticated;
commit;
