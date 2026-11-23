import {el} from './ui.js';
import {storySource,cleanStorySource,selectedStoryParagraphs,localStoryPlan,validateStoryPlan,makeStory,storySlides,auditStory,STORY_RECIPES} from '../src/story.js';
import {readStoryFile} from './story-source.js';

export function createStoryAuthor({provider=null,draftKey,view,onCreate,onClose}){
 let source=null,plan=null,before=null,asking=null,disposed=false,reading=false;
 const status=el('p',{class:'cv-down-note',role:'status','aria-live':'polite'});
 const title=el('input',{'aria-label':'이야기 이름',maxLength:60,value:'나의 이야기'});
 const script=el('textarea',{'aria-label':'발표 원고',rows:7,maxLength:60000,placeholder:'읽을 원고를 붙여 넣어 주세요. 줄마다 한 발화로 연결합니다.'});
 const prompt=el('textarea',{'aria-label':'이야기 제작 의도',rows:2,maxLength:600,placeholder:'예: 교육가족에게 사람 중심 교육의 약속을 따뜻하고 품격 있게 전하고 싶어요.'});
 const selected=el('div',{class:'story-source-list'}),scenes=el('div',{class:'story-scene-list'});
 const selection=el('details',{},el('summary',{text:'읽을 문단 선택 · 제목·목차 제외'}),selected);
 const count=el('p',{class:'cv-down-note'}),changes=el('div',{class:'story-changes'});
 const file=el('input',{type:'file',accept:'.hwpx,.txt,.md','aria-label':'원고 파일'});
 const fields=el('fieldset',{class:'story-fields'});
 const read=el('button',{class:'btn',type:'button',dataset:{storyRead:''},onClick:()=>{
  try{source=storySource(script.value);plan=null;before=null;render();save();status.textContent='읽을 문단을 골라 주세요. 선택한 발화는 그대로 유지합니다.';}catch(e){status.textContent=e.message;}
 }},'원고 읽기');
 const local=el('button',{class:'btn',type:'button',dataset:{storyLocal:''},onClick:()=>{
  try{plan=localStoryPlan(source);before=null;render();save();status.textContent='문단 순서대로 나눈 초안입니다. 제목과 화면 문구를 직접 고쳐 주세요. 질문권을 쓰지 않았어요.';}catch(e){status.textContent=e.message;}
 }},'직접 구성 시작 · 차감 없음');
 const ai=provider?el('button',{class:'btn btn-primary',type:'button',dataset:{storyAi:''},onClick:()=>ask()},'AI 이야기 초안 · 질문권 1회'):null;
 const stop=el('button',{class:'btn',type:'button',hidden:true,onClick:()=>asking?.abort()},'응답 기다리기 중단');
 const undo=el('button',{class:'btn',type:'button',hidden:true,onClick:()=>{if(!before)return;plan=before;before=null;render();save();status.textContent='이전 구성으로 되돌렸어요. 추가 질문권을 쓰지 않았어요.';}},'이전 구성으로 되돌리기');
 const make=el('button',{class:'btn btn-primary',type:'button',dataset:{storyCreate:''},disabled:true,onClick:async()=>{
  if(disposed||asking||reading)return;
  try{
   const story=makeStory(source,plan),slides=storySlides(story);make.disabled=true;
   await onCreate({title:title.value.trim()||'나의 이야기',story,slides});
   try{localStorage.removeItem(draftKey);}catch{/* the document is already saved */}
  }catch(e){status.textContent=e.message;make.disabled=!plan;}
 }},'검토한 이야기로 새 발표 만들기');
 const close=el('button',{class:'btn',type:'button',onClick:onClose},'닫기');
 const summary=el('p',{class:'cv-down-note',text:'짧은 원고 1~24문단을 최대 6개 장면으로 구성합니다. 발화는 원문에서 그대로 가져옵니다.'});
 const root=el('section',{class:'story-author','aria-label':'원고로 이야기 만들기'},el('h2',{text:'원고로 이야기 만들기'}),summary,fields,status,stop,el('div',{class:'story-actions'},make,close));
 fields.append(el('div',{class:'story-columns'},
  el('section',{class:'story-source'},el('label',{},'이야기 이름',title),el('label',{},'원고 파일 · HWPX / TXT',file),el('label',{},'발표 원고',script),read,selection,count,el('label',{},'듣는 사람 · 남길 뜻 · 분위기',prompt),el('div',{class:'story-actions'},local,ai),
   el('p',{class:'cv-down-note',text:provider?'AI에는 선택한 원문과 제작 의도만 보냅니다. 접수 1건에 질문권 1회이며, 접수 후 실패·중단되어도 횟수에 포함됩니다.':'이곳에서는 직접 구성을 쓸 수 있어요. AI 제작은 AI-G가 연결된 온바탕에서 제공합니다.'})),
  el('section',{class:'story-plan'},el('h3',{text:'장면과 발화 검토'}),undo,changes,scenes)));
 function save(){if(disposed)return;try{localStorage.setItem(draftKey,JSON.stringify({title:title.value,script:script.value,prompt:prompt.value,source,plan}));}catch{status.textContent='임시 구성을 저장하지 못했어요. 원고를 복사해 두고 다시 열어 주세요.';}}
 function lock(busy){fields.disabled=busy;make.disabled=busy||!plan;stop.hidden=!asking;}
 function updateSummary(){
  if(!source){count.textContent='원고를 읽으면 문단별 발화를 확인할 수 있어요.';return;}
  const rows=source.paragraphs.filter(p=>p.spoken);count.textContent=`선택 ${rows.length} / ${source.paragraphs.length}문단 · ${rows.reduce((n,p)=>n+p.text.length,0).toLocaleString()}자`;
 }
 function render(){
  selected.replaceChildren(...(source?.paragraphs||[]).map((p,i)=>el('label',{class:'story-source-row'},el('input',{type:'checkbox',checked:p.spoken,'aria-label':`${i+1}문단 발화 포함`,onChange:e=>{p.spoken=e.target.checked;plan=null;before=null;render();save();}}),el('span',{text:`${i+1}. ${p.text}`}))));
  updateSummary();undo.hidden=!before;scenes.replaceChildren();changes.replaceChildren();
  if(before&&plan)changes.append(el('details',{},el('summary',{text:'이전 구성과 비교 · 차감 없음'}),...before.map((s,i)=>el('p',{text:`${s.title} → ${plan[i]?.title||'(묶음 변경)'}`}))));
  if(!plan){scenes.append(el('p',{class:'cv-down-note',text:'직접 구성을 시작하거나 AI에게 초안을 요청해 주세요.'}));lock(!!asking||reading);return;}
  plan.forEach((scene,i)=>{
   const heading=el('input',{value:scene.title,maxLength:60,'aria-label':`${i+1}장면 제목`,onInput:e=>{scene.title=e.target.value;save();}});
   const purpose=el('input',{value:scene.purpose,maxLength:180,'aria-label':`${i+1}장면 목적`,onInput:e=>{scene.purpose=e.target.value;save();}});
   const lines=el('textarea',{rows:3,value:scene.lines.join('\n'),'aria-label':`${i+1}장면 화면 문구`,placeholder:'화면에 보일 문구 · 최대 3줄, 줄마다 60자',onInput:e=>{scene.lines=e.target.value.split('\n').filter(s=>s.trim());save();}});
   const recipe=el('select',{'aria-label':`${i+1}장면 연출`,onChange:e=>{scene.recipe=e.target.value;save();}},...Object.entries(STORY_RECIPES).map(([value,label])=>el('option',{value,selected:value===scene.recipe,text:label})));
   const speech=scene.paragraphs.map(id=>source.paragraphs.find(p=>p.id===id).text);
   const split=el('button',{class:'btn',type:'button',disabled:scene.paragraphs.length<2||plan.length>=6,onClick:()=>{
    const at=Math.ceil(scene.paragraphs.length/2),tail=scene.paragraphs.slice(at);scene.paragraphs=scene.paragraphs.slice(0,at);plan.splice(i+1,0,{...scene,title:scene.title.slice(0,54)+' (계속)',lines:[...scene.lines],paragraphs:tail});render();save();
   }},'발화 묶음 나누기');
   const merge=el('button',{class:'btn',type:'button',disabled:i===plan.length-1,onClick:()=>{scene.paragraphs.push(...plan[i+1].paragraphs);plan.splice(i+1,1);render();save();}},'다음 장면과 묶기');
   const preview=el('div',{class:'story-preview'});
   const show=()=>{try{const candidate=makeStory(source,plan);preview.replaceChildren(view(storySlides(candidate).find(p=>p.id===candidate.scenes[i].cues[0].pageId)));status.textContent='미리보기에는 질문권을 쓰지 않아요.';}catch(e){status.textContent=e.message;}};
   scenes.append(el('article',{class:'story-scene'},el('h3',{text:`${i+1}장면 · ${speech.length}개 발화 단계`}),el('label',{},'장면 제목',heading),el('label',{},'장면의 뜻 · 제작자만 확인',purpose),el('label',{},'화면 문구',lines),el('label',{},'연출 · 차감 없음',recipe),el('details',{},el('summary',{text:'연결된 원문 발화'}),...speech.map(t=>el('p',{class:'story-spoken',text:t}))),el('div',{class:'story-actions'},split,merge,el('button',{class:'btn',type:'button',onClick:show},'미리보기')),preview));
  });
  make.textContent=`${plan.length}개 장면 · ${plan.reduce((n,s)=>n+s.paragraphs.length,0)}개 발화로 새 발표 만들기`;lock(!!asking||reading);
 }
 async function ask(){
  if(!provider||asking||disposed)return;
  let request;try{request={kind:'slides',task:'story',title:title.value.trim()||'나의 이야기',prompt:prompt.value,paragraphs:selectedStoryParagraphs(source).map(({id,text})=>({id,text}))};}catch(e){status.textContent=e.message;return;}
  const control=asking=new AbortController();lock(true);status.textContent='AI-G 연결을 확인하고 있어요.';
  try{
   // connect is invoked in the click turn, before awaiting, so a relay popup can open.
   await provider.connect();control.signal.throwIfAborted();
   const result=await provider.generate(request,{signal:control.signal,onProgress:p=>{if(!disposed)status.textContent=p?.message||'AI가 이야기를 구성하고 있어요.';}});
   if(disposed||asking!==control)return;control.signal.throwIfAborted();
   if(result?.kind!=='slides'||!Array.isArray(result.ops)||result.ops.some(o=>o?.op!=='scene'))throw Error('장면 초안을 읽지 못했어요. 기존 구성은 유지됩니다.');
   const next=validateStoryPlan(result.ops,source);before=plan;plan=next;render();save();status.textContent=`${result.say||'이야기 초안을 받았어요.'} ${result.receipt||''} · 발화는 원문과 일치합니다. 검토 후 새 발표로 만들어 주세요.`;
  }catch(e){if(!disposed)status.textContent=e.name==='AbortError'?'응답 기다리기를 중단했어요. 접수된 요청의 질문권은 사용 내역에서 확인해 주세요.':e.message;}
  finally{if(asking===control)asking=null;if(!disposed)lock(false);}
 }
 script.addEventListener('input',()=>{source=null;plan=null;before=null;render();save();});title.addEventListener('input',save);prompt.addEventListener('input',save);
 file.addEventListener('change',async()=>{
  const chosen=file.files?.[0];if(!chosen||asking||reading)return;reading=true;lock(true);
  try{const raw=await readStoryFile(chosen);if(disposed)return;const next=storySource(raw,chosen.name);script.value=raw;source=next;plan=null;before=null;render();save();status.textContent='본문을 읽었어요. 읽을 구간을 최대 24문단 선택해 주세요.';}
  catch(e){if(!disposed)status.textContent=e.message;}finally{reading=false;if(!disposed)lock(false);file.value='';}
 });
 try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');if(saved){title.value=saved.title||'나의 이야기';script.value=saved.script||'';prompt.value=saved.prompt||'';source=saved.source?cleanStorySource(saved.source):null;plan=source&&saved.plan?validateStoryPlan(saved.plan,source):null;}}catch{status.textContent='이전 임시 구성을 읽지 못했어요. 원고를 다시 넣어 주세요.';source=null;plan=null;}
 render();
 return {node:root,destroy(){disposed=true;asking?.abort();},focus(){script.focus();}};
}

export function storyAuditView(story,slides){
 const audit=auditStory(story,slides),out=el('section',{class:'story-author','aria-label':'원고 대조'},el('h2',{text:'원고 대조 · 질문권 차감 없음'}));
 out.append(el('p',{text:`${audit.scenes}개 장면 · ${audit.cues}개 발화 · 기준 ${audit.paragraphs}문단`}),el('p',{role:'status',text:audit.passed?'선택한 원고와 발화·순서가 일치해요.':`누락 ${audit.missing.length} · 중복 ${audit.duplicate.length} · 원문과 다른 발화 ${audit.changed.length} · 순서 ${audit.inOrder?'일치':'확인 필요'}`}));
 const names=new Map(story.scenes.flatMap(s=>s.cues.map((c,i)=>[c.pageId,`${s.title} / ${i+1}발화`])));
 for(const [label,ids]of [['누락',audit.missing],['중복',audit.duplicate],['원문과 다른 발화',audit.changed]])for(const id of ids)out.append(el('p',{text:`${label}: ${names.get(id)}`}));
 out.append(el('details',{},el('summary',{text:'기준 원고와 장면 목적'}),...story.scenes.map(s=>el('section',{},el('h3',{text:s.title}),el('p',{text:s.purpose}),...s.paragraphs.map(id=>el('p',{class:'story-spoken',text:story.source.paragraphs.find(p=>p.id===id).text}))))));
 return out;
}
