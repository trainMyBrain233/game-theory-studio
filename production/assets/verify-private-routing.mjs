/** Use eight temporary, original two-color RGBA rectangles to prove that
 * private mode skips the public person SVGs. No private artwork is inspected.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createCanvas} from '@napi-rs/canvas';
import {withSourceFixture} from '../../scripts/source-fixture.mjs';
import {pythonCommand} from '../../scripts/python.mjs';

const diagnostics=result=>`status=${result.status}, signal=${result.signal??'none'}, spawn error=${result.error?.message??'none'}\n${result.stdout??''}${result.stderr??''}`;

withSourceFixture(root=>{
 const directory=path.join(root,'production/private_characters/pvz/assets');fs.mkdirSync(directory,{recursive:true});
 const canvas=createCanvas(320,500),c=canvas.getContext('2d');c.fillStyle='#BC3D31';c.fillRect(0,0,160,500);c.fillStyle='#345D9E';c.fillRect(160,0,160,500);
 const bytes=canvas.toBuffer('image/png');
 for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm'])fs.writeFileSync(path.join(directory,`${id}_${part}.png`),bytes);
 for(const id of ['a','b'])fs.writeFileSync(path.join(root,`production/assets/person_${id}.svg`),'INTENTIONALLY INVALID ORIGINAL FIXTURE');
 const code=`
import assert from 'node:assert/strict';
import {prepareAssets,assetLoadReport} from './production/src/primitives.mjs';
if(process.argv.includes('--placeholder-cast')) {
 // Canvas 1.0.10's observed malformed-image contract. Import/font failures
 // happen before this boundary and cannot count as the intended negative.
 await assert.rejects(()=>prepareAssets(1.15),{code:'InvalidArg',message:'Unsupported image type'});
 assert.equal(assetLoadReport.length,0,'Malformed first public person SVG must fail before any asset is accepted');
 console.error('PUBLIC_PERSON_SVG_DECODE_CONFIRMED');process.exitCode=1;
} else {
 await prepareAssets(1.15);
 const people=assetLoadReport.filter(x=>x.id.startsWith('person'));
 assert.equal(people.length,2);assert.ok(people.every(x=>x.type==='layered_raster'));
}`;
 const args=['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',code];
 const options={cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()}};
 const privateRun=spawnSync(process.execPath,args,options);
 assert.equal(privateRun.status,0,`Private asset-routing subprocess failed: ${diagnostics(privateRun)}`);
 const publicRun=spawnSync(process.execPath,[...args,'--','--placeholder-cast'],options);
 assert.equal(publicRun.status,1,`Broken SVG must fail at the public person decode boundary: ${diagnostics(publicRun)}`);
 assert.match(publicRun.stderr,/^PUBLIC_PERSON_SVG_DECODE_CONFIRMED$/m,`Public route failed before the expected malformed SVG rejection: ${diagnostics(publicRun)}`);
 console.log('Asset routing: eight original RGBA fixtures load in private mode while malformed public person SVGs are skipped; explicit placeholder mode rejects the same broken SVGs.');
});
