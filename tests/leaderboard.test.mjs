import {test} from 'node:test';import assert from 'node:assert/strict';
import {createScoreApi,validNickname} from '../dist/leaderboard.js';
test('Nicknames accept Danish names but reject markup, newlines and excessive length',()=>{for(const s of ['Søren','Anne-Marie','A B','Thomas_2'])assert.ok(validNickname(s));for(const s of ['A','<img>','A\nB','x'.repeat(21)])assert.equal(validNickname(s),false);});
test('Browsing stays anonymous; one saved identity is reused for authenticated RPCs',async()=>{
 const data=new Map(),store={get:k=>data.get(k),set:(k,v)=>data.set(k,v)},calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});const result=url.includes('/signup')?{access_token:'token',refresh_token:'refresh',expires_at:Date.now()/1000+3600,user:{id:'user'}}:url.endsWith('am_start_round')?'round':[];return {ok:true,json:async()=>result};};
 const api=createScoreApi({url:'https://test.example',key:'public-test'},{fetcher,store});await api.list('week');assert.equal(calls.length,1);assert.equal(calls[0].options.headers.Authorization,undefined);
 assert.equal(await api.start(),'round');await api.start();assert.equal(calls.filter(c=>c.url.includes('/signup')).length,1);assert.equal(calls.at(-1).options.headers.Authorization,'Bearer token');
 await api.submit('round','Thomas',[['d',0,0]],20);const args=JSON.parse(calls.at(-1).options.body);assert.deepEqual(args.p_events,[['d',0,0]]);assert.equal('score' in args,false);
});
test('Expired identity is refreshed rather than replaced with a new player',async()=>{const store={get:()=>JSON.stringify({access_token:'old',refresh_token:'refresh',expires_at:1}),set:()=>{}},calls=[];const fetcher=async(url)=>{calls.push(url);return {ok:true,json:async()=>url.includes('/token?')?{access_token:'new',refresh_token:'next',expires_in:3600,user:{id:'same'}}:'round'};};await createScoreApi({url:'https://test.example',key:'public'},{fetcher,store}).start();assert.ok(calls[0].includes('grant_type=refresh_token'));assert.equal(calls.some(c=>c.includes('signup')),false);});
