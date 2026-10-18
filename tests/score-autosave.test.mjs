import {test} from 'node:test';import assert from 'node:assert/strict';
import {createScoreAutosave} from '../dist/score-autosave.js';
function fixture(){const data=new Map(),calls=[];let time=10000,offline=false;
 const store={keys:()=>[...data.keys()],get:k=>data.get(k),set:(k,v)=>data.set(k,v),remove:k=>data.delete(k)};
 const save=async(kind,...args)=>{if(offline)throw Error('offline');calls.push([kind,...args]);return 8;};
 const api={ready:true,start:async()=> 'round-'+Math.random(),checkpoint:(...a)=>save('checkpoint',...a),submit:(...a)=>save('submit',...a)};
 return {data,calls,store,api,now:()=>time,advance:n=>time+=n,offline:v=>offline=v};
}
test('checkpoint persists before upload; no duplicate uploads; final upload is separate',async()=>{
 const f=fixture(),s=createScoreAutosave(f);await s.start('Niklas');s.event('d',0,0);assert.equal(f.data.size,1);await s.flush();assert.equal(f.calls[0][0],'checkpoint');assert.equal(f.data.size,0);await s.flush();assert.equal(f.calls.length,1);
 s.event('d',0,.5);s.event('m',0,.7);s.end(.8);await new Promise(r=>setImmediate(r));assert.equal(f.calls.at(-1)[0],'submit');assert.equal(f.calls.at(-1)[3].length,3);
});
test('offline journal survives reload and uploads the original round and nickname',async()=>{
 const f=fixture(),s=createScoreAutosave(f);await s.start('Niklas');s.event('d',0,0);f.offline(true);await s.flush();assert.equal(f.data.size,1);
 const recovered=createScoreAutosave(f);f.offline(false);await recovered.flush();assert.equal(f.calls[0][2],'Niklas');assert.equal(f.data.size,0);
});
test('a new event arriving during upload remains queued',async()=>{
 const f=fixture();let resolve;f.api.checkpoint=()=>new Promise(r=>resolve=r);const s=createScoreAutosave(f);await s.start('Niklas');s.event('d',0,0);const saving=s.flush();s.event('d',0,.5);resolve(2);await saving;assert.equal(f.data.size,1);assert.equal(JSON.parse([...f.data.values()][0]).events.length,2);
});
test('starting another round never discards an unsent round',async()=>{
 const f=fixture(),s=createScoreAutosave(f);await s.start('Niklas');s.event('d',0,0);await s.start('Niklas');s.event('d',0,0);assert.equal(f.data.size,2);await s.flush();assert.deepEqual(f.calls.map(x=>x[0]),['submit','checkpoint']);assert.notEqual(f.calls[0][1],f.calls[1][1]);
});
test('Only fresh actual Game Over uses the event endpoint; restart and stale recovery stay quiet',async()=>{
 const f=fixture();f.api.gameOver=async(...a)=>{f.calls.push(['gameover',...a]);return 2;};
 const s=createScoreAutosave(f);await s.start('Niklas');s.event('d',0,0);s.end(.5);await new Promise(r=>setImmediate(r));assert.equal(f.calls[0][0],'gameover');
 await s.start('Niklas');s.event('d',0,0);await s.start('Niklas');await s.flush();assert.equal(f.calls.at(-1)[0],'submit');
 s.event('d',0,0);f.api.ready=false;s.end(.5);f.advance(61000);f.api.ready=true;await createScoreAutosave(f).flush();assert.equal(f.calls.at(-1)[0],'submit');
});
test('active duration checkpoints advance even without more scoring events',async()=>{
 const f=fixture();let seconds=0;f.getDuration=()=>seconds;const s=createScoreAutosave(f);await s.start('Thomas');s.event('d',0,0);await s.flush();assert.equal(f.calls.length,1);
 seconds=2;f.advance(2000);await s.flush();assert.equal(f.calls.length,2);assert.equal(f.calls.at(-1)[4],2000);await s.flush();assert.equal(f.calls.length,2,'unchanged paused time does not upload again');
});

test('Recovered log retains original version and actual Game Over even after notice expires',async()=>{
 const f=fixture();f.getVersion=()=> '1.1.4';const s=createScoreAutosave(f);await s.start('Thomas');s.event('d',0,0);f.api.ready=false;s.end(.5);f.advance(61000);f.api.ready=true;f.getVersion=()=> '2.0.0';await createScoreAutosave(f).flush();assert.deepEqual(f.calls.at(-1)[5],{version:'1.1.4',gameOver:true});
});
