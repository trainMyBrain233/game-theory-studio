import path from 'node:path';
import fs from 'node:fs';

// Compare destinations through existing filesystem aliases, including an aliased
// cwd (macOS /var -> /private/var) and output directories. Uncreated ancestors
// retain their spelling below the closest existing, physically resolved parent.
function outputDestination(file) {
 // Preserve symlink/.. traversal until the filesystem resolves it.
 const absolute=path.isAbsolute(file)?file:`${process.cwd()}${path.sep}${file}`;
 let stat;
 try{stat=fs.lstatSync(absolute);}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
 // encodeVideo renames over the final directory entry, not through a leaf
 // symlink. Compare regular-file identities for case aliases/hard links only.
 stat=stat?.isFile()?stat:null;
 let current=path.dirname(absolute);const missing=[path.basename(absolute)];
 while(true){
  try{
   const resolved=fs.realpathSync.native(current);
   return {path:path.join(resolved,...missing),stat};
  }catch(error){
   if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;
   const parent=path.dirname(current);if(parent===current)throw error;
   missing.unshift(path.basename(current));current=parent;
  }
 }
}
function sameDestination(a,b) {
 return a.path===b.path||(a.stat&&b.stat&&a.stat.dev===b.stat.dev&&a.stat.ino===b.stat.ino);
}

/** One rounding contract shared by CLI validation and the encoder loop. */
export function videoFrameCount(seconds,fps=30) {
 const count=Math.round(fps*seconds);
 if(!Number.isFinite(seconds)||seconds<=0||!Number.isFinite(fps)||fps<=0||!Number.isSafeInteger(count)||count<1)throw Error('Video window must produce at least one frame at the configured FPS.');
 return count;
}
export function renderOptions(args,duration,{fps=30,defaultTimes}={}) {
 const flags=new Set(['--stills','--preview','--placeholder-cast']);
 const values=new Set(['--width','--times','--start','--duration','--out']);
 const options={};
 for(let i=0;i<args.length;i++){
  const key=args[i];
  if(Object.hasOwn(options,key))throw Error(`Duplicate option: ${key}`);
  if(flags.has(key))options[key]=true;
  else if(values.has(key)){
   if(args[i+1]===undefined||args[i+1].startsWith('--'))throw Error(`Missing value for ${key}`);
   options[key]=args[++i];
  }else throw Error(`Unknown render option: ${key}`);
 }
 const width=Number(options['--width']??1920);
 if(![1920,3840].includes(width))throw Error('Width must be 1920 or 3840.');
 const still=Boolean(options['--stills']),preview=Boolean(options['--preview']);
 if(still&&preview)throw Error('Choose still frames or a video preview.');
 const start=Number(options['--start']??(preview?27.3:0));
 const seconds=Number(options['--duration']??(preview?13:duration-start));
 if(!Number.isFinite(start)||!Number.isFinite(seconds)||start<0||seconds<=0||start+seconds>duration+1e-8)throw Error('Video window must be finite, positive and inside the episode.');
 if(!still&&options['--times'])throw Error('--times requires --stills.');
 if(still&&(options['--start']||options['--duration']||options['--out']))throw Error('Video options do not apply to still frames.');
 const explicitTimes=options['--times']!==undefined;
 // Semantic checkpoints may reject short, otherwise valid timelines. Resolve
 // them only for default stills, never for custom stills or video requests.
 const times=explicitTimes?options['--times'].split(',').map(value=>value.trim()===''?NaN:Number(value)):(still?(typeof defaultTimes==='function'?defaultTimes():defaultTimes):[])??[];
 if(still&&!times.length)throw Error('Default still frames require checkpoints from the current timeline.');
 const frameCount=still?null:videoFrameCount(seconds,fps);
 if(times.some(t=>!Number.isFinite(t)||t<0||t>=duration))throw Error('Still times must be finite and inside the episode.');
 if(new Set(times.map(t=>t.toFixed(2))).size!==times.length)throw Error('Still times must have unique two-decimal filenames.');
 const output=options['--out'];
 if(output!==undefined&&!output.trim())throw Error('--out must name an output file.');
 const partial=!still&&(start!==0||seconds!==duration);
 // A successful short encode must not atomically replace a completed full film.
 // Full-window requests (even with explicit time flags) keep the default name.
 if(partial&&!preview&&output===undefined)throw Error('Partial video renders require an explicit --out separate from the full-film output.');
 const file=output??`output/${preview?'transition_preview':'game_theory_textbook_v2_clean'}_${width}.mp4`;
 if(partial){
  const destination=outputDestination(file);
  if([1920,3840].some(size=>sameDestination(destination,outputDestination(`output/game_theory_textbook_v2_clean_${size}.mp4`))))throw Error('Partial video renders cannot use a canonical full-film output; choose a separate --out.');
 }
 return {width,height:width*9/16,still,preview,start,duration:seconds,frameCount,times,explicitTimes,file};
}
