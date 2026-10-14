const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {chromium} from './browser-runtime.mjs';
const root=new URL('..',import.meta.url).pathname.replace(/\/$/,''),db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);await db.exec(await fs.readFile(root+'/supabase/migrations/202610140001_highscores.sql','utf8'));await db.exec(await fs.readFile(root+'/supabase/migrations/202610140002_live_players.sql','utf8'));await db.exec(await fs.readFile(root+'/supabase/migrations/202610140003_checkpoint_scores.sql','utf8'));let queue=Promise.resolve();
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/score-config.js'){res.setHeader('Content-Type','text/javascript');res.end("export const SCORE_CONFIG={url:'http://127.0.0.1:4192',key:'local-test'};");return;}
if(u.pathname.startsWith('/auth/')||u.pathname.startsWith('/rest/')){let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw||'{}');const run=async()=>{await db.exec('reset role');if(u.pathname==='/auth/v1/signup'){const id=randomUUID();await db.query('insert into auth.users values($1)',[id]);return {access_token:id,refresh_token:id,expires_at:Date.now()/1000+3600,user:{id}};}const who=req.headers.authorization?.replace('Bearer ','')||'';await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec(`set role ${who?'authenticated':'anon'}`);let data;if(u.pathname.endsWith('/am_start_round'))data=(await db.query('select public.am_start_round() as x')).rows[0].x;else if(u.pathname.endsWith('/am_checkpoint_round'))data=(await db.query('select public.am_checkpoint_round($1,$2,$3,$4) as x',[body.p_round,body.p_nickname,JSON.stringify(body.p_events),body.p_duration])).rows[0].x;else if(u.pathname.endsWith('/am_submit_round'))data=(await db.query('select public.am_submit_round($1,$2,$3,$4) as x',[body.p_round,body.p_nickname,JSON.stringify(body.p_events),body.p_duration])).rows[0].x;else if(u.pathname.endsWith('/am_live_update'))data=(await db.query('select public.am_live_update($1,$2,$3,$4,$5) as x',[body.p_round,body.p_nickname,body.p_score,body.p_max_tier,body.p_active])).rows[0].x;else if(u.pathname.endsWith('/am_live_snapshot'))data=(await db.query('select public.am_live_snapshot() as x')).rows[0].x;else data=(await db.query('select * from public.am_leaderboard($1)',[body.p_scope])).rows;return data;};const work=queue.then(run);queue=work.catch(()=>{});const data=await work;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;}
const filename=path.join(root,'dist',u.pathname==='/'?'index.html':u.pathname);const data=await fs.readFile(filename);res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.html')?'text/html':filename.endsWith('.png')?'image/png':'application/octet-stream');res.end(data);
}catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:e.message}));}});await new Promise(r=>server.listen(4192,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('unsupported'));});
 await p.goto('http://127.0.0.1:4192/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);
 await p.locator('#play').tap();await p.waitForSelector('#player-name[open]');
 assert.equal(await p.evaluate(()=>window.__mergeTest.state.mode),'ready');
 await p.locator('#player-name-input').fill('Niklas');await p.screenshot({path:'/tmp/almind-name-modal.png'});
 await p.locator('#player-name-form button').tap();await p.waitForFunction(()=>window.__mergeTest.state.mode==='playing');
 await p.waitForSelector('.live-player');
 const identity=await p.evaluate(()=>JSON.parse(localStorage.getItem('almind-score-session:http://127.0.0.1:4192')).user.id);
 await p.evaluate(()=>window.__mergeTest.drop());await p.waitForTimeout(650);await p.evaluate(()=>window.__mergeTest.drop());
 await p.waitForFunction(()=>document.querySelector('#score-save-status').textContent.includes('er gemt'),{},{timeout:15000});
 await p.evaluate(()=>window.__mergeTest.pause());
 await p.waitForFunction(()=>document.querySelector('.highscore-row b')?.textContent==='8');
 assert.equal(await p.locator('.highscore-row small').count(),0);
 assert.equal(await p.locator('.highscore-row strong').textContent(),'Niklas');
 await p.reload();await p.waitForFunction(()=>window.__mergeTest?.ready);await p.locator('#play').tap();
 await p.waitForFunction(()=>window.__mergeTest.state.mode==='playing');assert.equal(await p.locator('#player-name[open]').count(),0);
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('almind-score-session:http://127.0.0.1:4192')).user.id),identity);
 await p.waitForSelector('.live-player');
 // Lose connection, leave a larger unsent round, and reload before Game Over.
 await context.setOffline(true);
 await p.evaluate(()=>{const t=window.__mergeTest;for(let i=0;i<4;i++){t.drop();t.advance(.6);}t.advance(1);});
 const expected=await p.evaluate(()=>window.__mergeTest.state.round.score);assert.ok(expected>8);
 assert.ok(await p.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('almind-score-pending:'))));
 await context.setOffline(false);await p.reload();await p.waitForFunction(()=>window.__mergeTest?.ready);
 await p.waitForFunction(expected=>document.querySelector('.highscore-row b')?.textContent===String(expected),expected,{timeout:15000});
 assert.equal(await p.locator('.highscore-row').count(),1);
 assert.deepEqual(errors,[]);
 console.log('PASS name modal, remembered name/identity, checkpoint before Game Over, name-only rows, offline reload recovery, one row per browser');
}finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
