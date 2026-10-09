// Only the controlled proof-cache subprocess uses this loader. No Python,
// FontTools or native Canvas can run; real acceptance is covered separately.
export async function load(url,context,nextLoad) {
 if(url==='node:child_process')return {format:'module',shortCircuit:true,source:`
export function spawnSync(command,args,options) {
 const mock=globalThis.fontVerifierMock;mock.calls++;
 const request=JSON.parse(options.input);mock.last=request;
 if(mock.reject)return {status:1,stderr:'fixture provenance rejected'};
 return {status:0,stdout:JSON.stringify({expected:request.expected,sources:mock.sources})};
}`};
 return nextLoad(url,context);
}
