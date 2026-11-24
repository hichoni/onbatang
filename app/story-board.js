import {el} from './ui.js';
import {NOTES_LIMIT} from '../src/document.js';
import {storyBoard,replaceStorySpeech} from '../src/story-board.js';

export function createStoryBoard(host){
 const state=host.state,drafts=state.drafts;
 let selected=state.selected,busy=false,disposed=false,pending=null,undoToken=null;
 const nav=el('nav',{class:'story-board-nav','aria-label':'장면과 발화'}),content=el('section',{class:'story-board-content'});
 const fields=el('fieldset',{class:'story-fields'},el('div',{class:'story-board-layout'},nav,content));
 const summary=el('p',{class:'cv-down-note',dataset:{storyBoardSummary:''}}),status=el('p',{role:'status','aria-live':'polite'});
 const undo=el('button',{class:'btn',type:'button',disabled:true,onClick:async()=>{
  if(busy||!undoToken)return;
  if(!host.canUndo(undoToken)){status.textContent='그 뒤에 편집한 내용이 있어요. 편집기의 실행 취소로 순서대로 되돌려 주세요.';return;}
  const problem=host.blocked();if(problem){status.textContent=problem;return;}
  busy=true;fields.disabled=true;undo.disabled=true;
  try{if(await host.undo(undoToken)){undoToken=null;pending=null;render();status.textContent='발화 수정을 되돌렸어요. 기준 원고와 화면은 그대로예요.';}}
  catch(e){status.textContent=e.message;}
  finally{busy=false;if(!disposed){fields.disabled=false;undo.disabled=!undoToken;}}
 }},'마지막 발화 수정 되돌리기');
 const root=el('section',{class:'story-author story-board','aria-label':'이야기 작업실'},el('h2',{text:'이야기 작업실'}),
  el('p',{class:'cv-down-note',text:'장면 흐름을 보며 현재 화면과 읽을 말을 맞춥니다. 발화 수정은 질문권을 쓰지 않습니다.'}),summary,fields,status,undo,
  el('p',{class:'cv-down-note',text:'기준 원고는 비교용으로 보존합니다. 수정 칸에만 적은 내용은 이 편집 화면을 나가면 저장되지 않아요. 적용한 발화는 발표자 노트로 저장됩니다.'}));
 function select(id){if(busy||disposed)return;selected=state.selected=id;pending=null;status.textContent='';render();}
 function edit(pageId){const problem=host.blocked();if(problem){status.textContent=problem;return;}host.edit(pageId);}
 function render(){
  if(disposed)return;
  const board=storyBoard(host.story(),host.slides()),rows=board.scenes.flatMap(s=>s.rows),audit=board.audit;
  if(!rows.some(r=>r.cue.id===selected))selected=rows[0]?.cue.id;
  state.selected=selected;
  summary.textContent=audit.passed?`${audit.scenes}개 장면 · ${audit.cues}개 발화 · 기준 원고와 발화·순서가 일치해요.`:
   `${audit.scenes}개 장면 · ${audit.cues}개 발화 · 누락 ${audit.missing.length} · 중복 ${audit.duplicate.length} · 수정 ${audit.changed.length} · 연결 없는 발화 ${audit.unlinked.length} · 숨김 ${audit.hidden.length} · 순서 ${audit.inOrder?'일치':'확인 필요'}`;
  nav.replaceChildren(...board.scenes.map((scene,i)=>el('section',{class:'story-board-scene'},el('h3',{text:`${i+1}. ${scene.title}`}),...scene.rows.map(row=>{
   const warning=!row.indices.length?'장 없음':row.indices.length>1?'중복 장':row.hidden?'숨긴 발화':row.changed?'원고와 다름':'원고 일치';
   return el('button',{class:'btn story-board-cue',type:'button','aria-pressed':row.cue.id===selected?'true':'false',dataset:{storyCue:row.cue.id},onClick:()=>select(row.cue.id)},el('strong',{text:`${row.cueIndex+1}발화 · ${row.indices.length===1?`${row.indices[0]+1}장`:warning}`}),el('span',{text:row.page?(row.page.notes||'발화 없음').slice(0,65):row.source.slice(0,65)}),el('small',{text:warning}));
  }))));
  if(board.extra.length)nav.append(el('section',{class:'story-board-scene'},el('h3',{text:'장면에 연결되지 않은 장'}),...board.extra.map(({page,index})=>el('button',{class:'btn story-board-cue',type:'button',onClick:()=>edit(page.id)},`${index+1}장 · ${page.notes?'발화 확인 필요':'화면만 있음'}`))));
  content.replaceChildren();undo.disabled=!undoToken;
  const row=rows.find(r=>r.cue.id===selected);if(!row)return;
  const scene=board.scenes[row.sceneIndex];
  content.append(el('h3',{text:`${row.sceneIndex+1}장면 · ${row.cueIndex+1}발화`}),el('details',{},el('summary',{text:'이 장면의 뜻 · 제작자만 확인'}),el('p',{class:'story-spoken',text:scene.purpose||'적어 둔 제작 메모가 없어요.'})));
  if(row.page)content.append(el('div',{class:'story-board-preview'},host.view(row.page)),el('button',{class:'btn',type:'button',onClick:()=>edit(row.cue.pageId)},'이 화면의 글·사진·배치 편집'));
  content.append(el('section',{class:'story-board-source'},el('h3',{text:'기준 원고'}),el('p',{class:'story-spoken',text:row.source})));
  if(!row.page){content.append(el('p',{role:'status',text:row.indices.length?'같은 이름표의 장이 겹쳐 있어 발화 편집을 멈췄어요. 장 목록에서 확인해 주세요.':'연결된 장이 삭제됐어요. 편집기의 실행 취소로 먼저 복원해 주세요.'}));return;}
  const current=row.page.notes||'',draft=drafts.get(selected),value=draft?.value??current;
  const input=el('textarea',{rows:4,maxLength:NOTES_LIMIT,'aria-label':'선택한 발화 수정',value});
  const compare=el('div',{class:'story-board-compare'});
  const apply=el('button',{class:'btn btn-primary',type:'button',disabled:true,onClick:async()=>{
   if(!pending||busy)return;
   try{
    if(JSON.stringify(host.slides())!==JSON.stringify(pending.base)||JSON.stringify(host.story())!==pending.story)throw Error('비교하는 동안 자료가 바뀌었어요. 다시 비교해 주세요.');
    const problem=host.blocked();if(problem)throw Error(problem);
    busy=true;fields.disabled=true;undo.disabled=true;
    const token=await host.apply(pending.next,pending.base);if(!token)throw Error('발화를 적용하지 못했어요. 기존 내용은 유지됩니다.');
    undoToken=token;drafts.delete(selected);pending=null;render();status.textContent='선택한 발화를 적용했어요. 사진·배치·동작과 기준 원고는 그대로예요.';
   }catch(e){status.textContent=e.message;pending=null;apply.disabled=true;}
   finally{busy=false;if(!disposed){fields.disabled=false;undo.disabled=!undoToken;}}
  }},'이 발화에 적용 · 차감 없음');
  const check=el('button',{class:'btn',type:'button',disabled:value===current,onClick:()=>{
   try{
    const base=structuredClone(host.slides()),live=storyBoard(host.story(),base).scenes.flatMap(s=>s.rows).find(r=>r.cue.id===selected),remembered=drafts.get(selected);
    if(remembered&&remembered.base!==((live?.page?.notes)||''))throw Error('수정 칸을 작성한 뒤 현재 발화가 바뀌었어요. 현재 발화 다시 읽기를 눌러 확인해 주세요.');
    const next=replaceStorySpeech(host.story(),base,selected,input.value);if(next===base)return;
    pending={base,next,story:JSON.stringify(host.story())};
    compare.replaceChildren(el('section',{},el('h3',{text:'적용 전 발화'}),el('p',{class:'story-spoken',text:live.page.notes||'발화 없음'})),el('section',{},el('h3',{text:'적용할 발화'}),el('p',{class:'story-spoken',text:input.value||'발화 없음'})));
    apply.disabled=false;status.textContent=input.value?'전후를 비교한 뒤 적용해 주세요. 아직 발표는 바뀌지 않았어요.':'발화 없이 진행하는 단계로 바뀝니다. 비교한 뒤 적용해 주세요.';
   }catch(e){pending=null;apply.disabled=true;status.textContent=e.message;}
  }},'수정 전후 비교');
  function changed(){drafts.set(selected,{base:draft?.base??current,value:input.value});pending=null;compare.replaceChildren();apply.disabled=true;check.disabled=input.value===current;}
  input.addEventListener('input',changed);
  content.append(el('label',{},'읽을 발화 · 화면에는 표시되지 않아요',input),el('div',{class:'story-actions'},
   el('button',{class:'btn',type:'button',onClick:()=>{input.value=row.source;changed();status.textContent='기준 원고를 수정 칸에 넣었어요. 비교 후 적용하면 복원됩니다.';}},'기준 원고로 복원 준비'),
   el('button',{class:'btn',type:'button',onClick:()=>{drafts.delete(selected);pending=null;render();status.textContent='현재 발화를 다시 읽었어요. 적용 전 입력은 버렸습니다.';}},'현재 발화 다시 읽기')),check,compare,apply);
 }
 render();return {node:root,destroy(){disposed=true;}};
}
