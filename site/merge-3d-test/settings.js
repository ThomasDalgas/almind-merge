export function sanitizeSettings(value){
 const s={};
 if(value&&typeof value==='object'){
  if(value.touch_mode===0||value.touch_mode===1)s.touch_mode=value.touch_mode;
  if(Number.isFinite(value.aim_sensitivity))s.aim_sensitivity=Math.min(3,Math.max(.5,value.aim_sensitivity));
  for(const k of ['sound_enabled','invert_vertical_view'])if(typeof value[k]==='boolean')s[k]=value[k];
 }
 return s;
}
export function createSettingsStore(storage,profileId='guest',{api,onStatus=()=>{}}={}){
 const key=`almind3d-settings:${profileId}`,pendingKey=`${key}:pending`;
 const read=k=>{try{return sanitizeSettings(JSON.parse(storage.getItem(k)))}catch{return {}}};
 const write=(k,v)=>{try{storage.setItem(k,JSON.stringify(v));return true}catch{return false}};
 let current=read(key),dirty=read(pendingKey),timer,inflight;
 const connected=!!api&&profileId!=='guest';
 const saveLocal=()=>{const a=write(key,current),b=write(pendingKey,dirty);return a&&b};
 async function flush(){
  clearTimeout(timer);
  if(!connected)return;
  if(inflight){await inflight;return Object.keys(dirty).length?flush():undefined;}
  if(!Object.keys(dirty).length)return;
  const patch={...dirty};
  inflight=(async()=>{
   try{
    await api.settings3d(profileId,patch);
    for(const k of Object.keys(patch))if(dirty[k]===patch[k])delete dirty[k];
    write(pendingKey,dirty);onStatus('Indstillinger gemt på din profil.');
   }catch{onStatus('Indstillinger gemt lokalt — synkroniseres, når forbindelsen er tilbage.');}
  })();
  try{await inflight}finally{inflight=null}
 }
 return {
  load:()=>JSON.stringify(current),
  async init(){
   if(!connected)return;
   try{
    // Seed old local settings only when no profile settings exist yet.
    const remote=sanitizeSettings(await api.settings3d(profileId,current,true));
    current={...remote,...dirty};saveLocal();await flush();
   }catch{onStatus('Bruger lokale indstillinger. Profilen kunne ikke hentes.');}
  },
  save(json){
   let next;try{next=sanitizeSettings(JSON.parse(json))}catch{return false}
   for(const [k,v] of Object.entries(next))if(current[k]!==v)dirty[k]=v;
   current={...current,...next};const saved=saveLocal();
   if(connected){clearTimeout(timer);timer=setTimeout(()=>void flush(),500)}
   return saved;
  },flush
 };
}
