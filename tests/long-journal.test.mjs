import test from 'node:test';
import assert from 'node:assert/strict';
import {createScoreAutosave} from '../dist/score-autosave.js';
import {fromStorage,forStorage} from '../dist/journal-storage.js';
test('long mixed journal stays compact, resumes beyond 20k and finalizes its original ticket',async()=>{
 const events=Array.from({length:20000},(_,i)=>i%3===0?['d',0,i*500]:['m',1,i*500,i*450,i-1,0]);
 const data=new Map(),calls=[],store={keys:()=>[...data.keys()],get:k=>data.get(k),set:(k,v)=>data.set(k,v),remove:k=>data.delete(k)};
 const api={ready:true,start:async()=>'new',submit:async(...args)=>{calls.push(args);return 1;}};
 const options={api,store,now:()=>20000000};
 const old={key:'oldkey',nickname:'Test',version:'1.2.2',ticket:{id:'original',readyAt:0},events,duration:10000000,final:false};
 const s=createScoreAutosave(options);s.restore(old);
 assert.equal(s.event('s',0,10001,9000000,0,0),20001);
 const snap=JSON.parse(JSON.stringify(forStorage(s.snapshot())));
 assert.ok(JSON.stringify(snap).length<JSON.stringify(old).length*.7);
 const reopened=createScoreAutosave(options);reopened.restore(fromStorage(snap));
 await reopened.start('Test',10002);await reopened.flush();
 assert.equal(calls.length,1);assert.equal(calls[0][0],'original');assert.equal(calls[0][3],10002000);
 assert.deepEqual(calls[0][2],events);assert.deepEqual(calls[0][2].at(-1),['s',0,10001000,9000000,0,0]);
});
