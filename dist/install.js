const button=document.querySelector('#install-game'),dialog=document.querySelector('#install-help'),steps=document.querySelector('#install-steps'),note=document.querySelector('#install-note');
const display=matchMedia('(display-mode: standalone)');let pending=null,busy=false,installed=false;
const standalone=()=>display.matches||navigator.standalone===true;
function sync(){button.hidden=standalone()||installed;}
function help(){
 const ua=navigator.userAgent,apple=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),android=/Android/.test(ua),edge=/Edg/.test(ua);
 let items;
 if(apple){items=['Åbn browserens Del-menu (firkanten med pil op). I Chrome eller Edge kan Del ligge under menuen med de tre prikker.','Vælg “Føj til hjemmeskærm”. Slå “Åbn som webapp” til, hvis den mulighed vises.','Tryk Tilføj. Åbn derefter Almind-Merge fra ikonet på hjemmeskærmen.'];note.textContent='Mangler punktet? Åbn samme adresse i Safari og vælg Del → Føj til hjemmeskærm.';}
 else if(android){items=[`Åbn ${edge?'Edge':'browserens'} menu med de tre prikker.`, 'Vælg “Installer app”, “Føj til telefon” eller “Føj til startskærm”, afhængigt af browseren.','Bekræft, og åbn Almind-Merge fra det nye ikon.'];note.textContent='Chrome og Edge kan bruge forskellige navne i menuen. Browseren bestemmer, om ikonet åbner som en app eller en genvej.';}
 else{items=['Åbn Chrome eller Edge på denne adresse.','Tryk på installationsikonet i adresselinjen, eller find “Installer” / “Apps” i browserens menu.','Bekræft installationen.'];note.textContent='I Safari på Mac kan du vælge Arkiv → Føj til Dock.';}
 steps.replaceChildren(...items.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));if(!dialog.open)dialog.showModal();
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pending=event;sync();});
window.addEventListener('appinstalled',()=>{installed=true;pending=null;dialog.close();sync();});display.addEventListener('change',sync);
button.addEventListener('click',async()=>{
 if(busy)return;if(!pending){help();return;}
 const event=pending;pending=null;busy=true;button.disabled=true;
 try{await event.prompt();await event.userChoice;}catch{help();}finally{busy=false;button.disabled=false;sync();}
});
document.querySelector('#install-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
sync();
