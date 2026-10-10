import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT, runPython} from './python.mjs';
import {validateSchema} from './validate-data.mjs';

export function createChapter(id, title, root = ROOT) {
  const config = {schemaVersion:'1.0',id,title,contentVersion:'1.0.0',stage:'prototype',visualStyle:'textbook',caseId:'one_round_red_blue'};
  validateSchema('chapter', config);
  const directory = path.join(root, 'chapters', id);
  if (fs.existsSync(directory)) throw new Error(`Chapter already exists: ${id}`);
  fs.mkdirSync(directory); // Parent must exist; never follow a caller-controlled chapter path.
  try {
    fs.mkdirSync(path.join(directory, 'narration'));
    fs.writeFileSync(path.join(directory,'chapter.json'),JSON.stringify(config,null,2)+'\n');
    const generator = path.join(directory,'narration/build_narration.py');
    fs.copyFileSync(path.join(ROOT,'templates/chapter/build_narration.py'),generator);
    fs.writeFileSync(path.join(directory,'README.md'),`# ${title}\n\n原创两段测试内容；B 暖白/深蓝教材风。当前为原型，没有音轨或完整视频。\n\n编辑 narration/build_narration.py 后执行 npm run build:narration -- ${id}，再运行 npm test。\n`);
    const result = runPython([generator],{encoding:'utf8',stdio:'pipe'});
    if(result.status !== 0) throw new Error(result.stderr || 'Chapter build failed');
    return directory;
  } catch(error) { fs.rmSync(directory,{recursive:true,force:true}); throw error; }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [id,title]=process.argv.slice(2);
  if(!id || !title) throw new Error('Usage: npm run chapter:new -- 02-example "章节标题"');
  createChapter(id,title);
  console.log(`Created chapters/${id}; edit its authored narration and run npm test.`);
}
