import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now(),is_anonymous boolean default false);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for(const f of (await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));

const id='00000000-0000-4000-8000-000000000001';await db.query('insert into auth.users(id) values($1)',[id]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');await db.query("select public.am_claim_name('Thomas')");

const start=async()=>(await db.query('select public.am_start_round() as id')).rows[0].id;
const save=(ticket,events,final)=>db.query("select public.am_save_round_logged($1,'Thomas',$2,1,$3,'1.2.2',$4)",[ticket,JSON.stringify(events),final?'gameover':'checkpoint',final]);
const scores=async(expected)=>{
 for(const fn of ['am_leaderboard','am_leaderboard_v2'])for(const scope of ['week','all']){
  const rows=(await db.query(`select score from public.${fn}($1)`,[scope])).rows;
  assert.deepEqual(rows.map(r=>r.score),expected,fn+' '+scope);
 }
};
const one=[['d',0,0]], first=await start();
await save(first,one,false);await scores([]);
await save(first,one,true);await scores([2]);
const second=await start(),two=[...one,['d',0,500],['m',0,500]];
await db.exec('reset role');await db.query("update public.am_rounds set started_at=now()-interval '1 minute' where id=$1",[second]);await db.exec('set role authenticated');
await db.query("select public.am_checkpoint_round($1,'Thomas',$2,501)",[second,JSON.stringify(two)]);await scores([2]);
await db.query("select public.am_game_over($1,'Thomas',$2,501)",[second,JSON.stringify(two)]);await scores([8]);
await db.close();console.log('PASS finished-only ranking for both lists and both RPC versions');
