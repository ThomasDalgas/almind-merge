import {createProfileClient} from './profile.js?v=profile-sync-1';
import {profileReady,currentProfile} from './profile-ui.js?v=profile-sync-1';
import {createScoreJournal} from './merge-3d-test/scores.js?v=profile-sync-1';
const api=createProfileClient();
async function mountBoard(id,original=false){
 const host=document.getElementById(id);if(!host)return;
 const game=original?'Almind-Merge':'Almind-Merge 3D';
 host.innerHTML=`<div class="eyebrow">${game}</div><h2>${original?'Originalens rekorder':'Familiens 3D-rekorder'}</h2><p class="own-record">Henter din rekord…</p><div class="profile-actions"><button data-scope="all" aria-pressed="true">Alle tider</button><button data-scope="week" class="secondary" aria-pressed="false">Denne uge</button><button class="refresh secondary">Opdater</button></div><p class="board-status" role="status"></p><ol class="board-list"></ol>`;
 const $=selector=>host.querySelector(selector),board=scope=>original?api.boardOriginal(scope):api.board3d(scope);
 let scope='all',revision=0;
 async function refresh(){
  const version=++revision;$('.board-status').textContent='Henter rekorder…';
  try{
   const rows=await board(scope);if(version!==revision)return;
   $('.board-list').replaceChildren();
   for(const row of rows){
    const li=document.createElement('li');li.className=row.is_me?'is-me':'';
    const name=document.createElement('span'),score=document.createElement('strong');
    name.textContent=`#${row.place} · ${row.nickname}${row.is_me?' (dig)':''}`;
    score.textContent=`${Number(row.score).toLocaleString('da-DK')} point`;
    li.append(name,score);$('.board-list').append(li);
   }
   $('.board-status').textContent=rows.length?'Top 10 og din egen placering.':'Ingen gemte rekorder endnu. Spil den første runde!';
   const all=scope==='all'?rows:await board('all');if(version!==revision)return;
   const own=all.find(r=>r.is_me);
   $('.own-record').textContent=own?`Din rekord: ${Number(own.score).toLocaleString('da-DK')} point`:'Spil med din profil for at gemme din rekord på tværs af enheder.';
  }catch{
   if(version!==revision)return;
   $('.board-status').textContent='Listen kunne ikke hentes. Tryk Opdater for at prøve igen.';
   $('.own-record').textContent='Din online-rekord er midlertidigt utilgængelig.';
  }
 }
 host.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope;host.querySelectorAll('[data-scope]').forEach(x=>{x.setAttribute('aria-pressed',String(x===b));x.classList.toggle('secondary',x!==b)});void refresh()});
 $('.refresh').onclick=refresh;
 await profileReady;
 if(!original&&currentProfile)await createScoreJournal({api,profile:currentProfile}).flush();
 void refresh();window.addEventListener('almind-profile-ready',refresh);window.addEventListener('online',refresh);
}
void mountBoard('original-scoreboard',true);
void mountBoard('scoreboard');
