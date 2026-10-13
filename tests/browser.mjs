import {chromium} from '../.qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1120}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
await page.goto('http://127.0.0.1:4173/?test=1');await page.waitForFunction(()=>window.__mergeTest);await page.screenshot({path:'.qa/desktop-ready.png',fullPage:true});
await page.locator('#play').click();await page.waitForFunction(()=>window.__mergeTest.state.mode==='playing');
await page.locator('#game').press('Space');assert.equal((await page.evaluate(()=>window.__mergeTest.state)).round.score,2);console.log('PASS: keyboard input drops a tile');
await page.evaluate(()=>window.__mergeTest.start());const rect=await page.locator('#game').boundingBox();await page.mouse.click(rect.x+rect.width*.3,rect.y+80);assert.equal((await page.evaluate(()=>window.__mergeTest.state)).round.score,2);console.log('PASS: pointer input drops a tile');
let state=await page.evaluate(()=>{const t=window.__mergeTest;t.start();t.drop();t.advance(1.2);t.drop();t.advance(3);t.pause();return t.state;});
assert.equal(state.round.score,8);assert.equal(state.bodies.length,1);assert.equal(state.bodies[0].tier,1);console.log('PASS: physical collision produces one merge and score 8');
state=await page.evaluate(()=>{const t=window.__mergeTest;t.start();t.spawn(0,200,500);t.spawn(0,220,500);t.spawn(0,240,500);t.advance(.1);t.pause();return t.state;});assert.equal(state.round.score,4);assert.equal(state.bodies.length,2);console.log('PASS: three-way collision consumes each tile at most once');
state=await page.evaluate(()=>{const t=window.__mergeTest;t.start();t.spawn(10,210,450);t.spawn(10,230,450);t.advance(.1);t.pause();return t.state;});
assert.equal(state.bodies.length,2);assert.ok(state.bodies.every(b=>b.tier===10));assert.equal(state.round.score,0);console.log('PASS: final Svend tiles remain after contact');
state=await page.evaluate(()=>{const t=window.__mergeTest;t.start();const b=t.spawn(0,200,70);Matter.Body.setStatic(b,true);t.advance(4.9);const before=t.state.mode;t.advance(.2);return {before,after:t.state.mode};});assert.deepEqual(state,{before:'playing',after:'over'});console.log('PASS: game over after 5 seconds above line');
await page.evaluate(()=>{const t=window.__mergeTest;t.start();t.drop();t.pause();});const before=await page.evaluate(()=>window.__mergeTest.state.time);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__mergeTest.state.time),before);console.log('PASS: pause freezes simulation');
await page.evaluate(()=>{const t=window.__mergeTest;t.start();for(const [tier,x,y] of [[4,100,540],[3,180,548],[2,245,561],[3,303,550],[1,367,561],[2,225,498],[0,280,505]])t.spawn(tier,x,y);t.advance(.2);});
await page.screenshot({path:'.qa/desktop-playing.png',fullPage:true});
assert.equal(await page.locator('#workshop-open,#workshop,input[type=file]').count(),0);console.log('PASS: public game has no custom tile editor');
await page.evaluate(()=>document.querySelector('#toast').hidden=true);
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const t=window.__mergeTest;t.start();for(const [i,x] of [[2,90],[3,160],[1,230],[2,295],[0,360]])t.spawn(i,x,535);t.advance(.7);});await page.screenshot({path:'.qa/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
assert.deepEqual(errors,[]);console.log('PASS: no browser JavaScript errors');
}finally{await browser.close();}
