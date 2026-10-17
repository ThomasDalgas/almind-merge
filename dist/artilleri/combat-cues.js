import {shotTiming} from './presentation.js?v=arsenal-13';
export const arsenal={
 shell:{name:'Granat',description:'Præcist enkelt nedslag',color:'#f0cf83',symbol:'➤',cost:0},
 heavy:{name:'Tung granat',description:'Større krater · kraftigere slag',color:'#e79a79',symbol:'⬢',cost:250},
 cluster:{name:'Klyngegranat',description:'Deler sig i luften · tre nedslag',color:'#a7d6c4',symbol:'⁙',cost:400}
};
export function clusterSplit(result){
 const path=result.hit.path;if(path.length<4)return .55;
 let apex=0;for(let i=1;i<path.length;i++)if(path[i][1]<path[apex][1])apex=i;
 return Math.min(.7,Math.max(.38,apex/Math.max(1,path.length-1)+.08));
}
export function combatCues(result){
 const {flightMs}=shotTiming(result),out=[{id:'launch',at:0},{id:'flight',at:30}];
 if(result.weapon==='cluster')out.push({id:'split',at:flightMs*clusterSplit(result)});
 if(!result.hit.miss){out.push({id:'impact',at:flightMs});
  if(result.weapon==='cluster')out.push({id:'cluster-left',at:flightMs+130},{id:'cluster-right',at:flightMs+200});
  if(result.impactPlayers.some((p,i)=>p.hp<=0&&result.before[i].hp>0))out.push({id:'breakup',at:flightMs+100});
 }
 return out.sort((a,b)=>a.at-b.at);
}
// Fragments converge on the same three blast locations used by the rules.
export function clusterFragments(result,index){
 const path=result.hit.path,split=clusterSplit(result)*(path.length-1),k=Math.min(path.length-1,Math.max(0,index));
 const j=Math.floor(k),mix=k-j,a=path[j],b=path[Math.min(j+1,path.length-1)];if(!a)return [];
 const x=a[0]+(b[0]-a[0])*mix,y=a[1]+(b[1]-a[1])*mix;
 if(k<split)return [{x,y,angle:a[2],carrier:true}];
 const u=(k-split)/Math.max(1,path.length-1-split);
 return [-1,0,1].map(side=>({x:x+side*34*u,y:y-Math.sin(u*Math.PI)*Math.abs(side)*13,angle:a[2]+side*.18*(1-u),carrier:false,side}));
}

export function clusterFlight(result,elapsed){
 const {flightMs}=shotTiming(result),split=clusterSplit(result),n=result.hit.path.length-1;
 if(elapsed<flightMs*split)return clusterFragments(result,elapsed/flightMs*n);
 return [-1,0,1].flatMap(side=>{const delay=side===-1?130:side===1?200:0;if(elapsed>=flightMs+delay)return [];const u=(elapsed-flightMs*split)/(flightMs+delay-flightMs*split);return clusterFragments(result,(split+(1-split)*u)*n).filter(p=>p.side===side);});
}
