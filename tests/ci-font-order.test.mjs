import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {ROOT,pythonCommand} from '../scripts/python.mjs';

const workflow=fs.readFileSync(path.join(ROOT,'.github/workflows/quality.yml'),'utf8');
const packageData=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
const dependent=['test:core','test:animatic','test:render','render:smoke','test:episode'];
function assertWorkflowFontOrder(source){
 const commands=[...source.matchAll(/\bnpm run ([\w:]+)([^\n]*)/g)].map(match=>({script:match[1],args:match[2].trim()}));
 const positions=script=>commands.flatMap((command,index)=>command.script===script?[index]:[]);
 for(const script of ['setup:fonts','qa:fonts',...dependent])assert.equal(positions(script).length,1,`CI must run ${script} exactly once.`);
 const prepared=positions('setup:fonts')[0],verified=positions('qa:fonts')[0];
 assert.equal(commands[prepared].args,'-- --download','CI must explicitly prepare checksum-pinned official downloads.');
 assert.ok(prepared<verified,'CI must prepare fonts before verification.');
 for(const script of dependent)assert.ok(verified<positions(script)[0],`CI fonts must be prepared and verified before ${script}.`);
}
test('CI prepares and verifies official SC fonts before every font-dependent test stage',()=>{
 assertWorkflowFontOrder(workflow);
 const core='      - name: Core and negative regression tests\n        run: npm run test:core\n';
 const prepare='      - name: Prepare checksum-pinned official SC fonts\n';
 assert.ok(workflow.includes(core)&&workflow.includes(prepare),'Workflow mutation anchors must exist.');
 const oldOrder=workflow.replace(core,'').replace(prepare,core+prepare);
 assert.notEqual(oldOrder,workflow);assert.throws(()=>assertWorkflowFontOrder(oldOrder),/before test:core/);
 assert.throws(()=>assertWorkflowFontOrder(workflow.replace('npm run setup:fonts -- --download','echo missing preparation')),/setup:fonts exactly once/);
 assert.throws(()=>assertWorkflowFontOrder(workflow.replace('-- --download','')),/official downloads/);
});
test('npm test verifies prepared fonts before core and retains every aggregate stage',()=>{
 const expected=['qa:data','qa:editorial','qa:fonts','test:core','test:animatic','test:render','render:smoke','test:episode','qa:source'];
 const commands=packageData.scripts.test.split(' && ').map(command=>command.replace(/^npm run /,''));
 assert.deepEqual(commands,expected);
 assert.ok(packageData.scripts['qa:fonts'].startsWith('node scripts/python.mjs scripts/setup_fonts.py --verify-only && '));
 assert.match(packageData.scripts['test:core'],/node --test --test-concurrency=2 tests\/\*\.test\.mjs/,'Core must retain all test files, including raster negatives.');
});
test('empty-font source checkout rejects actual matrix rendering, then independently verified prepared fonts enable it',()=>{
 withSourceFixture(root=>{
  const fonts=path.join(root,'typography/fonts');
  assert.ok(fs.lstatSync(fonts).isSymbolicLink(),'Only unlink the disposable fixture link, never shared font files.');
  fs.unlinkSync(fonts);fs.mkdirSync(fonts);
  assert.deepEqual(fs.readdirSync(fonts),[],'The reproduction must begin genuinely fontless.');
  const run=args=>spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand(),DISABLE_SYSTEM_FONTS_LOAD:'1'},maxBuffer:8*1024*1024});
  const raster=['--import','./scripts/isolated-fonts.mjs','design/experiments/tabletop/qa-matrix.mjs'];
  const missing=run(raster);assert.notEqual(missing.status,0);assert.match(missing.stderr,/Required SC font is missing:.*NotoSansCJKSC-Regular\.otf/);
  // No network in unit tests. Recover a private copy of the prepared cache,
  // then verify official pinned OTF bytes or independently reproduced TTC provenance.
  fs.cpSync(path.join(ROOT,'typography/fonts'),fonts,{recursive:true,dereference:true});
  assert.ok(!fs.lstatSync(fonts).isSymbolicLink());
  const verified=run(['scripts/python.mjs','scripts/setup_fonts.py','--verify-only']);assert.equal(verified.status,0,verified.stdout+verified.stderr);
  const rendered=run(raster);assert.equal(rendered.status,0,rendered.stdout+rendered.stderr);assert.match(rendered.stdout,/8 actual rasters/);
 });
});
