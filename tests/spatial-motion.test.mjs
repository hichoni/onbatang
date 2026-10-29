import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanItem} from '../src/model.js';
import {newRecord,migrateRecord} from '../app/designs.js';

test('camera-clipped slide artwork keeps bounded offstage coordinates through save/reopen',()=>{
 const shape={id:'espatialtest01',t:'shape',shape:'circle',layout:'slide',x:-123.4567,y:208.1357,w:46,h:46,color:'#153f38'};
 const record=newRecord('16:9');record.slides=[{id:'pspatialtest01',bg:'#fffdf5',items:[shape]}];
 const reopened=migrateRecord(JSON.parse(JSON.stringify(record)));
 assert.equal(reopened.slides[0].items[0].x,shape.x);assert.equal(reopened.slides[0].items[0].y,shape.y);
 assert.equal(cleanItem({...shape,x:-1e8,y:1e8}).x,-500);assert.equal(cleanItem({...shape,x:-1e8,y:1e8}).y,500);
 assert.equal(cleanItem({...shape,x:NaN,y:Infinity}).x,50);assert.equal(cleanItem({...shape,x:NaN,y:Infinity}).y,50);
 const ordinary=cleanItem({...shape,layout:undefined});assert.equal(ordinary.x,0);assert.equal(ordinary.y,100,'ordinary editing keeps its existing bounds');
});
