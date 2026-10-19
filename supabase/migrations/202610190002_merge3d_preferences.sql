begin;
create table if not exists public.am3d_preferences (
 player_id uuid primary key references public.am_players(id),
 settings jsonb not null default '{}', updated_at timestamptz not null default now()
);
alter table public.am3d_preferences enable row level security;
revoke all on public.am3d_preferences from public,anon,authenticated;
create or replace function public.am3d_settings(p_profile uuid,p_patch jsonb default null,p_seed boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=public.am_player_id(); result jsonb; k text; v jsonb;
begin
 if auth.uid() is null or who is null or p_profile is distinct from who then raise exception 'Spillerprofilen er skiftet'; end if;
 if not exists(select 1 from public.am_players where id=who and name_claimed and not blocked) then raise exception 'Spillerprofilen er ikke tilgængelig'; end if;
 if p_patch is not null then
  if jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>512 then raise exception 'Invalid settings'; end if;
  for k,v in select * from jsonb_each(p_patch) loop
   if k='touch_mode' then
    if v not in ('0'::jsonb,'1'::jsonb) then raise exception 'Invalid touch mode'; end if;
   elsif k='aim_sensitivity' then
    if jsonb_typeof(v)<>'number' then raise exception 'Invalid sensitivity'; end if;
    if (v::text)::numeric not between 0.5 and 3 then raise exception 'Invalid sensitivity'; end if;
   elsif k in ('sound_enabled','invert_vertical_view') then
    if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid boolean'; end if;
   else raise exception 'Unknown setting'; end if;
  end loop;
  if p_patch<>'{}'::jsonb then
   insert into public.am3d_preferences(player_id,settings) values(who,p_patch)
   on conflict(player_id) do update set
    settings=case when p_seed then am3d_preferences.settings else am3d_preferences.settings||excluded.settings end,
    updated_at=case when p_seed then am3d_preferences.updated_at else now() end;
  end if;
 end if;
 select settings into result from public.am3d_preferences where player_id=who;
 return coalesce(result,'{}'::jsonb);
end $$;
revoke all on function public.am3d_settings(uuid,jsonb,boolean) from public,anon;
grant execute on function public.am3d_settings(uuid,jsonb,boolean) to authenticated;
commit;
