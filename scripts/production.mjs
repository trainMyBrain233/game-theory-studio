import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT} from './python.mjs';
import {layoutMode} from '../production/qa/layout-mode.mjs';

const [entry,...args]=process.argv.slice(2);
const allowed=new Set(['render.mjs','qa/content.mjs','qa/validate.mjs','build_deliverables.mjs','assets/verify-assets.mjs']);
if(!allowed.has(entry))throw Error(`Unknown production entry: ${entry}`);
if(entry==='qa/validate.mjs'){
 const mode=layoutMode(args);
 if(mode.placeholder&&!args.includes('--placeholder-cast'))args.push('--placeholder-cast');
}
const result=spawnSync(process.execPath,['--import',path.join(ROOT,'scripts/isolated-fonts.mjs'),path.join(ROOT,'production',entry==='qa/validate.mjs'?'qa/layout-runner.mjs':entry),...args],{cwd:path.join(ROOT,'production'),stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
