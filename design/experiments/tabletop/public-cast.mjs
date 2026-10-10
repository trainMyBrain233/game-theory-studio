import fs from 'node:fs';
import {loadImage} from '@napi-rs/canvas';
import {headAlphaBounds} from './avatar.mjs';

/** Only the repository's original SVG figures. Never resolves private cast routing. */
export async function loadPublicCast(){
 const arms={},figures={},avatars={};
 const wrap=groups=>`<svg xmlns="http://www.w3.org/2000/svg" width="840" height="1000" viewBox="0 0 420 500"><g stroke="#243E66" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">${groups}</g></svg>`;
 for(const id of ['a','b']){
  const svg=fs.readFileSync(new URL(`../../../production/assets/person_${id}.svg`,import.meta.url),'utf8');
  const groups=['forearms','forearm-details','cuffs','hands'].map(name=>svg.match(new RegExp(`<g id="${name}"[\\s\\S]*?<\\/g>`))?.[0]);
  if(groups.some(g=>!g))throw Error('Missing original foreground arm group.');
  arms[id]=await loadImage(Buffer.from(wrap(groups.join(''))));
  figures[id]=await loadImage(Buffer.from(svg.replace(/<(circle|rect) id="identity-badge"[^>]*\/>/,'')));
  const headIds=['hair-back','ears','face','hair','hair-front','hair-strands','brows','glasses','eyes','face-details'];
  const head=headIds.map(name=>svg.match(new RegExp(`<g id="${name}"[\\s\\S]*?<\\/g>`))?.[0]??svg.match(new RegExp(`<path id="${name}"[^>]*\\/>`))?.[0]??'').join('');
  const image=await loadImage(Buffer.from(wrap(head)));avatars[id.toUpperCase()]={actor:id.toUpperCase(),image,bounds:headAlphaBounds(image)};
 }
  return {arms,figures,avatars};
}
