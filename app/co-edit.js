// 같이 고치기: 여러 사람이 한 그림을 동시에 고친다(로그인 없이, 링크를 받은 사람끼리).
// 통로(channel)는 들여 쓰는 곳이 준다: { send(message), on(fn) → 끊기, close() }. 공용 온바탕은 GBE-AI Lab의 실시간 통로를 다리(co-relay.js)로 쓴다.
// 서버에 저장하지 않는다. 시작한 사람(host)의 화면이 이 모임의 기준이다:
//   - 들어온 사람(guest)이 고친 것은 시작한 사람에게 가고(op), 시작한 사람이 차례 번호(seq)를 붙여 모두에게 나눠 준다(commit).
//   - 모두가 같은 차례로 끼워 넣으므로 같은 그림이 된다. 내가 보낸 것이 돌아오기 전에 그 자리를 다른 사람이 바꾼 것은 건너뛴다(내 것이 뒤에 온다).
//   - 시작한 사람이 가끔 그림의 지문(hash)을 알려 준다. 들어온 사람의 그림이 다르면 처음부터 다시 받는다(sync).
// 나누는 것: 장의 차례 · 장마다의 내용(요소 · 바탕 · 움직임 · 노트 …) · 그림의 모양. 이 기기에만 있는 녹음한 목소리(voice)는 나누지 않는다.

/** 모임 코드(링크에 들어가는 40자리 무작위 값). */
export const coCode = (value) => { const code = String(value || '').trim().toLowerCase(); return /^[a-f0-9]{40}$/.test(code) ? code : ''; };
export function newCoCode() { const a = new Uint8Array(20); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); }
export const newPeerId = () => newCoCode().slice(0, 12);
/** 사람마다의 색(시작한 사람이 들어온 차례대로 준다). */
export const CO_COLORS = Object.freeze(['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#d6336c', '#5c940d']);
/** 이름: 앞뒤 빈칸 · 조절 글자를 빼고 16자까지. */
export const cleanName = (value) => Array.from(String(value ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').trim()).slice(0, 16).join('');

const LOCAL_ONLY = new Set(['voice']);       // 이 기기에만 있는 것(녹음 파일의 구간)
const FIXED = new Set(['id', 'items']);
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** 나눌 장: 이 기기에만 있는 것을 뺀다. */
export function shareSlide(slide) {
  const out = {};
  for (const [k, v] of Object.entries(slide || {})) if (!LOCAL_ONLY.has(k)) out[k] = v;
  return out;
}

function fieldDiff(before, after, skip) {
  const set = {};
  const unset = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (skip.has(k)) continue;
    if (!(k in after)) unset.push(k);
    else if (!(k in before) || !same(before[k], after[k])) set[k] = after[k];
  }
  return Object.keys(set).length || unset.length ? { ...(Object.keys(set).length ? { set } : {}), ...(unset.length ? { unset } : {}) } : null;
}

/**
 * 두 그림 상태의 차이 → 바꾼 것들(ops). state: { ratio, size, slides: [{ id, items: [{ id, … }], … }] }.
 *   ratio { r, size } · slides { ids }(장의 차례) · slide { s, d }(새 장) · drop { s }(지운 장) · set { s, set?, unset? }(장의 바탕 · 움직임 · 노트 …)
 *   add { s, i, d }(새 요소) · item { s, i, set?, unset? }(요소의 바뀐 칸만) · del { s, i } · order { s, ids }(요소의 차례)
 */
export function diffState(before, after) {
  const ops = [];
  if (before.ratio !== after.ratio || !same(before.size, after.size)) ops.push({ o: 'ratio', r: after.ratio, size: after.size });
  const was = new Map(before.slides.map((s) => [s.id, s]));
  const now = new Set(after.slides.map((s) => s.id));
  for (const s of before.slides) if (!now.has(s.id)) ops.push({ o: 'drop', s: s.id });
  for (const s of after.slides) {
    const old = was.get(s.id);
    if (!old) { ops.push({ o: 'slide', s: s.id, d: shareSlide(s) }); continue; }
    const fields = fieldDiff(old, s, new Set([...FIXED, ...LOCAL_ONLY]));
    if (fields) ops.push({ o: 'set', s: s.id, ...fields });
    const oldItems = new Map(old.items.map((it) => [it.id, it]));
    const newIds = new Set(s.items.map((it) => it.id));
    for (const it of old.items) if (!newIds.has(it.id)) ops.push({ o: 'del', s: s.id, i: it.id });
    for (const it of s.items) {
      const prev = oldItems.get(it.id);
      if (!prev) { ops.push({ o: 'add', s: s.id, i: it.id, d: it }); continue; }
      const diff = fieldDiff(prev, it, new Set(['id']));
      if (diff) ops.push({ o: 'item', s: s.id, i: it.id, ...diff });
    }
    // 끼워 넣는 쪽은 남은 것을 그대로 두고 새것을 뒤에 붙인다: 그것과 다르면 차례를 알린다
    const order = s.items.map((it) => it.id);
    if (!same([...old.items.map((it) => it.id).filter((id) => newIds.has(id)), ...order.filter((id) => !oldItems.has(id))], order)) ops.push({ o: 'order', s: s.id, ids: order });
  }
  const order = after.slides.map((s) => s.id);
  if (!same([...before.slides.map((s) => s.id).filter((id) => now.has(id)), ...order.filter((id) => !was.has(id))], order)) ops.push({ o: 'slides', ids: order });
  return ops;
}

// 차례 맞추기: 적힌 차례대로 놓고, 적히지 않은 것(그사이 다른 사람이 넣은 것)은 원래 차례대로 뒤에 둔다.
function reorder(list, ids) {
  const at = new Map(list.map((x) => [x.id, x]));
  const out = [];
  for (const id of ids) if (at.has(id)) { out.push(at.get(id)); at.delete(id); }
  for (const x of list) if (at.has(x.id)) out.push(x);
  return out;
}

/**
 * 바꾼 것들을 그림 상태에 끼워 넣는다(받은 상태는 고치지 않는다). 없는 장 · 요소를 가리키는 것은 건너뛴다.
 * 돌려주는 것: { state, changed: Map(장 id → { items: Set(바뀐 · 지운 요소 id), added: Set, order, fields: Set(장의 칸) }), slides(장의 차례나 수가 바뀌었는지), ratio }
 */
export function applyOps(state, ops) {
  let slides = state.slides.slice();
  const out = { ratio: state.ratio, size: state.size };
  const changed = new Map();
  let moved = false;
  let ratio = false;
  const mark = (s) => { if (!changed.has(s)) changed.set(s, { items: new Set(), added: new Set(), order: false, fields: new Set() }); return changed.get(s); };
  // 장 · 요소 목록은 처음 바꿀 때 한 번만 베낀다
  const own = new Set();
  const slideAt = (s) => {
    const i = slides.findIndex((d) => d.id === s);
    if (i < 0) return null;
    if (!own.has(s)) { slides[i] = { ...slides[i], items: slides[i].items.slice() }; own.add(s); }
    return slides[i];
  };
  for (const op of ops) {
    if (op.o === 'ratio') { out.ratio = op.r; out.size = op.size; ratio = true; continue; }
    if (op.o === 'slides') { const next = reorder(slides, op.ids); if (!same(next.map((d) => d.id), slides.map((d) => d.id))) moved = true; slides = next; continue; }
    if (op.o === 'slide') {
      const i = slides.findIndex((d) => d.id === op.s);
      const d = { ...op.d, id: op.s, items: Array.isArray(op.d.items) ? op.d.items.slice() : [] };
      if (i >= 0) { for (const k of LOCAL_ONLY) if (k in slides[i]) d[k] = slides[i][k]; slides[i] = d; }
      else { slides.push(d); moved = true; }
      own.add(op.s);
      const c = mark(op.s);
      c.whole = true;
      continue;
    }
    if (op.o === 'drop') { const before = slides.length; slides = slides.filter((d) => d.id !== op.s); if (slides.length !== before) { moved = true; changed.delete(op.s); } continue; }
    const d = slideAt(op.s);
    if (!d) continue;
    const c = mark(op.s);
    if (op.o === 'set') {
      for (const [k, v] of Object.entries(op.set || {})) if (!FIXED.has(k) && !LOCAL_ONLY.has(k)) { d[k] = v; c.fields.add(k); }
      for (const k of op.unset || []) if (!FIXED.has(k) && !LOCAL_ONLY.has(k) && k in d) { delete d[k]; c.fields.add(k); }
    } else if (op.o === 'add') {
      const i = d.items.findIndex((it) => it.id === op.i);
      const item = { ...op.d, id: op.i };
      if (i >= 0) d.items[i] = item; else { d.items.push(item); c.added.add(op.i); }
      c.items.add(op.i);
    } else if (op.o === 'item') {
      const i = d.items.findIndex((it) => it.id === op.i);
      if (i < 0) continue;
      const item = { ...d.items[i], ...(op.set || {}), id: op.i };
      for (const k of op.unset || []) if (k !== 'id' && k !== 't') delete item[k];
      d.items[i] = item;
      c.items.add(op.i);
    } else if (op.o === 'del') {
      const i = d.items.findIndex((it) => it.id === op.i);
      if (i < 0) continue;
      d.items.splice(i, 1);
      c.items.add(op.i);
      c.added.delete(op.i);
    } else if (op.o === 'order') {
      const next = reorder(d.items, op.ids);
      if (!same(next.map((it) => it.id), d.items.map((it) => it.id))) { d.items = next; c.order = true; }
    }
  }
  return { state: { ...out, slides }, changed, slides: moved, ratio };
}

/** 받은 ops 를 믿을 수 있는 모양만 남긴다(모르는 것 · 이상한 이름표는 버린다). 내용은 끼워 넣은 뒤 그림 쪽에서 다시 정리한다. */
export function cleanOps(raw, { max = 2000 } = {}) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const keys = (v) => (Array.isArray(v) ? v.filter((k) => typeof k === 'string' && k.length <= 40).slice(0, 80) : undefined);
  const fields = (v) => (plain(v) && Object.keys(v).length <= 80 ? v : undefined);
  const ids = (v) => (Array.isArray(v) ? v.filter((k) => typeof k === 'string' && ID.test(k)).slice(0, 2000) : null);
  for (const op of raw.slice(0, max)) {
    if (!plain(op)) continue;
    if (op.o === 'ratio' && typeof op.r === 'string' && op.r.length <= 40) out.push({ o: 'ratio', r: op.r, size: plain(op.size) ? op.size : undefined });
    else if (op.o === 'slides' && ids(op.ids)) out.push({ o: 'slides', ids: ids(op.ids) });
    else if (!ID.test(op.s ?? '')) continue;
    else if (op.o === 'slide' && plain(op.d)) out.push({ o: 'slide', s: op.s, d: op.d });
    else if (op.o === 'drop') out.push({ o: 'drop', s: op.s });
    else if (op.o === 'set') out.push({ o: 'set', s: op.s, set: fields(op.set), unset: keys(op.unset) });
    else if (op.o === 'order' && ids(op.ids)) out.push({ o: 'order', s: op.s, ids: ids(op.ids) });
    else if (!ID.test(op.i ?? '')) continue;
    else if (op.o === 'add' && plain(op.d)) out.push({ o: 'add', s: op.s, i: op.i, d: op.d });
    else if (op.o === 'item') out.push({ o: 'item', s: op.s, i: op.i, set: fields(op.set), unset: keys(op.unset) });
    else if (op.o === 'del') out.push({ o: 'del', s: op.s, i: op.i });
  }
  return out;
}

// 한 op 가 다루는 자리들(내가 보낸 것이 돌아오기 전에, 같은 자리의 다른 사람 것을 건너뛸 때 쓴다).
function placesOf(op) {
  if (op.o === 'ratio') return ['r'];
  if (op.o === 'slides') return ['#'];
  if (op.o === 'slide' || op.o === 'drop') return [`s:${op.s}`];
  if (op.o === 'order') return [`o:${op.s}`];
  if (op.o === 'set') return [...Object.keys(op.set || {}), ...(op.unset || [])].map((k) => `f:${op.s}:${k}`);
  if (op.o === 'add' || op.o === 'del') return [`i:${op.s}:${op.i}`];
  if (op.o === 'item') return [...Object.keys(op.set || {}), ...(op.unset || [])].map((k) => `i:${op.s}:${op.i}:${k}`);
  return [];
}
/** 아직 돌아오지 않은 내 것(pending: Map(자리 → 번호))과 겹치는 칸을 뺀 ops. */
export function skipPending(ops, pending) {
  if (!pending.size) return ops;
  const out = [];
  for (const op of ops) {
    if (op.o === 'set' || op.o === 'item') {
      const base = op.o === 'set' ? `f:${op.s}:` : `i:${op.s}:${op.i}:`;
      const set = Object.fromEntries(Object.entries(op.set || {}).filter(([k]) => !pending.has(base + k)));
      const unset = (op.unset || []).filter((k) => !pending.has(base + k));
      if (Object.keys(set).length === Object.keys(op.set || {}).length && unset.length === (op.unset || []).length) out.push(op);
      else if (Object.keys(set).length || unset.length) out.push({ ...op, set, unset });
    } else if (!placesOf(op).some((p) => pending.has(p))) out.push(op);
  }
  return out;
}

// 그림의 지문: 칸의 차례와 상관없이 같은 내용이면 같은 값(FNV-1a).
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (plain(v)) return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export function stateHash(state) {
  const text = canonical({ ratio: state.ratio, slides: state.slides.map(shareSlide) });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0') + text.length.toString(36);
}

/**
 * 통로 위에서 큰 것(사진이 든 그림)을 나눠 보내고 다시 잇는다. 한 번에 보내는 크기(max 글자)와 빠르기(1초에 rate 번)를 지킨다.
 * channel: { send(message), on(fn) → 끊기, close() } · 돌려주는 것: { send(message), on(fn), progress(fn({ from, got, of })), close() }
 */
export function createWire(channel, { me, max = 60000, rate = 25, keepMs = 60000, now = () => Date.now() } = {}) {
  const queue = [];
  let timer = 0;
  let closed = false;
  const listeners = new Set();
  const watchers = new Set();
  const parts = new Map();
  const pump = () => {
    timer = 0;
    if (closed || !queue.length) return;
    try { channel.send(queue.shift()); } catch (error) { console.warn(error); }
    if (queue.length) timer = setTimeout(pump, Math.ceil(1000 / rate));
  };
  const off = channel.on((raw) => {
    if (closed || !plain(raw) || raw.v !== 1 || raw.from === me) return;
    if (raw.k !== 'part') { for (const fn of listeners) fn(raw); return; }
    const of = Number(raw.of), n = Number(raw.n);
    if (typeof raw.id !== 'string' || typeof raw.data !== 'string' || !(of > 1 && of <= 800) || !(n >= 0 && n < of)) return;
    if (raw.to && raw.to !== me) return;
    const key = `${raw.from}:${raw.id}`;
    for (const [k, p] of parts) if (now() - p.at > keepMs) parts.delete(k);
    const p = parts.get(key) || { of, got: new Array(of), count: 0, at: now() };
    parts.set(key, p);
    if (p.of !== of || p.got[n] !== undefined) return;
    p.got[n] = raw.data;
    p.count++;
    p.at = now();
    for (const fn of watchers) fn({ from: raw.from, got: p.count, of });
    if (p.count < of) return;
    parts.delete(key);
    let message;
    try { message = JSON.parse(p.got.join('')); } catch { return; }
    if (plain(message) && message.v === 1 && message.from === raw.from) for (const fn of listeners) fn(message);
  });
  return {
    send(message) {
      if (closed) return;
      const full = { ...message, v: 1, from: me };
      const text = JSON.stringify(full);
      if (text.length <= max) queue.push(full);
      else {
        const id = newPeerId();
        const of = Math.ceil(text.length / max);
        for (let n = 0; n < of; n++) queue.push({ v: 1, k: 'part', from: me, ...(message.to ? { to: message.to } : {}), id, n, of, data: text.slice(n * max, (n + 1) * max) });
      }
      if (!timer) pump();
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    progress(fn) { watchers.add(fn); return () => watchers.delete(fn); },
    /** 아직 보내지 못한 조각 수 */
    waiting: () => queue.length,
    close() { closed = true; clearTimeout(timer); queue.length = 0; listeners.clear(); watchers.clear(); try { off?.(); } catch { /* 이미 끊겼다 */ } try { channel.close?.(); } catch { /* 이미 닫혔다 */ } },
  };
}

/**
 * 같이 고치기 모임 하나. role: 'host'(시작한 사람) · 'guest'(링크로 들어온 사람).
 * doc: 그림 쪽 { read() → state · ready() → 지금 끼워 넣어도 되는지 · apply(ops) 바꾼 것 끼워 넣기 ·
 *   open(state, info) 처음 받은 그림 열기(들어온 사람. 약속 가능) · replace(state) 다시 받은 그림으로 바꾸기 · info() → { name }(시작한 사람의 그림 이름) }
 * on: { peers(list) 사람들 [{ id, name, color, slide, sel, me?, host? }] · join(peer) · leave(peer) · status('ok' | 'lost') 시작한 사람과 이어졌는지 ·
 *   end(reason: 'host' 시작한 사람이 끝냄 · 'closed' 내가 닫음) · error(message) 들어가지 못했다 }
 * 돌려주는 것: { changed() 내가 고쳤다(조금 모았다가 보낸다) · flush() · select(slide, sel) 내가 보는 장 · 고른 요소 · peers() · lockedBy(slide, id) · live() · close() }
 */
export function createCoSession({ role, wire, me, doc, on = {}, delay = 150, beat = 10000, lost = 150000, helloEvery = 2000, joinMs = 30000, stuckMs = 20000, now = () => Date.now() }) {
  const host = role === 'host';
  const peers = new Map();         // id → { id, name, color, slide, sel, seen, host? }
  let seq = 0;                     // 마지막으로 끼워 넣은 차례 번호
  let base = null;                 // 마지막으로 보내거나 받은 그림(차이를 구할 때 견준다)
  let phase = host ? 'live' : 'waiting';
  let n = 0;                       // 내가 보낸 묶음 번호(들어온 사람)
  const pending = new Map();       // 자리 → 그 자리를 마지막으로 바꾼 내 묶음 번호(아직 돌아오지 않은 것)
  let pendingSince = 0;
  let redo = new Set();            // 다시 받은 뒤: 아직 돌아오지 않은 내 묶음(돌아오면 끼워 넣는다. 받은 그림에는 없다)
  const inbox = [];                // 아직 끼워 넣지 못한 것(편집기가 바쁘거나 그림을 여는 중)
  let draining = false;
  let timer = 0, drainTimer = 0, beatTimer = 0, helloTimer = 0, hereTimer = 0;
  let hostSeen = now();
  let hostOk = true;
  let hash = '';
  let hashDirty = true;
  let asked = 0, asks = 0;         // 다시 받기를 청한 때 · 번 수(그림이 계속 어긋나도 끝없이 청하지 않게)
  let mine = { slide: '', sel: '' };
  let ended = false;
  if (host) peers.set(me.id, { id: me.id, name: me.name, color: CO_COLORS[0], slide: '', sel: '', seen: now(), host: true });

  const call = (fn, ...args) => { try { fn?.(...args); } catch (error) { console.warn(error); } };
  const list = () => [...peers.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, slide: p.slide, sel: p.sel, ...(p.host ? { host: true } : {}), ...(p.id === me.id ? { me: true } : {}) }));
  const tellPeers = () => call(on.peers, list());
  const myHash = () => { if (hashDirty) { hash = stateHash(base); hashDirty = false; } return hash; };
  const setBase = (state) => { base = state; hashDirty = true; };
  const where = (p, m) => { p.slide = typeof m.slide === 'string' ? m.slide.slice(0, 40) : ''; p.sel = typeof m.sel === 'string' ? m.sel.slice(0, 40) : ''; p.seen = now(); };

  // 내가 고친 것을 모아 보낸다. 시작한 사람은 바로 차례 번호를 붙여 나눠 준다.
  function flush() {
    clearTimeout(timer);
    timer = 0;
    if (ended || phase !== 'live' || !base) return;
    const state = doc.read();
    const ops = diffState(base, state);
    setBase(state);
    if (!ops.length) return;
    if (host) { seq++; wire.send({ k: 'commit', seq, by: me.id, ops }); return; }
    n++;
    if (!pending.size) pendingSince = now();
    for (const op of ops) for (const p of placesOf(op)) pending.set(p, n);
    wire.send({ k: 'op', n, name: me.name, ops });
  }
  function changed() {
    if (ended || phase !== 'live') return;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }
  function apply(ops) {
    if (!ops.length) return;
    try { doc.apply(ops); } catch (error) { console.warn(error); }
    setBase(doc.read());
  }

  // 받은 것을 받은 차례대로 끼워 넣는다. 편집기가 바쁘면(끄는 중 · 메뉴) 조금 뒤에 다시 본다.
  async function drain() {
    clearTimeout(drainTimer);
    drainTimer = 0;
    if (draining) return;
    draining = true;
    try {
      while (inbox.length && !ended) {
        const m = inbox[0];
        if (!host && phase === 'waiting' && m.k !== 'full') return;
        if (!doc.ready()) { drainTimer = setTimeout(drain, 120); return; }
        inbox.shift();
        if (m.k === 'op') take(m);
        else if (m.k === 'commit') commit(m);
        else if (m.k === 'full') { if (host) sendFull(m.to); else await full(m); }
      }
    } finally { draining = false; }
  }
  // 시작한 사람: 들어온 사람이 고친 것을 끼워 넣고, 차례 번호를 붙여 모두에게 나눠 준다(보낸 사람에게도: 다 돌아왔는지 안다).
  function take(m) {
    const ops = cleanOps(m.ops);
    flush();                       // 내가 먼저 고친 것이 먼저다
    apply(ops);
    seq++;
    wire.send({ k: 'commit', seq, by: m.from, n: m.n, ops });
  }
  function sendFull(to) {
    flush();
    wire.send({ k: 'full', to, seq, state: { ...base, slides: base.slides.map(shareSlide) }, info: doc.info?.() || {}, peers: list() });
  }
  // 들어온 사람: 시작한 사람이 나눠 준 것을 차례대로 끼워 넣는다.
  function commit(m) {
    if (!(m.seq > seq)) return;
    if (m.seq > seq + 1) { ask(); return; }     // 빠진 것이 있다: 처음부터 다시 받는다
    seq = m.seq;
    flush();                        // 내가 고친 것을 먼저 보내 두어야, 그 자리의 다른 사람 것을 건너뛴다
    if (m.by === me.id) {
      for (const [p, k] of pending) if (k <= m.n) pending.delete(p);
      if (pending.size) pendingSince = now();
      if (!redo.has(m.n)) return;   // 내 화면에는 이미 있다
      redo.delete(m.n);
      apply(cleanOps(m.ops));
      return;
    }
    apply(skipPending(cleanOps(m.ops), pending));
  }
  async function full(m) {
    if (!plain(m.state) || !Array.isArray(m.state.slides)) return;
    const first = phase === 'waiting';
    if (!first) flush();
    phase = 'opening';
    try {
      if (first) await doc.open(m.state, plain(m.info) ? m.info : {});
      else doc.replace(m.state);
    } catch (error) {
      console.warn(error);
      if (first) { call(on.error, String(error?.message || error)); close(); return; }
    }
    clearInterval(helloTimer);
    helloTimer = 0;
    seq = Number(m.seq) || 0;
    redo = new Set(pending.values());
    pending.clear();
    setBase(doc.read());
    phase = 'live';
    seen();
    peersFrom(m.peers);
    here();
    if (first) call(on.status, 'ok');
    // 그림을 받는 동안 온 것 가운데 받은 그림보다 앞선 것은 버린다
    for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i].k === 'commit' && !(inbox[i].seq > seq)) inbox.splice(i, 1);
  }
  function ask() {
    if (host || ended || now() - asked < 5000 || asks >= 8) return;
    asked = now();
    asks++;
    for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i].k === 'commit') inbox.splice(i, 1);
    wire.send({ k: 'sync', name: me.name });
  }
  function seen() {
    hostSeen = now();
    if (!hostOk) { hostOk = true; call(on.status, 'ok'); }
  }
  function peersFrom(raw) {
    if (!Array.isArray(raw)) return;
    const keep = new Set();
    for (const p of raw.slice(0, 40)) {
      if (!plain(p) || typeof p.id !== 'string' || !ID.test(p.id)) continue;
      keep.add(p.id);
      const old = peers.get(p.id);
      peers.set(p.id, { id: p.id, name: cleanName(p.name) || '이름 없음', color: CO_COLORS.includes(p.color) ? p.color : CO_COLORS[1],
        slide: old ? old.slide : (typeof p.slide === 'string' ? p.slide : ''), sel: old ? old.sel : (typeof p.sel === 'string' ? p.sel : ''), seen: now(), ...(p.host ? { host: true } : {}) });
    }
    for (const id of [...peers.keys()]) if (!keep.has(id)) peers.delete(id);
    tellPeers();
  }
  function hostPeers() { wire.send({ k: 'peers', seq, peers: list(), ...(inbox.length || timer || wire.waiting?.() ? {} : { hash: myHash() }) }); }
  function here() {
    clearTimeout(hereTimer);
    hereTimer = 0;
    if (!ended) wire.send({ k: 'here', name: me.name, slide: mine.slide, sel: mine.sel });
  }
  // 시작한 사람: 처음 보는 사람이면 넣는다(인사 없이 고친 것이 먼저 오기도 한다: 창이 뒤에 숨었다 돌아온 사람).
  function welcome(m) {
    const known = peers.get(m.from);
    if (known) { known.seen = now(); if (cleanName(m.name)) known.name = cleanName(m.name); return known; }
    const used = new Set([...peers.values()].map((p) => p.color));
    const color = CO_COLORS.find((c) => !used.has(c)) || CO_COLORS[peers.size % CO_COLORS.length];
    const p = { id: m.from, name: cleanName(m.name) || `친구 ${peers.size}`, color, slide: '', sel: '', seen: now() };
    peers.set(m.from, p);
    call(on.join, { ...p });
    tellPeers();
    hostPeers();
    return p;
  }

  const off = wire.on((m) => {
    if (ended || typeof m.from !== 'string' || !ID.test(m.from) || m.from === me.id) return;
    if (host) {
      if (m.k === 'hello' || m.k === 'sync') { welcome(m); inbox.push({ k: 'full', to: m.from }); drain(); }
      else if (m.k === 'op' && Array.isArray(m.ops)) { welcome(m); inbox.push(m); drain(); }
      else if (m.k === 'here') { where(welcome(m), m); tellPeers(); }
      else if (m.k === 'bye' && peers.has(m.from)) { const p = peers.get(m.from); peers.delete(m.from); call(on.leave, p); tellPeers(); hostPeers(); }
      return;
    }
    // 들어온 사람: 시작한 사람이 보낸 것(full · commit · peers · end)과 다른 사람의 자리(here)
    if (m.k === 'full') { if (m.to === me.id) { inbox.unshift(m); drain(); } return; }
    if (m.k === 'commit') { seen(); inbox.push(m); drain(); return; }
    if (m.k === 'peers') {
      seen();
      if (phase !== 'live') return;
      peersFrom(m.peers);
      // 지문이 다르면 다시 받는다(내 것이 모두 돌아왔고, 같은 차례까지 받았을 때만 견준다)
      if (typeof m.hash === 'string' && m.seq === seq && !pending.size && !inbox.length && !timer && myHash() !== m.hash) ask();
      return;
    }
    if (m.k === 'here') { const p = peers.get(m.from); if (p) { where(p, m); tellPeers(); } return; }
    if (m.k === 'end') end('host');
  });

  if (host) {
    setBase(doc.read());
    beatTimer = setInterval(() => {
      for (const p of [...peers.values()]) if (!p.host && now() - p.seen > lost) { peers.delete(p.id); call(on.leave, p); }
      hostPeers();
      tellPeers();
    }, beat);
  } else {
    const started = now();
    const hello = () => wire.send({ k: 'hello', name: me.name });
    hello();
    helloTimer = setInterval(() => {
      if (phase !== 'waiting') { clearInterval(helloTimer); return; }
      if (now() - started > joinMs) { clearInterval(helloTimer); call(on.error, '시작한 사람의 그림을 받지 못했어요. 시작한 사람의 화면이 열려 있는지 확인하고 링크를 다시 열어 주세요.'); close(); return; }
      hello();
    }, helloEvery);
    beatTimer = setInterval(() => {
      if (phase !== 'live') return;
      if (hostOk && now() - hostSeen > lost) { hostOk = false; call(on.status, 'lost'); }
      // 보낸 것이 오래 돌아오지 않으면(가는 길에 사라졌다) 처음부터 다시 받는다
      if (pending.size && now() - pendingSince > stuckMs) { pending.clear(); ask(); }
      here();
    }, beat);
  }

  function end(reason) {
    if (ended) return;
    ended = true;
    clearTimeout(timer); clearTimeout(drainTimer); clearInterval(beatTimer); clearInterval(helloTimer); clearTimeout(hereTimer);
    inbox.length = 0;
    try { off?.(); } catch { /* 이미 끊겼다 */ }
    call(on.end, reason);
    setTimeout(() => wire.close(), reason === 'closed' ? 400 : 0);   // 마지막 신호가 나갈 틈을 조금 둔다
  }
  function close() {
    if (ended) return;
    try { flush(); } catch (error) { console.warn(error); }
    try { wire.send({ k: host ? 'end' : 'bye' }); } catch { /* 이미 끊겼다 */ }
    end('closed');
  }
  return {
    role,
    get id() { return me.id; },
    changed,
    flush,
    select(slide, sel) {
      const next = { slide: typeof slide === 'string' ? slide : '', sel: typeof sel === 'string' ? sel : '' };
      if (next.slide === mine.slide && next.sel === mine.sel) return;
      mine = next;
      if (host) { const p = peers.get(me.id); p.slide = mine.slide; p.sel = mine.sel; }
      if (!hereTimer && !ended) hereTimer = setTimeout(here, 120);
    },
    /** 다시 알린다(창이 앞으로 돌아왔을 때). */
    ping() { if (ended) return; if (host) hostPeers(); else here(); },
    peers: list,
    /** 그 장(slide)의 그 요소(id)를 다른 사람이 고르고 있으면 그 사람 { name, color }. */
    lockedBy(slide, id) {
      if (!id) return null;
      for (const p of peers.values()) if (p.id !== me.id && p.slide === slide && p.sel === id) return { name: p.name, color: p.color };
      return null;
    },
    live: () => phase === 'live' && !ended,
    close,
  };
}
