import {createHash} from 'node:crypto';

export const PUBLIC_EDITORIAL_SOURCE_PATH = 'chapters/01-four-elements/editorial/zombie-kingdom-r2/第一集_语义块草稿_无音频时间码.json';
export const PUBLIC_EDITORIAL_BLOCK_IDS = Object.freeze(
  Array.from({length: 40}, (_, index) => `zk01_b${String(index + 1).padStart(2, '0')}`)
);

const SOURCE_SCHEMA = 'zombie_kingdom_semantic_draft_v1';
const SERIALIZATION = 'double-lf-between-blocks-single-lf-at-end';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function fail(message) {
  throw new TypeError(`Public editorial source binding: ${message}`);
}

function validateSourcePath(sourcePath) {
  if (typeof sourcePath !== 'string' || !sourcePath.isWellFormed() ||
      sourcePath.length === 0 || sourcePath.trim() !== sourcePath ||
      /[\\:%?#\u0000-\u001f\u007f]/u.test(sourcePath) ||
      sourcePath.startsWith('~') || !sourcePath.endsWith('.json') ||
      sourcePath.split('/').some(part => part === '' || part === '.' || part === '..' || part.trim() !== part)) {
    fail('sourcePath must be an unambiguous repository-relative JSON path without traversal.');
  }
}

/**
 * Bind the supplied UTF-8 bytes of the public 40-block editorial draft.
 *
 * The caller loads the bytes and supplies their repository-relative provenance
 * label. This module performs no I/O and cannot attest where bytes were read.
 * It records a newly bound public source, not equality with any other original.
 * This is source identity only: it validates neither narration semantics nor
 * schedules, editorial approval, recordings, alignment, or audio readiness.
 *
 * File SHA-256 covers the exact supplied bytes. Per-block SHA-256 covers each
 * decoded voiceover's exact UTF-8 bytes, without trimming or normalization.
 * The spoken SHA-256 covers those texts joined with two LF bytes and followed
 * by one final LF byte, matching the public teleprompter text convention.
 */
export function bindPublicEditorialSource({sourceBytes, sourcePath = PUBLIC_EDITORIAL_SOURCE_PATH} = {}) {
  validateSourcePath(sourcePath);
  if (!(sourceBytes instanceof Uint8Array) || sourceBytes.byteLength === 0) {
    fail('sourceBytes must be a nonempty Uint8Array of UTF-8 bytes.');
  }
  // Snapshot the visible byte range; never retain or mutate the caller's buffer.
  const bytes = Uint8Array.from(sourceBytes);
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch {
    fail('sourceBytes must contain valid UTF-8.');
  }
  let document;
  try {
    document = JSON.parse(decoded);
  } catch {
    fail('sourceBytes must contain valid JSON.');
  }
  if (!isRecord(document) || document.schema !== SOURCE_SCHEMA) {
    fail(`source schema must be ${SOURCE_SCHEMA}.`);
  }
  if (!Array.isArray(document.blocks) || document.blocks.length !== PUBLIC_EDITORIAL_BLOCK_IDS.length) {
    fail('source must contain exactly 40 public editorial blocks.');
  }

  const seen = new Set();
  const blocks = document.blocks.map((block, index) => {
    if (!isRecord(block) || typeof block.id !== 'string' || block.id.length === 0) {
      fail(`block ${index + 1} must have an ID.`);
    }
    if (seen.has(block.id)) fail(`duplicate block ID at position ${index + 1}.`);
    seen.add(block.id);
    if (block.id !== PUBLIC_EDITORIAL_BLOCK_IDS[index]) {
      fail(`block ${index + 1} must have ID ${PUBLIC_EDITORIAL_BLOCK_IDS[index]} in source order.`);
    }
    if (typeof block.voiceover !== 'string' || block.voiceover.trim().length === 0 || !block.voiceover.isWellFormed()) {
      fail(`block ${index + 1} must have nonempty, well-formed voiceover text.`);
    }
    return Object.freeze({
      id: block.id,
      voiceover: block.voiceover,
      textSha256: sha256(Buffer.from(block.voiceover, 'utf8'))
    });
  });
  const spokenBytes = Buffer.from(blocks.map(block => block.voiceover).join('\n\n') + '\n', 'utf8');

  return Object.freeze({
    schema: 'public_animatic_source_binding_v1',
    provenance: 'newly_bound_public_editorial_source',
    source: Object.freeze({path: sourcePath, sha256: sha256(bytes), byteLength: bytes.byteLength}),
    groupCount: blocks.length,
    blocks: Object.freeze(blocks),
    spoken: Object.freeze({sha256: sha256(spokenBytes), byteLength: spokenBytes.byteLength, serialization: SERIALIZATION})
  });
}
