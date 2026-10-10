import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function pythonCommand({system = false} = {}) {
  if (process.env.PYTHON) return process.env.PYTHON;
  const local = path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return !system && fs.existsSync(local) ? local : 'python3';
}
export function runPython(args, options = {}) {
  const result = spawnSync(pythonCommand(), args, {cwd: ROOT, stdio: 'inherit', ...options});
  if (result.error) throw new Error(`Cannot start Python: ${result.error.message}. Run npm run setup:python, or set PYTHON to an interpreter path.`);
  return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runPython(process.argv.slice(2));
  process.exitCode = result.status ?? 1;
}
