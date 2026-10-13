import {chromium} from '../.qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
for(const [width,height] of [[390,844],[375,667],[667,375]]){
 const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 await page.goto('http://127.0.0.1:4173/?test=1');await page.waitForFunction(()=>window.__mergeTest?.ready);await page.locator('#play').tap();
 const box=await page.locator('#game').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height);
 const before=await page.evaluate(()=>({y:scrollY,drops:window.__mergeTest.state.round.drops}));
 const cdp=await page.context().newCDPSession(page);
 const x=box.x+box.width*.3,y=box.y+box.height*.6;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+40,y:y-90}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const after=await page.evaluate(()=>({y:scrollY,drops:window.__mergeTest.state.round.drops,locked:getComputedStyle(document.body).position==='fixed'}));
 assert.equal(after.y,before.y);assert.equal(after.drops,before.drops+1);assert.ok(after.locked);
 await page.screenshot({path:'.qa/touch-'+width+'.png',fullPage:true});
 await page.locator('#pause').tap();
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).position==='fixed'),false);
 await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
 assert.ok(await page.evaluate(()=>scrollY>0));
 console.log('PASS touch drag drops once, screen fits and stays locked, pause restores scroll',width,height);
 await page.close();
}
}finally{await browser.close();}
