import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './browser-runtime.mjs';

const roots=[fileURLToPath(new URL('../dist/',import.meta.url)),process.env.MERGE_ASSET_DIR].filter(Boolean);
const nickname='RecoveryTest',profile=randomUUID(),id=randomUUID(),recovery=randomUUID(),saveKey='almind-merge-round-v1:'+nickname;
const fixture={
 round:{score:726348,drops:15000,maxTier:9,current:0,next:2,svendBonus:10000,lastDrop:13500},
 time:13503,elapsed:13806,aim:212,powers:{shake:8,remove:4},rewardLevel:121,shakeUntil:0,shakePulse:0,dangerProgress:0,
 tiles:[{tier:8,x:210,y:450,angle:.3,vx:0,vy:0,spin:0,age:45,danger:0}],
 journal:{key:randomUUID(),nickname,version:'1.2.1',invalid:true,events:Array.from({length:20000},(_,i)=>['d',0,i*500]),duration:13806000,final:false,ticket:{id,readyAt:Date.now()-15000000}}
};
const approved=structuredClone(fixture);approved.round.score-=128;approved.tiles[0].x=160;
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const context=await browser.newContext(),calls=[],errors=[];
 let cursor=20000,score=approved.round.score,finished=false,available=true;
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.host==='merge.test'){
   const path=u.pathname==='/'?'index.html':u.pathname.slice(1),file=roots.map(root=>resolve(root,path)).find(existsSync);
   return file?route.fulfill({path:file}):route.abort();
  }
  if(!u.hostname.endsWith('.supabase.co'))return route.abort();
  const rpc=u.pathname.split('/').at(-1),body=route.request().postDataJSON();calls.push({rpc,body});let data=null;
  if(u.pathname.startsWith('/auth/'))data={access_token:'mock',refresh_token:'mock',expires_in:3600,user:{id:profile}};
  else if(rpc==='am_player_profile')data={claimed:true,nickname,id:profile};
  else if(rpc==='am_game_rules')data={svend_bonus:10000};
  else if(rpc.startsWith('am_leaderboard'))data=[];
  else if(rpc==='am_live_snapshot')data={players:[],notices:[]};
  else if(rpc==='am_round_recovery')data=available?{id:recovery,cursor:20000,server_cursor:cursor,snapshot:approved,score:approved.round.score,revision:Date.now()}:null;
  else if(rpc==='am_stream_recovered_round'){
   if(body.p_offset===cursor){cursor+=body.p_events.length;for(const e of body.p_events)score+=e[0]==='d'?2:0;}
   if(['submit','gameover'].includes(body.p_kind))finished=true;
   data={cursor,score,finished};
  }
  return route.fulfill({json:data});
 });
 const p=await context.newPage();p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));
 const goto=async()=>{await p.goto('https://merge.test/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);};
 await goto();await p.evaluate(({fixture,saveKey,nickname})=>{localStorage.setItem('almind-score-nickname',nickname);localStorage.setItem(saveKey,JSON.stringify(fixture));},{fixture,saveKey,nickname});
 await goto();await p.locator('#round-copy summary').click();
 const original=await p.evaluate(k=>localStorage.getItem(k),saveKey);
 await p.locator('#recover-round').click();await p.waitForSelector('#recovery-confirm[open]');
 await p.keyboard.press('Escape');await p.waitForSelector('#recovery-confirm',{state:'hidden'});
 assert.equal(await p.evaluate(k=>localStorage.getItem(k),saveKey),original,'cancel leaves original untouched');
 await p.locator('#recover-round').click();await p.waitForSelector('#recovery-confirm[open]');
 await p.locator('#use-recovery').click();await p.waitForFunction(()=>__mergeTest.state.mode==='playing');
 let state=await p.evaluate(()=>__mergeTest.state);assert.equal(state.round.score,approved.round.score);assert.equal(state.bodies[0].tier,8);assert.ok(Math.abs(state.bodies[0].x-approved.tiles[0].x)<2);
 const backups=await p.evaluate(async()=>{const {fromStorage}=await import('/journal-storage.js');return Object.keys(localStorage).filter(k=>k.startsWith('almind-before-recovery:')).map(k=>{const s=JSON.parse(localStorage.getItem(k));s.journal=fromStorage(s.journal);return s;});});
 assert.equal(backups.length,1);assert.deepEqual(backups[0],fixture,'original pre-adoption copy is intact');
 await p.evaluate(()=>{__mergeTest.drop();__mergeTest.pause();});
 assert.equal(await p.evaluate(()=>__mergeTest.state.round.score),approved.round.score+2);
 const verify=(action)=>calls.filter(({rpc,body})=>rpc==='am_stream_recovered_round'&&body.p_kind===action);
 async function waitFor(action){for(let i=0;i<60&&!verify(action).length;i++){await p.evaluate(()=>window.dispatchEvent(new Event('online')));await p.waitForTimeout(70);}assert.ok(verify(action).length,'expected '+action);}
 await waitFor('checkpoint');assert.equal(cursor,20001,'only newly recorded action is sent');
 await goto();await p.locator('#play').click();await p.waitForFunction(()=>__mergeTest.state.mode==='playing');
 assert.equal(await p.evaluate(()=>__mergeTest.state.round.score),approved.round.score+2);
 await p.evaluate(()=>__mergeTest.end());await waitFor('gameover');assert.ok(finished);
 for(const {body} of calls.filter(({rpc})=>rpc==='am_stream_recovered_round'))assert.equal(body.p_recovery,recovery);
 assert.ok(!calls.some(({rpc})=>['am_start_round','am_save_round_logged','am_stream_round','am_game_over','am_submit_round'].includes(rpc)),'recovery never submitted through normal rounds');
 assert.deepEqual(errors,[]);console.log('PASS: canceled recovery retains local board, approved snapshot resumes with original backup, only new events checkpoint and finish the recovered round even after reload');
}finally{await browser.close();}
