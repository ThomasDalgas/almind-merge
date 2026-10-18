import {test} from 'node:test';import assert from 'node:assert/strict';
import {roundLogText} from '../dist/admin/round-log.js';import {createScoreApi} from '../dist/leaderboard.js';
test('Admin shows counts and unknown history honestly',()=>{
 assert.match(roundLogText({}),/Rundelog ikke registreret/);
 const text=roundLogText({duration_ms:3661000,round_log:{drops:200,merges:180,svend_pairs:2,shakes:3,removals:4,version:'1.1.4',outcome:'gameover'}});
 for(const value of ['01:01:01','Game Over','1.1.4','200 drop','180 merges','2 Svend-par','3 Ryst','4 Fjern'])assert.ok(text.includes(value));
});
test('Log shares save request; absent migration falls back once, other errors stay retryable',async()=>{
 const calls=[],store={get:()=>JSON.stringify({access_token:'token',expires_at:Date.now()/1000+3600}),set:()=>{}};let error=null;
 const fetcher=async(url,options)=>{calls.push({url,args:JSON.parse(options.body)});return error&&url.endsWith('am_save_round_logged')?{ok:false,json:async()=>({code:error,message:'save failed'})}:{ok:true,json:async()=>2};};
 const api=createScoreApi({url:'https://test.example',key:'public'},{fetcher,store}),args=['r','Thomas',[['d',0,0]],1,{version:'1.1.4',gameOver:false}];
 await api.checkpoint(...args);assert.equal(calls.length,1);assert.equal(calls[0].args.p_kind,'checkpoint');assert.equal(calls[0].args.p_version,'1.1.4');
 error='42501';await assert.rejects(api.checkpoint(...args),/save failed/);assert.equal(calls.length,2);
 error='PGRST202';await api.checkpoint(...args);assert.equal(calls.length,4);assert.ok(calls.at(-1).url.endsWith('am_checkpoint_round'));
 await api.submit(...args);assert.equal(calls.length,5);assert.ok(calls.at(-1).url.endsWith('am_submit_round'));
});
