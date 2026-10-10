import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './python.mjs';

export function chapterDirectories(root = ROOT) {
  return fs.readdirSync(path.join(root, 'chapters'), {withFileTypes: true})
    .filter(entry => entry.isDirectory()).map(entry => path.join(root, 'chapters', entry.name)).sort();
}
export function chapterConfig(directory) {
  return JSON.parse(fs.readFileSync(path.join(directory, 'chapter.json'), 'utf8'));
}
