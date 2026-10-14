import {chromium,BASE_URL} from './browser-runtime.mjs';
import assert from 'node:assert/strict';
const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://*.supabase.co/**',r=>r.abort());
 await p.addInitScript(()=>{localStorage.setItem('almind-score-nickname','Test');window.clips=[];const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.clips.push(this.buffer.duration);return start.apply(this,args);};});
 await p.goto(BASE_URL+'/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);
 let count=0;
 for(const [tier,duration] of [[9,1.125],[10,1.641]]){
  await p.locator('.family-item').nth(tier).click();
  for(let i=0;i<2;i++){await p.locator('#portrait-play').click();await p.waitForFunction(n=>clips.length===n,++count);assert.ok(Math.abs(await p.evaluate(()=>clips.at(-1))-duration)<.05);}
  await p.keyboard.press('Escape');
  await p.evaluate(()=>window.__mergeTest.start());await p.waitForTimeout(100);
  await p.evaluate(tier=>{const t=window.__mergeTest;t.spawn(tier-1,215,400);t.spawn(tier-1,220,400);t.advance(.1);},tier);
  await p.waitForFunction(n=>clips.length===n,++count);assert.ok(Math.abs(await p.evaluate(()=>clips.at(-1))-duration)<.05);
  assert.ok(await p.evaluate(tier=>window.__mergeTest.state.bodies.some(b=>b.tier===tier),tier));
  await p.evaluate(()=>window.__mergeTest.pause());
 }
 await p.evaluate(()=>{window.__mergeTest.resume();window.__mergeTest.end();});
 await p.waitForFunction(n=>clips.length===n,++count);assert.ok(Math.abs(await p.evaluate(()=>clips.at(-1))-2.835)<.05);
 assert.equal(await p.locator('#game-over-logo').isVisible(),true);
 await p.locator('#sound').click();assert.equal(await p.evaluate(()=>window.__mergeTest.state.effects.audio),0);
 await p.evaluate(()=>{window.__mergeTest.start();window.__mergeTest.end();});await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>clips.length),count);
 assert.deepEqual(errors,[]);console.log('PASS Helle/Svend preview, repeat taps, both merges, Game Over voice, mute and cancellation');
}finally{await b.close();}
