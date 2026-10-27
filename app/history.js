// 버전 기록: 그림마다 예전 판을 이 기기(브라우저의 IndexedDB '<저장소 이름>-history')에 쌓아 둔다. 서버로는 보내지 않는다.
// 판은 그림을 열 때('open'), 고치는 동안 10분마다('auto'), 예전 판으로 되돌리기 직전('before')과 직후('restored')에 남긴다.
// 내용이 바로 앞 판과 같으면 새로 남기지 않는다(sig: 내용의 SHA-256).
// 사진(data 주소)은 판마다 따로 두지 않고 assets 칸에 한 번만 두고(열쇠: SHA-256), 판에는 그 열쇠만 적는다. 몇 판이 쓰는지 세어(n)
// 아무 판도 쓰지 않게 되면 지운다. 그림마다 최근 20판 + 그 앞 날마다 한 판, 모두 30판까지 둔다(versionsToDrop).
import { migrateRecord } from './designs.js';
import { storageName } from './store.js';

export const HISTORY_LIMIT = 30;                 // 그림 한 편에 두는 판 수
export const HISTORY_RECENT = 20;                // 그 가운데 최근 판(나머지는 그 앞 날마다 한 판)
export const HISTORY_GAP = 10 * 60 * 1000;       // 고치는 동안 판을 남기는 간격
export const HISTORY_REASONS = { open: '열었을 때', auto: '고치는 중 자동 기록', before: '되돌리기 전', restored: '되돌린 판' };
const ASSET = 'onbatang-history-asset:';
const ASSET_RULE = /^onbatang-history-asset:([a-f0-9]{64})$/;
const BIG = 512;                                  // 이만큼 긴 data 주소만 따로 둔다
const VERSIONS = 'versions', ASSETS = 'assets';

// ---------- 순수 함수(시험에서 바로 쓴다) ----------
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const seen = new Map();                           // 같은 사진을 매번 다시 재지 않게(최근 것 몇백 개)
export async function sha256(text) {
  const known = seen.get(text);
  if (known) return known;
  const sum = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  if (text.length >= BIG) { seen.set(text, sum); if (seen.size > 300) seen.delete(seen.keys().next().value); }
  return sum;
}
/** 값 안의 긴 data 주소를 열쇠로 바꾼다. assets 에 열쇠 → data 주소를 모은다. */
export async function packValue(value, assets) {
  if (typeof value === 'string') {
    if (value.length < BIG || !value.startsWith('data:')) return value;
    const sum = await sha256(value);
    assets.set(sum, value);
    return ASSET + sum;
  }
  if (Array.isArray(value)) { const out = []; for (const v of value) out.push(await packValue(v, assets)); return out; }
  if (value && typeof value === 'object') { const out = {}; for (const [k, v] of Object.entries(value)) out[k] = await packValue(v, assets); return out; }
  return value;
}
/** packValue 를 되돌린다. 없는 열쇠가 있으면 MISSING_ASSET. */
export function unpackValue(value, assets) {
  if (typeof value === 'string') {
    const m = ASSET_RULE.exec(value);
    if (!m) return value;
    if (!assets.has(m[1])) { const error = new Error('이 판의 사진을 찾지 못했어요.'); error.code = 'MISSING_ASSET'; throw error; }
    return assets.get(m[1]);
  }
  if (Array.isArray(value)) return value.map((v) => unpackValue(v, assets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unpackValue(v, assets)]));
  return value;
}
// 판의 "내용": 이것이 같으면 같은 판이다(이름 · 고친 때 · 차례 번호는 빼고 본다).
const CONTENT = ['size', 'originalSize', 'ratio', 'slides', 'uploads', 'assets', 'assetRefs'];
const contentOf = (record) => Object.fromEntries(CONTENT.filter((k) => record[k] !== undefined).map((k) => [k, record[k]]));
/** 그림 → 판에 적을 것: { body(사진을 열쇠로 바꾼 그림), sig, refs(쓰는 사진 열쇠들), assets(열쇠 → data 주소) } */
export async function packRecord(raw) {
  const record = migrateRecord(raw), assets = new Map();
  const body = await packValue(record, assets);
  const sig = await sha256(JSON.stringify(contentOf(body)));
  return { record, body, sig, refs: [...assets.keys()], assets };
}
/** 지금 그림(current)에 예전 판(old)의 내용을 되살린 그림. 이름 · 출처 · 계정 이음은 지금 것을 두고, 차례 번호를 올린다. */
export function restoredRecord(current, old, now = Date.now()) {
  const next = { ...current, revision: (Number(current.revision) || 0) + 1, updatedAt: now };
  for (const k of CONTENT) { if (old[k] === undefined) delete next[k]; else next[k] = structuredClone(old[k]); }
  return migrateRecord(next);
}
const dayKey = (at) => { const d = new Date(at); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
/** 남길 판 고르기: 최근 recent 판은 모두, 그 앞은 날마다 가장 늦은 한 판, 모두 limit 판까지. 지울 판의 key 들을 돌려준다. */
export function versionsToDrop(list, { limit = HISTORY_LIMIT, recent = HISTORY_RECENT } = {}) {
  const sorted = [...list].sort((a, b) => b.at - a.at || b.key - a.key);
  const keep = new Set(sorted.slice(0, recent).map((v) => v.key)), days = new Set(sorted.slice(0, recent).map((v) => dayKey(v.at)));
  for (const v of sorted.slice(recent)) {
    if (keep.size >= limit) break;
    const day = dayKey(v.at);
    if (!days.has(day)) { days.add(day); keep.add(v.key); }
  }
  return sorted.filter((v) => !keep.has(v.key)).map((v) => v.key);
}
const AMPM = (d) => `${d.getHours() < 12 ? '오전' : '오후'} ${(d.getHours() % 12) || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
/** 판의 때: "오늘 오후 3:12" · "어제 오전 9:05" · "10월 25일(토) 오후 2:00" · 해가 다르면 "2025년 10월 25일 …". */
export function whenLabel(at, now = Date.now()) {
  const d = new Date(at), today = new Date(now), y = new Date(now); y.setDate(y.getDate() - 1);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return `오늘 ${AMPM(d)}`;
  if (same(d, y)) return `어제 ${AMPM(d)}`;
  const day = `${d.getMonth() + 1}월 ${d.getDate()}일(${'일월화수목금토'[d.getDay()]})`;
  return `${d.getFullYear() === today.getFullYear() ? '' : `${d.getFullYear()}년 `}${day} ${AMPM(d)}`;
}

// ---------- 이 기기의 저장소 ----------
let dbJob = null, dbName = '';
const lastAt = new Map();                          // 그림 → 마지막 판의 때(10분 간격을 볼 때 다시 읽지 않게)
function open() {
  const name = `${storageName()}-history`;
  if (dbJob && dbName === name) return dbJob;
  dbName = name; lastAt.clear();
  return (dbJob = new Promise((resolve, reject) => {
    const q = indexedDB.open(name, 1);
    q.onupgradeneeded = () => {
      const db = q.result;
      if (!db.objectStoreNames.contains(VERSIONS)) db.createObjectStore(VERSIONS, { keyPath: 'key', autoIncrement: true }).createIndex('design', 'design');
      if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS);
    };
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
    q.onblocked = () => reject(new Error('blocked'));
  }).catch((error) => { dbJob = null; throw error; }));
}
// 한 거래(transaction) 안에서 일을 걸고, 다 끝나면 out() 을 돌려준다.
async function run(mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([VERSIONS, ASSETS], mode);
    let out;
    try { out = work(tx.objectStore(VERSIONS), tx.objectStore(ASSETS), tx); } catch (error) { try { tx.abort(); } catch { /* 이미 끝남 */ } reject(error); return; }
    tx.oncomplete = () => resolve(typeof out === 'function' ? out() : out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
}
// 사진 열쇠마다 쓰는 판 수를 더하거나 뺀다(같은 열쇠는 한 번에 모아서). 0 이 되면 지운다.
function count(assets, changes, data = new Map()) {
  for (const [sum, by] of changes) {
    const q = assets.get(sum);
    q.onsuccess = () => {
      const n = (q.result?.n || 0) + by;
      if (n <= 0) assets.delete(sum);
      else if (q.result) assets.put({ data: q.result.data, n }, sum);
      else if (data.has(sum)) assets.put({ data: data.get(sum), n }, sum);
    };
  }
}
function forget(versions, assets, list) {
  const changes = new Map();
  for (const v of list) { versions.delete(v.key); for (const sum of v.refs || []) changes.set(sum, (changes.get(sum) || 0) - 1); }
  count(assets, changes);
}

/**
 * 판 하나를 남긴다. 바로 앞 판과 내용이 같으면 남기지 않는다(null). gap 을 주면 앞 판이 그만큼 지나지 않았을 때도 남기지 않는다.
 * 남겼으면 { key, at, reason }. 오래된 판은 versionsToDrop 대로 지운다.
 */
export async function addVersion(raw, reason, { gap = 0, now = Date.now(), from = 0 } = {}) {
  if (!HISTORY_REASONS[reason]) throw new Error('reason');
  const design = raw?.id;
  if (gap && lastAt.has(design) && now - lastAt.get(design) < gap) return null;
  const packed = await packRecord(raw);
  return run('readwrite', (versions, assets) => {
    let made = null;
    const index = versions.index('design'), q = index.openCursor(IDBKeyRange.only(design), 'prev');
    q.onsuccess = () => {
      const latest = q.result?.value;
      if (latest && (latest.sig === packed.sig || (gap && now - latest.at < gap))) { lastAt.set(design, latest.sig === packed.sig && gap ? now : latest.at); return; }
      count(assets, new Map(packed.refs.map((sum) => [sum, 1])), packed.assets);
      const version = { design, at: now, reason, sig: packed.sig, name: packed.record.name, pages: packed.record.slides.length, revision: packed.record.revision, refs: packed.refs, body: packed.body, ...(from ? { from } : {}) };
      const add = versions.add(version);
      add.onsuccess = () => { made = { key: add.result, at: now, reason }; lastAt.set(design, now); };
      const all = index.getAll(IDBKeyRange.only(design));
      all.onsuccess = () => {
        const drop = new Set(versionsToDrop(all.result));
        forget(versions, assets, all.result.filter((v) => drop.has(v.key)));
      };
    };
    return () => made;
  });
}
/** 그 그림의 판들(새것부터). 사진은 아직 넣지 않은 채로(목록에 쓴다). */
export async function listVersions(design) {
  const list = await run('readonly', (versions) => { const q = versions.index('design').getAll(IDBKeyRange.only(design)); return () => q.result || []; });
  return list.sort((a, b) => b.at - a.at || b.key - a.key);
}
/** 판 하나를 그림으로 되살린다(사진까지 넣어서). 없으면 null. */
export async function readVersion(key) {
  const got = await run('readonly', (versions, assets) => {
    const out = { version: null, assets: new Map() };
    const q = versions.get(key);
    q.onsuccess = () => {
      out.version = q.result || null;
      for (const sum of out.version?.refs || []) { const a = assets.get(sum); a.onsuccess = () => { if (a.result) out.assets.set(sum, a.result.data); }; }
    };
    return () => out;
  });
  if (!got.version) return null;
  return { ...got.version, record: migrateRecord(unpackValue(got.version.body, got.assets)) };
}
/** 그 그림의 판을 모두 지운다(그림을 지울 때). */
export async function dropHistory(design) {
  lastAt.delete(design);
  await run('readwrite', (versions, assets) => {
    const all = versions.index('design').getAll(IDBKeyRange.only(design));
    all.onsuccess = () => forget(versions, assets, all.result);
  });
}
/** 이 기기에 없는 그림(다른 기기에서 지웠거나 옛 그림)의 판을 지운다. keep: 남길 그림 id 들. */
export async function pruneHistory(keep) {
  const ids = new Set(keep);
  const designs = await run('readonly', (versions) => {
    const found = new Set(), q = versions.index('design').openKeyCursor();
    q.onsuccess = () => { const c = q.result; if (!c) return; found.add(c.key); c.continue(); };
    return () => found;
  });
  for (const design of designs) if (!ids.has(design)) await dropHistory(design);
}
