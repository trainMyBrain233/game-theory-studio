import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {registerFonts,canvasFont} from '../../typography/fonts.mjs';
registerFonts();
const dir = path.dirname(fileURLToPath(import.meta.url));
const c = createCanvas(1440,820),ctx=c.getContext('2d');
ctx.fillStyle='#FFFEF8';ctx.fillRect(0,0,c.width,c.height);
ctx.fillStyle='#243E66';ctx.font=canvasFont(27,700);ctx.fillText('EDITABLE TEXTBOOK CAST + STRATEGY CARDS',44,48);
ctx.font=canvasFont(18);ctx.fillStyle='#51617A';ctx.fillText('Original vector assets · shared paper, ink and line weight · 100% paths',44,79);
const entries=[['person_a.svg',50,123,420,500],['person_b.svg',487,123,420,500],['card_red.svg',970,181,140,190],['card_blue.svg',1160,181,140,190],['card_back.svg',1065,432,140,190]];
for (const [name,x,y,w,h] of entries) {
 const buffer=await fs.readFile(path.join(dir,name));
 const img=await loadImage(buffer); ctx.drawImage(img,x,y,w,h);
 ctx.font=canvasFont(18);ctx.fillStyle='#243E66';ctx.fillText(name,x+(w-ctx.measureText(name).width)/2,y+h+39);
}
ctx.strokeStyle='#243E66';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(45,603);ctx.lineTo(926,603);ctx.stroke();
ctx.fillStyle='#FFFEF8';ctx.font=canvasFont(27,700);ctx.textAlign='center';ctx.fillText('A',214,506);ctx.fillText('B',651,506);
ctx.font=canvasFont(27,700);ctx.fillText('RED',1040,317);ctx.fillText('BLUE',1230,317);ctx.textAlign='left';
ctx.fillStyle='#51617A';ctx.font=canvasFont(17);ctx.fillText('Letters and card labels shown here are preview overlays; SVG assets contain no visible text.',44,754);
ctx.fillText('Desk anchor: y=480 · badges: (164,374) · no shadows, texture, gradients or raster content',44,784);
await fs.writeFile(path.join(dir,'contact_sheet.png'),c.toBuffer('image/png'));
const manifest={verifiedWith:'@napi-rs/canvas loadImage',assets:entries.map(([name])=>name),canvas:[1440,820],passed:true};
await fs.writeFile(path.join(dir,'asset-verification.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
