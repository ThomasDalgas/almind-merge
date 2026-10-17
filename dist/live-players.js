const fmt=new Intl.NumberFormat('da-DK');
// One request at a time; lifecycle changes invalidate old responses and run next.
export function createLivePlayers({api,getTicket,getState,getNickname,render,visible=()=>!document.hidden,online=()=>navigator.onLine,interval=5000,pausedInterval=15000}){
 let busy=false,dirty=false,version=0,timer=null,lastRound=null;
 function changed(){version++;dirty=true;clearTimeout(timer);if(!busy)void tick();}
 async function tick(){
  busy=true;dirty=false;const revision=version;
  try{
   const state=getState();
   if(!online()){render([],'offline');return;}
   if(['ready','over'].includes(state.mode)){
    if(lastRound){const retired=lastRound;lastRound=null;await api.live(retired,'',0,0,false);}
    if(revision!==version||!visible())return;
    const snapshot=await api.liveList();if(revision===version)render(snapshot,'connected');return;
   }
   const ticket=await getTicket();if(revision!==version)return;
   const now=getState(),active=now.mode==='playing'&&visible();
   const id=ticket?.id||(active?null:lastRound);
   if(lastRound&&id!==lastRound)await api.live(lastRound,'',0,0,false);
   if(revision!==version)return;
   lastRound=id;
   if(active&&!id)throw new Error('Runden er ikke tilsluttet. Prøv at starte en ny runde.');
   const rows=id?await api.live(id,getNickname(),now.score,now.maxTier,active):await api.liveList();
   if(revision!==version)return;
   render(rows,'connected');
  }catch(error){
   if(revision!==version)return;
   // Reading other players must not depend on publishing this device's round.
   try{
    const snapshot=await api.liveList();if(revision!==version)return;
    if(['ready','over'].includes(getState().mode))render(snapshot,'connected');
    else render({...snapshot,connectionError:error.message||'Din egen score kunne ikke deles.'},'readonly');
   }catch{if(revision===version)render([],'offline');}
  }
  finally{
   busy=false;
   if(dirty){void tick();}
   else if(visible())timer=setTimeout(()=>{void tick();},getState().mode==='playing'?interval:pausedInterval);
  }
 }
 return {changed};
}
export function renderLivePlayers(snapshot,status){
 const rows=snapshot.players||[];
 const list=document.querySelector('#live-players'),label=document.querySelector('#live-status'),panel=document.querySelector('#live-panel');
 panel.dataset.connection=status;
 const text=status==='offline'?'Live · forbindelsen afbrudt':status==='idle'?'Live · klar til næste runde':status==='readonly'?'Live · egen score ikke delt':`Spiller nu · ${rows[0]?.total_players||0}`;
 if(label.textContent!==text)label.textContent=text;
 // Keep scrolling stable while scores update. Never interpret names as HTML.
 const scroll=list.scrollLeft,fragment=document.createDocumentFragment();
 for(const row of rows){
  const chip=document.createElement('span');chip.className='live-player'+(row.is_me?' is-me':'');
  const name=document.createElement('span'),score=document.createElement('b');name.textContent=row.nickname+(row.is_me?' · dig':'');score.textContent=fmt.format(row.score);chip.title=`${name.textContent}: ${score.textContent} point`;chip.append(name,score);fragment.append(chip);
 }
 if(!rows.length){const empty=document.createElement('span');empty.className='live-empty';empty.textContent=status==='offline'?'Du kan stadig spille videre.':status==='idle'?'Se de andre, når du spiller.':'Ingen andre spiller lige nu.';fragment.append(empty);}
 if(status==='readonly'){
  const note=document.createElement('span');note.className='live-empty';note.textContent=snapshot.connectionError;fragment.append(note);
 }
 list.replaceChildren(fragment);list.scrollLeft=scroll;
}

export function createLiveNotices({canNotify,show,hide,duration=3000,foldDuration=200}){
 let ready=false,players=new Set(),records=new Set(),gameovers=new Set(),suspended=false,current=null,queue=[],timer=null,foldTimer=null,showing=false;
 function clear(){clearTimeout(timer);clearTimeout(foldTimer);queue=[];current=null;showing=false;hide();}
 function next(){
  if(suspended||showing||!queue.length||!canNotify())return;
  showing=true;current=queue.shift();show(current);
  timer=setTimeout(()=>{current=null;hide();foldTimer=setTimeout(()=>{showing=false;next();},foldDuration);},duration);
 }
 return {clear,suspend(){suspended=true;clearTimeout(timer);clearTimeout(foldTimer);if(current)queue.unshift(current);current=null;showing=false;hide();},resume(){suspended=false;next();},observe(snapshot,status){
  if(status!=='connected'){ready=false;clear();return;}
  const rows=snapshot.players||[],events=snapshot.records||[];
  const newPlayers=rows.filter(p=>!p.is_me&&!players.has(p.player_key));
  const newRecords=events.filter(e=>!records.has(e.id));
  const ended=snapshot.gameovers||[],newEnded=ended.filter(e=>!e.is_me&&!gameovers.has(e.id));
  gameovers=new Set(ended.map(e=>e.id));
  players=new Set(rows.map(p=>p.player_key));records=new Set(events.map(e=>e.id));
  if(!ready){ready=true;return;}
  if(!canNotify()){clear();return;}
  // Records take precedence; bound the queue during a burst of activity.
  const notices=newRecords.map(e=>({kind:'record',text:`🏆 Ny ${e.kind==='all'?'totalrekord':'ugerekord'}! ${e.nickname} · ${fmt.format(e.score)} point`}));
  notices.push(...newEnded.map(e=>({kind:'gameover',text:`Game Over · ${e.nickname} · ${fmt.format(e.score)} point`})));
  if(newPlayers.length)notices.push({kind:'join',text:newPlayers.length===1?`● ${newPlayers[0].nickname} er online`:`● ${newPlayers.slice(0,2).map(p=>p.nickname).join(' og ')}${newPlayers.length>2?` + ${newPlayers.length-2} mere`:''} er online`});
  const combined=[...queue,...notices];queue=[...combined.filter(n=>n.kind==='record'),...combined.filter(n=>n.kind==='gameover'),...combined.filter(n=>n.kind==='join')].slice(0,10);next();
 }};
}
