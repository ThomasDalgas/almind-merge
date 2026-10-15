import {chromium,BASE_URL} from './browser-runtime.mjs';import assert from 'node:assert/strict';
const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('https://*.supabase.co/**',r=>r.abort());await p.addInitScript(()=>localStorage.setItem('almind-score-nickname','Test'));await p.goto(BASE_URL+'/?test=1');await p.waitForFunction(()=>__mergeTest?.ready);await p.locator('#play').click();await p.waitForFunction(()=>__mergeTest.state.mode==='playing');
for(let tier=0;tier<5;tier++)for(const aim of [-100,24,220,416,600]){
 await p.evaluate(({tier,aim})=>{const t=__mergeTest;t.start();t.setDropTier(tier);t.setAim(aim);t.pause();},{tier,aim});await p.waitForTimeout(40);
 assert.equal(await p.locator('#game').getAttribute('data-drop-blocked'),'false',`tier ${tier}, aim ${aim}`);
 const result=await p.evaluate(()=>{const t=__mergeTest;t.resume();t.drop();t.pause();const body=t.engine.world.bodies.find(b=>b.plugin.tile);return {drops:t.state.round.drops,min:body?.bounds.min.x,max:body?.bounds.max.x};});assert.equal(result.drops,1);assert.ok(result.min>=24&&result.max<=416);
}
// A genuinely occupied entrance must still be rejected at the corrected edge.
await p.evaluate(()=>{const t=__mergeTest;t.start();t.setDropTier(3);t.setAim(416);t.drop();const body=t.engine.world.bodies.find(b=>b.plugin.tile);Matter.Body.setStatic(body,true);t.advance(.6);t.setDropTier(3);t.setAim(416);t.pause();});await p.waitForTimeout(40);assert.equal(await p.locator('#game').getAttribute('data-drop-blocked'),'true');assert.deepEqual(errors,[]);console.log('PASS all 5 droppable shapes at both edges, centre and outside pointer positions; real occupied entrance remains blocked');}finally{await b.close();}
