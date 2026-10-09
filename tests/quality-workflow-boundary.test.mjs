import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(new URL('../.github/workflows/quality.yml',import.meta.url),'utf8');
// A narrow static contract for this workflow's checked-in block format, not a
// general YAML parser or a simulation of GitHub's event delivery.
function block(source,key){
 const match=source.match(new RegExp(`^${key}:\\n(?:[ \\t].*\\n|\\n)*`,'m'));
 assert(match,`Missing ${key} block`);return match[0].trimEnd();
}
function assertTriggers(source){
 assert.equal(block(source,'on'),'on:\n  pull_request:\n  push:\n  workflow_dispatch:',
  'Quality must accept ordinary push and pull_request without branch, tag or path filters');
}
function assertSafety(source){
 assert.equal(block(source,'permissions'),'permissions:\n  contents: read','Quality token must stay contents: read only');
 assert.equal([...source.matchAll(/^\s*permissions:/gm)].length,1,'No job-level permission overrides');
 const actions=[...source.matchAll(/^\s*uses:\s*(\S+)/gm)].map(match=>match[1]);
 assert.deepEqual(actions,[
  'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
  'actions/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903',
  'actions/setup-python@e797f83bcb11b83ae66e0230d6156d7c80228e7c',
 ],'Only the existing SHA-pinned official setup actions are allowed');
 assert.equal([...source.matchAll(/^\s*persist-credentials:\s*(\S+)/gm)].map(match=>match[1]).join(','),'false','Checkout must not persist credentials');
 assert.doesNotMatch(source,/pull_request_target|\bsecrets(?:\s*\.|\s*\[|\s*:)|^\s*(?:environment|deployment|id-token):|\bnpm\s+publish\b|\bgh\s+(?:release|api)\b/gm,
  'No privileged trigger, secrets, deployment or publishing boundary may be added');
}
test('Quality runs unfiltered ordinary push, pull_request and manual dispatch',()=>assertTriggers(workflow));
test('the old branch filter and other narrowing/privileged trigger mutations are rejected',()=>{
 for(const filter of ["branches: [main, 'setup/**', 'infra/**']",'branches-ignore: [feature/**]','tags: [v*]','paths: [src/**]']){
  const changed=workflow.replace('  push:\n',`  push:\n    ${filter}\n`);
  assert.notEqual(changed,workflow);assert.throws(()=>assertTriggers(changed),/without branch, tag or path filters/);
 }
 assert.throws(()=>assertTriggers(workflow.replace('  pull_request:\n','  pull_request_target:\n')),/without branch, tag or path filters/);
});
test('expanding push coverage keeps the existing read-only and no-publication boundaries',()=>assertSafety(workflow));
test('permission, unpinned action, persisted credential, secret and publish mutations are rejected',()=>{
 const changes=[
  source=>source.replace('contents: read','contents: write'),
  source=>source.replace('    runs-on:','    permissions:\n      contents: write\n    runs-on:'),
  source=>source.replace('actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd','actions/checkout@v6'),
  source=>source.replace('persist-credentials: false','persist-credentials: true'),
  source=>source+'\nsecrets: inherit\n',
  source=>source+'\nenv:\n  TOKEN: ${{ secrets.EXAMPLE }}\n',
  source=>source.replace('        run: npm run test:core','        run: npm publish'),
  source=>source.replace('    runs-on:','    environment: production\n    runs-on:'),
 ];
 for(const change of changes){const mutated=change(workflow);assert.notEqual(mutated,workflow);assert.throws(()=>assertSafety(mutated));}
});
