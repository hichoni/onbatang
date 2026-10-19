import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasRatioOf,migrateRecord,newRecord} from '../app/designs.js';

test('canvas ratio feedback uses exact stored dimensions and distinguishes the source ratio from an explicit size change',()=>{
 const source=newRecord('1:1');source.source={kind:'pptx'};
 for(const [width,height,id,preset]of [[12192000,6858000,'16:9','16:9'],[9144000,6858000,'4:3',null],[11658600,6858000,'17:10',null],[11000000,7000000,'11:7',null]]){
  const record=migrateRecord({...source,originalSize:{width,height,unit:'emu'},size:{width:width/9525,height:height/9525,unit:'px'}}),before=structuredClone(record);
  assert.deepEqual(canvasRatioOf(record),{id,aspect:width/height,preset,original:true,label:`원본 비율 · ${id}`});assert.deepEqual(record,before);
  const changed={...record,size:{width:4,height:5,unit:'px'},ratio:'4:5'};
  assert.deepEqual(canvasRatioOf(changed),{id:'4:5',aspect:4/5,preset:'4:5',original:false,label:'현재 비율 · 4:5'});
  assert.deepEqual(changed.originalSize,record.originalSize);
 }
 const square=newRecord('1:1');assert.deepEqual(canvasRatioOf(square),{id:'1:1',aspect:1,preset:'1:1',original:false,label:'현재 비율 · 1:1'});
 const custom={...square,size:{width:1370.25,height:800.5,unit:'px'}};assert.equal(canvasRatioOf(custom).id,'1370.25:800.5','custom decimal sizes are displayed without rounding to a preset');
 const nearWide={...square,size:{width:160000000.1,height:90000000,unit:'px'}};
 // Stay within the document's supported dimension range while being only 1e-9
 // away from 16:9: it is still an authored custom ratio, not a preset.
 assert.equal(canvasRatioOf(nearWide).preset,null);assert.equal(canvasRatioOf(nearWide).id,'160000000.1:90000000');
});
