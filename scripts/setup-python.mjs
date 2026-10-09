import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ROOT, pythonCommand} from './python.mjs';

const VERSION_CHECK = `import sys, unicodedata
if sys.version_info < (3, 12) or tuple(map(int, unicodedata.unidata_version.split('.'))) < (15, 0, 0):
    raise SystemExit('Python 3.12+ with Unicode 15.0+ required for text contracts')`;

export function setupPython({root = ROOT, bootstrap = pythonCommand({system: true}), spawn = spawnSync, exists = fs.existsSync, log = console.log} = {}) {
  const directory = path.join(root, '.venv');
  const venv = path.join(directory, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  function run(command, args, guidance = '') {
    const result = spawn(command, args, {cwd: root, stdio: 'inherit'});
    if (result.error || result.status !== 0) throw new Error(`Python setup failed: ${result.error?.message ?? result.status}.${guidance ? ` ${guidance}` : ''}`);
  }
  const migration = 'The selected .venv interpreter is unsupported or unavailable. Move the existing .venv aside without deleting it, then rerun npm run setup:python with PYTHON set to a Python 3.12+ interpreter. No packages were installed by this run.';
  run(bootstrap, ['-c', VERSION_CHECK], 'Select a Python 3.12+ interpreter using PYTHON, then rerun npm run setup:python.');
  // Re-running `python -m venv` over an existing directory need not replace its
  // interpreter symlink. Check it before any mutation, and check the final target.
  if (exists(directory)) run(venv, ['-c', VERSION_CHECK], migration);
  run(bootstrap, ['-m', 'venv', directory]);
  run(venv, ['-c', VERSION_CHECK], migration);
  // PYTHON selects the bootstrap, but dependency installation uses this exact venv.
  run(venv, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', path.join(root, 'requirements.txt')]);
  log('Python environment ready. npm commands automatically select .venv; activation is optional.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) setupPython();
