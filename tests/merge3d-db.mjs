const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table public.am_players(id uuid primary key references auth.users(id),nickname text,name_claimed boolean default true,blocked boolean default false);create table public.am_player_devices(device_id uuid primary key,player_id uuid);create function public.am_player_id() returns uuid language sql stable security definer set search_path='' as $$select coalesce((select player_id from public.am_player_devices where device_id=auth.uid()),auth.uid())$$;revoke all on function public.am_player_id() from public;`);
await db.exec(await fs.readFile(new URL('../supabase/migrations/202610190001_merge3d_scores.sql',import.meta.url),'utf8'));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
await db.query('insert into auth.users values($1),($2),($3)',[a,b,c]);await db.query("insert into am_players(id,nickname) values($1,'Player A'),($2,'Player B')",[a,b]);await db.query('insert into am_player_devices values($1,$2)',[c,a]);
async function as(uid){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec(uid?'set role authenticated':'set role anon')}
const save=(id,profile,events,final=false)=>db.query('select public.am3d_save_round($1,$2,$3,$4,$5) as score',[id,profile,JSON.stringify(events),Math.max(1,events.at(-1)?.[2]||0),final]);
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';await as(a);
assert.equal((await save(id,a,[['d',0,0]])).rows[0].score,2);
const events=[['d',0,0],['d',0,500],['m',0,700]];assert.equal((await save(id,a,events,true)).rows[0].score,8);assert.equal((await save(id,a,events,true)).rows[0].score,8);
await assert.rejects(db.query('select * from am3d_rounds'));
await as(c);let list=(await db.query("select * from am3d_leaderboard('all')")).rows;assert.equal(list[0].score,8);assert.equal(list[0].is_me,true);await assert.rejects(save(id,a,events));
await as(b);assert.equal((await db.query("select * from am3d_leaderboard('all')")).rows[0].is_me,false);await assert.rejects(save(crypto.randomUUID(),a,events));
await assert.rejects(save(crypto.randomUUID(),b,[['m',12,1]]));await assert.rejects(save(crypto.randomUUID(),b,[['d',5,0]]));await assert.rejects(save(crypto.randomUUID(),b,[['d',0,0],['d',0,100]]));
const pending=crypto.randomUUID();await save(pending,b,[['d',0,0]]);await assert.rejects(save(pending,b,[['d',0,10],['d',0,500]]));
// Full 13-tier run, including two terminal Svend pieces clearing for 10,000.
const big=[];for(let i=0;i<8192;i++)big.push(['d',0,i*500]);let t=4096000;for(let tier=0;tier<=12;tier++)for(let i=0;i<8192/(2**(tier+1));i++)big.push(['m',tier,t++]);assert.equal((await save(crypto.randomUUID(),b,big,true)).rows[0].score,222992);
await as('');assert.equal((await db.query("select * from am3d_leaderboard('all')")).rows.length,2);await assert.rejects(save(crypto.randomUUID(),a,events));
await db.exec('reset role');await db.query('update am_players set blocked=true where id=$1',[b]);await as('');assert.equal((await db.query("select * from am3d_leaderboard('all')")).rows.length,1);
console.log('PASS: 13 tiers, Svend bonus, checkpoints, idempotency, RLS, profile linking across devices, wrong-profile rejection, invalid events and moderation');await db.close();
