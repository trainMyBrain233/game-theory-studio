import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {validateFirstEpisodeTimeline} from '../scripts/validate-data.mjs';
import {pythonCommand} from '../scripts/python.mjs';
import {subtitleMilliseconds,subtitleStamp,subtitleWindows} from '../production/src/subtitle-time.mjs';

const products=['output/game_theory_v2_zh.srt','output/口播参考稿_无真人对齐.txt','output/timeline_resolved.json','narration/exports/game_theory_v2_zh.srt','narration/exports/口播参考稿_无真人对齐.txt'];
const run=(root,extraEnv={})=>spawnSync(process.execPath,['scripts/production.mjs','build_deliverables.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand(),...extraEnv},timeout:30000});
const snapshot=root=>products.map(name=>fs.readFileSync(path.join(root,'production',name)));
function tinyTail(root,duration){
 const file=path.join(root,'chapters/01-four-elements/narration/timeline.json'),timeline=JSON.parse(fs.readFileSync(file));
 const last=timeline.segments.at(-1),previous=timeline.segments.at(-2);
 last.start=last.end-duration;last.voiceover_end=last.end;last.spoken_duration=last.end-last.start;last.pause_after=0;last.display_duration=last.end-last.start;
 previous.end=last.start;previous.pause_after=previous.end-previous.voiceover_end;previous.display_duration=previous.end-previous.start;
 fs.writeFileSync(file,JSON.stringify(timeline));
}

test('SRT rounding carries normally across second, minute and hour boundaries',()=>{
 for(const [seconds,expected] of [[0,'00:00:00,000'],[.0005,'00:00:00,001'],[1.2344,'00:00:01,234'],[1.2345,'00:00:01,235'],[59.9995,'00:01:00,000'],[3599.9995,'01:00:00,000'],[360000,'100:00:00,000']]){
  assert.equal(subtitleStamp(subtitleMilliseconds(seconds)),expected);
 }
 assert.deepEqual(subtitleWindows([{start:0,end:.0005},{start:.0005,end:.0015},{start:.002,end:.003}]),[{start:0,end:1},{start:1,end:2},{start:2,end:3}]);
 // A submillisecond segment is allowed when its rounded endpoints remain distinct.
 assert.deepEqual(subtitleWindows([{start:1.0004,end:1.0006}]),[{start:1000,end:1001}]);
 for(const segments of [[{start:1,end:1.0001}],[{start:0,end:2},{start:1,end:3}],[{start:4,end:5},{start:2,end:3}]])assert.throws(()=>subtitleWindows(segments),/SRT display window/);
 for(const value of [-1,NaN,Infinity,'1',null,1n,Symbol('time'),Number.MAX_VALUE])assert.throws(()=>subtitleMilliseconds(value),/SRT time/);
});

test('actual export CLI rejects quantized-zero windows before creating or overwriting any products',()=>withSourceFixture(root=>{
 const first=run(root);assert.equal(first.status,0,first.stdout+first.stderr);
 const before=snapshot(root);
 for(const duration of [.0001,.0004]){
  tinyTail(root,duration);
  const result=run(root);assert.equal(result.status,1,result.stdout+result.stderr);
  assert.match(result.stderr,/s37_.*SRT display window collapses after millisecond rounding/);
  assert.equal(result.stdout,'');assert.deepEqual(snapshot(root),before);
 }
 fs.rmSync(path.join(root,'production/output'),{recursive:true});fs.rmSync(path.join(root,'production/narration/exports'),{recursive:true});
 const result=run(root);assert.equal(result.status,1);assert.match(result.stderr,/SRT display window collapses/);
 assert(!fs.existsSync(path.join(root,'production/output')));assert(!fs.existsSync(path.join(root,'production/narration/exports')));
}));

test('a late export-path obstruction preserves every already-published production product',()=>withSourceFixture(root=>{
 const first=run(root);assert.equal(first.status,0,first.stdout+first.stderr);
 const before=snapshot(root),last=path.join(root,'production',products.at(-1));
 fs.unlinkSync(last);fs.mkdirSync(last);fs.writeFileSync(path.join(last,'keep'),'user-owned directory');
 // Distinct valid timing ensures any prematurely published product is detectable.
 tinyTail(root,.02);
 const result=run(root);assert.equal(result.status,1,result.stdout+result.stderr);
 assert.match(result.stderr,/regular file/);assert.equal(result.stdout,'');
 for(let i=0;i<products.length-1;i++)assert.deepEqual(fs.readFileSync(path.join(root,'production',products[i])),before[i]);
 assert.deepEqual(fs.readdirSync(last),['keep']);assert.equal(fs.readFileSync(path.join(last,'keep'),'utf8'),'user-owned directory');
}));


test('actual export CLI rolls back all products when a final export rename fails',()=>withSourceFixture(root=>{
 const first=run(root);assert.equal(first.status,0,first.stdout+first.stderr);const before=snapshot(root);
 tinyTail(root,.02);
 const hook=path.join(root,'fail-last-export.mjs');
 fs.writeFileSync(hook,`import fs from 'node:fs';
 const rename=fs.renameSync;let failed=false;
 fs.renameSync=(source,target)=>{
  if(!failed&&String(source).includes('/new/narration/exports/')&&String(target).endsWith('口播参考稿_无真人对齐.txt')){failed=true;throw Error('INJECTED_FINAL_EXPORT_RENAME');}
  return rename(source,target);
 };`);
 const result=run(root,{NODE_OPTIONS:`${process.env.NODE_OPTIONS??''} --import=${hook}`});
 assert.equal(result.status,1,result.stdout+result.stderr);assert.match(result.stderr,/INJECTED_FINAL_EXPORT_RENAME/);assert.equal(result.stdout,'');
 assert.deepEqual(snapshot(root),before);
 assert(!fs.readdirSync(path.join(root,'production')).some(name=>name.startsWith('.publication-')));
}));

function firstBoundary(root,end,start){
 const file=path.join(root,'chapters/01-four-elements/narration/timeline.json'),timeline=JSON.parse(fs.readFileSync(file));
 const [first,second]=timeline.segments;
 first.end=end;first.voiceover_end=end-.1;first.spoken_duration=first.voiceover_end-first.start;
 first.pause_after=first.end-first.voiceover_end;first.display_duration=first.end-first.start;
 second.start=start;second.spoken_duration=second.voiceover_end-second.start;second.display_duration=second.end-second.start;
 // Prove the authored source passes the existing tolerance-aware contract.
 validateFirstEpisodeTimeline(timeline,JSON.parse(fs.readFileSync(path.join(root,'design/scenes.json'))));
 fs.writeFileSync(file,JSON.stringify(timeline));
 return file;
}

test('SRT adjacency is strict after quantization without repairing source timing',()=>{
 assert.throws(()=>subtitleWindows([{start:0,end:1.0004996},{start:1.0005004,end:2}]),/continuous after millisecond rounding \(1000 --> 1001\)/);
 assert.throws(()=>subtitleWindows([{start:0,end:1.0005004},{start:1.0004996,end:2}]),/nonoverlapping after millisecond rounding/);
 for(const [end,start,boundary] of [[1.0004996,1.0004999,1000],[1.0005001,1.0005004,1001]]){
  assert.deepEqual(subtitleWindows([{start:0,end},{start,end:2}]),[{start:0,end:boundary},{start:boundary,end:2000}]);
 }
});

test('actual export CLI rejects tolerance-valid quantized gaps and preserves every product',()=>withSourceFixture(root=>{
 const first=run(root);assert.equal(first.status,0,first.stdout+first.stderr);
 const before=snapshot(root),file=firstBoundary(root,1.0004996,1.0005004),source=fs.readFileSync(file);
 const failed=run(root);assert.equal(failed.status,1,failed.stdout+failed.stderr);
 assert.match(failed.stderr,/s02_four_questions: SRT display windows must be continuous after millisecond rounding \(1000 --> 1001\)/);
 assert.equal(failed.stdout,'');assert.deepEqual(snapshot(root),before);assert.deepEqual(fs.readFileSync(file),source);
 fs.rmSync(path.join(root,'production/output'),{recursive:true});fs.rmSync(path.join(root,'production/narration/exports'),{recursive:true});
 const absent=run(root);assert.equal(absent.status,1);assert.match(absent.stderr,/continuous after millisecond rounding/);
 assert(!fs.existsSync(path.join(root,'production/output')));assert(!fs.existsSync(path.join(root,'production/narration/exports')));
}));

test('actual export CLI keeps default and changed continuous timing exportable',()=>withSourceFixture(root=>{
 const first=run(root);assert.equal(first.status,0,first.stdout+first.stderr);
 const before=snapshot(root);
 for(const [end,start,stamp] of [[1.0004996,1.0004999,'00:00:01,000'],[1.0005001,1.0005004,'00:00:01,001']]){
  const file=firstBoundary(root,end,start),source=fs.readFileSync(file);
  const result=run(root);assert.equal(result.status,0,result.stdout+result.stderr);
  const after=snapshot(root);assert.notDeepEqual(after[0],before[0]);
  const windows=after[0].toString().split('\n').filter(line=>line.includes(' --> '));
  assert.equal(windows[0].split(' --> ')[1],stamp);assert.equal(windows[1].split(' --> ')[0],stamp);
  assert.deepEqual(fs.readFileSync(file),source);
 }
}));
