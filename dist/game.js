import {createPlayClock,formatPlayTime} from './play-time.js?v=1.1.0';
import {earnedPowers,createRewardNotices} from './reward-notices.js?v=gameover-notices-v1';
import {createDangerAudio} from './danger-audio.js?v=riser-mix-v2';
import {findBallEscape} from './ball-collision.js?v=flow-v1';
import {createLivePlayers,renderLivePlayers,createLiveNotices} from './live-players.js?v=1.1.3';
import {initMobileDisplay} from './mobile-display.js?v=mobile-screen-v1';
import {initLeaderboard,refreshLeaderboard,requirePlayerName,flushScore,scoreRoundStart,scoreEvent as recordScoreEvent,setRoundTimeSource,scoreRoundEnd,scoreApi,liveRoundTicket,liveNickname} from './leaderboard.js?v=1.1.4';
import {VALUES,CLEAR_PAIR,SVEND_BONUS,TOP_WAIT,DROP_DELAY,createRound,dropRound,mergeRound,advanceDanger} from './rules.js?v=svend-bonus-v2';
import {tiles,drawTile,tileOutline,tileRadius,preloadImages,tileSource} from './theme.js?v=loading-preview-v1';
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
// Keep unsupported tiles falling when a merge removes their neighbours.
const engine=Engine.create({enableSleeping:false,positionIterations:16,velocityIterations:12});engine.gravity.y=1.3;
const wallOptions={isStatic:true,friction:0,frictionStatic:0,restitution:.12};
const walls=[Bodies.rectangle(LEFT-15,H/2,30,H*3,wallOptions),Bodies.rectangle(RIGHT+15,H/2,30,H*3,wallOptions),Bodies.rectangle(W/2,FLOOR+20,W,40,wallOptions)];
Composite.add(engine.world,walls);
let round=createRound(),bodies=[],pending=[],particles=[],floats=[],mode='ready',time=0,aim=W/2,dragging=false,keys=new Set(),best=0;
let soundOn=true,audioCtx=null,toastTimeout;
const playClock=createPlayClock();
const playSeconds=()=>Math.max(time,playClock.seconds());
setRoundTimeSource(playSeconds);
function scoreEvent(kind,tier){recordScoreEvent(kind,tier,playSeconds());}
function syncClock(){
 // A cached older page may not contain the clock yet. Optional UI must not stop rendering.
 let clock=$('#play-time');
 if(!clock){
  const card=$('.score-card');if(!card)return;
  const row=document.createElement('div'),label=document.createElement('span');
  row.className='round-clock';row.setAttribute('aria-label','Spilletid');label.textContent='Spilletid';
  clock=document.createElement('time');clock.id='play-time';clock.title='Spilletid';
  row.append(label,clock);card.insertBefore(row,card.querySelector('.record'));
 }
 const text=formatPlayTime(playSeconds());if(clock.textContent!==text)clock.textContent=text;
}
let assetsReady=false;
let fireworks=[];
let dangerProgress=0,availableSvendBonus=0;
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let powers={shake:1,remove:1},rewardLevel=0,removing=false,shakeUntil=0,shakePulse=0;
function syncPowers(){
 const earned=earnedPowers(rewardLevel,round.score);rewardLevel=earned.level;
 powers.shake+=earned.shake;powers.remove+=earned.remove;
 if(mode==='playing'&&(earned.shake||earned.remove)){
  const gifts=[];if(earned.remove)gifts.push(`+${earned.remove} Fjern`);if(earned.shake)gifts.push(`+${earned.shake} Ryst`);
  rewardNotices.push({kind:'power',text:`🎁 ${gifts.join(' og ')} optjent · ${numberFormat.format(round.score)} point`});
 }
 for(const kind of ["shake","remove"]){const button=$("#"+kind);button.querySelector("b").textContent=powers[kind];button.disabled=mode!=="playing"||powers[kind]<1||(kind==="shake"&&(time<shakeUntil||!bodies.length));}
 $("#remove").setAttribute("aria-pressed",String(removing));canvas.classList.toggle("removing",removing);
}
function cancelRemove(){removing=false;dragging=false;syncPowers();}
function shake(){
 if(mode!=="playing"||powers.shake<1||time<shakeUntil||!bodies.length)return;
 cancelRemove();scoreEvent('s',0,time);powers.shake--;shakeUntil=time+.65;
 shakePulse=0;shakeKick(1);
 $(".arena-wrap").animate([{translate:"0"},{translate:"-6px"},{translate:"6px"},{translate:"-5px"},{translate:"5px"},{translate:"-3px"},{translate:"0"}],{duration:600});syncPowers();
}
function shakeKick(direction){
 for(const b of bodies){if(!b.plugin.alive)continue;Matter.Sleeping.set(b,false);Body.setVelocity(b,{x:Math.max(-6.4,Math.min(6.4,b.velocity.x+direction*5.2)),y:Math.min(b.velocity.y,-.6)});Body.setAngularVelocity(b,Math.max(-.07,Math.min(.07,b.angularVelocity+direction*.035)));}
}
function removeAt(x,y){
 if(!removing||mode!=="playing"||powers.remove<1)return false;
 const body=[...bodies].reverse().find(b=>b.plugin.alive&&Matter.Query.point(b.parts.length>1?b.parts.slice(1):[b],{x,y}).length);if(!body)return false;
 scoreEvent('r',body.plugin.tier,time);body.plugin.alive=false;Composite.remove(engine.world,body);bodies=bodies.filter(b=>b!==body);pending=pending.filter(pair=>!pair.includes(body));powers.remove--;
 for(const b of bodies)Matter.Sleeping.set(b,false);burst(body.position.x,body.position.y,body.plugin.tier);cancelRemove();return true;
}
$("#shake").onclick=shake;$("#remove").onclick=()=>{if(mode!=="playing"||powers.remove<1)return;removing=!removing;dragging=false;syncPowers();if(removing)toast("Tryk på en brik for at fjerne den. Tryk Fjern igen for at annullere.");};
let audioGeneration=0;
let activeAudio=[];const audioBuffers=new Map();
let bestStorageKey='merge-lab-best';
window.addEventListener('almind-profile',({detail})=>{
 const key=`almind-profile-best:${detail.id}`;let saved=0;
 try{saved=Number(localStorage.getItem(key)||0)||0;}catch{}
 best=Math.max(Number(detail.best)||0,saved,key===bestStorageKey?best:0);bestStorageKey=key;
 try{localStorage.setItem(key,String(best));}catch{}
 $('#best').textContent=numberFormat.format(best);
});
try{best=Number(localStorage.getItem('merge-lab-best')||0)||0;soundOn=localStorage.getItem('merge-lab-sound')!=='off';}catch{}
const numberFormat=new Intl.NumberFormat('da-DK');
function toast(msg){clearTimeout(toastTimeout);$('#toast').textContent=msg;$('#toast').hidden=false;toastTimeout=setTimeout(()=>$('#toast').hidden=true,4500);}
function setStatus(text){$('#status').replaceChildren();const i=document.createElement('i');$('#status').append(i,document.createTextNode(text));}
function updateSoundButton(){const b=$('#sound');b.textContent=soundOn?'♫':'♪';b.style.opacity=soundOn?'1':'.45';b.setAttribute('aria-label',soundOn?'Slå lyd fra':'Slå lyd til');}
function ensureAudio(){try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});}catch{}}
const dangerAudio=createDangerAudio({context:()=>audioCtx,load:()=>recordedBuffer('assets/danger-riser.m4a'),duration:TOP_WAIT});
function stopSounds(){dangerAudio.stop();audioGeneration++;for(const source of activeAudio){try{source.stop();}catch{}}activeAudio=[];}
// Short synthesized cartoon effects, sharing the game's mute and stop controls.
function effectTone(frequency,endFrequency,delay,duration,volume,type='sine',force=false){
 if(!soundOn&&!force)return;ensureAudio();if(!audioCtx)return;
 const at=audioCtx.currentTime+delay,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
 osc.type=type;osc.frequency.setValueAtTime(frequency,at);osc.frequency.exponentialRampToValueAtTime(endFrequency,at+duration);
 gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.012);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
 osc.connect(gain);gain.connect(audioCtx.destination);osc.start(at);osc.stop(at+duration+.02);activeAudio.push(osc);
 osc.onended=()=>{activeAudio=activeAudio.filter(s=>s!==osc);osc.disconnect();gain.disconnect();};
}
async function recordedBuffer(sound){
 let buffer=audioBuffers.get(sound);
 if(!buffer){const response=await fetch(sound);if(!response.ok)throw new Error('Audio unavailable');buffer=await audioCtx.decodeAudioData(await response.arrayBuffer());audioBuffers.set(sound,buffer);}
 return buffer;
}
async function gameOverSound(){
 if(!soundOn)return;ensureAudio();if(!audioCtx)return;
 const generation=audioGeneration;
 try{
  const buffer=await recordedBuffer('assets/game-over-voice.m4a');
  if(generation!==audioGeneration||mode!=='over'||!soundOn)return;
  const source=audioCtx.createBufferSource(),gain=audioCtx.createGain(),at=audioCtx.currentTime,duration=buffer.duration;
  source.buffer=buffer;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.6,at+.025);gain.gain.setValueAtTime(.6,at+duration-.03);gain.gain.linearRampToValueAtTime(0,at+duration);
  source.connect(gain).connect(audioCtx.destination);source.start(at);source.stop(at+duration);activeAudio.push(source);
  source.onended=()=>{activeAudio=activeAudio.filter(s=>s!==source);source.disconnect();gain.disconnect();};
 }catch{if(generation===audioGeneration&&mode==='over')effectTone(150,58,0,.42,.09,'triangle');}
}
function celebrationSound(level,force=false){
 effectTone(190+level*35,42,0,.15+level*.025,.12,'sine',force);
 for(let i=0;i<level+1;i++)effectTone(523.25*Math.pow(2,i/4),660*Math.pow(2,i/4),.07+i*.075,.2,.035,'triangle',force);
}
async function tileSound(tier,force=false){
  const generation=audioGeneration;
  if(!soundOn&&!force)return;ensureAudio();if(!audioCtx)return;
  const now=audioCtx.currentTime;
  const tile=tiles[tier];
  const sound=tile.sound||({1:'assets/silas-merge.m4a',2:'assets/niklas-merge.m4a',3:'assets/elias-merge-v2.m4a',4:'assets/milas-merge.m4a',5:'assets/malika-merge.m4a',7:'assets/rikke-merge.m4a',8:'assets/david-merge.m4a',6:'assets/tina-merge.m4a',9:'assets/helle-merge.m4a',10:'assets/svend-merge.m4a'}[tier]??null);
  if(tier>=7&&!sound){celebrationSound(tier-6,force);return;}
  if(sound){
    try{
      const buffer=await recordedBuffer(sound);
      if(generation!==audioGeneration||(force&&!$('#portrait').open)||(!force&&(mode!=='playing'||!soundOn)))return;
      const source=audioCtx.createBufferSource();source.buffer=buffer;const gain=audioCtx.createGain();const at=audioCtx.currentTime,duration=Math.min(buffer.duration,8),fade=Math.min(.025,duration/3);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.6,at+fade);gain.gain.setValueAtTime(.6,at+duration-fade);gain.gain.linearRampToValueAtTime(0,at+duration);source.connect(gain).connect(audioCtx.destination);source.start(at);source.stop(at+duration);activeAudio.push(source);source.onended=()=>{activeAudio=activeAudio.filter(x=>x!==source);};
    }catch{if(generation!==audioGeneration)return;toast('Denne lyd kunne ikke afspilles. Prøv MP3 eller WAV.');}return;
  }
  const notes=[261.63,293.66,329.63,349.23,392,440,493.88,523.25,587.33,659.25,783.99,1046.5,1174.66];
  for(let i=0;i<2;i++){const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.value=notes[tier]*(i?1.5:1);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(i?.025:.07,now+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+.35);osc.connect(gain).connect(audioCtx.destination);osc.start(now);osc.stop(now+.36);activeAudio.push(osc);osc.onended=()=>{activeAudio=activeAudio.filter(s=>s!==osc);osc.disconnect();gain.disconnect();};}
}
function dropSound(){if(!soundOn)return;ensureAudio();if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime;o.frequency.setValueAtTime(190,t);o.frequency.exponentialRampToValueAtTime(85,t+.09);g.gain.setValueAtTime(.045,t);g.gain.exponentialRampToValueAtTime(.001,t+.1);o.connect(g).connect(audioCtx.destination);o.start(t);o.stop(t+.12);}
function previewContext(c,w,h){
  // Fixed logical coordinates, high-resolution backing store for retina screens.
  const density=Math.max(4,Math.min(6,(window.devicePixelRatio||1)*1.6));
  c.width=Math.round(w*density);c.height=Math.round(h*density);
  const g=c.getContext('2d');g.setTransform(density,0,0,density,0,0);
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';return g;
}
let nextPreviewKey=null;
function syncUI(){
  syncPowers();
  $('#score').textContent=numberFormat.format(round.score);
  if(round.score>best){best=round.score;try{localStorage.setItem(bestStorageKey,String(best));}catch{}}
  $('#best').textContent=numberFormat.format(best);$('#next-name').textContent=tiles[round.next].name;$('#next-value').textContent=`${VALUES[round.next]} point`;
  const previewKey=`${round.next}:${tileRadius(round.next)}:${tileSource(round.next)}:${window.devicePixelRatio}`;
  if(previewKey!==nextPreviewKey){nextPreviewKey=previewKey;
  const c=$('#next-preview'),g=previewContext(c,160,120);const outline=tileOutline(round.next),xs=outline.map(p=>p.x),ys=outline.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const r=Math.min(144/(maxX-minX),108/(maxY-minY));
  drawTile(g,round.next,80-(minX+maxX)*r/2,60-(minY+maxY)*r/2,r);
  c.setAttribute('aria-label',`Næste brik: ${tiles[round.next].name}, ${VALUES[round.next]} point`);
  }
  document.querySelectorAll('.family-item').forEach((el,i)=>el.classList.toggle('reached',i<=round.maxTier));
}
function makeTileBody(tier,x,y){
  const radius=tileRadius(tier),outline=tileOutline(tier).map(p=>({x:p.x*radius,y:p.y*radius}));
  // fromVertices recentres concave parts on their combined centre of mass.
  // Retain that offset so the artwork rotates about exactly the same point.
  const centre=Vertices.centre(outline);
  // Visible area already adds mass; higher tiers also have a little more density.
  const body=Bodies.fromVertices(x,y,[outline],{restitution:.28,friction:.10,frictionStatic:.18,frictionAir:.007,density:.002*(1+tier*.08),slop:.02},true,.001,0,.001);
  body.plugin={tile:true,tier,alive:true,age:0,danger:0,artOffset:centre,outline:outline.map(p=>({x:p.x-centre.x,y:p.y-centre.y})),ballRadius:Math.max(...outline.map(p=>Math.hypot(p.x-centre.x,p.y-centre.y)))};
  return body;
}
function freeEmbeddedBalls(){
 const balls=bodies.filter(b=>b.plugin.alive&&b.plugin.tier===0);
 if(!balls.length)return;
 const outline=b=>{const c=Math.cos(b.angle),s=Math.sin(b.angle);return b.plugin.outline.map(p=>({x:b.position.x+p.x*c-p.y*s,y:b.position.y+p.x*s+p.y*c}));};
 const polygons=new Map(bodies.filter(b=>b.plugin.alive).map(b=>[b,outline(b)]));
 for(const ball of balls){
  const others=[...polygons].filter(([b])=>b!==ball).map(([,p])=>p);
  const target=findBallEscape(ball.position,ball.plugin.ballRadius,others,{left:LEFT,right:RIGHT,floor:FLOOR});
  if(!target)continue;
  const dx=target.x-ball.position.x,dy=target.y-ball.position.y,length=Math.hypot(dx,dy),nx=dx/length,ny=dy/length;
  const inward=Math.min(0,ball.velocity.x*nx+ball.velocity.y*ny);
  Body.setPosition(ball,target);Body.setVelocity(ball,{x:ball.velocity.x-inward*nx,y:ball.velocity.y-inward*ny});
  ball.positionImpulse.x=ball.positionImpulse.y=0;
  polygons.set(ball,outline(ball));
 }
}
function refreshPhysics(){
  dropPreview=null;
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
function firework(x,y,level){
 const colors=['#ffd052','#ff7986','#51dfdf','#fff2b0','#bd94ff'];
 const count=reducedMotion.matches?8:18+level*12;
 for(let i=0;i<count;i++){const a=i/count*Math.PI*2,s=65+Math.random()*(55+level*35),life=.65+Math.random()*.6+level*.12;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-30,life,max:life,color:colors[i%colors.length],size:2+Math.random()*3,firework:true});}
 particles=particles.slice(-600);
}
function burst(x,y,tier,celebrate=false){
 if(celebrate&&tier>=7){const level=tier-6;firework(x,y,level);
  if(!reducedMotion.matches){for(let i=0;i<level;i++)fireworks.push({at:time+.18*(i+1),x:Math.max(55,Math.min(W-55,x+(i%2?1:-1)*(45+i*12))),y:Math.max(TOP+35,y-70-i*35),level});
   $('#score').getAnimations().forEach(a=>a.cancel());$('#score').animate([{transform:'scale(1)'},{transform:'scale(1.16)',color:'#d58b08'},{transform:'scale(1)'}],{duration:450});
  }
 }else{const count=reducedMotion.matches?5:12;for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=35+Math.random()*95;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,life:.6+Math.random()*.5,max:1.1,color:tiles[tier].color,size:2+Math.random()*4});}}
}
function scoreFloat(x,y,value){floats.push({x,y,text:`+${value}`,life:.8});}
Events.on(engine,'collisionStart',({pairs})=>{
  if(mode!=='playing')return;
  for(const pair of pairs){const a=pair.bodyA.parent,b=pair.bodyB.parent;if(a.plugin.tile&&b.plugin.tile&&a.plugin.alive&&b.plugin.alive&&a.plugin.tier===b.plugin.tier&&a.plugin.tier<VALUES.length){a.plugin.alive=b.plugin.alive=false;pending.push([a,b]);}}
});
function processMerges(){
  for(const [a,b] of pending){const x=(a.position.x+b.position.x)/2,y=(a.position.y+b.position.y)/2,tier=mergeRound(round,a.plugin.tier,b.plugin.tier);Composite.remove(engine.world,[a,b]);bodies=bodies.filter(v=>v!==a&&v!==b);if(tier!==null){scoreEvent(tier===CLEAR_PAIR&&round.svendBonus?'b':'m',a.plugin.tier,time);if(tier===CLEAR_PAIR){burst(x,y,VALUES.length-1,true);tileSound(VALUES.length-1);floats.push({x,y,text:round.svendBonus?`+${numberFormat.format(round.svendBonus)}!`:'Mere plads!',life:1.8});if(round.svendBonus)rewardNotices.push({kind:'svend',text:`🎆 To Svend! +${numberFormat.format(round.svendBonus)} bonuspoint`});setStatus('To Svend — mere plads til familien!');continue;}const n=spawn(tier,x,y);Body.setVelocity(n,{x:(a.velocity.x+b.velocity.x)*.18,y:Math.min(0,(a.velocity.y+b.velocity.y)*.18)});burst(x,y,tier,true);scoreFloat(x,y,VALUES[tier]);tileSound(tier);}}
  if(pending.length)syncUI();pending=[];
}
let dropPreview=null;
function dropPlacement(){
 const tier=round.current;
 // Artwork is centred on the aim, while Matter positions its centre of mass.
 if(!dropPreview||dropPreview.plugin.tier!==tier)dropPreview=makeTileBody(tier,aim,SPAWN);
 const candidate=dropPreview,offset=candidate.plugin.artOffset;
 Body.setPosition(candidate,{x:aim+offset.x,y:SPAWN+offset.y});
 // Clamp the actual silhouette, including asymmetric arms, rather than a radius.
 const correction=candidate.bounds.min.x<LEFT+1?LEFT+1-candidate.bounds.min.x:candidate.bounds.max.x>RIGHT-1?RIGHT-1-candidate.bounds.max.x:0;
 if(correction)Body.setPosition(candidate,{x:candidate.position.x+correction,y:candidate.position.y});
 const x=candidate.position.x-offset.x,bounds=candidate.bounds;
 const parts=candidate.parts.length>1?candidate.parts.slice(1):[candidate];
 const occupied=bodies.filter(b=>b.plugin.alive);
 const blocked=bounds.min.x<LEFT||bounds.max.x>RIGHT||bounds.min.y<0||bounds.max.y>FLOOR||parts.some(part=>Matter.Query.collides(part,occupied).length>0);
 return {candidate,x,blocked};
}
function drop(){
 if(removing||mode!=='playing'||document.querySelector('dialog[open]')||time-round.lastDrop<DROP_DELAY)return;
 const {candidate,x,blocked}=dropPlacement();
 if(blocked){setStatus('Ingen plads her — sigt et andet sted, eller brug Ryst / Fjern.');return;}
 const tier=dropRound(round,time);if(tier===null)return;
 dropPreview=null;bodies.push(candidate);Composite.add(engine.world,candidate);
 scoreEvent('d',tier,time);scoreFloat(x,SPAWN+25,VALUES[tier]);dropSound();syncUI();setStatus('Find en makker. Skab noget større.');
}
function showOverlay(title,text,button,kicker='ET LILLE ØJEBLIK',foot='Træk for at sigte · Slip for at droppe'){
  $('#game-over-logo').hidden=true;$('#overlay').classList.remove('game-over');$('#score-result-open').hidden=true;
  $('.game-logo').hidden=true;$('#overlay-title').textContent=title;$('#overlay-text').textContent=text;$('#play').textContent=button;$('#overlay-kicker').textContent=kicker;$('#overlay-foot').textContent=foot;$('#overlay').hidden=false;
}
let savedPageY=0;
function lockPlayScreen(lock){
  if(lock&&!document.body.classList.contains('playing'))savedPageY=window.scrollY;
  document.body.classList.toggle('playing',lock);
  if(!lock){window.scrollTo(0,savedPageY);liveNotices.clear();rewardNotices.clear();}
}
function start(){
  if(!assetsReady)return;
  ensureAudio();if(!requirePlayerName(start))return;
  playClock.pause();flushScore();playClock.start();
  scoreRoundStart();
  ensureAudio();if(audioCtx){recordedBuffer('assets/game-over-voice.m4a').catch(()=>{});recordedBuffer('assets/danger-riser.m4a').catch(()=>{});}
  document.body.classList.add('started');fireworks=[];dangerProgress=0;$('#game-over-logo').hidden=true;$('#overlay').classList.remove('game-over');
  dropPreview=null;rewardNotices.clear();stopSounds();Composite.remove(engine.world,bodies);Engine.clear(engine);bodies=[];pending=[];particles=[];floats=[];round=createRound(availableSvendBonus);powers={shake:1,remove:1};rewardLevel=0;removing=false;shakeUntil=0;time=0;aim=W/2;mode='playing';lockPlayScreen(true);keys.clear();dragging=false;$('#overlay').hidden=true;$('#danger').hidden=true;$('#pause').disabled=false;$('#pause').textContent='Ⅱ';$('#pause').setAttribute('aria-label','Sæt spil på pause');setStatus('Slip din første figur');ensureAudio();syncUI();canvas.focus({preventScroll:true});mobileDisplay.enter();livePlayers.changed();
}
function pause(){if(mode!=='playing')return;playClock.pause();syncClock();mode='paused';cancelRemove();lockPlayScreen(false);flushScore();refreshLeaderboard();keys.clear();dragging=false;stopSounds();$('#pause').textContent='▷';$('#pause').setAttribute('aria-label','Fortsæt spillet');setStatus('Tag dig god tid');showOverlay('Pause','','Spil videre','','');livePlayers.changed();}
function resume(){if(mode!=='paused'||document.querySelector('dialog[open]'))return;playClock.resume();mode='playing';syncPowers();lockPlayScreen(true);$('#overlay').hidden=true;$('#pause').textContent='Ⅱ';$('#pause').setAttribute('aria-label','Sæt spil på pause');setStatus('Find en makker. Skab noget større.');ensureAudio();canvas.focus({preventScroll:true});mobileDisplay.enter();livePlayers.changed();}
function end(){if(mode==='over')return;playClock.pause();syncClock();mode='over';mobileDisplay.leave();fireworks=[];cancelRemove();lockPlayScreen(false);stopSounds();keys.clear();$('#pause').disabled=true;$('#danger').hidden=true;setStatus('En fin lille samling');showOverlay('',`Du samlede ${numberFormat.format(round.score)} point og nåede ${tiles[round.maxTier].name}.`,'Prøv igen ↗','RUNDE SLUT',`Din rekord: ${numberFormat.format(best)} point`);$('#game-over-logo').hidden=false;$('#overlay').classList.add('game-over');gameOverSound();scoreRoundEnd(round,playSeconds());livePlayers.changed();}
function step(dt){
  if(mode!=='playing')return;time+=dt;if(shakeUntil&&time<shakeUntil){const pulse=Math.floor((time-(shakeUntil-.65))/.16);if(pulse>shakePulse){shakePulse=pulse;shakeKick(pulse%2?-1:1);}}if(shakeUntil&&time>=shakeUntil){shakeUntil=0;syncPowers();}
  if(keys.has('ArrowLeft'))aim-=260*dt;if(keys.has('ArrowRight'))aim+=260*dt;
  aim=Math.max(LEFT,Math.min(RIGHT,aim));
  // Four small 240 Hz solves keep fast, heavy tiles from crossing thin silhouette parts.
  for(let sub=0;sub<4;sub++){Engine.update(engine,dt*250);processMerges();freeEmbeddedBalls();}
  let worst=0;
  for(const body of bodies){body.plugin.age+=dt;body.plugin.danger=advanceDanger(body.plugin.danger,Math.min(...body.vertices.map(v=>v.y))<TOP,dt);worst=Math.max(worst,body.plugin.danger);}
  dangerProgress=Math.min(1,worst/TOP_WAIT);
  dangerAudio.sync(worst,soundOn);
  $('#danger').hidden=worst<.8;if(worst>=.8)$('#danger b').textContent=Math.max(0,TOP_WAIT-worst).toFixed(1).replace('.',',');
  if(worst>=TOP_WAIT)end();
  for(const f of fireworks.filter(f=>f.at<=time))firework(f.x,f.y,f.level);fireworks=fireworks.filter(f=>f.at>time);
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=110*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);
  for(const f of floats){f.y-=30*dt;f.life-=dt;}floats=floats.filter(f=>f.life>0);
}
function render(){
  syncClock();
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#e5ecd9';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#d6dfca75';for(let x=20;x<W;x+=22)for(let y=18;y<H;y+=22){ctx.beginPath();ctx.arc(x,y,.65,0,7);ctx.fill();}
  ctx.lineCap='round';ctx.setLineDash([]);
  const urgency=dangerProgress,amplitude=reducedMotion.matches?0:4*urgency*urgency;
  ctx.save();ctx.translate(Math.sin(time*(12+urgency*32))*amplitude,Math.cos(time*(15+urgency*36))*amplitude*.55);
  ctx.beginPath();ctx.moveTo(LEFT,TOP);ctx.lineTo(RIGHT,TOP);
  ctx.strokeStyle=`rgb(${Math.round(7+173*urgency)},${Math.round(83-58*urgency)},${Math.round(110-82*urgency)})`;ctx.lineWidth=7;ctx.stroke();
  ctx.strokeStyle=`rgb(255,${Math.round(208-164*urgency)},${Math.round(82-44*urgency)})`;ctx.lineWidth=3+urgency;ctx.stroke();ctx.restore();
  ctx.font='600 11px -apple-system, sans-serif';ctx.fillStyle=urgency>.5?'#a32120':'#15536a';ctx.textAlign='left';ctx.fillText('HOLD FIGURERNE UNDER LINJEN',LEFT+8,TOP+20);
  ctx.beginPath();ctx.moveTo(LEFT,TOP+32);ctx.lineTo(LEFT,FLOOR-15);ctx.quadraticCurveTo(LEFT,FLOOR,LEFT+15,FLOOR);ctx.lineTo(RIGHT-15,FLOOR);ctx.quadraticCurveTo(RIGHT,FLOOR,RIGHT,FLOOR-15);ctx.lineTo(RIGHT,TOP+32);ctx.strokeStyle='#07536e';ctx.lineWidth=8;ctx.stroke();ctx.strokeStyle='#29a8b4';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#f8d36a';ctx.lineWidth=1;ctx.stroke();
  for(const body of bodies){const d=body.plugin;if(!d.alive)continue;const r=tileRadius(d.tier),o=d.artOffset,a=body.angle;drawTile(ctx,d.tier,body.position.x-o.x*Math.cos(a)+o.y*Math.sin(a),body.position.y-o.x*Math.sin(a)-o.y*Math.cos(a),r,{rotation:a});if(d.danger>.8){ctx.strokeStyle=`rgba(184,78,62,${Math.min(.8,d.danger/TOP_WAIT)})`;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(body.position.x,body.position.y,r+3,-Math.PI/2,-Math.PI/2+Math.PI*2*d.danger/TOP_WAIT);ctx.stroke();}}
  if(mode==='playing'||mode==='paused'){
    const radius=tileRadius(round.current),{x,blocked:occupied,candidate}=dropPlacement(),blocked=time-round.lastDrop>=DROP_DELAY&&occupied;canvas.dataset.dropBlocked=String(blocked);ctx.strokeStyle=blocked?'#c52d3c':'#92a98060';ctx.lineWidth=1;ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(x,SPAWN+radius+7);ctx.lineTo(x,FLOOR-6);ctx.stroke();ctx.setLineDash([]);drawTile(ctx,round.current,x,SPAWN,radius,{alpha:time-round.lastDrop<DROP_DELAY?.55:1});ctx.font='9px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillStyle='#879a78';ctx.fillText(blocked?'× Ingen plads':'↓',x,Math.max(15,SPAWN-radius-10));
    if(blocked){
      ctx.beginPath();candidate.plugin.outline.forEach((p,i)=>{const px=candidate.position.x+p.x,py=candidate.position.y+p.y;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.closePath();
      ctx.fillStyle='#ed263e88';ctx.fill();ctx.strokeStyle='#b8152c';ctx.lineWidth=2;ctx.stroke();
      ctx.font='bold 11px -apple-system,sans-serif';ctx.fillStyle='#ae172a';ctx.fillText('× Ingen plads',x,Math.max(15,SPAWN-radius-10));
    }
  }
  for(const p of particles){ctx.save();ctx.globalAlpha=Math.min(1,p.life*2);if(p.firework){ctx.beginPath();ctx.moveTo(p.x-p.vx*.035,p.y-p.vy*.035);ctx.lineTo(p.x,p.y);ctx.strokeStyle=p.color;ctx.lineWidth=p.size*.65;ctx.stroke();}ctx.fillStyle=p.color;ctx.translate(p.x,p.y);ctx.rotate(p.life*3);ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);ctx.restore();}
  for(const f of floats){ctx.globalAlpha=Math.min(1,f.life*2);ctx.fillStyle='#426843';ctx.font='600 15px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y);}ctx.globalAlpha=1;
}
let last=performance.now(),acc=0;
function frame(now){const elapsed=Math.min(.08,(now-last)/1000);last=now;if(mode==='playing'){acc+=elapsed;while(acc>=1/60){step(1/60);acc-=1/60;}}else acc=0;render();requestAnimationFrame(frame);}
function updateAim(event){const rect=canvas.getBoundingClientRect();aim=(event.clientX-rect.left)/rect.width*W;}
canvas.addEventListener('pointerdown',e=>{if(mode!=='playing'||!e.isPrimary)return;e.preventDefault();if(removing){const r=canvas.getBoundingClientRect();removeAt((e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H);return;}ensureAudio();dragging=true;updateAim(e);canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(mode==='playing'&&(dragging||e.pointerType==='mouse'))updateAim(e);});
canvas.addEventListener('pointerup',e=>{if(!dragging||!e.isPrimary)return;e.preventDefault();dragging=false;updateAim(e);drop();});
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
const portrait=$('#portrait');
let portraitBackdropDown=false,portraitTier=null;
$('#portrait-play').onclick=()=>{if(portraitTier===null||!portrait.open)return;stopSounds();tileSound(portraitTier,true);};
const outsidePortrait=e=>{const r=portrait.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
portrait.addEventListener('pointerdown',e=>{portraitBackdropDown=outsidePortrait(e);});
portrait.addEventListener('click',e=>{if(portraitBackdropDown&&outsidePortrait(e))portrait.close();portraitBackdropDown=false;});
function buildFamily(){
  $('#family').replaceChildren();tiles.forEach((t,i)=>{const el=document.createElement('button');el.type='button';el.className='family-item';el.setAttribute('aria-label',`Se ${t.name} i stor størrelse`);el.onclick=()=>{stopSounds();portraitTier=i;$('#portrait-play').setAttribute('aria-label',`Afspil lyden til ${t.name}`);const img=$('#portrait-image');img.src=tileSource(i);img.alt=t.name;$('#portrait-name').textContent=t.name;$('#portrait-points').textContent=`${numberFormat.format(VALUES[i])} point`;openDialog('portrait');};const c=document.createElement('canvas');c.width=100;c.height=95;c.setAttribute('aria-label',t.name);drawTile(previewContext(c,100,95),i,50,47,tileRadius(i,21+i*1.3),{number:false});const value=document.createElement('b');value.textContent=String(VALUES[i]);const name=document.createElement('span');name.textContent=t.name;el.append(c,value,name);$('#family').append(el);});syncUI();
}
let departed=false;
const rewardNotices=createRewardNotices({
 canShow:()=>mode==='playing'&&!document.hidden,
 show:notice=>{liveNotices.suspend();const el=$('#reward-announcement');el.textContent=notice.text;el.classList.add('visible');document.body.classList.add('reward-notice');},
 hide:()=>{$('#reward-announcement').classList.remove('visible');document.body.classList.remove('reward-notice');liveNotices.resume();},
 sound:()=>{effectTone(659,659,0,.13,.07,'triangle');effectTone(830,830,.1,.14,.065,'triangle');effectTone(1047,1319,.2,.28,.07,'sine');}
});
const liveNotices=createLiveNotices({canNotify:()=>mode==='playing'&&!document.hidden,show:notice=>{const el=$('#live-announcement');el.textContent=notice.text;el.dataset.kind=notice.kind;el.classList.add('visible');},hide:()=>$('#live-announcement').classList.remove('visible')});
const livePlayers=createLivePlayers({api:scoreApi,getTicket:liveRoundTicket,getNickname:liveNickname,getState:()=>({mode,score:round.score,maxTier:round.maxTier}),render:(snapshot,status)=>{renderLivePlayers(snapshot,status);liveNotices.observe(snapshot,status);},visible:()=>!document.hidden&&!departed});
window.addEventListener('pagehide',()=>{departed=true;livePlayers.changed();});window.addEventListener('pageshow',()=>{departed=false;livePlayers.changed();});
window.addEventListener('online',()=>{livePlayers.changed();});window.addEventListener('offline',()=>{livePlayers.changed();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)rewardNotices.clear();livePlayers.changed();});
const mobileDisplay=initMobileDisplay({isPlaying:()=>mode==='playing',pause,cancelDrag:()=>{dragging=false;}});
initLeaderboard();livePlayers.changed();updateSoundButton();buildFamily();requestAnimationFrame(frame);
$('#play').disabled=true;
(async()=>{
 let imageDone=0,imageTotal=11,rulesDone=false,failed=false;
 const progress=()=>{
  if(failed)return;
  const percent=Math.round((imageDone+Number(rulesDone))/(imageTotal+1)*100);
  $('#load-progress').value=percent;
  $('#load-label').textContent=imageDone===imageTotal&&!rulesDone?`Henter spilindstillinger … ${percent}%`:`Indlæser figurer … ${percent}%`;
 };
 try{
  await Promise.all([
   preloadImages((done,total)=>{imageDone=done;imageTotal=total;progress();}),
   scoreApi.gameRules().then(r=>{availableSvendBonus=r?.svend_bonus===SVEND_BONUS?SVEND_BONUS:0;}).catch(()=>{}).finally(()=>{rulesDone=true;progress();})
  ]);
  buildFamily();assetsReady=true;$('#play').disabled=false;$('#load-label').textContent='Klar til at spille · 100%';
 }catch(err){failed=true;$('#load-label').textContent='Indlæsningen mislykkedes. Prøv igen.';$('#load-retry').hidden=false;}
})();
$('#load-retry').onclick=()=>location.reload();
// Opt-in test interface: never present on the ordinary page.
if(new URLSearchParams(location.search).get('test')==='1')window.__mergeTest={shake,removeAt,toggleRemove(){removing=!removing;syncPowers();},setScore(score){round.score=score;syncUI();},start,pause,resume,drop,step,spawn,processMerges,engine,refreshPhysics,get ready(){return assetsReady;},get state(){return {mode,dangerProgress,effects:{particles:particles.length,fireworks:fireworks.length,audio:activeAudio.length},powers:{...powers},removing,round:{...round},time,bodies:bodies.map(b=>({id:b.id,tier:b.plugin.tier,x:b.position.x,y:b.position.y,danger:b.plugin.danger})),best};},position(body,x,y){Body.setPosition(body,{x,y});},setAim(x){aim=x;},setDropTier(tier){round.current=tier;},advance(seconds){for(let i=0;i<seconds*60;i++)step(1/60);},end};
