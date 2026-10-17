// One clock owns flight, impact, result hold, and release of the next turn.
export function shotTiming(result) {
  const flightMs=Math.min(2400,Math.max(650,result.hit.path.length*30));
  const impactMs=result.ended?2400:1700;
  const bannerMs=result.ended?900:0;
  const holdMs=result.ended?3600:1300;
  return {flightMs,impactMs,bannerMs,holdMs,totalMs:flightMs+Math.max(impactMs,bannerMs+holdMs)};
}
export function shotFrame(result,elapsed) {
  const timing=shotTiming(result),impactAge=Math.max(0,elapsed-timing.flightMs);
  const flight=elapsed<timing.flightMs;
  return {...timing,elapsed,flight,impactAge,index:flight?Math.min(result.hit.path.length-1,elapsed/timing.flightMs*Math.max(0,result.hit.path.length-1)):result.hit.path.length+impactAge/1000*30,
    motionIndex:Math.min(Math.max(0,result.motion.length-1),Math.floor(impactAge/24)),
    showBanner:!flight&&impactAge>=timing.bannerMs&&impactAge<timing.bannerMs+timing.holdMs,
    done:elapsed>=timing.totalMs};
}
