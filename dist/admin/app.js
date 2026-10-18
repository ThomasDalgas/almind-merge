import {roundLogText} from './round-log.js?v=1.1.4';
import {createAdminApi} from './api.js?v=admin-v1';
const $=s=>document.querySelector(s),api=createAdminApi(),fmt=new Intl.NumberFormat('da-DK');
const date=value=>value?new Date(value).toLocaleString('da-DK',{dateStyle:'short',timeStyle:'short'}):'—';
let selected=null,offset=0,total=0,listVersion=0,detailVersion=0,action=null,busy=false,loginEmail='',loginBusy=false;
const actionNames={rename:'Navn ændret',archive:'Slettet fra spillet',restore:'Profil gendannet',reset_code:'Ny spillerkode'};
function status(text){$('#status').textContent=text;}
function errorText(error){return error.name==='AbortError'?'Forbindelsen tog for lang tid. Opdater før du prøver ændringen igen.':error.message||'Der opstod en fejl.';}
function clearCode(){$('#code-result').hidden=true;$('#new-code').textContent='';}
function lock(value){busy=value;for(const button of document.querySelectorAll('#workspace button,#confirm button'))button.disabled=value;}
function signedOut(message=''){
 listVersion++;detailVersion++;selected=null;action=null;clearCode();$('#players').replaceChildren();$('#history').replaceChildren();$('#rounds').replaceChildren();$('#admin-email').textContent='';$('#workspace').hidden=true;$('#login').hidden=false;$('#logout').hidden=true;$('#confirm').close();$('#login-status').textContent=message;
}
function report(error){status(errorText(error));if(error.status===401||error.status===403){api.clear();signedOut(errorText(error));}}
async function enter(){
 try{
  const me=await api.rpc('ag_admin_me');$('#admin-email').textContent=me.email;
  $('#games').replaceChildren(...(me.games||[]).map(game=>{const tag=document.createElement('span');tag.className='game-tag';tag.textContent=game.title;return tag;}));
  $('#login').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;$('#otp').value='';$('#password').value='';$('#login-status').textContent='';await loadPlayers();
 }catch(error){api.clear();signedOut(error.status===404?'Administrationen mangler at blive aktiveret i Supabase.':errorText(error));}
}
async function loginTask(task){
 if(loginBusy)return;loginBusy=true;
 for(const b of document.querySelectorAll('#login button'))b.disabled=true;
 $('#login-status').textContent='Arbejder…';
 try{await task();}catch(error){$('#login-status').textContent=errorText(error);}finally{loginBusy=false;for(const b of document.querySelectorAll('#login button'))b.disabled=false;}
}
$('#email-form').addEventListener('submit',e=>{e.preventDefault();void loginTask(async()=>{loginEmail=$('#email').value.trim();await api.sendCode(loginEmail);$('#otp-form').hidden=false;$('#login-status').textContent='Hvis adressen har en administratorkonto, er der sendt en kode. Se også i spam. Vent mindst ét minut før du beder om en ny.';$('#otp').focus();});});
$('#otp-form').addEventListener('submit',e=>{e.preventDefault();void loginTask(async()=>{await api.verifyCode(loginEmail,$('#otp').value.trim());await enter();});});
$('#password-form').addEventListener('submit',e=>{e.preventDefault();if(!$('#email').reportValidity())return;void loginTask(async()=>{try{await api.password($('#email').value.trim(),$('#password').value);await enter();}finally{$('#password').value='';}});});
$('#logout').onclick=()=>{signedOut('Du er logget ud.');void api.logout();};
async function loadPlayers(){
 const version=++listVersion;clearCode();
 try{
  const data=await api.rpc('ag_admin_players',{p_search:$('#search').value.trim(),p_status:$('#filter').value,p_offset:offset});
  if(version!==listVersion)return;total=data.total;
  const elements=data.players.map(p=>{
   const button=document.createElement('button');button.type='button';button.className='player-row';button.setAttribute('aria-pressed',String(p.id===selected?.player.id));button.dataset.playerId=p.id;
   const text=document.createElement('span'),name=document.createElement('strong'),state=document.createElement('small'),score=document.createElement('b');
   name.textContent=p.nickname;state.textContent=p.blocked?'Slettet fra spillet':p.name_claimed?'Aktiv profil':'Navn skal afklares';score.textContent=fmt.format(p.best);text.append(name,state);button.append(text,score);button.onclick=()=>{if(!busy)void selectPlayer(p.id);};return button;
  });
  if(!elements.length){const empty=document.createElement('p');empty.textContent='Ingen spillere matcher din søgning.';elements.push(empty);}
  $('#players').replaceChildren(...elements);$('#page-info').textContent=total?`${offset+1}–${Math.min(offset+25,total)} af ${total}`:'0 spillere';$('#previous').disabled=offset===0;$('#next').disabled=offset+25>=total;
 }catch(error){if(version===listVersion)report(error);}
}
async function selectPlayer(id){
 const version=++detailVersion;clearCode();status('Henter spiller…');
 try{const data=await api.rpc('ag_admin_player',{p_player:id});if(version!==detailVersion)return;selected=data;renderDetail();status('');for(const b of document.querySelectorAll('.player-row'))b.setAttribute('aria-pressed',String(b.dataset.playerId===id));}
 catch(error){if(version===detailVersion)report(error);}
}
function historyItem(title,text){const row=document.createElement('div');row.className='history-item';const a=document.createElement('strong'),b=document.createElement('span');a.textContent=title;b.textContent=text;row.append(a,b);return row;}
function renderDetail(){
 const {player:p}=selected;$('#empty-detail').hidden=true;$('#detail').hidden=false;$('#player-title').textContent=p.nickname;$('#player-state').textContent=p.blocked?'Slettet':'Aktiv';$('#player-state').className='badge'+(p.blocked?' archived':'');$('#player-id').textContent='Profil-ID: '+p.id;$('#best').textContent=fmt.format(selected.best);$('#devices').textContent=selected.devices;$('#nickname').value=p.nickname;$('#rename-form').hidden=false;$('#reset-code').disabled=p.blocked||!p.name_claimed;$('#archive').hidden=p.blocked;$('#restore').hidden=!p.blocked;$('#archive-title').textContent=p.blocked?'Gendan spilleren':'Fjern fra spillet';$('#archive-help').textContent=p.blocked?'Gendan profilen med samme navn og bevarede runder. Navnet skal være ledigt; ret det først, hvis det er optaget. Tidligere særskilt skjulte runder forbliver skjult.':'Profilen og dens rekorder skjules fra spillet. Spillerkoden slettes. Du kan gendanne profilen under “Slettede profiler”.';
 $('#rounds').replaceChildren(...selected.rounds.map(r=>historyItem(`${fmt.format(r.score||0)} point${r.hidden?' · skjult':''}`,date(r.started_at)+' · '+roundLogText(r))));
 if(!selected.rounds.length)$('#rounds').textContent='Ingen runder endnu.';
 $('#history').replaceChildren(...selected.history.map(h=>historyItem(actionNames[h.action]||h.action,date(h.created_at)+(h.action==='rename'?` · ${h.before_state.nickname} → ${h.after_state.nickname}`:''))));
 if(!selected.history.length)$('#history').textContent='Ingen ændringer registreret i administrationen endnu.';
}
$('#search-form').onsubmit=e=>{e.preventDefault();if(busy)return;offset=0;void loadPlayers();};$('#filter').onchange=()=>{offset=0;void loadPlayers();};$('#previous').onclick=()=>{offset=Math.max(0,offset-25);void loadPlayers();};$('#next').onclick=()=>{if(offset+25<total){offset+=25;void loadPlayers();}};$('#refresh').onclick=async()=>{await loadPlayers();if(selected)await selectPlayer(selected.player.id);};
function ask(kind,name=null){
 if(busy||!selected)return;clearCode();const p=selected.player;
 action={id:p.id,nickname:p.nickname,revision:p.admin_revision,kind,name};
 $('#confirm-title').textContent=kind==='archive'?`Slet ${p.nickname} fra spillet?`:kind==='restore'?`Gendan ${p.nickname}?`:kind==='rename'?`Ret ${p.nickname} til ${name}?`:`Ny kode til ${p.nickname}?`;
 $('#confirm-text').textContent=kind==='archive'?'Spilleren forsvinder fra highscore og live-listen og kan ikke spille videre på profilen. Runderne bevares, så sletningen kan fortrydes.':kind==='reset_code'?'Den gamle kode erstattes. Du får den nye kode vist én gang. Rekorder og allerede tilknyttede enheder bevares.':kind==='restore'?'Profilen bliver aktiv igen. Lav derefter en ny spillerkode, hvis spilleren mangler adgang.':'Profilen beholder sine rekorder og tilknyttede enheder.';
 $('#confirm-name-wrap').hidden=kind!=='archive';$('#confirm-name').required=kind==='archive';$('#confirm-name').value='';$('#confirm-error').textContent='';$('#confirm').showModal();
}
$('#rename-form').onsubmit=e=>{e.preventDefault();const name=$('#nickname').value.trim();if(name!==selected.player.nickname)ask('rename',name);};$('#reset-code').onclick=()=>ask('reset_code');$('#archive').onclick=()=>ask('archive');$('#restore').onclick=()=>ask('restore');$('#cancel').onclick=()=>{$('#confirm').close();action=null;};$('#confirm').addEventListener('cancel',e=>{if(busy)e.preventDefault();else action=null;});
$('#confirm-form').onsubmit=async e=>{
 e.preventDefault();if(busy||!action)return;
 const target=action;if(target.kind==='archive'&&$('#confirm-name').value.trim()!==target.nickname){$('#confirm-error').textContent='Skriv navnet præcis som vist.';return;}
 lock(true);
 try{
  const result=await api.rpc('ag_admin_update_player',{p_player:target.id,p_action:target.kind,p_expected_revision:target.revision,p_name:target.name});
  $('#confirm').close();action=null;offset=0;await loadPlayers();await selectPlayer(target.id);
  if(result.code){$('#code-result').hidden=false;$('#new-code').textContent=result.player.nickname+': '+result.code;}
  status(`${actionNames[target.kind]} for ${result.player.nickname}.`);
 }catch(error){$('#confirm').close();action=null;report(error);}
 finally{lock(false);$('#previous').disabled=offset===0;$('#next').disabled=offset+25>=total;if(selected)$('#reset-code').disabled=selected.player.blocked||!selected.player.name_claimed;}
};
$('#copy-code').onclick=async()=>{try{await navigator.clipboard.writeText($('#new-code').textContent);status('Spillerkoden er kopieret.');}catch{status('Markér koden og kopiér den manuelt.');}};
if(api.signedIn)void enter();
