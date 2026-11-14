import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './browser-runtime.mjs';

const roots=[fileURLToPath(new URL('../dist/',import.meta.url)),process.env.MERGE_ASSET_DIR].filter(Boolean);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const nickname='BackupTest',key='almind-merge-round-v1:'+nickname,profile=randomUUID(),roundId=randomUUID();
const score=726348,fixture={
 round:{score,drops:15000,maxTier:9,current:1,next:2,svendBonus:10000,lastDrop:13500},
 time:13503,elapsed:13806,aim:212,powers:{shake:8,remove:4},rewardLevel:121,shakeUntil:0,shakePulse:0,dangerProgress:0,
 tiles:[{tier:8,x:210,y:450,angle:.3,vx:0,vy:0,spin:0,age:45,danger:0},{tier:1,x:340,y:460,angle:0,vx:0,vy:0,spin:0,age:45,danger:0}],
 journal:{key:randomUUID(),nickname,version:'1.2.1',invalid:true,events:Array.from({length:20000},(_,i)=>['d',0,i*500]),duration:12000000,final:false,ticket:{id:roundId,readyAt:Date.now()-15000000}}
};
try{
 const context=await browser.newContext(),calls=[],errors=[];let rejectSync=false;
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.host==='merge.test'){
   const path=u.pathname==='/'?'index.html':u.pathname.slice(1),file=roots.map(root=>resolve(root,path)).find(existsSync);
   return file?route.fulfill({path:file}):route.abort();
  }
  if(!u.hostname.endsWith('.supabase.co'))return route.abort();
  const rpc=u.pathname.split('/').at(-1),body=route.request().postDataJSON();
  calls.push({rpc,body});let data=null;
  if(u.pathname.startsWith('/auth/'))data={access_token:'mock',refresh_token:'mock',expires_in:3600,user:{id:profile}};
  else if(rpc==='am_player_profile')data={claimed:true,nickname,id:profile};
  else if(rpc==='am_game_rules')data={svend_bonus:10000};
  else if(rpc.startsWith('am_leaderboard'))data=[];
  else if(rpc==='am_live_snapshot')data={players:[],notices:[]};
  else if(rpc==='am_put_round_backup'){
   if(rejectSync)return route.fulfill({status:503,json:{message:'Test: no connection'}});
   data=true;
  }
  return route.fulfill({json:data});
 });
 const p=await context.newPage();p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto('https://merge.test/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);
 await p.evaluate(({key,nickname,fixture})=>{localStorage.setItem('almind-score-nickname',nickname);localStorage.setItem(key,JSON.stringify(fixture));},{key,nickname,fixture});
 await p.reload();await p.waitForFunction(()=>window.__mergeTest?.ready);assert.equal(await p.locator('#play').textContent(),'Spil videre');
 const backupCalls=()=>calls.filter(x=>x.rpc==='am_put_round_backup');
 async function backup(expectError){
  rejectSync=expectError;const before=backupCalls().length;
  const response=p.waitForResponse(r=>r.url().endsWith('/am_put_round_backup'));
  await p.locator('#sync-round').click();await response;
  await p.waitForFunction(()=>!document.querySelector('#sync-round').disabled);
  assert.equal(backupCalls().length,before+1);
  const {p_snapshot:s,p_round:r}=backupCalls().at(-1).body;
  assert.equal(s.round.score,score);assert.equal(s.journal.invalid,true);assert.equal(r,roundId);assert.ok(s.journal.eventBlocks?.length);assert.ok(!s.journal.events);
  return (await p.locator('#sync-status').innerText()).trim();
 }
 const success=await backup(false);assert.match(success,/726.348 point/);assert.match(success,/ikke verificeret/);
 const failure=await backup(true);assert.match(failure,/Ingen bekræftet serverkopi/i);assert.equal(await backup(false),success,'retry after failure succeeds');
 assert.equal(await p.locator('#play').textContent(),'Spil videre');
 const still=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 assert.deepEqual(still.round,fixture.round);assert.deepEqual(still.tiles,fixture.tiles);
 const download=p.waitForEvent('download');await p.locator('#export-round').click();const file=await download;
 assert.match(file.suggestedFilename(),/\.json$/i);
 const exported=JSON.parse(await readFile(await file.path(),'utf8'));
 function snapshot(doc){
  if(doc&&typeof doc==='object'){if(doc.round&&doc.tiles&&doc.journal)return doc;for(const value of Object.values(doc)){if(value&&typeof value==='object'&&!Array.isArray(value)){const found=snapshot(value);if(found)return found;}}}
 }
 const board=snapshot(exported);assert.ok(board,'complete snapshot in downloaded JSON');assert.deepEqual(board.round,fixture.round);assert.deepEqual(board.tiles,fixture.tiles);assert.equal(board.journal.invalid,true);
 assert.equal(exported.nickname,nickname);assert.deepEqual(board.journal.events,fixture.journal.events,'all available history exported even if truncated');
 await p.locator('#play').click();await p.waitForFunction(()=>__mergeTest.state.mode==='playing');
 await p.locator('#pause').click();await p.waitForFunction(()=>__mergeTest.state.mode==='paused');
 assert.equal(await p.evaluate(()=>__mergeTest.state.round.score),score);
 assert.deepEqual(await p.evaluate(()=>__mergeTest.state.bodies.map(b=>b.tier)),[8,1]);
 assert.equal(await p.locator('#sync-round').isVisible(),true);await backup(false);
 assert.equal(await p.evaluate(()=>__mergeTest.state.mode),'paused');
 await p.reload();await p.waitForFunction(()=>window.__mergeTest?.ready);
 assert.equal(await p.locator('#play').textContent(),'Spil videre');
 assert.ok(!calls.some(({rpc,body})=>rpc==='am_start_round'||rpc==='am_game_over'||rpc==='am_submit_round'||rpc==='am_checkpoint_round'||rpc==='am_save_round_logged'));
 assert.deepEqual(errors,[]);console.log('PASS: large truncated round, backup success/failure, JSON export, board and score preserved, resumable after paused sync, no finalization');
}finally{await browser.close();}
