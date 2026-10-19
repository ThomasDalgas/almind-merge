import {cp,mkdir,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve(process.env.SITE_OUTPUT||'.site-build');
if(output===resolve('dist')||output===resolve('site')||output===process.cwd())throw new Error('Unsafe output path');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
await cp('dist',output,{recursive:true});await cp('dist',resolve(output,'merge'),{recursive:true});await cp('site',output,{recursive:true});
const original=await readFile('dist/index.html'),published=await readFile(resolve(output,'merge/index.html'));
if(!original.equals(published))throw new Error('Original game changed');
console.log(`Published site prepared at ${output}`);
