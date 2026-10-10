import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {layerContract,CHARACTER_CAPABILITIES,RIG} from '../production/src/character-layers.mjs';
import {prepareCharacterAssets,assets,assetManifest,drawCharacter} from '../production/src/rgba_character_rig.mjs';

test('layer contract uses prepared pivots and declares only actual four-part capabilities',()=>{
 assert.equal(CHARACTER_CAPABILITIES.partsPerActor,4);
 assert.equal(CHARACTER_CAPABILITIES.independentEyes,false);assert.equal(CHARACTER_CAPABILITIES.secondArticulatedHand,false);
 for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm']){
  const contract=layerContract(id,part);
  assert.equal(contract.prepare_flip_x,part==='torso'?id==='a':id==='b');assert.equal(contract.rigSpace,'prepared');
  assert.equal(contract.preparedFacing,'right');assert.equal(contract.worldFacing,id==='a'?'right':'left');assert.equal(contract.sceneSide,id==='a'?1:-1);
  assert.equal(contract.cropHeight,part==='upper'?270:null);
  assert.equal(contract.distribution,'external_private_not_in_MIT_repository');
 }
 assert.deepEqual(layerContract('b','forearm').pivot,RIG.b.forePivot);
});

test('the real bitmap loader and scene mirror align independently drawn directional layers',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-original-facing-'));
 // Independent source specification: asymmetric original arrows, never character art.
 const source={a:{head:'right',torso:'left',upper:'right',forearm:'right'},b:{head:'left',torso:'right',upper:'left',forearm:'left'}};
 try{
  fs.mkdirSync(path.join(directory,'assets'));
  for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm']){
   const c=createCanvas(320,500),x=c.getContext('2d');
   x.fillStyle='#243E66';x.fillRect(80,80,160,40);
   x.fillStyle='#BC3D31';x.beginPath();
   if(source[id][part]==='right'){x.moveTo(220,55);x.lineTo(280,100);x.lineTo(220,145);}else{x.moveTo(100,55);x.lineTo(40,100);x.lineTo(100,145);}
   x.closePath();x.fill();fs.writeFileSync(path.join(directory,'assets',`${id}_${part}.png`),c.toBuffer('image/png'));
  }
  const manifest=await prepareCharacterAssets({directory});assert.equal(manifest.schemaVersion,'1.1');
  for(const layer of manifest.layers){
   const prepared=createCanvas(320,500),p=prepared.getContext('2d');p.drawImage(assets[layer.id],0,0);
   assert.equal(p.getImageData(260,100,1,1).data[0],188,`${layer.id}: prepared arrow must point right.`);
   assert.equal(p.getImageData(60,100,1,1).data[3],0,`${layer.id}: no left-facing arrow in canonical space.`);
   const world=createCanvas(320,500),w=world.getContext('2d');
   const side=layer.id.startsWith('a_')?1:-1;w.translate(side===1?0:320,0);w.scale(side,1);w.drawImage(assets[layer.id],0,0);
   assert.equal(w.getImageData(side===1?260:60,100,1,1).data[0],188,`${layer.id}: final scene orientation must agree.`);
   assert.equal(w.getImageData(side===1?60:260,100,1,1).data[3],0);
  }
  for(const id of ['a','b']){
   const world=createCanvas(600,800),w=world.getContext('2d'),anchor=id==='a'?40:400,side=id==='a'?1:-1;
   drawCharacter(w,id,{x:anchor,y:400,scale:1,t:13,layer:'body',headAngleOverride:0});
   for(const [offsetX,offsetY] of [[0,0],RIG[id].head]){
    assert.equal(w.getImageData(anchor+side*(offsetX+260),400+offsetY+100,1,1).data[0],188,`${id}: actual head/body draw consumes the canonical direction and scene mirror.`);
    assert.equal(w.getImageData(anchor+side*(offsetX+60),400+offsetY+100,1,1).data[3],0);
   }
  }
  // Reproduce the old extra B-torso preparation flip against real pixel data.
  const wrong=createCanvas(320,500),w=wrong.getContext('2d');w.translate(320,0);w.scale(-1,1);w.drawImage(assets.b_torso,0,0);
  assert.equal(w.getImageData(260,100,1,1).data[3],0,'Old B torso normalization destroys rightward canonical pixels.');
  assert.equal(w.getImageData(60,100,1,1).data[0],188);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
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

// All fixtures below are original synthetic pixels; private artwork is never
// copied into this repository or used to manufacture acceptance evidence.
function writeSyntheticCast(directory,{width=320,height=500,alpha=255}={}){
 fs.mkdirSync(path.join(directory,'assets'),{recursive:true});
 const c=createCanvas(width,height),ctx=c.getContext('2d');
 const pixel=ctx.createImageData(1,1);pixel.data.set([188,61,49,alpha]);ctx.putImageData(pixel,1,1);
 const bytes=c.toBuffer('image/png');
 for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm'])fs.writeFileSync(path.join(directory,'assets',`${id}_${part}.png`),bytes);
 return bytes;
}

test('every required layer rejects empty alpha and upper arms reject pixels outside the actual crop',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-original-alpha-'));
 try{
  const valid=writeSyntheticCast(directory);
  const empty=createCanvas(320,500).toBuffer('image/png');
  for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm']){
   const file=path.join(directory,'assets',`${id}_${part}.png`);
   fs.writeFileSync(file,empty);
   await assert.rejects(()=>prepareCharacterAssets({directory}),error=>error.code==='PRIVATE_ASSET_EMPTY_ALPHA'&&error.message.includes(`${id}_${part}`));
   fs.writeFileSync(file,valid);
  }
  const cropped=createCanvas(320,500),ctx=cropped.getContext('2d');ctx.fillStyle='#243E66';ctx.fillRect(0,270,320,230);
  for(const id of ['a','b']){
   const file=path.join(directory,'assets',`${id}_upper.png`);fs.writeFileSync(file,cropped.toBuffer('image/png'));
   await assert.rejects(()=>prepareCharacterAssets({directory}),{code:'PRIVATE_ASSET_EMPTY_ALPHA'});
   // Row 269 is used; row 270 is not. Exercise both preparation directions.
   ctx.fillRect(1,269,1,1);fs.writeFileSync(file,cropped.toBuffer('image/png'));
   await prepareCharacterAssets({directory});fs.writeFileSync(file,valid);ctx.clearRect(0,269,320,1);
  }
  writeSyntheticCast(directory,{alpha:1});
  assert.equal((await prepareCharacterAssets({directory})).layers.length,8,'Any genuinely nonzero alpha in a geometry-valid used range is valid.');
  for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm'])fs.writeFileSync(path.join(directory,'assets',`${id}_${part}.png`),empty);
  await assert.rejects(()=>prepareCharacterAssets({directory}),{code:'PRIVATE_ASSET_EMPTY_ALPHA'});
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('late missing, malformed, transparent or undersized layers leave the whole accepted cast and manifest unchanged',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-original-atomic-cast-'));
 try{
  writeSyntheticCast(directory);
  await prepareCharacterAssets({directory});
  const accepted={...assets},manifest=assetManifest;
  const last=path.join(directory,'assets','b_forearm.png');
  for(const failure of ['missing','malformed','transparent','undersized']){
   writeSyntheticCast(directory,{width:321,height:501});
   if(failure==='missing')fs.unlinkSync(last);
   else fs.writeFileSync(last,failure==='malformed'?Buffer.from('not an image'):failure==='undersized'?opaquePng(8,8):createCanvas(321,501).toBuffer('image/png'));
   await assert.rejects(()=>prepareCharacterAssets({directory}),error=>failure==='malformed'?error.code==='InvalidArg':error.code===(failure==='missing'?'PRIVATE_ASSET_MISSING':failure==='undersized'?'PRIVATE_ASSET_GEOMETRY':'PRIVATE_ASSET_EMPTY_ALPHA'));
   assert.equal(assetManifest,manifest,`${failure}: manifest must remain the accepted one`);
   assert.deepEqual(Object.keys(assets),Object.keys(accepted));
   for(const [id,image] of Object.entries(accepted))assert.equal(assets[id],image,`${failure}: ${id} must remain the accepted bitmap`);
  }
  writeSyntheticCast(directory,{width:321,height:501});
  const replacement=await prepareCharacterAssets({directory});assert.notEqual(replacement,manifest);
  for(const [id,image] of Object.entries(accepted))assert.notEqual(assets[id],image);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

function opaquePng(width,height){
 const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
 ctx.fillStyle='#243E66';ctx.fillRect(0,0,width,height);
 return canvas.toBuffer('image/png');
}

test('opaque 8x8 cast fails geometry before it can replace accepted assets',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-original-tiny-cast-'));
 try{
  writeSyntheticCast(directory);await prepareCharacterAssets({directory});
  const accepted={...assets},manifest=assetManifest;
  const tiny=opaquePng(8,8);
  for(const id of ['a','b'])for(const part of ['head','torso','upper','forearm'])fs.writeFileSync(path.join(directory,'assets',`${id}_${part}.png`),tiny);
  await assert.rejects(()=>prepareCharacterAssets({directory}),error=>error.code==='PRIVATE_ASSET_GEOMETRY'&&/a_head.*113,316/.test(error.message));
  assert.equal(assetManifest,manifest);
  for(const [id,image] of Object.entries(accepted))assert.equal(assets[id],image);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('both actors require source bounds for every consumed pivot, endpoint and upper-arm crop',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-original-geometry-'));
 // Independent minimum dimensions from the rig's consumed geometry. Pivots
 // and endpoints must be inside [0,width) x [0,usedHeight), not on its far edge.
 const minimum={a_head:[114,317],b_head:[84,409],a_torso:[1,1],b_torso:[1,1],a_upper:[76,270],b_upper:[62,270],a_forearm:[279,106],b_forearm:[279,106]};
 try{
  const valid=writeSyntheticCast(directory);
  for(const [layer,[width,height]] of Object.entries(minimum)){
   const file=path.join(directory,'assets',`${layer}.png`);
   fs.writeFileSync(file,opaquePng(width,height));
   const manifest=await prepareCharacterAssets({directory});
   assert.deepEqual(manifest.layers.find(item=>item.id===layer).prepared,{width,height},`${layer}: exact fitting geometry is accepted`);
   for(const [smallWidth,smallHeight] of [[width-1,height],[width,height-1]]){
    // PNG cannot express a zero-sized torso; the loader still validates its
    // intrinsic positive size and origin. No invented torso artwork minimum.
    if(smallWidth===0||smallHeight===0)continue;
    fs.writeFileSync(file,opaquePng(smallWidth,smallHeight));
    await assert.rejects(()=>prepareCharacterAssets({directory}),error=>error.code==='PRIVATE_ASSET_GEOMETRY'&&error.message.includes(layer),`${layer}: ${smallWidth}x${smallHeight} must fail geometry despite opaque pixels`);
   }
   fs.writeFileSync(file,valid);
  }
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
