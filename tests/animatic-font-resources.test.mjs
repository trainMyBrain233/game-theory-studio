import '../scripts/isolated-fonts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ROOT,pythonCommand} from '../scripts/python.mjs';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {prepareVerifiedAnimaticFonts,registerVerifiedAnimaticFonts} from '../production/src/animatic/font-resources.mjs';

const SOURCE=path.join(ROOT,'typography/fonts');
const MANIFEST='prepared_font_manifest.json';
const WEIGHTS=['Regular','Bold'];
const filename=weight=>`NotoSansCJKSC-${weight}.otf`;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestAt=directory=>JSON.parse(fs.readFileSync(path.join(directory,MANIFEST),'utf8'));
const writeManifest=(directory,manifest)=>fs.writeFileSync(path.join(directory,MANIFEST),JSON.stringify(manifest));

function withFonts(callback) {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'animatic-font-proof-'));
 try {
  for(const name of [MANIFEST,...WEIGHTS.map(filename)])fs.copyFileSync(path.join(SOURCE,name),path.join(directory,name));
  return callback(directory);
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
}
function python(code,args=[]) {
 const result=spawnSync(pythonCommand(),['-c',code,...args],{cwd:ROOT,encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(result.status,0,result.stderr || result.error?.message);
 return result.stdout;
}
function withMissingPython(callback) {
 const previous=process.env.PYTHON;
 process.env.PYTHON=path.join(os.tmpdir(),'animatic-nonexistent-python',`missing-${process.pid}`);
 try {return callback();} finally {if(previous===undefined)delete process.env.PYTHON;else process.env.PYTHON=previous;}
}
function makeLocalTtc(directory,{missingBoldGlyph=false,widenLatinGlyph=false}={}) {
 // Real complete SC collections, independently extracted by the existing setup
 // code. The extra table deliberately differs from pinned official OTF bytes.
 python(`
import json, sys
from pathlib import Path
from fontTools.ttLib import TTFont, TTCollection
from fontTools.ttLib.tables.DefaultTable import DefaultTable
sys.path.insert(0, str(Path.cwd() / 'scripts'))
import setup_fonts
directory = Path(sys.argv[1]); source_dir = directory / 'sources'; source_dir.mkdir()
manifest = json.loads((directory / '${MANIFEST}').read_text())
for weight in ['Regular', 'Bold']:
    target = directory / f'NotoSansCJKSC-{weight}.otf'
    with TTFont(target, lazy=True, recalcTimestamp=False) as font:
        if sys.argv[2] == 'yes':
            assert ord('龘') in font.getBestCmap(), 'Coverage fixture requires an existing independent glyph'
            if weight == 'Bold':
                for table in font['cmap'].tables:
                    if table.isUnicode():
                        table.cmap.pop(ord('龘'), None)
        if sys.argv[3] == 'yes':
            glyph = font.getBestCmap()[ord('A')]
            advance, bearing = font['hmtx'].metrics[glyph]
            font['hmtx'].metrics[glyph] = (advance + 333, bearing)
        marker = DefaultTable('TEST'); marker.data = b'public animatic provenance test'
        font['TEST'] = marker
        # cmap/hmtx lookup caches the glyph order by loading CFF. The outlines
        # were not edited: preserve their raw table instead of recompiling all
        # 65,535 glyphs just to construct a two-face provenance fixture.
        font.tables.pop('CFF ', None)
        collection = TTCollection(); collection.fonts = [font]
        source = source_dir / f'NotoSansCJK-{weight}.ttc'
        collection.save(source)
    manifest[target.name] = setup_fonts.prepare(source, target, 'Sans', weight)
(directory / '${MANIFEST}').write_text(json.dumps(manifest))
`,[directory,missingBoldGlyph?'yes':'no',widenLatinGlyph?'yes':'no']);
}

test('prepared official or independently reproduced SC faces verify without changing any resource',()=>withFonts(directory=>{
 const originals=new Map([MANIFEST,...WEIGHTS.map(filename)].map(name=>[name,fs.readFileSync(path.join(directory,name))]));
 const proof=prepareVerifiedAnimaticFonts(['公共动画组件测试','甲方，乙方','策略 123'],{fontDir:directory});
 assert.match(proof.fingerprint,/^[a-f0-9]{64}$/);
 assert.deepEqual(proof.fonts,WEIGHTS.map(weight=>({weight,sha256:hash(originals.get(filename(weight)))})));
 assert(Object.isFrozen(proof) && Object.isFrozen(proof.fonts) && proof.fonts.every(Object.isFrozen));
 proof.assertUnchanged();
 for(const [name,bytes] of originals)assert.deepEqual(fs.readFileSync(path.join(directory,name)),bytes);
}));

test('same-process reuse skips Python but checks new input glyphs against the proven cmaps',()=>withFonts(directory=>{
 const first=prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory});
 withMissingPython(()=>{
  assert.equal(prepareVerifiedAnimaticFonts(['龘，123'],{fontDir:directory}).fingerprint,first.fingerprint);
  first.assertUnchanged();
  for(const glyph of [String.fromCodePoint(0x10ffff),'\ud800'])assert.throws(()=>prepareVerifiedAnimaticFonts(['有效文字',glyph],{fontDir:directory}),/unsupported glyphs.*U\+/);
 });
}));

test('registration requires the opaque current default proof and returns a byte-specific family',()=>{
 const proof=prepareVerifiedAnimaticFonts(['中文']);
 const registered=registerVerifiedAnimaticFonts(proof);
 assert.match(registered.family,/^GameTheory Noto Sans SC Animatic [a-f0-9]{64}$/);
 assert.equal(registered.fingerprint,proof.fingerprint);registered.assertUnchanged();
 assert.equal(registerVerifiedAnimaticFonts(prepareVerifiedAnimaticFonts(['策略'])).family,registered.family);
 assert.throws(()=>registerVerifiedAnimaticFonts({...proof}),/default-font proof/);
 withFonts(directory=>assert.throws(()=>registerVerifiedAnimaticFonts(prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory})),/default-font proof/));
});

test('every required face must have the input glyph, even when the other face supports it',()=>withFonts(directory=>{
 makeLocalTtc(directory,{missingBoldGlyph:true});
 const proof=prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory});proof.assertUnchanged();
 assert.throws(()=>prepareVerifiedAnimaticFonts(['龘'],{fontDir:directory}),/unsupported glyphs in NotoSansCJKSC-Bold\.otf: U\+9F98/);
}));

for(const weight of WEIGHTS)test(`valid-metadata ${weight} bytes with a forged manifest cannot be re-certified`,()=>withFonts(directory=>{
 const target=path.join(directory,filename(weight));
 prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory});
 fs.appendFileSync(target,'unchanged-glyphs-but-modified-font');
 const manifest=manifestAt(directory);manifest[filename(weight)].sha256=hash(fs.readFileSync(target));writeManifest(directory,manifest);
 const original=fs.readFileSync(path.join(directory,MANIFEST));
 // This is the review reproduction: family, weight, version and cmap remain
 // valid, and hashing these bytes alone would accept the caller-authored hash.
 python(`
import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / 'scripts'))
import setup_fonts
setup_fonts.verify(Path(sys.argv[1]), 'Sans', sys.argv[2])
`,[target,weight]);
 assert.throws(()=>prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory}),/pinned official|re-extracted/);
 assert.deepEqual(fs.readFileSync(path.join(directory,MANIFEST)),original,'Verification must not rewrite forged provenance');
}));

test('missing, malformed and undeclared font resources fail closed',()=>{
 for(const mutate of [
  directory=>fs.unlinkSync(path.join(directory,filename('Bold'))),
  directory=>fs.writeFileSync(path.join(directory,filename('Regular')),'not an OpenType font'),
  directory=>fs.unlinkSync(path.join(directory,MANIFEST)),
  directory=>fs.writeFileSync(path.join(directory,MANIFEST),'{'),
  directory=>writeManifest(directory,{}),
  directory=>{const manifest=manifestAt(directory);manifest[filename('Regular')].sha256='0'.repeat(64);writeManifest(directory,manifest);}
 ])withFonts(directory=>{
  mutate(directory);
  assert.throws(()=>prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory}),/font provenance|manifest/i);
 });
});

test('changed manifest bytes invalidate an old session and the cached independent proof',()=>withFonts(directory=>{
 const proof=prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory});
 fs.appendFileSync(path.join(directory,MANIFEST),'\n');
 assert.throws(()=>proof.assertUnchanged(),/resources changed after session creation/);
 withMissingPython(()=>assert.throws(()=>prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory}),/verification could not run/));
 const renewed=prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory});
 assert.notEqual(renewed.fingerprint,proof.fingerprint);
}));

test('same-size font mutation with restored mtime is detected after an initial proof',()=>withFonts(directory=>{
 const proof=prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory});
 const target=path.join(directory,filename('Bold')),metadata=fs.statSync(target),bytes=fs.readFileSync(target);
 bytes[bytes.length-1]^=1;fs.writeFileSync(target,bytes);fs.utimesSync(target,metadata.atime,metadata.mtime);
 assert.equal(fs.statSync(target).size,metadata.size);
 assert.throws(()=>proof.assertUnchanged(),/resources changed after session creation/);
 assert.throws(()=>prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory}),/font provenance/);
}));

test('TTC source bytes and face index are checked again after proof-cache reuse',()=>withFonts(directory=>{
 makeLocalTtc(directory);
 const proof=prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory}),manifest=manifestAt(directory);
 const source=manifest[filename('Regular')].source,bytes=fs.readFileSync(source),metadata=fs.statSync(source);
 const changed=Buffer.from(bytes);changed[changed.length-1]^=1;
 fs.writeFileSync(source,changed);fs.utimesSync(source,metadata.atime,metadata.mtime);
 assert.throws(()=>proof.assertUnchanged(),/resources changed after session creation/);
 assert.throws(()=>prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory}),/TTC source or prepared checksum changed/);
 fs.writeFileSync(source,bytes);proof.assertUnchanged();
 manifest[filename('Regular')].face_index=99;writeManifest(directory,manifest);
 assert.throws(()=>proof.assertUnchanged(),/resources changed after session creation/);
 assert.throws(()=>prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory}),/re-extracted/);
}));

test('a self-authored official label cannot replace pinned bytes or TTC-source provenance',()=>withFonts(directory=>{
 makeLocalTtc(directory);
 const manifest=manifestAt(directory);for(const weight of WEIGHTS)manifest[filename(weight)].source_kind='official_pinned_otf';
 writeManifest(directory,manifest);
 assert.throws(()=>prepareVerifiedAnimaticFonts(['中文'],{fontDir:directory}),/pinned official/);
}));

test('rendering and cache reuse refuse changed font files even after GlobalFonts registration',()=>{
 withSourceFixture(root=>{
  const directory=path.join(root,'typography/fonts');fs.unlinkSync(directory);fs.mkdirSync(directory);
  for(const name of [MANIFEST,...WEIGHTS.map(filename)])fs.copyFileSync(path.join(SOURCE,name),path.join(directory,name));
  const code=`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRenderSession} from './production/src/animatic/render-frame.mjs';
import {createRasterCache} from './production/src/animatic/raster-cache.mjs';
import {syntheticCast} from './tests/fixtures/animatic/synthetic-cast.mjs';
const options={plan:JSON.parse(fs.readFileSync('tests/fixtures/animatic/minimal-plan.json')),adapters:syntheticCast()};
const session=createRenderSession(options),cache=createRasterCache(session);cache.get(0);cache.get(0);
const target='typography/fonts/NotoSansCJKSC-Regular.otf';fs.appendFileSync(target,'registered-font-cache-tampering');
const manifestPath='typography/fonts/${MANIFEST}',manifest=JSON.parse(fs.readFileSync(manifestPath));
manifest['NotoSansCJKSC-Regular.otf'].sha256=createHash('sha256').update(fs.readFileSync(target)).digest('hex');fs.writeFileSync(manifestPath,JSON.stringify(manifest));
assert.throws(()=>session.render(0),/font resources changed/);
assert.throws(()=>cache.get(0),/font resources changed/);
assert.throws(()=>cache.get(1),/font resources changed/);
assert.throws(()=>createRenderSession(options),/pinned official|re-extracted/);
`;
  const result=spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',code],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,PYTHON:pythonCommand()}});
  assert.equal(result.status,0,result.stdout+result.stderr);
 });
});

test('a legacy pre-registered alias cannot supply stale glyph metrics for a newly verified font pair',()=>withFonts(replacement=>{
 makeLocalTtc(replacement,{widenLatinGlyph:true});
 withSourceFixture(root=>{
  const directory=path.join(root,'typography/fonts');fs.unlinkSync(directory);fs.mkdirSync(directory);
  for(const name of [MANIFEST,...WEIGHTS.map(filename)])fs.copyFileSync(path.join(SOURCE,name),path.join(directory,name));
  const code=`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {registerFonts,canvasFont} from './typography/fonts.mjs';
import {prepareVerifiedAnimaticFonts,registerVerifiedAnimaticFonts} from './production/src/animatic/font-resources.mjs';
registerFonts();
const ctx=createCanvas(200,100).getContext('2d');ctx.font=canvasFont(40,400);const oldWidth=ctx.measureText('A').width;
for(const name of ${JSON.stringify([MANIFEST,...WEIGHTS.map(filename)])})fs.copyFileSync(path.join(process.argv[1],name),path.join('typography/fonts',name));
const verified=registerVerifiedAnimaticFonts(prepareVerifiedAnimaticFonts(['A']));
ctx.font='400 40px "'+verified.family+'"';const width=ctx.measureText('A').width;
assert(width>oldWidth+10,'New alias must draw independently verified advances, not the legacy cached font');
ctx.font=canvasFont(40,400);assert.equal(ctx.measureText('A').width,oldWidth,'Legacy registration remains isolated');
verified.assertUnchanged();
`;
  const result=spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',code,replacement],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,PYTHON:pythonCommand()}});
  assert.equal(result.status,0,result.stdout+result.stderr);
 });
}));
