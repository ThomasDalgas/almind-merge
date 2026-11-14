import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now(),is_anonymous boolean default false);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for(const f of (await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
const id='00000000-0000-4000-8000-000000000001';await db.query('insert into auth.users(id) values($1)',[id]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');await db.query("select public.am_claim_name('Thomas')");
const ticket=(await db.query('select public.am_start_round() as id')).rows[0].id;
await db.exec('reset role');await db.query("update public.am_rounds set started_at=now()-interval '48 days' where id=$1",[ticket]);await db.exec('set role authenticated');
const save=async(events,mode,ms)=>{const {rows}=await db.query("select public.am_save_round_logged($1,'Thomas',$2,$3,$4,'1.2.2',$5) as score",[ticket,JSON.stringify(events),ms,mode,mode==='gameover']);return rows[0].score;};
const boards=async()=>Promise.all(['week','all'].map(async(scope)=>(await db.query("select nickname,score,duration_ms from public.am_leaderboard_v2($1)",[scope])).rows));
const events=[],stamp=()=>drops*500;let drops=0,expected=0;
const batch=()=>{for(let i=0;i<2048;i++){events.push(['d',0,stamp(),stamp(),0,0]);expected+=2;drops++;}let parents=Array(2048).fill(0);
 for(let tier=0;tier<11;tier++){const next=[];for(let i=0;i<parents.length;i+=2){events.push([tier===10?'b':'m',tier,stamp(),stamp(),parents[i],parents[i+1]]);next.push(events.length);expected+=tier===10?10000:2**(tier+2)*Math.min(tier+1,5);}parents=next;}};

const rpc=async(offset,chunk,kind='part',duration=stamp())=>(await db.query('select public.am_stream_round($1,$2,$3,$4,$5,$6,$7) as v',[ticket,offset,JSON.stringify(chunk),Math.max(1,duration),kind,'1.4.0',kind==='gameover'])).rows[0].v;
for(let i=0;i<26;i++)batch(); // 106,470 events; CHAIN continuation spans batches.
const big=2**31+12345;for(const e of events){e[2]+=big;e[3]+=big;}
const duration=big+stamp(),total=events.length;
const probe=()=>rpc(0,[],'part',duration);
assert.equal((await probe()).cursor,0);
await assert.rejects(rpc(1,[]),/offset/);
let offset=0;
while(offset<total){
 const chunk=events.slice(offset,offset+1024);
 const result=await rpc(offset,chunk,'part',duration);
 assert.equal(result.cursor,offset+chunk.length);
 if(offset===0){assert.equal((await rpc(0,chunk,'part',duration)).cursor,1024);assert.equal((await probe()).cursor,1024);assert.deepEqual(await boards(),[[],[]]);}
 offset=result.cursor;
}
await assert.rejects(rpc(offset,[['m',0,duration,duration,1,2]],'checkpoint',duration),/Invalid chain parent/);
assert.equal((await probe()).cursor,total);assert.deepEqual(await boards(),[[],[]]);
const checkpoint=await rpc(offset,[],'checkpoint',duration);
assert.equal(checkpoint.score,expected);assert.equal(checkpoint.finished,false);assert.deepEqual(await boards(),[[],[]]);
const final=await rpc(offset,[],'gameover',duration);
assert.equal(final.score,expected);assert.equal(final.finished,true);
assert.deepEqual((await boards()).map(rows=>rows.map(r=>r.score)),[[expected],[expected]]);assert.deepEqual(await rpc(offset,[],'gameover',duration),final);
await assert.rejects(db.query('select * from public.am_stream_state'),/permission denied/);
await db.exec('reset role;set role anon');await assert.rejects(probe(),/permission denied/);
console.log('PASS',total,'events; bigint timer; chain ancestry and retries; rollback; unchanged lists until Game Over:',expected);
await db.close();
