import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanItem,moveItem,alignItem,scaleItems,duplicateItem} from '../src/model.js';
import {newRecord,migrateRecord,copyRecord} from '../app/designs.js';

test('one screen-pixel moves survive repeated sanitizing, document save/reopen and copying',()=>{
  const record=newRecord('16:9');
  const item=cleanItem({id:'eprecision0001',t:'shape',shape:'rect',x:47.1234,y:52.9876,w:30,h:20,color:'#286f62'});
  const dx=100/1440,dy=100/810;
  const moved=moveItem(item,item.x+dx,item.y+dy,{snap:false}).item;
  assert.ok(Math.abs((moved.x-item.x)/100*1440-1)<.001);
  assert.ok(Math.abs((moved.y-item.y)/100*810-1)<.001);
  record.slides[0].items=[moved];
  const reopened=migrateRecord(JSON.parse(JSON.stringify(migrateRecord(record))));
  assert.deepEqual(reopened.slides[0].items[0],moved);
  const copied=copyRecord(reopened);
  assert.equal(copied.slides[0].items[0].x,moved.x);
  assert.equal(copied.slides[0].items[0].y,moved.y);
  assert.equal(moved.id,item.id);assert.equal(moved.w,item.w);assert.equal(moved.h,item.h);
  const duplicate=duplicateItem([moved],0);
  assert.equal(duplicate.x,Number((moved.x+4).toFixed(4)));
  assert.equal(duplicate.y,Number((moved.y+4).toFixed(4)));
  assert.notEqual(duplicate.id,moved.id);assert.deepEqual(duplicate.origin,{elementId:moved.id});
});

test('precise positions retain limits, alignment and group offsets without changing dimension defaults',()=>{
  const item=cleanItem({t:'shape',shape:'rect',x:47.123456,y:52.987654,w:30.12345,h:20.12345});
  assert.equal(item.x,47.1235);assert.equal(item.y,52.9877);
  assert.equal(item.w,30.1);assert.equal(item.h,20.1);
  const bounded=moveItem(item,-1,101,{snap:false}).item;
  assert.equal(bounded.x,0);assert.equal(bounded.y,100);
  const aligned=alignItem(item,'left',12.3456,0);
  assert.equal(aligned.x,12.3456);
  const scaled=scaleItems([item],1.2,10.4321,20.4321),group=scaled.items[0];
  assert.ok(Math.abs(group.x-(10.4321+(item.x-10.4321)*scaled.k))<.0001);
  assert.equal(cleanItem(group).x,group.x);assert.equal(cleanItem(group).y,group.y);
});
