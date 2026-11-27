// AI-G 도우미: 편집 화면 옆 칸. 장을 다듬어 달라고 부탁하면 '편집 지시'를 받아 미리 보여 주고, 눌러야 적용한다.
// AI 없이 도는 '움직임 자동 다듬기'도 같은 칸 · 같은 미리 보기 · 같은 되돌리기를 쓴다. 설계: docs/ai-helper-2026-11-11.md
//
// host(편집 화면이 넘겨 주는 것):
//   provider        AI 연결({ connect(), generate(input, { signal, onProgress }) }) 또는 null(공용 온바탕: 자동 다듬기만)
//   slides()        지금 장 목록(꾸미는 중인 장은 편집기에서 꺼낸 것. 여러 파트로 나뉜 자료는 모든 파트의 장) · at() 지금 장 번호 · title() 그림 이름 · aspect() 가로 ÷ 세로
//   view(slide)     그 장의 작은 그림(DOM) · play(view, slide) 그 그림에서 움직임을 한 번 튼다 → 멈추는 함수
//   blocked()       지금 쓸 수 없으면 그 까닭(글), 쓸 수 있으면 ''
//   apply(slides, base) 새 장 목록을 적용한다(되돌리기 기록 하나. base: slides() 로 받아 간 목록). 적용했으면 그 기록(표), 못 했으면 null 을 약속으로
//   undo(token)     그 적용이 맨 뒤의 일이면 되돌린다 → 되돌렸으면 true · canUndo(token)
//   cost(count)     AI 부탁의 값(단추에 적는 글. 예: '질문권 1회')
import { el } from './ui.js';
import { gaiOwl } from './brand.js';
import { cleanTopic } from '../src/document.js';
import { editContext, checkEdits, applyEdits, motionCatalog, titleOf, EDIT_LIMITS, LOCAL_LIMITS } from './ai-edits.js';
import { polishMotion } from './motion-polish.js';
import {createAiCompose} from './ai-compose.js';
import {emptyAiPage} from './ai-insert.js';
import {settings} from '../src/model.js';
import {cleanComposeRequest, COMPOSE_LIMITS, nativeComposeCatalog} from '../src/ai-compose.js';
import {requestTarget, insertionReference} from './assist-request.js';
import {readStoryPhoto,ACCEPT_IMAGES} from './story-photos.js';
import {createAiTask} from './ai-task.js';
import {createReviewDesk, requestHistory} from './assist-review.js';

const WANTS = [['text', '글'], ['layout','배치·디자인'], ['elements','요소 추가·삭제'], ['motion', '움직임'], ['notes', '발표자 노트']];
const clip = (text, max) => { const all = Array.from(String(text ?? '')); return all.length > max ? `${all.slice(0, max).join('')}…` : all.join(''); };
const message = (error, fallback) => (/\p{Script=Hangul}/u.test(error?.message || '') ? String(error.message).slice(0, 300) : fallback);

export function createAiHelper(host) {
  const choices = WANTS.filter(([id]) => !host.preserveSpeech || id !== 'notes');
  const provider = host.provider && typeof host.provider.connect === 'function' && typeof host.provider.generate === 'function' ? host.provider : null;
  const desk=provider&&host.shell?createReviewDesk(host.shell):null;
  const history=provider?requestHistory(host.draftKey):null;
  const limit = EDIT_LIMITS.slides;
  let scope = provider ? 'auto' : 'here', picked = new Set(), want = new Set(choices.map(([id]) => id)), asking = null, disposed = false, count = -1;
  let insertOverride = {};
  const stops = new Set();
  let composer=null,mode='edit',photos=[],readingPhoto=false,task=null,ticker=null;
  const taskLabel=el('strong'),taskDetail=el('p'),taskTime=el('small');
  const taskRetry=el('button',{class:'btn',type:'button',onClick:()=>task?.retry()},'연결 확인하고 이어받기');
  const taskNotice=el('section',{class:'onba-ai-task',role:'status','aria-live':'polite',hidden:true},
    el('span',{class:'onba-ai-orbit','aria-hidden':'true'},'✦'),taskLabel,taskDetail,taskTime,
    el('p',{text:'제작 중에는 이 발표의 편집을 잠가요. 내 그림이나 연구소 홈으로 나가도 접수한 작업은 서버에서 계속돼요.'}),taskRetry);

  // ---------- 범위 ----------
  const hereLabel = el('span');
  const pickList = el('div', { class: 'cv-assist-picks', role: 'group', 'aria-label': '다듬을 장 고르기' });
  const pickCount = el('span', { class: 'cv-assist-pick-count' });
  const topicButton = el('button', { class: 'btn chip', type: 'button', dataset: { assistTopic: '' }, onClick: () => {
    const slides = host.slides(), at = host.at();
    let running = '';
    const topics = slides.map((s) => { const t = cleanTopic(s?.topic); if (t) running = t; return running; });
    picked = new Set(slides.map((_, i) => i).filter((i) => topics[i] === topics[at]).slice(0, limit));
    if (!picked.size) picked.add(at);
    drawPicks();
  } }, '이 주제의 장');
  const picker = el('div', { class: 'cv-assist-picker', hidden: true }, el('div', { class: 'cv-assist-pick-head' }, pickCount, topicButton), pickList);
  const radio = (value, label) => el('label', { class: 'cv-assist-scope' }, el('input', { type: 'radio', name: 'cv-assist-scope', value, checked: scope === value, onChange: () => { scope = value; picker.hidden = scope !== 'pick'; if (scope === 'pick' && !picked.size) picked.add(host.at()); drawPicks(); update(); } }), label);
  function drawPicks() {
    const slides = host.slides(), at = host.at();
    picked = new Set([...picked].filter((i) => slides[i]));
    pickList.replaceChildren(...slides.map((slide, i) => el('label', { class: 'cv-assist-pick' },
      el('input', { type: 'checkbox', checked: picked.has(i), disabled: !picked.has(i) && picked.size >= limit, dataset: { assistPick: String(i) }, onChange: (e) => { if (e.target.checked) picked.add(i); else picked.delete(i); drawPicks(); update(); } }),
      el('span', { text: `${i + 1}장${i === at ? ' (지금)' : ''}` }), el('small', { text: clip(titleOf(slide) || '제목 없음', 18) }))));
    pickCount.textContent = `${picked.size}장 고름 · 한 번에 ${limit}장까지`;
    pickCount.title = `AI-G에게는 한 번(질문권 1회)에 ${limit}장까지 부탁할 수 있어요`;
    update();
  }
  const target = () => {
    const plan = requestTarget(wish.value,{scope,at:host.at(),total:count,picked,canInsert:!!composer});
    return plan.kind==='insert' ? {...plan,...insertOverride} : plan;
  };

  // ---------- AI 부탁 ----------
  const chips = el('div', { class: 'cv-assist-wants', role: 'group', 'aria-label': '다듬을 것' }, ...choices.map(([id, name]) => el('button', { class: 'btn chip', type: 'button', 'aria-pressed': 'true', dataset: { assistWant: id },
    onClick: (e) => { if (want.has(id) && want.size > 1) want.delete(id); else want.add(id); for (const b of chips.children) b.setAttribute('aria-pressed', String(want.has(b.dataset.assistWant))); e.currentTarget.blur(); update(); } }, name)));
  const wish = el('textarea', { id:'cv-assist-request', class: 'cv-assist-wish', rows: '3', maxlength: String(EDIT_LIMITS.prompt), placeholder: '예) 마지막에 질문을 나눌 장 하나 추가해 줘. 또는 모든 장의 제목을 키워 줘.' });
  const wishLabel = el('label', {for:'cv-assist-request'}, el('b',{text:'발표에 무엇을 더하거나 바꿀까요?'}));
  const targetLine = el('p', {class:'cv-down-note',role:'status','aria-live':'polite'});
  const quantity = el('input',{type:'number',min:1,max:COMPOSE_LIMITS.pages,'aria-label':'추가할 장 수',onInput:()=>{insertOverride.count=quantity.valueAsNumber;update();}});
  const position = el('select',{'aria-label':'새 장을 넣을 위치',onChange:()=>{insertOverride.position=Number(position.value);insertOverride.invalidAnchor=false;update();}});
  const insertFields = el('div',{class:'cv-assist-insert',hidden:true},el('label',{},'넣을 위치',position),el('label',{},'장 수',quantity));
  const shown = el('pre', { class: 'cv-assist-sent' });
  const editOptions = kind => ({title:host.title(),aspect:host.aspect(),fonts:nativeComposeCatalog(settings().fonts).fonts,photos,...(kind==='selection'?{selectedIds:[host.selectedId?.()||'']}:{})});
  const composeInput = (plan,slides) => ({kind:'slides',task:'compose',prompt:wish.value.trim() || '이야기를 이어갈 장을 추가해 주세요.',count:plan.count,
    reference:insertionReference(host.title(),slides,plan.position),aspect:host.aspect(),fonts:nativeComposeCatalog(settings().fonts).fonts,photos:photos.map(p=>({id:p.id,alt:p.alt,aspect:p.ratio}))});
  const peekText = () => {
    const plan=target(), slides=host.slides();
    if(plan.kind==='insert')return JSON.stringify(composeInput(plan,slides),null,1);
    const ctx=editContext(slides,plan.picks,editOptions(plan.kind));
    return JSON.stringify({ want: [...want], prompt: wish.value.trim(), ...ctx.request }, null, 1);
  };
  const peek = el('details', { class: 'cv-assist-peek', onToggle: () => { if (peek.open) shown.textContent = peekText(); } }, el('summary', { text: '보낼 내용 보기(글과 배치만, 사진은 보내지 않아요)' }), shown);
  const askLabel = el('span'), askCost = el('small', { class: 'cv-assist-cost' });
  const askButton = el('button', { class: 'btn btn-primary cv-assist-ask', type: 'button', dataset: { assistAsk: '' }, onClick: () => ask() }, gaiOwl(), askLabel, askCost);
  const status = el('p', { class: 'cv-down-note cv-assist-status', role: 'status', 'aria-live': 'polite' });
  const photoList=el('div',{class:'onba-compose-photos'});
  const photoFile=el('input',{type:'file',accept:ACCEPT_IMAGES,'aria-label':'도우미에 사진 추가',onChange:async()=>{
    if(asking||readingPhoto||composer?.busy()||photos.length>=3||!photoFile.files?.[0])return;
    readingPhoto=true;update();try{const photo=await readStoryPhoto(photoFile.files[0]);if(disposed)return;photos.push({...photo,id:[1,2,3].map(n=>'photo'+n).find(id=>!photos.some(p=>p.id===id)),alt:photoFile.files[0].name.replace(/\.[^.]+$/,'').slice(0,160)});drawPhotos();}catch(e){say(e.message);}finally{readingPhoto=false;photoFile.value='';if(!disposed)update();}
  }});
  function drawPhotos(){photoList.replaceChildren(...photos.map(p=>el('div',{class:'onba-compose-photo'},el('img',{src:p.url,alt:p.alt}),el('input',{'aria-label':'추가할 사진 설명',value:p.alt,maxLength:160,onInput:e=>p.alt=e.target.value}),el('button',{class:'btn',type:'button',onClick:()=>{if(asking)return;photos=photos.filter(v=>v!==p);drawPhotos();update();}},'빼기'))));}
  const attachments=el('details',{class:'cv-assist-photos'},el('summary',{text:'장에 넣을 사진 첨부 · 최대 3장'}),photoFile,photoList,el('p',{class:'cv-down-note',text:'사진 설명만 AI에 보내고, 원본은 이 발표에 넣어요.'}));
  const scopes=el('div', {class:'cv-assist-scopes',role:'radiogroup','aria-label':'부탁할 범위'},
    provider?radio('auto','요청에 맞게'):null,provider?radio('all','발표 전체'):null,provider&&host.compose?radio('insert','새 장 추가'):null,
    radio('here',hereLabel),radio('pick','장 고르기'),provider&&host.selectedId?radio('selection','선택한 요소만'):null);
  const aiPart = provider
    ? el('div', { class: 'cv-assist-ai' }, wishLabel, wish, targetLine, insertFields,
        el('details',{class:'cv-assist-options'},el('summary',{text:'범위 직접 정하기'}),scopes,picker,chips),attachments,peek,askButton,status)
    : el('div',{},scopes,picker,el('p', { class: 'cv-down-note cv-assist-status', dataset: { assistNoAi: '' }, text: 'AI-G에게 부탁하기는 GBE-AI Lab(gbe.ai.kr)의 온바탕에서 쓸 수 있어요. 아래 "움직임 자동 다듬기"는 여기서도 바로 쓸 수 있어요.' }));

  // ---------- 움직임 자동 다듬기 ----------
  const polishScope = el('select', { class: 'cv-assist-select', 'aria-label': '자동으로 다듬을 범위' }, el('option', { value: 'scope', text: '위에서 고른 장' }), el('option', { value: 'all', text: '자료 전체' }));
  const keep = el('input', { type: 'checkbox', checked: true, dataset: { assistKeep: '' } });
  const polishButton = el('button', { class: 'btn cv-assist-polish', type: 'button', dataset: { assistPolish: '' }, onClick: () => polish() }, '움직임 자동 다듬기');
  const polishPart = el('div', { class: 'cv-assist-auto' },
    el('b', { text: '움직임 자동 다듬기' }),
    el('p', { class: 'cv-down-note', text: '장의 모양을 보고 입혀요(카드 줄은 차례로, 숫자는 쿵). AI를 쓰지 않아 질문권이 들지 않아요.' }),
    el('div', { class: 'cv-assist-row' }, polishScope, polishButton),
    el('label', { class: 'cv-assist-keep' }, keep, ' 이미 정한 움직임은 그대로 두기'));

  const log = el('div', { class: 'cv-assist-log', role: 'log', 'aria-label': 'AI-G 도우미와 나눈 일' });
  const editPane=el('div',{dataset:{assistPane:'edit'}},el('div', { class: 'cv-assist-form' },aiPart,polishPart));
  const composePane=el('div',{hidden:true,dataset:{assistPane:'compose'}});
  const tabs=el('div',{class:'cv-assist-modes','aria-label':'AI-G 작업 고르기'});
  function setMode(next,applied=false){if(!applied&&(asking||readingPhoto||composer?.busy()))return;mode=next;editPane.hidden=mode!=='edit';composePane.hidden=mode!=='compose';for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.dataset.assistMode===mode));if(desk?.isOpen())return;if(mode==='compose')composer?.focus();else wish.focus();}
  if(provider&&host.compose){
    composer=createAiCompose({provider,desk,history,onIdle:()=>update(),draftKey:host.draftKey,inline:true,view:host.view,aspect:host.aspect,blocked:host.compose.blocked,capture:host.compose.capture,onCreate:host.compose.apply,destination:host.compose.destination,onDraft:host.compose.draftChanged,startTask:(input,meta)=>task.start(input,meta),taskBusy:()=>!!task?.busy(),clearTask:async id=>{await host.prepareAi?.();await task?.clear(id);},onApplied:token=>{
      const box=el('article',{class:'cv-assist-card',dataset:{composeDone:''}},el('p',{text:'장을 넣었어요. 왼쪽 장 목록에서 골라 글·요소·움직임을 계속 고칠 수 있어요.'}));
      const undo=el('button',{class:'btn',type:'button',dataset:{composeUndo:''},onClick:async()=>{if(await host.undo(token)){box.replaceChildren(el('p',{text:'생성한 장을 넣기 전으로 되돌렸어요.'}));}else undo.disabled=true;}},'생성 적용 되돌리기');
      box.append(undo);box._sync=()=>{undo.disabled=!host.canUndo(token);};log.append(box);setMode('edit',true);scrollTo(box);
    }});composePane.append(composer.node);
    for(const [id,label] of [['edit','이 발표에 부탁하기'],['compose','발표 만들기']])tabs.append(el('button',{class:'btn chip',type:'button',dataset:{assistMode:id},'aria-pressed':String(id==='edit'),onClick:()=>setMode(id)},label));
  }
  const body = el('div', { class: 'cv-assist-body' },taskNotice,tabs,composePane,editPane,log,history?.node);
  const close = el('button', { class: 'cv-assist-close', type: 'button', 'aria-label': 'AI-G 도우미 닫기', onClick: () => host.close?.() }, '×');
  const node = el('div', { class: 'cv-assist-box' }, el('header', { class: 'cv-assist-head' }, gaiOwl(), el('h2', { text: 'AI-G 도우미' }), close), body);

  function update() {
    if (disposed) return;
    const plan=target(), inserting=plan.kind==='insert', n=inserting ? plan.count : plan.picks.length;
    let issue='';
    if(inserting){
      if(position.options.length!==count+1)position.replaceChildren(...Array.from({length:count+1},(_,i)=>el('option',{value:String(i),text:i?`${i}장 뒤`:'맨 앞'})));
      position.value=plan.invalidAnchor?'':String(plan.position);
      const value=Number.isFinite(n)?String(n):'';
      if(quantity.value!==value)quantity.value=value;
      if(!Number.isInteger(n)||n<1||n>COMPOSE_LIMITS.pages)issue=`추가할 장 수를 1~${COMPOSE_LIMITS.pages} 사이로 정해 주세요.`;
      else if(plan.invalidAnchor||plan.position<0||plan.position>count)issue='새 장을 넣을 위치를 확인해 주세요.';
    }else if(!n)issue='부탁할 장을 확인해 주세요.';
    else if(n>limit)issue=`발표가 ${n}장이에요. 한 번에 ${limit}장까지 부탁할 수 있어요. 범위에서 장을 골라 주세요.`;
    else if(plan.kind==='selection'&&!host.selectedId?.())issue='캔버스에서 요소를 골라 주세요.';
    insertFields.hidden=!inserting;chips.hidden=inserting;
    targetLine.textContent=issue||(inserting?`${plan.position?`${plan.position}장 뒤`:'맨 앞'}에 새 장 ${n}장 추가`:
      plan.kind==='all'?`발표 전체 · ${n}장`:plan.kind==='selection'?'선택한 요소만 수정':
      scope==='auto'&&!wish.value.trim()?'새 장 추가부터 발표 전체 수정까지 부탁할 수 있어요.':`${rangeText(plan.picks)} 수정`);
    hereLabel.textContent = `지금 장(${host.at() + 1}장)`;
    askLabel.textContent = asking ? '그만두기' : 'AI-G에게 부탁하기';
    askCost.textContent = asking ? '' : host.cost?.(n) || '';
    askButton.disabled = !asking && (!!issue||scope==='auto'&&!wish.value.trim()||readingPhoto||!!composer?.busy());
    photoFile.disabled=!!asking||readingPhoto||photos.length>=3;
    for(const input of photoList.querySelectorAll('input,button'))input.disabled=!!asking;
    polishButton.disabled = polishScope.value === 'scope' && scope==='pick' && !picked.size;
    polishScope.options[0].textContent=scope==='all'?'발표 전체':scope==='pick'?'위에서 고른 장':`지금 장(${host.at()+1}장)`;
    if (peek.open) shown.textContent = peekText();
  }
  if(composer)task=createAiTask({key:host.draftKey,provider,prepare:()=>host.prepareAi?.(),change:state=>{
    const busy=state?.state==='pending';taskNotice.hidden=!state;
    if(busy)desk?.close({focus:false});
    taskNotice.dataset.state=state?.state||'';
    taskLabel.textContent=busy?'AI-G가 발표를 만들고 있어요':state?.state==='ready'?'완성된 결과를 확인해 주세요':'AI 작업을 확인해 주세요';
    taskDetail.textContent=state?.message||'';taskRetry.hidden=!busy||!!task?.running();
    const elapsed=()=>{taskTime.textContent=busy?`${Math.floor((Date.now()-state.createdAt)/60000)}분 ${Math.floor((Date.now()-state.createdAt)/1000)%60}초 경과`:'';};
    clearInterval(ticker);elapsed();if(busy)ticker=setInterval(elapsed,1000);
    for(const part of [tabs,composePane,editPane,log])part.inert=busy;body.toggleAttribute('data-ai-busy',busy);
    composer.refresh();host.aiState?.(state,()=>task?.retry());if(state)setMode(state.input?.task==='compose'?'compose':'edit',true);update();
  },result:async state=>{
    if(state.input.task==='compose'){await composer.acceptTask(state);return;}
    receiveEdit(state.answer,state.meta,state.id,state.input.prompt);
  }});
  const say = (text) => { status.textContent = text; };
  const bubble = (who, text) => { const p = el('p', { class: `cv-assist-bubble ${who}`, text }); log.append(p); return p; };
  const scrollTo = (card) => requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  const rangeText = (picks) => {
    const first = picks[0] + 1, last = picks[picks.length - 1] + 1;
    if (picks.length === 1) return `${first}장`;
    if (last - first + 1 === picks.length) return `${first} ~ ${last}장`;                       // 이어진 장들
    return picks.length <= 4 ? `${picks.map((i) => i + 1).join(' · ')}장` : `${first} ~ ${last}장 가운데 ${picks.length}장`;
  };

  // ---------- 결과 카드(미리 보기 → 적용) ----------
  function card({ ctx, base, checked, limits, note = [], tail = '',taskId=null, prompt='', ai=false }) {
    const skip = new Set();
    let state = 'ready', token = null;
    const box = el('article', { class: 'cv-assist-card', dataset: { assistCard: '', state } });
    const sayLine = checked.say ? el('p', { class: 'cv-assist-bubble ai', text: checked.say }) : null;
    const summary = el('p', { class: 'cv-assist-count' });
    const list = el('div', { class: 'cv-assist-changes' });
    const notes = el('p', { class: 'cv-down-note cv-assist-note' });
    const actions = el('div', { class: 'cv-assist-actions' });
    const stopPlays = () => { for (const stop of box._stops || []) { stop(); stops.delete(stop); } box._stops = []; };
    const preview = () => applyEdits(base, checked.ops, ctx, { limits, skip });
    const full = applyEdits(base, checked.ops, ctx, { limits });
    const prompts=prompt?[['내 요청',prompt]]:[];
    const launch=el('button',{class:'btn',type:'button',onClick:openReview},'작업대에서 비교하기');
    function openReview(){
      const pages=[...list.children].map(detail=>({node:detail,label:`${Number(detail.dataset.assistChange)+1}장 · ${titleOf(base[Number(detail.dataset.assistChange)])||'제목 없음'}`}));
      desk?.open({title:'수정 전후 비교',prompts,content:[box],actions:[actions],pages,trigger:launch,
        onPage:i=>{stopPlays();pages[i].node._fill();},onClose:stopPlays});
    }
    const extra = [...note];
    if (checked.dropped.length) extra.push(`지시 ${checked.dropped.length}개는 온바탕이 쓸 수 없는 것이라 뺐어요.`);
    for (const why of full.dropped) if (!extra.includes(why)) extra.push(why);
    const draw = () => {
      stopPlays();
      const now = preview();
      summary.textContent = state === 'applied' ? '적용했어요. Ctrl+Z 한 번으로 통째로 되돌릴 수 있어요.' : state === 'undone' ? '되돌렸어요.' : state === 'dropped' ? '버렸어요. 아무것도 바뀌지 않았어요.'
        : now.count ? `바꿀 것 ${now.count}가지 · ${now.changes.length}장` : full.count ? '고른 것이 없어요.' : '이 요청에서 제안된 변경이 없어요.';
      box.dataset.state = state;
      if (state !== 'ready') { list.querySelectorAll('input').forEach((input) => { input.disabled = true; }); }
      else {
        list.replaceChildren(...full.changes.map((change, k) => {
          const open = full.changes.length <= 3 || k === 0;
          const pair = el('div', { class: 'cv-assist-pair' });
          const fill = () => {
            if (pair.childElementCount || disposed) return;
            const after = preview().slides[change.index];
            const afterView = host.view(after);
            pair.append(el('figure', {}, host.view(base[change.index]), el('figcaption', { text: '수정 전' })), el('span', { class: 'cv-assist-arrow', 'aria-hidden': 'true', text: '→' }),
              el('figure', { dataset: { assistAfter: '' } }, afterView, el('figcaption', { text: '수정 후' })));
            pair._after = { view: afterView, slide: after };
          };
          const rows = el('ul', { class: 'cv-assist-lines' }, ...change.lines.map((line) => el('li', {}, el('label', {},
            el('input', { type: 'checkbox', checked: !skip.has(line.op), dataset: { assistLine: String(line.op) }, onChange: (e) => { if (e.target.checked) skip.delete(line.op); else skip.add(line.op); refresh(); } }),
            el('span', { text: line.text }), line.why ? el('small', { text: line.why }) : null))));
          const detail = el('details', { class: 'cv-assist-change', open, dataset: { assistChange: String(change.index) }, onToggle: () => { if (detail.open) fill(); } },
            el('summary', {}, el('b', { text: `${change.index + 1}장` }), el('span', { text: clip(titleOf(base[change.index]) || '제목 없음', 16) }), el('small', { text: `${change.lines.length}가지` })), pair, rows);
          detail._pair = pair; detail._fill = fill;
          if (open) fill();
          return detail;
        }));
      }
      notes.textContent = extra.join(' ');
      notes.hidden = !extra.length;
      const btn = (label, attrs, onClick) => el('button', { class: 'btn', type: 'button', ...attrs, onClick }, label);
      actions.replaceChildren(...[...(state === 'ready' ? [
        full.changes.some((c) => c.lines.some((l) => /나타나기|계속|전환|조합/.test(l.text))) ? btn('움직임 보기', { dataset: { assistPlay: '' }, disabled: !now.count }, play) : null,
        btn('적용', { class: 'btn btn-primary', dataset: { assistApply: '' }, disabled: !now.count }, apply),
        btn('버리기', { class: 'btn btn-ghost', dataset: { assistDrop: '' } }, async () => { if(taskId)await task.clear(taskId);desk?.close();launch.hidden=true;state = 'dropped'; draw(); }),
      ] : state === 'applied' ? [btn('되돌리기', { dataset: { assistUndo: '' }, disabled: !host.canUndo(token) }, async () => { if (await host.undo(token)) { state = 'undone'; draw(); } else draw(); })] : []),
      // replaceChildren 은 null 을 "null" 글자로 넣는다: 없는 것은 걸러서 넘긴다(영수증 글이 없는 자동 다듬기 카드에 null 이 보였다)
      tail && state !== 'dropped' ? el('small', { class: 'cv-assist-tail', text: tail }) : null].filter(Boolean));
    };
    // 체크를 바꾸면 뒤 그림만 다시 그린다
    const refresh = () => {
      stopPlays();
      const now = preview();
      for (const detail of list.children) {
        const pair = detail._pair;
        if (!pair?.childElementCount) continue;
        const index = Number(detail.dataset.assistChange), slide = now.slides[index], view = host.view(slide);
        pair.querySelector('[data-assist-after]').firstChild.replaceWith(view);
        pair._after = { view, slide };
      }
      summary.textContent = now.count ? `바꿀 것 ${now.count}가지 · ${now.changes.length}장` : '고른 것이 없어요.';
      for (const b of actions.querySelectorAll('[data-assist-apply],[data-assist-play]')) b.disabled = !now.count;
    };
    const play = () => {
      stopPlays();
      for (const detail of list.children) {
        if (!detail.open) continue;
        detail._fill();
        const { view, slide } = detail._pair._after;
        const stop = host.play(view, slide);
        if (typeof stop === 'function') { box._stops.push(stop); stops.add(stop); }
      }
    };
    let applying = false;
    const apply = async () => {
      if (applying) return;
      const blocked = host.blocked();
      if (blocked) { notes.hidden = false; notes.textContent = blocked; return; }
      const current = host.slides();
      const done = applyEdits(current, checked.ops, ctx, { limits, skip });
      if (!done.count) {
        notes.hidden = false;
        notes.textContent = done.stale.length ? '부탁한 뒤에 그 장을 고치셔서 적용하지 않았어요. 다시 부탁해 주세요.' : '바꿀 것이 없어요.';
        return;
      }
      // 여러 파트의 자료는 다른 파트를 저장하느라 잠깐 걸린다: 그동안 한 번 더 눌리지 않게 한다
      applying = true;
      try { token = await host.apply(done.slides, current); } finally { applying = false; }
      if (disposed) return;
      if (!token) { notes.hidden = false; notes.textContent = '지금은 적용할 수 없어요. 편집 화면을 확인한 뒤 다시 눌러 주세요.'; return; }
      if (done.stale.length) extra.push(`부탁한 뒤에 고친 ${done.stale.map((i) => `${i + 1}장`).join(' · ')}은 그대로 두었어요.`);
      state = 'applied';
      if(taskId){await host.prepareAi?.();await task.clear(taskId);}
      desk?.close();launch.hidden=true;
      draw();
    };
    box._stops = [];
    if(ai&&prompt)box.append(el('p',{class:'onba-request-copy'},el('b',{text:'내 요청'}),el('span',{text:prompt})));
    box.append(...[sayLine, summary, list, notes, actions].filter(Boolean));
    box._sync = () => { if (state === 'applied') draw(); };
    draw();
    log.append(box);
    if(ai&&desk){log.insertBefore(launch,box);openReview();}
    else scrollTo(box);
    history?.record({id:taskId,prompts,summary:`수정 제안 · ${full.changes.length}장 · 변경 ${full.count}가지`});
    return box;
  }

  // ---------- 부탁하기 ----------
  async function ask() {
    if (asking) { asking.abort(); return; }
    if (!provider||readingPhoto||composer?.busy()||task?.busy()) return;
    const blocked = host.blocked();
    if (blocked) { say(blocked); return; }
    const plan=target();
    if(askButton.disabled)return;
    const base=host.slides();
    if(plan.kind==='insert'){
      try {
        const why=host.compose.blocked();if(why)throw Error(why);
        const request=cleanComposeRequest(composeInput(plan,base));
        const context=host.compose.capture(request,{insertAt:plan.position});
        await task.start(request,{request,context,photos:structuredClone(photos),userPrompt:wish.value.trim()});
      } catch(e) { say(e.message); }
      return;
    }
    const picks = plan.picks;
    if (!picks.length) { say('다듬을 장을 골라 주세요.'); return; }
    const options=editOptions(plan.kind);
    const ctx=editContext(base,picks,options);
    if(ctx.cut.slides){say('한 번에 보낼 수 있는 자료 크기를 넘었어요. 범위에서 장을 나누어 부탁해 주세요.');return;}
    if(plan.kind==='selection'&&!ctx.request.slides.some(s=>s.items.length)){say('캔버스에서 고칠 글·도형·사진을 먼저 골라 주세요.');return;}
    if(task){
      const wants=choices.filter(([id])=>want.has(id)&&(plan.kind!=='selection'||id!=='notes')).map(([id])=>id),prompt=wish.value.trim();
      try{await task.start({kind:'slides',task:'polish',want:wants,prompt,...ctx.request,catalog:motionCatalog()},{base,picks:ctx.picks,options});}catch(e){say(e.message);}return;
    }
    // 연결 창은 누른 그 순간에 열어야 막히지 않는다: 기다리기 전에 connect 를 부른다.
    let connection; try { connection = provider.connect(); } catch (error) { connection = Promise.reject(error); }
    const controller = asking = new AbortController();
    const wants = choices.filter(([id]) => want.has(id)&&(plan.kind!=='selection'||id!=='notes')), prompt = wish.value.trim();
    bubble('me', `${rangeText(ctx.picks)} · ${wants.map(([, name]) => name).join(' · ')}${prompt ? `\n${prompt}` : ''}`);
    wish.disabled = true;
    update();
    say('AI-G 연결을 확인하고 있어요…');
    try {
      await connection;
      if (controller.signal.aborted) throw new DOMException('', 'AbortError');
      const n = ctx.picks.length;
      say(`AI-G가 ${n === 1 ? '장을' : `${n}장을`} 읽고 있어요… ${n === 1 ? '20초쯤' : n <= 6 ? '1분쯤' : n <= 12 ? '1 ~ 2분' : '3분쯤'} 걸려요(차례를 기다리면 더 걸릴 수 있어요).`);
      const answer = await provider.generate({ kind: 'slides', task: 'polish', want: wants.map(([id]) => id), prompt, ...ctx.request, catalog: motionCatalog() },
        { signal: controller.signal, onProgress: (progress) => { const text = typeof progress === 'string' ? progress : progress?.message; if (text && asking === controller) say(clip(text, 120)); } });
      if (controller.signal.aborted) throw new DOMException('', 'AbortError');
      if (answer?.kind !== 'slides' || !Array.isArray(answer.ops)) throw Error('AI-G의 답을 읽지 못했어요. 다시 부탁해 주세요.');
      const safeAnswer = host.preserveSpeech ? {...answer, ops: answer.ops.map(op => {if(op?.op !== 'slide')return op;const {notes,...rest}=op;return rest;})} : answer;
      const checked = checkEdits(safeAnswer, ctx, { slides: base });
      const note = [];
      if (ctx.cut.slides) note.push(`한 번에 ${limit}장까지라 ${ctx.cut.slides}장은 빼고 부탁했어요.`);
      if (ctx.cut.items) note.push(`조각이 많은 장은 꾸밈 ${ctx.cut.items}개를 빼고 보냈어요.`);
      const tail = typeof answer.receipt === 'string' ? clip(answer.receipt, 80) : '';
      if (!checked.ops.length || !applyEdits(base, checked.ops, ctx).count) {
        bubble('ai', checked.say || '지금 그대로가 좋아 보여요. 바꿀 것이 없어요.');
        if (checked.dropped.length) bubble('note', `받은 지시 ${checked.dropped.length}개는 온바탕이 쓸 수 없는 것이라 뺐어요.`);
        say(tail);
      } else { card({ ctx, base, checked, limits: EDIT_LIMITS, note, tail,prompt,ai:true }); say('미리 보고 "적용"을 눌러요. 누르기 전에는 아무것도 바뀌지 않아요.'); wish.value = ''; }
    } catch (error) {
      const text = error?.name === 'AbortError' ? '부탁을 그만뒀어요. 이미 시작된 요청은 질문권이 쓰일 수 있어요.' : message(error, 'AI-G가 답하지 못했어요. 잠시 뒤 다시 부탁해 주세요. 움직임 자동 다듬기는 지금도 쓸 수 있어요.');
      bubble('note', text);
      say(text);
    } finally {
      if (asking === controller) asking = null;
      wish.disabled = false;
      update();
    }
  }
  function receiveEdit(answer,meta,taskId,prompt){
    const {base,picks,options}=meta,ctx=editContext(base,picks,options);
    const safe=host.preserveSpeech?{...answer,ops:answer.ops.map(op=>{if(op.op!=='slide')return op;const {notes,...rest}=op;return rest;})}:answer;
    const checked=checkEdits(safe,ctx,{slides:base});
    card({ctx,base,checked,limits:EDIT_LIMITS,tail:answer.receipt||'',taskId,prompt,ai:true});say('결과를 미리 보고 적용해 주세요.');
  }
  function polish() {
    const blocked = host.blocked();
    if (blocked) { bubble('note', blocked); return; }
    const base = host.slides();
    const picks = polishScope.value === 'all' || scope === 'all' ? base.map((_, i) => i) : scope==='pick' ? [...picked].sort((a,b)=>a-b) : [host.at()];
    if (!picks.length) return;
    const ctx = editContext(base, picks, { title: host.title(), aspect: host.aspect(), limits: LOCAL_LIMITS });
    const plan = polishMotion(base, ctx, { keep: keep.checked });
    const checked = checkEdits(plan, ctx, { limits: LOCAL_LIMITS, slides: base });
    bubble('me', `${polishScope.value === 'all' ? '자료 전체' : rangeText(ctx.picks)} · 움직임 자동 다듬기${keep.checked ? '' : '(이미 정한 것도 바꾸기)'}`);
    if (!checked.ops.length || !applyEdits(base, checked.ops, ctx, { limits: LOCAL_LIMITS }).count) { scrollTo(bubble('ai', keep.checked ? '더 입힐 움직임이 없어요. 이미 정한 움직임도 바꾸려면 "이미 정한 움직임은 그대로 두기"를 꺼 보세요.' : '더 입힐 움직임이 없어요.')); return; }
    card({ ctx, base, checked, limits: LOCAL_LIMITS });
  }
  polishScope.addEventListener('change', update);
  wish.addEventListener('input', () => { insertOverride={};update(); });
  count=host.slides().length;
  drawPicks();
  update();
  if(composer&&host.slides().length===1&&emptyAiPage(host.slides()[0]))setMode('compose');

  return {
    node,
    /** 장 목록이 바뀌었을 때(장을 옮기고 더하고 지웠을 때) 범위 표시를 맞춘다. */
    refresh() {
      if (disposed) return;
      const n = host.slides().length;
      if (n !== count) { count = n; if (scope === 'pick') picked = new Set([...picked].filter((i) => i < n)); }
      drawPicks();
      composer?.refresh();
      for (const box of log.children) box._sync?.();
    },
    focus() { if(mode==='compose')composer.focus();else (provider ? wish : polishButton).focus({ preventScroll: true }); },
    busy: () => !!asking||readingPhoto||!!composer?.busy()||!!task?.busy(),
    destroy() { disposed = true;desk?.close({focus:false});clearInterval(ticker);task?.destroy();asking?.abort();composer?.destroy(); for (const stop of stops) stop(); stops.clear(); node.remove(); },
  };
}
