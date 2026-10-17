import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shotFrame,shotTiming} from '../dist/artilleri/presentation.js';
const result=ended=>({ended,hit:{path:Array.from({length:80},()=>[0,0,0])},motion:Array(60)});
test('hit notification is immediate, but next turn waits for effects and notice',()=>{
 const r=result(false),t=shotTiming(r);
 assert.equal(shotFrame(r,t.flightMs-1).showBanner,false);
 assert.equal(shotFrame(r,t.flightMs).showBanner,true);
 assert.equal(shotFrame(r,t.flightMs+1300).showBanner,false);
 assert.equal(shotFrame(r,t.totalMs-1).done,false);
 assert.equal(shotFrame(r,t.totalMs).done,true);
});
test('round battlefield stays locked through destruction and entire result hold',()=>{
 const r=result(true),t=shotTiming(r);
 assert.equal(shotFrame(r,t.flightMs+899).showBanner,false);
 assert.equal(shotFrame(r,t.flightMs+900).showBanner,true);
 for(let ms=t.flightMs+900;ms<t.totalMs;ms+=16){assert.equal(shotFrame(r,ms).done,false);assert.equal(shotFrame(r,ms).showBanner,true);}
 assert.equal(shotFrame(r,t.totalMs).showBanner,false);
 assert.equal(shotFrame(r,t.totalMs).done,true);
});
test('animation timing is independent of refresh rate and late frames',()=>{
 const r=result(true),t=shotTiming(r);
 for(const hz of [30,60,120]){let elapsed=0;while(!shotFrame(r,elapsed).done)elapsed+=1000/hz;assert.ok(elapsed>=t.totalMs&&elapsed<t.totalMs+1000/hz+1);}
 assert.equal(shotFrame(r,t.totalMs+10000).done,true);
});
