import test from 'node:test';
import assert from 'node:assert/strict';
import {storySource,localStoryPlan,makeStory,storySlides,auditStory} from '../src/story.js';
import {storyPhotoId,cleanStoryPhoto,keepStoryPhotos,restoreStoryPhotos,illustrateStory,storyPhotoGroups,replaceStoryPhoto} from '../src/story-photos.js';
import {newRecord,migrateRecord,copyRecord} from '../app/designs.js';
import {packOnbatang,readOnbatang,freshCopy} from '../app/onbatang-file.js';
const photo=()=>({id:storyPhotoId(),url:'data:image/png;base64,aGVsbG8=',ratio:1,alt:'사진 설명'});
const setup=()=>{const source=storySource('첫 발화\n다음 발화\n마지막 발화'),plan=localStoryPlan(source),p=photo();plan[0].photo=p;plan[1].photo=p;const story=makeStory(source,plan),slides=illustrateStory(story,storySlides(story),plan);return {source,plan,story,slides,p};};
test('pictures use native shared identities, preserve speech, fit beside text and survive editable files/copies',async()=>{
 const {plan,story,slides,p}=setup();assert.ok(auditStory(story,slides).passed);assert.equal(storyPhotoGroups(slides)[0].count,2);
 assert.equal(slides[2].items.some(i=>i.t==='image'),false);
 for(const page of slides.slice(0,2)){const image=page.items.find(i=>i.t==='image');assert.equal(image.morphKey,p.id);assert(image.x-image.w/2>=58);assert(image.y+image.h/2<=82);for(const text of page.items.filter(i=>i.t==='text'&&i.size>1.4))assert(text.x+text.w/2<=51);}
 assert.equal(JSON.stringify(story).includes('data:image'),false,'speech/production metadata does not retain photo bytes');
 const record=migrateRecord({...newRecord(),story,slides});assert.equal(storyPhotoGroups(record.slides)[0].count,2);
 for(const copy of [copyRecord(record),freshCopy(await readOnbatang(await packOnbatang({records:[record]}))).records[0]]){assert.equal(storyPhotoGroups(copy.slides)[0].id,p.id);assert.ok(auditStory(copy.story,copy.slides).passed);}
 assert.equal(restoreStoryPhotos(localStoryPlan(story.source),plan)[0].photo.id,p.id);
});
test('global replacement preserves edited layout, crop, identity, alt and motion; locked or individually replaced pictures reject the whole edit',()=>{
 const {slides,p}=setup();const item=slides[0].items.find(i=>i.t==='image');Object.assign(item,{x:71,y:40,w:27,h:50,rot:12,an:'left',dl:.4,lp:'breathe',flipX:true,crop:{x:0,y:0,w:.8,h:1}});
 const base=structuredClone(slides),nextPhoto={...photo(),url:'data:image/png;base64,bmV3'},next=replaceStoryPhoto(slides,p.id,nextPhoto);
 const withoutUrl=pages=>pages.map(s=>({...s,items:s.items.map(({url,...rest})=>rest)}));assert.deepEqual(withoutUrl(next),withoutUrl(base));assert.deepEqual(slides,base);
 assert.equal(next[0].items.find(i=>i.t==='image').url,nextPhoto.url);assert.equal(next[1].items.find(i=>i.t==='image').url,nextPhoto.url);
 const diverged=structuredClone(slides);diverged[1].items.find(i=>i.t==='image').url=nextPhoto.url;assert.throws(()=>replaceStoryPhoto(diverged,p.id,nextPhoto),/따로 바꾼/);
 const locked=structuredClone(slides);locked[0].items.find(i=>i.t==='image').lock=true;assert.throws(()=>replaceStoryPhoto(locked,p.id,nextPhoto),/잠근/);
});
test('AI regrouping never imports images and keeps author pictures by source paragraph; invalid or oversized image data is rejected',()=>{
 const {source,plan,p}=setup(),clean=localStoryPlan(source);clean[0].photo={...photo(),url:'https://untrusted.test/photo.png'};
 assert.equal(keepStoryPhotos(clean,plan)[0].photo.id,p.id);
 const noPrevious=keepStoryPhotos(clean,[]);assert.equal(noPrevious[0].photo,undefined);
 for(const bad of [{...p,url:'https://example.test/x.png'},{...p,url:'data:image/svg+xml;base64,aA=='},{...p,ratio:Infinity},{...p,url:'data:image/png;base64,'+'a'.repeat(750000)}])assert.throws(()=>cleanStoryPhoto(bad));
});
