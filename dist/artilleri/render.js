import {clusterFlight} from './combat-cues.js?v=terrain-14';
import {drawTank,drawBlast} from './tank-visuals.js?v=terrain-14';
import {W,H,trace,terrain,materialAt} from './rules.js?v=terrain-14';
const assets={};for(const [key,name] of Object.entries({hull:'tank-hull-v2.webp',cannon:'tank-cannon-v2.webp',cloud:'cloud-bank-v2.webp',backdrop:'mountain-backdrop-v2.webp',pine:'pine-photoreal.png',soil:'soil-texture-v2.webp',rock:'rock-texture-v2.webp'})){const img=new Image();img.src=new URL('./assets/'+name,import.meta.url).href;img.onload=()=>window.dispatchEvent(new Event('artillery-assets-loaded'));assets[key]=img;}
const ready=name=>assets[name].complete&&assets[name].naturalWidth>0;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function line(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function sky(c,wind=0,time=0){if(ready('backdrop')){c.drawImage(assets.backdrop,0,0,W,H);const tint=c.createLinearGradient(0,0,0,H);tint.addColorStop(0,'#63749312');tint.addColorStop(.55,'#8a81901a');tint.addColorStop(1,'#ad765a40');c.fillStyle=tint;c.fillRect(0,0,W,H);}else{const bg=c.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#365e86');bg.addColorStop(.7,'#b2c0b9');bg.addColorStop(1,'#d7b291');c.fillStyle=bg;c.fillRect(0,0,W,H);}c.save();for(let i=0;i<4;i++){const span=W+360,drift=wind*time*(1.8+i*.4),x=((i*307-140+drift+span*8)%span+span)%span-260,y=54+(i%3)*48,w=245+(i%2)*80,h=w*.265;if(ready('cloud')){c.globalAlpha=.18+(i%3)*.045;c.drawImage(assets.cloud,x,y,w,h);}else{c.globalAlpha=.12;c.fillStyle='#f2e8dc';c.beginPath();c.ellipse(x+w*.5,y+h*.6,w*.45,h*.22,0,0,Math.PI*2);c.fill();}}c.restore();}
function rockCover(seed,round,x){const phase=((seed>>>0)%997)/997*6.28+round*.37,ridge=Math.sin(x/88+phase)+.38*Math.sin(x/31-phase*1.3);return clamp((ridge-.22)/.52,0,1);}
function ground(c,g,seed,round){c.save();c.beginPath();c.moveTo(0,H);c.lineTo(0,g[0]);for(let x=1;x<W;x+=2)c.lineTo(x,g[x]);c.lineTo(W,H);c.closePath();c.clip();const soil=c.createLinearGradient(0,330,0,H);soil.addColorStop(0,'#746751');soil.addColorStop(.32,'#684d3d');soil.addColorStop(1,'#3e3535');c.fillStyle=soil;c.fillRect(0,0,W,H);if(ready('soil')){c.globalAlpha=.47;c.fillStyle=c.createPattern(assets.soil,'repeat');c.fillRect(0,0,W,H);c.globalAlpha=1;}
for(let i=0;i<185;i++){const x=(i*617.37+seed%211)%W,y=335+(i*237.63)%225,r=3+(i*13)%21;c.globalAlpha=.025+(i%4)*.008;c.fillStyle=i%3?'#ceb897':'#162729';c.beginPath();c.ellipse(x,y,r,r*.32,(i%5)*.26,0,Math.PI*2);c.fill();}c.globalAlpha=1;
const rockPattern=ready('rock')?c.createPattern(assets.rock,'repeat'):null;for(let x=0;x<W;x++){const cover=rockCover(seed,round,x);if(cover<.015)continue;const y=g[x];c.globalAlpha=cover*.86;c.fillStyle=rockPattern||'#878b83';c.fillRect(x,y,1,H-y);}c.globalAlpha=1;
for(let i=0;i<520;i++){const x=(i*379.71+seed%313)%W,y=325+(i*97.19)%225,size=.35+(i%7)*.17;c.fillStyle=i%4===0?'#d0bd9b26':'#18232324';c.beginPath();c.arc(x,y,size,0,Math.PI*2);c.fill();}for(let n=0;n<130;n++){const x=(n*137+seed%83)%W,y=g[x]+4+(n%9)*9;if(rockCover(seed,round,x)<.35)continue;c.strokeStyle='#1a202666';c.lineWidth=.7;c.beginPath();c.moveTo(x-8,y-5);c.lineTo(x,y);c.lineTo(x+4,y+13);c.lineTo(x+13,y+18);c.stroke();c.strokeStyle='#d5cabb40';c.beginPath();c.moveTo(x-7,y-6);c.lineTo(x+1,y-1);c.stroke();}c.restore();
const path=()=>{c.beginPath();c.moveTo(0,g[0]);for(let x=1;x<W;x+=2)c.lineTo(x,g[x]);};c.lineCap='round';c.lineJoin='round';path();c.strokeStyle='#272b25b8';c.lineWidth=2;c.stroke();
for(let x=3;x<W-4;x+=2){const cover=rockCover(seed,round,x),y=g[x];if(cover>.38){c.strokeStyle=`rgba(134,139,131,${Math.min(.92,cover*.82)})`;c.lineWidth=1.2;c.beginPath();c.moveTo(x,y);c.lineTo(x+2,g[x+2]);c.stroke();}else{const h=1.4+((x*37+seed)%7)*.45;c.strokeStyle=x%5?'#858366aa':'#aaa37bb8';c.lineWidth=.7;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x-1.5,y-h*.65,x-2,y-h);c.stroke();}}
for(let n=0;n<135;n++){const x=6+((Math.imul(n+9,7919)+seed%997)%946),y=g[x],cover=rockCover(seed,round,x);if(cover>.43||y>H-8)continue;const h=3+n%5*1.25;c.strokeStyle=n%3?'#898d67b8':'#b6ad7cae';c.lineWidth=.7+n%2*.25;c.beginPath();c.moveTo(x,y+1);c.quadraticCurveTo(x-2,y-h*.45,x-3-(n%3),y-h);c.moveTo(x,y+1);c.quadraticCurveTo(x+1,y-h*.7,x+3+(n%2),y-h*.8);c.stroke();}}

function landscapeDetails(c,g,seed,round,time,wind){
 const base=(seed+round*7919)>>>0,original=terrain(round===1?seed:base);
 for(let n=0;n<9;n++){const x=76+((Math.imul(n+7,6131)+base)%800),y=g[x],height=49+n%4*11;if(x<55||x>W-55||Math.abs(x-105)<67||Math.abs(x-855)<67||y>H-35||y-original[x]>10||materialAt(seed,round,x)==='rock')continue;c.save();c.translate(x,y);c.rotate((wind*.004)+Math.sin(time*2.1+n*.8)*(.012+Math.abs(wind)*.003));c.fillStyle='#232a29aa';c.beginPath();c.ellipse(2,2,13,3,0,0,7);c.fill();if(ready('pine')){c.drawImage(assets.pine,-height*.34,-height,height*.68,height+5);c.restore();continue;}c.fillStyle='#574735';c.fillRect(-2,-height,4,height);c.fillStyle='#92795b';c.fillRect(-1,-height,1,height);for(let tier=0;tier<4;tier++){const cy=-height+5+tier*height*.19,wide=(4-tier)*3+3;const crown=c.createLinearGradient(-wide,cy,wide,cy);crown.addColorStop(0,'#223c35');crown.addColorStop(.42,'#5d7350');crown.addColorStop(1,'#1f3935');c.fillStyle=crown;c.beginPath();c.moveTo(0,cy-height*.22);c.lineTo(-wide,cy+height*.11);c.lineTo(wide,cy+height*.11);c.closePath();c.fill();}c.restore();}
}
function windFlag(c,g,wind,time){
 const x=475,y=g[x]+3,top=y-82,strength=Math.abs(wind),dir=wind<0?-1:1,length=19+Math.min(1,strength/5)*37,phase=time*(2.4+strength*.4);
 c.save();
 // Weathered field mast, buried into the ground with a tensioned halyard.
 c.strokeStyle='#222c30b0';c.lineWidth=.8;c.beginPath();c.moveTo(x,top+38);c.lineTo(x-19,g[x-19]);c.moveTo(x,top+38);c.lineTo(x+18,g[x+18]);c.stroke();
 const metal=c.createLinearGradient(x-2,0,x+3,0);metal.addColorStop(0,'#28373c');metal.addColorStop(.4,'#d9d2b5');metal.addColorStop(.65,'#8e9692');metal.addColorStop(1,'#35494f');c.fillStyle=metal;c.fillRect(x-1.7,top-5,3.4,y-top+6);
 c.strokeStyle='#bcaa78';c.lineWidth=.65;c.beginPath();c.moveTo(x+3,top);c.lineTo(x+3.7,y-8);c.stroke();
 for(const cy of [top+1,top+24,y-7]){c.fillStyle='#c9b586';c.fillRect(x-2.4,cy,4.8,1.8);}c.fillStyle='#b6a77c';c.beginPath();c.arc(x,top-6,2.4,0,Math.PI*2);c.fill();
 const wave=u=>Math.sin(phase-u*7)*u*(1.2+strength*.65)+Math.sin(phase*1.37-u*12)*u*1.6;
 const point=(u,v)=>[x+dir*length*u,top+wave(u)+v*(23-3*u)+(strength<1?u*u*20:2*u*u)];
 for(let i=0;i<28;i++){const u=i/28,v=(i+1)/28,p=point(u,0),q=point(v,0),r=point(v,1),s=point(u,1),light=.5+.5*Math.sin(phase-u*7+.7);c.fillStyle=`rgb(${Math.round(33+light*26)},${Math.round(66+light*38)},${Math.round(73+light*40)})`;c.beginPath();c.moveTo(...p);c.lineTo(...q);c.lineTo(...r);c.lineTo(...s);c.closePath();c.fill();
 c.strokeStyle='#e4cc9844';c.lineWidth=.5;c.beginPath();c.moveTo(...point(u,.06));c.lineTo(...point(v,.06));c.moveTo(...point(u,.94));c.lineTo(...point(v,.94));c.stroke();}
 c.fillStyle='#e5c48b';c.beginPath();c.moveTo(...point(.22,.5));c.lineTo(...point(.35,.23));c.lineTo(...point(.48,.5));c.lineTo(...point(.35,.77));c.closePath();c.fill();
 c.strokeStyle='#a5b5a677';c.lineWidth=.6;c.beginPath();c.moveTo(...point(1,0));c.lineTo(...point(1,1));c.stroke();
 c.restore();
}

function shell(c,x,y,a,weapon='shell',time=0){
 c.save();c.translate(x,y);c.rotate(a);const size=weapon==='heavy'?1.55:weapon==='cluster'?1.22:weapon==='bomblet'?.63:1;c.scale(size,size);
 for(let i=7;i>0;i--){const trail=i*7;c.fillStyle=`rgba(255,${Math.round(135+i*12)},${Math.round(75+i*10)},${.035+(8-i)*.018})`;c.beginPath();c.ellipse(-trail,Math.sin(time*18-i)*1.8,8+i*.7,2+i*.22,0,0,Math.PI*2);c.fill();}
 const glow=c.createRadialGradient(-5,0,1,-5,0,22);glow.addColorStop(0,'#ffe8a0a0');glow.addColorStop(1,'#ff8a2700');c.fillStyle=glow;c.fillRect(-27,-22,44,44);
 c.fillStyle=weapon==='heavy'?'#a3533d':weapon==='cluster'?'#438575':weapon==='bomblet'?'#d2a54e':'#526373';c.strokeStyle=weapon==='cluster'?'#c7f4df':'#ffe2aa';c.lineWidth=1.2;c.beginPath();c.moveTo(12,0);c.quadraticCurveTo(5,-5,-7,-4);c.lineTo(-11,-3);c.lineTo(-11,3);c.lineTo(-7,4);c.quadraticCurveTo(5,5,12,0);c.fill();c.stroke();c.fillStyle=weapon==='heavy'?'#f4d19b':'#b6a18a';c.fillRect(-10,-3,3,6);if(weapon==='cluster'){c.strokeStyle='#d2e8cd';c.lineWidth=.8;for(const sx of [-4,1,6]){c.beginPath();c.moveTo(sx,-3);c.lineTo(sx,3);c.stroke();}}if(weapon==='heavy'){c.fillStyle='#e4bb7c';c.fillRect(-3,-4,3,8);}if(weapon==='bomblet'){c.fillStyle='#494f4d';c.beginPath();c.moveTo(-8,0);c.lineTo(-13,-6);c.lineTo(-11,0);c.lineTo(-13,6);c.closePath();c.fill();}c.fillStyle='#fff3d4';c.beginPath();c.ellipse(7,-1,3,1.2,-.2,0,Math.PI*2);c.fill();c.restore();
}
export function render(c,game,{animation=null,preview=null,aim=null,time=0}={}){
 const wind=animation?animation.windBefore:game?.wind||0;sky(c,wind,time);
 if(!game){c.fillStyle='#f0f0e4';c.textAlign='center';c.font='bold 42px system-ui';c.fillText('Klar til kamp?',W/2,235);c.font='20px system-ui';c.fillText('Vælg modstander for at begynde',W/2,275);return;}
 const flight=animation&&animation.index<animation.path.length,impact=animation&&!flight,groundData=flight?animation.groundBefore:impact?animation.impactGround:game.ground,round=animation?animation.beforeRound:game.round;
 ground(c,groundData,game.seed,round);landscapeDetails(c,groundData,game.seed,round,time,wind);windFlag(c,groundData,wind,time);
 for(let i=0;i<2;i++){
  const base=game.players[i],motion=impact&&animation.motion.length?animation.motion[Math.min(animation.motionIndex,animation.motion.length-1)]?.[i]:null;
  const position=flight?animation.before[i]:impact?{...animation.impactPlayers[i],...motion}:base;
  const shown={...base,...position,angle:aim?.player===i&&!animation?aim.angle:animation?animation.before[i].angle:base.angle};
  const enemy=animation?(flight?animation.before[1-i]:animation.impactPlayers[1-i]):game.players[1-i];
  drawTank(c,shown,i,Math.sign(enemy.x-shown.x)||1,assets,time,impact?animation.impactAge/1000:10);
 }
 if(animation){const {path,index,hit}=animation;
  if(animation.weapon==='cluster'){for(const p of clusterFlight(animation,animation.elapsed))shell(c,p.x,p.y,p.angle,p.carrier?'cluster':'bomblet',time);}
  if(flight){const k=Math.floor(index),next=path[Math.min(k+1,path.length-1)],point=path[k],mix=index-k;
   if(point&&animation.weapon!=='cluster'){const x=point[0]+(next[0]-point[0])*mix,y=point[1]+(next[1]-point[1])*mix,a=point[2]+(next[2]-point[2])*mix;shell(c,x,y,a,animation.weapon,time);}
  }else{const seconds=animation.impactAge/1000;drawBlast(c,hit.x,hit.y,seconds,animation.radius,{direct:hit.direct,weapon:animation.weapon,miss:hit.miss,rock:materialAt(game.seed,round,hit.x)==='rock'});
   if(animation.weapon==='cluster'&&!hit.miss){drawBlast(c,hit.x-34,hit.y,seconds-.13,27,{});drawBlast(c,hit.x+34,hit.y,seconds-.2,27,{});}
  }
 }else if(preview){const t=trace(game,game.turn,preview.angle,preview.power);c.strokeStyle='#d5e4d388';c.lineWidth=1.6;c.setLineDash([2,9]);line(c,t.path.map(p=>p.slice(0,2)));c.setLineDash([]);}
}
