// 미니캔의 그림들을 이 기기(브라우저의 IndexedDB)에 저장한다. 서버로는 아무것도 보내지 않는다.
// 저장소의 이름은 미니캔을 들여 쓰는 곳이 정할 수 있다(setStorageName). 영상 파일(videos.js)은 그 이름 뒤에 '-videos' 를 붙인 저장소에 둔다.
import { migrateRecord, sortRecords, DocumentError } from './designs.js';

let NAME = 'minican';
let dbJob = null;
const STORE = 'designs';
const ORIGINALS = 'originals';
let issues = [];
export const listDesignIssues = () => issues.slice();
// 아주 옛 모양(schemaVersion 없음)으로 적혀 있는 그림들. 이것을 덮어쓸 때는 원본을 먼저 따로 둔다(putDesign).
const legacy = new Set();
const NAME_RULE = /^[a-z][a-z0-9.-]{0,40}$/;

/** 저장소의 이름을 정한다. 앱을 시작하기 전에 한 번 부른다. */
export function setStorageName(name) {
  if (!NAME_RULE.test(name)) throw new Error('storage name');
  NAME = name;
  dbJob = null;
}
export const storageName = () => NAME;

const open = () => (dbJob ||= new Promise((resolve, reject) => {
  const q = indexedDB.open(NAME, 2);
  q.onupgradeneeded = () => {
    if (!q.result.objectStoreNames.contains(STORE)) q.result.createObjectStore(STORE);
    if (!q.result.objectStoreNames.contains(ORIGINALS)) q.result.createObjectStore(ORIGINALS);
  };
  q.onsuccess = () => resolve(q.result);
  q.onerror = () => reject(q.error);
  q.onblocked = () => reject(new Error('blocked'));
}).catch((ex) => { dbJob = null; throw ex; }));
// commit: 할 일을 다 건 뒤 바로 마친다(창이 사라져도 이미 마친 쓰기는 남는다). 끝을 알리는 곳을 단 다음에 마친다.
const run = async (mode, work, stores = [STORE], { commit = false } = {}) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const req = work(tx.objectStore(stores[0]), tx);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
    if (commit) queueMicrotask(() => { try { tx.commit?.(); } catch { /* 이미 끝났거나 멈춘 일 */ } });
  });
};

/** 이 기기의 그림들(최근에 고친 것부터). 모양이 이상한 것은 뺀다. */
export async function listDesigns() {
  const all = await run('readonly', (s) => s.getAll());
  issues = [];
  const records = [];
  for (const raw of all || []) {
    if (raw?.id && raw.schemaVersion === undefined) legacy.add(raw.id);
    try { records.push(migrateRecord(raw)); }
    catch (error) {
      if (!(error instanceof DocumentError)) throw error;
      issues.push({ id: raw?.id, name: raw?.name, code: error.code, path: error.path });
    }
  }
  return sortRecords(records);
}
/** 그림 하나(없으면 null). */
export async function getDesign(id) {
  const raw = await run('readonly', (s) => s.get(id));
  if (!raw) return null;
  if (raw.schemaVersion === undefined) legacy.add(id);
  const clean = migrateRecord(raw);
  if (raw.schemaVersion === undefined) await putDesign(clean);
  return clean;
}
/** Raw recovery export: includes fields an older sanitizer did not understand. */
export async function getOriginalDesign(id) {
  return (await run('readonly', s => s.get(id), [ORIGINALS])) ?? await run('readonly', s => s.get(id));
}
/**
 * 저장(같은 이름표면 덮어쓴다).
 * 곧바로 쓰고 바로 마친다(commit): 먼저 읽고 그 결과를 받은 뒤에 쓰면, 그 사이에 창을 새로 고치거나 닫을 때 저장이 버려지고
 * 그 뒤에 줄 선 저장까지 함께 버려진다. 아주 옛 모양(schemaVersion 없음)의 그림만 원본을 먼저 따로 두려고 읽은 뒤에 쓴다.
 */
export async function putDesign(record) {
  const clean = migrateRecord(record);
  if (record.schemaVersion !== undefined && !legacy.has(clean.id)) {
    await run('readwrite', (s) => s.put(clean, clean.id), [STORE], { commit: true });
    return clean;
  }
  await run('readwrite', (s, tx) => {
    const q = s.get(clean.id);
    q.onsuccess = () => {
      try {
      const previous = q.result;
      const original = previous && previous.schemaVersion === undefined ? previous : record.schemaVersion === undefined ? record : null;
      if (original) {
        const originals = tx.objectStore(ORIGINALS), backup = originals.get(clean.id);
        backup.onsuccess = () => { try { if (backup.result === undefined) originals.put(original, clean.id); } catch { tx.abort(); } };
      }
      s.put(clean, clean.id);
      } catch { tx.abort(); }
    };
    return q;
  }, [STORE, ORIGINALS]);
  legacy.delete(clean.id);
  return clean;
}
/** Replace a draft only if it is still the snapshot that was pinned. */
export async function replaceDesignIfUnchanged(record, expected) {
  const canonical=value=>JSON.stringify(value,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
  const clean=migrateRecord(record),before=expected?migrateRecord(expected):null,db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),q=store.get(clean.id);let result,error;
    q.onsuccess=()=>{try{
      const current=q.result?migrateRecord(q.result):null;
      if(canonical(current)!==canonical(before))throw Error('DRAFT_CHANGED');
      const revision=Math.max(current?.revision||0,clean.revision)+1;
      if(!Number.isSafeInteger(revision))throw Error('REVISION_LIMIT');
      result={...clean,revision,updatedAt:Date.now()};
      store.put(result,result.id);
    }catch(ex){error=ex;tx.abort();}};
    tx.oncomplete=()=>resolve(result);
    tx.onerror=tx.onabort=()=>reject(error||tx.error||Error('DRAFT_SAVE_FAILED'));
  });
}
/** 지우기. */
export function removeDesign(id) {
  return run('readwrite', (s) => s.delete(id));
}
