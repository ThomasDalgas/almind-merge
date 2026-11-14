import {forStorage,fromStorage} from './journal-storage.js?v=1.2.3';
// Persist each round independently so tabs and unfinished uploads cannot overwrite each other.
export function createScoreAutosave({api,store,onStatus=()=>{},onSaved=()=>{},getDuration=()=>null,getVersion=()=>null,now=Date.now}){
 const prefix='almind-score-pending:',jobs=new Map();let current=null,flushing=false;
 const persist=item=>{const {ticketPromise,...saved}=item;store.set(prefix+item.key,JSON.stringify(forStorage(saved)));};
 for(const key of store.keys())if(key.startsWith(prefix)){
  try{const item=fromStorage(JSON.parse(store.get(key)));if(item?.key&&Array.isArray(item.events)&&item.events.length){jobs.set(item.key,item);}}catch{}
 }
 function start(nickname,previousSeconds){
  if(current){if(current.events.length){current.final=true;if(Number.isFinite(previousSeconds))current.duration=Math.max(current.duration,Math.round(previousSeconds*1000));persist(current);}else jobs.delete(current.key);}
  const item={key:crypto.randomUUID(),nickname,version:getVersion(),events:[],duration:1,final:false,ticket:null};
  current=item;jobs.set(item.key,item);
  const ticket=api.start().then(id=>{item.ticket={id,readyAt:now()};if(item.events.length)persist(item);return {id,readyAt:performance.now()};}).catch(()=>null);
  item.ticketPromise=ticket;
  return ticket;
 }
 function event(kind,tier,time,...lineage){
  if(!current)return;
  // Old clients stopped recording once invalid. Do not append to a journal
  // with a known gap and present its incomplete history as a verified score.
  if(current.invalid)return;
  current.events.push([kind,tier,Math.round(time*1000),...lineage]);
  current.duration=Math.max(1,Math.round(time*1000));persist(current);return current.events.length;
 }
 function end(time){if(!current)return;if(!current.events.length){jobs.delete(current.key);current=null;return;}current.duration=Math.max(current.duration,Math.round(time*1000));current.final=true;current.gameOverAt=now();persist(current);current=null;void flush();}
 async function flush(){
  const seconds=getDuration();
  if(current?.events.length&&Number.isFinite(seconds)){const duration=Math.max(current.duration,Math.round(seconds*1000));if(duration!==current.duration){current.duration=duration;persist(current);}}
  if(flushing||!api.ready)return;flushing=true;
  try{for(const item of jobs.values()){
   if(!item.events.length||item.invalid||(item.savedCount===item.events.length&&item.savedFinal===item.final&&item.savedDuration===item.duration))continue;
   try{
    if(!item.ticket){
     if(item.ticketPromise)await item.ticketPromise;
     if(!item.ticket){item.ticket={id:await api.start(),readyAt:now()};persist(item);}
    }
    // Never weaken the server's elapsed-time check, even after a delayed connection.
    if(item.duration>now()-item.ticket.readyAt+1000)continue;
    const count=item.events.length,final=item.final,duration=item.duration,events=item.events.map(e=>[...e]);
    const save=final?(item.gameOverAt&&now()-item.gameOverAt<60000&&api.gameOver?api.gameOver:api.submit):api.checkpoint;
    const score=await save(item.ticket.id,item.nickname,events,duration,{version:item.version??null,gameOver:Boolean(item.gameOverAt)});
    item.savedCount=count;item.savedFinal=final;item.savedDuration=duration;
    onStatus(`Din score på ${new Intl.NumberFormat('da-DK').format(score)} er gemt!`);
    if(item.events.length===count&&item.final===final&&item.duration===duration){
     // A different tab may have appended a newer checkpoint to this journal.
     let stored=null;try{stored=fromStorage(JSON.parse(store.get(prefix+item.key)));}catch{}
     if(!stored||(stored.events.length===count&&stored.final===final&&stored.duration===duration&&stored.ticket?.id===item.ticket.id))store.remove(prefix+item.key);
     if(item!==current)jobs.delete(item.key);
    }
    onSaved();
   }catch{onStatus('Din score er gemt på enheden. Vi prøver automatisk igen, når der er forbindelse.');}
  }}finally{flushing=false;}
 }
 function snapshot(){
  if(!current)return null;
  const {ticketPromise,...data}=current;return data;
 }
 function restore(saved){
  const prior=jobs.get(saved.key);
  current=Object.assign(prior||{},{...saved,ticket:prior?.ticket||saved.ticket});
  jobs.set(current.key,current);
 }
 return {start,event,end,flush,snapshot,restore,ticket:()=>current?.ticket?Promise.resolve({id:current.ticket.id}):current?.ticketPromise||Promise.resolve(null)};
}
