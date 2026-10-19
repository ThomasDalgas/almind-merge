import test from 'node:test';import assert from 'node:assert/strict';
import {viewportBox,installViewport} from '../dist/safe-viewport.js';
test('visible screen follows Safari bars, scrolling and rotation',()=>{
 const props=new Map(),listeners={};
 const win={innerWidth:390,innerHeight:844,visualViewport:{width:390,height:700,offsetTop:44,offsetLeft:0,addEventListener:(k,fn)=>listeners[k]=fn},addEventListener:()=>{}};
 installViewport(win,{documentElement:{style:{setProperty:(k,v)=>props.set(k,v)}}});
 assert.equal(props.get('--app-height'),'700px');assert.equal(props.get('--app-top'),'44px');
 Object.assign(win.visualViewport,{width:844,height:390,offsetTop:0});listeners.resize();
 assert.equal(props.get('--app-width'),'844px');assert.equal(props.get('--app-height'),'390px');assert.equal(props.get('--app-top'),'0px');
 assert.deepEqual(viewportBox({innerWidth:1280,innerHeight:800}),{width:1280,height:800,left:0,top:0});
});
