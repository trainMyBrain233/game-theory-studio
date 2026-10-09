/** Read-only byte identity, usable from source archives without Git or Canvas.
 * Conservative source coverage deliberately invalidates rather than accepting a
 * stale image when a shared renderer helper changes. No mtime cache is used.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const RENDER_ROOT=fileURLToPath(new URL('../../',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function renderFingerprint({root=RENDER_ROOT,placeholderCast=true}={}) {
 if(typeof placeholderCast!=='boolean')throw Error('Render identity requires an explicit boolean cast mode.');
 const files=new Set();
 function add(relative){
  const full=path.resolve(root,relative),normalized=path.relative(root,full).split(path.sep).join('/');
  if(normalized.startsWith('../')||path.isAbsolute(normalized))throw Error('Render input must be inside the project.');
  if(!fs.statSync(full).isFile())throw Error(`Render input is not a file: ${normalized}`);
  files.add(normalized);
 }
 function walk(relative,extensions){
  for(const item of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
   if(item.name.startsWith('.')||item.name==='__pycache__'||item.name==='fonts')continue;
   const name=path.posix.join(relative,item.name);
   if(item.isDirectory())walk(name,extensions);
   else if(extensions.has(path.extname(name)))add(name);
  }
 }
 for(const directory of ['production/src','production/typography','production/schema','typography','scripts','schemas']){
  if(fs.existsSync(path.join(root,directory)))walk(directory,new Set(['.mjs','.js','.py','.json']));
 }
 for(const item of fs.readdirSync(path.join(root,'design')))
  if(['.mjs','.json'].includes(path.extname(item)))add(`design/${item}`);
 for(const file of ['production/render.mjs','production/cast.json','production/content.json','production/tokens.json','production/assets/asset-hotspots.json','package.json','package-lock.json'])add(file);
 const cast=JSON.parse(fs.readFileSync(path.join(root,'production/cast.json')));
 for(const actor of Object.values(cast.actors))add(`production/${placeholderCast?(actor.fallback_asset||actor.asset):actor.asset}`);
 for(const card of Object.values(cast.strategies))add(`production/${card.asset}`);
 if(!placeholderCast&&cast.renderer_module){
  add(`production/${cast.renderer_module}`);
  // Layered rigs load multiple RGBA resources beyond the cast's head anchors.
  walk('production/private_characters',new Set(['.png','.json','.mjs','.js','.svg']));
 }
 for(const family of ['Sans','Serif'])for(const weight of ['Regular','Bold'])add(`typography/fonts/Noto${family}CJKSC-${weight}.otf`);
 add('typography/fonts/prepared_font_manifest.json');
 // Bind the installed rasterizer bytes as well as the dependency lockfile.
 for(const item of fs.readdirSync(path.join(root,'node_modules/@napi-rs')))
  if(item==='canvas'||item.startsWith('canvas-'))walk(`node_modules/@napi-rs/${item}`,new Set(['.js','.json','.node']));
 const inputs=[...files].sort().map(file=>({path:file,sha256:digest(fs.readFileSync(path.join(root,file)))}));
 const identity={version:1,cast_mode:placeholderCast?'placeholder':'private',runtime:{node:process.versions.node,platform:process.platform,arch:process.arch},inputs};
 return {...identity,sha256:digest(JSON.stringify(identity))};
}
