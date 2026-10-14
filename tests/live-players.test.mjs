import {test} from 'node:test';import assert from 'node:assert/strict';
import {createLivePlayers,createLiveNotices} from '../dist/live-players.js';
const flush=()=>new Promise(r=>setImmediate(r));
test('A ticket arriving after pause never publishes the player as active',async()=>{
 let resolve;const ticket=new Promise(r=>resolve=r),calls=[],renders=[];let mode='playing';
 const live=createLivePlayers({api:{live:async(...args)=>{calls.push(args);return {players:[],records:[]};}},getTicket:()=>ticket,getState:()=>({mode,score:10,maxTier:1}),getNickname:()=> 'Thomas',render:(...r)=>renders.push(r),visible:()=>false,online:()=>true});
 live.changed();mode='paused';live.changed();resolve({id:'round'});await flush();assert.equal(calls.length,1);assert.equal(calls[0][4],false);assert.equal(renders.length,1);
});
test('A failed restart ticket retires old presence and never publishes new score to old round',async()=>{
 let ticket={id:'old'},mode='playing';const calls=[];
 const live=createLivePlayers({api:{live:async(...args)=>{calls.push(args);return {players:[]};},liveList:async()=>({players:[]})},getTicket:async()=>ticket,getState:()=>({mode,score:12,maxTier:1}),getNickname:()=> 'Thomas',render:()=>{},visible:()=>true,online:()=>true,interval:100000});
 live.changed();await flush();assert.equal(calls[0][4],true);ticket=null;live.changed();await flush();assert.equal(calls.length,2);assert.equal(calls[1][4],false);mode='over';live.changed();await flush();
});
test('An in-flight active response is ignored after pause; requests remain serialized',async()=>{
 let mode='playing',release;const calls=[],renders=[];
 const live=createLivePlayers({api:{live:(...args)=>{calls.push(args);if(calls.length===1)return new Promise(r=>release=r);return Promise.resolve({players:[]});}},getTicket:async()=>({id:'round'}),getState:()=>({mode,score:2,maxTier:0}),getNickname:()=>'',render:(data)=>renders.push(data),visible:()=>mode==='playing',online:()=>true});
 live.changed();await flush();mode='paused';live.changed();assert.equal(calls.length,1);release({players:[{nickname:'obsolete'}]});await flush();assert.equal(calls.length,2);assert.deepEqual(renders,[{players:[]}]);
});
test('Notices show for three seconds, then fold up; records queue and history/reconnect stay quiet',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const shown=[];let hidden=0,allowed=true;
 const notices=createLiveNotices({canNotify:()=>allowed,show:n=>shown.push(n.text),hide:()=>hidden++});
 const a={player_key:'a',nickname:'Thomas',is_me:true},b={player_key:'b',nickname:'Tina',is_me:false};
 const old={id:'old',nickname:'Svend',kind:'all',score:100};const next={id:'new',nickname:'Tina',kind:'week',score:90};
 notices.observe({players:[a],records:[old]},'connected');assert.equal(shown.length,0);
 notices.observe({players:[a,b],records:[old]},'connected');assert.match(shown[0],/Tina er online/);
 notices.observe({players:[a,b],records:[old,next]},'connected');t.mock.timers.tick(2999);assert.equal(hidden,0);assert.equal(shown.length,1);t.mock.timers.tick(1);assert.equal(hidden,1);t.mock.timers.tick(200);assert.match(shown[1],/ugerekord.*Tina/);
 notices.observe({players:[a,b],records:[old,next]},'connected');t.mock.timers.tick(3200);assert.equal(shown.length,2);
 notices.observe({},'offline');notices.observe({players:[a,b],records:[old,next]},'connected');assert.equal(shown.length,2);
 allowed=false;notices.observe({players:[a,b,{player_key:'c',nickname:'Rikke'}],records:[old,next]},'connected');t.mock.timers.tick(10000);assert.equal(shown.length,2);notices.clear();
});

test('Records keep priority when joins arrive during a fold; pause cancels all pending notices',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const shown=[];let hidden=0;
 const notices=createLiveNotices({canNotify:()=>true,show:n=>shown.push(n.kind),hide:()=>hidden++});
 const me={player_key:'me',nickname:'Mig',is_me:true},one={player_key:'one',nickname:'En'},two={player_key:'two',nickname:'To'};
 notices.observe({players:[me],records:[]},'connected');notices.observe({players:[me,one],records:[]},'connected');
 notices.observe({players:[me,one],records:[{id:'r',kind:'all',nickname:'En',score:100}]},'connected');
 t.mock.timers.tick(3000);notices.observe({players:[me,one,two],records:[{id:'r',kind:'all',nickname:'En',score:100}]},'connected');t.mock.timers.tick(200);assert.deepEqual(shown,['join','record']);
 notices.clear();t.mock.timers.tick(10000);assert.deepEqual(shown,['join','record']);assert.ok(hidden>=2);
});

test('Live polling uses 5 seconds while playing, 15 while paused, and stops when hidden',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let mode='playing',shown=true;const calls=[];
 const live=createLivePlayers({api:{live:async(...args)=>{calls.push(args);return {players:[]};},liveList:async()=>({players:[]})},getTicket:async()=>({id:'r'}),getState:()=>({mode,score:2,maxTier:0}),getNickname:()=> 'Thomas',render:()=>{},visible:()=>shown,online:()=>true});
 live.changed();await flush();assert.equal(calls.length,1);
 t.mock.timers.tick(4999);await flush();assert.equal(calls.length,1);t.mock.timers.tick(1);await flush();assert.equal(calls.length,2);
 mode='paused';live.changed();await flush();assert.equal(calls.length,3);assert.equal(calls.at(-1)[4],false);
 t.mock.timers.tick(14999);await flush();assert.equal(calls.length,3);t.mock.timers.tick(1);await flush();assert.equal(calls.length,4);
 shown=false;live.changed();await flush();const count=calls.length;t.mock.timers.tick(60000);await flush();assert.equal(calls.length,count);
});

test('Own presence failure still displays public players with an honest status',async()=>{
 let mode='playing';const renders=[];
 const snapshot={players:[{nickname:'Niklas',score:123}],records:[]};
 const live=createLivePlayers({api:{live:async()=>{throw new Error('Unknown round');},liveList:async()=>snapshot},getTicket:async()=>({id:'r'}),getState:()=>({mode,score:4,maxTier:1}),getNickname:()=> 'Thomas',render:(...args)=>renders.push(args),visible:()=>false,online:()=>true});
 live.changed();await flush();assert.equal(renders[0][1],'readonly');assert.deepEqual(renders[0][0].players,snapshot.players);assert.equal(renders[0][0].connectionError,'Unknown round');
});
test('Fallback response is discarded after lifecycle change',async()=>{
 let mode='playing',release;const renders=[];
 const live=createLivePlayers({api:{live:async()=>{throw new Error('failure');},liveList:()=>new Promise(r=>release=r)},getTicket:async()=>null,getState:()=>({mode}),getNickname:()=>'',render:(...args)=>renders.push(args),visible:()=>false,online:()=>true});
 live.changed();await flush();mode='over';live.changed();release({players:[{nickname:'stale'}]});await flush();assert.equal(renders.length,0);release({players:[]});await flush();assert.equal(renders[0][1],'idle');
});
