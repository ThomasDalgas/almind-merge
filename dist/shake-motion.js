export function shakeVelocity(velocity,pulse,bottom,floor,gain=1.15){
 const angle=-Math.PI/2+pulse*Math.PI/4;
 const x=velocity.x+Math.cos(angle)*5.2*gain;
 // The upward part of the orbit also lifts pieces touching the floor.
 const nearFloor=Math.max(0,Math.min(1,1-(floor-bottom)/45));
 const lift=Math.max(0,-Math.sin(angle))*nearFloor*1.8*gain;
 const y=velocity.y+Math.sin(angle)*5.2*gain-lift;
 const scale=Math.min(1,6.4*gain/Math.hypot(x,y));
 return {x:x*scale,y:y*scale};
}
