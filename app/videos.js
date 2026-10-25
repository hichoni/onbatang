// 미니캔의 영상 장면 파일을 이 기기(브라우저의 IndexedDB)에 둔다. 서버로는 보내지 않는다.
// 그림(슬라이드)에는 파일의 열쇠와 쓰는 구간만 적힌다. 그래서 영상은 넣은 기기에서만 보인다
// (그림 파일을 다른 곳으로 옮겨 열면 영상 자리에 "이 기기에는 영상이 없어요"가 보인다).
//
// 파일마다 그것을 넣은 그림의 이름표(design)를 함께 적어 둔다. 그 그림에서 영상을 빼거나 그림을 지웠을 때, 딸린 파일을 찾아 지우려고 쓴다
// (무엇을 지워도 되는지는 designs.js 의 unusedVideos 가 정한다).

import { storageName } from './store.js';

const STORE = 'videos';

// 저장소의 이름은 그림 저장소(store.js)의 이름 뒤에 '-videos' 를 붙인 것이다. 이름이 바뀌면 새로 연다.
let dbJob = null;
let dbName = '';
const open = () => {
  if (dbName !== `${storageName()}-videos`) { dbJob = null; dbName = `${storageName()}-videos`; }
  return openDb(dbName);
};
const openDb = (name) => (dbJob ||= new Promise((resolve, reject) => {
  const q = indexedDB.open(name, 1);
  q.onupgradeneeded = () => q.result.createObjectStore(STORE);
  q.onsuccess = () => resolve(q.result);
  q.onerror = () => reject(q.error);
  q.onblocked = () => reject(new Error('blocked'));
}).catch((ex) => { dbJob = null; throw ex; }));
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

/** 새 영상 파일의 열쇠('v' + 시각 + 무작위 여섯 글자). */
export function newVideoKey(now = Date.now(), rand = Math.random()) {
  return `v${now.toString(36)}${Math.floor(rand * 36 ** 6).toString(36).padStart(6, '0')}`;
}

/**
 * 영상 파일을 이 기기에 저장하고 그 열쇠를 돌려준다. design: 그 영상을 넣은 그림의 이름표.
 * 저장하지 못하면(공간 부족 · 저장할 수 없는 창) 오류를 낸다. 그때는 영상을 넣지 않는다:
 * 저장되지 않은 영상을 그림에 적어 두면, 새로 고침한 뒤에 영상만 사라진 그림이 남기 때문이다.
 */
export async function saveVideo({ blob, design = '', seconds = 0 }) {
  const key = newVideoKey();
  await run('readwrite', (s) => s.put({ blob, design: String(design || ''), seconds: Number(seconds) || 0, bytes: blob.size, at: Date.now() }, key));
  return key;
}

/**
 * 영상 파일을 받은 열쇠 그대로 둔다(온바탕 파일에서 연 것: 그림에 적힌 열쇠를 바꾸지 않으려고).
 * 같은 열쇠의 같은 크기 파일이 이미 있으면(같은 영상) 다시 쓰지 않는다. 새로 적었으면 true.
 */
export async function placeVideo({ key, blob, design = '', seconds = 0, at = 0 }) {
  const old = await run('readonly', (s) => s.get(key));
  if (old?.blob instanceof Blob && old.blob.size === blob.size) return false;
  await run('readwrite', (s) => s.put({ blob, design: String(design || ''), seconds: Number(seconds) || 0, bytes: blob.size, at: Number(at) || Date.now() }, key));
  return true;
}

/** 영상 파일(Blob). 이 기기에 없으면 null. */
export async function loadVideo(key) {
  try {
    const got = await run('readonly', (s) => s.get(key));
    return got?.blob instanceof Blob ? got.blob : null;
  } catch (ex) {
    console.warn(ex);
    return null;
  }
}

/** 이 기기에 있는 영상 파일들 [{ key, design, bytes, at }] (파일의 내용은 읽지 않는다). */
export async function listVideos() {
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

/** 영상 파일들을 지운다. */
export async function removeVideos(keys) {
  const list = [...new Set(keys)];
  if (!list.length) return;
  await run('readwrite', (s) => { for (const key of list) s.delete(key); });
}
