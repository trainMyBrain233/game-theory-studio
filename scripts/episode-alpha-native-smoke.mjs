/** Real Canvas/private renderer proof using eight original RGBA fixtures only.
 * The loader restricts the expensive scene sweep to a single stable player frame;
 * npm, production routing, asset loading, drawing, masks and QA remain real. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {withSourceFixture} from './source-fixture.mjs';
import {pythonCommand} from './python.mjs';

withSourceFixture(root=>{
 const directory=path.join(root,'production/private_characters/pvz/assets');fs.mkdirSync(directory,{recursive:true});
 const image=createCanvas(320,500),ctx=image.getContext('2d');ctx.fillStyle='#345D9E';ctx.fillRect(150,140,20,20);
 for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm'])fs.writeFileSync(path.join(directory,`${id}_${part}.png`),image.toBuffer('image/png'));
 const loader=path.join(root,'alpha-native-loader.mjs');
 fs.writeFileSync(loader,`export async function load(url,context,next){
 if(url.endsWith('/production/src/scenes.mjs'))return {format:'module',shortCircuit:true,source:\`import * as real from '\${url}?native';
 export const content=real.content,DURATION=.5,timeline={...real.timeline,segments:[],sections:[{id:"players",start:-1,end:1}]};
 export function drawFrame(canvas){const players=real.timeline.sections.find(s=>s.id==='players');real.drawFrame(canvas,(players.start+players.end)/2);}\`};
 return next(url,context);
 }`);
 const run=args=>spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','qa:episode:layout','--',...args],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand(),NODE_OPTIONS:`--loader=${pathToFileURL(loader).href}`}});
 fs.writeFileSync(path.join(root,'production/assets/person_a.svg'),'INVALID ORIGINAL PUBLIC FIXTURE');
 const privateRun=run(['--actor-alpha']);
 assert.equal(privateRun.status,0,privateRun.stdout+privateRun.stderr);
 const report=JSON.parse(fs.readFileSync(path.join(root,'production/qa/checks.json')));
 assert.equal(report.actor_alpha.mode,'private_actor_alpha');assert.equal(report.actor_alpha.nonempty_mask_samples,1);assert.equal(report.actor_alpha.expected_actor_samples,1);assert(report.actor_alpha.clearance_checks>0);
 console.log('Native npm private alpha original-RGBA proof:',JSON.stringify(report.actor_alpha));
 // Public images must be skipped privately, but used by the default npm path.
 const publicRun=run([]);assert.notEqual(publicRun.status,0);assert.match(publicRun.stderr,/Unsupported image type/);
 console.log('Native routing: private alpha skipped malformed public SVG; default public mode rejected it.');
});
