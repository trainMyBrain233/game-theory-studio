import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
const schema=JSON.parse(fs.readFileSync(new URL('./presentation.schema.json',import.meta.url),'utf8'));
const validate=new Ajv2020({allErrors:true,strict:true}).compile(schema);
/** Draft identity adapter; never rewrites canonical narration or timeline. */
export function presentationModel(config,scene){
 if(!validate(config))throw Error(`Draft presentation schema: ${JSON.stringify(validate.errors)}`);
 for(const id of ['A','B'])if(config.actors[id].avatar.actor!==id)throw Error('Avatar owner differs from visible name.');
 if(config.actors.A.name===config.actors.B.name)throw Error('Distinct players need distinct visible names.');
 const adapted=structuredClone(scene);
 for(const actor of adapted.actors)actor.label=config.actors[actor.id].name;
 return {status:'draft',header:`${config.series}｜第${config.episode.number}集·${config.episode.title}`,
  actors:structuredClone(config.actors),narrationNames:Object.fromEntries(['A','B'].map(id=>[id,config.actors[id].name])),scene:adapted,
  matrix:{rowActor:'A',columnActor:'B',scoreOrder:['A','B'],values:structuredClone(scene.payoffs)},timingRevision:'pending-new-script'};
}
