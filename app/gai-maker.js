import { el } from './ui.js';
import { newId } from '../src/document.js';
import { cleanGaiActivity } from '../src/gai-app.js';
import { mountGaiApp } from './gai-app.js';
import {gaiOwl} from './brand.js';

// Reference text is bounded, plain data, and shared only after a teacher sends.
export function gaiLessonContext(entries, selectedId, title = '', options) {
  const selected = entries.findIndex(row => row.page.id === selectedId);
  const text = page => page.items?.filter(item => item.t === 'text').map(item => String(item.text || '')).join(' ') || '';
  if(options){
    const ids=new Set(options.referenceIds||[]),chosen=entries.map(({page},index)=>({page,index})).filter(v=>ids.has(v.page.id));
    if(chosen.length>3||chosen.length!==ids.size||selected<0)throw Error('참고할 슬라이드를 최대 3쪽 선택해주세요.');
    return JSON.stringify({title:String(title).slice(0,200),totalSlides:entries.length,insertAfter:selected+1,placement:{pageId:selectedId,position:selected+1,mode:options.editing?'replace':'after'},referenceOnly:true,slides:chosen.map(({page,index})=>({pageId:page.id,position:index+1,originalPage:page.source?.pageNumber||null,text:text(page).slice(0,3000)})),omittedSlides:entries.length-chosen.length});
  }
  const rows = entries.map(({ page }, index) => ({ position: index + 1, originalPage: page.source?.pageNumber || null, text: text(page).slice(0, Math.abs(index - selected) <= 1 ? 700 : 100) }));
  const value = { title: String(title).slice(0, 200), totalSlides: entries.length, insertAfter: selected + 1, referenceOnly: true, slides: rows, omittedSlides: 0 };
  // Preserve the current scene even near the end of a large material. Never
  // cut a serialized JSON string or silently drop the chosen slide's context.
  for (const limit of [70, 40, 12, 0]) {
    if (JSON.stringify(value).length <= 14000) break;
    rows.forEach((row, index) => { if (Math.abs(index - selected) > 1) row.text = row.text.slice(0, limit); });
  }
  while (JSON.stringify(value).length > 14000 && rows.length > 3) {
    const index = rows.findIndex(row => Math.abs(row.position - 1 - selected) > 1);
    if (index < 0) break;
    rows.splice(index, 1); value.omittedSlides++;
  }
  return JSON.stringify(value);
}

function draftStore(key) {
  let database;
  const open = () => database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('onbatang-gai-drafts-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const run = async (mode, value) => {
    const db = await open(); return new Promise((resolve, reject) => {
      const transaction = db.transaction('drafts', mode), store = transaction.objectStore('drafts');
      const request = mode === 'readonly' ? store.get(key) : value === null ? store.delete(key) : store.put(value, key);
      transaction.oncomplete = () => resolve(request.result); transaction.onabort = () => reject(transaction.error); transaction.onerror = () => reject(transaction.error);
    });
  };
  return { read: () => run('readonly'), write: value => run('readwrite', value) };
}

export function createGaiMaker({ provider, activity, context, entries=[], selectedId, title='', previewSlide, referenceImage, draftKey, onApply, onCancel }) {
  const root = el('section', { class: 'gai-maker', 'aria-label': '가이X로 수업 앱 만들기' });
  const store = draftStore(draftKey);
  let candidate = activity, turns = [], busy = false, disposed = false, preview, controller, initialized = false, connecting = false;
  let saveChain = Promise.resolve();
  const status = el('p', { class: 'gai-maker-status', role: 'status', 'aria-live': 'polite' });
  const log = el('div', { class: 'gai-maker-log', role: 'log', 'aria-label': '가이X 대화' });
  const prompt = el('textarea', { 'aria-label': '가이X에게 요청', maxLength: 1300, minLength: 3, rows: 3, placeholder: '예: 이 픽셀아트 설명 다음에 쓸 8×8 그림 만들기 앱을 만들어줘. 완성한 그림도 남기고 싶어.' });
  const share = el('input', { type: 'checkbox', checked: true });
  const screens=el('input',{type:'checkbox',checked:true,'aria-label':'선택한 슬라이드 화면도 전달'});
  let afterPageId=selectedId,referenceIds=new Set(entries.some(v=>v.page.id===selectedId)?[selectedId]:[]),observer;
  const references=el('section',{class:'gai-maker-references','aria-label':'참고할 PPT 슬라이드'}),large=el('div',{class:'gai-maker-slide-large','aria-label':'PPT 슬라이드 미리보기'}),caption=el('p',{}),rail=el('div',{class:'gai-maker-slide-rail'});
  const placement=el('select',{'aria-label':'앱 넣을 위치'}),checks=[];
  const label=(row,index)=>`${index+1}쪽${row.page.source?.pageNumber?` · 원본 ${row.page.source.pageNumber}쪽`:''}`;
  const showSlide=id=>{const index=entries.findIndex(v=>v.page.id===id);if(index<0)return;large.replaceChildren(previewSlide?.(entries[index],360)||el('p',{},label(entries[index],index)));caption.textContent=label(entries[index],index);};
  const refreshReferences=()=>{for(const row of checks){row.input.checked=referenceIds.has(row.id);row.card.classList.toggle('selected',row.input.checked);}placement.value=afterPageId;};
  function chooseReferences(ids){referenceIds=new Set(ids);refreshReferences();save();}
  if(entries.length){
    entries.forEach((row,index)=>{
      placement.append(el('option',{value:row.page.id},activity?`${label(row,index)} 앱 수정`:`${label(row,index)} 뒤에 넣기`));
      const input=el('input',{type:'checkbox','aria-label':`${index+1}쪽 참고`}),thumb=el('button',{class:'gai-maker-slide-thumb',type:'button','aria-label':`${label(row,index)} 크게 보기`,onClick:()=>showSlide(row.page.id)}),card=el('div',{class:'gai-maker-reference-card'},thumb,el('label',{},input,label(row,index)));
      input.addEventListener('change',()=>{if(input.checked&&referenceIds.size>=3){input.checked=false;status.textContent='참고 화면은 최대 3쪽이에요. 다른 쪽을 해제한 뒤 선택해주세요.';return;}input.checked?referenceIds.add(row.page.id):referenceIds.delete(row.page.id);refreshReferences();save();});
      checks.push({id:row.page.id,input,thumb,card,row});rail.append(card);
    });
    const draw=thumb=>{const row=checks.find(v=>v.thumb===thumb);if(row&&!thumb.childNodes.length)thumb.append(previewSlide?.(row.row,150)||el('span',{},'슬라이드'));};
    observer=new IntersectionObserver(rows=>{for(const row of rows)if(row.isIntersecting){draw(row.target);observer.unobserve(row.target);}},{root:rail,rootMargin:'180px'});checks.forEach(row=>observer.observe(row.thumb));
    placement.addEventListener('change',()=>{afterPageId=placement.value;showSlide(afterPageId);save();});
    const around=el('button',{type:'button',class:'btn',onClick:()=>{const at=entries.findIndex(v=>v.page.id===afterPageId);chooseReferences(entries.slice(Math.max(0,at-1),at+2).map(v=>v.page.id));}},'앞뒤 쪽 선택');
    references.append(el('div',{class:'gai-maker-current-slide'},large,caption),el('div',{class:'gai-maker-reference-picker'},el('h3',{},'참고할 수업 흐름'),el('p',{class:'gai-maker-note'},'가이X가 참고할 쪽을 체크하세요. 최대 3쪽을 함께 보낼 수 있어요.'),rail,el('div',{class:'gai-maker-reference-tools'},around,el('button',{type:'button',class:'btn',onClick:()=>chooseReferences([])},'선택 해제')),el('label',{class:'gai-maker-placement'},activity?'수정할 앱 위치':'앱을 넣을 위치',placement)));
    showSlide(afterPageId);refreshReferences();
  }
  const connect = el('button', { type: 'button', class: 'btn', onClick: () => {
    if (connecting || busy) return;
    connecting = true; connect.disabled = true; status.textContent = '가이X 연결을 확인하고 있어요…';
    // Preserve user activation for the standalone account connection window.
    let task; try { task = provider.connect(); } catch (error) { task = Promise.reject(error); }
    Promise.resolve(task).then(result => { if (!disposed) { status.textContent = result.label || '가이X 연결됨'; connect.textContent = '가이X 연결됨'; } })
      .catch(error => { if (!disposed) status.textContent = error.message; }).finally(() => { connecting = false; connect.disabled = false; });
  } }, '가이X 연결');
  const send = el('button', { type: 'submit', class: 'btn primary' }, '보내기');
  const stop = el('button', { type: 'button', class: 'btn', hidden: true, onClick: () => controller?.abort() }, '생성 취소');
  const apply = el('button', { type: 'button', class: 'btn primary', disabled: !candidate, onClick: async () => {
    if (!candidate || busy || disposed) return;
    busy = true; update(); status.textContent = '앱을 슬라이드에 저장하고 있어요…';
    try { await onApply(candidate,{afterPageId}); await saveChain; await store.write(null); }
    catch (error) { if (!disposed) status.textContent = error.message; }
    finally { busy = false; update(); }
  } }, activity ? '앱 수정 내용 반영' : '이 앱을 슬라이드에 넣기');
  const previewRoot = el('div', { class: 'gai-maker-preview', 'aria-label': '만든 앱 미리보기' });
  const save = () => {
    if(details.open)details.querySelector('pre').textContent=share.checked?(entries.length?gaiLessonContext(entries,afterPageId,title,{referenceIds:[...referenceIds],editing:!!activity}):context):'수업 흐름을 전달하지 않아요.';
    if (!initialized) return;
    const value = { version: 1, prompt: prompt.value, turns, candidate, share: share.checked, screens:screens.checked, referenceIds:[...referenceIds],afterPageId };
    saveChain = saveChain.catch(() => {}).then(() => store.write(value)).catch(() => { if (!disposed) status.textContent = '대화 초안을 기기에 저장하지 못했어요. 창을 닫기 전에 만든 앱을 슬라이드에 넣어주세요.'; });
  };
  function update() { send.disabled = busy || !initialized || connecting; prompt.disabled = busy || !initialized; share.disabled = busy || !initialized; screens.disabled=busy||!initialized||!share.checked;for(const node of references.querySelectorAll('button,input,select'))node.disabled=busy||!initialized||node===placement&&!!activity;connect.disabled = busy || connecting; apply.disabled = busy || !candidate || !initialized; stop.hidden = !busy; }
  function showTurns() {
    log.replaceChildren(...turns.flatMap(turn => [el('p', { class: 'gai-maker-teacher', text: turn.prompt }), el('p', { class: 'gai-maker-answer', text: turn.summary })]));
    log.scrollTop = log.scrollHeight;
  }
  function showPreview() {
    preview?.destroy(); preview = null; previewRoot.replaceChildren();
    if (!candidate) { previewRoot.append(el('p', { class: 'gai-maker-placeholder', text: '가이X와 대화하며 만든 앱이 여기에 나타나요. 슬라이드에 넣기 전에 직접 눌러보세요.' })); return; }
    preview = mountGaiApp(previewRoot, { activity: candidate, onSave: async () => { status.textContent = '미리보기 결과예요. 먼저 슬라이드에 앱을 넣고 발표에서 실행하면 결과를 다음 쪽에 저장할 수 있어요.'; } });
  }
  const form = el('form', { class: 'gai-maker-compose', onSubmit: async event => {
    event.preventDefault(); const request = prompt.value.trim(); if (!request || busy || !initialized) return;
    controller = new AbortController(); busy = true; update(); status.textContent = '가이X가 수업 앱을 만들고 있어요…'; save();
    try {
      const selectedContext=entries.length?gaiLessonContext(entries,afterPageId,title,{referenceIds:[...referenceIds],editing:!!activity}):context;
      const images=share.checked&&screens.checked&&referenceImage?await Promise.all(entries.filter(v=>referenceIds.has(v.page.id)).map((row)=>referenceImage(row,entries.indexOf(row)+1))):[];
      if(disposed||controller.signal.aborted)return;
      const response = await provider.generate({ prompt: request, context: share.checked ? selectedContext : '', images, project: candidate?.project || null, conversation: turns.slice(-6) }, { signal: controller.signal, onProgress: progress => {
        if (!disposed) status.textContent = typeof progress === 'string' ? progress.slice(0, 300) : '가이X가 앱을 준비하고 있어요…';
      } });
      if (disposed || controller.signal.aborted) return;
      if (response?.kind === 'app') {
        const next = response.activity;
        candidate = cleanGaiActivity({ version: 1, kind: 'gai-app', id: candidate?.id || newId('a'), title: next.title, instructions: next.instructions || '', document: next.document, project: next.project, state: {} });
        showPreview();
      } else if (response?.kind !== 'answer' || typeof response.answer !== 'string') throw Error('앱 응답을 읽지 못했어요. 현재 앱은 유지했어요.');
      turns = [...turns, { prompt: request, summary: String(response.summary || response.answer || '앱을 만들었어요. 미리보기에서 확인해주세요.').slice(0, 2000) }].slice(-12);
      prompt.value = ''; showTurns(); save(); status.textContent = response.kind === 'app' ? '앱을 눌러 확인하고, 마음에 들면 슬라이드에 넣어주세요.' : '원하는 모습을 이어서 이야기해주세요.';
    } catch (error) { if (!disposed) status.textContent = error.message || '생성을 마치지 못했어요. 대화와 이전 앱은 남아 있어요.'; }
    finally { busy = false; controller = null; update(); }
  } }, prompt, el('div', { class: 'gai-maker-actions' }, send, stop));
  prompt.addEventListener('input', save); share.addEventListener('change', ()=>{save();update();});screens.addEventListener('change',save);
  const details=el('details',{},el('summary',{},'전달할 수업 글 확인'),el('pre'));
  details.addEventListener('toggle',()=>{if(details.open)details.querySelector('pre').textContent=share.checked?(entries.length?gaiLessonContext(entries,afterPageId,title,{referenceIds:[...referenceIds],editing:!!activity}):context):'수업 흐름을 전달하지 않아요.';});
  root.append(el('header', {}, el('div', {}, el('h2', {},gaiOwl(),'가이X로 나만의 수업 앱'), el('p', { text: '수업 흐름 선택 → 대화 → 미리보기 → 슬라이드 안에서 실행' })), el('button', { type: 'button', class: 'btn', onClick: () => { if (busy && !controller) return; save(); onCancel(); } }, '편집으로 돌아가기')),entries.length?references:null,
    el('div', { class: 'gai-maker-body' }, el('section', { class: 'gai-maker-chat' }, connect, el('label', { class: 'gai-maker-share' }, share, 'PPT 수업 흐름 함께 전달'),el('label',{class:'gai-maker-share gai-maker-note'},screens,'선택한 슬라이드 화면도 전달'),
      el('p', { class: 'gai-maker-note', text: '보내기를 누르면 체크한 쪽의 글·축소 화면과 앱을 넣을 위치를 가이X에 전달해요. 화면 전달을 끄면 글만 보냅니다. 원본 PPT 파일은 보내지 않아요. 기존 가이랩 계정의 AI 사용량이 적용돼요.' }),details,log, form, status),
      el('section', { class: 'gai-maker-stage' }, previewRoot, apply, el('p', { class: 'gai-maker-note', text: `${activity ? '앱을 고쳐서 반영하면 진행 상태는 새로 시작해요. 이전 결과 쪽은 남아요. ' : ''}앱과 결과는 이 기기에 저장돼요. HTML 수업으로 내려받으면 앱도 함께 실행할 수 있어요.` }))));
  root.addEventListener('keydown', event => event.stopPropagation());
  root.dispose = () => { if (disposed) return; save(); disposed = true; controller?.abort(); preview?.destroy();observer?.disconnect(); };
  const remove = root.remove.bind(root); root.remove = () => { root.dispose(); remove(); };
  showPreview(); update();
  store.read().then(saved => {
    if (disposed || !saved || saved.version !== 1) return;
    // Existing slide is authoritative; only an unfinished edit draft can replace
    // it, and only within this exact document/page/revision draft key.
    if (saved.candidate) candidate = cleanGaiActivity(saved.candidate);
    prompt.value = typeof saved.prompt === 'string' ? saved.prompt.slice(0, 2000) : '';
    turns = Array.isArray(saved.turns) ? saved.turns.filter(t => typeof t?.prompt === 'string' && typeof t?.summary === 'string').slice(-12).map(t => ({ prompt: t.prompt.slice(0, 2000), summary: t.summary.slice(0, 2000) })) : [];
    share.checked = saved.share !== false;screens.checked=saved.screens!==false;
    if(Array.isArray(saved.referenceIds))referenceIds=new Set(saved.referenceIds.filter(id=>entries.some(v=>v.page.id===id)).slice(0,3));
    if(!activity&&entries.some(v=>v.page.id===saved.afterPageId))afterPageId=saved.afterPageId;refreshReferences();showSlide(afterPageId);
    showTurns(); showPreview(); status.textContent = '이 쪽에서 만들던 대화를 이어왔어요.';
  }).catch(() => { if (!disposed) status.textContent = '저장한 대화를 읽지 못했어요. 슬라이드 원본은 유지돼요.'; }).finally(() => { initialized = true; update(); });
  return root;
}
