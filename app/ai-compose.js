// Native authoring: the host supplies AI; this UI creates normal editable slides.
import {el} from './ui.js';
import {settings} from '../src/model.js';
import {COMPOSE_LIMITS,cleanComposeRequest,nativeComposeCatalog,validateComposition,compositionSlides} from '../src/ai-compose.js';
import {readStoryFile} from './story-source.js';
import {readStoryPhoto,ACCEPT_IMAGES} from './story-photos.js';

export function createAiCompose({provider,draftKey,view,onCreate,onClose,inline=false,aspect=()=>16/9,capture=()=>null,blocked=()=>'',onApplied=()=>{},onDraft=()=>{},destination=()=>''}){
 let asking=null,disposed=false,reading=false,saving=false,photos=[],proposal=null;
 const status=el('p',{role:'status','aria-live':'polite',class:'cv-down-note'});
 const draftError=el('p',{role:'alert',hidden:true});
 const prompt=el('textarea',{rows:4,maxLength:COMPOSE_LIMITS.prompt,'aria-label':'만들 발표',placeholder:'누구에게 어떤 이야기를 전할까요? 주제, 듣는 사람, 발표 시간과 원하는 분위기를 적어 주세요.'});
 const count=el('input',{type:'number',min:1,max:24,step:1,value:'10','aria-label':'발표 장 수'});
 const reference=el('textarea',{rows:5,maxLength:COMPOSE_LIMITS.reference,'aria-label':'참고 원고',placeholder:'꼭 담을 내용이나 원고를 붙여 넣어 주세요.'});
 const photoList=el('div',{class:'onba-compose-photos'});
 const file=el('input',{type:'file',accept:'.hwpx,.txt,.md','aria-label':'참고 원고 파일',onChange:async()=>{
  if(asking||reading||saving||!file.files?.[0])return;
  reading=true;lock();try{const text=await readStoryFile(file.files[0]);if(disposed)return;if(text.length>COMPOSE_LIMITS.reference)throw Error('참고 원고는 16,000자까지 넣을 수 있어요. 필요한 부분을 골라 주세요.');reference.value=text;save();status.textContent='원고를 읽었어요. 포함할 내용과 장 수를 확인해 주세요.';}catch(e){if(!disposed)status.textContent=e.message;}finally{reading=false;file.value='';if(!disposed)lock();}
 }});
 const photoFile=el('input',{type:'file',accept:ACCEPT_IMAGES,'aria-label':'발표 사진 추가',onChange:async()=>{
  if(asking||reading||saving||photos.length>=3||!photoFile.files?.[0])return;
  reading=true;lock();try{const photo=await readStoryPhoto(photoFile.files[0]);if(disposed)return;const id=[1,2,3].map(n=>'photo'+n).find(id=>!photos.some(p=>p.id===id));photos.push({...photo,id,alt:photoFile.files[0].name.replace(/\.[^.]+$/,'').slice(0,160)});drawPhotos();save();}catch(e){if(!disposed)status.textContent=e.message;}finally{reading=false;photoFile.value='';if(!disposed)lock();}
 }});
 const ask=el('button',{class:'btn btn-primary',type:'button',dataset:{composeAsk:''},onClick:generate},'AI로 구성·디자인하기 · 질문권 1회');
 const stop=el('button',{class:'btn',type:'button',hidden:true,onClick:()=>asking?.abort()},'기다리기 중단');
 const create=el('button',{class:'btn btn-primary',type:'button',dataset:{composeApply:''},disabled:true,onClick:async()=>{
  if(!proposal||asking||reading||saving||disposed)return;saving=true;lock();
  try{const result=await onCreate({title:proposal.title,slides:structuredClone(proposal.slides),context:proposal.context});if(inline){proposal=null;draw();save();onApplied(result);}else try{localStorage.removeItem(draftKey);}catch{}}
  catch(e){if(!disposed)status.textContent=e.message;}finally{saving=false;if(!disposed)lock();}
 }},inline?'이 발표에 장 넣기':'이 발표를 온바탕에서 편집하기');
 const previews=el('div',{class:'onba-compose-previews','aria-label':'생성한 발표 전체'});
 const resultTitle=el('h3',{text:'만들어진 모든 장을 여기서 확인하세요.'});
 const fields=el('fieldset',{class:'onba-compose-fields'},
  el('label',{},'만들 발표',prompt),el('label',{},'장 수 · 1~24장',count),
  el('details',{},el('summary',{text:'참고 원고와 사진 넣기'}),el('label',{},'HWPX / TXT 원고',file),reference,
   el('label',{},'사진 · 최대 3장',photoFile),photoList,el('p',{class:'cv-down-note',text:'사진 원본은 AI에 보내지 않습니다. 아래 사진 설명을 보고 장에 배치합니다.'})),
  el('p',{class:'cv-down-note',text:'아래 생성 버튼을 누르면 접수 1건에 질문권 1회를 사용합니다. 접수 후 실패·중단도 포함됩니다. 미리보기·직접 편집·저장·발표에는 질문권을 쓰지 않습니다.'}),ask);
 const placement=el('p',{class:'cv-down-note',text:destination()});
 const node=el('section',{class:'onba-compose'+(inline?' onba-compose-inline':''),'aria-label':'온바탕 AI 발표 만들기'},
  el('h2',{text:'어떤 발표를 만들까요?'}),el('p',{class:'cv-down-note',text:'이야기 흐름부터 디자인과 움직임까지 구성합니다. 완성된 모든 장은 온바탕에서 글·도형·사진을 눌러 직접 고칠 수 있어요.'}),
  placement,el('div',{class:'onba-compose-columns'},fields,el('section',{},resultTitle,previews)),draftError,status,
  el('div',{class:'story-actions'},stop,create,...(inline?[]:[el('button',{class:'btn',type:'button',onClick:onClose},'닫기')])));
 function lock(){const busy=!!asking||reading||saving;fields.disabled=busy;ask.disabled=!provider;stop.hidden=!asking;create.disabled=busy||!proposal;photoFile.disabled=photos.length>=3;}
 function save(){if(disposed||!draftKey)return;try{const draft=proposal?{title:proposal.title,request:proposal.request,result:proposal.result,photos:proposal.photos,context:proposal.context}:null;localStorage.setItem(draftKey,JSON.stringify({prompt:prompt.value,count:count.value,reference:reference.value,photos,proposal:draft}));draftError.hidden=true;if(prompt.value.trim()||reference.value.trim()||photos.length||proposal)onDraft();}catch{draftError.hidden=false;draftError.textContent='임시 저장 공간이 부족해요. 창을 닫기 전에 온바탕 발표로 저장해 주세요.';}}
 function drawPhotos(){photoList.replaceChildren(...photos.map(p=>el('div',{class:'onba-compose-photo'},el('img',{src:p.url,alt:p.alt}),el('label',{},'사진 설명',el('input',{value:p.alt,maxLength:160,onInput:e=>{p.alt=e.target.value;save();}})),el('button',{class:'btn',type:'button',onClick:()=>{photos=photos.filter(v=>v!==p);drawPhotos();lock();save();}},'빼기'))));}
 function draw(){previews.replaceChildren();resultTitle.textContent=proposal?`${proposal.title} · ${proposal.slides.length}장`:'만들어진 모든 장을 여기서 확인하세요.';if(proposal){proposal.slides.forEach((slide,i)=>previews.append(el('article',{},view(slide),el('b',{text:`${i+1}. ${slide.topic}`}),el('details',{},el('summary',{text:'발표 원고'}),el('p',{text:slide.notes||'발화 없음'})))));}lock();}
 async function generate(){
  if(!provider||asking||reading||saving||disposed)return;let request,context;
  try{const why=blocked();if(why)throw Error(why);request=cleanComposeRequest({kind:'slides',task:'compose',prompt:prompt.value,count:Number(count.value),reference:reference.value,aspect:aspect(),fonts:nativeComposeCatalog(settings().fonts).fonts,photos:photos.map(p=>({id:p.id,alt:p.alt,aspect:p.ratio}))});context=capture(request);}catch(e){status.textContent=e.message;return;}
  const control=asking=new AbortController();lock();save();status.textContent='AI 연결을 확인하고 있어요.';
  try{
   await provider.connect();control.signal.throwIfAborted();
   const result=await provider.generate(request,{signal:control.signal,onProgress:p=>{if(!disposed)status.textContent=p?.message||'이야기와 장별 디자인을 구성하고 있어요.';}});
   if(disposed||asking!==control)return;control.signal.throwIfAborted();
   const checked=validateComposition(result,request),slides=compositionSlides(checked,request,photos);
   proposal={title:checked.title,slides,request,result:checked,photos:structuredClone(photos),context};draw();save();status.textContent=`${checked.say} ${result.receipt||''} · ${slides.length}장 모두 받았어요. 전체 구성을 확인한 뒤 편집해 주세요.`;
   if(inline)requestAnimationFrame(()=>{if(!disposed)resultTitle.scrollIntoView({block:'start',behavior:'smooth'});});
  }catch(e){if(!disposed)status.textContent=e.name==='AbortError'?'기다리기를 중단했어요. 접수된 요청의 사용 내역을 확인해 주세요.':e.message;}
  finally{if(asking===control)asking=null;if(!disposed)lock();}
 }
 for(const field of [prompt,count,reference])field.addEventListener('input',save);
 try{const draft=JSON.parse(localStorage.getItem(draftKey)||'null');if(draft){prompt.value=String(draft.prompt||'').slice(0,1800);count.value=String(draft.count||10);reference.value=String(draft.reference||'').slice(0,16000);photos=Array.isArray(draft.photos)?draft.photos.slice(0,3):[];if(draft.proposal){const checked=validateComposition(draft.proposal.result,draft.proposal.request);proposal={...draft.proposal,title:checked.title,slides:compositionSlides(checked,draft.proposal.request,draft.proposal.photos||photos)};}status.textContent='저장해 둔 초안을 이어서 열었어요. AI를 다시 호출하지 않았어요.';}}catch{status.textContent='이전 초안을 읽지 못했어요. 저장된 발표는 그대로 있습니다.';proposal=null;}
 drawPhotos();draw();return {node,focus:()=>prompt.focus(),busy:()=>!!asking||reading||saving,refresh(){placement.textContent=destination();},destroy(){save();disposed=true;asking?.abort();}};
}
