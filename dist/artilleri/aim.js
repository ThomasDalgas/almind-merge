const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function swipeAim(angle,power,dx,dy,{anglePixels=6,powerPixels=4}={}){return {angle:clamp(Math.round(angle+dx/anglePixels),5,85),power:clamp(Math.round(power-dy/powerPixels),10,100)};}
export function guidanceCharges(score,spent){return Math.max(0,Math.floor(score/300)-spent);}
