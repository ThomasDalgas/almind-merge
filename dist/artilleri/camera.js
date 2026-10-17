const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
export function shotCamera(animation,{mobile=false,reducedMotion=false}={}){
 const home={x:480,y:270,zoom:1};
 if(!animation||reducedMotion||!animation.path?.length)return home;
 const {path,hit,flightMs,elapsed,impactAge}=animation;
 const flight=elapsed<flightMs,progress=clamp(elapsed/flightMs,0,1),k=progress*(path.length-1),i=Math.floor(k),a=path[i],b=path[Math.min(i+1,path.length-1)],u=k-i;
 const px=mix(a[0],b[0],u),py=mix(a[1],b[1],u),enter=smooth(elapsed/500),approach=smooth((elapsed-(flightMs-450))/450);
 const flightZoom=mobile?1.35:1.2,impactZoom=hit.miss?flightZoom:mobile?1.95:1.65;
 const targetX=flight?mix(px,hit.x,approach):hit.x,targetY=flight?mix(py,hit.y-42,approach):hit.y-42;
 let zoom=mix(1,mix(flightZoom,impactZoom,approach),enter),x=mix(480,targetX,enter),y=mix(270,targetY,enter);
 // Centre stays within the map horizontally. High shells may lift above the map into sky.
 x=clamp(x,480/zoom,960-480/zoom);y=Math.min(y,540-270/zoom);
 const back=flight?0:smooth((impactAge-(hit.miss?150:650))/(hit.miss?650:900));
 return {x:mix(x,480,back),y:mix(y,270,back),zoom:mix(zoom,1,back)};
}
