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

  await p.evaluate(()=>{__mergeTest.drop();__mergeTest.setScore(5000002);__mergeTest.end();});
  const saved=await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('almind-finished-round:')).map(k=>JSON.parse(localStorage.getItem(k))));
  assert.equal(saved.length,1);assert.equal(saved[0].round.score,5000002);assert.ok(saved[0].tiles.length);
  assert.equal(await p.evaluate(()=>__mergeTest.state.mode),'over');
  await p.reload();await p.waitForFunction(()=>__mergeTest?.ready);
  assert.equal(await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('almind-finished-round:')).length),1);
  await p.locator('details').filter({has:p.locator('#export-finished')}).locator('summary').click();
  const download=p.waitForEvent('download');await p.locator('#export-finished').click();
  assert.equal((await download).suggestedFilename(),'Almind-Merge-afsluttede-runder.json');
  assert.deepEqual(errors,[]);await ctx.close();
 }
 console.log('PASS full finished snapshot survives Game Over and reload; export available on phone and tablet');
}finally{await browser.close();}
