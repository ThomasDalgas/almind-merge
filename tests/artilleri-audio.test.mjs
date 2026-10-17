import {test} from 'node:test';import assert from 'node:assert/strict';
import {createCombatAudio} from '../dist/artilleri/audio.js';import {shotTiming,shotFrame} from '../dist/artilleri/presentation.js';
const result={actor:0,weapon:'shell',ended:false,hit:{x:800,path:Array.from({length:40},()=>[0,0,0])},before:[{hp:100,x:100},{hp:100,x:800}],impactPlayers:[{hp:100},{hp:0}],motion:[]};
function setup(){const starts=[],stops=[],contexts=[];const param=()=>({value:0,setTargetAtTime(){}}),node=()=>({connect(){},disconnect(){}});
 class Audio{constructor(){this.state='suspended';this.sampleRate=8000;this.currentTime=0;this.destination=node();contexts.push(this);}createGain(){return {...node(),gain:param()};}createDynamicsCompressor(){return {...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}createBuffer(ch,n,rate){const data=new Float32Array(n);return {duration:n/rate,getChannelData:()=>data};}createBufferSource(){const source={...node(),playbackRate:param(),start(){starts.push(this);},stop(){stops.push(this);}};return source;}resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}}
 globalThis.window={AudioContext:Audio};globalThis.localStorage={getItem:()=>null,setItem(){}};return {starts,stops,contexts};}
test('sound unlocks from gesture, impact/breakup fire once, mute and reset stop voices',()=>{
 const {starts,stops}=setup(),audio=createCombatAudio();audio.unlock();audio.begin(result);audio.update(0,shotFrame(result,0));const launch=starts.length;audio.update(0,shotFrame(result,0));assert.equal(starts.length,launch);
 const {flightMs}=shotTiming(result);audio.update(flightMs,shotFrame(result,flightMs));const hit=starts.length;audio.update(flightMs+1,shotFrame(result,flightMs+1));assert.equal(starts.length,hit);audio.update(flightMs+100,shotFrame(result,flightMs+100));assert.equal(starts.length,hit+1);
 audio.toggle();const muted=starts.length;audio.update(flightMs+200,shotFrame(result,flightMs+200));assert.equal(starts.length,muted);assert.ok(stops.length>0);audio.stop();
});
test('returning from background rebuilds interrupted iOS context on next gesture',()=>{
 const {contexts}=setup(),audio=createCombatAudio();audio.unlock();const old=contexts[0];audio.suspend();audio.unlock();assert.equal(old.state,'closed');assert.equal(contexts.length,2);assert.equal(contexts[1].state,'running');
});
