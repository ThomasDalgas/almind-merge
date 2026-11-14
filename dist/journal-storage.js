// Encode long journals for browser storage only. RPCs still receive the original
// numbered events, including every chain parent. Sealed blocks never change.
const kinds='dmsrb',block=512,cache=new WeakMap();
function pack(events,start){
 const bytes=[];let wall=0,sim=0;
 const put=n=>{while(n>=128){bytes.push(128+n%128);n=Math.floor(n/128);}bytes.push(n);};
 for(const e of events.slice(start,start+block)){
  bytes.push(kinds.indexOf(e[0])+(e.length===6?8:0),e[1]);put(e[2]-wall);wall=e[2];
  if(e.length===6){put(e[3]-sim);sim=e[3];put(e[4]);put(e[5]);}
 }
 return btoa(String.fromCharCode(...bytes));
}
export function forStorage(item){
 if(!item||item.events.length<4096)return item;
 const {events,...meta}=item;let blocks=cache.get(events);
 if(!blocks){blocks=[];cache.set(events,blocks);}
 while((blocks.length+1)*block<=events.length)blocks.push(pack(events,blocks.length*block));
 return {...meta,eventBlocks:blocks,tail:events.slice(blocks.length*block)};
}
export function fromStorage(item){
 if(!item?.eventBlocks)return item;
 const {eventBlocks,tail,...meta}=item,events=[];
 for(const encoded of eventBlocks){
  const bytes=atob(encoded);let i=0,wall=0,sim=0;
  const get=()=>{let n=0,f=1;for(let j=0;j<5&&i<bytes.length;j++){const b=bytes.charCodeAt(i++);n+=(b%128)*f;if(b<128)return n;f*=128;}throw Error('Invalid journal');};
  while(i<bytes.length){const k=bytes.charCodeAt(i++),tier=bytes.charCodeAt(i++);wall+=get();
   const event=[kinds[k%8],tier,wall];if(k>=8){sim+=get();event.push(sim,get(),get());}events.push(event);}
 }
 events.push(...tail);cache.set(events,eventBlocks.slice());return {...meta,events};
}
