import {combatCues} from './combat-cues.js?v=arsenal-13';
// Cached, layered PCM effects: no network/decode delay on the firing gesture.
export function createCombatAudio({onChange=()=>{}}={}){
 let context=null,master=null,enabled=true,shot=null,flight=null,rebuildOnGesture=false;const buffers=new Map(),voices=new Set();
 try{enabled=localStorage.getItem('aa-sound')!=='off';}catch{}
 function makeBuffer(kind){if(buffers.has(kind))return buffers.get(kind);
  const duration={launch:1.25,impact:2.2,breakup:1.7,split:.26,flight:1}[kind],rate=context.sampleRate,buffer=context.createBuffer(1,Math.ceil(rate*duration),rate),data=buffer.getChannelData(0);let brown=0,seed=1234567;
  for(let i=0;i<data.length;i++){const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=seed/2147483648-1;brown=(brown+.045*n)/1.045;let v=0;
   if(kind==='launch')v=(n*.46*Math.exp(-t*32)+brown*4*Math.exp(-t*6)+Math.sin(2*Math.PI*(83*t-19*t*t))*.44*Math.exp(-t*11))*(1-Math.exp(-t*1500));
   if(kind==='impact')v=(brown*5*Math.exp(-t*2.6)+n*.45*Math.exp(-t*22)+Math.sin(2*Math.PI*(58*t-9*t*t))*.25*Math.exp(-t*5))*(1-Math.exp(-t*1700));
   if(kind==='breakup'){const pulse=Math.pow(Math.max(0,Math.sin(t*47)),16)*Math.exp(-t*2);v=(Math.sin(t*2*Math.PI*841)+Math.sin(t*2*Math.PI*1327)*.6+Math.sin(t*2*Math.PI*2161)*.3)*pulse*.2+n*.18*Math.exp(-t*6)+brown*2*Math.exp(-t*3);}
   if(kind==='split')v=n*.22*Math.exp(-t*25)+Math.sin(t*2*Math.PI*620)*.13*Math.exp(-t*35);
   if(kind==='flight')v=n*.18+Math.sin(t*2*Math.PI*940)*.05+Math.sin(t*2*Math.PI*1410)*.025;
   data[i]=Math.tanh(v)*.78*Math.min(1,(duration-t)*35);
  }buffers.set(kind,buffer);return buffer;
 }
 function build(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;
  context=new Audio({latencyHint:'interactive'});master=context.createGain();master.gain.value=enabled?.65:0;const limit=context.createDynamicsCompressor();limit.threshold.value=-13;limit.knee.value=10;limit.ratio.value=5;limit.attack.value=.003;limit.release.value=.18;master.connect(limit);limit.connect(context.destination);
  try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
  for(const name of ['launch','impact','breakup','split','flight'])makeBuffer(name);return true;
 }
 function stopFlight(){if(flight){try{flight.source.stop();}catch{}flight=null;}}
 function stop(){stopFlight();for(const source of voices){try{source.stop();}catch{}}voices.clear();shot=null;}
 function unlock(){if(!enabled)return;try{if(rebuildOnGesture){if(context)void context.close().catch(()=>{});context=null;buffers.clear();rebuildOnGesture=false;}if(!context||context.state==='closed'){buffers.clear();if(!build())return;}if(context.state!=='running')void context.resume().catch(()=>{});
  // A one-sample source inside the trusted touch/click unlocks older iOS Web Audio.
  const silent=context.createBufferSource();silent.buffer=context.createBuffer(1,1,context.sampleRate);silent.connect(master);silent.start();
 }catch{}onChange(enabled);}
 function play(kind,x=.5,volume=1,rate=1,loop=false){if(!enabled||!context||context.state!=='running')return null;
  const source=context.createBufferSource(),gain=context.createGain();source.buffer=makeBuffer(kind);source.playbackRate.value=rate;source.loop=loop;gain.gain.value=volume;
  source.connect(gain);let pan=null;if(context.createStereoPanner){pan=context.createStereoPanner();pan.pan.value=Math.max(-.75,Math.min(.75,(x-.5)*1.5));gain.connect(pan);pan.connect(master);}else gain.connect(master);
  voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();pan?.disconnect();};source.start();if(!loop)source.stop(context.currentTime+source.buffer.duration/rate);return {source,gain};
 }
 function begin(result){stop();shot={result,cues:combatCues(result),sent:new Set()};}
 function update(elapsed,state){if(!shot)return;const {result,cues,sent}=shot;
  for(const cue of cues){if(sent.has(cue.id)||elapsed<cue.at)continue;sent.add(cue.id);if(elapsed-cue.at>220)continue;
   const x=result.hit.x/960;
   if(cue.id==='launch')play('launch',result.before[result.actor].x/960,result.weapon==='heavy'?1:.8,result.weapon==='heavy'?.78:1);
   if(cue.id==='split')play('split',.5,.6);
   if(cue.id==='impact')play('impact',x,result.hit.direct?1:.8,result.weapon==='heavy'?.76:1);
   if(cue.id.startsWith('cluster-'))play('impact',x+(cue.id==='cluster-left'?-.04:.04),.48,1.25);
   if(cue.id==='breakup')play('breakup',x,.85);
  }
  if(state.flight&&elapsed>30&&enabled){if(!flight)flight=play('flight',.5,.035,1,true);if(flight&&context.state==='running'){const u=elapsed/state.flightMs;flight.source.playbackRate.setTargetAtTime(.8+u*.5,context.currentTime,.05);flight.gain.gain.setTargetAtTime(.035+Math.sin(u*Math.PI)*.055,context.currentTime,.03);}}
  else stopFlight();
 }
 function toggle(){enabled=!enabled;try{localStorage.setItem('aa-sound',enabled?'on':'off');}catch{}if(!enabled){stopFlight();for(const source of voices){try{source.stop();}catch{}}voices.clear();}else unlock();if(master)master.gain.value=enabled?.65:0;onChange(enabled);return enabled;}
 function suspend(){rebuildOnGesture=true;const saved=shot;stop();shot=saved;if(context&&context.state==='running')void context.suspend().catch(()=>{});}
 function finish(){stopFlight();shot=null;}
 return {unlock,begin,update,stop,finish,suspend,toggle,get enabled(){return enabled;}};
}
