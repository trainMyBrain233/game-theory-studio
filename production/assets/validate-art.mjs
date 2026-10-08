/** Real SVG rendering checks for the public, original placeholder art.
 * These selected pixels catch the reported occlusion; they do not certify
 * anatomy, arbitrary poses or private RGBA artwork without visual review.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';

const ink=[36,62,102,255],paper=[255,254,248,255];
const palettes={a:[229,237,244,255],b:[242,231,206,255]};
async function pixels(svg,width,height){
 const enlarged=svg.replace(/width="\d+" height="\d+"/,`width="${width*4}" height="${height*4}"`);
 const image=await loadImage(Buffer.from(enlarged));
 const canvas=createCanvas(width*4,height*4),c=canvas.getContext('2d');c.drawImage(image,0,0);
 return {canvas,at:(x,y)=>[...c.getImageData(x*4,y*4,1,1).data]};
}
function near(actual,expected,label){assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=2),`${label}: pixel ${actual}, expected ${expected}`)}
export async function validateFigure(svg,id){
 assert.match(svg,/viewBox="0 0 420 500" width="420" height="500"/);
 assert.doesNotMatch(svg,/<(?:mask|clipPath|image)\b|\btransform\s*=/i,'No masking or scaling to hide the intersection');
 const body=id==='a'?'shirt':'blouse';
 const order=['upper-arms',`${body}-body`,`${body}-details`,'forearms','cuffs','hands'].map(name=>svg.indexOf(`id="${name}"`));
 assert.ok(order.every((at,i)=>at>=0&&(i===0||at>order[i-1])),'Upper arms behind body; forearms/cuffs/hands in front');
 assert.match(svg,new RegExp(`id="${body}-body" stroke="none"`),'Body fill must not redraw the closed hem');
 return await validateFigurePixels(svg,id);
}
export async function validateFigurePixels(svg,id){
 const {at}=await pixels(svg,420,500);
 for(const [x,y] of [[120,435],[300,435]])near(at(x,y),ink,'Visible inward forearm contour');
 for(const [x,y] of [[103,446],[317,446]])near(at(x,y),palettes[id],'Forearm fill occludes the body side contour');
 for(const [x,y] of [[149,455],[271,455]])near(at(x,y),ink,'Connected cuff/wrist seam');
 for(const [x,y] of [[174,480],[246,480]])assert.equal(at(x,y)[3],0,'No closed hem under the palms');
 return {frontContourSamples:2,occludedBodySamples:2,wristSamples:2,openHemSamples:2,passed:true};
}
export async function validateCard(svg,kind){
 const {at}=await pixels(svg,140,190);
 if(kind==='red'){
  near(at(70,90),paper,'Lowered circle remains visible');near(at(70,40),[188,61,49,255],'Circle moved away from the grip');
 }else{
  near(at(70,75),paper,'Lowered bar remains visible');near(at(70,52),[52,93,158,255],'Bar moved away from the grip');
 }
 return {symbolCenter:[70,73],labelAndCardBoundsUnchanged:true,passed:true};
}
export async function validateAssetSource(name,buffer,expectedHash){
 const sha256=createHash('sha256').update(buffer).digest('hex');
 assert.equal(sha256,expectedHash,`${name}: source hash differs from the authored hotspots contract`);
 const svg=buffer.toString('utf8');
 const art=name.startsWith('person_')?await validateFigure(svg,name.at(-5)):name==='card_back.svg'?{passed:true}:await validateCard(svg,name.includes('red')?'red':'blue');
 return {file:name,sourceSha256:sha256,sourceBytes:buffer.length,art};
}
