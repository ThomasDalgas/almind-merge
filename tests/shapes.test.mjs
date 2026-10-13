import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {outlineFromAlpha,placeholderOutline,signedArea} from '../dist/shapes.js';
const context={};context.global=context;vm.runInNewContext(fs.readFileSync(new URL('../dist/assets/decomp.min.js',import.meta.url),'utf8'),context);globalThis.decomp=context.decomp;
const raster=(w,h,f)=>{const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a[(y*w+x)*4+3]=f(x,y)?255:0;return a;};
test('Opaque non-square images use correctly scaled rectangles',()=>{
 const p=outlineFromAlpha(raster(96,48,()=>true),96,48);assert.equal(p.length,4);assert.equal(Math.abs(signedArea(p)),2);assert.equal(Math.max(...p.map(v=>v.y)),.5);
});
test('A silhouette notch remains empty instead of becoming a convex hull',()=>{
 const p=outlineFromAlpha(raster(64,64,(x,y)=>x>=4&&x<60&&y>=4&&y<60&&!(x>35&&y>24&&y<40)),64,64);
 assert.ok(p.length>=8);assert.ok(decomp.isSimple(p.map(v=>[v.x,v.y])));assert.ok(p.some(v=>v.x===.125));
 const parts=decomp.quickDecomp(p.map(v=>[v.x,v.y]));assert.ok(parts.length>1);
});
test('Detached pixels ignored, transparent image rejected',()=>{
 const p=outlineFromAlpha(raster(64,64,(x,y)=>(x>20&&x<40&&y>20&&y<40)||(x===2&&y===2)),64,64);
 assert.equal(p.length,4);assert.ok(Math.min(...p.map(v=>v.x))>-.5);
 assert.throws(()=>outlineFromAlpha(new Uint8ClampedArray(64*64*4),64,64),/synlig/);
});
test('Every placeholder is a valid concave polygon',()=>{
 for(let i=0;i<12;i++){const p=placeholderOutline(i).map(v=>[v.x,v.y]);assert.ok(decomp.isSimple(p));assert.ok(decomp.quickDecomp(p).length>1);}
});
