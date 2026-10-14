import {SCORE_CONFIG} from './score-config.js';
import {NAMES} from './theme.js?v=gallery-v1';
const $=s=>document.querySelector(s),fmt=new Intl.NumberFormat('da-DK');
const storage={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
export function validNickname(value){return /^[\p{L}\p{N} _-]{2,20}$/u.test(value.trim());}
export function createScoreApi(config,{fetcher=fetch,store=storage}={}){
 const ready=Boolean(config.url&&config.key);let session=null;
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
  return globalThis.navigator?.locks? navigator.locks.request('almind-score-auth',run):run();
 }
 async function rpc(name,args={},auth=true){if(!ready)throw new Error('Highscorelisten er ikke tilsluttet endnu');const s=auth?await getSession():null;return request(`/rest/v1/rpc/${name}`,args,s?.access_token);}
 return {ready,live:(id,nickname,score,tier,active)=>rpc('am_live_update',{p_round:id,p_nickname:nickname,p_score:score,p_max_tier:tier,p_active:active}),liveList:()=>rpc('am_live_snapshot',{},false),start:()=>rpc('am_start_round'),submit:(id,nickname,events,duration)=>rpc('am_submit_round',{p_round:id,p_nickname:nickname,p_events:events,p_duration:duration}),list:async scope=>{
  // Public browsing doesn't create an account; use a stored identity for your rank.
  let hasSession=Boolean(session);try{hasSession ||= Boolean(JSON.parse(store.get(sessionKey))?.refresh_token);}catch{}
  return rpc('am_leaderboard',{p_scope:scope},hasSession);
 }};
}
export const scoreApi=createScoreApi(SCORE_CONFIG);const api=scoreApi;let current=null,pending=null,scope='week',loadVersion=0,saving=false;
let nickname=storage.get('almind-score-nickname')||'';
function message(text){$('#score-save-status').textContent=text;}
function renderRows(rows){
 const list=$('#highscore-list');list.replaceChildren();
 for(const row of rows){
  const li=document.createElement('li');li.className='highscore-row';if(row.is_me)li.classList.add('is-me');
  const rank=document.createElement('span');rank.className='highscore-rank';rank.textContent=Number(row.place)<=3?['🥇','🥈','🥉'][Number(row.place)-1]:`#${row.place}`;
  const person=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent=row.nickname+(row.is_me?' · dig':'');detail.textContent=NAMES[row.max_tier]||'';person.append(name,detail);
  const points=document.createElement('b');points.textContent=fmt.format(row.score);li.append(rank,person,points);list.append(li);
 }
}
export async function refreshLeaderboard(){
 const version=++loadVersion;$('#highscore-status').textContent='Henter rekorder…';
 try{const rows=await api.list(scope);if(version!==loadVersion)return;renderRows(rows);$('#highscore-status').textContent=rows.length?'':'Ingen rekorder endnu. Bliver din den første?';}
 catch{if(version!==loadVersion)return;renderRows([]);$('#highscore-status').textContent=api.ready?'Listen kunne ikke hentes. Prøv Opdater igen.':'Den fælles liste åbner snart. Du kan stadig spille og gemme din lokale rekord.';}
}
async function savePending(){
 if(saving||!pending||!validNickname(nickname))return;
 const item=pending;saving=true;$('#score-profile-save').disabled=true;message('Gemmer din score…');
 try{
  const ticket=await item.ticket;
  if(!ticket||item.invalid)throw new Error('Denne runde kunne ikke forbindes til listen. Spil en ny runde, når der er forbindelse.');
  // The game starts immediately, but obtaining a server ticket can be slow.
  // Wait out that delay before submitting, keeping the server clock check strict.
  const delay=Math.max(0,item.duration-(performance.now()-ticket.readyAt)-1000);
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  await api.submit(ticket.id,nickname,item.events,item.duration);
  if(pending===item){pending=null;$('#score-profile-save').textContent='Gem navn';message(`Din score på ${fmt.format(item.score)} er gemt!`);}
  await refreshLeaderboard();
 }catch(e){if(pending===item)message(e.message.includes('Denne runde')?e.message:'Scoren kunne ikke gemmes. Tryk Gem score for at prøve igen.');}
 finally{saving=false;$('#score-profile-save').disabled=false;}
}
export function scoreRoundStart(){
 current={events:[],invalid:false,ticket:api.ready?api.start().then(id=>({id,readyAt:performance.now()})).catch(()=>null):Promise.resolve(null)};
 pending=null;$('#score-result-open').hidden=true;$('#score-profile-save').textContent='Gem navn';message('');
}
export function scoreEvent(kind,tier,time){
 if(!current)return;if(current.events.length>=20000){current.invalid=true;return;}
 current.events.push([kind,tier,Math.round(time*1000)]);
}
export function scoreRoundEnd(round,time){
 if(!current)return;pending={...current,events:[...current.events],score:round.score,duration:Math.round(time*1000)};current=null;
 $('#score-result-open').hidden=false;$('#score-profile-save').textContent='Gem score';
 message(nickname?'Gemmer din runde…':'Skriv dit kaldenavn for at gemme denne rundes score.');
 if(nickname)savePending();
}
export function initLeaderboard(){
 $('#score-nickname').value=nickname;
 $('#score-profile').addEventListener('submit',e=>{e.preventDefault();const value=$('#score-nickname').value.trim();if(!validNickname(value)){message('Brug 2–20 bogstaver, tal, mellemrum, _ eller -.');return;}nickname=value;storage.set('almind-score-nickname',value);if(pending)savePending();else message(`Hej ${value}! Din næste færdige runde gemmes på listen.`);});
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

export const liveRoundTicket=()=>current?.ticket||Promise.resolve(null);
export const liveNickname=()=>nickname;
