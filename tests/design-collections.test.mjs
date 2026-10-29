import test from 'node:test';
import assert from 'node:assert/strict';
import {COLLECTIONS,COLLECTION_LAYOUTS,createCollectionSlides} from '../app/design-collections.js';
import {configure,layoutItems,cleanDesign,SHAPES} from '../src/model.js';
import {cleanRecord,newRecord} from '../app/designs.js';

const aspects=[16/9,4/3,1,4/5,9/16,2.4];
const em=s=>[...s].reduce((sum,c)=>sum+(/\s/.test(c)?.34:/[A-Za-z0-9.,:;/+—-]/.test(c)?.62:1),0);
test('four original design collections contain five coordinated editable page roles each',()=>{
 assert.equal(COLLECTIONS.length,4);assert.equal(COLLECTION_LAYOUTS.length,20);
 assert.equal(new Set(COLLECTION_LAYOUTS.map(l=>l.id)).size,20);
 for(const collection of COLLECTIONS){const layouts=COLLECTION_LAYOUTS.filter(l=>l.collection===collection.id);assert.equal(layouts.length,5);assert.equal(layouts.filter(l=>l.cover).length,1);assert.ok(layouts.every(l=>l.ratio==='16:9'&&l.collectionName===collection.name));}
});
test('all page roles retain text, valid shapes and readable geometry at original and preset ratios',()=>{
 const shapes=new Set(SHAPES.map(s=>s.id));
 for(const aspect of aspects){configure({aspect,maxItems:40,layouts:COLLECTION_LAYOUTS});
  for(const layout of COLLECTION_LAYOUTS){const raw=layout.items(aspect),items=layoutItems(layout.id),label=`${layout.id}@${aspect}`;
   assert.ok(raw.length<=40,label);assert.equal(raw.length,items.length,label);
   for(const it of raw){assert.ok(['text','shape'].includes(it.t),label);if(it.t==='shape')assert.ok(shapes.has(it.shape),label);else{const height=it.text.split('\n').length*it.size*1.25,cy=it.y/aspect;assert.ok(cy-height/2>=-.12&&cy+height/2<=100/aspect+.12,label+': '+it.text);assert.ok(it.text.split('\n').every(s=>em(s)*it.size<=it.w+.15),label+': '+it.text);assert.ok(it.x-it.w/2>=0&&it.x+it.w/2<=100,label);}}
   assert.deepEqual(items.filter(i=>i.t==='text').map(i=>i.text),raw.filter(i=>i.t==='text').map(i=>i.text),label);
  }
 }
});
test('ready-made sets use fresh IDs, aspect-correct circles and preserve every editable page on save/reopen',()=>{
 for(const aspect of aspects)for(const collection of COLLECTIONS){
  configure({aspect,maxItems:40});const slides=createCollectionSlides(collection.id,{aspect}),again=createCollectionSlides(collection.id,{aspect});
  assert.equal(slides.length,5);const ids=slides.flatMap(s=>[s.id,...s.items.map(i=>i.id)]);assert.equal(new Set(ids).size,ids.length);assert.ok(again.flatMap(s=>[s.id,...s.items.map(i=>i.id)]).every(id=>!ids.includes(id)));
  const record=newRecord('16:9');record.size={width:aspect*1000,height:1000,unit:'px'};record.originalSize={...record.size};record.slides=slides;
  const reopened=cleanRecord(JSON.parse(JSON.stringify(cleanRecord(record))));assert.equal(reopened.slides.length,5);
  reopened.slides.forEach((page,index)=>{assert.equal(page.items.length,slides[index].items.length);assert.deepEqual(page.items.filter(i=>i.t==='text').map(i=>i.text),slides[index].items.filter(i=>i.t==='text').map(i=>i.text));assert.equal(cleanDesign(page).items.length,page.items.length);});
  for(const page of slides)for(const item of page.items.filter(i=>i.shape==='circle'))assert.ok(Math.abs(item.h-item.w*aspect)<.001);
 }
 assert.throws(()=>createCollectionSlides('unknown'),RangeError);
});
