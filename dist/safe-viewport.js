// Follow Safari's visible viewport when browser bars expand, collapse or rotate.
export function viewportBox(win) {
 const v=win.visualViewport;
 return {width:v?.width||win.innerWidth,height:v?.height||win.innerHeight,left:v?.offsetLeft||0,top:v?.offsetTop||0};
}
export function installViewport(win=window,doc=document) {
 const update=()=>{const box=viewportBox(win);for(const [key,value] of Object.entries(box))doc.documentElement.style.setProperty(`--app-${key}`,`${value}px`)};
 update();win.addEventListener('resize',update);
 win.visualViewport?.addEventListener('resize',update);win.visualViewport?.addEventListener('scroll',update);
 return update;
}
if(typeof window!=='undefined')installViewport();
