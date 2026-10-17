import {test} from 'node:test';import assert from 'node:assert/strict';import {shotCamera} from '../dist/artilleri/camera.js';
const base={path:[[100,390,0],[480,-90,0],[855,400,0]],hit:{x:855,y:400},flightMs:1800};
const frame=(elapsed)=>({...base,elapsed,impactAge:Math.max(0,elapsed-1800)});
test('camera starts wide, closes on impact and returns before input unlock',()=>{
 assert.deepEqual(shotCamera(frame(0)),{x:480,y:270,zoom:1});
 assert.ok(shotCamera(frame(900),{mobile:true}).y<100);
 const impact=shotCamera(frame(1800),{mobile:true});assert.equal(impact.zoom,1.95);
 assert.deepEqual(shotCamera(frame(3400),{mobile:true}),{x:480,y:270,zoom:1});
});
test('camera is continuous at impact, constrained horizontally and respects reduced motion',()=>{
 const before=shotCamera(frame(1799),{mobile:true}),after=shotCamera(frame(1800),{mobile:true});assert.ok(Math.abs(before.x-after.x)<1);assert.ok(Math.abs(before.y-after.y)<1);assert.ok(Math.abs(before.zoom-after.zoom)<.01);
 for(let elapsed=0;elapsed<3500;elapsed+=10){const c=shotCamera(frame(elapsed),{mobile:true});assert.ok(c.x-480/c.zoom>=-.0001);assert.ok(c.x+480/c.zoom<=960.0001);}
 assert.deepEqual(shotCamera(frame(1800),{reducedMotion:true}),{x:480,y:270,zoom:1});
});
