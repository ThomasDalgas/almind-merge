import {chromium,BASE_URL} from './browser-runtime.mjs';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('https://*.supabase.co/**',r=>r.abort());await p.addInitScript(()=>localStorage.setItem('almind-score-nickname','Test'));
 await p.goto(BASE_URL+'/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);await p.locator('#play').click();await p.waitForFunction(()=>window.__mergeTest.state.mode==='playing');
 const result=await p.evaluate(()=>{const t=window.__mergeTest;const ball=t.spawn(0,220,220);t.spawn(10,190,430);t.spawn(10,240,430);const before=t.state.round.score;t.advance(.3);return {before,state:t.state,ballId:ball.id};});
 assert.equal(result.state.bodies.filter(b=>b.tier===10).length,0);assert.equal(result.state.bodies.length,1);assert.equal(result.state.bodies[0].id,result.ballId);assert.equal(result.state.round.score,result.before);assert.equal(result.state.mode,'playing');assert.ok(result.state.effects.particles>0);
 await p.evaluate(()=>window.__mergeTest.advance(.6));assert.ok((await p.evaluate(()=>window.__mergeTest.state.bodies[0].y))>result.state.bodies[0].y,'unsupported tile keeps falling');
 await p.evaluate(()=>window.__mergeTest.drop());assert.equal((await p.evaluate(()=>window.__mergeTest.state.round.score)),2);assert.deepEqual(errors,[]);
 console.log('PASS two colliding Svend disappear, other tile falls, fireworks, no extra points, next drop works');
}finally{await browser.close();}
