import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withSourceFixture} from '../scripts/source-fixture.mjs';
const run=root=>spawnSync(process.execPath,['--import','./scripts/isolated-fonts.mjs','design/experiments/tabletop/qa-matrix.mjs'],{cwd:root,encoding:'utf8'});
test('tabletop matrix checks eight actual rasters for four choices, asymmetric ownership and alpha clearance',()=>{
 withSourceFixture(root=>{const result=run(root);assert.equal(result.status,0,result.stdout+result.stderr);});
});
for(const [name,file,from,to,reason] of [
 ['fixed-RB-selection','identity-matrix.mjs','row===presentation.scene.selected.row&&column===presentation.scene.selected.column','row===0&&column===1',/MATRIX_FILL/],
 ['swapped-row-column-selection','identity-matrix.mjs','row===presentation.scene.selected.row&&column===presentation.scene.selected.column','row===presentation.scene.selected.column&&column===presentation.scene.selected.row',/MATRIX_FILL/],
 ['invisible-payoff-ink','identity-matrix.mjs',"48,700,C.ink,'center'","48,700,C.paper,'center'",/FINAL_GLYPH_PIXELS/],
 ['missing-selected-border','identity-matrix.mjs','selected?4:2.5','2.5',/MATRIX_BORDER/],
 ['swapped-payoff-owners','identity-matrix.mjs',"presentation.matrix.values[row][column].join(', ')","[...presentation.matrix.values[row][column]].reverse().join(', ')",/Actual payoff\/name text differs/],
 ['transposed-matrix','identity-matrix.mjs','presentation.matrix.values[row][column]','presentation.matrix.values[column][row]',/Actual payoff\/name text differs/],
 ['old-column-clearance','identity-matrix.mjs','mx+cw-186,350,72','mx+cw-170,350,72',/AVATAR_NAME_CLEARANCE column-B/],
 ['old-row-clearance','text-layout.mjs','avatarX:840','avatarX:854',/AVATAR_NAME_CLEARANCE row-A-0/],
])test(`tabletop raster regression rejects ${name}`,()=>{
 withSourceFixture(root=>{
  const target=path.join(root,'design/experiments/tabletop',file),source=fs.readFileSync(target,'utf8');assert.ok(source.includes(from),`Mutation anchor missing: ${name}`);
  fs.writeFileSync(target,source.replace(from,to));const result=run(root);assert.notEqual(result.status,0,`${name} unexpectedly passed`);assert.match(result.stdout+result.stderr,reason);
 });
});
