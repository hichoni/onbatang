import test from 'node:test';
import assert from 'node:assert/strict';
import {newPixelActivity} from '../src/pixel-art.js';
import {migrateRecord} from '../app/designs.js';
import {activityDefinitionHash,cleanReturnedResults,inspectReturnedResults,planReturnedResults,returnedResultsFromLesson} from '../app/lesson-results.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
async function fixture(count=2){
 const activity=newPixelActivity({id:'aresulttest001'}),target={kind:'material',id:'mreturntest001'};
 const records=[migrateRecord({id:'dresultpart01',name:'직접 만든 자료',ratio:'16:9',slides:Array.from({length:19},(_,i)=>({id:'presultpage'+String(i).padStart(3,'0'),bg:'paper',items:[],...(i===0?{activity}:{})}))}),migrateRecord({id:'dresultpart02',name:'다른 파트',ratio:'16:9',slides:Array.from({length:19},(_,i)=>({id:'psecondpage'+String(i).padStart(3,'0'),bg:'paper',items:[]}))})];
 const binding={documentId:records[0].id,pageId:records[0].slides[0].id,activityId:activity.id,kind:activity.kind,definitionHash:await activityDefinitionHash(activity)};
 const packet={kind:'onbatang-html-results',version:1,lessonId:'dresultlesson01',title:'직접 만든 수업',target,results:Array.from({length:count},(_,i)=>({id:'preturntest00'+i,binding,aspect:16/9,image:png,answer:'선택한 그림 '+i,completed:true}))};
 return {records,target,packet,pageOrder:records.flatMap(r=>r.slides.map(p=>p.id))};
}
test('selected results plan across bounded parts, preserve original pages/apps and survive cleaning; retry is idempotent',async()=>{
 const f=await fixture(),before=structuredClone(f.records),plan=await planReturnedResults(f.packet,{...f,selected:f.packet.results.map(r=>r.id)});
 assert.equal(plan.documents.length,2);assert.equal(plan.added.length,2);assert.equal(plan.pageOrder.length,40);assert.deepEqual(f.records,before);
 for(let i=0;i<2;i++){const doc=plan.documents[i];assert.deepEqual(doc.slides.slice(0,19),before[i].slides);assert.equal(doc.slides.at(-1).source.kind,'result');assert.equal(doc.slides.at(-1).origin.pageId,f.packet.results[0].binding.pageId);assert.equal(migrateRecord(doc).slides.at(-1).source.objectId,'html:'+f.packet.results[i].id);}
 const again=await planReturnedResults(f.packet,{...f,records:plan.documents,pageOrder:plan.pageOrder,selected:f.packet.results.map(r=>r.id)});
 assert.equal(again.added.length,0);assert.equal(again.duplicates,2);assert.deepEqual(again.documents,[]);
 const modified=structuredClone(f.packet);modified.results[0].answer='다른 내용';await assert.rejects(inspectReturnedResults(modified,{...f,records:plan.documents}),/같은 번호/);
});
test('foreign targets, changed activity definitions, malicious images and partial capacity are rejected without mutation',async()=>{
 const f=await fixture(3),before=structuredClone(f.records);
 await assert.rejects(inspectReturnedResults(f.packet,{...f,target:{kind:'material',id:'motherlesson01'}}),/다른 자료/);
 const changed=structuredClone(f.records);changed[0].slides[0].activity.title='고친 활동';await assert.rejects(inspectReturnedResults(f.packet,{...f,records:changed}),/활동이 바뀌/);
 await assert.rejects(planReturnedResults(f.packet,{...f,selected:f.packet.results.map(r=>r.id)}),/공간이 부족/);assert.deepEqual(f.records,before);
 for(const image of ['https://example.test/image.png','data:image/svg+xml;base64,PHN2Zz4=',png.slice(0,45)])assert.throws(()=>cleanReturnedResults({...f.packet,results:[{...f.packet.results[0],image}]}));
 assert.throws(()=>cleanReturnedResults({...f.packet,results:[f.packet.results[0],f.packet.results[0]]}));
});
test('state changes do not invalidate the activity definition; only explicitly linked offline results are returned',async()=>{
 const f=await fixture(1),definition=f.packet.results[0].binding.definitionHash;
 f.records[0].slides[0].activity.cells[0]=2;assert.equal(await activityDefinitionHash(f.records[0].slides[0].activity),definition);
 const lesson={id:f.packet.lessonId,title:f.packet.title,target:f.target,pages:[{id:'poldresult01',result:true,image:png,aspect:16/9},{...f.packet.results[0],result:true,resultData:{answer:'완성',completed:true}}]};
 assert.equal(returnedResultsFromLesson(lesson).results.length,1);
 assert.throws(()=>returnedResultsFromLesson({...lesson,target:undefined}),/이전 HTML/);
});
