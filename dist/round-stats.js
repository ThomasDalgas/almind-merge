import {formatPlayTime} from './play-time.js?v=1.1.0';
export function summarizeRound(round,journal,duration_ms){
 const log={drops:0,merges:0,svend_pairs:0,shakes:0,removals:0,actions:0,partial:Boolean(journal?.invalid||journal?.recovery)};
 if(!journal?.events)return {...round,duration_ms,round_log:null};
 for(const [kind,tier] of journal.events){
  if(kind==='d')log.drops++;
  if(kind==='m'||kind==='b'){log.merges++;if(tier===10)log.svend_pairs++;}
  if(kind==='s')log.shakes++;
  if(kind==='r')log.removals++;
 }
 log.actions=log.drops+log.merges+log.shakes+log.removals;
 return {score:round.score,max_tier:round.maxTier,duration_ms,round_log:log};
}
const fmt=new Intl.NumberFormat('da-DK');
export function showRoundStats(row,local=false){
 const dialog=document.querySelector('#round-stats'),grid=dialog.querySelector('dl');grid.replaceChildren();
 document.querySelector('#round-stats-title').textContent=local?'Din afsluttede runde':row.nickname+' · rundestatistik';
 const log=row.round_log;
 const fields=[['Point',fmt.format(row.score)],['Spilletid',row.duration_ms==null?'Ikke registreret':formatPlayTime(row.duration_ms/1000)],
 ['Registrerede handlinger',log?.actions??(log?log.drops+log.merges+log.shakes+log.removals:null)],
 ['Drop',log?.drops],['Merges',log?.merges],['Svend-par',log?.svend_pairs],['Ryst brugt',log?.shakes],['Fjern brugt',log?.removals]];
 for(const [label,value] of fields){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value==null?'Ikke registreret':typeof value==='number'?fmt.format(value):value;grid.append(dt,dd);}
 document.querySelector('#round-stats-note').textContent=(!log?'Statistik blev ikke registreret for denne ældre runde. ':(log.partial||log.complete===false)?'Rundeloggen er ufuldstændig; tællerne dækker kun de registrerede handlinger. ':'')+'Handlinger omfatter drop, merges, Ryst og Fjern. Svend-par er to Svend-brikker, der samles, og indgår også i antal merges.';
 if(!dialog.open)dialog.showModal();
}
