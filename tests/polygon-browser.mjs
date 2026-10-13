import {chromium,BASE_URL} from './browser-runtime.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1120}});
try{
await page.goto(`${BASE_URL}/?test=1`);await page.waitForFunction(()=>window.__mergeTest?.ready);
const result=await page.evaluate(async()=>{
 const {tileOutline,tileRadius,tiles}=await import('/theme.js?v=tina-original'),{signedArea}=await import('/shapes.js'),{RADII}=await import('/rules.js');
 const t=window.__mergeTest;t.start();
 const tina=t.spawn(6,220,400),outline=tileOutline(6),r=tileRadius(6);
 const area=Math.abs(signedArea(outline))*r*r;
 const mapped=outline.map(v=>({x:tina.position.x+v.x*r-tina.plugin.artOffset.x,y:tina.position.y+v.y*r-tina.plugin.artOffset.y}));
 const actual=tina.parts.slice(1).flatMap(p=>p.vertices);
 const alignment=Math.max(...mapped.map(v=>Math.min(...actual.map(p=>Math.hypot(p.x-v.x,p.y-v.y)))));
 Matter.Body.setAngle(tina,.8);
 const a=.8,o=tina.plugin.artOffset;
 const rotated=outline.map(v=>({x:tina.position.x+(v.x*r-o.x)*Math.cos(a)-(v.y*r-o.y)*Math.sin(a),y:tina.position.y+(v.x*r-o.x)*Math.sin(a)+(v.y*r-o.y)*Math.cos(a)}));
 const rotatedError=Math.max(...rotated.map(v=>Math.min(...tina.parts.slice(1).flatMap(p=>p.vertices).map(p=>Math.hypot(p.x-v.x,p.y-v.y)))));
 t.start();t.spawn(5,210,350);t.spawn(5,212,350);t.advance(.1);
 const merged=t.state;
 t.start();for(const [i,x,y] of [[5,160,510],[3,270,540],[2,335,545],[4,98,510],[0,210,520]])t.spawn(i,x,y);t.advance(2);t.pause();
 return {name:tiles[6].name,parts:tina.parts.length,points:outline.length,areaError:Math.abs(tina.area-area),alignment,rotatedError,merged};
});
console.log(result);
assert.equal(result.name,'Tina');assert.ok(result.parts>2);assert.ok(result.points>8);
assert.ok(result.areaError<.01);assert.ok(result.alignment<.01);assert.ok(result.rotatedError<.01);
assert.equal(result.merged.bodies.length,1);assert.equal(result.merged.bodies[0].tier,6);assert.equal(result.merged.round.score,128);
console.log('PASS: Tina silhouette, rotation alignment, compound merge once');
await page.evaluate(()=>document.querySelector('#overlay').hidden=true);
await page.screenshot({path:'/tmp/almind-tina-playing.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/almind-tina-mobile.png',fullPage:true});
}finally{await browser.close();}
