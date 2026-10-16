const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function swipeAim(angle,power,dx,dy,{anglePixels=4,powerPixels=6}={}){return {angle:clamp(Math.round(angle-dy/anglePixels),5,85),power:clamp(Math.round(power+dx/powerPixels),10,100)};}
export function guidanceCharges(score,spent){return Math.max(0,Math.floor(score/300)-spent);}
