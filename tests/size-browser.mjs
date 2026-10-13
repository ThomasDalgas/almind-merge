import {chromium} from '../.qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.goto('http://127.0.0.1:4173/?test=1');await page.waitForFunction(()=>window.__mergeTest?.ready);
 const result=await page.evaluate(async()=>{
  const {tiles,tileOutline,tileRadius}=await import('/theme.js'),{signedArea}=await import('/shapes.js');
  const areas=tiles.map((t,i)=>Math.abs(signedArea(tileOutline(i)))*tileRadius(i)**2);
  const gallery=tiles.map((t,i)=>Math.abs(signedArea(tileOutline(i)))*tileRadius(i,21+i*1.3)**2);
  const t=window.__mergeTest;t.start();t.spawn(0,100,480);t.spawn(1,190,480);t.spawn(2,300,480);t.advance(.5);
  const board=document.querySelector('.arena-wrap').getBoundingClientRect(),score=document.querySelector('.left-rail').getBoundingClientRect();
  return {areas,gallery,boardBottom:board.bottom,scoreTop:score.top,scoreBottom:score.bottom};
 });
 for(const list of [result.areas,result.gallery])assert.ok(list.every((v,i)=>!i||v>list[i-1]));
 assert.ok(result.areas[1]>2*result.areas[0]);
 assert.ok(result.scoreTop>=result.boardBottom);assert.ok(result.scoreBottom<=844);
 console.log('PASS all 11 silhouettes grow progressively; Silas >2x football area; mobile cards below game and visible');
 await page.screenshot({path:'.qa/new-sizes-mobile.png',fullPage:true});
}finally{await browser.close();}
