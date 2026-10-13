export const VALUES = Array.from({length:11},(_,i)=>2**(i+1));
export const RADII = [16,25,30,35,40,45,50,57,65,74,84];
export const DROP_DELAY = .5;
export const TOP_WAIT = 5;
export function mergeTier(a,b){return a===b && Number.isInteger(a) && a>=0 && a<VALUES.length-1 ? a+1 : null;}
export function nextTier(drops,maxTier,random=Math.random){
  if(drops<3)return 0;
  const exclusiveMax=Math.min(Math.max(maxTier,3),5);
  return Math.min(exclusiveMax-1,Math.floor(Math.max(0,random())*exclusiveMax));
}
export function createRound(){return {score:0,drops:0,maxTier:0,current:0,next:0,lastDrop:-Infinity};}
export function dropRound(round,time,random=Math.random){
  if(time-round.lastDrop<DROP_DELAY)return null;
  const tier=round.current;
  round.score+=VALUES[tier];round.drops++;round.lastDrop=time;
  round.current=round.next;round.next=nextTier(round.drops,round.maxTier,random);
  return tier;
}
export function mergeRound(round,a,b){
  const tier=mergeTier(a,b);if(tier===null)return null;
  round.score+=VALUES[tier];round.maxTier=Math.max(round.maxTier,tier);return tier;
}
export function advanceDanger(previous,above,delta){return above?previous+delta:0;}
