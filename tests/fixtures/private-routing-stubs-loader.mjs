// Exercise routing-runner boundaries without native Canvas, fonts or Python.
export async function resolve(specifier,context,nextResolve) {
 if(specifier==='@napi-rs/canvas')return {url:'test-stub:routing-canvas',shortCircuit:true};
 return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad) {
 if(url==='test-stub:routing-canvas')return {format:'module',shortCircuit:true,source:`
export const createCanvas=()=>({getContext:()=>({fillRect(){}}),toBuffer:()=>Buffer.from('controlled PNG fixture')});`};
 if(url.endsWith('/scripts/source-fixture.mjs'))return {format:'module',shortCircuit:true,source:'export const withSourceFixture=callback=>callback(process.cwd());'};
 if(url==='node:child_process')return {format:'module',shortCircuit:true,source:`
import assert from 'node:assert/strict';
import fs from 'node:fs';
export function spawnSync(command,args,options) {
 assert.equal(command,process.execPath);
 assert.equal(options.env?.PYTHON,process.env.ROUTING_EXPECTED_PYTHON,'Routing child must retain the selected project interpreter');
 const publicRoute=args.includes('--placeholder-cast'),mode=process.env.ROUTING_MOCK_MODE;
 fs.appendFileSync(process.env.ROUTING_SPAWN_LOG,JSON.stringify({publicRoute,python:options.env.PYTHON})+'\\n');
 if(mode===(publicRoute?'public-font-error':'private-font-error'))return {status:1,signal:null,stdout:'',stderr:'Missing fontTools'};
 if(mode===(publicRoute?'public-signal':'private-signal'))return {status:null,signal:'SIGKILL',stdout:'',stderr:''};
 if(mode==='private-spawn-error'&&!publicRoute)return {status:null,signal:null,error:new Error('spawn fixture ENOENT'),stdout:'',stderr:''};
 if(publicRoute&&mode==='public-success')return {status:0,signal:null,stdout:'',stderr:''};
 return {status:publicRoute?1:0,signal:null,stdout:'',stderr:publicRoute?'PUBLIC_PERSON_SVG_DECODE_CONFIRMED\\n':''};
}`};
 return nextLoad(url,context);
}
