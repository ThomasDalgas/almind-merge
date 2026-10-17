import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as rules from '../dist/artilleri/rules.js';
import {shotFrame,shotTiming} from '../dist/artilleri/presentation.js';
const source=readFileSync(new URL('../dist/artilleri/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function harness(){
 let now=0,id=0;const frames=new Map(),timers=new Map(),elements=new Map();
 function el(){return {value:'',disabled:false,hidden:false,textContent:'',innerHTML:'',classList:{toggle(){},remove(){}},style:{},setAttribute(){},append(){},addEventListener(){},getContext(){return {setTransform(){}}},click(){this.onclick?.();}};}
 const get=s=>{if(!elements.has(s))elements.set(s,el());return elements.get(s);};
 get('#angle').value='41';get('#power').value='100';get('#weapon').value='shell';get('#mode').value='standard';
 const context=vm.createContext({...rules,shotFrame,render(){},swipeAim(){},guidanceCharges(){return 0;},online:{},initDisplay:()=>({sync(){},enter(){},isActive:()=>true}),document:{querySelector:get,createElement:el,body:el(),hidden:false,addEventListener(){},activeElement:{tagName:'BODY'}},window:{devicePixelRatio:1,addEventListener(){}},performance:{now:()=>now},matchMedia:()=>({matches:false}),requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:i=>frames.delete(i),setTimeout:(f,ms)=>{timers.set(++id,{f,at:now+ms});return id;},clearTimeout:i=>timers.delete(i),setInterval:()=>0,clearInterval(){},localStorage:{getItem(){return null;}},console});
 vm.runInContext(source,context);
 const run=code=>vm.runInContext(code,context);
 const tick=ms=>{now=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f(now));for(const [key,t] of [...timers])if(t.at<=now){timers.delete(key);t.f();}};
 return {run,tick,get};
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
