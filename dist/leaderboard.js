import {SCORE_CONFIG} from './score-config.js';
import {createScoreAutosave} from './score-autosave.js?v=autosave-v1';
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
   const data=await r.json();if(!r.ok)throw new Error(data.message||data.msg||'Highscoretjenesten svarer ikke');return data;
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
 return {ready,profile:()=>rpc('am_player_profile'),claim:name=>rpc('am_claim_name',{p_nickname:name}),live:(id,nickname,score,tier,active)=>rpc('am_live_update',{p_round:id,p_nickname:nickname,p_score:score,p_max_tier:tier,p_active:active}),liveList:()=>rpc('am_live_snapshot',{},false),start:()=>rpc('am_start_round'),checkpoint:(id,nickname,events,duration)=>rpc('am_checkpoint_round',{p_round:id,p_nickname:nickname,p_events:events,p_duration:duration}),submit:(id,nickname,events,duration)=>rpc('am_submit_round',{p_round:id,p_nickname:nickname,p_events:events,p_duration:duration}),list:async scope=>{
  // Public browsing doesn't create an account; use a stored identity for your rank.
  let hasSession=Boolean(session);try{hasSession ||= Boolean(JSON.parse(store.get(sessionKey))?.refresh_token);}catch{}
  return rpc('am_leaderboard',{p_scope:scope},hasSession);
 }};
}
export const scoreApi=createScoreApi(SCORE_CONFIG);const api=scoreApi;let scope='week',loadVersion=0;
let nickname=storage.get('almind-score-nickname')||'';
function message(text){$('#score-save-status').textContent=text;}
function renderRows(rows){
 const list=$('#highscore-list');list.replaceChildren();
 for(const row of rows){
  const li=document.createElement('li');li.className='highscore-row';if(row.is_me)li.classList.add('is-me');
  const rank=document.createElement('span');rank.className='highscore-rank';rank.textContent=Number(row.place)<=3?['🥇','🥈','🥉'][Number(row.place)-1]:`#${row.place}`;
  const person=document.createElement('span'),name=document.createElement('strong');name.textContent=row.nickname;person.append(name);
  const points=document.createElement('b');points.textContent=fmt.format(row.score);li.append(rank,person,points);list.append(li);
 }
}
export async function refreshLeaderboard(){
 const version=++loadVersion;$('#highscore-status').textContent='Henter rekorder…';
 try{const rows=await api.list(scope);if(version!==loadVersion)return;renderRows(rows);$('#highscore-status').textContent=rows.length?'':'Ingen rekorder endnu. Bliver din den første?';}
 catch{if(version!==loadVersion)return;renderRows([]);$('#highscore-status').textContent=api.ready?'Listen kunne ikke hentes. Prøv Opdater igen.':'Den fælles liste åbner snart. Du kan stadig spille og gemme din lokale rekord.';}
}
const autosave=createScoreAutosave({api,store:storage,onStatus:message,onSaved:()=>{if(!document.body.classList.contains('playing'))refreshLeaderboard();}});
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
  if(profile?.claimed){rememberName(profile.nickname);nameChecked=true;begin();}
  else openName(begin,profile?'Dit tidligere navn bruges af en anden profil. Vælg et nyt navn.':'');
 }).catch(()=>{
  // Existing players can play offline; a new name must be reserved online.
  if(validNickname(nickname)){nameChecked=true;begin();}
  else openName(begin,'Forbind til nettet for at vælge et ledigt navn.');
 }).finally(()=>{nameChecking=false;});
 return false;
}
function rememberName(value){nickname=value;storage.set('almind-score-nickname',value);$('#score-nickname').value=value;}
async function claimName(value){
 if(!validNickname(value))throw new Error('Brug 2–20 bogstaver, tal, mellemrum, _ eller -.');
 const claimed=await api.claim(value);rememberName(claimed);nameChecked=true;void flushScore();return claimed;
}
export function initLeaderboard(){
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
 setInterval(flushScore,5000);
 window.addEventListener('online',flushScore);
 window.addEventListener('pagehide',flushScore);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flushScore();});
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
 setInterval(refreshVisible,15000);
 window.addEventListener('online',refreshVisible);
 window.addEventListener('focus',refreshVisible);
 document.addEventListener('visibilitychange',refreshVisible);
 refreshLeaderboard();
}

export const liveRoundTicket=()=>autosave.ticket();
export const liveNickname=()=>nickname;
