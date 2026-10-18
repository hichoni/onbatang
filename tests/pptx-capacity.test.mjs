import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePageInput, SLIDE_LIMITS} from '../src/document.js';
import {cleanDesign, cleanItem, configure, textLimit, pasteItem, duplicateItem} from '../src/model.js';
import {migrateRecord, copyRecord} from '../app/designs.js';

configure({maxItems:40,maxPhotos:10,maxText:120});
const text='원문과 줄바꿈을 그대로 보존합니다.\n'.repeat(150);
const image={t:'image',layout:'slide',x:50,y:50,w:10,h:10,url:'data:image/png;base64,AA=='};
const page=()=>({items:[{t:'text',layout:'slide',text,x:50,y:50,w:80,h:80,size:2},...Array.from({length:12},()=>({...image}))]});

test('imported long text and twelve separate pictures survive repeated cleaning, migration and copy',()=>{
  assert.ok(text.length>120&&text.length<SLIDE_LIMITS.text);
  let record=migrateRecord({name:'직접 만든 많은 그림·긴 본문',slides:[page()]});
  for(let i=0;i<3;i++)record=migrateRecord(JSON.parse(JSON.stringify({...record,slides:record.slides.map(p=>cleanDesign(p))})));
  assert.equal(record.slides[0].items[0].text,text);
  assert.equal(record.slides[0].items.filter(x=>x.t==='image').length,12);
  const copied=copyRecord(record);
  assert.equal(copied.slides[0].items[0].text,text);
  assert.equal(copied.slides[0].items.length,13);
  assert.equal(pasteItem([],record.slides[0].items[0]).text,text);
  assert.ok(duplicateItem(record.slides[0].items,1));
  assert.ok(pasteItem(record.slides[0].items,record.slides[0].items[1]));
  // Guest projection removes private provenance; layout remains sufficient.
  const projected={...record.slides[0],items:record.slides[0].items.map(({source,origin,assetRefs,...item})=>item)};
  assert.deepEqual(cleanDesign(projected).items.map(x=>x.text),record.slides[0].items.map(x=>x.text));
});

test('slide capacities stay bounded while ordinary text and pictures retain their limits',()=>{
  const imported={t:'text',layout:'slide',text:'가'.repeat(4096)};
  validatePageInput({items:[imported]});
  assert.equal(textLimit(imported),4096);assert.equal(textLimit({t:'text'}),120);
  assert.throws(()=>validatePageInput({items:[{...imported,text:imported.text+'나'}]}),{code:'TEXT_LIMIT'});
  assert.throws(()=>validatePageInput({items:[{t:'text',text:'가'.repeat(121)}]}),{code:'TEXT_LIMIT'});
  assert.throws(()=>validatePageInput({items:Array.from({length:11},()=>({...image,layout:undefined}))}),{code:'PHOTO_LIMIT'});
  validatePageInput({items:Array.from({length:40},()=>({...image}))});
  assert.throws(()=>validatePageInput({items:Array.from({length:41},()=>({...image}))}),{code:'ITEM_LIMIT'});
  const mixed={items:[imported,{t:'text',text:'가'.repeat(121)}]};
  assert.throws(()=>validatePageInput(mixed),{code:'TEXT_LIMIT'});
  const empty={t:'shape',layout:'slide',shape:'rect',op:0,w:20,h:20};
  assert.equal(cleanItem(empty).op,0);
  assert.equal(cleanItem({...empty,layout:undefined}).op,10);
  const saved=migrateRecord({slides:[{items:[empty]}]});
  assert.equal(cleanDesign(migrateRecord(saved).slides[0]).items[0].op,0);
});
