import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now(),is_anonymous boolean default false);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for(const f of (await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await fs.readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
await db.exec(await fs.readFile(new URL('../supabase/migrations/202610180001_merge_round_log.sql',import.meta.url),'utf8'));
const id='00000000-0000-4000-8000-000000000001';await db.query('insert into auth.users(id) values($1)',[id]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');await db.query("select public.am_claim_name('Thomas')");
const ticket=(await db.query('select public.am_start_round() as id')).rows[0].id;
await db.exec('reset role');await db.query("update public.am_rounds set started_at=now()-interval '1 hour' where id=$1",[ticket]);await db.exec('set role authenticated');
const events=[['d',0,0],['s',0,0],['r',0,0]],inv=Array(11).fill(0);let stamp=0;
for(let i=0;i<2048;i++){stamp+=500;events.push(['d',0,stamp]);inv[0]++;for(let tier=0;tier<11&&inv[tier]>=2;tier++){inv[tier]-=2;events.push([tier===10?'b':'m',tier,stamp]);if(tier<10)inv[tier+1]++;}}
const save=(kind='checkpoint',version='1.1.4',gameOver=false,log=events)=>db.query("select public.am_save_round_logged($1,'Thomas',$2,$3,$4,$5,$6)",[ticket,JSON.stringify(log),stamp+1,kind,version,gameOver]);
await save();
async function row(){await db.exec('reset role');const r=(await db.query('select score,round_log from public.am_rounds where id=$1',[ticket])).rows[0];await db.exec('set role authenticated');return r;}
let r=await row();assert.deepEqual(r.round_log,{drops:2049,merges:2047,svend_pairs:1,shakes:1,removals:1,version:'1.1.4',outcome:'unfinished'});
await save();assert.deepEqual(await row(),r,'retry replaces totals without adding them again');
await assert.rejects(save('checkpoint','1.1.4',false,[...events,['b',10,stamp]]),/Invalid Svend bonus/);assert.deepEqual(await row(),r);
await save('submit','1.1.4',true);r=await row();assert.equal(r.round_log.outcome,'gameover','late Game Over keeps its ending without notification');
await save('submit','9.0.0',false);assert.deepEqual(await row(),r,'finished metadata immutable');
await assert.rejects(db.query('select public.ag_admin_player($1)',[id]),/admin|adgang|administrator/i);
await assert.rejects(db.query('select round_log from public.am_rounds'),/permission denied/);
await db.exec('reset role');await db.query('insert into public.ag_admins(user_id) values($1)',[id]);await db.exec('set role authenticated');const detail=(await db.query('select public.ag_admin_player($1) as data',[id])).rows[0].data;assert.deepEqual(detail.rounds[0].round_log,r.round_log);
await db.exec('set role anon');await assert.rejects(save(),/permission denied/);
console.log('PASS verified counts, bonus pair, retries, invalid journal rollback, late Game Over, immutable final log, admin-only access and repeatable migration');await db.close();
