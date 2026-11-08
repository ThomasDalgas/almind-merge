import test from 'node:test';
import assert from 'node:assert/strict';
import {chainMultiplier,createRound,mergeRound,SVEND_BONUS} from '../dist/rules.js';
test('only the newest merge is multiplied: 4 + 16 + 48',()=>{
 const r=createRound();let parent;
 for(let tier=0;tier<3;tier++){
  const at=tier*1500,depth=chainMultiplier(parent,null,at);
  mergeRound(r,tier,tier,depth);parent={at,depth};
 }
 assert.equal(r.score,68);
});
test('two-second boundary, longest live parent, cap and fixed Svend bonus',()=>{
 const a={at:1000,depth:2},b={at:2000,depth:5};
 assert.equal(chainMultiplier(a,null,3000),3);
 assert.equal(chainMultiplier(a,null,3001),1);
 assert.equal(chainMultiplier(a,b,3000),5);
 assert.equal(chainMultiplier(b,a,3000),5);
 const round=createRound(SVEND_BONUS);mergeRound(round,10,10,5);
 assert.equal(round.score,SVEND_BONUS);
});
