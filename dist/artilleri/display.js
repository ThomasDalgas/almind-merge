// Same progressive fullscreen/orientation pattern as Almind Merge, adapted to landscape.
export function initDisplay({hasGame}){const touch=matchMedia('(any-pointer: coarse)'),portrait=matchMedia('(orientation: portrait)'),root=document.documentElement,overlay=document.querySelector('#rotate-screen'),full=document.querySelector('#fullscreen'),resume=document.querySelector('#resume');let session=false,requesting=false,ownedLock=false;
 const fullscreen=()=>document.fullscreenElement||document.webkitFullscreenElement;
 function sync(){document.body.classList.toggle('playing',session);document.body.classList.toggle('touch-device',touch.matches);overlay.hidden=true;full.hidden=!touch.matches||!(root.requestFullscreen||root.webkitRequestFullscreen);full.textContent=fullscreen()?'⛶':'⛶ Fuldskærm';resume.hidden=session||!hasGame();}
 async function expand(){if(!touch.matches||requesting)return;requesting=true;try{if(!fullscreen()){const request=root.requestFullscreen||root.webkitRequestFullscreen;if(request)await request.call(root);}if(session&&screen.orientation?.lock){await screen.orientation.lock('landscape');ownedLock=true;}}catch{/* Browser may decline; the game remains usable in landscape. */}finally{requesting=false;sync();}}
 function enter(){session=true;sync();void expand();}
 function leave(){session=false;if(ownedLock){try{screen.orientation.unlock?.();}catch{}ownedLock=false;}sync();}
 full.onclick=()=>{if(fullscreen()){const exit=document.exitFullscreen||document.webkitExitFullscreen;try{Promise.resolve(exit?.call(document)).catch(()=>{});}catch{}}else void expand();};
 document.querySelector('#leave-game').onclick=leave;document.querySelector('#resume').onclick=enter;document.querySelector('#rotate-back').onclick=leave;
 for(const event of ['gesturestart','gesturechange'])document.addEventListener(event,e=>{if(session&&e.cancelable)e.preventDefault();},{passive:false});
 document.addEventListener('touchmove',e=>{if(session&&e.cancelable)e.preventDefault();},{passive:false});
 touch.addEventListener('change',sync);portrait.addEventListener('change',sync);window.addEventListener('resize',sync);for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,sync);
 sync();return {enter,leave,sync,isActive:()=>session};}
