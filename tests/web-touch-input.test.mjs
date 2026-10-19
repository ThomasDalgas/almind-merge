import test from 'node:test';
import assert from 'node:assert/strict';
import {installTouchInputGuard} from '../site/merge-3d-test/touch-input.js';
test('web touch keeps relative gestures without duplicate absolute mouse motion',()=>{
 const target=new EventTarget(), seen=[];
 installTouchInputGuard(target);
 for(const type of ['pointermove','touchstart','touchmove','touchend'])target.addEventListener(type,e=>seen.push([e.type,e.pointerType]));
 const send=(type,pointerType)=>{const e=new Event(type,{cancelable:true});if(pointerType)Object.defineProperty(e,'pointerType',{value:pointerType});target.dispatchEvent(e);assert.equal(e.defaultPrevented,false)};
 send('touchstart');send('pointermove','touch');send('touchmove');send('touchend');
 assert.deepEqual(seen.map(x=>x[0]),['touchstart','touchmove','touchend']);
 send('pointermove','mouse');send('pointermove','pen');
 assert.deepEqual(seen.slice(-2),[['pointermove','mouse'],['pointermove','pen']]);
});
