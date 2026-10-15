import test from 'node:test';import assert from 'node:assert/strict';import {earnedPowers,createRewardNotices} from '../dist/reward-notices.js';
test('Alternating rewards only at 6000 intervals and multiple crossings counted once',()=>{
 assert.deepEqual(earnedPowers(0,5999),{level:0,shake:0,remove:0});assert.deepEqual(earnedPowers(0,6000),{level:1,shake:0,remove:1});assert.deepEqual(earnedPowers(1,12000),{level:2,shake:1,remove:0});assert.deepEqual(earnedPowers(2,12000),{level:2,shake:0,remove:0});assert.deepEqual(earnedPowers(0,18000),{level:3,shake:1,remove:2});
});
test('Rewards queue for 3 seconds each with sound, and clear on pause',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const shown=[],sounds=[];let hidden=0;
 const notices=createRewardNotices({show:n=>shown.push(n.text),sound:n=>sounds.push(n.text),hide:()=>hidden++,canShow:()=>true});
 notices.push({text:'Svend'});notices.push({text:'Ryst og Fjern'});assert.deepEqual(sounds,['Svend']);t.mock.timers.tick(2999);assert.equal(hidden,0);t.mock.timers.tick(1);assert.equal(hidden,1);t.mock.timers.tick(200);assert.deepEqual(shown,['Svend','Ryst og Fjern']);notices.clear();t.mock.timers.tick(10000);assert.equal(shown.length,2);assert.equal(hidden,2);
});
