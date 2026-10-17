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
test('Concurrent first requests share one identity and a reloaded browser reuses it',async()=>{
 const data=new Map(),store={get:k=>data.get(k),set:(k,v)=>data.set(k,v)},calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});await new Promise(r=>setImmediate(r));return {ok:true,json:async()=>url.includes('/signup')?{access_token:'same',refresh_token:'refresh',expires_at:Date.now()/1000+3600,user:{id:'stable-player'}}:'round'};};
 const config={url:'https://test.example',key:'public'},api=createScoreApi(config,{fetcher,store});
 await Promise.all([api.start(),api.start()]);await createScoreApi(config,{fetcher,store}).start();
 assert.equal(calls.filter(c=>c.url.includes('/signup')).length,1);assert.equal(calls.at(-1).options.headers.Authorization,'Bearer same');
});
test('Missing Game Over migration falls back to saving, but server failures stay retryable',async()=>{
 const calls=[],store={get:()=>JSON.stringify({access_token:'token',expires_at:Date.now()/1000+3600}),set:()=>{}};let code='PGRST202';
 const fetcher=async(url)=>{calls.push(url);return url.endsWith('am_game_over')?{ok:false,json:async()=>({code,message:'test error'})}:{ok:true,json:async()=>2};};
 const api=createScoreApi({url:'https://test.example',key:'public'},{fetcher,store});assert.equal(await api.gameOver('r','Niklas',[['d',0,0]],1),2);assert.ok(calls.at(-1).endsWith('am_submit_round'));
 code='42501';const count=calls.length;await assert.rejects(api.gameOver('r','Niklas',[],1),/test error/);assert.equal(calls.length,count+1);
});
test('Leaderboard metadata falls back only when the new database function is missing',async()=>{
 const calls=[],store={get:()=>null,set:()=>{}};let code='PGRST202';const row={nickname:'Thomas',score:2,achieved_at:'2026-10-17T10:00:00Z'};
 const fetcher=async url=>{calls.push(url);return url.endsWith('am_leaderboard_v2')?{ok:false,json:async()=>({code,message:'test error'})}:{ok:true,json:async()=>[row]};};
 const api=createScoreApi({url:'https://test.example',key:'public'},{fetcher,store});assert.deepEqual(await api.list('all'),[row]);assert.ok(calls.at(-1).endsWith('am_leaderboard'));code='42501';const count=calls.length;await assert.rejects(api.list('all'),/test error/);assert.equal(calls.length,count+1);
});
