import {chromium,BASE_URL} from './browser-runtime.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
async function open(width,height,touch=true){
 const page=await browser.newPage({viewport:{width,height},isMobile:touch,hasTouch:touch});
 await page.route('https://*.supabase.co/**',route=>route.fulfill({status:route.request().url().includes('/auth/')?503:200,contentType:'application/json',body:'[]'}));
 await page.addInitScript(()=>{window.displayRequests=[];Element.prototype.requestFullscreen=()=>{displayRequests.push('fullscreen');return Promise.reject(new Error('Simulated unsupported Safari fullscreen'));};});
 await page.addInitScript(()=>localStorage.setItem('almind-score-nickname','Testspiller'));
 await page.goto(BASE_URL+'/?test=1');await page.waitForFunction(()=>window.__mergeTest?.ready);return page;
}
try{
 for(const [w,h] of [[320,568],[375,667],[390,844],[768,1024],[820,1180],[1024,1366]]){
  const p=await open(w,h);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.locator('#play').tap();
  await p.waitForFunction(()=>document.body.classList.contains('playing'));
  const boxes=await p.evaluate(()=>['.arena-toolbar','.arena-wrap','.left-rail'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(const box of boxes){assert.ok(box.x>=0&&box.right<=w+1,JSON.stringify({w,h,box}));assert.ok(box.y>=0&&box.bottom<=h+1,JSON.stringify({w,h,box}));}
  assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('.topbar')).display),'none');
  assert.ok(await p.evaluate(()=>displayRequests.includes('fullscreen')));
  const canvas=await p.locator('#game').boundingBox(),cdp=await p.context().newCDPSession(p),x=canvas.x+canvas.width*.4,y=canvas.y+canvas.height*.4;
  const before=await p.evaluate(()=>window.__mergeTest.state.round.drops);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+20,y:y+40}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await p.evaluate(()=>window.__mergeTest.state.round.drops),before+1);
  // A two-finger zoom must not leave a pending drop when the fingers lift.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:0,x,y},{id:1,x:x+60,y:y+60}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await p.evaluate(()=>window.__mergeTest.state.round.drops),before+1);
  assert.equal(await p.evaluate(()=>visualViewport.scale),1);
  if(w===390||w===1024)await p.screenshot({path:`/tmp/almind-mobile-${w}.png`});
  await p.setViewportSize({width:h,height:w});await p.waitForSelector('#rotate-screen',{state:'visible'});assert.equal(await p.evaluate(()=>window.__mergeTest.state.mode),'paused');
  const t=await p.evaluate(()=>window.__mergeTest.state.time);await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>window.__mergeTest.state.time),t);
  await p.setViewportSize({width:w,height:h});await p.waitForSelector('#rotate-screen',{state:'hidden'});assert.equal(await p.evaluate(()=>window.__mergeTest.state.mode),'paused');await p.locator('#play').tap();assert.equal(await p.evaluate(()=>window.__mergeTest.state.mode),'playing');
  await p.locator('#pause').tap();assert.notEqual(await p.evaluate(()=>getComputedStyle(document.body).position),'fixed');await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));assert.ok(await p.evaluate(()=>scrollY>0));assert.deepEqual(errors,[]);await p.close();
  console.log('PASS viewport, touch/zoom, rotate pause, resume and menu scroll',w,h);
 }
 const p=await open(1366,900,false);await p.locator('#play').click();assert.deepEqual(await p.evaluate(()=>displayRequests),[]);assert.equal(await p.locator('#rotate-screen').isVisible(),false);await p.close();
 const q=await open(844,390);await q.locator('#play').tap();await q.waitForSelector('#rotate-screen',{state:'visible'});assert.equal(await q.evaluate(()=>window.__mergeTest.state.mode),'paused');await q.locator('#rotate-back').tap();assert.equal(await q.locator('#rotate-screen').isVisible(),false);await q.close();
 // Supported path: fullscreen must be requested before the portrait lock.
 const s=await open(390,844);await s.evaluate(()=>{document.documentElement.requestFullscreen=async()=>{displayRequests.push('fullscreen');Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>document.documentElement});document.dispatchEvent(new Event('fullscreenchange'));};Object.defineProperty(screen.orientation,'lock',{value:async mode=>displayRequests.push(mode),configurable:true});Object.defineProperty(screen.orientation,'unlock',{value:()=>displayRequests.push('unlock'),configurable:true});});
 await s.locator('#play').tap();await s.waitForFunction(()=>displayRequests.includes('portrait'));assert.deepEqual(await s.evaluate(()=>displayRequests),['fullscreen','portrait']);await s.evaluate(()=>window.__mergeTest.end());assert.ok(await s.evaluate(()=>displayRequests.includes('unlock')));await s.close();
 console.log('PASS desktop unchanged, landscape-start fallback, supported fullscreen/portrait/unlock lifecycle');
}finally{await browser.close();}
