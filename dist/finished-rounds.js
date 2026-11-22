import {forStorage} from './journal-storage.js?v=1.6.0';
export const FINISHED_PREFIX='almind-finished-round:';
export function preserveFinished(storage,snapshot){
 if(!snapshot?.journal?.key)throw Error('Runden mangler en gemmelog');
 const key=FINISHED_PREFIX+snapshot.journal.key;
 const encoded=JSON.stringify({...snapshot,finished:true,journal:forStorage({...snapshot.journal,final:true})});
 storage.setItem(key,encoded);
 if(storage.getItem(key)!==encoded)throw Error('Kopien kunne ikke gemmes');
}
