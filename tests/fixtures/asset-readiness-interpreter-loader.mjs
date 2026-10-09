// Verify the actual readiness test's subprocess boundary without replacing its
// font or asset contracts. Native behavior is tested by the unmocked test.
export async function load(url,context,nextLoad){
 if(url.endsWith('/scripts/source-fixture.mjs'))return {format:'module',shortCircuit:true,source:'export const withSourceFixture=callback=>callback(process.cwd());'};
 if(url==='node:child_process')return {format:'module',shortCircuit:true,source:`
  import assert from 'node:assert/strict';
  import fs from 'node:fs';
  export function spawnSync(command,args,options){
   assert.equal(command,process.execPath);
   assert.equal(options.env?.PYTHON,process.env.READINESS_EXPECTED_PYTHON,'Readiness child must inherit the selected project interpreter');
   assert(args.includes('./tests/fixtures/asset-readiness-native-loader.mjs'));
   fs.writeFileSync(process.env.READINESS_SPAWN_LOG,options.env.PYTHON);
   return {status:0,stdout:'',stderr:''};
  }
 `};
 return nextLoad(url,context);
}
