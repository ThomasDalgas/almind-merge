// CSS owns the safe rectangle; Godot policy 0 follows these backing dimensions.
export function fitGameCanvas(canvas,win=window){
 const fit=()=>{
  const r=canvas.getBoundingClientRect(),scale=win.devicePixelRatio||1;
  const w=Math.max(1,Math.round(r.width*scale)),h=Math.max(1,Math.round(r.height*scale));
  if(canvas.width!==w)canvas.width=w;
  if(canvas.height!==h)canvas.height=h;
 };
 new ResizeObserver(fit).observe(canvas);
 win.addEventListener('resize',fit);win.visualViewport?.addEventListener('resize',fit);
 fit();return fit;
}
