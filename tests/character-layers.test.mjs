import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {layerContract,CHARACTER_CAPABILITIES,RIG} from '../production/src/character-layers.mjs';
import {prepareCharacterAssets,assets,drawCharacter} from '../production/src/rgba_character_rig.mjs';

test('layer contract uses prepared pivots and declares only actual four-part capabilities',()=>{
 assert.equal(CHARACTER_CAPABILITIES.partsPerActor,4);
 assert.equal(CHARACTER_CAPABILITIES.independentEyes,false);assert.equal(CHARACTER_CAPABILITIES.secondArticulatedHand,false);
 for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm']){
  const contract=layerContract(id,part);
  assert.equal(contract.prepare_flip_x,part==='torso'||id==='b');assert.equal(contract.rigSpace,'prepared');
  assert.equal(contract.cropHeight,part==='upper'?270:null);
  assert.equal(contract.distribution,'external_private_not_in_MIT_repository');
 }
 assert.deepEqual(layerContract('b','forearm').pivot,RIG.b.forePivot);
});

test('real loader reports eight original RGBA fixtures and applies preparation mirror once',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-original-layer-contract-'));
 try{
  fs.mkdirSync(path.join(directory,'assets'));
  const image=createCanvas(320,500),c=image.getContext('2d');c.fillStyle='#BC3D31';c.fillRect(0,0,160,500);c.fillStyle='#345D9E';c.fillRect(160,0,160,500);
  const bytes=image.toBuffer('image/png'),sha256=createHash('sha256').update(bytes).digest('hex');
  for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm'])fs.writeFileSync(path.join(directory,'assets',`${id}_${part}.png`),bytes);
  const manifest=await prepareCharacterAssets({directory});assert.equal(manifest.layers.length,8);
  for(const layer of manifest.layers){
   assert.deepEqual(layer.stored,{width:320,height:500,bytes:bytes.length,sha256});assert.deepEqual(layer.prepared,{width:320,height:500});
   const sample=createCanvas(320,500),x=sample.getContext('2d');x.drawImage(assets[layer.id],0,0);
   assert.deepEqual([...x.getImageData(5,5,1,1).data],layer.prepare_flip_x?[52,93,158,255]:[188,61,49,255]);
  }
  const rendered=createCanvas(1920,1080),pose=drawCharacter(rendered.getContext('2d'),'b',{x:1000,y:500,scale:.6,side:-1,t:13,handOverride:[250,296]});
  assert.equal(pose.handClamped,false);assert.ok(rendered.data().some(value=>value!==0));
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
