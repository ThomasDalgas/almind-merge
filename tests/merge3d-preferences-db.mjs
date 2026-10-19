const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table am_players(id uuid primary key,name_claimed boolean default true,blocked boolean default false);create table am_player_devices(device_id uuid primary key,player_id uuid);create function am_player_id() returns uuid language sql stable security definer set search_path='' as $$select coalesce((select player_id from public.am_player_devices where device_id=auth.uid()),auth.uid())$$;`);
await db.exec(await fs.readFile(new URL('../supabase/migrations/202610190002_merge3d_preferences.sql',import.meta.url),'utf8'));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
await db.query('insert into am_players(id) values($1),($2)',[a,b]);await db.query('insert into am_player_devices values($1,$2)',[c,a]);
async function as(uid){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec(uid?'set role authenticated':'set role anon')}
const prefs=async(id,patch=null,seed=false)=>(await db.query('select am3d_settings($1,$2,$3) as value',[id,patch===null?null:JSON.stringify(patch),seed])).rows[0].value;
await as(a);assert.deepEqual(await prefs(a),{});await prefs(a,{sound_enabled:false,aim_sensitivity:2});
await assert.rejects(db.query('select * from am3d_preferences'));
await as(c);assert.deepEqual(await prefs(a),{sound_enabled:false,aim_sensitivity:2});
await prefs(a,{sound_enabled:true},true);assert.equal((await prefs(a)).sound_enabled,false);
await prefs(a,{invert_vertical_view:true});assert.equal((await prefs(a)).aim_sensitivity,2);
await assert.rejects(prefs(b,{sound_enabled:true}));
for(const patch of [{unknown:true},{aim_sensitivity:4},{aim_sensitivity:'2'},{touch_mode:3},{sound_enabled:null},[]])await assert.rejects(prefs(a,patch));
await as(b);assert.deepEqual(await prefs(b),{});await assert.rejects(prefs(a));
await as('');await assert.rejects(prefs(a));
console.log('PASS: linked devices, isolated profiles, patch merge, safe seed, RLS and input validation');await db.close();
