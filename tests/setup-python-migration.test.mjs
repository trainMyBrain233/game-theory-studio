import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {setupPython} from '../scripts/setup-python.mjs';
import {pythonCommand} from '../scripts/python.mjs';

// No actual venv creation, pip or network. The fake process runner models venv's
// retained interpreter, while every supplied version-check program is executed
// by real Python against that target's simulated sys.version_info/UCD version.
function fixture({existing = false, target = [3, 12, 0], unicode = '15.0.0', bootstrap = [3, 13, 0], broken = false} = {}) {
  const root = path.resolve('isolated-setup-fixture'), base = path.join(root, 'bootstrap-python');
  const venv = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const calls = [], messages = [];
  const spawn = (command, args) => {
    calls.push({command, args});
    if (args[0] === '-c') {
      if (command === venv && broken) return {error: new Error('fixture interpreter missing'), status: null};
      const version = command === base ? bootstrap : target;
      const versionPatch = `import sys,unicodedata\nsys.version_info=tuple(${JSON.stringify(version)})\nunicodedata.unidata_version=${JSON.stringify(command === base ? '16.0.0' : unicode)}\n`;
      return spawnSync(pythonCommand(), ['-c', versionPatch + args[1]], {encoding: 'utf8', env: {...process.env, PYTHONOPTIMIZE: '1'}});
    }
    // Crucially, successful venv creation does not change `target`: this models
    // the stale symlink behavior instead of assuming the bootstrap replaced it.
    if (command === base && args[0] === '-m' && args[1] === 'venv') return {status: 0};
    if (command === venv && args[0] === '-m' && args[1] === 'pip') return {status: 0};
    throw new Error(`Unexpected fixture process: ${command} ${args}`);
  };
  return {calls, messages, base, venv, run: () => setupPython({root, bootstrap: base, spawn, exists: () => existing, log: message => messages.push(message)})};
}
for (const minor of [10, 11]) test(`existing Python 3.${minor} venv fails before mutation or pip despite a supported bootstrap`, () => {
  const value = fixture({existing: true, target: [3, minor, 9], unicode: '14.0.0'});
  assert.throws(value.run, /selected \.venv interpreter.*Move the existing \.venv aside without deleting it/s);
  assert.deepEqual(value.calls.map(call => [call.command, call.args[0]]), [[value.base, '-c'], [value.venv, '-c']]);
  assert.equal(value.messages.length, 0);
});
test('newly selected stale venv target is checked after venv creation and before pip/readiness', () => {
  const value = fixture({target: [3, 11, 9], unicode: '14.0.0'});
  assert.throws(value.run, /No packages were installed/);
  assert.deepEqual(value.calls.map(call => [call.command, ...call.args.slice(0, call.args[0] === '-m' ? 2 : 1)]), [
    [value.base, '-c'], [value.base, '-m', 'venv'], [value.venv, '-c'],
  ]);
  assert.equal(value.messages.length, 0);
});
test('missing existing venv interpreter fails safely without attempting recreation or pip', () => {
  const value = fixture({existing: true, broken: true});
  assert.throws(value.run, /interpreter missing.*without deleting it/s);
  assert.equal(value.calls.length, 2);
  assert.equal(value.messages.length, 0);
});
test('target UCD below Unicode 15 fails even with a Python 3.12 version', () => {
  const value = fixture({existing: true, unicode: '14.0.0'});
  assert.throws(value.run, /selected \.venv interpreter/);
  assert.equal(value.calls.length, 2);
});
test('unsupported bootstrap fails before examining or changing the existing environment', () => {
  const value = fixture({existing: true, bootstrap: [3, 11, 9]});
  assert.throws(value.run, /Select a Python 3.12\+ interpreter/);
  assert.deepEqual(value.calls.map(call => call.command), [value.base]);
});
for (const existing of [false, true]) test(`supported ${existing ? 'existing' : 'new'} target is verified before its own pip process`, () => {
  const value = fixture({existing}); value.run();
  const calls = value.calls, pipIndex = calls.findIndex(call => call.args[1] === 'pip');
  assert.equal(calls[pipIndex].command, value.venv);
  assert.equal(calls[pipIndex - 1].command, value.venv);
  assert.equal(calls[pipIndex - 1].args[0], '-c');
  assert.equal(calls.filter(call => call.command === value.venv && call.args[0] === '-c').length, existing ? 2 : 1);
  assert.equal(value.messages.length, 1); assert.match(value.messages[0], /environment ready/);
});
