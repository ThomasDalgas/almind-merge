import {arsenal} from './combat-cues.js?v=arsenal-13';
export function initWeaponPicker(select,onChange){
 const label=select.parentElement,root=document.createElement('div');root.className='weapon-picker';
 const trigger=document.createElement('button');trigger.type='button';trigger.id='weapon-trigger';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','weapon-options');
 const options=document.createElement('div');options.id='weapon-options';options.className='weapon-options';options.hidden=true;options.setAttribute('role','group');options.setAttribute('aria-label','Vælg ammunition');
 const buttons=[];let cash=0,can=false;
 function close(){options.hidden=true;trigger.setAttribute('aria-expanded','false');}
 function sync(state){if(state){cash=state.cash;can=state.can;}if(can&&(arsenal[select.value]?.cost||0)>cash)select.value='shell';const weapon=arsenal[select.value]||arsenal.shell;trigger.disabled=!can;
  trigger.innerHTML=`<span class="ammo-icon ammo-${select.value}">${weapon.symbol}</span><span>${weapon.name}<small>${weapon.cost?weapon.cost+' kredit':'Gratis'}</small></span><span class="weapon-chevron">⌃</span>`;
  for(const button of buttons){const type=button.dataset.weapon,w=arsenal[type];button.disabled=!can||cash<w.cost;button.setAttribute('aria-pressed',String(select.value===type));button.querySelector('small').textContent=cash<w.cost?'Mangler '+(w.cost-cash)+' kredit':w.description;}
  if(!can)close();
 }
 for(const [type,w] of Object.entries(arsenal)){const button=document.createElement('button');button.type='button';button.dataset.weapon=type;button.innerHTML=`<span class="ammo-icon ammo-${type}">${w.symbol}</span><span><b>${w.name}</b><small>${w.description}</small></span><strong>${w.cost||'Gratis'}</strong>`;button.onclick=()=>{if(button.disabled)return;select.value=type;close();sync();onChange();trigger.focus();};options.append(button);buttons.push(button);}
 trigger.onclick=()=>{options.hidden=!options.hidden;trigger.setAttribute('aria-expanded',String(!options.hidden));if(!options.hidden)buttons.find(b=>!b.disabled)?.focus();};
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){close();trigger.focus();e.preventDefault();}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){const available=buttons.filter(b=>!b.disabled);if(!available.length)return;options.hidden=false;trigger.setAttribute('aria-expanded','true');const index=available.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?available.length-1:(index+(e.key==='ArrowDown'?1:-1)+available.length)%available.length;available[next].focus();e.preventDefault();}});
 document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))close();});
 select.hidden=true;label.replaceWith(root);root.append(select,trigger,options);return {sync,close};
}
