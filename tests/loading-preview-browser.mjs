import {chromium,BASE_URL} from './browser-runtime.mjs';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://*.supabase.co/**',r=>r.request().url().endsWith('/am_game_rules')?r.fulfill({contentType:'application/json',body:'{}'}):r.abort());await p.addInitScript(()=>localStorage.setItem('almind-score-nickname','Test'));
 let release;const held=new Promise(r=>release=r);await p.route('**/assets/football-v2.png',async r=>{await held;await r.continue();});
 await p.goto(BASE_URL+'/?test=1',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelector('#load-progress').value>0);
 assert.ok(await p.locator('#play').isDisabled());const progress=await p.locator('#load-progress').evaluate(e=>e.value);assert.ok(progress<100);await p.screenshot({path:'/tmp/almind-loading.png'});
 release();await p.waitForFunction(()=>window.__mergeTest?.ready);assert.equal(await p.locator('#load-progress').evaluate(e=>e.value),100);assert.equal(await p.locator('#play').isDisabled(),false);
 await p.locator('#play').click();await p.waitForFunction(()=>window.__mergeTest.state.mode==='playing');assert.equal(await p.locator('#game-loading').isVisible(),false);
 // A newly released tile still occupies the entrance during the normal cooldown.
 await p.evaluate(()=>{window.__mergeTest.drop();window.__mergeTest.pause();});
 await p.waitForTimeout(80);assert.equal(await p.locator('#game').getAttribute('data-drop-blocked'),'false');
 await p.evaluate(()=>{window.__mergeTest.resume();window.__mergeTest.advance(.6);window.__mergeTest.pause();});
 await p.waitForTimeout(80);assert.equal(await p.locator('#game').getAttribute('data-drop-blocked'),'false');
 await p.evaluate(()=>{const t=window.__mergeTest;t.resume();t.setAim(100);t.drop();const b=t.spawn(4,100,66);Matter.Body.setStatic(b,true);t.pause();});
 await p.waitForTimeout(80);assert.equal(await p.locator('#game').getAttribute('data-drop-blocked'),'false');
 await p.evaluate(()=>{window.__mergeTest.resume();window.__mergeTest.advance(.6);window.__mergeTest.pause();});
 await p.waitForFunction(()=>document.querySelector('#game').dataset.dropBlocked==='true');
 await p.evaluate(()=>{window.__mergeTest.start();});
 await p.evaluate(()=>{const t=window.__mergeTest;const b=t.spawn(4,220,66);Matter.Body.setStatic(b,true);t.setAim(220);});await p.waitForFunction(()=>document.querySelector('#game').dataset.dropBlocked==='true');await p.screenshot({path:'/tmp/almind-blocked-preview.png'});
 await p.evaluate(()=>window.__mergeTest.setAim(90));await p.waitForFunction(()=>document.querySelector('#game').dataset.dropBlocked==='false');assert.deepEqual(errors,[]);
 const f=await browser.newPage();await f.route('https://*.supabase.co/**',r=>r.abort());await f.route('**/assets/football-v2.png',r=>r.abort());await f.goto(BASE_URL+'/?test=1');await f.waitForFunction(()=>!document.querySelector('#load-retry').hidden);assert.ok(await f.locator('#play').isDisabled());assert.match(await f.locator('#load-label').textContent(),/mislykkedes/);
 console.log('PASS actual partial progress, disabled-until-ready, 100%, load error retry, blocked preview updates with aim, no runtime errors');
}finally{await browser.close();}
