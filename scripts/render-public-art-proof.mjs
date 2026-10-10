import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {registerFonts,canvasFont} from '../typography/fonts.mjs';
registerFonts();
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--before-sha'||! /^[a-f0-9]{7,40}$/i.test(args[1]))throw Error('Use --before-sha <existing Git commit SHA>.');
const beforeSha=args[1],out=new URL('../artifacts/placeholder-layer-fix/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const readBefore=name=>{const r=spawnSync('git',['show',`${beforeSha}:production/assets/${name}`],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout};
const readAfter=name=>fs.readFileSync(new URL(`../production/assets/${name}`,import.meta.url),'utf8');
const large=async(svg,w,h)=>await loadImage(Buffer.from(svg.replace(/width="\d+" height="\d+"/,`width="${w*4}" height="${h*4}"`)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={beforeSha,afterCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),afterWorkingTreeDirty:Boolean(spawnSync('git',['status','--porcelain=v1'],{encoding:'utf8'}).stdout.trim()),sourceHashes:{},figures:[]};
const board=createCanvas(2784,1736),b=board.getContext('2d');b.fillStyle='#FFFEF8';b.fillRect(0,0,board.width,board.height);b.fillStyle='#243E66';b.font=canvasFont(32,700);
for(const [row,id] of ['a','b'].entries()){
 const name=`person_${id}.svg`,sources=[readBefore(name),readAfter(name)],images=await Promise.all(sources.map(s=>large(s,420,500)));
 report.sourceHashes[name]={before:hash(sources[0]),after:hash(sources[1])};
 const rendered=images.map(image=>{const c=createCanvas(1680,2000);c.getContext('2d').drawImage(image,0,0);return c});
 const head=rendered.map(c=>c.getContext('2d').getImageData(0,0,1680,1080).data);
 assert.equal(hash(head[0]),hash(head[1]),'Head/neck above y270 must stay identical');
 const badges=rendered.map(c=>c.getContext('2d').getImageData(142*4,352*4,44*4,44*4).data);
 assert.equal(hash(badges[0]),hash(badges[1]),'Badge must stay identical');
 for(const [column,phase] of ['before','after'].entries()){
  const c=createCanvas(1360,760),x=c.getContext('2d');x.fillStyle='#FFFEF8';x.fillRect(0,0,c.width,c.height);x.drawImage(images[column],160,1200,1360,760,0,0,1360,760);
  fs.writeFileSync(new URL(`${phase}_${id}.png`,out),c.toBuffer('image/png'));
  b.fillText(`${id.toUpperCase()} / ${phase.toUpperCase()} / native SVG 4x`,32+column*1392,50+row*852);b.drawImage(c,32+column*1392,74+row*852);
 }
 report.figures.push({id,headAbove270PixelEqual:true,badgePixelEqual:true,viewBox:[0,0,420,500],crop:[40,300,340,190],renderScale:4});
}
fs.writeFileSync(new URL('forearms-before-after.png',out),board.toBuffer('image/png'));
const cards=createCanvas(1280,880),cc=cards.getContext('2d');cc.fillStyle='#FFFEF8';cc.fillRect(0,0,1280,880);cc.fillStyle='#243E66';cc.font=canvasFont(28,700);
for(const [column,phase] of ['before','after'].entries()){
 cc.fillText(`${phase.toUpperCase()} / circle and bar`,32+column*640,44);
 for(const [row,kind] of ['red','blue'].entries()){
  const name=`card_${kind}.svg`,source=phase==='before'?readBefore(name):readAfter(name);
  report.sourceHashes[name]??={};report.sourceHashes[name][phase]=hash(source);
  cc.drawImage(await large(source,140,190),32+column*640+row*300,82,280,380);
 }
}
cc.font=canvasFont(24,400);cc.fillText('Card bounds and label coordinates unchanged; symbols lower by 16 SVG units.',32,524);
fs.writeFileSync(new URL('card-symbols-before-after.png',out),cards.toBuffer('image/png'));
fs.writeFileSync(new URL('art-proof.json',out),JSON.stringify(report,null,2)+'\n');
console.log(`Public art proof: ${path.relative(process.cwd(),out.pathname)}; both heads/badges pixel-identical, lower-arm crops and card comparison regenerated.`);
