import {VALUES,TOP_WAIT,createRound,dropRound,mergeRound,advanceDanger} from './rules.js';
import {tiles,drawTile,tileOutline,tileRadius,preloadImages} from './theme.js';
const $=s=>document.querySelector(s);
const canvas=$('#game'),ctx=canvas.getContext('2d');
const W=440,H=620,LEFT=24,RIGHT=416,FLOOR=593,TOP=128,SPAWN=66;
// Render at screen resolution while retaining the established physics coordinates.
function resizeGameCanvas(){
  const scale=Math.max(1,Math.min(3,window.devicePixelRatio||1))*canvas.getBoundingClientRect().width/W;
  const width=Math.max(W,Math.round(W*scale)),height=Math.round(width*H/W);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  ctx.setTransform(width/W,0,0,height/H,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
}
new ResizeObserver(resizeGameCanvas).observe(canvas);
window.addEventListener('resize',resizeGameCanvas);
resizeGameCanvas();
const {Engine,Bodies,Body,Composite,Events,Vertices,Common}=Matter;
Common.setDecomp(window.decomp);
const engine=Engine.create({enableSleeping:true,positionIterations:12,velocityIterations:10});engine.gravity.y=1.3;
const wallOptions={isStatic:true,friction:.28,restitution:0};
const walls=[Bodies.rectangle(LEFT-15,H/2,30,H*3,wallOptions),Bodies.rectangle(RIGHT+15,H/2,30,H*3,wallOptions),Bodies.rectangle(W/2,FLOOR+20,W,40,wallOptions)];
Composite.add(engine.world,walls);
let round=createRound(),bodies=[],pending=[],particles=[],floats=[],mode='ready',time=0,aim=W/2,dragging=false,keys=new Set(),best=0,lastSound=-Infinity;
let soundOn=true,audioCtx=null,toastTimeout;
let assetsReady=false;
let powers={shake:1,remove:1},rewardLevel=0,removing=false,shakeUntil=0,shakePulse=0;
function syncPowers(){
 const level=Math.floor(round.score/1000);if(level>rewardLevel){const count=level-rewardLevel;powers.shake+=count;powers.remove+=count;rewardLevel=level;}
 for(const kind of ["shake","remove"]){const button=$("#"+kind);button.querySelector("b").textContent=powers[kind];button.disabled=mode!=="playing"||powers[kind]<1||(kind==="shake"&&(time<shakeUntil||!bodies.length));}
 $("#remove").setAttribute("aria-pressed",String(removing));canvas.classList.toggle("removing",removing);
}
function cancelRemove(){removing=false;dragging=false;syncPowers();}
function shake(){
 if(mode!=="playing"||powers.shake<1||time<shakeUntil||!bodies.length)return;
 cancelRemove();powers.shake--;shakeUntil=time+.65;
 shakePulse=0;shakeKick(1);
 $(".arena-wrap").animate([{translate:"0"},{translate:"-6px"},{translate:"6px"},{translate:"-5px"},{translate:"5px"},{translate:"-3px"},{translate:"0"}],{duration:600});syncPowers();
}
function shakeKick(direction){
 for(const b of bodies){if(!b.plugin.alive)continue;Matter.Sleeping.set(b,false);Body.setVelocity(b,{x:Math.max(-3.2,Math.min(3.2,b.velocity.x+direction*2.6)),y:Math.min(b.velocity.y,-.6)});Body.setAngularVelocity(b,Math.max(-.07,Math.min(.07,b.angularVelocity+direction*.035)));}
}
function removeAt(x,y){
 if(!removing||mode!=="playing"||powers.remove<1)return false;
 const body=[...bodies].reverse().find(b=>b.plugin.alive&&Matter.Query.point(b.parts.length>1?b.parts.slice(1):[b],{x,y}).length);if(!body)return false;
 body.plugin.alive=false;Composite.remove(engine.world,body);bodies=bodies.filter(b=>b!==body);pending=pending.filter(pair=>!pair.includes(body));powers.remove--;
 for(const b of bodies)Matter.Sleeping.set(b,false);burst(body.position.x,body.position.y,body.plugin.tier);cancelRemove();return true;
}
$("#shake").onclick=shake;$("#remove").onclick=()=>{if(mode!=="playing"||powers.remove<1)return;removing=!removing;dragging=false;syncPowers();if(removing)toast("Tryk på en brik for at fjerne den. Tryk Fjern igen for at annullere.");};
let activeAudio=[];const audioBuffers=new Map();
try{best=Number(localStorage.getItem('merge-lab-best')||0)||0;soundOn=localStorage.getItem('merge-lab-sound')!=='off';}catch{}
const numberFormat=new Intl.NumberFormat('da-DK');
function toast(msg){clearTimeout(toastTimeout);$('#toast').textContent=msg;$('#toast').hidden=false;toastTimeout=setTimeout(()=>$('#toast').hidden=true,4500);}
function setStatus(text){$('#status').replaceChildren();const i=document.createElement('i');$('#status').append(i,document.createTextNode(text));}
function updateSoundButton(){const b=$('#sound');b.textContent=soundOn?'♫':'♪';b.style.opacity=soundOn?'1':'.45';b.setAttribute('aria-label',soundOn?'Slå lyd fra':'Slå lyd til');}
function ensureAudio(){try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});}catch{}}
function stopSounds(){for(const source of activeAudio){try{source.stop();}catch{}}activeAudio=[];}
async function tileSound(tier,force=false){
  if(!soundOn&&!force)return;ensureAudio();if(!audioCtx)return;
  const now=audioCtx.currentTime;if(!force&&now-lastSound<.065)return;lastSound=now;
  const tile=tiles[tier];
  const sound=tile.sound||(tier===1?'assets/silas-merge.m4a':null);
  if(sound){
    try{
      let buffer=audioBuffers.get(sound);
      if(!buffer){const response=await fetch(sound);buffer=await audioCtx.decodeAudioData(await response.arrayBuffer());audioBuffers.set(sound,buffer);}
      if(!force&&(mode!=='playing'||!soundOn))return;
      if(activeAudio.length>=4){try{activeAudio.shift().stop();}catch{}}
      const source=audioCtx.createBufferSource();source.buffer=buffer;const gain=audioCtx.createGain();gain.gain.value=.6;source.connect(gain).connect(audioCtx.destination);source.start();source.stop(audioCtx.currentTime+Math.min(buffer.duration,8));activeAudio.push(source);source.onended=()=>{activeAudio=activeAudio.filter(x=>x!==source);};
    }catch{toast('Denne lyd kunne ikke afspilles. Prøv MP3 eller WAV.');}return;
  }
  const notes=[261.63,293.66,329.63,349.23,392,440,493.88,523.25,587.33,659.25,783.99,1046.5,1174.66];
  for(let i=0;i<2;i++){const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.value=notes[tier]*(i?1.5:1);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(i?.025:.07,now+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+.35);osc.connect(gain).connect(audioCtx.destination);osc.start(now);osc.stop(now+.36);}
}
function dropSound(){if(!soundOn)return;ensureAudio();if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime;o.frequency.setValueAtTime(190,t);o.frequency.exponentialRampToValueAtTime(85,t+.09);g.gain.setValueAtTime(.045,t);g.gain.exponentialRampToValueAtTime(.001,t+.1);o.connect(g).connect(audioCtx.destination);o.start(t);o.stop(t+.12);}
function previewContext(c,w,h){
  // Fixed logical coordinates, high-resolution backing store for retina screens.
  const density=Math.max(4,Math.min(6,(window.devicePixelRatio||1)*1.6));
  c.width=Math.round(w*density);c.height=Math.round(h*density);
  const g=c.getContext('2d');g.setTransform(density,0,0,density,0,0);
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';return g;
}
function syncUI(){
  syncPowers();
  $('#score').textContent=numberFormat.format(round.score);
  if(round.score>best){best=round.score;try{localStorage.setItem('merge-lab-best',String(best));}catch{}}
  $('#best').textContent=numberFormat.format(best);$('#next-name').textContent=tiles[round.next].name;$('#next-value').textContent=`${VALUES[round.next]} point`;
  const c=$('#next-preview'),g=previewContext(c,160,120);const outline=tileOutline(round.next),xs=outline.map(p=>p.x),ys=outline.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const r=Math.min(144/(maxX-minX),108/(maxY-minY));
  drawTile(g,round.next,80-(minX+maxX)*r/2,60-(minY+maxY)*r/2,r);
  c.setAttribute('aria-label',`Næste brik: ${tiles[round.next].name}, ${VALUES[round.next]} point`);
  document.querySelectorAll('.family-item').forEach((el,i)=>el.classList.toggle('reached',i<=round.maxTier));
}
function makeTileBody(tier,x,y){
  const radius=tileRadius(tier),outline=tileOutline(tier).map(p=>({x:p.x*radius,y:p.y*radius}));
  // fromVertices recentres concave parts on their combined centre of mass.
  // Retain that offset so the artwork rotates about exactly the same point.
  const centre=Vertices.centre(outline);
  const body=Bodies.fromVertices(x,y,[outline],{restitution:.12,friction:.28,frictionStatic:.5,frictionAir:.008,density:.002,sleepThreshold:90},true,.001,0,.001);
  body.plugin={tile:true,tier,alive:true,age:0,danger:0,artOffset:centre};
  return body;
}
function refreshPhysics(){
  bodies=bodies.map(old=>{
    const body=makeTileBody(old.plugin.tier,old.position.x,old.position.y);
    Body.setAngle(body,old.angle);Body.setVelocity(body,old.velocity);Body.setAngularVelocity(body,old.angularVelocity);
    body.plugin.age=old.plugin.age;body.plugin.danger=old.plugin.danger;
    Composite.remove(engine.world,old);Composite.add(engine.world,body);return body;
  });
  pending=[];
}
function spawn(tier,x,y){
  const radius=tileRadius(tier);x=Math.max(LEFT+radius+1,Math.min(RIGHT-radius-1,x));
  const body=makeTileBody(tier,x,y);bodies.push(body);Composite.add(engine.world,body);return body;
}
function burst(x,y,tier){const count=tier>=9?34:12;for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=35+Math.random()*95;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,life:.6+Math.random()*.5,max:1.1,color:tiles[tier].color,size:2+Math.random()*4});}}
function scoreFloat(x,y,value){floats.push({x,y,text:`+${value}`,life:.8});}
Events.on(engine,'collisionStart',({pairs})=>{
  if(mode!=='playing')return;
  for(const pair of pairs){const a=pair.bodyA.parent,b=pair.bodyB.parent;if(a.plugin.tile&&b.plugin.tile&&a.plugin.alive&&b.plugin.alive&&a.plugin.tier===b.plugin.tier&&a.plugin.tier<VALUES.length-1){a.plugin.alive=b.plugin.alive=false;pending.push([a,b]);}}
});
function processMerges(){
  for(const [a,b] of pending){const x=(a.position.x+b.position.x)/2,y=(a.position.y+b.position.y)/2,tier=mergeRound(round,a.plugin.tier,b.plugin.tier);Composite.remove(engine.world,[a,b]);bodies=bodies.filter(v=>v!==a&&v!==b);if(tier!==null){const n=spawn(tier,x,y);Body.setVelocity(n,{x:(a.velocity.x+b.velocity.x)*.18,y:Math.min(0,(a.velocity.y+b.velocity.y)*.18)});burst(x,y,tier);scoreFloat(x,y,VALUES[tier]);tileSound(tier);}}
  if(pending.length)syncUI();pending=[];
}
function drop(){if(removing||mode!=='playing'||document.querySelector('dialog[open]'))return;const tier=dropRound(round,time);if(tier===null)return;const r=tileRadius(tier),x=Math.max(LEFT+r+1,Math.min(RIGHT-r-1,aim));spawn(tier,x,SPAWN);scoreFloat(x,SPAWN+25,VALUES[tier]);dropSound();syncUI();setStatus('Find en makker. Skab noget større.');}
function showOverlay(title,text,button,kicker='ET LILLE ØJEBLIK',foot='Træk for at sigte · Slip for at droppe'){
  $('.game-logo').hidden=true;$('#overlay-title').textContent=title;$('#overlay-text').textContent=text;$('#play').textContent=button;$('#overlay-kicker').textContent=kicker;$('#overlay-foot').textContent=foot;$('#overlay').hidden=false;
}
let savedPageY=0;
function lockPlayScreen(lock){
  if(lock&&!document.body.classList.contains('playing'))savedPageY=window.scrollY;
  document.body.classList.toggle('playing',lock);
  if(!lock)window.scrollTo(0,savedPageY);
}
function start(){
  if(!assetsReady)return;
  stopSounds();Composite.remove(engine.world,bodies);Engine.clear(engine);bodies=[];pending=[];particles=[];floats=[];round=createRound();powers={shake:1,remove:1};rewardLevel=0;removing=false;shakeUntil=0;time=0;aim=W/2;mode='playing';lockPlayScreen(true);keys.clear();dragging=false;$('#overlay').hidden=true;$('#danger').hidden=true;$('#pause').disabled=false;$('#pause').textContent='Ⅱ';$('#pause').setAttribute('aria-label','Sæt spil på pause');setStatus('Slip din første figur');ensureAudio();syncUI();canvas.focus({preventScroll:true});
}
function pause(){if(mode!=='playing')return;mode='paused';cancelRemove();lockPlayScreen(false);keys.clear();dragging=false;stopSounds();$('#pause').textContent='▷';$('#pause').setAttribute('aria-label','Fortsæt spillet');setStatus('Tag dig god tid');showOverlay('Pause','','Spil videre','','');}
function resume(){if(mode!=='paused'||document.querySelector('dialog[open]'))return;mode='playing';syncPowers();lockPlayScreen(true);$('#overlay').hidden=true;$('#pause').textContent='Ⅱ';$('#pause').setAttribute('aria-label','Sæt spil på pause');setStatus('Find en makker. Skab noget større.');ensureAudio();canvas.focus({preventScroll:true});}
function end(){mode='over';cancelRemove();lockPlayScreen(false);stopSounds();keys.clear();$('#pause').disabled=true;$('#danger').hidden=true;setStatus('En fin lille samling');showOverlay('Plads til en ny start.',`Du samlede ${numberFormat.format(round.score)} point og nåede ${tiles[round.maxTier].name}.`,'Prøv igen ↗','RUNDE SLUT',`Din rekord: ${numberFormat.format(best)} point`);}
function step(dt){
  if(mode!=='playing')return;time+=dt;if(shakeUntil&&time<shakeUntil){const pulse=Math.floor((time-(shakeUntil-.65))/.16);if(pulse>shakePulse){shakePulse=pulse;shakeKick(pulse%2?-1:1);}}if(shakeUntil&&time>=shakeUntil){shakeUntil=0;syncPowers();}
  if(keys.has('ArrowLeft'))aim-=260*dt;if(keys.has('ArrowRight'))aim+=260*dt;
  aim=Math.max(LEFT+tileRadius(round.current)+1,Math.min(RIGHT-tileRadius(round.current)-1,aim));
  // Two 120 Hz contact solves per game tick reduce corrections in resting stacks.
  for(let sub=0;sub<2;sub++){Engine.update(engine,dt*500);processMerges();}
  let worst=0;
  for(const body of bodies){body.plugin.age+=dt;body.plugin.danger=advanceDanger(body.plugin.danger,Math.min(...body.vertices.map(v=>v.y))<TOP,dt);worst=Math.max(worst,body.plugin.danger);}
  $('#danger').hidden=worst<.8;if(worst>=.8)$('#danger b').textContent=Math.max(0,TOP_WAIT-worst).toFixed(1).replace('.',',');
  if(worst>=TOP_WAIT)end();
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=110*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);
  for(const f of floats){f.y-=30*dt;f.life-=dt;}floats=floats.filter(f=>f.life>0);
}
function render(){
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#e5ecd9';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#d6dfca75';for(let x=20;x<W;x+=22)for(let y=18;y<H;y+=22){ctx.beginPath();ctx.arc(x,y,.65,0,7);ctx.fill();}
  ctx.lineCap='round';ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(LEFT,TOP);ctx.lineTo(RIGHT,TOP);ctx.strokeStyle='#07536e';ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle='#ffd052';ctx.lineWidth=3;ctx.stroke();ctx.font='600 11px -apple-system, sans-serif';ctx.fillStyle='#15536a';ctx.textAlign='left';ctx.fillText('HOLD FIGURERNE UNDER LINJEN',LEFT+8,TOP+20);
  ctx.beginPath();ctx.moveTo(LEFT,TOP+32);ctx.lineTo(LEFT,FLOOR-15);ctx.quadraticCurveTo(LEFT,FLOOR,LEFT+15,FLOOR);ctx.lineTo(RIGHT-15,FLOOR);ctx.quadraticCurveTo(RIGHT,FLOOR,RIGHT,FLOOR-15);ctx.lineTo(RIGHT,TOP+32);ctx.strokeStyle='#07536e';ctx.lineWidth=8;ctx.stroke();ctx.strokeStyle='#29a8b4';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#f8d36a';ctx.lineWidth=1;ctx.stroke();
  for(const body of bodies){const d=body.plugin;if(!d.alive)continue;const r=tileRadius(d.tier),o=d.artOffset,a=body.angle;drawTile(ctx,d.tier,body.position.x-o.x*Math.cos(a)+o.y*Math.sin(a),body.position.y-o.x*Math.sin(a)-o.y*Math.cos(a),r,{rotation:a});if(d.danger>.8){ctx.strokeStyle=`rgba(184,78,62,${Math.min(.8,d.danger/5)})`;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(body.position.x,body.position.y,r+3,-Math.PI/2,-Math.PI/2+Math.PI*2*d.danger/TOP_WAIT);ctx.stroke();}}
  if(mode==='playing'||mode==='paused'){
    const radius=tileRadius(round.current),x=Math.max(LEFT+radius+1,Math.min(RIGHT-radius-1,aim));ctx.strokeStyle='#92a98060';ctx.lineWidth=1;ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(x,SPAWN+radius+7);ctx.lineTo(x,FLOOR-6);ctx.stroke();ctx.setLineDash([]);drawTile(ctx,round.current,x,SPAWN,radius,{alpha:time-round.lastDrop<.5?.55:1});ctx.font='9px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillStyle='#879a78';ctx.fillText('↓',x,Math.max(15,SPAWN-radius-10));
  }
  for(const p of particles){ctx.save();ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.translate(p.x,p.y);ctx.rotate(p.life*3);ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);ctx.restore();}
  for(const f of floats){ctx.globalAlpha=Math.min(1,f.life*2);ctx.fillStyle='#426843';ctx.font='600 15px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y);}ctx.globalAlpha=1;
}
let last=performance.now(),acc=0;
function frame(now){const elapsed=Math.min(.08,(now-last)/1000);last=now;if(mode==='playing'){acc+=elapsed;while(acc>=1/60){step(1/60);acc-=1/60;}}else acc=0;render();requestAnimationFrame(frame);}
function updateAim(event){const rect=canvas.getBoundingClientRect();aim=(event.clientX-rect.left)/rect.width*W;}
canvas.addEventListener('pointerdown',e=>{if(mode!=='playing')return;e.preventDefault();if(removing){const r=canvas.getBoundingClientRect();removeAt((e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H);return;}ensureAudio();dragging=true;updateAim(e);canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(mode==='playing'&&(dragging||e.pointerType==='mouse'))updateAim(e);});
canvas.addEventListener('pointerup',e=>{if(!dragging)return;e.preventDefault();dragging=false;updateAim(e);drop();});
canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('touchmove',e=>{if(mode==='playing')e.preventDefault();},{passive:false});
document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA|BUTTON/.test(e.target.tagName))return;if(['ArrowLeft','ArrowRight',' ','Enter','p','P'].includes(e.key))e.preventDefault();if(e.key==='p'||e.key==='P'){if(!e.repeat)mode==='playing'?pause():resume();return;}if(mode==='playing'){keys.add(e.key);if((e.key===' '||e.key==='Enter')&&!e.repeat)drop();}});
document.addEventListener('keyup',e=>keys.delete(e.key));document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',()=>{keys.clear();pause();});
$('#play').onclick=()=>mode==='paused'?resume():start();$('#pause').onclick=()=>mode==='playing'?pause():resume();
$('#sound').onclick=()=>{soundOn=!soundOn;if(!soundOn)stopSounds();else ensureAudio();updateSoundButton();try{localStorage.setItem('merge-lab-sound',soundOn?'on':'off');}catch{}};
let resumeAfterDialog=false;
function openDialog(id){resumeAfterDialog=mode==='playing';pause();$('#'+id).showModal();}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>{stopSounds();if(resumeAfterDialog){resumeAfterDialog=false;resume();}}));
$('#how-open').onclick=()=>openDialog('how');$('#restart').onclick=()=>{if(round.drops>0&&mode!=='over')openDialog('confirm');else start();};
$('#confirm-restart').onclick=()=>{resumeAfterDialog=false;$('#confirm').close();start();};
function buildFamily(){
  $('#family').replaceChildren();tiles.forEach((t,i)=>{const el=document.createElement('div');el.className='family-item';const c=document.createElement('canvas');c.width=100;c.height=95;c.setAttribute('aria-label',t.name);drawTile(previewContext(c,100,95),i,50,47,tileRadius(i,21+i*1.3),{number:false});const value=document.createElement('b');value.textContent=String(VALUES[i]);const name=document.createElement('span');name.textContent=t.name;el.append(c,value,name);$('#family').append(el);});syncUI();
}
updateSoundButton();buildFamily();requestAnimationFrame(frame);
$('#play').disabled=true;
(async()=>{
  try{await preloadImages();assetsReady=true;$('#play').disabled=false;buildFamily();}
  catch(err){toast(err.message||'Figurerne kunne ikke indlæses. Genindlæs siden.');}
})();
// Opt-in test interface: never present on the ordinary page.
if(new URLSearchParams(location.search).get('test')==='1')window.__mergeTest={shake,removeAt,toggleRemove(){removing=!removing;syncPowers();},setScore(score){round.score=score;syncUI();},start,pause,resume,drop,step,spawn,processMerges,engine,refreshPhysics,get ready(){return assetsReady;},get state(){return {mode,powers:{...powers},removing,round:{...round},time,bodies:bodies.map(b=>({id:b.id,tier:b.plugin.tier,x:b.position.x,y:b.position.y,danger:b.plugin.danger})),best};},position(body,x,y){Body.setPosition(body,{x,y});},setAim(x){aim=x;},advance(seconds){for(let i=0;i<seconds*60;i++)step(1/60);},end};
