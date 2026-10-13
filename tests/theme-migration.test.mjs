import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultTiles,validatePack} from '../dist/theme.js';
import {VALUES,RADII} from '../dist/rules.js';
test('Insert football and preserve every legacy character, image and sound exactly once',()=>{
 const old=[...defaultTiles().slice(1),{name:"Orbit"},{name:"Kosmos"}];old[0]={...old[0],name:'Min Silas',image:'data:image/png;base64,AAAA',sound:'data:audio/wav;base64,AAAA'};
 const next=validatePack({format:'merge-lab-v1',tiles:old});
 assert.equal(next.length,11);assert.equal(next[0].name,'Fodbold');assert.deepEqual(next[1],old[0]);assert.equal(next[6].name,'Tina');assert.equal(next[10].name,'Svend');
 assert.deepEqual(validatePack({format:'merge-lab-v2',tiles:next}),next);
 assert.equal(VALUES[6],128);assert.equal(VALUES.at(-1),2048);assert.equal(RADII.length,11);assert.ok(RADII.every((r,i)=>!i||r>RADII[i-1]));
});

test('Old 13-tile packs retain active custom assets and trim removed tiers',()=>{const current=defaultTiles();current[10].sound='data:audio/wav;base64,AAAA';assert.deepEqual(validatePack({format:'merge-lab-v2',tiles:[...current,{name:'Orbit'},{name:'Kosmos'}]}),current);});
