import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanItem, cleanDesign, scaleItem, widenItem, heightenItem, reshapeItems, sizeRange, hangsPunctuation } from '../src/model.js';
import { migrateRecord } from '../app/designs.js';

const source = {kind:'pptx',pageIndex:0,objectId:'42'};
const label = {t:'text',source,text:'작은 제목\n두 번째 줄',x:25,y:35,w:3,size:1.25,h:8,valign:'middle',lh:1.4,nowrap:true,typeface:'Arial'};
const rule = {t:'shape',source,shape:'rect',x:50,y:45,w:80,h:0.09,line:0.05,lc:'#123456',color:'#ffffff'};

test('Office punctuation default and explicit overrides survive sanitization, public projection and reopen', () => {
  for (const value of [undefined, true, false]) {
    const original={...label,text:'First paragraph!\n\nLast paragraph.',...(value===undefined?{}:{hangingPunct:value})};
    let record=migrateRecord({name:'직접 만든 내어쓰기 표본',slides:[cleanDesign({items:[original]},{keepSpaces:true})]});
    for(let n=0;n<3;n++)record=migrateRecord(JSON.parse(JSON.stringify(record)));
    const item=record.slides[0].items[0],{source:privateSource,...publicItem}=item;
    assert.equal(hangsPunctuation(item),value??true);
    assert.equal(hangsPunctuation(cleanItem(publicItem)),value??true);
    assert.equal(item.hangingPunct,value);
    for(const key of ['text','w','h','size','x','y','typeface'])assert.equal(item[key],original[key]);
  }
  assert.equal(hangsPunctuation(cleanItem({t:'text',text:'Ordinary!',size:3})),false);
  for(const invalid of ['false',0,1,null,{}])assert.equal(cleanItem({...label,hangingPunct:invalid}).hangingPunct,undefined);
});

test('imported small text, fixed text frame and thin lines survive cleaning and repeated save/reopen', () => {
  let record = migrateRecord({name:'직접 만든 PPT 호환 표본',slides:[cleanDesign({items:[label,rule]})]});
  const expected = JSON.parse(JSON.stringify(record));
  for(let n=0;n<3;n++) record=migrateRecord(JSON.parse(JSON.stringify({...record,slides:record.slides.map(s=>cleanDesign(s))})));
  assert.deepEqual(record,expected);
  const [text,line]=record.slides[0].items;
  for(const key of ['w','size','h','valign','lh','nowrap','typeface']) assert.equal(text[key],label[key]);
  assert.equal(line.h,rule.h);assert.equal(line.line,rule.line);
});

test('resizing and aspect fitting preserve imported geometry without applying ordinary editing minima', () => {
  const text=cleanItem(label),line=cleanItem(rule);
  assert.equal(scaleItem(text,0.5).size,0.625);assert.equal(scaleItem(text,0.5).h,4);
  assert.equal(widenItem(text,2).w,2);assert.equal(heightenItem(line,0.05).h,0.05);
  assert.equal(scaleItem(line,0.5).h,0.045);assert.equal(sizeRange(text).min,0.1);
  const [fit]=reshapeItems([text],16/9,4/3,{fit:true});
  assert.ok(fit.h>0);assert.equal(fit.lh,1.4);assert.equal(fit.typeface,'Arial');
  assert.equal(cleanItem({...label,source:undefined}).size,2.5);
  assert.equal(cleanItem({...label,source:undefined}).w,10);
  assert.equal(cleanItem({...rule,source:undefined}).h,0.6);
});

test('PPT typography fields are bounded and only local allowlisted typefaces are retained', () => {
  const text=cleanItem({...label,h:999,lh:999,valign:'evil',typeface:'url(https://example.test/font)'});
  assert.equal(text.h,140);assert.equal(text.lh,4);assert.equal(text.valign,'top');assert.equal(text.typeface,undefined);
  const ordinary=cleanItem({...label,source:{kind:'local'}});
  for(const key of ['h','valign','nowrap','typeface']) assert.equal(ordinary[key],undefined);
  // Line spacing is an ordinary text setting too (toolbar 줄 간격), still bounded.
  assert.equal(ordinary.lh,label.lh);assert.equal(cleanItem({...label,source:{kind:'local'},lh:999}).lh,4);
});

test('render-only slide layout retains typography after private provenance is stripped', () => {
  const clean=cleanItem(label),{source:privateSource,...publicItem}=clean;
  assert.equal(clean.layout,'slide');assert.deepEqual(cleanItem(publicItem),publicItem);
  assert.equal(cleanItem({...label,source:undefined,layout:'unknown'}).layout,undefined);
  const image=cleanItem({t:'image',source,w:1.7,h:1.9,url:'https://example.test/local-image.png'});
  assert.equal(image.w,1.7);assert.equal(scaleItem(image,.5).w,.85);
  assert.equal(cleanItem({...label,typeface:'학교안심 이어달리기 L'}).typeface,'학교안심 이어달리기 L');
  assert.equal(cleanItem({...label,typeface:'학교안심 바른돋움 B'}).typeface,'학교안심 바른돋움 B');
});
