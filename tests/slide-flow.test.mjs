import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanDesign} from '../src/model.js';
import {newRecord,migrateRecord,copySlide} from '../app/designs.js';
import {cleanCamera,cleanTravel,projectCamera,connectFlowItems} from '../src/slide-flow.js';
import {matchItems,transitionPose} from '../src/motion.js';
import {filmPlan} from '../src/film.js';
const a={id:'eflowtest01',t:'shape',shape:'circle',x:25,y:50,w:20,h:30,color:'#aa2255'};
const b={...a,id:'eflowtest02',color:'#336699',x:70};
const pages=[{id:'pflowtest01',bg:'#ffffff',items:[a,b]},{id:'pflowtest02',bg:'#ffffff',items:[{...a,id:'eflowtest03'},{...b,id:'eflowtest04'}]}];
test('explicit morph pairing overrides automatic content matching without editing provenance',()=>{
  const before=JSON.stringify(pages),linked=connectFlowItems(pages,0,a.id,1,'eflowtest04','mflowtest01');
  assert.equal(JSON.stringify(pages),before);
  assert.deepEqual(matchItems(linked[0].items,linked[1].items),[[0,1]]);
  assert.equal(linked[0].items[0].id,a.id);
  const [copies,at]=copySlide(linked,1);assert.ok(copies[at].items.some(it=>it.morphKey==='mflowtest01'));
  linked[1].items[1].morphKey='off';assert.deepEqual(matchItems(linked[0].items,linked[1].items),[]);
});
test('camera and duration survive storage while original geometry and IDs are unchanged',()=>{
  const record=newRecord('16:9');record.slides=connectFlowItems(pages,0,a.id,1,'eflowtest04','mflowtest01');
  record.slides[1]={...record.slides[1],tr:'move',camera:{x:70,y:50,z:2},travel:{ms:2400,ease:'direct'}};
  const reopened=migrateRecord(JSON.parse(JSON.stringify(record))),page=cleanDesign(reopened.slides[1]);
  assert.deepEqual(page.camera,{x:70,y:50,z:2});assert.equal(page.items[1].x,70);assert.equal(page.items[1].w,20);
  assert.equal(page.items[1].morphKey,'mflowtest01');assert.equal(page.travel.ms,2400);
  const framed=projectCamera(page);assert.equal(framed.items[1].x,50);assert.equal(framed.items[1].w,40);assert.equal(framed.items[1].h,60);
  assert.equal(page.items[1].w,20);assert.ok(!framed.camera);
  assert.equal(transitionPose('move',1,1200,page.travel).ms,2400);
  assert.equal(filmPlan(reopened.slides).slides[1].turn.ms,2400);
  assert.deepEqual(projectCamera({...page,camera:undefined}).items,page.items);
});

test('a teacher can extend a connection through three slides without ambiguous merges',()=>{
  const list=[...pages,{...pages[1],id:'pflowtest03',items:[{...a,id:'eflowtest05'}]}];
  const first=connectFlowItems(list,0,a.id,1,'eflowtest04','mflowchain01');
  const joined=connectFlowItems(first,1,'eflowtest04',2,'eflowtest05','mflowchain02');
  assert.deepEqual(joined.map(p=>p.items.filter(i=>i.morphKey==='mflowchain02').length),[1,1,1]);
  assert.ok(matchItems(joined[0].items,joined[1].items).some(([a,b])=>a===0&&b===1));
  assert.ok(matchItems(joined[1].items,joined[2].items).some(([a,b])=>a===1&&b===0));
  const ambiguous=[{items:[{...a,morphKey:'mchainaaa'}]},{items:[{...b,morphKey:'mchainbbb'}]},{items:[{...a,morphKey:'mchainaaa'},{...b,morphKey:'mchainbbb'}]}],before=structuredClone(ambiguous);
  assert.throws(()=>connectFlowItems(ambiguous,0,a.id,1,b.id,'mnewchain0'),/겹쳐/);assert.deepEqual(ambiguous,before);
});
test('invalid framing is bounded and never changes legacy slides or activity content',()=>{
  assert.deepEqual(cleanCamera({x:-500,y:1000,z:2}),{x:25,y:75,z:2});
  assert.deepEqual(cleanCamera({z:NaN}),{x:50,y:50,z:1});assert.equal(cleanTravel({ms:Infinity}).ms,1200);
  const legacy=cleanDesign(pages[0]);assert.ok(!('camera'in legacy));assert.ok(!('travel'in legacy));
  const activity={...pages[0],camera:{x:50,y:50,z:3},activity:{kind:'gai-app'}};assert.equal(projectCamera(activity),activity);
});
