import test from 'node:test';import assert from 'node:assert/strict';import {createAdminApi} from '../dist/admin/api.js';
const store=()=>{const map=new Map([['almind-score-session:game','unchanged']]);return {map,getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const config={url:'https://example.test',key:'public'};
test('Admin OTP login is isolated from player sessions and uses authenticated RPC',async()=>{
 const storage=store(),calls=[];const api=createAdminApi({config,storage,fetcher:async(url,o)=>{calls.push({url,...o});return {ok:true,json:async()=>url.endsWith('/verify')?{access_token:'admin',refresh_token:'refresh',expires_in:3600}:{}};}});
 await api.sendCode('admin@example.test');assert.equal(JSON.parse(calls[0].body).create_user,false);
 await api.verifyCode('admin@example.test','123456');await api.rpc('ag_admin_me');assert.equal(calls.at(-1).headers.Authorization,'Bearer admin');
 await api.logout();assert.equal(api.signedIn,false);assert.equal(storage.map.get('almind-score-session:game'),'unchanged');assert.equal(storage.map.has('almindgames-admin-session-v1'),false);
});
test('Admin refresh is serialized and revoked sessions are cleared',async()=>{
 const storage=store();storage.setItem('almindgames-admin-session-v1',JSON.stringify({access_token:'expired',refresh_token:'r',expires_at:0}));let refreshes=0;
 const api=createAdminApi({config,storage,fetcher:async url=>{if(url.includes('refresh_token')){refreshes++;await new Promise(r=>setImmediate(r));return {ok:true,json:async()=>({access_token:'new',refresh_token:'next',expires_in:3600})};}return {ok:true,json:async()=>({})};}});
 await Promise.all([api.rpc('ag_admin_me'),api.rpc('ag_admin_players')]);assert.equal(refreshes,1);
 storage.setItem('almindgames-admin-session-v1',JSON.stringify({access_token:'expired',refresh_token:'r',expires_at:0}));const denied=createAdminApi({config,storage,fetcher:async()=>({ok:false,status:400,json:async()=>({message:'Revoked'})})});await assert.rejects(denied.rpc('ag_admin_me'),/Revoked/);assert.equal(denied.signedIn,false);
});
test('Logout cancels late login and RPC results',async()=>{
 const storage=store();let release;
 const api=createAdminApi({config,storage,fetcher:()=>new Promise(r=>release=r)});
 const login=api.password('a@b.test','secret');await api.logout();release({ok:true,json:async()=>({access_token:'a',refresh_token:'r',expires_in:3600})});await assert.rejects(login,/afbrudt/);assert.equal(api.signedIn,false);
});
