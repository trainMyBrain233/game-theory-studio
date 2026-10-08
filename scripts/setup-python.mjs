import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, pythonCommand} from './python.mjs';

function run(command, args) {
  const result = spawnSync(command, args, {cwd: ROOT, stdio: 'inherit'});
  if (result.error || result.status !== 0) throw new Error(`Python setup failed: ${result.error?.message ?? result.status}`);
}
const python = pythonCommand({system: true});
run(python, ['-c', 'import sys; assert sys.version_info >= (3, 10), "Python 3.10+ required"']);
run(python, ['-m', 'venv', path.join(ROOT, '.venv')]);
// Select the newly created virtual environment even when PYTHON selects the bootstrap interpreter.
const venv = path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
run(venv, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', path.join(ROOT, 'requirements.txt')]);
console.log('Python environment ready. npm commands automatically select .venv; activation is optional.');
