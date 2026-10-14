// Fullscreen and portrait are progressive enhancements: Safari may refuse them.
export function initMobileDisplay({isPlaying,pause,cancelDrag}){
 const touch=matchMedia('(any-pointer: coarse)'),landscape=matchMedia('(orientation: landscape)');
 const rotate=document.querySelector('#rotate-screen'),button=document.querySelector('#fullscreen');
 let session=false,requesting=false,ownedLock=false;
 const root=document.documentElement;
 const fullscreen=()=>document.fullscreenElement||document.webkitFullscreenElement;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone;
 function sync(){
  document.body.classList.toggle('touch-device',touch.matches);
  rotate.hidden=!(touch.matches&&session&&landscape.matches);
  if(!rotate.hidden&&isPlaying())pause();
  button.hidden=!touch.matches||!(root.requestFullscreen||root.webkitRequestFullscreen);
  button.setAttribute('aria-label',fullscreen()?'Forlad fuldskærm':'Åbn fuldskærm');
  button.title=fullscreen()?'Forlad fuldskærm':'Fuldskærm';
  const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  document.querySelector('#install-tip').hidden=!apple||standalone();
 }
 async function expand(){
  if(!touch.matches||requesting)return;
  requesting=true;
  try{
   if(!fullscreen()&&!standalone()){
    const request=root.requestFullscreen||root.webkitRequestFullscreen;
    if(request)await request.call(root);
   }
   if(session&&screen.orientation?.lock){
    await screen.orientation.lock('portrait');ownedLock=true;
    // The user may have finished or left while the native request was pending.
    if(!session){screen.orientation.unlock?.();ownedLock=false;}
   }
  }catch{/* Keep the game usable if native fullscreen/orientation is unavailable. */}
  finally{requesting=false;sync();}
 }
 function leave(){session=false;if(ownedLock){try{screen.orientation.unlock?.();}catch{}ownedLock=false;}sync();}
 button.onclick=()=>{if(fullscreen()){
  pause();leave();const exit=document.exitFullscreen||document.webkitExitFullscreen;
  try{Promise.resolve(exit?.call(document)).catch(()=>{});}catch{}
 }else void expand();};
 document.querySelector('#rotate-back').onclick=leave;
 touch.addEventListener('change',sync);landscape.addEventListener('change',sync);
 window.addEventListener('resize',sync);
 for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,()=>{
  if(!fullscreen()&&session){ownedLock=false;if(isPlaying())pause();}sync();
 });
 // CSS handles normal touch input. These events cover Safari's gesture fallback.
 for(const event of ['gesturestart','gesturechange'])document.addEventListener(event,e=>{
  if(touch.matches&&e.cancelable)e.preventDefault();
 },{passive:false});
 document.addEventListener('touchstart',e=>{
  if(touch.matches&&e.touches.length>1){cancelDrag();if(e.cancelable)e.preventDefault();}
 },{passive:false});
 sync();
 return {enter(){if(!touch.matches)return;session=true;void expand();sync();},leave};
}
