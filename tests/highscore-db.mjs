const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
await db.exec(await fs.readFile(new URL('../supabase/migrations/202610140001_highscores.sql',import.meta.url),'utf8'));
const who='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';await db.query('insert into auth.users values($1),($2)',[who,other]);
const as=async uid=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');};await as(who);
const id=(await db.query('select public.am_start_round() as id')).rows[0].id;
const good=[['d',0,0],['d',0,500],['m',0,700]];
assert.equal((await db.query('select public.am_submit_round($1,$2,$3,$4) as score',[id,'Thomas',JSON.stringify(good),800])).rows[0].score,8);
assert.equal((await db.query('select public.am_submit_round($1,$2,$3,$4) as score',[id,'Changed','[]',900])).rows[0].score,8);
let board=(await db.query("select * from public.am_leaderboard('week')")).rows;assert.equal(board[0].nickname,'Thomas');assert.equal(board[0].is_me,true);assert.equal(board.length,1);
await assert.rejects(db.query("insert into public.am_rounds(player_id) values($1)",[who]));await assert.rejects(db.query('select * from public.am_players'));
await as(other);await assert.rejects(db.query('select public.am_submit_round($1,$2,$3,$4)',[id,'Other',JSON.stringify(good),800]));
for(const [name,events,duration] of [['merge without tiles',[['m',9,0]],1],['invalid first drop',[['d',2,0]],1],['fast drops',[['d',0,0],['d',0,100]],200],['extra remove',[['d',0,0],['d',0,500],['r',0,600],['r',0,700]],800],['negative time',[['d',0,-1]],1],['future',[['d',0,0]],50000]]){
 const ticket=(await db.query('select public.am_start_round() as id')).rows[0].id;await assert.rejects(db.query('select public.am_submit_round($1,$2,$3,$4)',[ticket,'Other',JSON.stringify(events),duration]),name);
}
await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");assert.equal((await db.query("select * from public.am_leaderboard('all')")).rows[0].is_me,false);await assert.rejects(db.query('select public.am_start_round()'));
await db.exec('reset role');await db.query('update public.am_rounds set hidden=true where id=$1',[id]);assert.equal((await db.query("select * from public.am_leaderboard('all')")).rows.length,0);
console.log('PASS real Postgres migration, scoring, idempotency, ownership, RLS, public read, invalid logs and moderation');await db.close();
