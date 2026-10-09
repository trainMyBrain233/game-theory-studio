import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';

test('comparison-only headings, subtitles and captions enter actual cmap QA',()=>withSourceFixture(root=>{
 const tokenFile=path.join(root,'design/tokens.json'),tokens=JSON.parse(fs.readFileSync(tokenFile));
 tokens.styles.textbook.name='ع';tokens.styles.bright.subtitle='غ';
 fs.writeFileSync(tokenFile,JSON.stringify(tokens));
 const before=fs.readFileSync(tokenFile);
 const options={cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()},timeout:90000,maxBuffer:4*1024*1024};
 const probe=spawnSync(pythonCommand(),['-c',`
from pathlib import Path
from fontTools.ttLib import TTFont
for kind in ['Sans', 'Serif']:
    for weight in ['Regular', 'Bold']:
        with TTFont(Path('typography/fonts') / f'Noto{kind}CJKSC-{weight}.otf', lazy=True) as font:
            for character in 'عغ':
                assert ord(character) not in font.getBestCmap()
print('Independent cmap proof: U+0639 and U+063A are absent from all four SC faces')
`],options);
 assert.equal(probe.status,0,probe.stdout+probe.stderr);
 const collected=spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','typography/qa-fonts.mjs'],options);
 assert.equal(collected.status,0,collected.stdout+collected.stderr);
 const checked=spawnSync(pythonCommand(),['scripts/qa_glyphs.py'],options);
 assert.notEqual(checked.status,0,`Comparison-only glyphs escaped actual cmap QA:\n${checked.stdout}${checked.stderr}`);
 assert.match(checked.stderr,/NotoSansCJKSC-Regular\.otf.*ع.*غ/s);
 const runs=JSON.parse(fs.readFileSync(path.join(root,'typography/qa/text-runs.json'))).textRuns;
 for(const text of [...Object.values(tokens.styles).flatMap(style=>[style.name,style.subtitle]),'场景一 · 参与者','场景二 · 收益矩阵'])assert(runs.includes(text),`Missing comparison-board text: ${text}`);
 assert.deepEqual(fs.readFileSync(tokenFile),before,'Read-only glyph QA must preserve authored tokens');
}));
