import {registerFonts,canvasFont} from '../../../../typography/fonts.mjs';registerFonts();
import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {createCanvas,loadImage} from '@napi-rs/canvas';
const root=fileURLToPath(new URL('.',import.meta.url));
const props=JSON.parse(fs.readFileSync(root+'proposals.json','utf8'));
const labelCanvas=createCanvas(1800,1280),lc=labelCanvas.getContext('2d');
const results=[];
for(const id of ['human','animal','robot']){
const p=props.find(p=>p.id===id);lc.font=canvasFont(25,400);
const labels=[{slot:'A',x:92,y:384,w:Math.max(168,lc.measureText(p.roles[0]).width),h:93},{slot:'B',x:1400,y:488,w:Math.max(168,lc.measureText(p.roles[1]).width),h:89}];
const c=createCanvas(1800,1280),ctx=c.getContext('2d');
for(const [slot,x]of [['A',245],['B',915]])ctx.drawImage(await loadImage(root+`svg/${id}_${slot}.svg`),x,255,590,897);
const {data}=ctx.getImageData(0,0,c.width,c.height);
for(const l of labels){let min=Infinity;let near=null;for(let y=Math.max(0,l.y-150);y<Math.min(c.height,l.y+l.h+150);y++)for(let x=Math.max(0,l.x-150);x<Math.min(c.width,l.x+l.w+150);x++){if(data[(y*c.width+x)*4+3]<30)continue;const dx=Math.max(l.x-x,0,x-(l.x+l.w));const dy=Math.max(l.y-y,0,y-(l.y+l.h));const d=Math.hypot(dx,dy);if(d<min){min=d;near=[x,y];}}results.push({proposal:id,label:l.slot,minEuclideanClearancePixels:Number(min.toFixed(2)),minRequired:32,pass:min>=32,nearestArtPixel:near});}
}
const svgFiles=fs.readdirSync(root+'svg').filter(x=>x.endsWith('.svg'));for(const f of svgFiles){const s=fs.readFileSync(root+'svg/'+f,'utf8');if(/<text\b/.test(s))throw new Error('Text element found in '+f);await loadImage(root+'svg/'+f);}
fs.mkdirSync(root+'qa',{recursive:true});
const out={svgFilesValidated:svgFiles.length,svgVisibleTextElements:0,labels:results,allPassed:results.every(x=>x.pass)};fs.writeFileSync(root+'qa/clearance.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));

if (!out.allPassed) process.exitCode = 1;
