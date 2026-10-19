import {createProfileClient,store} from './profile.js';
export let currentProfile=null;
const api=createProfileClient(),$=id=>document.getElementById(id);
function accept(p){currentProfile=p?.claimed?p:null;if(currentProfile)store.set('almind-score-nickname',p.nickname);$('profile-status').textContent=currentProfile?`Du spiller som ${p.nickname}. Samme profil som i Almind-Merge.`:'Vælg et nyt navn, eller forbind din eksisterende profil med en spillerkode.';$('show-create').hidden=!!currentProfile;$('make-code').hidden=!currentProfile;window.dispatchEvent(new CustomEvent('almind-profile-ready',{detail:currentProfile}));}
export const profileReady=api.profile().then(p=>{accept(p);return currentProfile}).catch(()=>{accept(null);$('profile-status').textContent='Kunne ikke hente profilen. Genindlæs siden for at prøve igen, eller spil 3D-testen som gæst.';return null});
$('show-link').onclick=()=>{$('link-form').hidden=!$('link-form').hidden;$('create-form').hidden=true};
$('show-create').onclick=()=>{$('create-form').hidden=!$('create-form').hidden;$('link-form').hidden=true};
async function submit(e,action){e.preventDefault();const b=e.submitter;b.disabled=true;$('profile-error').textContent='';try{const p=await action(new FormData(e.target));accept(p);e.target.reset();e.target.hidden=true;$('code-output').hidden=true}catch(err){$('profile-error').textContent=err.message}finally{b.disabled=false}}
$('link-form').onsubmit=e=>submit(e,f=>api.link(f.get('nickname').trim(),f.get('code').trim()));
$('create-form').onsubmit=e=>submit(e,f=>api.claim(f.get('nickname').trim()));
$('make-code').onclick=async()=>{const b=$('make-code');b.disabled=true;try{const r=await api.createCode();$('code-output').textContent=`${r.nickname}: ${r.code} — Gem koden privat. Den giver adgang til din profil. En tidligere kode erstattes.`;$('code-output').hidden=false;b.textContent='Lav en ny spillerkode'}catch(e){$('profile-error').textContent=e.message}finally{b.disabled=false}};
window.addEventListener('storage',e=>{if(e.key?.startsWith('almind-score-session:'))location.reload()});
