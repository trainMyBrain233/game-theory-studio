import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAppliedFont} from '../typography/font-contract.mjs';
const expected={size:34,weight:700,family:'GameTheory Noto Sans SC'};
test('font contract checks applied context size, weight and the complete family',()=>{
 assert.equal(assertAppliedFont({font:'700 34px "GameTheory Noto Sans SC"'},expected).weight,700);
 assert.equal(assertAppliedFont({font:'bold 34px "GameTheory Noto Sans SC"'},expected).weight,700);
 assert.equal(assertAppliedFont({font:'34px "GameTheory Noto Sans SC"'},{...expected,weight:400}).weight,400);
});
for(const [label,font,reason] of [
 ['forced regular','400 34px "GameTheory Noto Sans SC"',/weight must be 700/],
 ['clamped size','700 8px "GameTheory Noto Sans SC"',/size must be 34px/],
 ['wrong region','700 34px "Noto Sans CJK JP"',/family must be/],
 ['fallback list','700 34px "GameTheory Noto Sans SC", sans-serif',/family must be/],
 ['wrong family','700 34px "GameTheory Noto Serif SC"',/family must be/],
])test(`font contract rejects ${label}`,()=>assert.throws(()=>assertAppliedFont({font},expected),reason));
