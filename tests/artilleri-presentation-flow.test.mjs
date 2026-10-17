import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as rules from '../dist/artilleri/rules.js';
import {shotFrame,shotTiming} from '../dist/artilleri/presentation.js';
const source=readFileSync(new URL('../dist/artilleri/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function harness(){
 let now=0,id=0;const frames=new Map(),timers=new Map(),elements=new Map(),listeners=new Map();
 function el(){return {value:'',disabled:false,hidden:false,textContent:'',innerHTML:'',classList:{toggle(){},remove(){}},style:{},setAttribute(){},append(){},addEventListener(){},getContext(){return {setTransform(){}}},click(){this.onclick?.();}};}
 const get=s=>{if(!elements.has(s))elements.set(s,el());return elements.get(s);};
 get('#angle').value='41';get('#power').value='100';get('#weapon').value='shell';get('#mode').value='standard';
 const context=vm.createContext({...rules,shotFrame,initOnlineLobby:()=>({}),createCombatAudio:()=>({enabled:true,unlock(){},begin(){},update(){},stop(){},finish(){},suspend(){},toggle(){}}),initWeaponPicker:()=>({sync(){},close(){}}),render(){},swipeAim(){},guidanceCharges(){return 0;},online:{},initDisplay:()=>({sync(){},enter(){},isActive:()=>true}),document:{querySelector:get,createElement:el,body:el(),hidden:false,addEventListener(type,fn){listeners.set(type,fn);},activeElement:{tagName:'BODY'}},window:{devicePixelRatio:1,addEventListener(){}},performance:{now:()=>now},matchMedia:()=>({matches:false}),requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:i=>frames.delete(i),setTimeout:(f,ms)=>{timers.set(++id,{f,at:now+ms});return id;},clearTimeout:i=>timers.delete(i),setInterval:()=>0,clearInterval(){},localStorage:{getItem(){return null;}},console});
 vm.runInContext(source,context);
 const run=code=>vm.runInContext(code,context);
 const tick=ms=>{now=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f(now));for(const [key,t] of [...timers])if(t.at<=now){timers.delete(key);t.f();}};
 return {run,tick,get,visibility(hidden){context.document.hidden=hidden;listeners.get('visibilitychange')?.();}};
}
test('actual app holds old round and disables fire until round card closes',async()=>{
 const h=harness();h.run("reset('local');game.shots=39;");await h.run("$('#fire').onclick()");
 const t=shotTiming(h.run('animation'));
 h.tick(t.flightMs);assert.equal(h.get('#fire').disabled,true);assert.equal(h.run('banner.hidden'),false);
 h.tick(t.flightMs+1000);assert.equal(h.run('shownGame().round'),1);assert.equal(h.run('game.round'),2);assert.equal(h.get('#fire').disabled,true);
 assert.match(h.run('banner.innerHTML'),/runde 1|uafgjort/);
 h.tick(t.totalMs-1);assert.equal(h.run('shownGame().round'),1);assert.equal(h.get('#fire').disabled,true);
 h.tick(t.totalMs);assert.equal(h.run('banner.hidden'),true);assert.equal(h.run('shownGame().round'),2);assert.equal(h.get('#fire').disabled,false);
});
test('reset cancels old AI timer and old animation callbacks',async()=>{
 const h=harness();h.run("reset('solo');game.turn=1;after();reset('local');");h.tick(1000);assert.equal(h.run('game.shots'),0);
 await h.run("$('#fire').onclick()");h.run("reset('local')");h.tick(20000);assert.equal(h.run('game.shots'),0);assert.equal(h.run('animation'),null);
});
test('online responses queue during result hold without releasing input',async()=>{
 const h=harness();h.run("reset('local');game.shots=39;");await h.run("$('#fire').onclick()");const t=shotTiming(h.run('animation'));
 h.tick(t.flightMs+1000);await h.run('sync({version:2})');assert.equal(h.run('queuedState.version'),2);assert.equal(h.get('#fire').disabled,true);assert.equal(h.run('shownGame().round'),1);
});

test('backgrounding pauses the animation clock instead of skipping impacts on return',async()=>{
 const h=harness();h.run("reset('local')");await h.run("$('#fire').onclick()");h.tick(100);h.visibility(true);h.tick(10000);h.visibility(false);assert.equal(h.run('resumePlayback.hidden'),false);h.run('resumeFromBackground()');h.tick(10100);assert.equal(h.run('animation.elapsed'),200);assert.equal(h.get('#fire').disabled,true);
});

function roomState(version=0,seat=0,ready=true){return {code:'AB12CD34',seed:1234,mode:'standard',host_name:'Anna',guest_name:'Bo',ready,seat,version,shots:Array.from({length:version},()=>({angle:48,power:66,weapon:'shell'}))};}
test('two clients replay identical shots and only the current seat can shoot',async()=>{
 const a=harness(),b=harness();
 for(const [h,seat] of [[a,0],[b,1]])await h.run(`sync(${JSON.stringify(roomState(0,seat))})`);
 assert.equal(a.get('#fire').disabled,false);assert.equal(b.get('#fire').disabled,true);
 for(const [h,seat] of [[a,0],[b,1]]){await h.run(`sync(${JSON.stringify(roomState(1,seat))})`);const t=shotTiming(h.run('animation'));h.tick(t.totalMs);}
 assert.equal(a.run('JSON.stringify(game)'),b.run('JSON.stringify(game)'));
 assert.equal(a.get('#fire').disabled,true);assert.equal(b.get('#fire').disabled,false);
 const rejoined=harness();await rejoined.run(`sync(${JSON.stringify(roomState(1,1))})`);
 assert.equal(rejoined.run('JSON.stringify(game)'),b.run('JSON.stringify(game)'));
});
test('waiting lobby retains code, blocks shooting and disappears when guest joins',async()=>{
 const h=harness(),waiting=JSON.stringify(roomState(0,0,false));await h.run(`sync(${waiting})`);await h.run(`sync(${waiting})`);
 assert.equal(h.get('#fire').disabled,true);assert.equal(h.run('lobby.hidden'),false);assert.match(h.run('lobby.innerHTML'),/Venter på modstander/);assert.match(h.get('#status').textContent,/Venter/);
 await h.run(`sync(${JSON.stringify(roomState())})`);assert.equal(h.run('lobby.hidden'),true);assert.equal(h.get('#fire').disabled,false);
});
