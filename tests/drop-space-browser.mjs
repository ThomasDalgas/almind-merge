import {chromium,BASE_URL} from './browser-runtime.mjs';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('https://*.supabase.co/**',r=>r.abort());await p.addInitScript(()=>localStorage.setItem('almind-score-nickname','Test'));
 await p.goto(BASE_URL+'/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);await p.locator('#play').click();await p.waitForFunction(()=>window.__mergeTest.state.mode==='playing');
 const blocked=await p.evaluate(()=>{
  const t=window.__mergeTest;window.blocker=t.spawn(0,220,66);t.setAim(220);const before=t.state;
  for(let i=0;i<50;i++)t.drop();return {before,after:t.state,status:document.querySelector('#status').textContent};
 });
 assert.deepEqual(blocked.after.round,blocked.before.round);assert.equal(blocked.after.bodies.length,1);assert.match(blocked.status,/Ingen plads/);
 const clear=await p.evaluate(()=>{const t=window.__mergeTest;t.setAim(100);t.drop();return t.state;});assert.equal(clear.bodies.length,2);assert.equal(clear.round.drops,1);assert.equal(clear.round.score,2);
 // Existing danger still progresses and ends the round; blocked input cannot reset it.
 const danger=await p.evaluate(()=>{
  const t=window.__mergeTest;t.start();const b=t.spawn(4,220,66);Matter.Body.setStatic(b,true);t.setAim(220);
  for(let i=0;i<14;i++){t.advance(1);for(let j=0;j<10;j++)t.drop();}
  const before=t.state;t.advance(1.1);return {before,after:t.state};
 });
 assert.equal(danger.before.mode,'playing');assert.equal(danger.before.round.drops,0);assert.equal(danger.before.bodies.length,1);assert.equal(danger.after.mode,'over');
 // Clearing the same entrance permits dropping immediately, with no lost preview/cooldown.
 const recovered=await p.evaluate(()=>{const t=window.__mergeTest;t.start();const b=t.spawn(4,220,66);t.drop();t.position(b,220,400);t.drop();return t.state;});
 assert.equal(recovered.round.drops,1);assert.equal(recovered.bodies.length,2);assert.equal(recovered.round.score,2);assert.deepEqual(errors,[]);
 console.log('PASS occupied silhouettes reject repeated drops without points/preview/cooldown changes; other lanes and reopened entrance work; 15-second danger remains active');
}finally{await browser.close();}
