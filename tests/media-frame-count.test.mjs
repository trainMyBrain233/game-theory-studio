import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {videoFrameCount} from '../production/src/render-options.mjs';
import {ROOT,pythonCommand} from '../scripts/python.mjs';

const cases=JSON.parse(fs.readFileSync(new URL('./fixtures/video-frame-count-contract.json',import.meta.url),'utf8'));
const number=value=>value?.nonFinite?Number(value.nonFinite):value;
const result=({seconds,fps})=>{
 try{return {frames:videoFrameCount(number(seconds),number(fps))};}
 catch{return {error:true};}
};
const expected=fixture=>fixture.error?{error:true}:{frames:fixture.frames};

for(const fixture of cases)test(`JS encoder frame contract: ${fixture.name}`,()=>{
 assert.deepEqual(result(fixture),expected(fixture));
});

test('Python metadata QA and the JS encoder agree on every shared frame-count boundary',()=>{
 const code=`import json,sys
sys.path.insert(0, 'production/qa')
from media_contract import video_frame_count
def number(value):
    return float(value['nonFinite']) if isinstance(value, dict) and 'nonFinite' in value else value
results=[]
for fixture in json.load(sys.stdin):
    try:
        results.append({'frames':video_frame_count(number(fixture['seconds']), number(fixture['fps']))})
    except ValueError:
        results.append({'error':True})
print(json.dumps(results))`;
 const run=spawnSync(pythonCommand(),['-c',code],{cwd:ROOT,input:JSON.stringify(cases),encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const actual=JSON.parse(run.stdout);
 assert.deepEqual(actual,cases.map(expected));
 assert.deepEqual(actual,cases.map(result));
 assert.equal(videoFrameCount(.15),5);
});
