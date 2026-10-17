-- Run once in the existing Almind Games Supabase SQL Editor. Existing matches are preserved.
begin;
create or replace function public.aa_state(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.aa_matches; who uuid:=public.am_player_id();
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 select * into m from public.aa_matches where code=upper(btrim(p_code));
 if not found or (who is distinct from m.host and who is distinct from m.guest) then raise exception 'Kamp ikke fundet'; end if;
 return jsonb_build_object('code',m.code,'seed',m.seed,'mode',m.mode,'shots',m.shots,'version',m.version,'seat',case when who=m.host then 0 else 1 end,'ready',m.guest is not null,'host_name',(select nickname from public.am_players where id=m.host),'guest_name',(select nickname from public.am_players where id=m.guest));
end $$;
create or replace function public.aa_fire(p_code text,p_version integer,p_angle integer,p_power integer,p_weapon text) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=public.am_player_id(); m public.aa_matches; seat integer;
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 select * into m from public.aa_matches where code=upper(btrim(p_code)) for update;
 if not found or m.guest is null or (who is distinct from m.host and who is distinct from m.guest) then raise exception 'Kamp ikke klar'; end if;
 if m.created_at<now()-interval '24 hours' then raise exception 'Kampen er udløbet'; end if;
 if p_version is null or p_version<>m.version then raise exception 'Kampen er ændret. Prøv igen.'; end if;
 seat:=case when who=m.host then 0 else 1 end;
 if seat<>m.version%2 then raise exception 'Det er ikke din tur'; end if;
 if p_angle is null or p_power is null or p_weapon is null or p_angle not between 5 and 85 or p_power not between 10 and 100 or p_weapon not in ('shell','heavy','cluster') then raise exception 'Ugyldigt skud'; end if;
 if m.version>=200 then raise exception 'Kampen er afsluttet'; end if;
 update public.aa_matches set shots=shots||jsonb_build_array(jsonb_build_object('angle',p_angle,'power',p_power,'weapon',p_weapon)),version=version+1,updated_at=now() where id=m.id;
 return public.aa_state(m.code);
end $$;
revoke all on function public.aa_state(text),public.aa_fire(text,integer,integer,integer,text) from public,anon;
grant execute on function public.aa_state(text),public.aa_fire(text,integer,integer,integer,text) to authenticated;
commit;
