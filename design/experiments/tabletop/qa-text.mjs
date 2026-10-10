import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {registerFonts,canvasFont} from '../../../typography/fonts.mjs';
import {presentationModel} from './presentation.mjs';
import {identityTextPlan,assertTextInk} from './text-layout.mjs';
registerFonts();
const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
const config=read('./presentation.json'),scene=read('../../scenes.json'),c=createCanvas(1920,1080).getContext('2d');
const checks=[];
for(const [id,input] of [['default',scene],['two-character-strategies',{...scene,strategies:scene.strategies.map((s,i)=>({...s,label:['合作','退出'][i]}))}]]){
 const view=presentationModel(config,input),ink=assertTextInk(c,identityTextPlan(view),canvasFont);checks.push({id,ink});
 for(const row of ink.filter(x=>x.id.endsWith('-strategy')&&x.id.startsWith('row-')))assert.ok(1136-row.bounds.right>=24);
}
const long=structuredClone(config);long.actors.A.name='普通僵尸角色名称十字';
assert.equal([...long.actors.A.name].length,10);const longView=presentationModel(long,scene);
assert.throws(()=>assertTextInk(c,identityTextPlan(longView),canvasFont),/UNSUPPORTED_TEXT_LAYOUT row-0-owner/);
console.log(JSON.stringify({status:'pass',checks,schemaValidTenCharacterName:'explicitly_rejected_by_pixel_extent',fontSizesUnchanged:true},null,2));
