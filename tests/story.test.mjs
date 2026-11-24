import test from 'node:test';
import assert from 'node:assert/strict';
import {storySource,localStoryPlan,validateStoryPlan,makeStory,storySlides,auditStory,cleanStory,selectedStoryParagraphs} from '../src/story.js';
import {newRecord,migrateRecord,copyRecord} from '../app/designs.js';
import {packOnbatang,readOnbatang,freshCopy} from '../app/onbatang-file.js';
import {guestRecords} from '../app/copy-link.js';

test('editable files preserve story bindings; audience links exclude source and author-only metadata',async()=>{
 const {story}=setup(),record=migrateRecord({...newRecord(),story,slides:storySlides(story)});
 const file=await readOnbatang(await packOnbatang({records:[record],app:'0.160.0'}));
 assert.deepEqual(file.records[0].story,story);
 const copied=freshCopy(file).records[0];assert.ok(auditStory(copied.story,copied.slides).passed);
 const publicRecord=guestRecords([record]).records[0];assert.equal(publicRecord.story,undefined);assert.deepEqual(publicRecord.slides,record.slides);
});

const setup=()=>{const source=storySource('제목\n첫 발화를 읽습니다.\n둘째 발화입니다.\n마지막 말씀입니다.');source.paragraphs[0].spoken=false;const plan=localStoryPlan(source);return{source,plan,story:makeStory(source,plan)};};
test('source is preserved while scene text is edited; cue and item identities survive rebuild and persistence',()=>{
 const {source,plan}=setup();plan[0].title='화면용 제목';plan[0].purpose='제작자 메모';plan[0].lines=['화면용 문구'];
 const story=makeStory(source,plan),slides=storySlides(story);
 assert.equal(story.scenes.length,3);assert.deepEqual(slides.map(p=>p.notes),source.paragraphs.slice(1).map(p=>p.text));
 assert.deepEqual(storySlides(story),slides);assert(!JSON.stringify(slides).includes('제작자 메모'));
 const record=migrateRecord({...newRecord(),story,slides});assert.deepEqual(record.story,story);assert.equal(auditStory(record.story,record.slides).passed,true);
 const copied=copyRecord(record);assert.notEqual(copied.slides[0].id,slides[0].id);assert.equal(auditStory(copied.story,copied.slides).passed,true);
});
test('foreign references, gaps, duplicates and reordered speech reject the whole AI proposal',()=>{
 const {source,plan}=setup();
 for(const change of [p=>p.pop(),p=>p.reverse(),p=>p[1].paragraphs.push(p[0].paragraphs[0]),p=>p[0].paragraphs[0]='foreign',p=>p[0].lines=['가'.repeat(61)],p=>p[0].recipe='arbitrary-code']){
  const candidate=structuredClone(plan);change(candidate);assert.throws(()=>validateStoryPlan(candidate,source));
 }
 assert.throws(()=>selectedStoryParagraphs(storySource(Array.from({length:25},(_,i)=>'문단 '+i).join('\n'))));
});
test('audit catches authored note changes, missing cues, duplicated pages and order changes without altering artwork',()=>{
 const {story}=setup(),slides=storySlides(story),original=structuredClone(slides);
 const changed=structuredClone(slides);changed[0].notes='다르게 읽기';assert.equal(auditStory(story,changed).changed.length,1);
 assert.equal(auditStory(story,slides.slice(1)).missing.length,1);
 assert.equal(auditStory(story,[...slides,slides[0]]).duplicate.length,1);
 assert.equal(auditStory(story,[...slides,{...slides[0],id:'pcopied'}]).duplicate.length,1);
 assert.equal(auditStory(story,[...slides,{id:'pnew',notes:'새로 쓴 발화',items:[]}]).unlinked.length,1);
 const hidden=structuredClone(slides);hidden[0].hidden=true;assert.equal(auditStory(story,hidden).hidden.length,1);assert.equal(auditStory(story,hidden).passed,false);
 assert.equal(auditStory(story,slides.toReversed()).inOrder,false);
 assert.deepEqual(slides,original);
 const broken=structuredClone(story);broken.scenes[0].cues[0].pageId=broken.scenes[1].cues[0].pageId;assert.throws(()=>cleanStory(broken));
});
