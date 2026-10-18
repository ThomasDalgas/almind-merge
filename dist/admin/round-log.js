import {formatPlayTime} from '../play-time.js?v=1.1.0';
export function roundLogText(round){
 const log=round.round_log;
 const duration=round.duration_ms==null?'Spilletid ikke registreret':`Spilletid ${formatPlayTime(round.duration_ms/1000)}`;
 if(!log)return `${duration} · Rundelog ikke registreret`;
 const status={unfinished:'Ikke afsluttet',ended:'Afsluttet – årsag ukendt',gameover:'Game Over',restarted:'Ny runde startet'}[log.outcome]||'Ukendt afslutning';
 return `${duration} · ${status} · Version ${log.version||'ukendt'} · ${log.drops} drop · ${log.merges} merges (heraf ${log.svend_pairs} Svend-par) · ${log.shakes} Ryst · ${log.removals} Fjern`;
}
