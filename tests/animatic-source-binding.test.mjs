import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  bindPublicEditorialSource,
  PUBLIC_EDITORIAL_BLOCK_IDS,
  PUBLIC_EDITORIAL_SOURCE_PATH
} from '../production/src/animatic/source-binding.mjs';

const sourceBytes = readFileSync(new URL(`../${PUBLIC_EDITORIAL_SOURCE_PATH}`, import.meta.url));
const sourceDocument = () => JSON.parse(sourceBytes.toString('utf8'));
const bytesOf = document => Buffer.from(JSON.stringify(document), 'utf8');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const bind = bytes => bindPublicEditorialSource({sourceBytes: bytes});

test('public source binding hashes the actual repository bytes and all 40 voiceovers', () => {
  const original = Buffer.from(sourceBytes);
  const source = sourceDocument();
  const binding = bind(sourceBytes);
  const ids = Array.from({length: 40}, (_, index) => `zk01_b${String(index + 1).padStart(2, '0')}`);
  const spoken = readFileSync(new URL('../chapters/01-four-elements/editorial/zombie-kingdom-r2/第一集_提词器净稿_r2.txt', import.meta.url));

  assert.equal(binding.schema, 'public_animatic_source_binding_v1');
  assert.equal(binding.provenance, 'newly_bound_public_editorial_source');
  assert.equal(binding.groupCount, 40);
  assert.deepEqual(binding.source, {path: PUBLIC_EDITORIAL_SOURCE_PATH, sha256: digest(sourceBytes), byteLength: sourceBytes.byteLength});
  assert.deepEqual(binding.blocks.map(block => block.id), ids);
  assert.deepEqual(PUBLIC_EDITORIAL_BLOCK_IDS, ids);
  for (const [index, block] of binding.blocks.entries()) {
    assert.equal(block.voiceover, source.blocks[index].voiceover);
    assert.equal(block.textSha256, digest(Buffer.from(source.blocks[index].voiceover, 'utf8')));
  }
  assert.equal(spoken.toString('utf8'), source.blocks.map(block => block.voiceover).join('\n\n') + '\n');
  assert.deepEqual(binding.spoken, {
    sha256: digest(spoken), byteLength: spoken.byteLength,
    serialization: 'double-lf-between-blocks-single-lf-at-end'
  });
  assert.deepEqual(sourceBytes, original, 'binding must not change the supplied source');
});

test('format-only JSON whitespace changes file identity but preserves spoken identity', () => {
  const original = bind(sourceBytes);
  const compact = bytesOf(sourceDocument());
  const changed = bind(compact);
  assert.notEqual(changed.source.sha256, original.source.sha256);
  assert.deepEqual(changed.blocks, original.blocks);
  assert.deepEqual(changed.spoken, original.spoken);
  assert.equal(changed.source.sha256, digest(compact));
});

test('changed Chinese names and numbers bind without hardcoded narration', () => {
  const original = bind(sourceBytes);
  const document = sourceDocument();
  document.blocks[0].voiceover = '明月同学和青禾同学准备比较十一分与二十二分。';
  document.blocks[24].voiceover = '明月同学得十一分，青禾同学得十二分。';
  const changed = bind(bytesOf(document));
  assert.notEqual(changed.source.sha256, original.source.sha256);
  assert.notEqual(changed.spoken.sha256, original.spoken.sha256);
  assert.notEqual(changed.blocks[0].textSha256, original.blocks[0].textSha256);
  assert.notEqual(changed.blocks[24].textSha256, original.blocks[24].textSha256);
  assert.equal(changed.blocks[0].voiceover, document.blocks[0].voiceover);
  assert.deepEqual(changed.blocks.filter((_, index) => index !== 0 && index !== 24),
    original.blocks.filter((_, index) => index !== 0 && index !== 24));
});

test('voiceover text is hashed exactly without whitespace or Unicode normalization', () => {
  const document = sourceDocument();
  document.blocks[0].voiceover = '旁白 e\u0301 ';
  const original = bind(bytesOf(document));
  document.blocks[0].voiceover = '旁白 é';
  const changed = bind(bytesOf(document));
  assert.notEqual(changed.blocks[0].textSha256, original.blocks[0].textSha256);
  assert.notEqual(changed.spoken.sha256, original.spoken.sha256);
  assert.equal(original.blocks[0].voiceover, '旁白 e\u0301 ');
});

test('binding rejects absent, duplicate, missing, extra, and reordered public block IDs', () => {
  const mutations = [
    [document => delete document.blocks[0].id, /must have an ID/],
    [document => { document.blocks[1].id = document.blocks[0].id; }, /duplicate block ID/],
    [document => document.blocks.pop(), /exactly 40/],
    [document => document.blocks.push(document.blocks[0]), /exactly 40/],
    [document => { document.blocks[0].id = 'other_b01'; }, /must have ID zk01_b01/],
    [document => { [document.blocks[0], document.blocks[1]] = [document.blocks[1], document.blocks[0]]; }, /source order/],
    [document => { document.blocks[0] = null; }, /must have an ID/]
  ];
  for (const [mutate, message] of mutations) {
    const document = sourceDocument();
    mutate(document);
    assert.throws(() => bind(bytesOf(document)), message);
  }
});

test('binding rejects malformed bytes, JSON, source shape, and voiceover text', () => {
  for (const input of [undefined, null, '', sourceBytes.toString('utf8'), [], new ArrayBuffer(4), new Uint8Array()]) {
    assert.throws(() => bind(input), /sourceBytes.*Uint8Array/);
  }
  for (const bytes of [Buffer.from([0xc0, 0xaf]), Buffer.from([0xe4, 0xb8]), Buffer.from([0xff])]) {
    assert.throws(() => bind(bytes), /valid UTF-8/);
  }
  assert.throws(() => bind(Buffer.from('{')), /valid JSON/);
  for (const document of [null, [], {}, {schema: 'other'}, {schema: 'zombie_kingdom_semantic_draft_v1', blocks: {}}]) {
    assert.throws(() => bind(bytesOf(document)), /source schema|exactly 40/);
  }
  for (const voiceover of [undefined, null, 42, '', ' \n ', '\ud800', '\udfff']) {
    const document = sourceDocument();
    document.blocks[0].voiceover = voiceover;
    assert.throws(() => bind(bytesOf(document)), /well-formed voiceover/);
  }
});

test('only unambiguous repository-relative JSON source paths are accepted', () => {
  const paths = [undefined, null, '', '/', '/outside.json', '../outside.json', 'a/../outside.json',
    './source.json', 'a/./source.json', 'a//source.json', 'C:' + '/source.json', 'C:' + String.fromCharCode(92) + 'source.json',
    String.fromCharCode(92).repeat(2) + ['server', 'source.json'].join(String.fromCharCode(92)), 'https://example.org/source.json', 'file:source.json',
    '%2e%2e/source.json', 'a/%2fsource.json', '~user/source.json', 'source.json?x=1',
    'source.json#id', 'source.txt', ' source.json', 'source.json ', 'a/ /source.json',
    'a/\u0000source.json', 'a/\nsource.json', 'a/\ud800.json'];
  for (const sourcePath of paths.filter(value => value !== undefined)) {
    assert.throws(() => bindPublicEditorialSource({sourceBytes, sourcePath}), /repository-relative JSON path/);
  }
  const sourcePath = 'public variants/更名_40块.json';
  const alternate = bindPublicEditorialSource({sourceBytes, sourcePath});
  assert.equal(alternate.source.path, sourcePath);
  assert.equal(alternate.source.sha256, bind(sourceBytes).source.sha256);
});

test('receipt is deeply frozen, deterministic, detached from input, and only about source identity', () => {
  const bytes = new Uint8Array(sourceBytes);
  const options = {sourceBytes: bytes, sourcePath: PUBLIC_EDITORIAL_SOURCE_PATH};
  const before = structuredClone(options);
  const first = bindPublicEditorialSource(options);
  const second = bindPublicEditorialSource(options);
  assert.deepEqual(first, second);
  assert.deepEqual(options, before);
  for (const object of [first, first.source, first.spoken, first.blocks, ...first.blocks, PUBLIC_EDITORIAL_BLOCK_IDS]) {
    assert.ok(Object.isFrozen(object));
  }
  assert.throws(() => { first.source.sha256 = 'changed'; }, TypeError);
  assert.throws(() => { first.blocks[0].voiceover = 'changed'; }, TypeError);
  assert.throws(() => first.blocks.pop(), TypeError);
  bytes.fill(0);
  options.sourcePath = 'changed.json';
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ['blocks', 'groupCount', 'provenance', 'schema', 'source', 'spoken']);
  assert.deepEqual(Object.keys(first.blocks[0]).sort(), ['id', 'textSha256', 'voiceover']);
});

test('only a supplied Uint8Array view is hashed, never surrounding backing bytes', () => {
  const padded = Buffer.concat([Buffer.from('prefix'), sourceBytes, Buffer.from('suffix')]);
  const bytes = new Uint8Array(padded.buffer, padded.byteOffset + 6, sourceBytes.length);
  assert.deepEqual(bind(bytes), bind(sourceBytes));
});
