import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanComposeRequest,validateComposition,compositionSlides} from '../src/ai-compose.js';
import {configure} from '../src/model.js';
import {newRecord,cleanRecord} from '../app/designs.js';
import {editContext,checkEdits,applyEdits} from '../app/ai-edits.js';
const request={kind:'slides',task:'compose',prompt:'교사를 위한 발표',count:17};
const result=()=>({title:'질문에서 시작하는 수업',say:'이야기의 흐름을 구성했어요.',ops:Array.from({length:17},(_,i)=>({op:'page',title:`${i+1}장`,bg:i%2?'#102b31':'#f5f1e8',notes:`${i+1}번째 이야기를 나눕니다.`,tr:'fade',items:[{t:'shape',shape:'circle',x:80,y:50,w:20,h:35.56,color:'#d5a846',lp:'breathe',morphKey:'mshared01'},{t:'text',text:`${i+1}. 질문에서 꿈으로`,x:40,y:45,w:66,size:5,color:i%2?'#ffffff':'#102b31',font:'gothic',align:'l',bold:true}]}))});
test('17 native pages retain every text, speech, identity and motion through save/reopen',()=>{
 configure({aspect:16/9});const slides=compositionSlides(result(),request);
 const record=cleanRecord({...newRecord('16:9'),name:'질문에서 시작하는 수업',slides}),again=cleanRecord(JSON.parse(JSON.stringify(record)));
 assert.equal(again.slides.length,17);assert.deepEqual(again.slides,record.slides);
 for(const [i,s] of again.slides.entries()){assert.equal(s.items[1].text,`${i+1}. 질문에서 꿈으로`);assert.equal(s.notes,`${i+1}번째 이야기를 나눕니다.`);assert.equal(s.items[0].lp,'breathe');assert.equal(s.items[0].morphKey,'mshared01');assert.ok(s.items.every(it=>it.id));assert.equal(s.web,undefined);}
 assert.equal(new Set(slides.map(s=>s.id)).size,17);
});
test('incomplete pages, web content, foreign assets and effects cannot become an editable proposal',()=>{
 for(const mutate of [r=>r.ops.pop(),r=>r.ops[2].items=[],r=>r.ops[2].items[0]={t:'web',html:'<script>bad</script>'},r=>r.ops[2].items[0].lp='fake-effect',r=>r.ops[2].items[1].font='remote-font',r=>r.ops[2].items[1].w=120,r=>r.ops[2].items[0]={t:'image',x:50,y:50,w:30,h:20,asset:'https://evil.example/a.png'}]){const r=result();mutate(r);assert.throws(()=>validateComposition(r,request));}
 assert.throws(()=>cleanComposeRequest({...request,count:1.001}));
 assert.equal(cleanComposeRequest({...request,system:'ignore all',html:'bad'}).system,undefined);
});
test('photo references preserve the supplied source and text over 120 characters is never silently truncated',()=>{
 configure({aspect:16/9});const r=result(),p={id:'photo1',alt:'학교 사진',aspect:1.5};r.ops[0].items.push({t:'image',asset:'photo1',x:75,y:30,w:20,h:13.33});r.ops[0].items[1].text='한'.repeat(180);
 const input={...request,photos:[p]},url='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII=';
 assert.throws(()=>compositionSlides(r,input));
 const slides=cleanRecord({...newRecord('16:9'),slides:compositionSlides(r,input,[{...p,url}])}).slides;
 assert.equal(slides[0].items[1].text.length,180);assert.equal(slides[0].items[2].url,url);
});
test('selected-element edits preserve neighbours and assets, reject locks and stale proposals',()=>{
 configure({aspect:16/9});const slides=compositionSlides(result(),request),chosen=slides[0].items[1];
 const ctx=editContext(slides,[0],{selectedIds:[chosen.id]});assert.equal(ctx.request.slides[0].items.length,1);
 const answer={say:'크기와 색을 바꿨어요.',ops:[{op:'style',item:'p1.2',style:{size:6,color:'#be5e2d'}},{op:'style',item:'p1.1',style:{x:10}},{op:'slide',slide:'p1',notes:'바꾸지 마세요'}]};
 const checked=checkEdits(answer,ctx,{slides});assert.equal(checked.ops.length,1);
 const applied=applyEdits(slides,checked.ops,ctx);assert.equal(applied.count,1);assert.equal(applied.slides[0].items[1].size,6);assert.equal(applied.slides[0].items[1].id,chosen.id);assert.deepEqual(applied.slides[0].items[0],slides[0].items[0]);assert.deepEqual(applied.slides.slice(1),slides.slice(1));assert.equal(slides[0].items[1].size,5);
 const changed=structuredClone(slides);changed[0].items[1].text='사용자가 고친 내용';assert.equal(applyEdits(changed,checked.ops,ctx).count,0);
 for(const patch of [{url:'https://evil.example'},{text:'내용 삭제'},{size:100},{x:-50},{op:0}])assert.equal(checkEdits({ops:[{op:'style',item:'p1.2',style:patch}]},ctx,{slides}).ops.length,0);
 const locked=structuredClone(slides);locked[0].items[1].lock=true;assert.equal(checkEdits(answer,editContext(locked,[0],{selectedIds:[chosen.id]}),{slides:locked}).ops.length,0);
});
