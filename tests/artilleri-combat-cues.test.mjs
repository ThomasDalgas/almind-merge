import {test} from 'node:test';import assert from 'node:assert/strict';
import {combatCues,clusterFlight,clusterSplit} from '../dist/artilleri/combat-cues.js';
import {shotTiming} from '../dist/artilleri/presentation.js';
const result={weapon:'cluster',ended:false,hit:{x:700,y:400,path:Array.from({length:51},(_,i)=>[100+i*12,400-Math.sin(i/50*Math.PI)*150,0])},before:[{hp:100},{hp:100}],impactPlayers:[{hp:100},{hp:0}],motion:[]};
test('cluster shell opens in flight and three pieces reach their actual blast positions',()=>{
 const {flightMs}=shotTiming(result),split=clusterSplit(result)*flightMs;
 assert.equal(clusterFlight(result,split-1)[0].carrier,true);
 assert.equal(clusterFlight(result,split+1).length,3);
 assert.equal(clusterFlight(result,flightMs).length,2);
 for(const [side,delay] of [[-1,130],[0,0],[1,200]]){const p=clusterFlight(result,flightMs+delay-.001).find(p=>p.side===side);assert.ok(p);assert.ok(Math.abs(p.x-(700+side*34))<.01);assert.ok(Math.abs(p.y-400)<.01);}
 assert.deepEqual(clusterFlight(result,flightMs+200),[]);
});
test('audio cues align with visual split and all three impacts; misses never explode',()=>{
 const cues=combatCues(result),{flightMs}=shotTiming(result);
 assert.equal(cues.find(c=>c.id==='split').at,flightMs*clusterSplit(result));
 assert.equal(cues.find(c=>c.id==='impact').at,flightMs);
 assert.equal(cues.find(c=>c.id==='cluster-left').at,flightMs+130);
 assert.equal(cues.find(c=>c.id==='cluster-right').at,flightMs+200);
 assert.equal(cues.find(c=>c.id==='breakup').at,flightMs+100);
 assert.equal(combatCues({...result,hit:{...result.hit,miss:true}}).some(c=>['impact','breakup','cluster-left'].includes(c.id)),false);
});
