import '../scripts/isolated-fonts.mjs';
import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {rebuildNarration} from './fixtures/animatic/rebuild-narration.mjs';
import {createRenderSession as rawCreateRenderSession,PUBLIC_AVATAR_TRACKS,COLORS,drawResolvedSubtitle} from '../production/src/animatic/render-frame.mjs';
import {syntheticCast} from './fixtures/animatic/synthetic-cast.mjs';
import {assertRasterClearance} from '../scripts/animatic-public-smoke.mjs';
const renderedSurfaces=[];
const createRenderSession=options=>{const session=rawCreateRenderSession(options);return Object.freeze({...session,render:frame=>{const result=session.render(frame);renderedSurfaces.push(result);return result;}});};
afterEach(()=>{for(const result of renderedSurfaces)result.dispose();renderedSurfaces.length=0;});
const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/animatic/minimal-plan.json',import.meta.url),'utf8'));
const pixel=(rendered,x,y)=>Array.from(rendered.canvas.getContext('2d').getImageData(x,y,1,1).data);
const rgb=color=>[...color.slice(1).matchAll(/../g)].map(match=>parseInt(match[0],16)).concat(255);
const crop=(rendered,x,y,w,h)=>createHash('sha256').update(rendered.canvas.getContext('2d').getImageData(x,y,w,h).data).digest('hex');
const session=createRenderSession({plan:fixture(),adapters:syntheticCast()});
// A source fixture deliberately has no .venv. Bind the parent's configured
// interpreter explicitly instead of accidentally relying on runner-global pip.
const pythonProbe=spawnSync(pythonCommand(),['-c','import sys; print(sys.executable)'],{encoding:'utf8'});
assert.equal(pythonProbe.status,0,pythonProbe.stderr);
const projectPython=pythonProbe.stdout.trim();assert(path.isAbsolute(projectPython),'Project Python must resolve to an absolute executable');
const compositorCode="import fs from 'node:fs'; import {createRenderSession} from './production/src/animatic/render-frame.mjs'; import {syntheticCast} from './tests/fixtures/animatic/synthetic-cast.mjs'; const result=createRenderSession({plan:JSON.parse(fs.readFileSync('tests/fixtures/animatic/minimal-plan.json')),adapters:syntheticCast()}).render(0);result.dispose();";
const runFixture=(root,env)=>spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',compositorCode],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,env});
const runCompositorFixture=(root,env)=>runFixture(root,{...env,PYTHON:projectPython});
let isolatedPythonDirectory,isolatedEnvironment;
function noGlobalFontToolsEnvironment(){
 if(isolatedEnvironment)return isolatedEnvironment;
 isolatedPythonDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'animatic-bare-python-'));
 const created=spawnSync(projectPython,['-m','venv','--without-pip',isolatedPythonDirectory],{encoding:'utf8'});
 assert.equal(created.status,0,created.stdout+created.stderr);
 const bin=path.join(isolatedPythonDirectory,process.platform==='win32'?'Scripts':'bin');
 isolatedEnvironment={...process.env,PATH:bin+path.delimiter+(process.env.PATH||''),PYTHONNOUSERSITE:'1'};
 for(const key of ['PYTHON','PYTHONPATH','PYTHONHOME','VIRTUAL_ENV'])delete isolatedEnvironment[key];
 const check=spawnSync('python3',['-c','import fontTools'],{encoding:'utf8',env:isolatedEnvironment});
 assert.notEqual(check.status,0,'Fallback interpreter must genuinely lack global/user fontTools');
 assert.match(check.stderr,/No module named ['"]fontTools['"]/);
 return isolatedEnvironment;
}
after(()=>{if(isolatedPythonDirectory)fs.rmSync(isolatedPythonDirectory,{recursive:true,force:true});});


test('resolved matrix renders each active cell from current phase and only event-revealed numbers',()=>{
 for(const [frame,cell] of [[69,null],[70,'RR'],[119,'RR'],[120,null],[140,'RB'],[200,null],[220,'RR'],[240,null],[260,'RB'],[280,null]]){
  const rendered=session.render(frame);assert.equal(rendered.state.activeCell,cell);
  for(const [index,key] of ['RR','RB','BR','BB'].entries()){
   const x=740+(index%2)*470,y=430+Math.floor(index/2)*170;
   assert.deepEqual(pixel(rendered,x+5,y+35),rgb(key===cell?COLORS.ink:((frame>=200&&frame<280&&index<2)?COLORS.faint:COLORS.paper)),`actual cell border ${key} at ${frame}`);
  }
 }
 assert.equal(session.render(89).textRecords.filter(record=>record.role.startsWith('score:')).length,0);
 assert.deepEqual(session.render(90).textRecords.filter(record=>record.role.startsWith('score:')).map(record=>record.text),['2']);
 assert.deepEqual(session.render(170).textRecords.filter(record=>record.role.startsWith('score:')).map(record=>record.text),['2','7','1','9']);
});
test('all four cells and asymmetric owner slots render for a replaced numeric case',()=>{
 const plan=fixture();const first=plan.blocks[1],second=plan.blocks[2];
 for(const block of [first,second])for(const phase of block.subtitles)phase.focus.expectedCell=block===first?'BR':'BB';
 for(const block of [first,second])for(const event of block.events)event.cell=block===first?'BR':'BB';
 first.subtitles[0].lines=['甲方选蓝，乙方选红。'];first.subtitles[1].lines=['甲方得八分，乙方得零分。'];
 second.subtitles[0].lines=['两位都选蓝牌。'];second.subtitles[1].lines=['甲方得四分，乙方得六分。'];
 for(const [index,phase] of plan.blocks[3].subtitles.entries()){phase.focus.expectedCell=index?'BB':'BR';phase.focus.rowChoice='blue';phase.lines=[index?'对方选蓝，甲方得四分。':'对方选红，甲方得八分；'];plan.blocks[3].events[index].cell=phase.focus.expectedCell;}
 rebuildNarration(plan);
 const changed=createRenderSession({plan,adapters:syntheticCast()});
 const state=changed.render(170);assert.deepEqual(state.textRecords.filter(record=>record.role.startsWith('score:')).map(record=>[record.role,record.text]),[['score:BR:0','8'],['score:BR:1','0'],['score:BB:0','4'],['score:BB:1','6']]);
 assert.deepEqual(pixel(changed.render(70),745,635),rgb(COLORS.ink));assert.deepEqual(pixel(changed.render(140),1215,635),rgb(COLORS.ink));
});
test('joint reveal card pixels and information labels agree before/during/after opening',()=>{
 const before=session.render(19),middle=session.render(30),after=session.render(40),hidden=session.render(50);
 assert.deepEqual(pixel(before,100,250),rgb(COLORS.faint));assert.deepEqual(pixel(hidden,100,250),rgb(COLORS.faint));
 assert.deepEqual(pixel(after,100,250),rgb(COLORS.red));assert.notDeepEqual(pixel(middle,100,250),pixel(before,100,250));assert.notDeepEqual(pixel(middle,100,250),pixel(after,100,250));
 assert.equal(before.textRecords.find(record=>record.role==='information').text,'选牌时：看不到对方选择');
 assert.equal(middle.textRecords.find(record=>record.role==='information').text,'正在一起亮牌');
 assert.equal(after.textRecords.find(record=>record.role==='information').text,'亮牌后：双方可见');
});
test('full one/two-line subtitle raster persists through transitions and tail frames',()=>{
 const expected=crop(session.render(0),0,936,1920,144);
 for(const frame of [1,19,20,30,40,49,50,59])assert.equal(crop(session.render(frame),0,936,1920,144),expected);
 const plan=fixture();plan.blocks[0].subtitles[0].lines=['甲方和乙方各自选牌，','一起亮牌。'];
 const two=createRenderSession({plan,adapters:syntheticCast()});
 const first=two.render(0),last=two.render(59);assert.equal(crop(first,0,936,1920,144),crop(last,0,936,1920,144));
 assert.equal(last.textRecords.filter(record=>record.role==='subtitle').length,2);
 assert(last.textRecords.filter(record=>record.role==='subtitle').every(record=>/^700 40px "GameTheory Noto Sans SC Animatic [a-f0-9]{64}"$/.test(record.font)));
});
test('actual avatar alpha and every visible text role have clearance on all motion frames',()=>{
 const adapters=syntheticCast(),current=createRenderSession({plan:fixture(),adapters});
 for(let frame=0;frame<=51;frame++){const rendered=current.render(frame);assertRasterClearance(rendered,adapters);rendered.dispose();}
 const bad=structuredClone(PUBLIC_AVATAR_TRACKS);bad.A.to.x=345;
 const colliding=createRenderSession({plan:fixture(),adapters,tracks:bad});
 assert.throws(()=>assertRasterClearance(colliding.render(50),adapters),/clearance/);
});
test('replacement names/strategies are used in actual fonts, labels and fingerprints',()=>{
 const plan=fixture();plan.caseData.players.A.name='参与甲';plan.caseData.players.B.name='参与乙';plan.caseData.strategies={red:'合作',blue:'退出'};
 for(const block of plan.blocks){block.voiceover=block.voiceover.replaceAll('甲方','参与甲').replaceAll('乙方','参与乙');for(const phase of block.subtitles)phase.lines=phase.lines.map(line=>line.replaceAll('甲方','参与甲').replaceAll('乙方','参与乙'));}
 rebuildNarration(plan);
 const next=createRenderSession({plan,adapters:syntheticCast()}),rendered=next.render(100);
 assert.notEqual(next.fingerprint,session.fingerprint);assert(rendered.textRecords.some(record=>record.role==='name:A'&&record.text==='参与甲'));
 assert(rendered.textRecords.some(record=>record.role==='column:red'&&record.text==='合作'));
 assertRasterClearance(rendered,syntheticCast());
});
test('provider identity, truthful full alpha bounds and complete resources are mandatory',()=>{
 const adapters=syntheticCast();adapters.A.id='B';assert.throws(()=>createRenderSession({plan:fixture(),adapters}),/identity/);
 const wrong=syntheticCast();wrong.A.alphaBounds={x:0,y:0,width:96,height:112};assert.throws(()=>createRenderSession({plan:fixture(),adapters:wrong}),/alphaBounds/);
 assert.throws(()=>createRenderSession({plan:fixture(),adapters:{A:syntheticCast().A}}),/Exactly A and B/);
});

test('four- and six-character actor names fit measured slots at the requested 36px',()=>{
 for(const [nameA,nameB] of [['原创甲方','原创乙方'],['公共示例甲方','公共示例乙方']]){
  const plan=fixture();plan.caseData.players.A.name=nameA;plan.caseData.players.B.name=nameB;
  for(const block of plan.blocks){block.voiceover=block.voiceover.replaceAll('甲方',nameA).replaceAll('乙方',nameB);for(const phase of block.subtitles)phase.lines=phase.lines.map(line=>line.replaceAll('甲方',nameA).replaceAll('乙方',nameB));}
  plan.blocks[0].subtitles[0].lines=[`${nameA}和${nameB}各自选牌，`,'一起亮牌。'];
  const rendered=createRenderSession({plan,adapters:syntheticCast()}).render(0);
  assert(rendered.textRecords.filter(record=>record.role.startsWith('name:')).every(record=>record.size===36&&record.weight===700&&/^GameTheory Noto Sans SC Animatic [a-f0-9]{64}$/.test(record.family)));
  assertRasterClearance(rendered,syntheticCast());rendered.dispose();
 }
});
test('otherwise valid long actor name is rejected with role, requested size and measured ink',()=>{
 const plan=fixture(),name='公共测试参与者甲';plan.caseData.players.A.name=name;
 for(const block of plan.blocks){block.voiceover=block.voiceover.replaceAll('甲方',name);for(const phase of block.subtitles)phase.lines=phase.lines.map(line=>line.replaceAll('甲方',name));}
 const next=createRenderSession({plan,adapters:syntheticCast()});
 assert.throws(()=>next.render(0),/Text layout slot overflow: name:A; 36px; measured ink/);
});
test('long strategy column labels and punctuation-rich subtitle lines fail measured slots without shrinking',()=>{
 const plan=fixture();plan.caseData.strategies.red='这是无法放入固定列标题区域的策略名称';plan.blocks=[plan.blocks[0]];plan.durationFrames=60;
 assert.throws(()=>createRenderSession({plan,adapters:syntheticCast()}).render(0),/Text layout slot overflow: column:red; 36px/);
 const canvas=createCanvas(1920,1080),mask=createCanvas(1920,1080);
 assert.throws(()=>drawResolvedSubtitle(canvas.getContext('2d'),mask.getContext('2d'),[],{caption:{lines:['，'.repeat(50)]}},session.fontFamily),/Text layout slot overflow: subtitle; 40px/);canvas.width=mask.width=1;
});
test('actual subtitle alpha ink has the expected 40px font-scale height',()=>{
 const rendered=session.render(0),ctx=rendered.textMask.getContext('2d');
 const pixels=ctx.getImageData(0,936,1920,144).data;let min=144,max=-1;
 for(let y=0;y<144;y++)for(let x=0;x<1920;x++)if(pixels[(y*1920+x)*4+3]){min=Math.min(min,y);max=Math.max(max,y);}
 assert(max-min+1>=35 && max-min+1<=44,`Actual subtitle ink is ${max-min+1}px high`);
 const record=rendered.textRecords.find(record=>record.role==='subtitle');assert(record.height>=35&&record.height<=44);rendered.dispose();
});

test('source fixtures bind project Python when the global fallback has no fontTools',()=>{
 withSourceFixture(root=>{
  assert(!fs.existsSync(path.join(root,'.venv')),'The fixture must not acquire its own virtual environment');
  const environment=noGlobalFontToolsEnvironment();
  const unbound=runFixture(root,environment);
  assert.notEqual(unbound.status,0);assert.match(unbound.stdout+unbound.stderr,/Missing fontTools/,'Omitting PYTHON must reproduce the clean-runner failure');
  const bound=runCompositorFixture(root,environment);
  assert.equal(bound.status,0,bound.stdout+bound.stderr);
 });
});

for(const [label,from,to,reason] of [
 ['tiny applied subtitle font','ctx.font=requestedFont;','ctx.font=`${weight} ${role==="subtitle"?8:size}px "${fontFamily}"`;',/Applied canvas font size must be 40px/],
 ['regular applied subtitle weight','ctx.font=requestedFont;','ctx.font=`${role==="subtitle"?400:weight} ${size}px "${fontFamily}"`;',/Applied canvas font weight must be 700/],
 ['wrong applied subtitle family','ctx.font=requestedFont;',"ctx.font=role==='subtitle'?'700 40px \"Other SC\"':requestedFont;",/Applied canvas font family must be GameTheory Noto Sans SC Animatic/],
 ['shifted subtitle ink','line,960,lines.length===1?', 'line,1740,lines.length===1?',/Text layout slot overflow: subtitle/],
 ['shifted column ink','x+cw*(index+.5),388,36','650,528,36',/Text layout slot overflow: column:red/],
 ['shifted legend ink',',1210,855,30',',1800,855,30',/Text layout slot overflow: legend/],
])test(`real compositor rejects ${label}`,()=>{
 withSourceFixture(root=>{
  const file=path.join(root,'production/src/animatic/render-frame.mjs'),source=fs.readFileSync(file,'utf8');assert(source.includes(from),`Mutation anchor missing: ${label}`);fs.writeFileSync(file,source.replace(from,to));
  const result=runCompositorFixture(root,noGlobalFontToolsEnvironment());
  assert.doesNotMatch(result.stdout+result.stderr,/Missing fontTools|font provenance failed/,`${label} must reach its intended compositor assertion`);
  assert.notEqual(result.status,0,`${label} unexpectedly passed`);assert.match(result.stdout+result.stderr,reason);
 });
});

test('all four revealed card combinations draw their explicitly owned face pixels',()=>{
 for(const [cell,choices] of [['RR',{A:'red',B:'red'}],['RB',{A:'red',B:'blue'}],['BR',{A:'blue',B:'red'}],['BB',{A:'blue',B:'blue'}]]){
  const plan=fixture();Object.assign(plan.blocks[0].events[0],{cell,choices});const next=createRenderSession({plan,adapters:syntheticCast()});
  for(const frame of [19,20,30,39,40,41,49,50]){
   const rendered=next.render(frame);
   for(const [owner,x] of [['A',100],['B',230]]){
    const actual=pixel(rendered,x,250);
    if(frame<=20||frame>=50)assert.deepEqual(actual,rgb(COLORS.faint),`${cell}/${owner} hidden at ${frame}`);
    else if(frame>=40)assert.deepEqual(actual,rgb(COLORS[choices[owner]]),`${cell}/${owner} revealed at ${frame}`);
    else {assert.notDeepEqual(actual,rgb(COLORS.faint));assert.notDeepEqual(actual,rgb(COLORS[choices[owner]]));}
   }
   assert.equal(rendered.state.information.cell,frame>=20&&frame<50?cell:null);rendered.dispose();
  }
 }
});

test('missing requested glyphs are rejected before the actual compositor can emit tofu',()=>{
 for(const title of ['缺字'+String.fromCodePoint(0x10ffff),'未知字'+String.fromCodePoint(0x31350)])assert.throws(()=>createRenderSession({plan:fixture(),adapters:syntheticCast(),title}),/unsupported glyphs/);
 const plan=fixture();plan.caseData.players.A.name='甲'+String.fromCodePoint(0x31350);rebuildNarration(plan);assert.throws(()=>createRenderSession({plan,adapters:syntheticCast()}),/unsupported glyphs/);
 const ctx=createCanvas(100,100).getContext('2d');ctx.font=`700 40px "${session.fontFamily}"`;ctx.fillStyle='#243E66';ctx.fillText(String.fromCodePoint(0x10ffff),10,60);
 // The backend can draw visible replacement ink despite a valid font string.
 // Cmap rejection, not merely nonzero extent or ctx.font equality, prevents it.
 const data=ctx.getImageData(0,0,100,100).data;assert(data.some((value,index)=>index%4===3&&value>0));ctx.canvas.width=1;
});

test('real SC ink proves a supported Hangul filler cannot create a distinct visible label',()=>{
 const canvas=createCanvas(300,100),ctx=canvas.getContext('2d');ctx.font=`700 36px "${session.fontFamily}"`;ctx.fillStyle='#243E66';
 ctx.fillText('甲方',10,50);const first=Buffer.from(ctx.getImageData(0,0,300,100).data),baseWidth=ctx.measureText('甲方').width;
 ctx.clearRect(0,0,300,100);ctx.fillText('甲方\u3164',10,50);const second=Buffer.from(ctx.getImageData(0,0,300,100).data);
 assert.deepEqual(second,first,'Filler has a cmap entry but contributes no visible ink');assert(ctx.measureText('甲方\u3164').width>baseWidth,'Advance width is not visible identity');canvas.width=1;
 const plan=fixture();plan.caseData.players.B.name='甲方\u3164';rebuildNarration(plan);assert.throws(()=>createRenderSession({plan,adapters:syntheticCast()}),/default-ignorable/);
 assert.throws(()=>createRenderSession({plan:fixture(),adapters:syntheticCast(),title:'\u3164'}),/invisible controls/);
});
