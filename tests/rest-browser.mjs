import {chromium,BASE_URL} from './browser-runtime.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.addInitScript(()=>localStorage.setItem('almind-score-nickname','Testspiller'));
await page.route('https://*.supabase.co/**',r=>r.abort());
await page.goto(`${BASE_URL}/?test=1`);await page.waitForFunction(()=>window.__mergeTest?.ready);
const result=await page.evaluate(()=>{
 const t=window.__mergeTest;t.start();
 const support=Matter.Bodies.rectangle(220,420,140,20,{isStatic:true});Matter.Composite.add(t.engine.world,support);
 const ball=t.spawn(0,220,340);t.advance(5);const before=ball.position.y;
 Matter.Composite.remove(t.engine.world,support);t.advance(1);const fall=ball.position.y-before;
 t.start();const wallBall=t.spawn(0,45,250);Matter.Body.setVelocity(wallBall,{x:-2,y:0});t.advance(3);const wallBottom=wallBall.bounds.max.y;
 t.start();const masses=[];for(let i=0;i<11;i++){const b=t.spawn(i,220,350);masses.push(b.mass);}t.start();
 // Begin with penetration, as happens when a merge creates a larger silhouette.
 const a=t.spawn(0,220,540),b=t.spawn(6,220,530);t.advance(4);
 const penetration=Math.max(0,...Matter.Query.collides(a,[b]).map(c=>c.depth));
 t.start();for(let row=0;row<3;row++)for(let col=0;col<4;col++)t.spawn((col+row*2)%6,80+col*90,540-row*100);
 const begin=performance.now();t.advance(12);const duration=performance.now()-begin;
 const pile=Matter.Composite.allBodies(t.engine.world).filter(b=>b.plugin.tile);
 const positions=pile.map(b=>({...b.position}));t.advance(3);
 const drift=Math.max(0,...pile.map((b,i)=>Math.hypot(b.position.x-positions[i].x,b.position.y-positions[i].y)));
 // Measure actual intersection area: SAT depth is misleading for narrow concave parts.
const polygonArea=vs=>Math.abs(vs.reduce((s,a,i)=>{const b=vs[(i+1)%vs.length];return s+a.x*b.y-a.y*b.x;},0)/2);
function intersectionArea(subject,clip){let points=subject.map(p=>({x:p.x,y:p.y}));for(let i=0;i<clip.length&&points.length;i++){const a=clip[i],b=clip[(i+1)%clip.length],side=p=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);const input=points;points=[];for(let j=0;j<input.length;j++){const p=input[j],q=input[(j+1)%input.length],sp=side(p),sq=side(q);if(sp>=0)points.push(p);if((sp>=0)!==(sq>=0)){const f=sp/(sp-sq);points.push({x:p.x+f*(q.x-p.x),y:p.y+f*(q.y-p.y)});}}}return polygonArea(points);}
const parts=b=>b.parts.length>1?b.parts.slice(1):[b];
if(Math.abs(intersectionArea(parts(pile[0])[0].vertices,parts(pile[0])[0].vertices)-parts(pile[0])[0].area)>.01)throw new Error('Invalid overlap measurement');
let maxOverlap=0;for(let i=0;i<pile.length;i++)for(let j=i+1;j<pile.length;j++){let area=0;for(const a of parts(pile[i]))for(const b of parts(pile[j]))area+=intersectionArea(a.vertices,b.vertices);maxOverlap=Math.max(maxOverlap,area/Math.min(pile[i].area,pile[j].area));}

 const active=pile.every(b=>!b.isSleeping),mode=t.state.mode;
 t.start();const milestones=[];for(const score of [0,5999,6000,6000,11999,12000,18000,24000,42000]){t.setScore(score);milestones.push({score,...t.state.powers});}
 t.start();const reset=t.state.powers;
 return {fall,wallBottom,masses,penetration,drift,maxOverlap,active,mode,stepMs:duration/720,milestones,reset};
});
console.log(JSON.stringify(result,null,2));
assert.ok(result.fall>100,'unsupported ball must fall without another impact');
assert.ok(result.wallBottom>590&&result.wallBottom<595,'ball must slide down the wall to the floor');
assert.ok(result.masses.every((m,i)=>i===0||m>result.masses[i-1]),'larger figures must be heavier');
assert.ok(result.penetration<1,'spawn penetration must resolve');assert.ok(result.maxOverlap<.01,'resting silhouettes must overlap by less than 1% of the smaller figure');
assert.ok(result.drift<3,'pile settles while remaining responsive');assert.ok(result.active);assert.equal(result.mode,'playing');
assert.deepEqual(result.milestones.map(({shake,remove})=>({shake,remove})),[{shake:1,remove:1},{shake:1,remove:1},{shake:1,remove:2},{shake:1,remove:2},{shake:1,remove:2},{shake:2,remove:2},{shake:2,remove:3},{shake:3,remove:3},{shake:4,remove:5}]);assert.deepEqual(result.reset,{shake:1,remove:1});
console.log('PASS unsupported fall, wall sliding, mass, overlap resolution, settling and alternating rewards');
}finally{await browser.close();}
