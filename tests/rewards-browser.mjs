import {chromium,BASE_URL} from './browser-runtime.mjs';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://*.supabase.co/**',r=>r.request().url().endsWith('/am_game_rules')?r.fulfill({contentType:'application/json',body:'{"svend_bonus":10000}'}):r.abort());
 await p.addInitScript(()=>localStorage.setItem('almind-score-nickname','Test'));
 await p.goto(BASE_URL+'/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);await p.locator('#play').click();await p.waitForFunction(()=>window.__mergeTest.state.mode==='playing');
 const before=await p.locator('#game').boundingBox();await p.evaluate(()=>window.__mergeTest.setScore(6000));await p.waitForFunction(()=>document.querySelector('#reward-announcement').classList.contains('visible'));assert.match(await p.locator('#reward-announcement').textContent(),/Fjern/);assert.equal((await p.evaluate(()=>window.__mergeTest.state)).powers.remove,2);assert.ok((await p.evaluate(()=>window.__mergeTest.state.effects.audio))>0);assert.deepEqual(await p.locator('#game').boundingBox(),before);
 await p.waitForTimeout(3300);assert.equal(await p.locator('#reward-announcement').evaluate(e=>e.classList.contains('visible')),false);
 await p.locator('#sound').click();await p.evaluate(()=>window.__mergeTest.setScore(12000));assert.match(await p.locator('#reward-announcement').textContent(),/Ryst/);assert.equal(await p.evaluate(()=>window.__mergeTest.state.effects.audio),0);
 await p.evaluate(()=>{window.__mergeTest.pause();window.__mergeTest.resume();window.__mergeTest.spawn(10,190,430);window.__mergeTest.spawn(10,240,430);window.__mergeTest.advance(.2);});
 assert.equal(await p.evaluate(()=>window.__mergeTest.state.round.score),22000);assert.match(await p.locator('#reward-announcement').textContent(),/10.000/);assert.equal(await p.evaluate(()=>window.__mergeTest.state.bodies.filter(b=>b.tier===10).length),0);
 await p.evaluate(()=>window.__mergeTest.pause());assert.equal(await p.locator('#reward-announcement').evaluate(e=>e.classList.contains('visible')),false);assert.deepEqual(errors,[]);console.log('PASS Fjern/Ryst toasts, 3 second lifetime, sound/mute, mobile board stays fixed, 10000 Svend bonus, pause cleanup');
}finally{await browser.close();}
