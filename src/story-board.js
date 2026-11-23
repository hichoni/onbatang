// Read the current native pages through stable cue bindings. Never rebuild artwork.
import {cleanStory,auditStory} from './story.js';
import {cleanNotes,NOTES_LIMIT} from './document.js';

export function storyBoard(raw,slides){
 const story=cleanStory(raw),audit=auditStory(story,slides),source=new Map(story.source.paragraphs.map(p=>[p.id,p.text]));
 const bound=new Set(story.scenes.flatMap(s=>s.cues.map(c=>c.pageId)));
 const scenes=story.scenes.map((scene,sceneIndex)=>({...scene,rows:scene.cues.map((cue,cueIndex)=>{
  const indices=slides.flatMap((p,i)=>p.id===cue.pageId?[i]:[]),page=indices.length===1?slides[indices[0]]:null;
  return {cue,sceneIndex,cueIndex,indices,page,source:source.get(cue.paragraph),changed:!!page&&(page.notes||'')!==source.get(cue.paragraph),hidden:!!page?.hidden};
 })}));
 return {story,audit,scenes,extra:slides.flatMap((page,index)=>bound.has(page.id)?[]:[{page,index}])};
}

export function replaceStorySpeech(raw,slides,cueId,value){
 const board=storyBoard(raw,slides),row=board.scenes.flatMap(s=>s.rows).find(r=>r.cue.id===cueId);
 if(!row)throw Error('연결된 발화를 찾지 못했어요. 이야기를 다시 열어 주세요.');
 if(!row.indices.length)throw Error('연결된 장이 삭제됐어요. 편집기의 실행 취소로 먼저 복원해 주세요.');
 if(row.indices.length!==1)throw Error('같은 이름표의 장이 겹쳐 있어요. 장 목록에서 먼저 확인해 주세요.');
 if(typeof value!=='string'||value.length>NOTES_LIMIT)throw Error(`발화는 ${NOTES_LIMIT.toLocaleString('ko-KR')}자 이하로 적어 주세요.`);
 const notes=cleanNotes(value);
 // Reject input that native persistence would silently alter.
 if(notes!==value)throw Error('발화의 제어 문자나 줄바꿈 형식을 확인해 주세요.');
 if(notes===(row.page.notes||''))return slides;
 return slides.map((page,i)=>{
  if(i!==row.indices[0])return page;
  const {notes:previous,...rest}=page;
  return notes?{...rest,notes}:rest;
 });
}
