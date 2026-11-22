import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './browser-runtime.mjs';
const roots=[fileURLToPath(new URL('../dist/',import.meta.url)),process.env.MERGE_ASSET_DIR].filter(Boolean);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 for(const [width,height,phone] of [[390,844,true],[1440,900,false]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:phone,isMobile:phone});
  await ctx.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.host!=='merge.test')return route.abort();
   const file=roots.map(root=>resolve(root,u.pathname==='/'?'index.html':u.pathname.slice(1))).find(existsSync);return file?route.fulfill({path:file}):route.abort();
  });
  await ctx.addInitScript(()=>{localStorage.setItem('almind-score-nickname','Testspiller');Element.prototype.requestFullscreen=()=>Promise.reject(Error('No fullscreen'));});
  const p=await ctx.newPage(),cdp=await ctx.newCDPSession(p),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(6000);
  await p.goto('https://merge.test/?test=1');await p.waitForFunction(()=>window.__mergeTest?.ready);await p.locator('#play').click();await p.waitForFunction(()=>__mergeTest.state.mode==='playing');

  await p.evaluate(()=>__mergeTest.drop());
  await p.locator('#pause').click();
  const heading=p.locator(phone?'#phone-pause h2':'#overlay-title');
  for(let i=0;i<6;i++)await heading.click();
  let box=await heading.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await p.mouse.down();await p.waitForTimeout(2100);await p.mouse.up();
  assert.equal(await p.evaluate(()=>__mergeTest.state.unlimitedPowers),false);
  for(let i=0;i<7;i++)await heading.click();
  await p.mouse.down();await p.waitForTimeout(2100);await p.mouse.up();
  assert.equal(await p.evaluate(()=>__mergeTest.state.unlimitedPowers),true);
  await p.locator(phone?'#phone-resume':'#play').click();
  assert.equal(await p.locator('#shake b').textContent(),'∞');
  await p.evaluate(()=>{__mergeTest.shake();});
  assert.equal(await p.evaluate(()=>__mergeTest.state.powers.shake),1);
  await p.evaluate(()=>__mergeTest.advance(.8));
  assert.ok(await p.evaluate(()=>__mergeTest.state.shakeUntil>__mergeTest.state.time));
  await p.evaluate(()=>__mergeTest.advance(.4));
  assert.equal(await p.evaluate(()=>__mergeTest.state.shakeUntil),0);
  await p.evaluate(()=>__mergeTest.pause());
  await p.reload();await p.waitForFunction(()=>__mergeTest?.ready);await p.locator('#play').click();await p.waitForFunction(()=>__mergeTest.state.mode==='playing');
  assert.equal(await p.evaluate(()=>__mergeTest.state.unlimitedPowers),true);
  await p.evaluate(()=>__mergeTest.start());
  assert.equal(await p.evaluate(()=>__mergeTest.state.unlimitedPowers),false);
  assert.deepEqual(errors,[]);await ctx.close();
 }
 console.log('PASS phone/desktop gesture threshold, hold, unlimited stock, 1.15s shake, reload and new-round reset');
}finally{await browser.close();}
