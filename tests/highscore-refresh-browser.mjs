import assert from 'node:assert/strict';
import {chromium,BASE_URL} from './browser-runtime.mjs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 let score=100,reads=0;
 await page.route('https://*.supabase.co/**',route=>{
  const url=route.request().url();
  if(url.endsWith('/am_leaderboard')){
   reads++;
   return route.fulfill({json:[{place:1,nickname:'Anden spiller',score,max_tier:1,is_me:false}]});
  }
  return route.fulfill({json:null});
 });
 await page.addInitScript(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('Test without fullscreen'));});
 await page.goto(BASE_URL+'/?test=1');
 await page.waitForFunction(()=>window.__mergeTest?.ready);
 await page.waitForFunction(()=>document.querySelector('.highscore-row b')?.textContent==='100');
 await page.evaluate(()=>window.__mergeTest.start());
 // Another device finishes a round while this browser is playing.
 score=200;
 await page.evaluate(()=>window.__mergeTest.pause());
 await page.waitForFunction(()=>document.querySelector('.highscore-row b')?.textContent==='200');
 await page.locator('#highscores').scrollIntoViewIfNeeded();
 await page.waitForTimeout(300);
 score=300;
 await page.waitForFunction(()=>document.querySelector('.highscore-row b')?.textContent==='300',{},{timeout:25000});
 score=400;
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.waitForFunction(()=>document.querySelector('.highscore-row b')?.textContent==='400');
 await page.evaluate(()=>window.__mergeTest.resume());
 await page.waitForTimeout(300);
 const before=reads;
 await page.waitForTimeout(15500);
 assert.equal(reads,before,'No leaderboard polling while playing');
 console.log('PASS: pause refresh, visible periodic refresh, reconnect refresh, no polling during play');
}finally{await browser.close();}
