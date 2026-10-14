import test from 'node:test';
import assert from 'node:assert/strict';
import {createDangerAudio} from '../dist/danger-audio.js';
function setup(load=()=>Promise.resolve({duration:15})){
 const sources=[];const ctx={currentTime:0,destination:{},createBufferSource(){const s={playbackRate:{},connect(){return this;},disconnect(){},start(...args){this.args=args;},stop(){this.stopped=true;}};sources.push(s);return s;},createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}};
 return {sources,ctx,audio:createDangerAudio({context:()=>ctx,load})};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('warning follows timer, rescue, pause, resume, mute and game over',async()=>{
 const {sources,ctx,audio}=setup();audio.sync(.02,true);await tick();assert.equal(sources.length,1);
 ctx.currentTime=2;audio.sync(2.02,true);assert.equal(sources.length,1);
 audio.sync(0,true);assert.equal(sources[0].stopped,true);
 audio.sync(.01,true);await tick();assert.equal(sources.length,2);
 audio.stop();assert.equal(sources[1].stopped,true);
 audio.sync(7,true);await tick();assert.equal(sources[2].args[1],7);
 audio.sync(7,false);assert.equal(sources[2].stopped,true);
 audio.sync(9,true);await tick();audio.sync(15,true);assert.equal(sources[3].stopped,true);
});
test('rescue cancels pending audio decode',async()=>{
 let resolve;const {audio,sources}=setup(()=>new Promise(r=>resolve=r));
 audio.sync(1,true);audio.sync(0,true);resolve({duration:15});await tick();assert.equal(sources.length,0);
});
test('when oldest danger disappears, warning follows remaining tile timer',async()=>{
 const {audio,sources}=setup();audio.sync(10,true);await tick();audio.sync(2,true);await tick();assert.equal(sources[0].stopped,true);assert.equal(sources[1].args[1],2);
});
