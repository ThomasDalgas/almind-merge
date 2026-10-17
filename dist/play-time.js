export function formatPlayTime(seconds){
 const n=Math.max(0,Math.floor(Number(seconds)||0));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':');
}
export function createPlayClock(now=()=>performance.now()){
 let elapsed=0,since=null;
 return {start(){elapsed=0;since=now();},pause(){if(since!==null){elapsed+=Math.max(0,now()-since);since=null;}},resume(){if(since===null)since=now();},seconds(){return (elapsed+(since===null?0:Math.max(0,now()-since)))/1000;}};
}
