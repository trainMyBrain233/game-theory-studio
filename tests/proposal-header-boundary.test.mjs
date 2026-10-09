import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {pythonCommand} from '../scripts/python.mjs';

test('comparison headings apply each configured title family, including supported variations',()=>{
 const source=`
  import assert from 'node:assert/strict';
  import {TOKENS,drawComparisonHeader} from ${JSON.stringify(new URL('../design/render-proposals.mjs',import.meta.url).href)};
  const drawn=[],stack=[];
  const context={font:'10px sans-serif',save(){stack.push(this.font);},restore(){this.font=stack.pop();},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
   fillText(text){drawn.push({text,font:this.font});},measureText(){const left=this.textAlign==='right'?100:this.textAlign==='center'?50:0;return {width:100,actualBoundingBoxLeft:left,actualBoundingBoxRight:100-left,actualBoundingBoxAscent:40,actualBoundingBoxDescent:10};},getTransform(){return {a:1,b:0,c:0,d:1,e:0,f:0};}};
  const canvas={width:3840,height:1320,getContext(){return context;}};
  for(const id of ['textbook','editorial','bright']){
   const style=TOKENS.styles[id];
   const original=style.titleFamily;
   try{
    for(const family of [original,original==='serif'?'sans':'serif']){
     style.titleFamily=family;drawn.length=0;
     const bounds=drawComparisonHeader(canvas,id),heading=bounds.find(box=>box.text===style.name);
     const expected=TOKENS.font[family];
     assert.equal(heading.family,expected,id+' '+family);
     assert.equal(heading.size,62);assert.equal(heading.weight,700);
     assert.equal(drawn.find(item=>item.text===style.name).font,'700 62px "'+expected+'"');
     assert.equal(bounds.find(box=>box.text===style.subtitle).family,TOKENS.font.sans);
    }
   }finally{style.titleFamily=original;}
  }
 `;
 const result=spawnSync(process.execPath,['--loader',new URL('./fixtures/proposal-header-stubs-loader.mjs',import.meta.url).pathname,'--input-type=module','-e',source],{cwd:os.tmpdir(),encoding:'utf8',timeout:30000,env:{...process.env,PYTHON:pythonCommand()}});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
