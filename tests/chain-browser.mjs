import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './browser-runtime.mjs';

const roots=[fileURLToPath(new URL('../dist/',import.meta.url)),process.env.MERGE_ASSET_DIR].filter(Boolean);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const context=await browser.newContext(),errors=[];
 // Exercise a real secure browser origin but never contact a production scoreboard.
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.host!=='merge.test')return route.abort();
  const path=u.pathname==='/'?'index.html':u.pathname.slice(1);
  const file=roots.map(root=>resolve(root,path)).find(existsSync);
  return file?route.fulfill({path:file}):route.abort();
 });
 await context.addInitScript(()=>{
  localStorage.setItem('almind-score-nickname','Kædetest');
  window.paintSamples=[];
  const fill=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
   if(this.canvas.id==='game'&&(/^Bonus|^\+\d+/.test(text)))window.paintSamples.push({text,x,y,alpha:this.globalAlpha,color:this.fillStyle});
   return fill.call(this,text,x,y,...rest);
  };
 });
 async function open(){
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto('https://merge.test/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);
  await p.click('#play');await p.waitForFunction(()=>__mergeTest.state.mode==='playing');return p;
 }
 let p=await open();
 // Build a legal event stream. Move bodies only to arrange reproducible real Matter collisions.
 const baseline=await p.evaluate(()=>{
  const t=__mergeTest;t.engine.gravity.scale=0;
  const pieces=()=>Matter.Composite.allBodies(t.engine.world).filter(b=>b.plugin.tile&&b.plugin.alive);
  const move=(body,x,y)=>{t.position(body,x,y);Matter.Body.setVelocity(body,{x:0,y:0});};
  for(let i=0;i<5;i++){
   const ids=new Set(pieces().map(b=>b.id));t.setDropTier(i===4?2:0);t.drop();
   const newBody=pieces().find(b=>!ids.has(b.id));if(!newBody)throw Error('Failed to arrange test drop '+i);
   move(newBody,70+(i%4)*90,i===4?510:310);t.advance(.52);
  }
  const balls=pieces().filter(b=>b.plugin.tier===0);
  move(balls[0],105,310);move(balls[1],117,310);move(balls[2],295,310);move(balls[3],307,310);t.step(1/60);
  return t.state.round.score;
 });
 assert.equal(baseline,24,'five drops worth 16, plus two independent merges at 4 each');
 await p.waitForFunction(()=>paintSamples.some(v=>v.text==='+4'));
 assert.ok(!(await p.evaluate(()=>paintSamples.some(v=>v.text.startsWith('Bonus')))),'two simultaneous separate merges get no multiplier');
 const merged=await p.evaluate(()=>{
  const t=__mergeTest;const pair=Matter.Composite.allBodies(t.engine.world).filter(b=>b.plugin.tier===1);
  if(pair.length!==2)throw Error('Expected two 4s');t.position(pair[0],215,320);t.position(pair[1],224,320);
  t.step(1/60);return t.state.round.score;
 });
 assert.equal(merged,40,'two active first links meet: longest + one, so 8 × 2');
 await p.waitForFunction(()=>paintSamples.some(v=>v.text==='Bonus ×2 · +16'));
 await p.evaluate(()=>__mergeTest.pause());
 const stored=await p.evaluate(()=>JSON.parse(localStorage.getItem('almind-merge-round-v1:Kædetest')));
 assert.equal(stored.round.score,40);await p.close();
 // Even a longer real-world absence must not consume the simulated two-second window.
 await new Promise(resolve=>setTimeout(resolve,2150));p=await open();
 const continued=await p.evaluate(()=>{
  const t=__mergeTest;t.engine.gravity.scale=0;
  const pair=Matter.Composite.allBodies(t.engine.world).filter(b=>b.plugin.tile&&b.plugin.tier===2);
  if(t.state.round.score!==40||pair.length!==2)throw Error('Score or board lost after reopening');
  t.position(pair[0],215,320);t.position(pair[1],225,320);t.step(1/60);return t.state.round.score;
 });
 assert.equal(continued,88,'restored 8 keeps its second link: 16 × 3');
 await p.waitForFunction(()=>paintSamples.some(v=>v.text==='Bonus ×3 · +48'&&v.alpha<.9));
 const samples=await p.evaluate(()=>paintSamples.filter(v=>v.text==='Bonus ×3 · +48'));
 assert.ok(samples[0].y>samples.at(-1).y,'bonus visibly rises as it fades');
 assert.ok(Math.abs(samples[0].x-220)<30&&Math.abs(samples[0].y-320)<65,'bonus starts near the merging bodies');
 await p.evaluate(()=>{const t=__mergeTest;t.advance(2.1);const tile=t.state.bodies.find(b=>b.tier===3);t.spawn(3,tile.x+5,tile.y);t.step(1/60);});
 assert.equal(await p.evaluate(()=>__mergeTest.state.round.score),120,'expired chain: next 32 scores at ×1');
 assert.deepEqual(errors,[]);console.log('PASS: independent merges, longer chain, floating text rising and fading, board and chain after close/reopen, expiration');
}finally{await browser.close();}
