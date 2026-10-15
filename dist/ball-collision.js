// Compound silhouettes can trap a small body between their internal edges.
// Find an escape against the exterior outlines, never against those internal seams.
function nearest(point,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));
 return {x:a.x+t*dx,y:a.y+t*dy};
}
function clearance(point,polygon){
 let inside=false,distance=Infinity;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i],q=nearest(point,a,b);
  distance=Math.min(distance,Math.hypot(point.x-q.x,point.y-q.y));
  if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside?-distance:distance;
}
const polygonBounds=new WeakMap();
function boundedClearance(point,polygon,threshold){
 let bounds=polygonBounds.get(polygon);
 if(!bounds){bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};for(const p of polygon){bounds.left=Math.min(bounds.left,p.x);bounds.right=Math.max(bounds.right,p.x);bounds.top=Math.min(bounds.top,p.y);bounds.bottom=Math.max(bounds.bottom,p.y);}polygonBounds.set(polygon,bounds);}
 const dx=Math.max(bounds.left-point.x,0,point.x-bounds.right),dy=Math.max(bounds.top-point.y,0,point.y-bounds.bottom);
 // A box encloses the whole outline. Outside this distance the detailed edge
 // walk cannot change the overlap result; nearby/concave shapes use exact checks.
 if(dx*dx+dy*dy>=threshold*threshold)return threshold;
 return clearance(point,polygon);
}
export function findBallEscape(point,radius,polygons,{left,right,floor}){
 const overlaps=polygons.filter(p=>boundedClearance(point,p,radius+.15)<radius-.75);
 if(!overlaps.length)return null;
 const margin=radius+.15,candidates=[];
 const free=q=>q.x-margin>=left&&q.x+margin<=right&&q.y+margin<=floor&&polygons.every(p=>boundedClearance(q,p,margin)>=margin-.01);
 for(const polygon of overlaps)for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],q=nearest(point,a,b),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
  for(const sign of [-1,1])candidates.push({x:q.x+sign*dy/length*margin,y:q.y-sign*dx/length*margin});
  // Corner exits, including concave notches.
  const vx=point.x-a.x,vy=point.y-a.y,vl=Math.hypot(vx,vy)||1;
  candidates.push({x:a.x+vx/vl*margin,y:a.y+vy/vl*margin});
 }
 candidates.sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y));
 const edgeExit=candidates.find(free);
 if(edgeExit)return edgeExit;
 // A crowded pile may block every local edge exit. Search nearby free space,
 // including above the pile, without ever moving through a side wall or floor.
 for(let distance=radius;distance<=floor+radius*2;distance+=radius*.5){
  for(let i=0;i<24;i++){
   const angle=-Math.PI/2+i*Math.PI/12,q={x:point.x+Math.cos(angle)*distance,y:point.y+Math.sin(angle)*distance};
   if(free(q))return q;
  }
 }
 return null;
}
