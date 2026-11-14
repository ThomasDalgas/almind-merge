import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './browser-runtime.mjs';

const roots=[fileURLToPath(new URL('../dist/',import.meta.url)),process.env.MERGE_ASSET_DIR].filter(Boolean);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.host!=='merge.test')return route.abort();
  const path=u.pathname==='/'?'index.html':u.pathname.slice(1);
  const file=roots.map(root=>resolve(root,path)).find(existsSync);return file?route.fulfill({path:file}):route.abort();
 });
 await context.addInitScript(()=>{localStorage.setItem('almind-score-nickname','Testspiller');Element.prototype.requestFullscreen=()=>Promise.reject(Error('No fullscreen'));});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(7000);
 async function play(){
  await p.waitForFunction(()=>window.__mergeTest?.ready);await p.locator('#play').tap();await p.waitForFunction(()=>__mergeTest.state.mode==='playing');
 }
 const drops=()=>p.evaluate(()=>__mergeTest.state.round.drops);
 async function cards(){
  const a=await p.locator('.next-card').boundingBox(),b=await p.locator('.score-card').boundingBox();
  assert.ok(a&&b&&Math.abs(a.y-b.y)<12,'both cards share a mobile row');
  return a.x<b.x?'left':'right';
 }
 await p.goto('https://merge.test/?test=1');await play();
 assert.equal(await cards(),'left','right-handed default: next tile at left');
 const touch=await context.newCDPSession(p);
 async function swipe(dx,dy){
  const board=await p.locator('#game').boundingBox(),x=Math.round(board.x+board.width*.42),y=Math.round(board.y+board.height*.55);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 await swipe(0,-65);assert.equal(await drops(),0,'upward release cancels');
 await swipe(86,-65);assert.equal(await drops(),0,'diagonal upward release cancels too');
 await swipe(86,0);assert.equal(await drops(),1,'horizontal aim still releases exactly one tile');
 await p.locator('#pause').tap();await p.locator('#settings-open').tap();
 assert.equal(await p.locator('#playing-hand').inputValue(),'right');
 await p.locator('#playing-hand').selectOption('left');await p.keyboard.press('Escape');
 await p.reload();await p.waitForFunction(()=>window.__mergeTest?.ready);
 await p.locator('#settings-open').tap();assert.equal(await p.locator('#playing-hand').inputValue(),'left','user preference survives reload');
 await p.keyboard.press('Escape');await play();assert.equal(await cards(),'right','left-handed setting places next tile at right');assert.equal(await drops(),1,'hand preference does not reset the round');
 await p.evaluate(()=>__mergeTest.advance(.6));await swipe(-65,10);assert.equal(await drops(),2,'left-handed horizontal movement still drops');
 assert.deepEqual(errors,[]);console.log('PASS mobile handedness default, swap and persistence, upward and diagonal cancel, horizontal drop, saved round unchanged');
}finally{await browser.close();}
