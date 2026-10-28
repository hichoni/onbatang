// 발표하며 녹음한 목소리 파일을 이 기기(브라우저의 IndexedDB)에 둔다. 서버로는 보내지 않는다.
// 한 번 녹음한 발표는 한 파일이고, 장마다 그 파일의 구간을 적는다(장의 voice: { src, at, ms, steps }. src/document.js 의 cleanVoice).
// 파일마다 그것을 녹음한 그림의 이름표(design)를 함께 적어 둔다. 다시 녹음하거나 그림을 지웠을 때 쓰지 않게 된 파일을 찾아 지우려고 쓴다
// (무엇을 지워도 되는지는 영상 파일과 같은 규칙: designs.js 의 unusedVideos · deckVoices).

import { storageName } from './store.js';

const STORE = 'voices';
let dbJob = null;
let dbName = '';
// 저장소의 이름은 그림 저장소(store.js)의 이름 뒤에 '-voices' 를 붙인 것이다. 이름이 바뀌면 새로 연다.
const open = () => {
  if (dbName !== `${storageName()}-voices`) { dbJob = null; dbName = `${storageName()}-voices`; }
  return (dbJob ||= new Promise((resolve, reject) => {
    const q = indexedDB.open(dbName, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
    q.onblocked = () => reject(new Error('blocked'));
  }).catch((ex) => { dbJob = null; throw ex; }));
};
const run = async (mode, work) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
};

/** 새 녹음 파일의 열쇠('a' + 시각 + 무작위 여섯 글자). */
export function newVoiceKey(now = Date.now(), rand = Math.random()) {
  return `a${now.toString(36)}${Math.floor(rand * 36 ** 6).toString(36).padStart(6, '0')}`;
}
/** 녹음 파일을 저장하고 열쇠를 돌려준다. 저장하지 못하면(공간 부족 등) 오류를 낸다: 그때는 장에 녹음을 적지 않는다. */
export async function saveVoice({ blob, design = '', seconds = 0 }) {
  const key = newVoiceKey();
  await run('readwrite', (s) => s.put({ blob, design: String(design || ''), seconds: Number(seconds) || 0, bytes: blob.size, at: Date.now() }, key));
  return key;
}
/** 녹음 파일(Blob). 이 기기에 없으면 null. */
export async function loadVoice(key) {
  try {
    const got = await run('readonly', (s) => s.get(key));
    return got?.blob instanceof Blob ? got.blob : null;
  } catch (ex) {
    console.warn(ex);
    return null;
  }
}
/** 이 기기에 있는 녹음 파일들 [{ key, design, bytes, at }] (파일의 내용은 읽지 않는다). */
export async function listVoices() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out = [];
    const tx = db.transaction(STORE, 'readonly');
    const q = tx.objectStore(STORE).openCursor();
    q.onsuccess = () => {
      const c = q.result;
      if (!c) return;
      const v = c.value || {};
      out.push({ key: String(c.key), design: typeof v.design === 'string' ? v.design : '', bytes: Number(v.bytes) || 0, at: Number(v.at) || 0 });
      c.continue();
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
}
/** 녹음 파일들을 지운다. */
export async function removeVoices(keys) {
  const list = [...new Set(keys)];
  if (!list.length) return;
  await run('readwrite', (s) => { for (const key of list) s.delete(key); });
}
