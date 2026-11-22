
import {test} from 'node:test';import assert from 'node:assert/strict';
import {preserveFinished,FINISHED_PREFIX} from '../dist/finished-rounds.js';
test('archives complete board and final journal under independent round keys',()=>{
 const data=new Map(),store={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)};
 for(const key of ['one','two'])preserveFinished(store,{round:{score:5000000},tiles:[{tier:8,x:100}],journal:{key,events:[['d',0,0]]}});
 assert.equal(data.size,2);const saved=JSON.parse(data.get(FINISHED_PREFIX+'one'));
 assert.equal(saved.finished,true);assert.equal(saved.journal.final,true);assert.deepEqual(saved.tiles,[{tier:8,x:100}]);
});
test('full or silently failing storage cannot authorize destructive transition',()=>{
 const snapshot={journal:{key:'one',events:[]}};
 assert.throws(()=>preserveFinished({setItem(){throw Error('quota')},getItem(){}},snapshot));
 assert.throws(()=>preserveFinished({setItem(){},getItem(){return null}},snapshot));
});

test('long journals preserve hidden power activation through compact storage',async()=>{
 const {forStorage,fromStorage}=await import('../dist/journal-storage.js');
 const events=Array.from({length:5000},(_,i)=>[i===100?'u':'d',0,i,i,0,0]);
 assert.deepEqual(fromStorage(forStorage({events})).events,events);
});
