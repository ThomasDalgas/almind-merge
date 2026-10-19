import '/safe-viewport.js?v=1';
import {fitGameCanvas} from './viewport.js?v=1';
import {installTouchInputGuard} from './touch-input.js?v=touch-relative-1';
import {currentProfile,profileReady} from '/profile-ui.js?v=profile-sync-1';
import {store,createProfileClient} from '/profile.js?v=profile-sync-1';
import {createScoreJournal} from './scores.js?v=profile-sync-1';
import {createSettingsStore} from './settings.js?v=profile-sync-1';
const $=id=>document.getElementById(id);let started=false;
const recordKey=()=>`almind-merge-3d-test-best:${currentProfile?.id||'guest'}`;
function update(){if(started)return;$('start').disabled=false;$('start').textContent=currentProfile?`Spil som ${currentProfile.nickname}`:'Prøv som gæst';const best=Number(store.get(recordKey()))||0;$('record').textContent=best?`Tidligere lokal 3D-rekord: ${best.toLocaleString('da-DK')} point`:'';}
await profileReady;update();window.addEventListener('almind-profile-ready',update);
$('start').onclick=async()=>{if(started)return;started=true;$('start').disabled=true;$('loading').hidden=false;
 const key=recordKey();
 installTouchInputGuard(window);
 $('canvas').style.display='block';
 const fitCanvas=fitGameCanvas($('canvas'));
 const api=createProfileClient();
 const preferences=createSettingsStore(localStorage,currentProfile?.id||'guest',{api,onStatus:text=>{$('sync-status').textContent=text}});
 await preferences.init();
 const journal=createScoreJournal({api,profile:currentProfile,onStatus:text=>{$('sync-status').textContent=text}});
 void journal.flush();setInterval(()=>{void journal.flush();void preferences.flush()},15000);window.addEventListener('online',()=>{void journal.flush();void preferences.flush()});document.addEventListener('visibilitychange',()=>{if(document.hidden){void journal.flush();void preferences.flush()}});

 window.Almind3D={loadSettings:()=>preferences.load(),saveSettings:json=>preferences.save(json),async leave(){journal.end();try{await Promise.race([Promise.all([journal.flush(),preferences.flush()]),new Promise(r=>setTimeout(r,1200))])}finally{location.assign('/')}},nickname:currentProfile?.nickname||'Gæst',roundStarted(){journal.start()},event(kind,tier,stamp){journal.event(kind,tier,stamp)},practice(){journal.practice()},ready(){fitCanvas();journal.start();document.body.classList.add('playing');$('loading').hidden=true;$('canvas').focus()},roundEnded(score,tier){journal.end();if(Number.isFinite(score)&&score>=0)store.set(key,String(Math.max(Number(store.get(key))||0,score)))}};
 try{const missing=Engine.getMissingFeatures({threads:false});if(missing.length)throw new Error('Browseren mangler '+missing.join(', ')+'. Prøv en opdateret Safari eller Chrome.');
 const manifest=await fetch('pack.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Spilpakken kunne ikke findes');return r.json()});
 const engine=new Engine({executable:'game',canvas:$('canvas'),canvasResizePolicy:0,focusCanvas:true,experimentalVK:true,ensureCrossOriginIsolationHeaders:false,onExit(){location.reload()},onPrintError:console.error});
 const chunks=[];let loaded=0;
 for(const name of manifest.files){const r=await fetch(name);if(!r.ok)throw new Error('En del af spilpakken kunne ikke hentes. Prøv igen.');const bytes=await r.arrayBuffer();chunks.push(bytes);loaded+=bytes.byteLength;$('progress').value=loaded/manifest.bytes*80;$('load-status').textContent=`Henter villaen: ${Math.round(loaded/1048576)} / ${Math.ceil(manifest.bytes/1048576)} MB`;}
 $('load-status').textContent='Pakker modeller ud…';const pack=await new Response(new Blob(chunks).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();chunks.length=0;
 $('progress').value=85;$('load-status').textContent='Starter 3D-motoren…';await engine.init('game');await engine.preloadFile(pack,'game.pck');await engine.start({args:['--main-pack','game.pck']});
 setTimeout(()=>{if(!$('loading').hidden){$('load-status').textContent='Opstarten tager længere tid end normalt. Prøv igen, hvis spillet ikke åbner.';$('retry').hidden=false}},45000);
 }catch(e){console.error(e);$('load-status').textContent=e.message||'Spillet kunne ikke starte i denne browser';$('retry').hidden=false;}
};
