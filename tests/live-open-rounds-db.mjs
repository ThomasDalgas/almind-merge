import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now(),is_anonymous boolean default false);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for(const f of (await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
const id='00000000-0000-4000-8000-000000000001';await db.query('insert into auth.users(id) values($1)',[id]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');await db.query("select public.am_claim_name('Thomas')");
const ticket=(await db.query('select public.am_start_round() as id')).rows[0].id;
await db.exec('reset role');await db.query("update public.am_rounds set started_at=now()-interval '48 days' where id=$1",[ticket]);await db.exec('set role authenticated');


const live=async(active)=>(await db.query("select public.am_live_update($1,'Thomas',42,1,$2) as result",[ticket,active])).rows[0].result.players;
assert.equal((await live(true))[0].score,42);
assert.equal((await live(false)).length,0);
assert.equal((await live(true)).length,1);
for(const change of ['hidden=true','hidden=false,finished_at=now()']){
 await db.exec('reset role');await db.query('update public.am_rounds set '+change+' where id=$1',[ticket]);await db.exec('set role authenticated');
 await assert.rejects(live(true),/Round unavailable/);
}
await db.close();console.log('PASS 48-day open round live, pause, resume, hidden and finished');
