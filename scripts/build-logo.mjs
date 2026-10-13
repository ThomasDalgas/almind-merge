// Compose the logo from the exact game assets; never redraw family faces.
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const theme=fs.readFileSync(new URL('dist/theme.js',root),'utf8');
const builtin=Object.fromEntries([...theme.matchAll(/(\d+):'(assets\/[^']+)'/g)].map(m=>[Number(m[1]),m[2]]));
const logo=(className)=>`<div class="${className} family-logo" role="img" aria-label="Almind-Merge med spillets originale familiefigurer"><div class="logo-row">${[1,2,3,4,5].map(i=>`<img src="${builtin[i]}" alt="" draggable="false">`).join('')}</div><svg class="logo-wordmark" viewBox="0 0 1200 190" aria-hidden="true"><defs><linearGradient id="${className}-gold" x2="0" y2="1"><stop stop-color="#fff3a0"/><stop offset=".5" stop-color="#ffce35"/><stop offset="1" stop-color="#ee940b"/></linearGradient></defs><text x="600" y="140" text-anchor="middle" textLength="1090" lengthAdjust="spacingAndGlyphs" font-family="Arial Rounded MT Bold,Arial,sans-serif" font-size="148" font-weight="900" paint-order="stroke" stroke="#063b55" stroke-width="24" stroke-linejoin="round" fill="url(#${className}-gold)">Almind-Merge</text></svg><div class="logo-row">${[6,7,8,9,10].map(i=>`<img src="${builtin[i]}" alt="" draggable="false">`).join('')}</div><img class="logo-ball" src="${builtin[0]}" alt="" draggable="false"></div>`;
const p=new URL('dist/index.html',root);let html=fs.readFileSync(p,'utf8');
for(const cls of ['brand-logo','game-logo'])html=html.replace(new RegExp(`<img class="${cls}"[^>]*>`),logo(cls));
fs.writeFileSync(p,html);
