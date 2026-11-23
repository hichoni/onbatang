import test from 'node:test';
import assert from 'node:assert/strict';
import {storySource,localStoryPlan,makeStory,storySlides,auditStory} from '../src/story.js';
import {storyBoard,replaceStorySpeech} from '../src/story-board.js';
import {storyPhotoId,illustrateStory} from '../src/story-photos.js';
import {newRecord,migrateRecord} from '../app/designs.js';
import {packOnbatang,readOnbatang} from '../app/onbatang-file.js';
const setup=()=>{
 const source=storySource('첫 발화\n두 번째 발화\n마지막 발화'),plan=localStoryPlan(source);
 plan[1].photo={id:storyPhotoId(),url:'data:image/png;base64,aGVsbG8=',ratio:.7,alt:'사진'};
 const story=makeStory(source,plan),slides=illustrateStory(story,storySlides(story),plan);
 slides[1].items[0].x=32;slides[1].items[0].rot=8;slides[1].items.find(i=>i.t==='image').lp='breathe';
 return {story,slides,cue:story.scenes[1].cues[0]};
};
test('a speech edit changes only the selected native note, preserving source, identities, custom artwork and editable-file bindings',async()=>{
 const {story,slides,cue}=setup(),original=structuredClone({story,slides});
 const next=replaceStorySpeech(story,slides,cue.id,'직접 고친 발화\n한 번 더 이야기합니다.');
 assert.deepEqual({story,slides},original);assert.equal(next[0],slides[0]);assert.equal(next[2],slides[2]);
 const {notes,...kept}=next[1],{notes:before,...base}=slides[1];assert.deepEqual(kept,base);
 assert.equal(storyBoard(story,next).scenes[1].rows[0].changed,true);assert.deepEqual(auditStory(story,next).changed,[cue.pageId]);
 const record=migrateRecord({...newRecord(),story,slides:next}),roundtrip=await readOnbatang(await packOnbatang({records:[record]}));
 assert.equal(roundtrip.records[0].slides[1].notes,notes);assert.deepEqual(roundtrip.records[0].story,story);
 const restored=replaceStorySpeech(story,next,cue.id,before);assert.deepEqual(restored,slides);assert.ok(auditStory(story,restored).passed);
 const silent=replaceStorySpeech(story,slides,cue.id,'');assert.equal(Object.hasOwn(silent[1],'notes'),false);assert.equal(storyBoard(story,silent).scenes[1].rows[0].changed,true);
});
test('board exposes missing, repeated, hidden, reordered and unbound pages without reconstructing deleted work',()=>{
 const {story,slides,cue}=setup();
 const missing=slides.filter(p=>p.id!==cue.pageId);assert.equal(storyBoard(story,missing).scenes[1].rows[0].page,null);assert.throws(()=>replaceStorySpeech(story,missing,cue.id,'수정'),/삭제/);
 const duplicate=[...slides,slides[1]];assert.equal(storyBoard(story,duplicate).scenes[1].rows[0].indices.length,2);assert.throws(()=>replaceStorySpeech(story,duplicate,cue.id,'수정'),/겹쳐/);
 const edited=[{id:'pextra',notes:'새 발화',items:[]},...slides.toReversed().map(p=>p.id===cue.pageId?{...p,hidden:true}:p)],board=storyBoard(story,edited);
 assert.equal(board.scenes[1].rows[0].indices[0],2);assert.equal(board.scenes[1].rows[0].hidden,true);assert.equal(board.audit.inOrder,false);assert.equal(board.extra[0].index,0);assert.deepEqual(board.audit.unlinked,['pextra']);
 const next=replaceStorySpeech(story,edited,cue.id,'고친 말');assert.equal(next[2].notes,'고친 말');assert.equal(next[2].hidden,true);assert.deepEqual(next.map(p=>p.id),edited.map(p=>p.id));
});
test('speech edits reject invalid values and unknown bindings instead of truncating or selecting an arbitrary page',()=>{
 const {story,slides,cue}=setup();
 for(const value of ['가'.repeat(5001),null,'\u0000숨은 문자','줄\r\n바꿈','   '])assert.throws(()=>replaceStorySpeech(story,slides,cue.id,value));
 assert.throws(()=>replaceStorySpeech(story,slides,'qunknown','발화'),/찾지 못/);
 assert.equal(replaceStorySpeech(story,slides,cue.id,slides[1].notes),slides);
});
