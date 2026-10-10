import path from 'node:path';
import {chapterDirectories, chapterConfig} from './chapters.mjs';
import {runPython} from './python.mjs';

const id = process.argv[2];
const chapters = chapterDirectories().filter(directory => !id || chapterConfig(directory).id === id);
if (!chapters.length) throw new Error(`Unknown chapter: ${id}`);
for (const directory of chapters) {
  const result = runPython([path.join(directory, 'narration/build_narration.py')]);
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
