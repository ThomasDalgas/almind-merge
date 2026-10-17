// Artillery-only lobby. Never claims/renames a shared profile or changes Merge device links.
export function initOnlineLobby({api,onStart,isAvailable,onProfile}){
 const $=s=>document.querySelector(s),status=$('#online-status'),list=$('#online-players'),notices=$('#online-notices'),identity=$('#online-identity');
 let profile=null,pair=null,loading=false,acting=false,stopped=false;const handled=new Set();
 const say=s=>{status.textContent=s;};
 const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{if(acting)return;acting=true;b.disabled=true;try{await fn();}catch(e){say(e.message);}finally{acting=false;b.disabled=false;}};return b;};
 async function identify(){profile=await api.profile();const valid=profile?.claimed;identity.textContent=valid?`Logget ind som ${profile.nickname}`:'Ingen Almind Games-profil tilknyttet her';$('#profile-connect').hidden=!!valid;$('#name').readOnly=!!valid;$('#profile-switch').hidden=!valid;if(valid){$('#name').value=profile.nickname;onProfile(profile);}}
 async function start(state){await onStart(state);say('Kampen er startet.');}
 async function refresh(){if(loading||document.hidden||stopped)return;loading=true;try{
  if(pair){const result=await api.rpc('aa_pair_status',{p_request:pair.id});if(result==='approved'){pair=null;await identify();say('Profilen er tilknyttet Artilleri.');}else if(['declined','expired','cancelled'].includes(result)){pair=null;say('Anmodningen blev afvist eller udløb. Prøv igen.');}}
  if(!profile?.claimed)return;
  const data=await api.rpc('aa_lobby',{p_available:isAvailable()});list.replaceChildren();notices.replaceChildren();
  if(!data.players.length){const p=document.createElement('p');p.textContent='Ingen andre er klar endnu. Bed modstanderen åbne Artilleri.';list.append(p);}
  for(const p of data.players)list.append(button(`● ${p.name} · Invitér`,async()=>{await api.rpc('aa_invite',{p_player:p.id,p_mode:$('#mode').value});say(`Invitation sendt til ${p.name}.`);await refresh();}));
  for(const i of data.invitations){
   if(i.status==='accepted'){if(!handled.has(i.id)){handled.add(i.id);try{await start(await api.rpc('aa_state',{p_code:i.code}));}catch(e){handled.delete(i.id);throw e;}}continue;}
   const row=document.createElement('div'),label=document.createElement('p');label.textContent=i.incoming?`${i.name} inviterer dig til en kamp`:`Venter på svar fra ${i.name}…`;row.append(label);
   if(i.incoming){row.append(button('Spil',async()=>{const state=await api.rpc('aa_reply',{p_invite:i.id,p_accept:true});handled.add(i.id);await start(state);}),button('Afvis',async()=>{await api.rpc('aa_reply',{p_invite:i.id,p_accept:false});await refresh();}));}notices.append(row);
  }
  for(const request of data.pairing){const row=document.createElement('div'),label=document.createElement('p');label.textContent=`Ny enhed vil bruge ${profile.nickname}. Kontrollér at den viser ${request.digits}. Godkend kun din egen enhed.`;row.append(label,button(`Godkend ${request.digits}`,async()=>{await api.rpc('aa_pair_reply',{p_request:request.id,p_accept:true});await refresh();}),button('Afvis',async()=>{await api.rpc('aa_pair_reply',{p_request:request.id,p_accept:false});await refresh();}));notices.append(row);}
 }catch(e){say(e.code==='PGRST202'?'Spillerlisten afventer den nye SQL-opdatering i Supabase.':`Kan ikke hente spillere: ${e.message}`);}finally{loading=false;}}
 $('#profile-switch').onclick=()=>{$('#name').readOnly=false;$('#name').value='';$('#profile-connect').hidden=false;say('Skriv navnet på den profil, du vil bruge i Artilleri. Tilknytningen skal godkendes på din eksisterende enhed.');};
 $('#profile-connect').onclick=async()=>{if(acting)return;acting=true;try{pair=await api.rpc('aa_pair_start',{p_name:$('#name').value.trim()});say(`Kontroltal: ${pair.digits}. Åbn Artilleri på enheden, hvor du allerede bruger din Almind Games-profil, og godkend de samme to tal. Gyldig i 3 minutter.`);}catch(e){say(e.message);}finally{acting=false;}};
 $('#profile-refresh').onclick=async()=>{try{await identify();await refresh();}catch(e){say(e.message);}};
 $('#resume-online').onclick=async()=>{try{const code=localStorage.getItem('aa-last-room');if(!code)throw Error('Ingen tidligere kamp på denne enhed.');await start(await api.rpc('aa_join',{p_code:code}));}catch(e){say(e.message);}};
 try{$('#resume-online').hidden=!localStorage.getItem('aa-last-room');}catch{}
 void identify().then(refresh).catch(e=>say(e.message));const timer=setInterval(refresh,5000);
 return {refresh,stop(){stopped=true;clearInterval(timer);}};
}
