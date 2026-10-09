import fs from 'node:fs';
import path from 'node:path';

// Individual renames are atomic, the product set is not. Callers must exclude
// concurrent writers. This is ordinary-error rollback, not crash/power-loss
// durability. If rollback also fails, retain recovery files and report them.
export function writeProducts(directory, products){
 directory=path.resolve(directory);
 const entries=Object.entries(products).map(([name,text])=>{
  if(!name||path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw Error('Product path must stay inside the output directory');
  const relative=path.normalize(name);
  if(relative==='.')throw Error('Product path must stay inside the output directory');
  return [relative,text];
 });
 for(let i=0;i<entries.length;i++)for(let j=0;j<i;j++){
  const a=entries[i][0],b=entries[j][0];
  if(a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep))throw Error('Product paths must be distinct and must not overlap');
 }
 if(!entries.length)return;
 const created=[],published=[],backups=new Map();let temporary,keepBackups=false;
 const stat=file=>{try{return fs.lstatSync(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
 const ensureDirectory=directory=>{
  const info=stat(directory);
  if(info){if(info.isSymbolicLink()||!info.isDirectory())throw Error(`Output directory must be a directory, not a symbolic link: ${directory}`);return;}
  ensureDirectory(path.dirname(directory));fs.mkdirSync(directory);created.push(directory);
 };
 try{
  ensureDirectory(directory);
  for(const [relative] of entries){
   let parent=directory;
   for(const part of relative.split(path.sep).slice(0,-1)){parent=path.join(parent,part);ensureDirectory(parent);}
   const target=path.join(directory,relative),info=stat(target);
   if(info&&!info.isFile())throw Error(`Output product must be a regular file, not a directory or symbolic link: ${target}`);
  }
  // Probe actual parent write permissions before replacing any product. A
  // read-only regular file can legitimately be replaced on POSIX.
  for(const parent of new Set(entries.map(([relative])=>path.dirname(path.join(directory,relative))))){
   const probe=fs.mkdtempSync(path.join(parent,'.publication-probe-'));fs.rmdirSync(probe);
  }
  temporary=fs.mkdtempSync(path.join(directory,'.publication-'));
  for(const [relative,text] of entries){
   const staged=path.join(temporary,'new',relative),original=path.join(directory,relative);
   fs.mkdirSync(path.dirname(staged),{recursive:true});fs.writeFileSync(staged,text,{encoding:'utf8',flag:'wx'});
   if(stat(original)){
    const backup=path.join(temporary,'old',relative);
    fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(original,backup,fs.constants.COPYFILE_EXCL);backups.set(relative,backup);
   }
  }
  for(const [relative] of entries){fs.renameSync(path.join(temporary,'new',relative),path.join(directory,relative));published.push(relative);}
 }catch(failure){
  const errors=[];
  for(const relative of published.reverse())try{
   const target=path.join(directory,relative);
   if(backups.has(relative))fs.renameSync(backups.get(relative),target);else fs.unlinkSync(target);
  }catch(error){errors.push(`${relative}: ${error.message}`);}
  if(errors.length){keepBackups=true;throw new Error(`Publication failed and rollback was incomplete; recovery files retained at ${temporary}: ${errors.join('; ')}`,{cause:failure});}
  throw failure;
 }finally{
  if(temporary&&!keepBackups)fs.rmSync(temporary,{recursive:true,force:true});
  if(!keepBackups)for(const directory of created.reverse())try{fs.rmdirSync(directory);}catch{/* Keep nonempty directories and unrelated files. */}
 }
}
