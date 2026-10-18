import {formatPlayTime} from './play-time.js?v=1.1.0';
import {SCORE_CONFIG} from './score-config.js';
import {createScoreAutosave} from './score-autosave.js?v=1.1.4';
const $=s=>document.querySelector(s),fmt=new Intl.NumberFormat('da-DK');
const storage={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}},remove(k){try{localStorage.removeItem(k);}catch{}},keys(){try{return Object.keys(localStorage);}catch{return [];}}};
export function validNickname(value){return /^[\p{L}\p{N} _-]{2,20}$/u.test(value.trim());}
export function createScoreApi(config,{fetcher=fetch,store=storage}={}){
 const ready=Boolean(config.url&&config.key);let session=null,sessionRequest=null;
 const sessionKey=`almind-score-session:${config.url}`;
 async function request(path,body,token){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const headers={'Content-Type':'application/json',apikey:config.key};if(token)headers.Authorization=`Bearer ${token}`;
   const r=await fetcher(`${config.url}${path}`,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
   const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.message||data.msg||'Highscoretjenesten svarer ikke'),{code:data.code});return data;
  }finally{clearTimeout(timer);}
 }
 async function getSession(){
  const run=async()=>{
   try{session=JSON.parse(store.get(sessionKey))||session;}catch{}
   if(session?.access_token&&session.expires_at>Date.now()/1000+60)return session;
   const data=session?.refresh_token?await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}):await request('/auth/v1/signup',{data:{game:'almind-merge'}});
   if(!data.access_token||!data.user?.id)throw new Error('Kunne ikke oprette spillerprofil');
   session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||Date.now()/1000+data.expires_in,user:data.user};store.set(sessionKey,JSON.stringify(session));return session;
  };
  if(!sessionRequest)sessionRequest=(globalThis.navigator?.locks?navigator.locks.request('almind-score-auth',run):run()).finally(()=>{sessionRequest=null;});
  return sessionRequest;
 }
 async function rpc(name,args={},auth=true){if(!ready)throw new Error('Highscorelisten er ikke tilsluttet endnu');const s=auth?await getSession():null;return request(`/rest/v1/rpc/${name}`,args,s?.access_token);}
 let logAvailable=true;
 async function save(kind,id,nickname,events,duration,meta){
  const args={p_round:id,p_nickname:nickname,p_events:events,p_duration:duration};
  if(meta&&logAvailable){try{return await rpc('am_save_round_logged',{...args,p_kind:kind,p_version:meta.version,p_game_over:meta.gameOver});}catch(error){if(error.code!=='PGRST202')throw error;logAvailable=false;}}
  if(kind==='gameover')return gameOver(id,nickname,events,duration);
  return rpc(kind==='checkpoint'?'am_checkpoint_round':'am_submit_round',args);
 }
 async function gameOver(id,nickname,events,duration){
  const args={p_round:id,p_nickname:nickname,p_events:events,p_duration:duration};
  try{return await rpc('am_game_over',args);}catch(error){if(error.code!=='PGRST202')throw error;return rpc('am_submit_round',args);}
 }
 return {ready,gameOver:(...args)=>save('gameover',...args),gameRules:()=>rpc('am_game_rules',{},false),createCode:()=>rpc('am_create_player_code'),useCode:(name,code)=>rpc('am_use_player_code',{p_nickname:name,p_code:code}),profile:()=>rpc('am_player_profile'),claim:name=>rpc('am_claim_name',{p_nickname:name}),live:(id,nickname,score,tier,active)=>rpc('am_live_update',{p_round:id,p_nickname:nickname,p_score:score,p_max_tier:tier,p_active:active}),liveList:()=>rpc('am_live_snapshot',{},false),start:()=>rpc('am_start_round'),checkpoint:(...args)=>save('checkpoint',...args),submit:(...args)=>save('submit',...args),list:async scope=>{
  // Public browsing doesn't create an account; use a stored identity for your rank.
  let hasSession=Boolean(session);try{hasSession ||= Boolean(JSON.parse(store.get(sessionKey))?.refresh_token);}catch{}
  try{return await rpc('am_leaderboard_v2',{p_scope:scope},hasSession);}catch(error){if(error.code!=='PGRST202')throw error;return rpc('am_leaderboard',{p_scope:scope},hasSession);}
 }};
}
export const scoreApi=createScoreApi(SCORE_CONFIG);const api=scoreApi;let scope='week',loadVersion=0;
let nickname=storage.get('almind-score-nickname')||'',profileId=null;
function message(text){$('#score-save-status').textContent=text;}
function renderRows(rows){
 const list=$('#highscore-list');list.replaceChildren();
 for(const row of rows){
  const li=document.createElement('li');li.className='highscore-row';if(row.is_me)li.classList.add('is-me');
  const rank=document.createElement('span');rank.className='highscore-rank';rank.textContent=Number(row.place)<=3?['🥇','🥈','🥉'][Number(row.place)-1]:`#${row.place}`;
  const person=document.createElement('span'),name=document.createElement('strong');name.textContent=row.nickname;person.append(name);
  const date=document.createElement('small'),duration=document.createElement('small');
  const stamp=row.achieved_at?new Date(row.achieved_at):null;
  date.textContent=stamp&&!Number.isNaN(stamp.getTime())?new Intl.DateTimeFormat('da-DK',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Copenhagen'}).format(stamp):'Dato ikke registreret';
  duration.textContent=row.duration_ms==null?'Spilletid ikke registreret':`Spilletid ${formatPlayTime(row.duration_ms/1000)}`;
  person.append(date,duration);
  const points=document.createElement('b');points.textContent=fmt.format(row.score);li.append(rank,person,points);list.append(li);
 }
}
export async function refreshLeaderboard(){
 const version=++loadVersion;$('#highscore-status').textContent='Henter rekorder…';
 try{const rows=await api.list(scope);if(version!==loadVersion)return;renderRows(rows);const own=rows.find(row=>row.is_me);if(profileId&&own)window.dispatchEvent(new CustomEvent('almind-profile',{detail:{id:profileId,best:own.score}}));$('#highscore-status').textContent=rows.length?'':'Ingen rekorder endnu. Bliver din den første?';}
 catch{if(version!==loadVersion)return;renderRows([]);$('#highscore-status').textContent=api.ready?'Listen kunne ikke hentes. Prøv Opdater igen.':'Den fælles liste åbner snart. Du kan stadig spille og gemme din lokale rekord.';}
}
let roundTimeSource=null;
export const setRoundTimeSource=source=>{roundTimeSource=source;};
const autosave=createScoreAutosave({getVersion:()=>'1.1.4',api,store:storage,getDuration:()=>roundTimeSource?.(),onStatus:message,onSaved:()=>{if(!document.body.classList.contains('playing'))refreshLeaderboard();}});
export function scoreRoundStart(){
 autosave.start(nickname);$('#score-result-open').hidden=true;message('Din rekord gemmes automatisk undervejs.');
}
export const scoreEvent=(kind,tier,time)=>autosave.event(kind,tier,time);
export function scoreRoundEnd(round,time){autosave.end(time);$('#score-result-open').hidden=false;}
export const flushScore=()=>autosave.flush();
let beginAfterName=null,nameChecked=false,nameChecking=false;
function openName(begin,error=''){
 beginAfterName=begin;$('#player-name-input').value=nickname;$('#player-name-error').textContent=error;
 if(!$('#player-name').open)$('#player-name').showModal();$('#player-name-input').focus();
}
export function requirePlayerName(begin){
 if(nameChecked&&validNickname(nickname))return true;
 if(nameChecking)return false;
 if(!api.ready){if(validNickname(nickname))return true;openName(begin);return false;}
 nameChecking=true;
 api.profile().then(profile=>{
  if(profile?.claimed){acceptProfile(profile);begin();}
  else openName(begin,profile?'Dit tidligere navn bruges af en anden profil. Vælg et nyt navn.':'');
 }).catch(()=>{
  // Existing players can play offline; a new name must be reserved online.
  if(validNickname(nickname)){nameChecked=true;begin();}
  else openName(begin,'Forbind til nettet for at vælge et ledigt navn.');
 }).finally(()=>{nameChecking=false;});
 return false;
}
function rememberName(value){nickname=value;storage.set('almind-score-nickname',value);$('#score-nickname').value=value;}
function acceptProfile(profile){
 rememberName(profile.nickname);nameChecked=true;
 if(profile.id)profileId=profile.id;
 if(profile.id)window.dispatchEvent(new CustomEvent('almind-profile',{detail:profile}));
}
function openPlayerLink(){
 if(document.body.classList.contains('started')){message('Gå til forsiden via logoet, før du skifter spillerprofil. Din gemte rekord bevares.');return;}
 if($('#player-name').open)$('#player-name').close();
 $('#player-link-name').value=nickname;$('#player-link-code').value='';$('#player-link-error').textContent='';
 $('#player-link').showModal();$('#player-link-name').focus();
}
function initPlayerCodes(){
 $('#player-code-open').onclick=openPlayerLink;$('#player-name-link').onclick=openPlayerLink;
 const close=()=>{$('#player-link').close();if(beginAfterName)openName(beginAfterName);};
 $('#player-link-close').onclick=close;
 $('#player-link').addEventListener('cancel',e=>{e.preventDefault();close();});
 $('#player-code-create').onclick=async()=>{
  const button=$('#player-code-create');button.disabled=true;
  try{
   const profile=await api.profile();
   if(!profile?.claimed)throw new Error('Denne browser er ikke tilknyttet din spillerprofil. Brug din eksisterende spillerkode, eller lav koden på en enhed, hvor profilen allerede er tilknyttet.');
   const result=await api.createCode();const output=$('#player-code-output');output.hidden=false;output.textContent=`${result.nickname}: ${result.code}`;
   $('#player-code-status').textContent='Din faste kode er klar. Gem den privat — den giver adgang til din profil.';
   button.textContent='Lav en ny kode';
  }catch(error){$('#player-code-status').textContent=error.message||'Koden kunne ikke oprettes. Prøv igen.';}
  finally{button.disabled=false;}
 };
 $('#player-link-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;if(button)button.disabled=true;
  try{
   const result=await api.useCode($('#player-link-name').value.trim(),$('#player-link-code').value.trim());
   if(result.error)throw new Error(result.error);
   if(!result.ok||!result.profile?.claimed)throw new Error('Profilen kunne ikke tilsluttes. Prøv igen.');
   acceptProfile(result.profile);$('#player-link').close();$('#player-link-code').value='';
   message(`Du spiller nu som ${result.profile.nickname}. Profil og rekord deles med dine andre enheder.`);
   refreshLeaderboard();const begin=beginAfterName;beginAfterName=null;begin?.();
  }catch(error){$('#player-link-error').textContent=error.message||'Profilen kunne ikke tilsluttes. Prøv igen.';}
  finally{if(button)button.disabled=false;}
 });
}
async function claimName(value){
 if(!validNickname(value))throw new Error('Brug 2–20 bogstaver, tal, mellemrum, _ eller -.');
 const claimed=await api.claim(value);rememberName(claimed);nameChecked=true;
 try{const profile=await api.profile();if(profile?.claimed)acceptProfile(profile);}catch{}
 void flushScore();return claimed;
}
export function initLeaderboard(){
 initPlayerCodes();
 $('#score-nickname').value=nickname;
 $('#score-profile').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;if(button)button.disabled=true;
  try{const value=await claimName($('#score-nickname').value.trim());message(`Hej ${value}! Dit navn huskes i denne browser.`);refreshLeaderboard();}
  catch(error){message(error.message||'Navnet kunne ikke gemmes. Prøv igen.');}
  finally{if(button)button.disabled=false;}
 });
 $('#player-name-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;if(button)button.disabled=true;
  try{
   await claimName($('#player-name-input').value.trim());$('#player-name').close();
   const begin=beginAfterName;beginAfterName=null;begin?.();
  }catch(error){$('#player-name-error').textContent=error.message||'Navnet kunne ikke gemmes. Prøv igen.';}
  finally{if(button)button.disabled=false;}
 });
 setInterval(()=>{if(!document.hidden)flushScore();},15000);
 window.addEventListener('online',flushScore);
 window.addEventListener('pagehide',flushScore);
 document.addEventListener('visibilitychange',flushScore);
 flushScore();
 for(const button of document.querySelectorAll('[data-score-scope]'))button.onclick=()=>{scope=button.dataset.scoreScope;for(const b of document.querySelectorAll('[data-score-scope]'))b.setAttribute('aria-pressed',String(b===button));refreshLeaderboard();};
 $('#highscore-refresh').onclick=refreshLeaderboard;
 $('#score-result-open').onclick=()=>{$('#highscores').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});$('#score-nickname').focus({preventScroll:true});};
 let boardVisible=false;
 const refreshVisible=()=>{
  if(boardVisible&&!document.hidden&&!document.body.classList.contains('playing'))refreshLeaderboard();
 };
 new IntersectionObserver(entries=>{
  boardVisible=entries[0].isIntersecting;
  refreshVisible();
 }).observe($('#highscores'));
 setInterval(refreshVisible,60000);
 window.addEventListener('online',refreshVisible);
 window.addEventListener('focus',refreshVisible);
 document.addEventListener('visibilitychange',refreshVisible);
 refreshLeaderboard();
}

export const liveRoundTicket=()=>autosave.ticket();
export const liveNickname=()=>nickname;
