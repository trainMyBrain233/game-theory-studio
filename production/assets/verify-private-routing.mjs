/** Use eight temporary, original two-color RGBA rectangles to prove that
 * private mode skips the public person SVGs. No private artwork is inspected.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createCanvas} from '@napi-rs/canvas';
import {withSourceFixture} from '../../scripts/source-fixture.mjs';

withSourceFixture(root=>{
 const directory=path.join(root,'production/private_characters/pvz/assets');fs.mkdirSync(directory,{recursive:true});
 const canvas=createCanvas(320,500),c=canvas.getContext('2d');c.fillStyle='#BC3D31';c.fillRect(0,0,160,500);c.fillStyle='#345D9E';c.fillRect(160,0,160,500);
 const bytes=canvas.toBuffer('image/png');
 for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm'])fs.writeFileSync(path.join(directory,`${id}_${part}.png`),bytes);
 for(const id of ['a','b'])fs.writeFileSync(path.join(root,`production/assets/person_${id}.svg`),'INTENTIONALLY INVALID ORIGINAL FIXTURE');
 const code=`import assert from 'node:assert/strict';import {prepareAssets,assetLoadReport} from './production/src/primitives.mjs';await prepareAssets(1.15);const people=assetLoadReport.filter(x=>x.id.startsWith('person'));assert.equal(people.length,2);assert.ok(people.every(x=>x.type==='layered_raster'));`;
 const args=['--import','./scripts/isolated-fonts.mjs','--input-type=module','-e',code];
 const privateRun=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
 assert.equal(privateRun.status,0,`Private routing unexpectedly tried to decode a public person SVG: ${privateRun.stderr}`);
 const publicRun=spawnSync(process.execPath,[...args,'--','--placeholder-cast'],{cwd:root,encoding:'utf8'});
 assert.notEqual(publicRun.status,0,'Broken SVG must fail when the public placeholder route is selected');
 console.log('Asset routing: eight original RGBA fixtures load in private mode while malformed public person SVGs are skipped; explicit placeholder mode rejects the same broken SVGs.');
});
