import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now(),is_anonymous boolean default false);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for(const f of (await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
const id='00000000-0000-4000-8000-000000000001';await db.query('insert into auth.users(id) values($1)',[id]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');await db.query("select public.am_claim_name('Thomas')");
const ticket=(await db.query('select public.am_start_round() as id')).rows[0].id;
await db.exec('reset role');await db.query("update public.am_rounds set started_at=now()-interval '48 days' where id=$1",[ticket]);await db.exec('set role authenticated');



const ev=(k,t,stamp)=>[k,t,stamp,stamp,0,0];
const full=async(round,events,final=false)=>(await db.query("select public.am_save_round_logged($1,'Thomas',$2,3000,$3,'1.6.0',$4) as score",[round,JSON.stringify(events),final?'gameover':'checkpoint',final])).rows[0].score;
const stream=async(round,offset,events,kind='part')=>(await db.query("select public.am_stream_round($1,$2,$3,3000,$4,'1.6.0',false) as receipt",[round,offset,JSON.stringify(events),kind])).rows[0].receipt;
const start=async()=>{const r=(await db.query('select public.am_start_round() as id')).rows[0].id;await db.exec('reset role');await db.query("update public.am_rounds set started_at=now()-interval '1 hour' where id=$1",[r]);await db.exec('set role authenticated');return r;};
const prefix=[ev('d',0,0),ev('s',0,100),ev('s',0,200)];
await assert.rejects(full(ticket,prefix),/Invalid shake/);
await assert.rejects(stream(ticket,0,prefix),/Invalid shake/);
const events=[ev('d',0,0),ev('u',0,10),ev('s',0,100),ev('s',0,200),ev('s',0,300),ev('d',0,500),ev('r',0,600),ev('r',0,700)];
assert.equal(await full(ticket,events),4);
await assert.rejects(full(ticket,[...events,ev('r',0,800)]),/Invalid untracked tile|Invalid removal/);
await assert.rejects(full(ticket,[...events,ev('s',0,800)]),/Invalid shake/);
await assert.rejects(full(ticket,[ev('d',0,0),ev('u',1,10)]),/Invalid power activation/);
await assert.rejects(full(ticket,[ev('d',0,0),['u',0,10,10,1,0]]),/Invalid chain references/);
assert.equal(await full(ticket,events,true),4);
assert.equal((await db.query("select score from public.am_leaderboard_v2('all')")).rows[0].score,4);
const second=await start();
assert.equal((await stream(second,0,events.slice(0,2))).cursor,2);
assert.equal((await stream(second,2,events.slice(2,5))).cursor,5);
assert.equal((await stream(second,5,events.slice(5),'submit')).score,4);
await db.exec('reset role');
const state=(await db.query('select unlimited_powers,shakes,removals,used_shakes,used_removals from public.am_stream_state where round_id=$1',[second])).rows[0];
assert.deepEqual(state,{unlimited_powers:true,shakes:1,removals:1,used_shakes:3,used_removals:2});
await db.exec('set role authenticated');
const third=await start();await assert.rejects(stream(third,0,prefix),/Invalid shake/);
await assert.rejects(db.query("select public.am_replay_stream_private($1,0,'[]',1,'part','1.6.0',false)",[third]),/permission denied/);
console.log('PASS full and chunked power activation, stock isolation, inventory checks, valid highscore, private replay');
await db.close();
