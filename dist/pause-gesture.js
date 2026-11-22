export function installPauseGesture(headings,{enabled,activate}){
 let taps=0,last=0,press=null,timer=null;
 const reset=()=>{clearTimeout(timer);timer=null;press=null;taps=0;last=0;};
 for(const heading of headings){
  heading.style.touchAction='none';heading.style.userSelect='none';
  heading.addEventListener('contextmenu',e=>e.preventDefault());
  heading.addEventListener('pointerdown',e=>{
   if(!enabled()||!e.isPrimary||e.button!==0){reset();return;}
   if(press){reset();return;}
   if(performance.now()-last>2000)taps=0;
   press={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),heading};
   heading.setPointerCapture(e.pointerId);
   if(taps===7)timer=setTimeout(()=>{if(enabled()&&press){reset();activate();}},2000);
  });
  heading.addEventListener('pointermove',e=>{if(press&&e.pointerId===press.id&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10)reset();});
  heading.addEventListener('pointerup',e=>{
   if(!press||e.pointerId!==press.id)return;
   const short=performance.now()-press.time<500;
   clearTimeout(timer);timer=null;press=null;
   if(short&&taps<7){taps++;last=performance.now();}else reset();
  });
  for(const event of ['pointercancel','lostpointercapture'])heading.addEventListener(event,()=>{if(press)reset();});
 }
 document.addEventListener('visibilitychange',reset);window.addEventListener('blur',reset);
 return reset;
}
