import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
import {pythonCommand} from '../scripts/python.mjs';
import {writeProducts} from '../scripts/publish-products.mjs';
import {currentProducts} from '../chapters/01-four-elements/editorial/zombie-kingdom-r2/build.mjs';
const relative='chapters/01-four-elements/editorial/zombie-kingdom-r2',products=currentProducts(),names=Object.keys(products);
function snapshot(directory){
 return Object.fromEntries(fs.readdirSync(directory,{recursive:true}).sort().map(name=>{
  const file=path.join(directory,name),stat=fs.lstatSync(file);
  return [name,stat.isSymbolicLink()?['symlink',fs.readlinkSync(file)]:stat.isDirectory()?'directory':fs.readFileSync(file)];
 }));
}
function run(root,{hook='',check=false}={}){
 const preload=path.join(root,'publication-injection.mjs');fs.writeFileSync(preload,`import fs from 'node:fs';\n${hook}`);
 return spawnSync(process.execPath,['--import',preload,`${relative}/build.mjs`,...(check?['--check']:[])],{cwd:root,encoding:'utf8',env:{...process.env,PYTHON:pythonCommand()}});
}
const injected=(method,predicate)=>`const real=fs.${method};let calls=0;fs.${method}=(...args)=>{if(${predicate}){calls++;if(calls===2)throw Error('INJECTED_${method}_SECOND');}return real(...args);};`;
test('real editorial build preflights a late directory without modifying old products or user files',()=>withSourceFixture(root=>{
 const directory=path.join(root,relative);
 fs.writeFileSync(path.join(directory,names[0]),'old draft');fs.unlinkSync(path.join(directory,names[1]));fs.mkdirSync(path.join(directory,names[1]));fs.writeFileSync(path.join(directory,names[1],'keep'),'user file');
 const before=snapshot(directory),result=run(root);
 assert.notEqual(result.status,0);assert.match(result.stderr,/Output product must be a regular file/);assert.deepEqual(snapshot(directory),before);
}));
for(const existing of [false,true,'mixed'])for(const [method,predicate] of [
 ['renameSync','true'],['writeFileSync',"String(args[0]).includes('/.publication-')"],['copyFileSync','true'],
]){
 if(!existing&&method==='copyFileSync')continue;
 test(`real editorial ${method} failure preserves ${existing} products and subsequent build matches bytes`,()=>withSourceFixture(root=>{
  const directory=path.join(root,relative);
  for(const [index,name] of names.entries())if(existing===true||existing==='mixed'&&index!==0)fs.writeFileSync(path.join(directory,name),`old ${name}`);else fs.unlinkSync(path.join(directory,name));
  fs.writeFileSync(path.join(directory,'user-file'),'keep');const before=snapshot(directory);
  const failed=run(root,{hook:injected(method,predicate)});
  assert.notEqual(failed.status,0);assert.match(failed.stderr,new RegExp(`INJECTED_${method}_SECOND`));assert.deepEqual(snapshot(directory),before);
  const rebuilt=run(root);assert.equal(rebuilt.status,0,rebuilt.stderr);
  for(const [name,text] of Object.entries(products))assert.deepEqual(fs.readFileSync(path.join(directory,name)),Buffer.from(text));
  assert.equal(fs.readFileSync(path.join(directory,'user-file'),'utf8'),'keep');assert.ok(!fs.readdirSync(directory).some(name=>name.startsWith('.publication-')));
 }));
}
test('real editorial check is read-only for fresh, stale and absent outputs',()=>withSourceFixture(root=>{
 const directory=path.join(root,relative),hook=`for(const method of ['writeFileSync','renameSync','copyFileSync','mkdirSync','mkdtempSync','unlinkSync','rmSync','rmdirSync'])fs[method]=()=>{throw Error('CHECK_ATTEMPTED_WRITE');};`;
 for(const state of ['fresh','stale','absent']){
  if(state==='stale')fs.writeFileSync(path.join(directory,names[0]),'stale');
  if(state==='absent')fs.unlinkSync(path.join(directory,names[0]));
  const before=snapshot(directory),result=run(root,{hook,check:true});
  if(state==='fresh')assert.equal(result.status,0,result.stderr);else{assert.notEqual(result.status,0);assert.match(result.stderr,/Stale editorial product/);}
  assert.doesNotMatch(result.stderr,/CHECK_ATTEMPTED_WRITE/);assert.deepEqual(snapshot(directory),before);
 }
}));
test('real editorial rollback failure reports recovery location and retains original bytes',()=>withSourceFixture(root=>{
 const directory=path.join(root,relative),original=Buffer.from('original draft');fs.writeFileSync(path.join(directory,names[0]),original);
 const result=run(root,{hook:`const real=fs.renameSync;let calls=0;fs.renameSync=(...args)=>{if(++calls>1)throw Error('INJECTED_DEVICE_UNAVAILABLE');return real(...args);};`});
 assert.notEqual(result.status,0);assert.match(result.stderr,/rollback was incomplete; recovery files retained at/);assert.match(result.stderr,/INJECTED_DEVICE_UNAVAILABLE/);
 const recovery=fs.readdirSync(directory).filter(name=>name.startsWith('.publication-'));assert.equal(recovery.length,1);
 assert.ok(result.stderr.includes(fs.realpathSync(path.join(directory,recovery[0]))));assert.deepEqual(fs.readFileSync(path.join(directory,recovery[0],'old',names[0])),original);
}));
function temporary(callback){const root=fs.mkdtempSync(path.join(os.tmpdir(),'publication-test-'));try{callback(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('publisher rejects overlapping, escaping and symlink paths before modifying user files',()=>temporary(root=>{
 for(const products of [{'../escape':'x'},{'':'x'},{'a':'x','./a':'y'},{'a':'x','a/b':'y'}]){
  assert.throws(()=>writeProducts(path.join(root,'out'),products),/Product path/);assert.deepEqual(snapshot(root),{});
 }
 fs.mkdirSync(path.join(root,'outside'));fs.writeFileSync(path.join(root,'outside','keep'),'keep');fs.mkdirSync(path.join(root,'out'));
 for(const directory of [true,false]){
  const link=path.join(root,'out','link');fs.symlinkSync(path.join(root,'outside',...(directory?[]:['keep'])),link);
  const before=snapshot(root);assert.throws(()=>writeProducts(path.join(root,'out'),{'early':'new',[directory?'link/keep':'link']:'bad'}),/symbolic link/);assert.deepEqual(snapshot(root),before);fs.unlinkSync(link);
 }
}));
test('publisher staging failure removes only newly created empty directories',()=>temporary(root=>{
 assert.throws(()=>writeProducts(path.join(root,'new','out'),{'first':'good','nested/late':null}),/data/);assert.deepEqual(snapshot(root),{});
}));
test('publisher preflight fails on a late unwritable parent before replacing any file',()=>temporary(root=>{
 const output=path.join(root,'out');fs.mkdirSync(path.join(output,'locked'),{recursive:true});fs.writeFileSync(path.join(output,'first'),'old');fs.writeFileSync(path.join(output,'locked','last'),'old last');
 const before=snapshot(root),real=fs.mkdtempSync;
 try{
  fs.mkdtempSync=(prefix,...args)=>{if(prefix.includes(`${path.sep}locked${path.sep}`))throw Object.assign(Error('INJECTED_EACCES_LATE_PARENT'),{code:'EACCES'});return real(prefix,...args);};
  assert.throws(()=>writeProducts(output,{'first':'changed','locked/last':'new'}),/INJECTED_EACCES_LATE_PARENT/);
 }finally{fs.mkdtempSync=real;}
 assert.deepEqual(snapshot(root),before);
}));
test('real editorial build reports unwritable directory without changing any product',{
 skip:process.platform==='win32'||process.getuid?.()===0?'requires POSIX permission enforcement':false,
},()=>withSourceFixture(root=>{
 const directory=path.join(root,relative),before=snapshot(directory);fs.chmodSync(directory,0o555);
 try{const result=run(root);assert.notEqual(result.status,0);assert.match(result.stderr,/EACCES/);assert.deepEqual(snapshot(directory),before);}finally{fs.chmodSync(directory,0o755);}
}));
test('publisher rolls back mixed existing/new products across nested directories',()=>temporary(root=>{
 fs.mkdirSync(path.join(root,'existing'));fs.writeFileSync(path.join(root,'existing','old'),Buffer.from([0,255,42]));fs.writeFileSync(path.join(root,'user-file'),'keep');
 const before=snapshot(root),real=fs.renameSync;let calls=0;
 try{
  fs.renameSync=(...args)=>{if(++calls===3)throw Error('INJECTED_THIRD_RENAME');return real(...args);};
  assert.throws(()=>writeProducts(root,{'existing/old':'changed','new/deep/file':'new','last/file':'third'}),/INJECTED_THIRD_RENAME/);
 }finally{fs.renameSync=real;}
 assert.deepEqual(snapshot(root),before);assert.equal(calls,4,'existing file restored after removing new product');
 const bytes=Buffer.from([0,255,42]);writeProducts(root,{'existing/old':'changed','new/deep/file':bytes});assert.deepEqual(fs.readFileSync(path.join(root,'new/deep/file')),bytes);
}));
