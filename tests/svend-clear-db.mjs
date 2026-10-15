import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for(const f of (await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
const id='00000000-0000-4000-8000-000000000001';await db.query('insert into auth.users values($1)',[id]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');await db.query("select public.am_claim_name('Svendtest')");const ticket=(await db.query('select public.am_start_round() as id')).rows[0].id;
await db.exec('reset role');await db.query("update public.am_rounds set started_at=now()-interval '20 minutes' where id=$1",[ticket]);await db.exec('set role authenticated');
const inventory=Array(11).fill(0),events=[];let score=0;
for(let i=0;i<2048;i++){
 const t=i*500;events.push(['d',0,t]);inventory[0]++;score+=2;
 for(let tier=0;tier<10&&inventory[tier]>=2;tier++){events.push(['m',tier,t]);inventory[tier]-=2;inventory[tier+1]++;score+=2**(tier+2);}
}
assert.equal(inventory[10],2);const stamp=2048*500;
const save=async es=>(await db.query("select public.am_checkpoint_round($1,'Svendtest',$2,$3) as score",[ticket,JSON.stringify(es),stamp+500])).rows[0].score;
assert.equal(await save(events),score);const cleared=[...events,['m',10,stamp]];assert.equal(await save(cleared),score);
await assert.rejects(save([...cleared,['m',10,stamp]]),/Invalid merge/);
assert.equal(await save([...cleared,['d',0,stamp+500]]),score+2,'play and autosave continue after both Svend disappear');
assert.equal((await db.query("select * from public.am_leaderboard('all')")).rows[0].max_tier,10);
const bonus=[...events,['b',10,stamp]];assert.equal(await save(bonus),score+10000);await assert.rejects(save([...bonus,['b',10,stamp]]),/Invalid Svend bonus/);await assert.rejects(save([...events,['b',9,stamp]]),/Invalid Svend bonus/);assert.equal(await save([...bonus,['d',0,stamp+500]]),score+10002);
console.log('PASS bonus validated, malformed/repeated bonus refused; full legal ledger reaches two Svend, clears once, no invented tier/points, rejects repeat clear, continues scoring');await db.close();
