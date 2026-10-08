import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {TOKENS,DATA,drawScene} from './render-proposals.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const results=[];function check(name,ok,details){results.push({name,ok,details});if(!ok)console.error('FAIL',name,details)}
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
  const sub=bx.find(b=>b.text===scene.subtitle);check(`${id}/${scene.id}: subtitle size 40px`,sub?.size===40,sub?.size);
 }
 // All four possible outcomes should be drawable by the same reusable template.
 for(let r=0;r<2;r++)for(let k=0;k<2;k++){
   let c=createCanvas(1920,1080),[a,b]=DATA.payoffs[r][k];let boxes=drawScene(c,id,'payoff',{selected:{row:r,column:k},subtitle:`小A得${a}分，小B得${b}分。`});
   check(`${id}: selectable payoff [${r},${k}]`,boxes.some(x=>x.text===`(${a}, ${b})`));
 }
}
check('Matrix payoff order A then B',JSON.stringify(DATA.payoffs)==='[[[3,3],[0,5]],[[5,0],[1,1]]]');
check('Default highlight: A red / B blue → (0,5)',DATA.selected.row===0&&DATA.selected.column===1&&DATA.payoffs[0][1][0]===0&&DATA.payoffs[0][1][1]===5);
const report={runAt:new Date().toISOString(),passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results};fs.writeFileSync(path.join(HERE,'qa/checks.json'),JSON.stringify(report,null,2));console.log(`${report.passed} passed; ${report.failed} failed`);if(report.failed)process.exitCode=1;
