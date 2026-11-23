// A story keeps the source, scene plan and cue/page bindings separate from artwork.
// AI may propose scene data. Speech always comes from the selected source paragraphs.
import {newId,legacyId} from './document.js';

export const STORY_LIMITS=Object.freeze({characters:12000,paragraphs:24,paragraphLength:3000,scenes:6,title:60,line:60,purpose:180});
export const STORY_RECIPES=Object.freeze({sequential:'차례로 강조',together:'함께 강조',calm:'차분한 전환'});
const id=value=>typeof value==='string'&&/^[a-z][a-z0-9]{1,31}$/.test(value);
const invalid=message=>{throw Error(message);};
const text=(value,max,label,empty=false)=>{
 if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))invalid(label+'을 확인해 주세요.');
 return value;
};
export function storySource(raw,name='붙여 넣은 원고'){
 text(raw,60000,'원고');
 const rows=raw.replace(/\r\n?/g,'\n').split(/\n+/).map(s=>s.trim()).filter(Boolean);
 if(!rows.length||rows.length>300)invalid('원고는 1~300문단으로 넣어 주세요.');
 if(rows.some(s=>s.length>STORY_LIMITS.paragraphLength))invalid('긴 문단을 3,000자 이하의 발화로 나눠 주세요.');
 return {id:newId('s'),name:String(name).slice(0,180),paragraphs:rows.map(value=>({id:newId('r'),text:value,spoken:true}))};
}
export function cleanStorySource(value){
 if(!value||!id(value.id)||!Array.isArray(value.paragraphs)||!value.paragraphs.length||value.paragraphs.length>300)invalid('기준 원고를 확인해 주세요.');
 const seen=new Set();
 const paragraphs=value.paragraphs.map(p=>{
  if(!id(p?.id)||seen.has(p.id)||typeof p.spoken!=='boolean')invalid('원고 문단의 이름표를 확인해 주세요.');
  seen.add(p.id);return {id:p.id,text:text(p.text,STORY_LIMITS.paragraphLength,'원고 문단'),spoken:p.spoken};
 });
 if(paragraphs.reduce((n,p)=>n+p.text.length,0)>60000)invalid('원고가 너무 길어요.');
 return {id:value.id,name:text(value.name,180,'파일 이름',true),paragraphs};
}
export function selectedStoryParagraphs(source){
 const rows=cleanStorySource(source).paragraphs.filter(p=>p.spoken);
 if(!rows.length||rows.length>STORY_LIMITS.paragraphs)invalid('첫 이야기에는 읽을 문단을 1~24개 골라 주세요. 제목·목차는 체크를 풀어 주세요.');
 if(rows.reduce((n,p)=>n+p.text.length,0)>STORY_LIMITS.characters)invalid('선택한 발화는 12,000자까지 만들 수 있어요. 짧은 구간부터 골라 주세요.');
 return rows;
}
// No missing, duplicated, foreign or reordered source IDs are silently accepted.
export function validateStoryPlan(value,source){
 const rows=selectedStoryParagraphs(source);
 if(!Array.isArray(value)||!value.length||value.length>STORY_LIMITS.scenes)invalid('이야기를 1~6개 장면으로 구성해 주세요.');
 const plan=value.map(scene=>{
  if(!scene||!Array.isArray(scene.paragraphs)||!scene.paragraphs.length||!Array.isArray(scene.lines)||scene.lines.length>3||!Object.hasOwn(STORY_RECIPES,scene.recipe))invalid('장면의 발화와 연출을 확인해 주세요.');
  return {title:text(scene.title,STORY_LIMITS.title,'장면 제목'),purpose:text(scene.purpose,STORY_LIMITS.purpose,'장면의 뜻',true),lines:scene.lines.map(s=>text(s,STORY_LIMITS.line,'화면 문구')),recipe:scene.recipe,paragraphs:[...scene.paragraphs]};
 });
 const refs=plan.flatMap(s=>s.paragraphs);
 if(refs.length!==rows.length||refs.some((ref,i)=>ref!==rows[i].id))invalid('장면의 발화에 누락·중복·순서 변경이 있어요. 원고 순서대로 모두 연결해 주세요.');
 return plan;
}
export function localStoryPlan(source){
 const rows=selectedStoryParagraphs(source),count=Math.min(6,rows.length),plan=[];
 for(let i=0;i<count;i++){
  const part=rows.slice(Math.floor(i*rows.length/count),Math.floor((i+1)*rows.length/count));
  plan.push({title:part[0].text.slice(0,32),purpose:'',lines:[],recipe:'calm',paragraphs:part.map(p=>p.id)});
 }
 return validateStoryPlan(plan,source);
}
export function makeStory(source,plan){
 const clean=cleanStorySource(source);
 return {version:1,id:newId('y'),source:clean,scenes:validateStoryPlan(plan,clean).map(scene=>({...scene,id:newId('c'),cues:scene.paragraphs.map(paragraph=>({id:newId('q'),paragraph,pageId:newId('p')}))}))};
}
export function cleanStory(value){
 if(!value||value.version!==1||!id(value.id)||!Array.isArray(value.scenes))invalid('저장한 이야기 형식을 확인해 주세요.');
 const source=cleanStorySource(value.source),plan=validateStoryPlan(value.scenes,source),seen=new Set();
 const unique=(key)=>{if(!id(key)||seen.has(key))invalid('장면·발화 이름표가 겹쳐요.');seen.add(key);return key;};
 const scenes=plan.map((scene,i)=>{
  const saved=value.scenes[i];
  if(!Array.isArray(saved.cues)||saved.cues.length!==scene.paragraphs.length)invalid('발화 단계 연결을 확인해 주세요.');
  return {...scene,id:unique(saved.id),cues:saved.cues.map((cue,j)=>{
   if(cue.paragraph!==scene.paragraphs[j])invalid('발화 단계의 원고 연결을 확인해 주세요.');
   return {id:unique(cue.id),paragraph:cue.paragraph,pageId:unique(cue.pageId)};
  })};
 });
 return {version:1,id:value.id,source,scenes};
}
export function storySlides(raw){
 const story=cleanStory(raw),paragraphs=new Map(story.source.paragraphs.map(p=>[p.id,p.text]));
 const T=(key,value,x,y,w,size,color,extra={})=>({id:key,t:'text',layout:'slide',text:value,x,y,w,size,color,font:'gothic',align:'c',...extra});
 return story.scenes.flatMap((scene,sceneIndex)=>scene.cues.map((cue,index)=>{
  const itemId=key=>legacyId('e',cue.id+':'+key),morph='m'+scene.id.slice(1);
  const items=[T(itemId('title'),scene.title,50,27,86,5.2,'#fff3da',{bold:true,morphKey:morph}),T(itemId('position'),`${sceneIndex+1} · ${index+1}/${scene.cues.length}`,50,89,80,1.4,'#bfd5cb')];
  scene.lines.forEach((line,j)=>items.push(T(itemId('line'+j),line,50,47+j*12,82,3.0,scene.recipe==='together'||scene.recipe==='calm'||j===index%Math.max(1,scene.lines.length)?'#f5d797':'#afc8c0',{an:'fade',dl:scene.recipe==='sequential'?j*.18:0})));
  return {id:cue.pageId,bg:'#103638',topic:scene.title.slice(0,40),tr:'fade',notes:paragraphs.get(cue.paragraph),items};
 }));
}
export function auditStory(raw,slides){
 const story=cleanStory(raw),rows=selectedStoryParagraphs(story.source),expected=story.scenes.flatMap(s=>s.cues),byPage=new Map(expected.map(c=>[c.pageId,c]));
 const actual=slides.flatMap((p,index)=>byPage.has(p.id)?[{page:p,index,cue:byPage.get(p.id)}]:[]);
 const missing=expected.filter(c=>!actual.some(a=>a.cue.id===c.id)),duplicate=expected.filter(c=>actual.filter(a=>a.cue.id===c.id).length>1);
 const changed=actual.filter(a=>a.page.notes!==rows.find(p=>p.id===a.cue.paragraph).text);
 const ordered=actual.map(a=>a.cue.id),inOrder=ordered.length===expected.length&&ordered.every((id,i)=>id===expected[i].id);
 return {passed:!missing.length&&!duplicate.length&&!changed.length&&inOrder,paragraphs:rows.length,scenes:story.scenes.length,cues:expected.length,missing:missing.map(c=>c.pageId),duplicate:duplicate.map(c=>c.pageId),changed:changed.map(a=>a.page.id),inOrder};
}
export function copyStoryBindings(raw,pageIds){
 const story=cleanStory(raw);
 return {...story,scenes:story.scenes.map(s=>({...s,cues:s.cues.map(c=>({...c,pageId:pageIds.get(c.pageId)||c.pageId}))}))};
}
