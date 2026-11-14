import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './browser-runtime.mjs';
const roots=[fileURLToPath(new URL('../dist/',import.meta.url)),process.env.MERGE_ASSET_DIR].filter(Boolean);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 for(const [width,height,phone] of [[390,844,true],[820,1180,false]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
  await ctx.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.host!=='merge.test')return route.abort();
   const file=roots.map(root=>resolve(root,u.pathname==='/'?'index.html':u.pathname.slice(1))).find(existsSync);return file?route.fulfill({path:file}):route.abort();
  });
  await ctx.addInitScript(()=>{localStorage.setItem('almind-score-nickname','Testspiller');Element.prototype.requestFullscreen=()=>Promise.reject(Error('No fullscreen'));});
  const p=await ctx.newPage(),cdp=await ctx.newCDPSession(p),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(6000);
  await p.goto('https://merge.test/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);await p.locator('#play').tap();await p.waitForFunction(()=>__mergeTest.state.mode==='playing');
  const drops=()=>p.evaluate(()=>__mergeTest.state.round.drops);
  const isLeft=async()=>(await p.locator('.next-card').boundingBox()).x<(await p.locator('.score-card').boundingBox()).x;
  const gesture=async(x,y,dx,dy)=>{
   const point=(x,y)=>[{x:Math.round(x),y:Math.round(y),id:1}];
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(x,y)});
   if(dx||dy)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point(x+dx,y+dy)});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  const at=async(selector,dx=0,dy=0)=>{const b=await p.locator(selector).boundingBox();assert.ok(b,selector+' visible');await gesture(b.x+b.width*.45,b.y+b.height*.55,dx,dy);};
  const before=await isLeft();
  await at('.next-card');assert.equal(await drops(),0,'native card tap never drops');assert.notEqual(await isLeft(),before,'native card tap swaps');
  if(phone){
   assert.equal(await p.locator('#main-game-nav').isVisible(),false,'active phone play hides navigation');
   const order=await isLeft();
   await at('.score-card',35,-65);assert.equal(await drops(),0,'upward card swipe cancels');assert.equal(await isLeft(),order);
   await at('.next-card',40,1);assert.equal(await drops(),1,'card drag releases exactly one tile');assert.equal(await isLeft(),order,'drag cannot also swap');
   await p.evaluate(()=>__mergeTest.advance(.7));
   await at('#live-panel');assert.equal(await drops(),2,'live panel tap drops');await p.evaluate(()=>__mergeTest.advance(.7));
   await gesture(width*.45,height-12,0,0);assert.equal(await drops(),3,'blank bottom touch drops');
   await p.locator('#pause').tap();await p.waitForFunction(()=>__mergeTest.state.mode==='paused');
   assert.equal(await p.locator('#phone-pause').isVisible(),true);
   await p.locator('#phone-rules').tap();await p.waitForSelector('#how[open]');await p.keyboard.press('Escape');
   await p.locator('#phone-restart').tap();await p.waitForSelector('#confirm[open]');await p.locator('#cancel-restart').tap();assert.equal(await drops(),3);
   await p.locator('[data-score-scope="all"]:visible').first().tap();await p.locator('[data-score-scope="week"]:visible').first().tap();
   await p.locator('#round-copy summary').tap();assert.ok(await p.locator('#sync-round').isVisible());assert.ok(await p.locator('#export-round').isVisible());
   await p.locator('#phone-resume').tap();await p.waitForFunction(()=>__mergeTest.state.mode==='playing');assert.equal(await drops(),3);
  }else{
   await at('#live-panel');assert.equal(await drops(),0,'tablet live panel remains informational');
   await at('#game',30,0);assert.equal(await drops(),1,'tablet canvas retains ordinary aim and release');
   await p.locator('#pause').tap();assert.equal(await p.locator('#phone-pause').isVisible(),false);await p.locator('#play').tap();await p.waitForFunction(()=>__mergeTest.state.mode==='playing');
  }
  assert.deepEqual(errors,[]);await ctx.close();
 }
 console.log('PASS: native phone card tap/drag/cancel, live and bottom drop areas, pause actions, scores & backup, unchanged tablet');
}finally{await browser.close();}
