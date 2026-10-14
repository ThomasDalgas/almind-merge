import {test} from 'node:test';import assert from 'node:assert/strict';
import {findBallEscape} from '../dist/ball-collision.js';
const bounds={left:0,right:100,floor:100},box=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
test('a deeply embedded ball escapes without crossing the floor or side wall',()=>{
 const q=findBallEscape({x:5,y:95},4,[box(0,80,20,20)],bounds);
 assert.ok(q);assert.ok(q.x>=4&&q.x<=96&&q.y<=96);assert.ok(q.x>24||q.y<76);
});
test('normal contacts and empty concave notches need no repair',()=>{
 assert.equal(findBallEscape({x:50,y:35.1},5,[box(40,40,20,20)],bounds),null);
 const notch=[{x:20,y:20},{x:80,y:20},{x:80,y:80},{x:60,y:80},{x:60,y:40},{x:40,y:40},{x:40,y:80},{x:20,y:80}];
 assert.equal(findBallEscape({x:50,y:65},5,[notch],bounds),null);
});
test('a neighbouring tile cannot become the escape destination',()=>{
 const q=findBallEscape({x:50,y:50},5,[box(40,40,20,20),box(20,20,20,60)],bounds);
 assert.ok(q);assert.ok(q.x>=45);assert.ok(q.x>65||q.y<35||q.y>65);
});
