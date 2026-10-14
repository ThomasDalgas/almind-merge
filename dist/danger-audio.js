// A separate channel keeps merge sounds from interrupting the warning.
export function createDangerAudio({context,load,duration=15}){
 let source=null,gain=null,pending=false,generation=0,elapsed=0,startedAt=0;
 function stop(){
  generation++;pending=false;
  if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();gain.disconnect();source=null;gain=null;}
 }
 function sync(seconds,enabled){
  elapsed=seconds;
  if(!enabled||seconds<=0||seconds>=duration){stop();return;}
  const ctx=context();if(!ctx)return;
  if(source&&Math.abs(ctx.currentTime-startedAt-seconds)>.25)stop();
  if(source||pending)return;
  pending=true;const token=++generation;
  load().then(buffer=>{
   if(token!==generation)return;
   pending=false;
   const offset=elapsed;if(offset<=0||offset>=duration)return;
   source=ctx.createBufferSource();gain=ctx.createGain();source.buffer=buffer;
   const rate=buffer.duration/duration,now=ctx.currentTime;
   source.playbackRate.value=rate;
   gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.65,now+.015);
   source.connect(gain).connect(ctx.destination);startedAt=now-offset;
   source.start(now,offset*rate);
   source.onended=()=>{source?.disconnect();gain?.disconnect();source=null;gain=null;};
  }).catch(()=>{if(token===generation)pending=false;});
 }
 return {sync,stop};
}
