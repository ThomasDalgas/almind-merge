// Persist each round independently so tabs and unfinished uploads cannot overwrite each other.
export function createScoreAutosave({api,store,onStatus=()=>{},onSaved=()=>{},now=Date.now}){
 const prefix='almind-score-pending:',jobs=new Map();let current=null,flushing=false;
 const persist=item=>{const {ticketPromise,...saved}=item;store.set(prefix+item.key,JSON.stringify(saved));};
 for(const key of store.keys())if(key.startsWith(prefix)){
  try{const item=JSON.parse(store.get(key));if(item?.key&&Array.isArray(item.events)&&item.events.length){jobs.set(item.key,item);}}catch{}
 }
 function start(nickname){
  if(current){if(current.events.length){current.final=true;persist(current);}else jobs.delete(current.key);}
  const item={key:crypto.randomUUID(),nickname,events:[],duration:1,final:false,ticket:null};
  current=item;jobs.set(item.key,item);
  const ticket=api.start().then(id=>{item.ticket={id,readyAt:now()};if(item.events.length)persist(item);return {id,readyAt:performance.now()};}).catch(()=>null);
  item.ticketPromise=ticket;
  return ticket;
 }
 function event(kind,tier,time){
  if(!current)return;
  if(current.events.length>=20000){current.invalid=true;return;}
  current.events.push([kind,tier,Math.round(time*1000)]);
  current.duration=Math.max(1,Math.round(time*1000));persist(current);
 }
 function end(time){if(!current)return;if(!current.events.length){jobs.delete(current.key);current=null;return;}current.duration=Math.max(current.duration,Math.round(time*1000));current.final=true;persist(current);current=null;void flush();}
 async function flush(){
  if(flushing||!api.ready)return;flushing=true;
  try{for(const item of jobs.values()){
   if(!item.events.length||item.invalid||(item.savedCount===item.events.length&&item.savedFinal===item.final))continue;
   try{
    if(!item.ticket){
     if(item.ticketPromise)await item.ticketPromise;
     if(!item.ticket){item.ticket={id:await api.start(),readyAt:now()};persist(item);}
    }
    // Never weaken the server's elapsed-time check, even after a delayed connection.
    if(item.duration>now()-item.ticket.readyAt+1000)continue;
    const count=item.events.length,final=item.final,events=item.events.map(e=>[...e]);
    const score=await (final?api.submit:api.checkpoint)(item.ticket.id,item.nickname,events,item.duration);
    item.savedCount=count;item.savedFinal=final;
    onStatus(`Din score på ${new Intl.NumberFormat('da-DK').format(score)} er gemt!`);
    if(item.events.length===count&&item.final===final){
     // A different tab may have appended a newer checkpoint to this journal.
     let stored=null;try{stored=JSON.parse(store.get(prefix+item.key));}catch{}
     if(!stored||(stored.events.length===count&&stored.final===final&&stored.ticket?.id===item.ticket.id))store.remove(prefix+item.key);
     if(item!==current)jobs.delete(item.key);
    }
    onSaved();
   }catch{onStatus('Din score er gemt på enheden. Vi prøver automatisk igen, når der er forbindelse.');}
  }}finally{flushing=false;}
 }
 return {start,event,end,flush,ticket:()=>current?.ticket?Promise.resolve({id:current.ticket.id}):current?.ticketPromise||Promise.resolve(null)};
}
