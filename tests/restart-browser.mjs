import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './browser-runtime.mjs';

const roots=[fileURLToPath(new URL('../dist/',import.meta.url)),process.env.MERGE_ASSET_DIR].filter(Boolean);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const saveKey='almind-merge-round-v1:Testspiller';
try{
 for(const deferred of [false,true]){
  const context=await browser.newContext();const starts=[],finals=[],errors=[],profile=randomUUID();
  let offline=false;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.host==='merge.test'){
    const file=roots.map(root=>resolve(root,url.pathname==='/'?'index.html':url.pathname.slice(1))).find(existsSync);
    return file?route.fulfill({path:file}):route.abort();
   }
   if(!url.hostname.endsWith('.supabase.co')||offline)return route.abort();
   const rpc=url.pathname.split('/').at(-1);
   let data=null;
   if(url.pathname.startsWith('/auth/'))data={access_token:'mock',refresh_token:'mock',expires_in:3600,user:{id:profile}};
   else if(rpc==='am_player_profile')data={claimed:true,nickname:'Testspiller',id:profile};
   else if(rpc==='am_start_round'){data=randomUUID();starts.push(data);}
   else if(rpc==='am_game_rules')data={svend_bonus:10000};
   else if(rpc==='am_live_snapshot')data={players:[],notices:[]};
   else if(rpc.startsWith('am_leaderboard'))data=[];
   else if(rpc==='am_save_round_logged'){
    const body=route.request().postDataJSON();
    if(body.p_kind!=='checkpoint')finals.push(body);
    data=body.p_events.reduce((acc,e)=>acc+(e[0]==='d'?2:0),0);
   }
   return route.fulfill({json:data,headers:{'access-control-allow-origin':'*'}});
  });
  async function open(){
   const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.goto('https://merge.test/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);return p;
  }
  let p=await open();await p.click('#play');await p.waitForFunction(()=>__mergeTest.state.mode==='playing');
  // A stray second click lands outside the modal or on the safe choice, never on confirm.
  async function accidentalRestart(expected){
   const toolbar=p.locator('#restart'),box=await toolbar.boundingBox();
   await toolbar.click();await p.waitForSelector('#confirm[open]');
   assert.ok(await p.evaluate(()=>document.activeElement?.matches('#confirm [data-close="confirm"]')));
   await p.mouse.click(box.x+box.width/2,box.y+box.height/2);
   if(await p.locator('#confirm').isVisible())await p.keyboard.press('Escape');
   await p.waitForFunction(()=>__mergeTest.state.mode==='playing');
   assert.equal(await p.evaluate(()=>__mergeTest.state.round.score),expected);
   assert.equal(starts.length,1);assert.equal(finals.length,0);
  }
  await accidentalRestart(0);
  await p.evaluate(()=>__mergeTest.drop());await accidentalRestart(2);
  await p.waitForFunction(k=>Boolean(JSON.parse(localStorage.getItem(k))?.journal?.ticket?.id),saveKey);
  await p.evaluate(()=>__mergeTest.pause());
  const saved=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),saveKey);assert.equal(saved.round.score,2);
  assert.equal(starts.length,1);const old=starts[0];assert.equal(saved.journal.ticket.id,old);await p.close();
  p=await open();assert.equal(await p.textContent('#play'),'Spil videre');
  await p.click('#restart-saved');await p.waitForSelector('#confirm[open]');await p.click('#confirm [aria-label="Annullér"]');
  const canceled=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),saveKey);
  assert.equal(canceled.journal.key,saved.journal.key);assert.equal(canceled.round.score,2);
  assert.equal(starts.length,1);assert.deepEqual(finals,[]);
  if(deferred)offline=true;
  // Reopening did not load the board: confirming here must finalize the persisted original ticket.
  await p.click('#restart-saved');await p.waitForSelector('#confirm[open]');await p.click('#confirm-restart');
  await p.waitForFunction(()=>__mergeTest.state.mode==='playing'&&__mergeTest.state.round.score===0);
  assert.equal(await p.locator('#game-over-logo').isVisible(),false);
  const fresh=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),saveKey);
  assert.notEqual(fresh.journal.key,saved.journal.key);assert.deepEqual(fresh.journal.events,[]);
  if(deferred){
   assert.equal(finals.length,0);
   const pending=await p.evaluate(key=>JSON.parse(localStorage.getItem('almind-score-pending:'+key)),saved.journal.key);
   assert.equal(pending?.final,true);assert.equal(pending.ticket.id,old);
  }
  offline=false;await p.evaluate(()=>__mergeTest.drop());
  const until=Date.now()+5000;
  do{
   await p.evaluate(()=>window.dispatchEvent(new Event('online')));
   await p.waitForTimeout(80);
  }while((!finals.length||starts.length<2)&&Date.now()<until);
  assert.equal(starts.length,2);assert.notEqual(starts[1],old);
  assert.equal(finals.length,1);assert.equal(finals[0].p_round,old);
  assert.equal(finals[0].p_kind,'submit');assert.equal(finals[0].p_game_over,false);
  assert.deepEqual(finals[0].p_events,saved.journal.events);assert.ok(finals[0].p_duration>=saved.journal.duration);
  await p.evaluate(()=>window.dispatchEvent(new Event('online')));await p.waitForTimeout(100);
  assert.equal(finals.length,1,'one successful final submission after repeated flushes');assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('PASS: reopened save, canceled restart, confirmed restart, separate tickets, offline finalization/retry, no Game Over or duplicate final');
}finally{await browser.close();}
