import {test} from 'node:test';import assert from 'node:assert/strict';
test('Supabase void RPC succeeds with an empty body; server errors remain readable',async()=>{
 const oldFetch=globalThis.fetch,oldStorage=globalThis.localStorage;globalThis.localStorage={getItem:()=>JSON.stringify({access_token:'test',expires_at:Date.now()/1000+3600})};
 try{const api=await import('../dist/artilleri/online.js?empty-response-test');globalThis.fetch=async()=>({ok:true,text:async()=>''});assert.equal(await api.rpc('aa_pair_reply'),null);
 globalThis.fetch=async()=>({ok:true,text:async()=>'{"claimed":true}'});assert.deepEqual(await api.profile(),{claimed:true});
 globalThis.fetch=async()=>({ok:false,status:400,text:async()=>'{"message":"Expired","code":"P0001"}'});await assert.rejects(api.rpc('aa_pair_reply'),e=>e.message==='Expired'&&e.code==='P0001');
 }finally{globalThis.fetch=oldFetch;globalThis.localStorage=oldStorage;}
});
