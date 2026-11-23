// Story pictures become ordinary native images. Their shared object key survives
// file export, copying and native layout/motion edits; speech has no image data.
import {newId,legacyId} from './document.js';
const KEY=/^mstory[a-z0-9]{6,40}$/;
export function cleanStoryPhoto(value){
 if(!value||!KEY.test(value.id)||typeof value.url!=='string'||value.url.length>750000||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.url)||!Number.isFinite(value.ratio)||value.ratio<.1||value.ratio>10||typeof value.alt!=='string'||value.alt.length>80)throw Error('사진을 확인해 주세요. PNG·JPG·WebP 그림을 다시 골라 주세요.');
 return {id:value.id,url:value.url,ratio:value.ratio,alt:value.alt};
}
export const storyPhotoId=()=> 'mstory'+newId('m').slice(1);
// AI may regroup paragraphs, but cannot supply or replace images. Keep the photo
// attached to the first paragraph in each proposed scene, including split scenes.
export function keepStoryPhotos(plan,before){
 const byParagraph=new Map((before||[]).flatMap(s=>s.paragraphs.map(id=>[id,s.photo])));
 return plan.map(({photo:_,...s})=>({...s,...(byParagraph.get(s.paragraphs[0])?{photo:cleanStoryPhoto(byParagraph.get(s.paragraphs[0]))}:{})}));
}
export function restoreStoryPhotos(plan,saved){
 return plan.map((s,i)=>({...s,...(saved?.[i]?.photo?{photo:cleanStoryPhoto(saved[i].photo)}:{})}));
}
export function illustrateStory(story,slides,plan){
 const targets=new Map(story.scenes.flatMap((s,i)=>plan[i]?.photo?s.cues.map(c=>[c.pageId,{cue:c,photo:cleanStoryPhoto(plan[i].photo)}]):[]));
 return slides.map(page=>{
  const target=targets.get(page.id);if(!target)return page;
  const {cue,photo}=target,title=legacyId('e',cue.id+':title'),lines=new Set([0,1,2].map(j=>legacyId('e',cue.id+':line'+j)));
  const items=page.items.map(it=>it.id===title?{...it,x:28,w:46,y:25,size:it.text.length>32?2.8:it.text.length>18?3.4:4.4}:lines.has(it.id)?{...it,x:28,w:46,size:2.3,y:48+(it.y-47)/12*15}:it);
  const w=Math.min(36,58/(photo.ratio*16/9));
  items.push({id:legacyId('e',cue.id+':photo'),t:'image',layout:'slide',url:photo.url,alt:photo.alt,morphKey:photo.id,x:76,y:51,w,h:w*photo.ratio*16/9,mask:'none',an:'fade',dl:0});
  return {...page,items};
 });
}
export function storyPhotoGroups(slides){
 const groups=new Map();
 for(const page of slides)for(const item of page.items||[]){
  if(item.t!=='image'||!KEY.test(item.morphKey))continue;
  let group=groups.get(item.morphKey);
  if(!group){group={id:item.morphKey,url:item.url,alt:item.alt||'이야기 사진',count:0,pages:new Set(),diverged:false,locked:false};groups.set(group.id,group);}
  group.count++;group.pages.add(page.id);group.diverged||=group.url!==item.url;group.locked||=item.lock===true;
 }
 return [...groups.values()].map(g=>({...g,pages:g.pages.size}));
}
export function replaceStoryPhoto(slides,key,photo){
 const clean=cleanStoryPhoto(photo),group=storyPhotoGroups(slides).find(g=>g.id===key);
 if(!group)throw Error('연결된 사진이 없어요. 자료를 다시 확인해 주세요.');
 if(group.diverged)throw Error('같은 연결 안에서 따로 바꾼 사진이 있어요. 개별 수정 내용을 확인한 뒤 연결을 정리해 주세요.');
 if(group.locked)throw Error('잠근 사진이 있어요. 잠금을 해제한 뒤 함께 바꿔 주세요.');
 return slides.map(page=>({...page,items:page.items.map(it=>{
  if(it.t!=='image'||it.morphKey!==key)return it;
  const {path,source,assetRefs,origin,...rest}=it;
  return {...rest,url:clean.url}; // All placement, crop, alt text and motion stay intact.
 })}));
}
