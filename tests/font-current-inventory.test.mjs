import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';

test('real complete TTC missing current non-specimen Chinese is rejected before native registration or renderer output',()=>withSourceFixture(root=>{
 const directory=path.join(root,'typography/fonts');fs.unlinkSync(directory);fs.mkdirSync(directory);
 const options={cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},timeout:120000,maxBuffer:4*1024*1024};
 const generated=spawnSync(pythonCommand(),['-c',`
import sys,json
from pathlib import Path
sys.path.insert(0,'tests')
from test_notdef_glyph_coverage import make_face,setup_fonts,TTCollection,TTFont
root=Path('typography/fonts'); manifest={}
for kind in ['Sans','Serif']:
 for weight in ['Regular','Bold']:
  face=make_face(kind,weight)
  if (kind,weight)==('Sans','Regular'):
   for table in face['cmap'].tables:
    if table.isUnicode():
     for c in '声誉': table.cmap.pop(ord(c),None)
  collection=TTCollection();collection.fonts=[face]
  source=(root/f'{kind}-{weight}.ttc').resolve();collection.save(source);collection.close()
  target=root/f'Noto{kind}CJKSC-{weight}.otf'
  # Exact previous short first-use repertoire, preserving real TTC provenance.
  manifest[target.name]=setup_fonts.prepare(source,target,kind,weight,'博弈论入门参与者信息策略收益每种组合各得什么选择规则红蓝')
target=root/'NotoSansCJKSC-Regular.otf'; before=target.read_bytes()
target.write_bytes(b'previous prepared target')
try:
 setup_fonts.prepare((root/'Sans-Regular.ttc').resolve(),target,'Sans','Regular')
 raise RuntimeError('Missing current Chinese passed preparation')
except ValueError as error:
 assert '声' in str(error) and '誉' in str(error),str(error)
assert target.read_bytes()==b'previous prepared target'
assert not target.with_suffix('.tmp.otf').exists()
target.write_bytes(before)
try:
 setup_fonts.verify_cached(target,'Sans','Regular',manifest[target.name])
 raise RuntimeError('Missing current Chinese passed cached verification')
except ValueError as error:
 assert '声' in str(error) and '誉' in str(error),str(error)
assert target.read_bytes()==before
(root/'prepared_font_manifest.json').write_text(json.dumps(manifest))
with TTFont(root/'NotoSansCJKSC-Regular.otf') as font:
 assert ord('声') not in font.getBestCmap() and ord('誉') not in font.getBestCmap()
 assert len(font.getGlyphOrder())>=20000
`],options);
 assert.equal(generated.status,0,generated.stdout+generated.stderr);
 const setup=path.join(root,'scripts/setup_fonts.py'),source=fs.readFileSync(setup,'utf8');
 const prior=path.join(root,'prior-output.png');fs.writeFileSync(prior,'previous output');
 const run=code=>spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',code],options);
 fs.writeFileSync(setup,source.replace('for c in required_characters if ord(c) not in cmap',"for c in '博弈论入门参与者信息策略收益每种组合各得什么选择规则红蓝' if ord(c) not in cmap"));
 const old=run(`import {GlobalFonts} from '@napi-rs/canvas'; await import('./design/render-proposals.mjs'); if(!GlobalFonts.has('GameTheory Noto Sans SC'))throw Error('Old control did not register');`);
 assert.equal(old.status,0,old.stdout+old.stderr);
 fs.writeFileSync(setup,source);
 const manifest=fs.readFileSync(path.join(directory,'prepared_font_manifest.json'));
 const fixed=run(`import assert from 'node:assert/strict';import fs from 'node:fs';import {GlobalFonts} from '@napi-rs/canvas';
await assert.rejects(import('./design/render-proposals.mjs'),/missing Chinese glyphs.*声.*誉/s);
assert.equal(GlobalFonts.has('GameTheory Noto Sans SC'),false);assert.equal(GlobalFonts.has('GameTheory Noto Serif SC'),false);
assert.equal(fs.readFileSync('prior-output.png','utf8'),'previous output');`);
 assert.equal(fixed.status,0,fixed.stdout+fixed.stderr);
 assert.deepEqual(fs.readFileSync(path.join(directory,'prepared_font_manifest.json')),manifest);
}));

test('byte-current shared inventory includes changed labels and astral characters with stable cache identity',()=>withSourceFixture(root=>{
 const run=spawnSync(process.execPath,['--input-type=module','-e',`
import assert from 'node:assert/strict';import fs from 'node:fs';import {currentGlyphInventory} from './typography/glyph-inventory.mjs';
const original=currentGlyphInventory();assert.equal(currentGlyphInventory(),original);
for(const directory of ['design/qa','design/experiments/tabletop/output','assets/characters/archive/proposals/qa']){fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(directory+'/checks.json',JSON.stringify({error:'𐀀generated-report-only'}));}
assert.equal(currentGlyphInventory(),original,'Generated QA/review JSON must not change inventory or signature');
fs.appendFileSync('production/src/scenes.mjs','\\n// changed authored renderer literal: 声誉\\n');
const rendererChanged=currentGlyphInventory();assert.notEqual(rendererChanged.signature,original.signature);assert(rendererChanged.characters.includes('誉'));

const file='design/experiments/tabletop/presentation.json',before=fs.statSync(file),data=JSON.parse(fs.readFileSync(file));
data.actors.A.name='𠀀';fs.writeFileSync(file,JSON.stringify(data));fs.utimesSync(file,before.atime,before.mtime);
const changed=currentGlyphInventory();assert.notEqual(changed.signature,original.signature);assert(changed.characters.includes('𠀀'));assert(!changed.characters.includes('\\ud840'));assert.equal(currentGlyphInventory(),changed);
const {registerFonts}=await import('./typography/fonts.mjs');assert.throws(()=>registerFonts({serif:true}),/missing Chinese glyphs.*𠀀/s);
`],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()}});
 assert.equal(run.status,0,run.stdout+run.stderr);
}));
