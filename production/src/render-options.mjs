export function renderOptions(args,duration) {
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
 const times=(options['--times']??'3,8.3,21,27,38.2,44.5,48.5,54,61.5,68,73,83,88.5,96,100.5,104.5,108.5,117.9,126.3,134.6,142.8,147,154,160,166.5,172,11.35,30.95,56.4,75.3,75.55,75.7,87.3,98.55,98.6,99,99.7,156.3,156.65').split(',').map(value=>value.trim()===''?NaN:Number(value));
 if(times.some(t=>!Number.isFinite(t)||t<0||t>=duration))throw Error('Still times must be finite and inside the episode.');
 if(new Set(times.map(t=>t.toFixed(2))).size!==times.length)throw Error('Still times must have unique two-decimal filenames.');
 return {width,height:width*9/16,still,preview,start,duration:seconds,times,file:options['--out']??`output/${preview?'transition_preview':'game_theory_textbook_v2_clean'}_${width}.mp4`};
}
