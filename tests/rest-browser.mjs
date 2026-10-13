import {chromium} from '../.qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
await page.goto('http://127.0.0.1:4173/?test=1');await page.waitForFunction(()=>window.__mergeTest?.ready);
const result=await page.evaluate(()=>{
 const t=window.__mergeTest;t.start();
 for(let row=0;row<3;row++)for(let col=0;col<4;col++)t.spawn((col+row*2)%6,80+col*90,540-row*100);
 t.advance(12);
 const pile=Matter.Composite.allBodies(t.engine.world).filter(b=>b.plugin.tile);
 const positions=pile.map(b=>({...b.position}));t.advance(3);
 const stable=pile.every((b,i)=>Math.hypot(b.position.x-positions[i].x,b.position.y-positions[i].y)<.01);
 const asleep=pile.every(b=>b.isSleeping);
 t.start();const floorTile=t.spawn(0,220,550);t.advance(4);const before=floorTile.isSleeping;
 let woke=false;Matter.Events.on(floorTile,'sleepEnd',()=>woke=true);
 t.spawn(1,floorTile.position.x,350);t.advance(2);
 const c=document.querySelector('.family canvas');
 return {stable,asleep,before,woke,ratio:c.width/c.getBoundingClientRect().width};
});
assert.ok(result.stable&&result.asleep);assert.ok(result.before&&result.woke);assert.ok(result.ratio>=2);
console.log('PASS: stack stationary for 3 seconds, new impact wakes resting tile, sharp retina gallery',result);
}finally{await browser.close();}
