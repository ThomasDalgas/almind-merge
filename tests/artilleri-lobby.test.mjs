import {test} from 'node:test';import assert from 'node:assert/strict';import {initOnlineLobby} from '../dist/artilleri/lobby.js';
test('lobby loads existing identity without claiming a name; invites require acceptance',async()=>{
 const originals={document:globalThis.document,localStorage:globalThis.localStorage,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
 const nodes=new Map();const node=()=>({children:[],value:'standard',hidden:false,append(...a){this.children.push(...a);},replaceChildren(){this.children=[];}});const get=s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);};
 globalThis.document={querySelector:get,createElement:node,hidden:false};globalThis.localStorage={getItem:()=>null};globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
 let state={players:[{id:'other',name:'Anna'}],invitations:[],pairing:[]},starts=0;const calls=[];
 const api={profile:async()=>({nickname:'Thomas',claimed:true}),rpc:async(name,args)=>{calls.push([name,args]);if(name==='aa_lobby')return state;if(name==='aa_reply')return {code:'internal'};if(name==='aa_pair_start')return {id:'pair',digits:'07'};}};
 try{const lobby=initOnlineLobby({api,onStart:async()=>{starts++;},onProfile(){},isAvailable:()=>true});await new Promise(resolve=>setImmediate(resolve));assert.equal(get('#name').value,'Thomas');assert.equal(get('#name').readOnly,true);assert.equal(starts,0);
 await get('#online-players').children[0].onclick();assert.equal(calls.some(([n])=>n==='aa_invite'),true);assert.equal(starts,0);
 state={players:[],invitations:[{id:'invite',name:'Anna',incoming:true,status:'pending'}],pairing:[]};await lobby.refresh();await get('#online-notices').children[0].children[1].onclick();assert.equal(starts,1);assert.equal(calls.some(([n])=>n==='am_claim_name'),false);
 get('#profile-switch').onclick();get('#name').value='Thomas';await get('#profile-connect').onclick();assert.match(get('#online-status').textContent,/07/);assert.match(get('#online-status').textContent,/godkend/);lobby.stop();
 }finally{Object.assign(globalThis,originals);}
});
