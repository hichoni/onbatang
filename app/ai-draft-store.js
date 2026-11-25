// 사진과 생성 결과가 든 발표 초안은 작은 localStorage 대신 IndexedDB에 둔다.
// key에는 호스트가 정한 계정·문서 이름표가 포함된다. 다른 작업/로그인 자료는 건드리지 않는다.
const pending=new Map();
let database;
const open=()=>database||=new Promise((resolve,reject)=>{
 const q=indexedDB.open('onbatang-native-ai-drafts-v1',1);let failed=false;
 q.onupgradeneeded=()=>q.result.createObjectStore('drafts');
 q.onsuccess=()=>{if(failed){q.result.close();return;}q.result.onversionchange=()=>{q.result.close();database=null;};resolve(q.result);};
 q.onerror=q.onblocked=()=>{failed=true;reject(q.error||Error('draft storage unavailable'));};
}).catch(e=>{database=null;throw e;});
async function run(key,mode,value){
 const db=await open();return new Promise((resolve,reject)=>{
  const tx=db.transaction('drafts',mode),store=tx.objectStore('drafts');
  const q=mode==='readonly'?store.get(key):store.put(value,key);
  tx.oncomplete=()=>resolve(q.result);tx.onabort=tx.onerror=()=>reject(tx.error||q.error||Error('draft storage failed'));
 });
}
function legacy(key){try{return localStorage.getItem(key);}catch{return null;}}
function removeLegacy(key,value){try{if(localStorage.getItem(key)===value)localStorage.removeItem(key);}catch{}}
export function aiDraftStore(key){
 const write=value=>{
  if(!key)return Promise.resolve();
  const copy=structuredClone(value),old=legacy(key);
  const job=(pending.get(key)||Promise.resolve()).catch(()=>{}).then(()=>run(key,'readwrite',copy)).then(()=>removeLegacy(key,old));
  pending.set(key,job);void job.finally(()=>{if(pending.get(key)===job)pending.delete(key);}).catch(()=>{});return job;
 };
 return {write,async read(){
  if(!key)return null;
  await pending.get(key)?.catch(()=>{});
  const stored=await run(key,'readonly');if(stored!==undefined)return stored;
  const text=legacy(key);if(!text)return null;
  const value=JSON.parse(text);await write(value);return value;
 }};
}
