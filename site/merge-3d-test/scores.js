// Each round is a separate durable journal. No original-game score endpoint is used.
export function createScoreJournal({api,profile,storage=localStorage,onStatus=()=>{},uuid=()=>crypto.randomUUID()}){
 const prefix='almind3d-round:';let active=null,busy=null,practice=false;const memory=new Map();
 function persist(){if(!active)return;memory.set(prefix+active.id,JSON.stringify(active));try{storage.setItem(prefix+active.id,JSON.stringify(active))}catch{onStatus('Lageret er fuldt — hold siden åben, indtil pointene er gemt online.')}}
 async function flush(){if(busy)return busy;busy=(async()=>{if(!profile?.id)return;
 const keys=[...new Set([...Object.keys(storage).filter(k=>k.startsWith(prefix)),...memory.keys()])];
 for(const key of keys){let item;try{item=JSON.parse(memory.get(key)||storage.getItem(key))}catch{continue}if(item?.profile!==profile.id||!item.events?.length)continue;
 try{const saved=await api.score3d({p_round:item.id,p_profile:item.profile,p_events:item.events,p_duration:Math.max(1,item.events.at(-1)[2]),p_final:item.final});
 if(!Number.isInteger(saved))throw new Error('Ingen bekræftelse fra serveren');
 const latest=JSON.parse(memory.get(key)||storage.getItem(key));if(latest?.events.length===item.events.length&&latest.final===item.final){storage.removeItem(key);memory.delete(key);}
 onStatus(`Gemt på din 3D-profil · ${saved.toLocaleString('da-DK')} point`);
 }catch{onStatus('Point venter på forbindelse — prøver automatisk igen.');}
 }
 })();try{await busy}finally{busy=null}}
 function start(){if(active?.events.length){active.final=true;persist();void flush()}practice=false;active=profile?.id?{id:uuid(),profile:profile.id,events:[],final:false}:null;onStatus(profile?.id?'3D-point gemmes automatisk på din profil.':'Gæst · point gemmes kun i denne browser.');}
 return {start,flush,event(kind,tier,stamp){if(!active||practice)return;active.events.push([kind,tier,stamp]);persist()},end(){if(active){active.final=true;persist()}void flush()},practice(){if(active?.events.length){active.final=true;persist();void flush()}active=null;practice=true;onStatus('Værksted · testpoint kommer ikke på highscorelisten.')}};
}
