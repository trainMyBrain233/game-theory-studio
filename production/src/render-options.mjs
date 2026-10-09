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
 const times=explicitTimes?options['--times'].split(',').map(value=>value.trim()===''?NaN:Number(value)):(still?defaultTimes:[])??[];
 if(still&&!times.length)throw Error('Default still frames require checkpoints from the current timeline.');
 const frameCount=still?null:videoFrameCount(seconds,fps);
 if(times.some(t=>!Number.isFinite(t)||t<0||t>=duration))throw Error('Still times must be finite and inside the episode.');
 if(new Set(times.map(t=>t.toFixed(2))).size!==times.length)throw Error('Still times must have unique two-decimal filenames.');
 return {width,height:width*9/16,still,preview,start,duration:seconds,frameCount,times,explicitTimes,file:options['--out']??`output/${preview?'transition_preview':'game_theory_textbook_v2_clean'}_${width}.mp4`};
}
