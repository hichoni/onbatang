import test from 'node:test';
import assert from 'node:assert/strict';
import {configure} from '../src/model.js';
import {editContext,checkEdits,applyEdits} from '../app/ai-edits.js';
import {insertAiPages,emptyAiPage} from '../app/ai-insert.js';
import {cleanComposeRequest} from '../src/ai-compose.js';
const text={id:'etext0001',t:'text',text:'원래 제목',x:50,y:20,w:80,size:5,color:'#123456',layout:'slide'};
const shape={t:'shape',shape:'circle',x:70,y:65,w:12,h:21.33,color:'#e1aa44',lp:'breathe'};
const source=()=>[{id:'pfirst001',bg:'#ffffff',notes:'원래 발화',items:[{...text},{...text,id:'etext0002',text:'남길 문구',y:45},{...text,id:'elocked01',lock:true,y:80}]}];
test('native additions, removal and later edits retain original IDs, notes and source indices',()=>{
 configure({aspect:16/9,maxItems:24});const slides=source(),ctx=editContext(slides,[0],{fonts:[['gothic','기본']]});
 const checked=checkEdits({ops:[{op:'remove',item:'p1.1'},{op:'add',slide:'p1',element:shape},{op:'text',item:'p1.2',text:'남긴 문구 수정'},{op:'remove',item:'p1.3'},{op:'add',slide:'p2',element:shape}]},ctx,{slides});
 assert.equal(checked.ops.length,3);assert.equal(checked.dropped.length,2);
 const result=applyEdits(slides,checked.ops,ctx);assert.equal(result.count,3);assert.deepEqual(result.slides[0].items.map(i=>i.id),['etext0002','elocked01',checked.ops[1].element.id]);assert.equal(result.slides[0].items[0].text,'남긴 문구 수정');assert.equal(result.slides[0].notes,'원래 발화');assert.equal(result.slides[0].items.at(-1).lp,'breathe');assert.deepEqual(slides,source());
 const skip=applyEdits(slides,checked.ops,ctx,{skip:new Set([0])});assert.equal(skip.slides[0].items[0].id,text.id);assert.equal(skip.slides[0].items[1].text,'남긴 문구 수정');
 const stale=structuredClone(slides);stale[0].items[0].text='기다리는 동안 직접 수정';assert.equal(applyEdits(stale,checked.ops,ctx).count,0);
});
test('photo descriptions travel alone; added photos bind only captured local originals',()=>{
 const slides=source(),photo={id:'photo1',alt:'교실',ratio:1.5,url:'data:image/png;base64,aGVsbG8='},ctx=editContext(slides,[0],{fonts:[['gothic','기본']],photos:[photo]});
 assert.equal(JSON.stringify(ctx.request).includes('data:image'),false);photo.url='changed';
 const checked=checkEdits({ops:[{op:'add',slide:'p1',element:{t:'image',asset:'photo1',x:50,y:50,w:30,h:35.56}},{op:'add',slide:'p1',element:{t:'image',asset:'https://bad.example',x:50,y:50,w:30,h:30}}]},ctx,{slides});assert.equal(checked.ops.length,1);assert.equal(checked.ops[0].element.url,'data:image/png;base64,aGVsbG8=');
 const selected=editContext(slides,[0],{selectedIds:[text.id]});assert.equal(checkEdits({ops:[{op:'add',slide:'p1',element:shape},{op:'remove',item:'p1.2'}]},selected,{slides}).ops.length,0);
});
test('whole-deck generation fills a truly empty page or inserts after content; stale or overfull decks never change',()=>{
 const blank=[{id:'pblank001',items:[]}],pages=[{id:'pnew00001',items:[text]},{id:'pnew00002',items:[text]}];
 assert.equal(insertAiPages(blank,structuredClone(blank),0,pages).slides.length,2);
 const original=source(),result=insertAiPages(original,structuredClone(original),0,pages);assert.equal(result.at,1);assert.deepEqual(result.slides[0],original[0]);assert.equal(result.slides.length,3);
 assert.throws(()=>insertAiPages(source(),blank,0,pages),/발표가 바뀌/);assert.throws(()=>insertAiPages(blank,blank,0,pages,1),/1장/);
 for(const extra of [{notes:'발화'},{web:{url:'https://example.org'}},{voice:{ms:1}},{topic:'이야기'},{hidden:true}])assert.equal(emptyAiPage({...blank[0],...extra}),false);
 assert.equal(cleanComposeRequest({kind:'slides',task:'compose',prompt:'세로 발표',count:2,aspect:9/16}).aspect,.5625);
});
test('background, local font and supplied photo replacement preserve speech, IDs and motion',()=>{
 const slides=source(),url='data:image/png;base64,aGVsbG8=';slides[0].items.push({id:'ephoto001',t:'image',x:50,y:50,w:30,h:40,url,an:'fade',lp:'breathe'});
 const ctx=editContext(slides,[0],{fonts:[['gothic','기본']],photos:[{id:'photo1',url:'data:image/png;base64,d29ybGQ=',alt:'새 교실',ratio:1}]});
 const checked=checkEdits({ops:[{op:'slide',slide:'p1',bg:'#102b31'},{op:'style',item:'p1.1',style:{font:'gothic'}},{op:'photo',item:'p1.4',asset:'photo1'},{op:'photo',item:'p1.4',asset:'https://bad.example'},{op:'style',item:'p1.2',style:{font:'unknown-font'}}]},ctx,{slides});assert.equal(checked.ops.length,3);assert.equal(checked.dropped.length,2);
 const result=applyEdits(slides,checked.ops,ctx).slides[0];assert.equal(result.bg,'#102b31');assert.equal(result.notes,'원래 발화');assert.equal(result.items[0].font,'gothic');assert.equal(result.items[3].id,'ephoto001');assert.equal(result.items[3].an,'fade');assert.equal(result.items[3].lp,'breathe');assert.equal(result.items[3].alt,'새 교실');assert.equal(result.items[3].x,50);
});
