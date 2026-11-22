import {test} from 'node:test';import assert from 'node:assert/strict';import {summarizeRound} from '../dist/round-stats.js';
test('stats count Svend pairs once in merges and exclude activation',()=>{
 const s=summarizeRound({score:123,maxTier:10},{events:[['d',0],['m',9],['b',10],['s',0],['r',0],['u',0]]},1000);
 assert.deepEqual(s.round_log,{drops:1,merges:2,svend_pairs:1,shakes:1,removals:1,actions:5,partial:false});
});
test('missing and recovered logs are never presented as complete history',()=>{
 assert.equal(summarizeRound({score:10},null,1).round_log,null);
 assert.equal(summarizeRound({score:10},{events:[],recovery:'id'},1).round_log.partial,true);
 assert.equal(summarizeRound({score:10},{events:[],invalid:true},1).round_log.partial,true);
});
