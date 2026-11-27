// Native authoring: the host supplies AI; this UI creates normal editable slides.
import {el} from './ui.js';
import {settings} from '../src/model.js';
import {COMPOSE_LIMITS,cleanComposeRequest,nativeComposeCatalog,validateComposition,compositionSlides} from '../src/ai-compose.js';
import {fitRenderedPages} from './compose-layout.js';
import {setComposePace,rehearsalButton} from './compose-pacing.js';
import {anchorPositions,assembleStoryboard,cutNames,storyboardRequest} from './compose-storyboard.js';
import {readStoryFile} from './story-source.js';
import {readStoryPhoto,ACCEPT_IMAGES} from './story-photos.js';
import {aiDraftStore} from './ai-draft-store.js';

export function createAiCompose({provider,draftKey,view,onCreate,onClose,inline=false,desk=null,history=null,aspect=()=>16/9,capture=()=>null,blocked=()=>'',onApplied=()=>{},onDraft=()=>{},destination=()=>'',startTask=null,taskBusy=()=>false,clearTask=async()=>{},onIdle=()=>{}}){
 let asking=null,disposed=false,reading=false,saving=false,initializing=true,saveVersion=0,photos=[],proposal=null;
 const store=aiDraftStore(draftKey);
 let stopRehearsal = null;
 function activateRehearsal(stop) {stopRehearsal?.();stopRehearsal=stop;}
 const status=el('p',{role:'status','aria-live':'polite',class:'cv-down-note'});
 const draftError=el('p',{role:'alert',hidden:true});
 const prompt=el('textarea',{rows:4,maxLength:COMPOSE_LIMITS.prompt,'aria-label':'만들 발표',placeholder:'누구에게 어떤 이야기를 전할까요? 주제, 듣는 사람, 발표 시간과 원하는 분위기를 적어 주세요.'});
 const count=el('input',{type:'number',min:1,max:24,step:1,value:'10','aria-label':'발표 장 수'});
 const mode=el('select',{'aria-label':'제작 방식',onChange:()=>{lock();save();}},
  el('option',{value:'board'},'대표 세 컷 먼저'),el('option',{value:'direct'},'전체 한 번에'));
 const cost=el('p',{class:'cv-down-note'});
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
  if(proposal?.board && proposal.board.base.count>3){await nextStage('expand');return;}
  if(!proposal||asking||reading||saving||disposed)return;saving=true;lock();
  try{const result=await onCreate({title:proposal.title,slides:structuredClone(proposal.slides),context:proposal.context});await clearTask(proposal.taskId);if(inline){desk?.close();proposal=null;draw();await save();onApplied(result);}else await store.write(null);}
  catch(e){if(!disposed)status.textContent=e.message;}finally{saving=false;if(!disposed){lock();onIdle();}}
 }},inline?'이 발표에 장 넣기':'이 발표를 온바탕에서 편집하기');
 const previews=el('div',{class:'onba-compose-previews','aria-label':'생성한 발표 전체'});
 const resultTitle=el('h3',{tabIndex:-1,text:'만들어진 모든 장을 여기서 확인하세요.'});
 const resultPane=el('section',{},resultTitle,previews);
 const fields=el('fieldset',{class:'onba-compose-fields'},
  el('label',{},'만들 발표',prompt),el('label',{},'장 수 · 1~24장',count),el('label',{},'제작 방식',mode),
  el('details',{},el('summary',{text:'참고 원고와 사진 넣기'}),el('label',{},'HWPX / TXT 원고',file),reference,
   el('label',{},'사진 · 최대 3장',photoFile),photoList,el('p',{class:'cv-down-note',text:'사진 원본은 AI에 보내지 않습니다. 아래 사진 설명을 보고 장에 배치합니다.'})),
  cost,ask);
 const placement=el('p',{class:'cv-down-note',text:destination()});
 const launch=el('button',{class:'btn',type:'button',hidden:true,onClick:openReview},'작업대에서 결과 보기');
 const columns=el('div',{class:'onba-compose-columns'},fields,resultPane);
 const node=el('section',{class:'onba-compose'+(inline?' onba-compose-inline':''),'aria-label':'온바탕 AI 발표 만들기'},
  el('h2',{text:'어떤 발표를 만들까요?'}),el('p',{class:'cv-down-note',text:'이야기 흐름부터 디자인과 움직임까지 구성합니다. 완성된 모든 장은 온바탕에서 글·도형·사진을 눌러 직접 고칠 수 있어요.'}),
  placement,launch,columns,draftError,status,
  el('div',{class:'story-actions'},stop,create,...(inline?[]:[el('button',{class:'btn',type:'button',onClick:onClose},'닫기')])));
 function lock(){
  const busy=initializing||!!asking||reading||saving||taskBusy(),n=Number(count.value);
  fields.disabled=busy;previews.inert=busy;if(busy)activateRehearsal(null);
  ask.disabled=!provider;stop.hidden=!asking;create.disabled=busy||!proposal;photoFile.disabled=photos.length>=3;
  mode.disabled=n<3;
  const staged=mode.value==='board'&&n>=3;
  ask.textContent=(staged?'대표 세 컷 만들기':'전체 발표 만들기')+' · 질문권 1회';
  cost.textContent=(staged&&n>3?'세 컷 1회, 나머지 장 생성 1회. ':'')+'접수한 AI 요청마다 질문권 1회를 사용해요. 접수 후 실패·중단도 포함돼요. 미리보기와 적용은 무료예요.';
  const total=proposal?.board?.base.count;
  create.hidden=!proposal;
  create.textContent=total>3?`이 흐름으로 완성 · 나머지 ${total-3}장 생성 · 질문권 1회`:total===3?'이 흐름으로 완성 · 3장 적용':inline?'이 발표에 장 넣기':'이 발표를 온바탕에서 편집하기';
 }
 async function save(){if(disposed||initializing||!draftKey)return;const version=++saveVersion;try{const draft=proposal?{...proposal}:null;if(draft)delete draft.slides;const value={mode:mode.value,prompt:prompt.value,count:count.value,reference:reference.value,photos,proposal:draft};if(prompt.value.trim()||reference.value.trim()||photos.length||proposal)onDraft();await store.write(value);if(!disposed&&version===saveVersion)draftError.hidden=true;}catch{if(!disposed&&version===saveVersion){draftError.hidden=false;draftError.textContent='이 기기에 초안을 저장하지 못했어요. 창을 닫기 전에 온바탕 발표로 저장해 주세요.';}}}
 function drawPhotos(){photoList.replaceChildren(...photos.map(p=>el('div',{class:'onba-compose-photo'},el('img',{src:p.url,alt:p.alt}),el('label',{},'사진 설명',el('input',{value:p.alt,maxLength:160,onInput:e=>{p.alt=e.target.value;save();}})),el('button',{class:'btn',type:'button',onClick:()=>{photos=photos.filter(v=>v!==p);drawPhotos();lock();save();}},'빼기'))));}
 function draw(){
  activateRehearsal(null);
  showPlacement();
  launch.hidden=!desk||!proposal;
  if(inline)columns.prepend(proposal?resultPane:fields);
  previews.replaceChildren();
  resultTitle.textContent=proposal?`${proposal.title} · ${proposal.board?'대표 세 컷':proposal.slides.length+'장'}`:'발표 미리보기';
  proposal?.slides.forEach((slide,i)=>{
    const card=view(slide);
    const controls=el('div');
    const refreshPlayer=()=>controls.replaceChildren(rehearsalButton(slide,card,activateRehearsal));
    refreshPlayer();
    const together=slide.items.filter(it=>it.aw).length>1 ? el('label',{class:'onba-compose-pace'},
      el('input',{type:'checkbox',checked:proposal.together[i],onChange:e=>{
        activateRehearsal(null);
        proposal.together[i]=e.target.checked;
        setComposePace(slide,e.target.checked);
        refreshPlayer();
        void save();
      }}),'등장 요소를 한 번에 공개') : null;
    const caption=proposal.board?`${cutNames[i]} · ${anchorPositions(proposal.board.base.count)[i]+1}장`:`${i+1}`;
    const wish=proposal.board?el('textarea',{rows:2,maxLength:500,'aria-label':cutNames[i]+' 수정 요청',placeholder:'예) 교실 사진을 중심에 두고 제목을 짧게'}):null;
    const asset=wish && proposal.photos.length<3 ? el('input',{type:'file',accept:ACCEPT_IMAGES,'aria-label':cutNames[i]+'에 쓸 사진'}):null;
    let image=card;
    if(proposal.revision?.index===i){
      const revision=proposal.revision;
      const [before]=compositionSlides({...proposal.result,ops:[revision.before]},{...proposal.request,count:1},proposal.photos);
      setComposePace(before,revision.together===true);
      image=el('div',{class:'cv-assist-pair'},el('figure',{},view(before),el('figcaption',{text:'수정 전'})),
        el('span',{class:'cv-assist-arrow','aria-hidden':'true'},'→'),el('figure',{},card,el('figcaption',{text:'수정 후'})));
    }
    previews.append(el('article',{tabIndex:-1},image,el('b',{text:`${caption}. ${slide.topic}`}),
      together,controls,
      wish?el('details',{},el('summary',{text:'이 컷만 수정'}),wish,asset?el('label',{},'이 컷에 쓸 사진',asset):null,
        el('button',{class:'btn',type:'button',onClick:()=>nextStage('revise',i,wish.value,asset?.files?.[0])},'이 컷 다시 만들기 · 질문권 1회')):null,
      proposal.review.includes(i+1)?el('p',{class:'cv-down-note',text:'글자 배치 확인 · 이 장의 줄바꿈과 겹침을 살펴보세요.'}):null,
      el('details',{},el('summary',{text:'발표 원고'}),el('p',{text:slide.notes||'발화 없음'}))));
  });
  lock();
 }
 let reviewedCut=null;
 function openReview(){
  if(!desk||!proposal)return;
  const prompts=[];
  if(proposal.brief)prompts.push(['내 요청',proposal.brief]);
  const revision=proposal.revision;
  if(revision?.text)prompts.push([cutNames[revision.index]+' 수정 요청',revision.text]);
  const pages=[...previews.children].map((node,i)=>({node,label:proposal.board
    ?`${anchorPositions(proposal.board.base.count)[i]+1}장 · ${cutNames[i]}`
    :`${i+1+(proposal.context?.insertAt||0)}장 · ${proposal.slides[i].topic}`}));
  desk.open({title:revision?'대표 컷 수정 전후 비교':proposal.title,prompts,content:[placement,resultPane,draftError,status],
    actions:[create],pages,initial:revision?.index||0,trigger:launch,onPage:()=>activateRehearsal(null),onClose:()=>activateRehearsal(null)});
  history?.record({id:proposal.taskId,prompts,summary:revision?`${cutNames[revision.index]} 컷 수정 제안`:`${proposal.title} · ${pages.length}장 생성 제안`});
 }
 function focus(){
  if(!inline||!proposal){prompt.focus();return;}
  const target=previews.children[reviewedCut]||resultTitle;
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'nearest'});
 }
 function materialize(checked,request,images,context,prior){
  const slides=compositionSlides(checked,request,images);
  const together=slides.map((slide,i)=>prior.together?.[i]===true);
  slides.forEach((slide,i)=>setComposePace(slide,together[i]));
  return {title:checked.title,result:checked,request,photos:images,context,review:prior.review,slides,together,taskId:prior.taskId,board:prior.board,brief:prior.brief??request.prompt,revision:prior.revision};
 }
 async function receive(result,meta,id){
  const {request,photos:images,context,storyboard}=meta;
  const checked=validateComposition(result,request);
  const fitted=await fitRenderedPages(checked.ops,request.aspect);
  if(disposed)return;
  checked.ops=fitted.pages;
  const assembled=storyboard?assembleStoryboard(storyboard,checked,fitted.review):{result:checked,review:fitted.review};
  const finalRequest=storyboard?{...storyboard.base,count:assembled.result.ops.length}:request;
  const revision=storyboard?.phase==='revise'?{index:storyboard.index,text:meta.revisionText||'',before:storyboard.prior.ops[storyboard.index],together:storyboard.together?.[storyboard.index]}:null;
  proposal=materialize(assembled.result,finalRequest,images,context,{...assembled,taskId:id,brief:meta.userPrompt??storyboard?.base.prompt??request.prompt,revision});
  reviewedCut=storyboard?.phase==='revise'?storyboard.index:null;
  draw();await save();
  status.textContent=proposal.board?'세 컷을 확인하고 원하는 컷만 고쳐 보세요.':proposal.slides.length+'장 모두 받았어요. 확인한 뒤 발표에 적용하세요.';
 }
 const busy=()=>!provider||initializing||asking||reading||saving||disposed||taskBusy();
 async function submit(request,meta){
  const control=asking=new AbortController();lock();status.textContent='AI 연결을 확인하고 있어요.';
  try{
   if(startTask){await save();control.signal.throwIfAborted();await startTask(request,meta);return;}
   await provider.connect();control.signal.throwIfAborted();
   const result=await provider.generate(request,{signal:control.signal,onProgress:p=>{if(!disposed)status.textContent=p?.message||'이야기와 장별 디자인을 구성하고 있어요.';}});
   if(disposed||asking!==control)return;control.signal.throwIfAborted();
   await receive(result,meta);
  }catch(e){if(!disposed)status.textContent=e.name==='AbortError'?'기다리기를 중단했어요. 접수된 요청의 사용 내역을 확인해 주세요.':e.message;}
  finally{if(asking===control)asking=null;if(!disposed){lock();if(inline&&!startTask&&proposal)focus();}}
 }
 async function generate(){
  if(busy())return;
  try{
   const why=blocked();if(why)throw Error(why);
   const base=cleanComposeRequest({kind:'slides',task:'compose',prompt:prompt.value,count:Number(count.value),reference:reference.value,aspect:aspect(),fonts:nativeComposeCatalog(settings().fonts).fonts,photos:photos.map(p=>({id:p.id,alt:p.alt,aspect:p.ratio}))});
   const storyboard=mode.value==='board'&&base.count>=3?{phase:'anchors',base}:null;
   const request=storyboard?storyboardRequest(storyboard):base;
   await submit(request,{request,context:capture(base),photos:structuredClone(photos),storyboard});
  }catch(e){status.textContent=e.message;}
 }
 async function nextStage(phase,index,wish='',file=null){
  if(busy()||!proposal?.board)return;
  reading=true;lock();
  try{
   const why=blocked();if(why)throw Error(why);
   if(phase==='revise'&&!wish.trim()&&!file)throw Error('이 컷에서 바꾸고 싶은 부분을 적어 주세요.');
   const revisionText=wish;
   let base=proposal.board.base,images=proposal.photos;
   if(file){
    const image=await readStoryPhoto(file);if(disposed)return;
    const id=[1,2,3].map(n=>'photo'+n).find(id=>!images.some(p=>p.id===id));
    if(!id)throw Error('프로젝트 사진은 세 장까지 사용할 수 있어요.');
    const alt=file.name.replace(/\.[^.]+$/,'').slice(0,160)||'장면 사진';
    images=[...images,{...image,id,alt}];
    base=cleanComposeRequest({...base,photos:[...base.photos,{id,alt,aspect:image.ratio}]});
    wish+='\n새로 첨부한 '+id+' 사진을 이 컷의 중심에 배치한다.';
   }
   const storyboard={base,phase,index,prior:proposal.result,together:proposal.together.slice(),review:proposal.review};
   const request=storyboardRequest(storyboard,wish.trim());
   await submit(request,{request,context:proposal.context,photos:images,storyboard,revisionText});
  }catch(e){status.textContent=e.message;}finally{reading=false;if(!disposed)lock();}
 }
 for(const field of [prompt,count,reference])field.addEventListener('input',()=>{lock();save();});
 const restored=(async()=>{
  try{
   const draft=await store.read();if(disposed||!draft)return;
   prompt.value=String(draft.prompt||'').slice(0,1800);count.value=String(draft.count||10);
   mode.value=draft.mode==='board'?'board':'direct';
   reference.value=String(draft.reference||'').slice(0,16000);photos=Array.isArray(draft.photos)?draft.photos.slice(0,3):[];
   if(draft.proposal){
    const prior=draft.proposal,checked=validateComposition(prior.result,prior.request);
    if(!Array.isArray(prior.review)){
     const fitted=await fitRenderedPages(checked.ops,prior.request.aspect);checked.ops=fitted.pages;prior.review=fitted.review;
    }
    proposal=materialize(checked,prior.request,prior.photos||photos,prior.context,prior);
   }
   status.textContent='저장해 둔 초안을 이어서 열었어요.';
  }catch{if(!disposed){status.textContent='이전 초안을 읽지 못했어요.';proposal=null;}}
  finally{initializing=false;if(!disposed){drawPhotos();draw();}}
 })();
 function showPlacement(){
  const pos=proposal?.context?.insertAt;
  placement.textContent=Number.isInteger(pos)?`적용하면 ${pos?pos+'장 뒤':'맨 앞'}에 새 장 ${proposal.slides.length}장을 넣어요.`:destination();
 }
 drawPhotos();draw();return {node,focus,busy:()=>!!asking||reading||saving,refresh(){showPlacement();lock();},async acceptTask(task){
  await restored;if(disposed)return;
  if(task.id && proposal?.taskId===task.id&&(!task.meta.storyboard||task.meta.storyboard.phase!=='revise'||proposal.revision)){openReview();return;}
  reading=true;lock();
  try{await receive(task.answer,task.meta,task.id);}finally{reading=false;if(!disposed){lock();onIdle();}}
  if(inline&&!disposed){if(desk)openReview();else focus();}
 },destroy(){activateRehearsal(null);save();disposed=true;asking?.abort();}};
}
