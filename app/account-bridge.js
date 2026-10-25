// GBE-AI Lab 계정으로 이어 쓰기(공용 온바탕): 집에서 만든 그림을 GBE-AI Lab 선생님 계정에 올려 두고, 학교 컴퓨터에서 가져온다.
// 로그인은 GBE-AI Lab 창(작은 연결 창)에서만 하고, 로그인 정보는 이 창으로 넘어오지 않는다. 오가는 것은 선생님이 고른 그림뿐이다.
// 신호(postMessage, type: 'onbatang-account'): 연결 창 → 온바탕 ready · result · error, 온바탕 → 연결 창 list · get · put.
// 연결 창은 처음 열 때 정한 주소(gai-lab.netlify.app)와 그 창에서 온 신호만 받는다. 다 하면 온바탕이 연결 창을 닫는다.
import { el, toast, openModal, closeModal } from './ui.js';
import { cleanRecord, isDesignId, MAX_DESIGNS } from './designs.js';
import { designView } from '../src/render.js';

const PUT_MAX = 10;                 // 한 번에 올리는 그림 수
export function createAccountBridge({ url = 'https://gai-lab.netlify.app/onbatang-account-connect.html', host = globalThis.window } = {}) {
  const endpoint = new URL(url), pending = new Map();
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw Error('GBE-AI Lab 연결 주소를 확인해 주세요.');
  let popup = null, channel = '', ready = false, waiting = null, poll = 0;
  const fail = (message) => {
    ready = false; clearInterval(poll);
    waiting?.reject(Error(message)); waiting = null;
    for (const item of pending.values()) item.reject(Error(message));
    pending.clear();
  };
  host.addEventListener('message', (event) => {
    const data = event.data;
    if (event.origin !== endpoint.origin || event.source !== popup || data?.type !== 'onbatang-account' || data.channel !== channel) return;
    if (data.event === 'ready') { ready = true; waiting?.resolve(); waiting = null; return; }
    const item = pending.get(data.request);
    if (!item || !['result', 'error'].includes(data.event)) return;
    pending.delete(data.request);
    if (data.event === 'error') item.reject(Error(String(data.message || 'GBE-AI Lab 계정에서 처리하지 못했어요.').slice(0, 300)));
    else item.resolve(data.result);
  });
  /** GBE-AI Lab 연결 창을 열고, 선생님이 그 창에서 로그인 · 허락하면 끝난다. 누르기에서 바로 불러야 창이 막히지 않는다. */
  function connect() {
    if (ready && popup && !popup.closed) return Promise.resolve();
    if (waiting && popup && !popup.closed) { popup.focus(); return waiting.promise; }
    channel = crypto.randomUUID(); ready = false;
    endpoint.hash = new URLSearchParams({ origin: host.location.origin, channel }).toString();
    popup = host.open(endpoint.href, `onbatang-account-${channel}`, 'popup,width=480,height=680');
    if (!popup) return Promise.reject(Error('GBE-AI Lab 연결 창이 막혔어요. 이 사이트의 팝업을 허용하고 다시 눌러 주세요.'));
    let resolve, reject;
    const promise = new Promise((ok, no) => { resolve = ok; reject = no; });
    waiting = { promise, resolve, reject };
    clearInterval(poll);
    poll = setInterval(() => { if (popup.closed) fail('GBE-AI Lab 연결 창이 닫혔어요. 다시 연결해 주세요.'); }, 500);
    return promise;
  }
  function ask(action, payload = {}, timeoutMs = 120000) {
    if (!ready || !popup || popup.closed) return Promise.reject(Error('GBE-AI Lab 계정을 먼저 연결해 주세요.'));
    const request = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(request); reject(Error('GBE-AI Lab 계정이 답하지 않아요. 다시 해 주세요.')); }, timeoutMs);
      pending.set(request, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      popup.postMessage({ type: 'onbatang-account', channel, request, action, ...payload }, endpoint.origin);
    });
  }
  return {
    connect,
    get connected() { return ready && !!popup && !popup.closed; },
    /** 계정의 그림 목록: [{ id, name, updatedAt, slides }] */
    list: () => ask('list'),
    /** 고른 그림의 원본(사진 포함) */
    get: (ids) => ask('get', { ids }, 300000),
    /** 그림을 계정에 올린다: { saved: [id], failed: [{ id, message }] } */
    put: (records) => ask('put', { records }, 300000),
    close() { clearInterval(poll); ready = false; try { popup?.close(); } catch { /* 이미 닫혔다 */ } popup = null; },
  };
}

const when = (ms) => { const d = new Date(ms); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** 가져올지 정하기: 이 기기에 없거나 계정 것이 더 새로우면 가져온다. */
export function importPlan(remote, local) {
  const here = new Map((local || []).map((r) => [r.id, r]));
  return (remote || []).filter((r) => isDesignId(r?.id)).map((r) => {
    const mine = here.get(r.id);
    return { ...r, state: !mine ? 'new' : (mine.updatedAt || 0) >= (r.updatedAt || 0) ? 'same' : 'newer' };
  });
}

// 한 PPT 를 나눠 담은 파트들(이름 끝이 " · 2")은 한 칸으로 묶는다. 칸 하나를 고르면 그 파트를 모두 고른다.
const PART_NAME = /^(.*\S)\s*·\s*(\d{1,3})$/;
export function bridgeEntries(rows) {
  const parts = new Map(), out = [];
  for (const r of rows || []) {
    const m = PART_NAME.exec(r.name || '');
    if (m && r.ppt !== false) { if (!parts.has(m[1])) parts.set(m[1], []); parts.get(m[1]).push({ ...r, part: Number(m[2]) }); }
    else out.push({ key: r.id, name: r.name || '이름 없는 그림', rows: [r], ppt: !!r.ppt });
  }
  for (const [name, list] of parts) {
    if (list.length < 2) { out.push({ key: list[0].id, name: list[0].name, rows: list, ppt: !!list[0].ppt }); continue; }
    out.push({ key: `p:${name}`, name, rows: list.sort((a, b) => a.part - b.part), ppt: true });
  }
  const at = (e) => Math.max(...e.rows.map((r) => r.updatedAt || 0));
  return out.map((e) => ({ ...e, slides: e.rows.reduce((n, r) => n + (r.slides || 0), 0), updatedAt: at(e),
    state: e.rows.every((r) => r.state === 'same') ? 'same' : e.rows.some((r) => r.state === 'newer') ? 'newer' : 'new' })).sort((a, b) => b.updatedAt - a.updatedAt);
}
const STATE_TEXT = { new: '새로', newer: '계정 것이 더 새로워요', same: '이미 같아요' };
const UP_TEXT = { new: '아직 안 올렸어요', newer: '이 기기 것이 더 새로워요', same: '이미 올렸어요' };
// 작은 표지: 첫 장을 그린다(없으면 이름 첫 글자).
function coverOf(first, size, name) {
  const box = el('span', { class: 'cv-bridge-cover', 'aria-hidden': 'true' });
  try {
    if (first && size?.width > 0 && size?.height > 0) { const view = designView(first); view.style.setProperty('--fe-ratio', String(size.width / size.height)); box.append(view); return box; }
  } catch { /* 표지 없이 */ }
  box.dataset.empty = '1'; box.textContent = String(name || '그').slice(0, 1); return box;
}

/**
 * 이어 쓰기 창. bridge: createAccountBridge(), store: { list(), put(record) }, onChanged: 가져온 뒤 첫 화면 다시 그리기.
 */
export function openAccountBridge({ bridge, store, onChanged = () => {} }) {
  const status = el('p', { class: 'cv-bridge-status', role: 'status', 'aria-live': 'polite' });
  const body = el('div', { class: 'cv-bridge-body' });
  const connect = el('button', { class: 'btn btn-primary cv-bridge-go', type: 'button', onClick: () => start() }, 'GBE-AI Lab 계정 연결');
  const intro = el('div', { class: 'cv-bridge-intro' },
    el('ol', { class: 'cv-bridge-steps' },
      el('li', {}, el('b', { text: 'GBE-AI Lab 창에서 로그인' }), el('span', { text: '작은 창이 열려요. 로그인 정보는 이 창으로 오지 않아요.' })),
      el('li', {}, el('b', { text: '"허락" 누르기' }), el('span', { text: '이 온바탕과 계정을 이어요.' })),
      el('li', {}, el('b', { text: '가져오거나 올리기' }), el('span', { text: '고른 그림 · PPT만 오가요.' }))),
    connect);
  const panel = el('div', { class: 'cv-bridge' },
    el('div', { class: 'cv-bridge-head' }, el('h2', { text: 'GBE-AI Lab 계정으로 이어 쓰기' }),
      el('p', { class: 'cv-bridge-lead', text: '집에서 만든 그림을 학교에서, 학교에서 만든 PPT를 집에서 이어서 고쳐요.' })),
    body, status);
  body.append(intro);
  openModal(panel, { wide: true, onClose: () => bridge.close() });
  const busy = async (job) => { panel.inert = true; status.textContent = ''; try { await job(); } catch (error) { status.textContent = String(error?.message || '하지 못했어요. 다시 해 주세요.'); } finally { panel.inert = false; } };
  let tab = null;
  function start() {
    // 연결 창은 누르기에서 곧바로 연다(기다린 뒤에 열면 브라우저가 막는다).
    const opened = bridge.connect();
    status.textContent = 'GBE-AI Lab 창에서 로그인하고 "허락"을 눌러 주세요.';
    busy(async () => { await opened; await paint(); status.textContent = 'GBE-AI Lab 계정에 연결했어요.'; });
  }
  // 고르는 칸들: 칸마다 표지 · 이름 · 장 수 · 파트 수 · 때 · 상태. 이미 같은 것은 고를 수 없다.
  function pick(entries, label, words, action) {
    const boxes = entries.map((e) => ({ e, box: el('input', { type: 'checkbox', checked: e.state !== 'same', disabled: e.state === 'same', 'aria-label': e.name }) }));
    const count = el('span', { class: 'cv-bridge-count' });
    const run = el('button', { class: 'btn btn-primary', type: 'button' });
    const sync = () => { const n = boxes.filter((b) => b.box.checked).length; count.textContent = `${n}개 고름`; run.textContent = `${action.label(n)}`; run.disabled = !n; all.checked = n > 0 && boxes.every((b) => b.box.disabled || b.box.checked); };
    const all = el('input', { type: 'checkbox', onChange: (ev) => { for (const b of boxes) if (!b.box.disabled) b.box.checked = ev.currentTarget.checked; sync(); } });
    for (const b of boxes) b.box.addEventListener('change', sync);
    const list = el('ul', { class: 'cv-bridge-list', 'aria-label': label }, ...boxes.map(({ e, box }) => el('li', { class: 'cv-bridge-item', dataset: { state: e.state } }, el('label', {}, box,
      coverOf(e.rows[0].first, e.rows[0].size, e.name),
      el('span', { class: 'cv-bridge-info' },
        el('b', { text: e.name }),
        el('span', { class: 'cv-bridge-chips' }, e.ppt ? el('i', { class: 'cv-bridge-ppt', text: 'PPT' }) : null,
          el('span', { text: `${e.slides}장${e.rows.length > 1 ? ` · 파트 ${e.rows.length}개` : ''}` }), el('span', { text: when(e.updatedAt) })),
        el('em', { class: 'cv-bridge-state', text: words[e.state] }))))));
    run.addEventListener('click', () => action.go(boxes.filter((b) => b.box.checked).flatMap((b) => b.e.rows)));
    sync();
    return el('div', { class: 'cv-bridge-pane' },
      entries.length ? list : el('p', { class: 'cv-bridge-empty', text: action.empty }),
      el('div', { class: 'cv-bridge-foot' }, entries.length ? el('label', { class: 'cv-bridge-all' }, all, ' 모두') : el('span'), count, run));
  }
  async function paint() {
    const local = await store.list(), remote = await bridge.list();
    const upRows = local.map((r) => {
      const there = remote.find((x) => x.id === r.id);
      return { id: r.id, name: r.name, slides: r.slides?.length || 0, updatedAt: r.updatedAt, ppt: r.source?.kind === 'pptx', first: r.slides?.[0], size: r.size,
        state: there && (there.updatedAt || 0) >= (r.updatedAt || 0) ? 'same' : there ? 'newer' : 'new' };
    });
    const downs = bridgeEntries(importPlan(remote, local)), ups = bridgeEntries(upRows);
    tab ||= downs.some((e) => e.state !== 'same') || !ups.length ? 'down' : 'up';
    const take = pick(downs, '가져올 그림', STATE_TEXT, { label: (n) => n ? `고른 ${n}개 이 기기로 가져오기` : '가져올 것을 골라 주세요', empty: '계정에 그림이 없어요.', go: (rows) => busy(async () => {
      const ids = rows.map((r) => r.id);
      const here = await store.list(), fresh = ids.filter((id) => !here.some((r) => r.id === id)).length;
      if (here.length + fresh > MAX_DESIGNS) { status.textContent = `이 기기에는 그림을 ${MAX_DESIGNS}장까지 둘 수 있어요. 안 쓰는 그림을 지우고 다시 해 주세요.`; return; }
      let got = 0;
      for (const raw of await bridge.get(ids)) {
        let record = null;
        try { record = cleanRecord(raw); } catch (error) { console.warn(error); }
        if (!record) continue;
        await store.put(record); got++;
      }
      onChanged();
      await paint();
      status.textContent = `${got}개를 이 기기로 가져왔어요. 첫 화면의 내 그림에서 열어요(PPT는 한 칸으로 묶여 모든 쪽이 이어져요).`;
    }) });
    const send = pick(ups, '올릴 그림', UP_TEXT, { label: (n) => n ? `고른 ${n}개 계정에 올리기` : '올릴 것을 골라 주세요', empty: '이 기기에 그림이 없어요.', go: (rows) => busy(async () => {
      const ids = rows.map((r) => r.id);
      const records = (await store.list()).filter((r) => ids.includes(r.id));
      let saved = 0; const failed = [];
      for (let i = 0; i < records.length; i += PUT_MAX) {
        const out = await bridge.put(records.slice(i, i + PUT_MAX));
        saved += out?.saved?.length || 0; failed.push(...(out?.failed || []));
      }
      await paint();
      status.textContent = failed.length ? `${saved}개를 올렸고 ${failed.length}개는 못 올렸어요: ${failed[0].message}` : `${saved}개를 GBE-AI Lab 계정에 올렸어요. 다른 컴퓨터에서 가져오거나 GBE-AI Lab에서 열어요.`;
    }) });
    const tabs = el('div', { class: 'cv-bridge-tabs', role: 'tablist', 'aria-label': '가져오기 · 올리기' });
    const show = (which) => { tab = which; for (const b of tabs.children) { const on = b.dataset.tab === which; b.setAttribute('aria-selected', String(on)); b.classList.toggle('on', on); } take.hidden = which !== 'down'; send.hidden = which !== 'up'; };
    tabs.append(
      el('button', { type: 'button', role: 'tab', dataset: { tab: 'down' }, onClick: () => show('down') }, `계정에서 가져오기 · ${downs.length}`),
      el('button', { type: 'button', role: 'tab', dataset: { tab: 'up' }, onClick: () => show('up') }, `계정에 올리기 · ${ups.length}`));
    body.replaceChildren(tabs, take, send,
      el('div', { class: 'cv-bridge-end' }, el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { bridge.close(); closeModal(); toast('GBE-AI Lab 연결을 끊었어요.'); } }, '다 했어요 · 연결 끊기')));
    show(tab);
  }
}
