import {test} from 'node:test';import assert from 'node:assert/strict';import {shakeVelocity} from '../dist/shake-motion.js';
test('circular shake visits up right down left',()=>{
 const v=p=>shakeVelocity({x:0,y:0},p,300,593);
 assert.ok(v(0).y<0);assert.ok(v(2).x>0);assert.ok(v(4).y>0);assert.ok(v(6).x<0);
});
test('upward phase lifts floor pieces more; all velocity magnitudes stay bounded',()=>{
 assert.ok(shakeVelocity({x:0,y:0},0,593,593).y<shakeVelocity({x:0,y:0},0,300,593).y);
 for(let pulse=0;pulse<8;pulse++)for(const bottom of [300,570,593,610]){
  const v=shakeVelocity({x:10,y:12},pulse,bottom,593);
  assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y));assert.ok(Math.hypot(v.x,v.y)<=6.4*1.15+1e-10);
 }
});
