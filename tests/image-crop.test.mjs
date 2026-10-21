import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCrop,coverCrop,cropImage,FULL_CROP} from '../src/crop.js';
import {cleanItem} from '../src/model.js';
import {newRecord,migrateRecord,copyRecord} from '../app/designs.js';
const item={t:'image',url:'data:image/png;base64,AAAA',x:50,y:50,w:40,h:40,rot:0,mask:'none',id:'ecropfixture001',assetRefs:['acropfixture001']};
test('crop rejects malformed/empty/out-of-image rectangles; old/full photos stay unchanged',()=>{
  assert.equal(cleanCrop(undefined),null);assert.equal(cleanCrop(FULL_CROP),null);
  for(const v of [{x:0,y:0,w:0,h:1},{x:-.1,y:0,w:.5,h:1},{x:.8,y:0,w:.3,h:1},{x:0,y:0,w:NaN,h:1},{x:0,y:0,w:'1',h:1}])assert.throws(()=>cleanCrop(v));
  assert.equal(cleanItem(item).crop,undefined);
});
test('cropping keeps source bytes, IDs, asset links and the selected pixel positions; full reset is reversible',()=>{
  for(const rot of [0,30,90,270])for(const fx of [false,true])for(const fy of [false,true]){
    const source={...item,rot,fx,fy},original=structuredClone(source);
    const cropped=cropImage(source,{x:.25,y:0,w:.5,h:.75},{aspect:16/9});
    assert.equal(cropped.url,source.url);assert.equal(cropped.id,source.id);assert.deepEqual(cropped.assetRefs,source.assetRefs);
    const restored=cropImage(cropped,FULL_CROP,{aspect:16/9});
    for(const key of ['x','y','w','h'])assert.ok(Math.abs(restored[key]-source[key])<.00001,key);
    assert.deepEqual(source,original);
    assert.deepEqual(cleanItem(cropped).crop,{x:.25,y:0,w:.5,h:.75});
  }
});
test('initial crop matches the old centered cover for a mismatched image/frame aspect',()=>{
  assert.deepEqual(coverCrop(2,1),{x:.25,y:0,w:.5,h:1});
  assert.deepEqual(coverCrop(1,2),{x:0,y:.25,w:1,h:.5});
});
test('crop survives repeated record save/reopen and copies; invalid crop is rejected at the storage boundary',()=>{
 const record=newRecord('16:9'),photo=cleanItem({...item,assetRefs:undefined,crop:{x:.2,y:.1,w:.6,h:.8}});record.slides[0].items=[photo];
 const once=migrateRecord(record),twice=migrateRecord(JSON.parse(JSON.stringify(once)));assert.deepEqual(twice.slides[0].items[0].crop,photo.crop);assert.deepEqual(copyRecord(twice).slides[0].items[0].crop,photo.crop);
 record.slides[0].items[0].crop.w=2;assert.throws(()=>migrateRecord(record));
});
