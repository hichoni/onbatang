// 온바탕 파일로 받은 글꼴: 이 온바탕에 없는 글꼴(GBE-AI Lab의 학교안심 글꼴 등, 모두 자유 글꼴 사용 허락 OFL)을 파일에서 꺼내 이 기기(브라우저의 IndexedDB)에 두고,
// 온바탕을 열 때마다 글꼴 목록에 더한다. 그래야 그 글꼴로 쓴 글이 처음 기기와 같은 모습으로 보이고, 고쳐도 글꼴이 기본 글꼴로 바뀌지 않는다.
// 글꼴과 함께 받은 사용 허락 글(license)도 같이 둔다.
import { storageName } from './store.js';

const STORE = 'fonts';
let dbJob = null, dbName = '';
const open = () => {
  if (dbName !== `${storageName()}-fonts`) { dbJob = null; dbName = `${storageName()}-fonts`; }
  return dbJob ||= new Promise((resolve, reject) => {
    const q = indexedDB.open(dbName, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
    q.onblocked = () => reject(new Error('blocked'));
  }).catch((ex) => { dbJob = null; throw ex; });
};
const run = async (mode, work) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode), req = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
};

/** 이 기기에 둔 글꼴들 [{ id, name, desc, exportFamily?, family?, license, blob }]. */
export async function listFileFonts() {
  const all = await run('readonly', (s) => s.getAll());
  return (all || []).filter((f) => f && typeof f.id === 'string' && f.blob instanceof Blob);
}
/** 글꼴 하나를 둔다(같은 이름표면 바꾼다). */
export function putFileFont(font) {
  const { id, name = '', desc = '', exportFamily = '', family = '', license = '', blob } = font;
  return run('readwrite', (s) => s.put({ id, name, desc, exportFamily, family, license, blob, at: Date.now() }, id));
}
/** 글꼴 목록에 넣을 모양({ id, name, desc, url(blob:), … }). */
export const fontEntry = (f) => ({ id: f.id, name: f.name || f.id, desc: f.desc || '', ...(f.exportFamily ? { exportFamily: f.exportFamily } : {}), ...(f.family ? { family: f.family } : {}), url: URL.createObjectURL(f.blob), licenseText: f.license || '' });
/**
 * 글꼴 목록에 적힌 글꼴 파일 · 사용 허락 글을 읽는다(온바탕 파일에 담으려고). 이 온바탕과 같은 곳의 파일이나 blob: 주소만 읽고, 인증 정보는 싣지 않는다.
 * kind: 'blob'(글꼴 파일) · 'text'(사용 허락 글)
 */
export async function readFontAsset(url, kind = 'blob') {
  const u = new URL(String(url), location.href);
  if (u.protocol !== 'blob:' && u.origin !== location.origin) throw Error('font_origin');
  const got = await fetch(u.href, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!got.ok) throw Error('font_missing');
  return kind === 'text' ? got.text() : got.blob();
}
