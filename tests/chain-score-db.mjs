import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now(),is_anonymous boolean default false);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for(const f of (await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
const id='00000000-0000-4000-8000-000000000001';await db.query('insert into auth.users(id) values($1)',[id]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');await db.query("select public.am_claim_name('Thomas')");
const fresh=async()=>{const {rows:[{id}]}=await db.query('select public.am_start_round() as id');await db.exec('reset role');await db.query("update public.am_rounds set started_at=now()-interval '3 hours' where id=$1",[id]);await db.exec('set role authenticated');return id;};
const save=async(log,id=null,kind='checkpoint')=>{
 id??=await fresh();const duration=Math.max(log.at(-1)[2],1);
 const {rows:[{score}]}=await db.query("select public.am_save_round_logged($1,'Thomas',$2,$3,$4,'1.2.0',false) as score",[id,JSON.stringify(log),duration,kind]);return score;
};
const d=(t)=>['d',0,t,t,0,0],m=(tier,t,a,b)=>['m',tier,t,t,a,b];
const first=[d(0),d(500),d(1000),d(1500),m(0,1500,0,0),m(0,1500,0,0)];
assert.equal(await save(first),16,'two independent merges stay at ×1');
assert.equal(await save([...first,m(1,3500,5,6)]),32,'2000ms inclusive and two live chains use max');
assert.equal(await save([...first,m(1,3501,5,6)]),24,'2001ms breaks both chains');
assert.equal(await save([...first,['m',1,9000,3500,5,6]]),32,'elapsed simulation, not wall clock, sets timeout');
await assert.rejects(save([...first,m(1,1500,5,5)]),/Invalid chain parent/);
await assert.rejects(save([...first,m(1,1500,5,0)]),/Invalid untracked/);
await assert.rejects(save([...first,m(1,1500,3,5)]),/Invalid chain parent/);
await assert.rejects(save([...first,m(1,1500,5,8)]),/Invalid chain parent/);
await assert.rejects(save([...first,['r',1,1500,1500,6,0],m(1,1500,6,5)]),/Invalid chain parent/);
await assert.rejects(save([...first,['r',1,1500,1500,0,0]]),/Invalid untracked/);
await assert.rejects(save([...first,['m',1,1500]]),/Legacy event/);
await assert.rejects(save([...first,['m',1,1501,1499,5,6]]),/Invalid simulation clock/);
await assert.rejects(save([...first,['m',1,1500,1700,5,6]]),/Invalid simulation clock/);
const legacy=first.map(e=>e.slice(0,3));
assert.equal(await save([...legacy,['m',1,1500]]),24);
assert.equal(await save([...legacy,m(1,1500,0,0)]),24,'legacy stock starts unchained');
const mixed=[...legacy,d(2000),d(2500),m(0,2500,0,0),m(1,2500,9,0)];
assert.equal(await save(mixed),40,'modern output can continue against legacy stock');
const tree=Array.from({length:2048},(_,i)=>d(i*500)), stamp=tree.at(-1)[2];
let parents=Array(2048).fill(0),expected=4096;
for(let tier=0;tier<11;tier++){
 const next=[];while(parents.length){const a=parents.pop(),b=parents.pop();tree.push([tier===10?'b':'m',tier,stamp,stamp,a,b]);next.push(tree.length);expected+=tier===10?10000:2**(tier+2)*Math.min(tier+1,5);}
 parents=next;
}
const id2=await fresh();assert.equal(await save(tree,id2),expected,'all eleven tiers, capped at ×5; two Svend pay fixed bonus');
assert.equal(await save(tree,id2,'submit'),expected,'final score equals checkpoint');
assert.equal(await save(tree,id2,'submit'),expected,'retry does not add bonus twice');
console.log('PASS chain replay, legacy/mixed journals, score cap, terminal clear, time boundaries, tamper rejection and final score');
await db.close();
