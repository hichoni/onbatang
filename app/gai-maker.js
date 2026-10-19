import { el } from './ui.js';
import { newId } from '../src/document.js';
import { cleanGaiActivity } from '../src/gai-app.js';
import { mountGaiApp } from './gai-app.js';

// Reference text is bounded, plain data, and shared only after a teacher sends.
export function gaiLessonContext(entries, selectedId, title = '') {
  const selected = entries.findIndex(row => row.page.id === selectedId);
  const text = page => page.items?.filter(item => item.t === 'text').map(item => String(item.text || '')).join(' ') || '';
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

export function createGaiMaker({ provider, activity, context, draftKey, onApply, onCancel }) {
  const root = el('section', { class: 'gai-maker', 'aria-label': '가이X로 수업 앱 만들기' });
  const store = draftStore(draftKey);
  let candidate = activity, turns = [], busy = false, disposed = false, preview, controller, initialized = false, connecting = false;
  let saveChain = Promise.resolve();
  const status = el('p', { class: 'gai-maker-status', role: 'status', 'aria-live': 'polite' });
  const log = el('div', { class: 'gai-maker-log', role: 'log', 'aria-label': '가이X 대화' });
  const prompt = el('textarea', { 'aria-label': '가이X에게 요청', maxLength: 1300, minLength: 3, rows: 3, placeholder: '예: 이 픽셀아트 설명 다음에 쓸 8×8 그림 만들기 앱을 만들어줘. 완성한 그림도 남기고 싶어.' });
  const share = el('input', { type: 'checkbox', checked: true });
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
    try { await onApply(candidate); await saveChain; await store.write(null); }
    catch (error) { if (!disposed) status.textContent = error.message; }
    finally { busy = false; update(); }
  } }, activity ? '앱 수정 내용 반영' : '이 앱을 슬라이드에 넣기');
  const previewRoot = el('div', { class: 'gai-maker-preview', 'aria-label': '만든 앱 미리보기' });
  const save = () => {
    if (!initialized) return;
    const value = { version: 1, prompt: prompt.value, turns, candidate, share: share.checked };
    saveChain = saveChain.catch(() => {}).then(() => store.write(value)).catch(() => { if (!disposed) status.textContent = '대화 초안을 기기에 저장하지 못했어요. 창을 닫기 전에 만든 앱을 슬라이드에 넣어주세요.'; });
  };
  function update() { send.disabled = busy || !initialized || connecting; prompt.disabled = busy || !initialized; share.disabled = busy || !initialized; connect.disabled = busy || connecting; apply.disabled = busy || !candidate || !initialized; stop.hidden = !busy; }
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
      const response = await provider.generate({ prompt: request, context: share.checked ? context : '', project: candidate?.project || null, conversation: turns.slice(-6) }, { signal: controller.signal, onProgress: progress => {
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
  prompt.addEventListener('input', save); share.addEventListener('change', save);
  root.append(el('header', {}, el('div', {}, el('h2', { text: '가이X로 나만의 수업 앱' }), el('p', { text: '대화 → 미리보기 → 슬라이드 안에서 실행' })), el('button', { type: 'button', class: 'btn', onClick: () => { if (busy && !controller) return; save(); onCancel(); } }, '편집으로 돌아가기')),
    el('div', { class: 'gai-maker-body' }, el('section', { class: 'gai-maker-chat' }, connect, el('label', { class: 'gai-maker-share' }, share, 'PPT 수업 흐름 함께 전달'),
      el('p', { class: 'gai-maker-note', text: '보내기를 누르면 요청과 선택한 수업의 글을 가이X에 전달해요. 원본 PPT·사진은 보내지 않아요. 기존 가이랩 계정의 AI 사용량이 적용돼요.' }),
      el('details', {}, el('summary', { text: '전달할 수업 글 확인' }), el('p', { text: '이미지로만 가져온 쪽의 글은 읽지 못해요. 필요한 내용은 요청에 적어주세요.' }), el('pre', { text: context })), log, form, status),
      el('section', { class: 'gai-maker-stage' }, previewRoot, apply, el('p', { class: 'gai-maker-note', text: `${activity ? '앱을 고쳐서 반영하면 진행 상태는 새로 시작해요. 이전 결과 쪽은 남아요. ' : ''}앱과 결과는 이 기기에 저장돼요. HTML 수업으로 내려받으면 앱도 함께 실행할 수 있어요.` }))));
  root.addEventListener('keydown', event => event.stopPropagation());
  root.dispose = () => { if (disposed) return; save(); disposed = true; controller?.abort(); preview?.destroy(); };
  const remove = root.remove.bind(root); root.remove = () => { root.dispose(); remove(); };
  showPreview(); update();
  store.read().then(saved => {
    if (disposed || !saved || saved.version !== 1) return;
    // Existing slide is authoritative; only an unfinished edit draft can replace
    // it, and only within this exact document/page/revision draft key.
    if (saved.candidate) candidate = cleanGaiActivity(saved.candidate);
    prompt.value = typeof saved.prompt === 'string' ? saved.prompt.slice(0, 2000) : '';
    turns = Array.isArray(saved.turns) ? saved.turns.filter(t => typeof t?.prompt === 'string' && typeof t?.summary === 'string').slice(-12).map(t => ({ prompt: t.prompt.slice(0, 2000), summary: t.summary.slice(0, 2000) })) : [];
    share.checked = saved.share !== false; showTurns(); showPreview(); status.textContent = '이 쪽에서 만들던 대화를 이어왔어요.';
  }).catch(() => { if (!disposed) status.textContent = '저장한 대화를 읽지 못했어요. 슬라이드 원본은 유지돼요.'; }).finally(() => { initialized = true; update(); });
  return root;
}
