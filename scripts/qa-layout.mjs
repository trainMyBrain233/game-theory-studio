import fs from 'node:fs';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {TOKENS,DATA,drawScene} from '../design/render-proposals.mjs';
import {checkTextLayout} from './layout.mjs';
import {ROOT} from './python.mjs';

let checked=0;
for(const style of Object.keys(TOKENS.styles)) for(const frame of DATA.frames) {
  const selections=frame.id==='payoff'?[{row:0,column:0},{row:0,column:1},{row:1,column:0},{row:1,column:1}]:[DATA.selected];
  for(const selected of selections) {
    const boxes=drawScene(createCanvas(1920,1080),style,frame.id,{selected});
    checkTextLayout(boxes,1920,1080,{collisions:true});checked++;
  }
}
fs.mkdirSync(path.join(ROOT,'design/qa'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'design/qa/layout.json'),JSON.stringify({framesChecked:checked,textBoundsAndCollisions:'passed',scope:'Static templates only; archived cast mask clearance is checked by qa:cast; full-film transitions require separate acceptance.'},null,2)+'\n');
console.log(`Layout QA: ${checked} template states; measured glyph bounds and pair collisions passed.`);
