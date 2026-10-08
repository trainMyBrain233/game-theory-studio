import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {TOKENS,DATA,drawScene} from './render-proposals.mjs';
import {verifySelection} from '../scripts/render-contract.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const results=[];function check(name,ok,details){results.push({name,ok,details});if(!ok)console.error('FAIL',name,details)}
const matrixGeometry={editorial:[976,421,353,184],textbook:[382,496,332,159],bright:[316,444,310,181]};
const ownershipIssues=[],selectionIssues=[];
const lum=h=>{const ch=h.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return ch[0]*.2126+ch[1]*.7152+ch[2]*.0722};
const contrast=(a,b)=>{const l=[lum(a),lum(b)].sort((a,b)=>a-b);return (l[1]+.05)/(l[0]+.05)};
for(const [id,s] of Object.entries(TOKENS.styles)){
 for(const role of ['ink','muted']){let r=contrast(s[role],s.paper);check(`${id}: ${role} contrast ≥ 4.5`,r>=4.5,+r.toFixed(2))}
 const board=await loadImage(path.join(HERE,`boards/${id}_comparison_3840x1320.png`));check(`${id}: board native dimensions`,board.width===3840&&board.height===1320,[board.width,board.height]);
 for(const [index,scene] of DATA.frames.entries()){
  const file=path.join(HERE,`frames/${id}_${scene.id}_1920x1080.png`);let frame=await loadImage(file);check(`${id}/${scene.id}: native 1080p`,frame.width===1920&&frame.height===1080,[frame.width,frame.height]);
  const a=createCanvas(1920,1080),b=createCanvas(1920,1080);a.getContext('2d').drawImage(frame,0,0);b.getContext('2d').drawImage(board,index*1920,200,1920,1080,0,0,1920,1080);
  check(`${id}/${scene.id}: board is pixel-identical and uncropped`,Buffer.compare(Buffer.from(a.data()),Buffer.from(b.data()))===0);
  let bx=drawScene(b,id,scene.id);check(`${id}/${scene.id}: deterministic render`,Buffer.compare(Buffer.from(a.data()),Buffer.from(b.data()))===0);
  const outside=bx.filter(b=>b.x<0||b.y<0||b.x+b.width>1920||b.y+b.height>1080);check(`${id}/${scene.id}: text stays in canvas`,outside.length===0,outside);
  const sub=bx.at(-1);check(`${id}/${scene.id}: subtitle follows configured size`,sub?.size===TOKENS.canvas.subtitleFont,sub?.size);
 }
 // All four possible outcomes should be drawable by the same reusable template.
 for(let r=0;r<2;r++)for(let k=0;k<2;k++){
   let c=createCanvas(1920,1080);let boxes=drawScene(c,id,'payoff',{selected:{row:r,column:k}});
   try{verifySelection(c,boxes,id,DATA,{row:r,column:k},TOKENS.styles[id]);check(`${id}: selection, highlight and explanation [${r},${k}]`,true)}catch(error){check(`${id}: selection, highlight and explanation [${r},${k}]`,false,error.message)}
 }
 const canvas=createCanvas(1920,1080),boxes=drawScene(canvas,id,'payoff');
 const [x,y,w,h]=matrixGeometry[id];
 DATA.payoffs.forEach((row,r)=>row.forEach(([a,b],k)=>{
  if(!boxes.some(box=>box.text===`(${a}, ${b})`&&Math.abs(box.x+box.width/2-(x+w*(k+.5)))<1&&box.y>y+h*r&&box.y+box.height<y+h*(r+1)))ownershipIssues.push(`${id}/${r}/${k}: expected A=${a}, B=${b} in its cell`);
 }));
 try{verifySelection(canvas,boxes,id,DATA,DATA.selected,TOKENS.styles[id]);}catch(error){selectionIssues.push(`${id}: ${error.message}`);}
}
check('Matrix payoff order A then B follows the current case',ownershipIssues.length===0,ownershipIssues);
check('Default highlight follows the configured selection',selectionIssues.length===0,selectionIssues);
const report={runAt:new Date().toISOString(),passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results};fs.writeFileSync(path.join(HERE,'qa/checks.json'),JSON.stringify(report,null,2));console.log(`${report.passed} passed; ${report.failed} failed`);if(report.failed)process.exitCode=1;
