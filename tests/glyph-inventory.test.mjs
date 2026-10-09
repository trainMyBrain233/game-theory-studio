import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';

test('font QA rejects a valid presentation label unsupported by SC cmaps without rewriting authored data',()=>withSourceFixture(root=>{
 const presentationPath=path.join(root,'design/experiments/tabletop/presentation.json');
 const presentation=JSON.parse(fs.readFileSync(presentationPath));presentation.actors.A.name='ع';presentation.actors.B.name='乙';
 fs.writeFileSync(presentationPath,JSON.stringify(presentation));
 const editorial=path.join(root,'chapters/01-four-elements/editorial/zombie-kingdom-r2');
 const unchanged=[presentationPath,path.join(root,'design/scenes.json'),path.join(root,'chapters/01-four-elements/narration/timeline.json'),
  ...fs.readdirSync(editorial).filter(name=>name.endsWith('.json')||name.endsWith('.txt')).map(name=>path.join(editorial,name))];
 const originals=new Map(unchanged.map(filename=>[filename,fs.readFileSync(filename)]));
 const options={cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},maxBuffer:4*1024*1024};
 const probe=spawnSync(pythonCommand(),['-c',`
from pathlib import Path
from fontTools.ttLib import TTFont
for kind in ['Sans', 'Serif']:
    for weight in ['Regular', 'Bold']:
        target = Path('typography/fonts') / f'Noto{kind}CJKSC-{weight}.otf'
        with TTFont(target, lazy=True) as font:
            assert ord('ع') not in font.getBestCmap(), target.name
print('Independent cmap probe: U+0639 is absent from every prepared SC face')
`],options);
 assert.equal(probe.status,0,probe.stdout+probe.stderr);
 const collected=spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {presentationModel} from './design/experiments/tabletop/presentation.mjs';
const view=presentationModel(JSON.parse(fs.readFileSync('design/experiments/tabletop/presentation.json')),JSON.parse(fs.readFileSync('design/scenes.json')));
assert.equal(view.actors.A.name,'ع');assert.equal(view.actors.B.name,'乙');
const {currentPresentationTextRuns}=await import('./typography/text-inventory.mjs');
const {currentGlyphInventory}=await import('./typography/glyph-inventory.mjs');
fs.mkdirSync('typography/qa',{recursive:true});fs.writeFileSync('typography/qa/text-runs.json',JSON.stringify({textRuns:[...currentPresentationTextRuns(),currentGlyphInventory().characters.join('')]}));
await assert.rejects(import('./typography/qa-fonts.mjs'),/missing Chinese glyphs.*ع/s);
`],options);
 assert.equal(collected.status,0,collected.stdout+collected.stderr);
 const checked=spawnSync(pythonCommand(),['scripts/qa_glyphs.py'],options);
 assert.notEqual(checked.status,0,`Presentation glyph escaped QA:\n${checked.stdout}${checked.stderr}`);
 assert.match(checked.stderr,/NotoSansCJKSC-Regular\.otf.*ع/s);
 const runs=JSON.parse(fs.readFileSync(path.join(root,'typography/qa/text-runs.json'))).textRuns;
 assert(runs.includes('ع') && runs.some(text=>text.includes('ع')&&text.length>1),'Inventory must include both the current visible name and resolved current presentation/editorial strings');
 assert(runs.includes('ع选的牌，决定看哪一行。'),'Editorial inventory must resolve current presentation names rather than read stale generated products');
 assert(runs.includes('乙选的牌，决定看哪一列。'));
 for(const [filename,bytes] of originals)assert.deepEqual(fs.readFileSync(filename),bytes,`Glyph QA rewrote ${path.relative(root,filename)}`);
}));
