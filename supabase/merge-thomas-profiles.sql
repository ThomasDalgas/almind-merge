-- Superseded at the user's request: do NOT merge the profiles.
-- Use rename-thomasmac.sql to remove the lower profile and rename ThomasMac.
do $$ begin
 raise exception 'Sammenlægningen er annulleret. Brug rename-thomasmac.sql i stedet.';
end $$;
