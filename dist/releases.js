export const RELEASES=[{
 version:'1.2.3',date:'14. november 2026',changes:['Vælger du Start forfra efter genåbning, afsluttes den gemte runde, så dens point kan tælle på highscoren.','Start forfra har fået ekstra afstand til pauseknappen og kræver altid bekræftelse.','Lange runder kan nu gemmes og tælle med efter 20.000 handlinger.']
},{
 version:'1.2.2',date:'9. november 2026',changes:['Ugens og alle tiders highscore viser nu kun afsluttede runder. Du kan stadig gemme en runde undervejs og spille videre senere.']
},{
 version:'1.2.1',date:'8. november 2026',changes:['Pointteksten over brikkerne viser nu fx “Bonus ×2 · +16”.']
},{
 version:'1.2.0',date:'8. november 2026',changes:[
  'Merger en ny brik videre inden for to sekunders spilletid, får du dobbelt point for det led. Fortsætter kæden, stiger bonussen til ×3, ×4 og højst ×5.',
  'Guldteksten over brikkerne viser hele beløbet. Kædepoint tæller i din highscore, og din kæde følger med, når du fortsætter en gemt runde. To Svend giver samme bonus som før.'
 ]
},{
 version:'1.1.5',date:'8. november 2026',changes:[
  'Din runde gemmes automatisk. Lukker du browseren midt i spillet, kan du åbne det igen i samme browser og trykke Spil videre. Dine brikker, point og resterende Ryst og Fjern er bevaret.'
 ]
},{version:'1.1.4',date:'18. oktober 2026',changes:['Administration får en kompakt rundelog, så rekorder lettere kan undersøges.']},{version:'1.1.3',date:'17. oktober 2026',changes:['Se online spillere og deres aktuelle point på forsiden og efter Game Over.']},{version:'1.1.2',date:'17. oktober 2026',changes:['Milas, Malika, Rikke og David har nu deres egne lyde, når de bliver merget. Tryk også på dem i det store figurpreview for at høre dem.']},{version:'1.1.1',date:'17. oktober 2026',changes:['Rettet en fejl, hvor en gemt ældre side kunne skjule spillet og tidstællingen.']},{
 version:'1.1.0',date:'17. oktober 2026',changes:[
  'Se din spilletid undervejs. Uret stopper, når du holder pause.',
  'Highscoren viser nu dato, klokkeslæt og registreret spilletid.',
  'Find versionsnummer og korte nyheder her, når spillet bliver opdateret.'
 ]
}];
const button=document.querySelector('#release-open'),dialog=document.querySelector('#release-notes'),list=document.querySelector('#release-list'),current=RELEASES[0].version;
let seen=null;try{seen=localStorage.getItem('almind-release-seen');}catch{}
function label(){button.textContent=`v${current}${seen===current?'':' · Nyt'}`;button.setAttribute('aria-label',`Version ${current} – nyt i spillet`);}
for(const release of RELEASES){const section=document.createElement('section'),title=document.createElement('h3'),date=document.createElement('p'),items=document.createElement('ul');title.textContent=`Version ${release.version}`;date.textContent=release.date;date.className='release-date';for(const text of release.changes){const li=document.createElement('li');li.textContent=text;items.append(li);}section.append(title,date,items);list.append(section);}
button.onclick=()=>{if(document.body.classList.contains('playing'))document.querySelector('#pause').click();if(!dialog.open)dialog.showModal();seen=current;try{localStorage.setItem('almind-release-seen',current);}catch{}label();};
document.querySelector('#release-close').onclick=()=>dialog.close();label();
