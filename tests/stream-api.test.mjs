import test from 'node:test';
import assert from 'node:assert/strict';
import {createScoreApi} from '../dist/leaderboard.js';
import {forStorage,fromStorage} from '../dist/journal-storage.js';
test('long game resumes from acknowledged cursor; only last chunk finalizes',async()=>{
 let cursor=65000,finished=false;const actions=[];
 const api=createScoreApi({url:'https://game.test',key:'test'},{store:{get:()=>JSON.stringify({access_token:'test',expires_at:1e12}),set(){}},fetcher:async(url,req)=>{
  assert.ok(url.endsWith('am_stream_round'));const body=JSON.parse(req.body);
  actions.push(body.p_kind);
  if(body.p_events.length){assert.equal(body.p_offset,cursor);cursor+=body.p_events.length;}
  finished=body.p_kind==='submit';
  return {ok:true,json:async()=>({cursor,score:123,finished})};
 }});
 const ev=Array(68001).fill(['d',0,0]);assert.equal(await api.submit('ticket','Test',ev,3e9,{version:'1.4.0',gameOver:false}),123);
 assert.equal(cursor,68001);assert.deepEqual(actions,['part','part','part','submit']);
});
test('long-play local clock survives compression beyond five varint bytes',()=>{
 const events=Array(4096).fill(['d',0,2**36,2**36,0,0]);
 assert.deepEqual(fromStorage(forStorage({events})).events,events);
});
