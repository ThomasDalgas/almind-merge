// All outlines use the same image-centred coordinates as the renderer.
export function placeholderOutline(tier){
  const notch=.12+(tier%3)*.035;
  return [[-.72,-.64],[-.42,-.64],[-.42,-.94],[-.05,-.82],[.3,-.94],[.52,-.65],[.76,-.62],[.96,-.25],[.69,-.12],[.9,.2],[.73,.75],[.27,.91],[.02,.91-notch],[-.3,.92],[-.78,.69],[-.93,.24],[-.7,.06],[-.94,-.2]].map(([x,y])=>({x,y}));
}
export function signedArea(p){return p.reduce((a,v,i)=>{const n=p[(i+1)%p.length];return a+v.x*n.y-n.x*v.y;},0)/2;}
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function intersects(a,b,c,d){
  const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
  return ab1*ab2<=0&&cd1*cd2<=0&&Math.max(a.x,b.x)>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)>=Math.min(a.x,b.x)&&Math.max(a.y,b.y)>=Math.min(c.y,d.y)&&Math.max(c.y,d.y)>=Math.min(a.y,b.y);
}
function simplify(points,tolerance){
  const p=points.slice();
  while(p.length>3){
    let best=-1,d=Infinity;
    for(let i=0;i<p.length;i++){
      const prev=(i+p.length-1)%p.length,next=(i+1)%p.length,a=p[prev],b=p[next],v=distance(p[i],a,b);
      if(v>d||v>tolerance)continue;
      let safe=true;
      for(let j=0;j<p.length;j++){const k=(j+1)%p.length;if(j===i||k===i||j===prev||k===prev||j===next||k===next)continue;if(intersects(a,b,p[j],p[k])){safe=false;break;}}
      if(safe){d=v;best=i;}
    }
    if(best<0)break;p.splice(best,1);
  }return p;
}
// Trace the largest connected opaque island. Small detached highlights and
// enclosed transparent holes don't become separate flying physics bodies.
export function outlineFromAlpha(data,w,h){
  const mask=new Uint8Array(w*h),seen=new Uint8Array(w*h);for(let i=0;i<mask.length;i++)mask[i]=data[i*4+3]>=96?1:0;
  let largest=[];
  for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){const queue=[i];seen[i]=1;for(let j=0;j<queue.length;j++){const n=queue[j],x=n%w,y=Math.floor(n/w);for(const k of [x>0?n-1:-1,x<w-1?n+1:-1,y>0?n-w:-1,y<h-1?n+w:-1])if(k>=0&&mask[k]&&!seen[k]){seen[k]=1;queue.push(k);}}if(queue.length>largest.length)largest=queue;}
  if(largest.length<4)throw new Error('Billedet skal indeholde en synlig figur.');
  mask.fill(0);for(const i of largest)mask[i]=1;
  const edges=new Map(),key=(x,y)=>y*(w+1)+x;
  const add=(x,y,X,Y)=>{const k=key(x,y);if(!edges.has(k))edges.set(k,[]);edges.get(k).push(key(X,Y));};
  for(const i of largest){const x=i%w,y=Math.floor(i/w);if(y===0||!mask[i-w])add(x,y,x+1,y);if(x===w-1||!mask[i+1])add(x+1,y,x+1,y+1);if(y===h-1||!mask[i+w])add(x+1,y+1,x,y+1);if(x===0||!mask[i-1])add(x,y+1,x,y);}
  let outline=[];
  while(edges.size){const start=edges.keys().next().value;let current=start;const loop=[];let guard=0;do{loop.push({x:current%(w+1),y:Math.floor(current/(w+1))});const exits=edges.get(current);if(!exits)break;const next=exits.pop();if(!exits.length)edges.delete(current);current=next;}while(current!==start&&guard++<w*h*4);if(current===start&&Math.abs(signedArea(loop))>Math.abs(signedArea(outline)))outline=loop;}
  if(outline.length<3)throw new Error('Billedets kant kunne ikke aflæses.');
  const scale=Math.max(w,h);outline=outline.map(p=>({x:(p.x-w/2)*2/scale,y:(p.y-h/2)*2/scale}));
  // About one pixel at ordinary play size. Keep recesses instead of using a hull.
  for(const tolerance of [.025,.018,.01,.004,0]){const p=simplify(outline,tolerance);if(p.length<=96&&(!globalThis.decomp||globalThis.decomp.isSimple(p.map(v=>[v.x,v.y]))))return p;}
  throw new Error('Figurens kant er for kompliceret. Prøv et billede med en sammenhængende silhuet.');
}
