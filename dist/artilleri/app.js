import {initOnlineLobby} from './lobby.js?v=lobby-19';
import {createCombatAudio} from './audio.js?v=lobby-19';
import {initWeaponPicker} from './weapon-picker.js?v=lobby-19';
import {shotFrame} from './presentation.js?v=lobby-19';
import {W,H,newGame,fire,bestShot,weapons} from './rules.js?v=lobby-19';
import {render} from './render.js?v=lobby-19';
import {swipeAim,guidanceCharges} from './aim.js?v=lobby-19';
import {initDisplay} from './display.js?v=lobby-19';
import * as online from './online.js?v=lobby-19';
const $=s=>document.querySelector(s),canvas=$('#field'),ctx=canvas.getContext('2d',{alpha:false});const renderScale=Math.min(2,Math.max(1.5,window.devicePixelRatio||1));canvas.width=Math.round(W*renderScale);canvas.height=Math.round(H*renderScale);ctx.setTransform(renderScale,0,0,renderScale,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
let game=null,kind=null,room=null,animation=null,poll=null,busy=false,lastVersion=-1,guidanceSpent=[0,0],guideUntil=0,guideTimer=null,bannerTimer=null,aiTimer=null,frameId=null,epoch=0,queuedState=null,polling=false;
const display=initDisplay({hasGame:()=>!!game});
const soundButton=document.createElement('button');soundButton.id='sound-toggle';soundButton.type='button';document.querySelector('.game-actions').append(soundButton);
const sound=createCombatAudio({onChange:syncSound});
function syncSound(){soundButton.textContent=sound.enabled?'🔊':'🔇';soundButton.setAttribute('aria-label',sound.enabled?'Slå lyd fra':'Slå lyd til');soundButton.setAttribute('aria-pressed',String(sound.enabled));}syncSound();soundButton.onclick=()=>{sound.toggle();syncSound();};
const lobby=document.createElement('div');lobby.id='online-lobby';lobby.hidden=true;document.querySelector('.field-stage').append(lobby);
function syncLobby(){lobby.hidden=kind!=='online'||!room||room.ready;if(!lobby.hidden)lobby.innerHTML='<span>ONLINE · TO SPILLERE</span><strong>Venter på modstander</strong><p>Vælg en spiller i menuens spillerliste.</p>';}
const weaponPicker=initWeaponPicker($('#weapon'),controls);
for(const event of ['pointerdown','touchend','keydown'])document.addEventListener(event,()=>sound.unlock(),{capture:true,passive:true});
for(const id of ['leave-game','rotate-back'])$('#'+id).addEventListener('click',()=>sound.suspend());
window.addEventListener('pagehide',()=>sound.suspend());
let hiddenAt=null,pausedMs=0;
function presentationNow(now=performance.now()){return now-pausedMs-(hiddenAt===null?0:now-hiddenAt);}
const resumePlayback=document.createElement('button');resumePlayback.id='resume-playback';resumePlayback.type='button';resumePlayback.textContent='▶ Fortsæt spil';resumePlayback.hidden=true;document.querySelector('.field-stage').append(resumePlayback);
function resumeFromBackground(){sound.unlock();if(hiddenAt!==null){pausedMs+=performance.now()-hiddenAt;hiddenAt=null;}resumePlayback.hidden=true;controls();if(!animation&&queuedState){const next=queuedState;queuedState=null;void sync(next);}else if(!animation&&kind==='solo'&&game?.turn===1&&!busy)after();}
resumePlayback.onclick=resumeFromBackground;
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(hiddenAt===null)hiddenAt=performance.now();sound.suspend();}else if(hiddenAt!==null){if(game&&display.isActive())resumePlayback.hidden=false;else resumeFromBackground();}controls();});

const banner=document.createElement('div');banner.id='result-banner';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');document.querySelector('.field-stage').append(banner);
function hideBanner(){clearTimeout(bannerTimer);banner.hidden=true;}
function showOutcome(result,roundResult=false){
 hideBanner();const metric=p=>game.mode==='greedy'?p.cash:p.score,lead=metric(game.players[0])===metric(game.players[1])?null:(metric(game.players[0])>metric(game.players[1])?0:1);
 const title=roundResult?(game.winner!==null?`${game.players[game.winner].name} vinder kampen`:result.roundWinner===null?'Runden er uafgjort':`${game.players[result.roundWinner].name} vinder runde ${result.beforeRound}`):(result.hit.direct?'Direkte træf':result.damages.some(d=>d>0)?'Træffer':result.hit.miss?'Forbi målet':'Nedslag');
 const gains=result.scoreGains.map((gain,i)=>`${game.players[i].name}: +${gain} point`).join(' · ');
 banner.innerHTML=`<strong>${esc(title)}</strong><span>${esc(gains)}</span>${roundResult?`<small>${lead===null?'Stillingen er lige':`${esc(game.players[lead].name)} fører · ${metric(game.players[lead])}–${metric(game.players[1-lead])}`}</small>`:''}`;
 banner.classList.toggle('round-result',roundResult);banner.classList.toggle('impact-result',!roundResult);banner.hidden=false;
}
function cancelPresentation(){if(hiddenAt!==null){pausedMs+=performance.now()-hiddenAt;hiddenAt=null;}resumePlayback.hidden=true;sound.stop();weaponPicker.close();epoch++;clearTimeout(aiTimer);cancelAnimationFrame(frameId);animation=null;queuedState=null;hideBanner();busy=false;}
function shownGame(){
 if(!game||!animation)return game;
 const flight=animation.index<animation.path.length,players=(flight?animation.before:animation.impactPlayers).map((p,i)=>({...game.players[i],...p,score:flight?p.score:game.players[i].score,cash:flight?p.cash:game.players[i].cash}));
 return {...game,round:animation.beforeRound,wind:animation.windBefore,players};
}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(s){$('#status').textContent=s;}function onlineStatus(s){$('#online-status').textContent=s;}
function controls(){const view=shownGame();const can=!!game&&game.winner===null&&!busy&&hiddenAt===null&&(kind!=='online'||(room?.ready&&room.seat===game.turn))&&(kind!=='solo'||game.turn===0);$('#fire').disabled=!can;weaponPicker.sync({can,cash:game?game.players[game.turn].cash:0});for(const id of ['angle','power','weapon'])$('#'+id).disabled=!can;$('#angle-value').textContent=$('#angle').value+'°';$('#power-value').textContent=$('#power').value+'%';$('#aim-toggle').textContent=`Sigt ${$('#angle').value}° · ${$('#power').value}%`;const power=Number($('#power').value);$('#power-value').style.color=power<42?'#64d99b':power<73?'#f4d26a':'#f18772';const rankValue=p=>game?.mode==='greedy'?p.cash:p.score;const leader=game&&rankValue(view.players[0])!==rankValue(view.players[1])?(rankValue(view.players[0])>rankValue(view.players[1])?0:1):null;for(let i=0;i<2;i++)$('#player'+i).classList.toggle('leader',leader===i);for(let i=0;i<2;i++){const p=view?.players[i];$('#player'+i).innerHTML=p?`<div class="pilot-name"><b>${esc(p.name)}</b><span class="rank-tag">${leader===i?'FØRER':leader===null?'LIGE':game.turn===i?'SIGTER':''}</span></div><div class="pilot-score"><strong>${p.score.toLocaleString('da-DK')}</strong><span>POINT</span><span class="pilot-cash">◇ ${p.cash}</span></div><div class="pilot-health" role="meter" aria-label="${esc(p.name)} liv" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.hp}"><span style="width:${Math.max(0,p.hp)}%;background:${p.hp<30?'#ed8062':i?'#e0aa85':'#8bc9dc'}"></span></div><span class="hp-label">${p.hp} / 100</span>`:'';}$('#round').textContent=game?`RUNDE ${view.round} / ${game.maxRounds}  ·  VIND ${view.wind>0?'→':view.wind<0?'←':'·'} ${Math.abs(view.wind)}`:'';$('#connection').textContent=kind==='online'?'● ONLINE':'● LOKAL';syncLobby();const seat=game?.turn??0,charges=game?guidanceCharges(view.players[seat].score,guidanceSpent[seat]):0;$('#guide').disabled=!can||charges<1||Date.now()<guideUntil;$('#guide').textContent=matchMedia('(any-pointer:coarse) and (orientation:landscape) and (max-height:600px)').matches?(Date.now()<guideUntil?'Bane aktiv':`Bane · ${charges}`):(Date.now()<guideUntil?'Banevisning aktiv':`Banevisning · ${charges}`);display.sync();}
function draw(){const preview=game&&!animation&&Date.now()<guideUntil&&(kind!=='online'||room?.seat===game.turn)?{angle:Number($('#angle').value),power:Number($('#power').value)}:null;render(ctx,game,{animation,preview,aim:game?{player:game.turn,angle:Number($('#angle').value)}:null,time:performance.now()/1000,compact:matchMedia('(any-pointer:coarse)').matches});}
function animate(result,done){
 const token=epoch;hideBanner();busy=true;weaponPicker.close();const start=presentationNow();let impacted=false,resultShown=false;
 animation={...result,path:result.hit.path,radius:weapons[result.weapon].radius,...shotFrame(result,0)};sound.begin(result);sound.update(0,animation);controls();
 function frame(now){if(token!==epoch)return;if(document.hidden||hiddenAt!==null){frameId=requestAnimationFrame(frame);return;}const elapsed=Math.max(0,presentationNow(now)-start),state=shotFrame(result,elapsed);Object.assign(animation,state);sound.update(elapsed,state);
  if(!state.flight&&!impacted){impacted=true;status(describe(result));showOutcome(result,false);controls();}
  if(result.ended&&state.showBanner&&!resultShown){resultShown=true;showOutcome(result,true);}
  if(!result.ended&&!state.showBanner&&impacted)hideBanner();
  draw();if(state.done){sound.finish();hideBanner();animation=null;busy=false;controls();draw();done?.();}else frameId=requestAnimationFrame(frame);
 }frameId=requestAnimationFrame(frame);
}
function describe(result){const hit=result.damages[1-result.actor],self=result.damages[result.actor];return hit?`${game.players[result.actor].name} ramte for ${hit} skade${self?' og tog '+self+' selv':''}.`:`${game.players[result.actor].name}: ${self?'Egen skade '+self+'.':result.hit.miss?'Forbi målet.':'Terrænet blev ramt.'}`;}
function after(){
 controls();draw();
 if(queuedState){const next=queuedState;queuedState=null;void sync(next);return;}
 if(game.winner!==null){status(`${game.players[game.winner].name} vinder kampen! ${game.players[0].score}–${game.players[1].score}.`);return;}
 status(kind==='online'?(game.turn===room?.seat?'Din tur.':'Modstanderens tur.'):`${game.players[game.turn].name} skyder nu.`);
 if(kind==='solo'&&game.turn===1){busy=true;controls();const token=epoch;aiTimer=setTimeout(()=>{if(token!==epoch)return;if(hiddenAt!==null){busy=false;return;}const result=fire(game,bestShot(game,1));animate(result,after);},700);}
}

function reset(mode){cancelPresentation();clearInterval(poll);poll=null;room=null;kind=mode;game=newGame({mode:$('#mode').value,names:mode==='solo'?[$('#name').value.trim()||'Du','Computer']:[$('#name').value.trim()||'Spiller 1','Spiller 2']});lastVersion=-1;busy=false;guidanceSpent=[0,0];guideUntil=0;clearTimeout(guideTimer);document.body.classList.remove('aim-open');$('#aim-toggle').setAttribute('aria-expanded','false');display.enter();status(mode==='solo'?'Din tur. Vælg vinkel og kraft.':'Spiller 1 begynder.');controls();draw();}
$('#aim-toggle').onclick=()=>{const open=document.body.classList.toggle('aim-open');$('#aim-toggle').setAttribute('aria-expanded',String(open));};$('#solo').onclick=()=>reset('solo');$('#local').onclick=()=>reset('local');for(const id of ['angle','power'])$('#'+id).oninput=()=>{controls();draw();};$('#weapon').onchange=controls;
$('#fire').onclick=async()=>{if($('#fire').disabled)return;const token=epoch;hideBanner();const shot={angle:Number($('#angle').value),power:Number($('#power').value),weapon:$('#weapon').value};guideUntil=0;clearTimeout(guideTimer);busy=true;controls();try{if(kind==='online'){const next=await online.rpc('aa_fire',{p_code:room.code,p_version:room.version,p_angle:shot.angle,p_power:shot.power,p_weapon:shot.weapon});if(token!==epoch)return;await sync(next);}else{const result=fire(game,shot);animate(result,after);}}catch(e){if(token!==epoch)return;status(e.message);busy=false;controls();}};
function adjust(dx,dy){if($('#fire').disabled)return;const next=swipeAim(Number($('#angle').value),Number($('#power').value),dx,dy);$('#angle').value=next.angle;$('#power').value=next.power;controls();draw();}
$('#guide').onclick=()=>{if($('#guide').disabled||!game)return;const seat=game.turn;guidanceSpent[seat]++;if(kind==='online'&&room){try{localStorage.setItem(`aa-guide:${room.code}:${seat}`,String(guidanceSpent[seat]));}catch{}}guideUntil=Date.now()+6000;clearTimeout(guideTimer);guideTimer=setTimeout(()=>{guideUntil=0;controls();draw();},6000);controls();draw();};
let touchState=null;
canvas.addEventListener('touchstart',e=>{if(!display.isActive())return;if(e.cancelable)e.preventDefault();if(e.touches.length!==1){if(touchState)touchState.valid=false;return;}if(!touchState){const p=e.touches[0];touchState={startX:p.clientX,startY:p.clientY,x:p.clientX,y:p.clientY,start:Date.now(),angle:Number($('#angle').value),power:Number($('#power').value),moved:false,valid:true};}},{passive:false});
canvas.addEventListener('touchmove',e=>{if(!display.isActive())return;if(e.cancelable)e.preventDefault();if(!touchState)return;if(e.touches.length!==1){touchState.valid=false;return;}if(!touchState.valid)return;const p=e.touches[0],dx=p.clientX-touchState.startX,dy=p.clientY-touchState.startY;if(Math.hypot(dx,dy)>8)touchState.moved=true;if(touchState.moved&&!$('#fire').disabled){const next=swipeAim(touchState.angle,touchState.power,dx,dy);$('#angle').value=next.angle;$('#power').value=next.power;controls();draw();}},{passive:false});
canvas.addEventListener('touchend',e=>{if(!display.isActive()||!touchState)return;if(e.cancelable)e.preventDefault();if(e.touches.length===0){if(touchState.valid&&!touchState.moved&&Date.now()-touchState.start<350)$('#fire').click();touchState=null;}},{passive:false});canvas.addEventListener('touchcancel',()=>{touchState=null;});
canvas.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&display.isActive())$('#fire').click();});
document.addEventListener('wheel',e=>{if(!display.isActive())return;if(e.cancelable)e.preventDefault();if(e.target.closest('.game')&&!e.target.closest('input,select,button'))adjust(Math.max(-80,Math.min(80,e.deltaX)),Math.max(-80,Math.min(80,e.deltaY)));},{passive:false});
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','BUTTON'].includes(document.activeElement.tagName))return;if(e.code==='Space'){e.preventDefault();$('#fire').click();}else if(e.code==='ArrowLeft'||e.code==='ArrowRight'||e.code==='ArrowUp'||e.code==='ArrowDown'){e.preventDefault();adjust(e.code==='ArrowLeft'?-12:e.code==='ArrowRight'?12:0,e.code==='ArrowUp'?-8:e.code==='ArrowDown'?8:0);}});
async function sync(next){
 if(!next)return;
 if(animation||hiddenAt!==null){if(!queuedState||next.version>=queuedState.version)queuedState=next;return;}
 const fresh=!game||kind!=='online'||room?.code!==next.code||game.seed!==next.seed;
 if(!fresh&&next.version<lastVersion)return;
 room=next;try{localStorage.setItem('aa-last-room',next.code);}catch{}$('#room').textContent=`Kampkode: ${next.code} · ${next.ready?'Kampen er klar':'Venter på modstander…'}`;
 if(fresh){cancelPresentation();room=next;kind='online';game=newGame({seed:next.seed,mode:next.mode,names:[next.host_name||'Vært',next.guest_name||'Gæst']});lastVersion=0;guidanceSpent=[0,0];guideUntil=0;try{guidanceSpent[next.seat]=Number(localStorage.getItem(`aa-guide:${next.code}:${next.seat}`))||0;}catch{}document.body.classList.remove('aim-open');$('#aim-toggle').setAttribute('aria-expanded','false');display.enter();}
 game.players[0].name=next.host_name||'Vært';game.players[1].name=next.guest_name||'Gæst';
 if(fresh){for(const shot of next.shots){if(game.winner!==null)break;fire(game,shot);}lastVersion=next.version;busy=false;controls();draw();status(next.ready?(game.turn===next.seat?'Din tur.':'Modstanderens tur.'):'Vælg en modstander i menuens spillerliste.');return;}
 if(lastVersion<next.version&&game.winner===null){const result=fire(game,next.shots[lastVersion]);lastVersion++;if(lastVersion<next.version)queuedState=next;animate(result,after);}
 else{busy=false;controls();draw();status(!next.ready?'Venter på modstander':game.winner!==null?`${game.players[game.winner].name} vinder kampen!`:game.turn===next.seat?'Din tur.':'Modstanderens tur.');}
}
function startPolling(){clearInterval(poll);poll=setInterval(async()=>{if(!room||busy||document.hidden||hiddenAt!==null||polling)return;const token=epoch,code=room.code;polling=true;try{const next=await online.rpc('aa_state',{p_code:code});if(token===epoch&&room?.code===code&&!busy)await sync(next);}catch(e){if(token===epoch){onlineStatus('Forbindelsen blev afbrudt: '+e.message);status('Forbindelsen er afbrudt. Prøver igen…');}}finally{polling=false;}},1500);}

initOnlineLobby({api:online,onStart:async next=>{cancelPresentation();await sync(next);startPolling();},isAvailable:()=>!display.isActive()||!game||game.winner!==null,onProfile:()=>{}});
draw();controls();window.addEventListener('artillery-assets-loaded',draw);

let lastAmbient=0;function ambientFrame(now){if(now-lastAmbient>50&&!document.hidden){draw();lastAmbient=now;}requestAnimationFrame(ambientFrame);}requestAnimationFrame(ambientFrame);
