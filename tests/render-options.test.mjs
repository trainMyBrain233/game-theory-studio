import test from 'node:test';
import assert from 'node:assert/strict';
import {renderOptions} from '../production/src/render-options.mjs';
test('render CLI has explicit finite episode windows and native dimensions',()=>{
 assert.equal(renderOptions([],173.3).duration,173.3);
 assert.ok(Math.abs(renderOptions(['--start','170','--out','segment.mp4'],173.3).duration-3.3)<1e-8);
 assert.equal(renderOptions(['--preview','--width','3840'],173.3).height,2160);
 assert.deepEqual(renderOptions(['--stills','--times','0,27,172'],173.3).times,[0,27,172]);
});
for(const args of [['--width','8'],['--width','NaN'],['--times','27'],['--duration','0'],['--duration','Infinity'],['--start','-1'],['--start','170','--duration','4'],['--stills','--times','-1'],['--stills','--times','173.3'],['--stills','--times','1,'],['--stills','--times','1,1.001'],['--stills','--out','x'],['--preview','--stills'],['--width'],['--width','1920','--width','3840'],['--unknown']])test(`render CLI rejects ${JSON.stringify(args)}`,()=>assert.throws(()=>renderOptions(args,173.3)));
