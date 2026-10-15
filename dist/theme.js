import {RADII} from './rules.js';
import {placeholderOutline,outlineFromAlpha,signedArea} from './shapes.js';
export const NAMES=['Fodbold','Silas','Niklas','Elias','Milas','Malika','Tina','Rikke','David','Helle','Svend'];
const COLORS=['#ffffff','#b9cf90','#efd976','#c4b2d9','#eeb19b','#ddacc0','#9acac3','#a0b9d7','#daa16e','#b0c783','#cab3db','#edc384','#8fae96'];
export const defaultTiles=()=>NAMES.map((name,i)=>({name,color:COLORS[i],image:null,sound:null}));
export let tiles=defaultTiles();
const images=new Map(),outlines=new Map(),mipmaps=new Map();
const BUILTIN={0:'assets/football-v2.png',1:'assets/silas-2.png',2:'assets/niklas-4.png',3:'assets/elias-8.png',4:'assets/milas-32.png',5:'assets/malika-64-v2.png',6:'assets/tina-original.png',8:'assets/david-512.png',7:'assets/rikke-256.png',9:'assets/helle-1024.png',10:'assets/svend-2048-v2.png'};
export const tileSource=tier=>tiles[tier].image||BUILTIN[tier]||null;
export function tileOutline(tier){return outlines.get(tileSource(tier))||placeholderOutline(tier);}
// Equal visible area for equal target radii, regardless of transparent padding.
export function tileRadius(tier,target=RADII[tier]){
  const area=Math.abs(signedArea(tileOutline(tier)));
  return target*Math.min(2.5,Math.sqrt(Math.PI/Math.max(.01,area)));
}
let dbPromise;
function db(){
  return dbPromise??=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('Lokal lagring er ikke tilgængelig'));return;}
    const request=indexedDB.open('merge-lab',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('settings');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function loadTheme(){
  const store=await db();
  const saved=await new Promise((res,rej)=>{const r=store.transaction('settings').objectStore('settings').get('tiles');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  if(saved)tiles=validatePack({format:'merge-lab-v1',tiles:saved});
  await preloadImages();
}
export async function saveTheme(){
  const store=await db();
  return new Promise((res,rej)=>{const tx=store.transaction('settings','readwrite');tx.objectStore('settings').put(tiles,'tiles');tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('Lagring afbrudt'));});
}
export function validatePack(data){
  if(!['merge-lab-v1','merge-lab-v2'].includes(data?.format)||!Array.isArray(data.tiles)||![11,12,13].includes(data.tiles.length))throw new Error('Briksættet skal være et Almind-Merge-sæt med 11 brikker (eller et ældre sæt med 12 eller 13).');
  let total=0;
  const legacy=data.tiles.length===12;
  const mapped=data.tiles.map((t,i)=>{
    if(!t||typeof t.name!=='string'||!t.name.trim()||t.name.length>30)throw new Error(`Ugyldigt navn på brik ${i+1}.`);
    const image=t.image??null,sound=t.sound??null;
    if(image!==null&&(typeof image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>5000000))throw new Error(`Ugyldigt billede på brik ${i+1}.`);
    if(sound!==null&&(typeof sound!=='string'||!/^data:audio\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(sound)||sound.length>11500000))throw new Error(`Ugyldig lyd på brik ${i+1}.`);
    total+=(image?.length||0)+(sound?.length||0);if(total>45000000)throw new Error('Briksættet må højst fylde 45 MB.');
    return {name:t.name.trim(),color:COLORS[i+(legacy?1:0)],image,sound};
  });
  if(legacy)mapped.unshift(defaultTiles()[0]);
  for(const [i,old] of [[10,'Nova'],[9,'Sky'],[7,'Måne'],[8,'Komet'],[5,'Blomst'],[4,'Fersken'],[1,'Spire'],[2,'Sol'],[3,'Boble'],[6,'Bølge']])if(mapped[i].name===old&&!mapped[i].image)mapped[i].name=NAMES[i];
  if(mapped[6].name==='Mor Tina')mapped[6].name='Tina';
  return mapped.slice(0,NAMES.length);
}
export async function replaceTiles(next){
  const previous=tiles;tiles=next;
  try{await preloadImages();await saveTheme();}catch(err){tiles=previous;throw err;}
}
export async function preloadImages(onProgress=()=>{}){
 const sources=[...new Set([...Object.values(BUILTIN),...tiles.map((t,i)=>tileSource(i)).filter(Boolean)])];let done=0;
 onProgress(done,sources.length);
 await Promise.all(sources.map(async src=>{await getImage(src);onProgress(++done,sources.length);}));
}
export async function getImage(src){
  if(images.has(src))return images.get(src);
  const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('Billedet kunne ikke læses.'));img.src=src;});const c=document.createElement('canvas'),scale=96/Math.max(img.naturalWidth,img.naturalHeight);c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,c.width,c.height);outlines.set(src,outlineFromAlpha(g.getImageData(0,0,c.width,c.height).data,c.width,c.height));images.set(src,img);return img;
}
export function clearImageCache(){images.clear();outlines.clear();mipmaps.clear();}
// Pre-filter large artwork in half-size steps. This avoids losing facial
// features when the browser samples a 1280px image directly into a small tile.
function spriteLevel(src,img,target){
  let levels=mipmaps.get(src);
  if(!levels){levels=[img];mipmaps.set(src,levels);}
  let level=0;
  while(Math.max(levels[level].width,levels[level].height)/2>=Math.max(24,target)){
    if(!levels[level+1]){
      const prev=levels[level],c=document.createElement('canvas');
      c.width=Math.ceil(prev.width/2);c.height=Math.ceil(prev.height/2);
      const g=c.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
      g.drawImage(prev,0,0,c.width,c.height);levels.push(c);
    }
    level++;
  }
  return levels[level];
}
export function drawTile(ctx,tier,x,y,r,{rotation=0,alpha=1}={}){
  const t=tiles[tier];ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(rotation);
  const custom=images.get(tileSource(tier));
  ctx.shadowColor='#29412a13';ctx.shadowBlur=r*.16;ctx.shadowOffsetY=r*.09;
  if(custom){
    const matrix=ctx.getTransform(),target=r*2*Math.hypot(matrix.a,matrix.b);const sprite=spriteLevel(tileSource(tier),custom,target);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';const scale=r*2/Math.max(custom.naturalWidth,custom.naturalHeight);ctx.drawImage(sprite,-custom.naturalWidth*scale/2,-custom.naturalHeight*scale/2,custom.naturalWidth*scale,custom.naturalHeight*scale);ctx.shadowColor='transparent';
  }else{
    ctx.fillStyle=t.color;ctx.beginPath();tileOutline(tier).forEach((p,i)=>i?ctx.lineTo(p.x*r,p.y*r):ctx.moveTo(p.x*r,p.y*r));ctx.closePath();ctx.fill();ctx.shadowColor='transparent';
    ctx.strokeStyle='#243d2722';ctx.lineWidth=Math.max(1,r*.025);ctx.stroke();
    ctx.fillStyle='#ffffff28';ctx.beginPath();ctx.ellipse(-r*.25,-r*.42,r*.4,r*.19,-.55,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#39553c';
    ctx.fillStyle='#2f4234';for(const s of [-1,1]){ctx.beginPath();ctx.ellipse(s*r*.23,-r*.1,r*.065,r*.09,0,0,7);ctx.fill();ctx.fillStyle='#fff9';ctx.beginPath();ctx.arc(s*r*.23+r*.016,-r*.13,r*.019,0,7);ctx.fill();ctx.fillStyle='#2f4234';}
    ctx.strokeStyle='#2f4234';ctx.lineWidth=Math.max(1,r*.033);ctx.lineCap='round';ctx.beginPath();ctx.arc(0,r*.05,r*.12,.1,Math.PI-.1);ctx.stroke();
    ctx.fillStyle='#b85e6024';for(const s of [-1,1]){ctx.beginPath();ctx.ellipse(s*r*.43,r*.08,r*.13,r*.07,0,0,7);ctx.fill();}
  }

  ctx.restore();
}
