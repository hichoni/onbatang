// Account-free PPTX storage. Source bytes and immutable revisions live outside
// the existing editor database, so enabling imports does not migrate old drawings.
import {isId,cleanAssets,legacyId} from '../../src/document.js';
import {isDesignId,migrateRecord} from '../designs.js';

const fail=code=>{throw Object.assign(Error(code),{code});};
const natural=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const json=v=>JSON.stringify(v,(_,x)=>object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b)=>json(a)===json(b),bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
const content=({revision,updatedAt,...value})=>value;
const key=(id,revision)=>id+':'+revision;
const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
const request=q=>new Promise((yes,no)=>{q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error);});
const stores=['assets','heads','revisions','materials','materialRevisions'];
const sourceMime='application/vnd.openxmlformats-officedocument.presentationml.presentation';

export function createPptxLibrary({storage='minican',indexedDB=globalThis.indexedDB}={}){
 if(!/^[a-z][a-z0-9.-]{0,40}$/.test(storage)||!indexedDB)fail('STORAGE_UNAVAILABLE');
 const name=storage+'-pptx-v1';let opening;
 const open=()=>opening??=new Promise((yes,no)=>{
  const q=indexedDB.open(name,1);q.onupgradeneeded=()=>{for(const store of stores)q.result.createObjectStore(store);};
  q.onsuccess=()=>{q.result.onversionchange=()=>{q.result.close();opening=null;};yes(q.result);};
  q.onerror=()=>{opening=null;no(q.error);};q.onblocked=()=>{opening=null;no(Object.assign(Error('STORAGE_BLOCKED'),{code:'STORAGE_BLOCKED'}));};
 });
 async function transaction(mode,work){
  const db=await open();return new Promise((yes,no)=>{
   const tx=db.transaction(stores,mode);let result,error;
   tx.oncomplete=()=>yes(result);tx.onerror=()=>{};tx.onabort=()=>no(error||tx.error||Error('STORAGE_FAILED'));
   Promise.resolve().then(()=>work(Object.fromEntries(stores.map(s=>[s,tx.objectStore(s)])))).then(value=>{result=value;}).catch(reason=>{error=reason;try{tx.abort();}catch{no(reason);}});
  });
 }
 const reference=({kind,id})=>{if(kind!=='document'||!isDesignId(id))fail('INVALID_REFERENCE');};
 const readRevision=async(s,id,revision)=>{const row=await request(s.revisions.get(key(id,revision)));if(!row)fail('NOT_FOUND');return row;};
 async function validateAssets(s,payload){
  for(const descriptor of payload.assets){const asset=await request(s.assets.get(descriptor.id));if(!asset||!same(asset.descriptor,descriptor))fail('ASSET_MISSING');}
  for(const value of [payload,...payload.slides,...payload.slides.flatMap(p=>p.items)])if(value.source?.assetId&&value.source.sha256&&value.source.sha256!==payload.assets.find(a=>a.id===value.source.assetId)?.sha256)fail('ASSET_INTEGRITY');
 }
 const repository={storageScope:'local',
  async uploadAsset({assetId,kind,mimeType,blob}={}){
   if(!isId(assetId)||kind!=='source'||mimeType!==sourceMime||!(blob instanceof Blob)||blob.size<1||blob.size>52428800||blob.type&&blob.type!==mimeType)fail('INVALID_ASSET');
   const sha256=await hash(blob),[descriptor]=cleanAssets([{id:assetId,kind,mimeType,sha256,byteLength:blob.size,storageKey:'local/'+assetId+'/'+sha256}]);
   return transaction('readwrite',async s=>{const old=await request(s.assets.get(assetId));if(old){if(!same(old.descriptor,descriptor))fail('ASSET_CONFLICT');return old.descriptor;}await request(s.assets.add({descriptor,blob:new Blob([blob],{type:mimeType})},assetId));return descriptor;});
  },
  async readAsset(id){const asset=await transaction('readonly',s=>request(s.assets.get(id)));if(!asset)fail('ASSET_MISSING');if(asset.blob.size!==asset.descriptor.byteLength||await hash(asset.blob)!==asset.descriptor.sha256)fail('ASSET_INTEGRITY');return asset.blob;},
  async getAsset(id){const asset=await transaction('readonly',s=>request(s.assets.get(id)));if(!asset)fail('ASSET_MISSING');return asset.descriptor;},
  async saveRevision({kind,id,payload,expectedRevision,sidecar={}}={}){
   reference({kind,id});if(expectedRevision!==null&&!natural(expectedRevision))fail('INVALID_EXPECTED_REVISION');
   if(expectedRevision===2147483647)fail('REVISION_LIMIT');
   if(!object(sidecar)||bytes(sidecar)>65536)fail('INVALID_SIDECAR');
   const revision=expectedRevision===null?0:expectedRevision+1,clean=migrateRecord({...payload,revision});
   if(clean.id!==id||bytes(clean)>524288)fail('REVISION_TOO_LARGE');
   return transaction('readwrite',async s=>{
    const head=await request(s.heads.get(id));if((head?.revision??null)!==expectedRevision)fail('REVISION_CONFLICT');await validateAssets(s,clean);
    const row={kind,id,revision,payload:clean,sidecar:structuredClone(sidecar),createdAt:new Date().toISOString()};
    await request(s.revisions.add(row,key(id,revision)));await request(s.heads.put({id,revision},id));return row;
   });
  },
  async getRevision({kind,id,revision}={}){reference({kind,id});if(!natural(revision))fail('INVALID_REVISION');return transaction('readonly',s=>readRevision(s,id,revision));},
  async getHead({kind,id}={}){reference({kind,id});return transaction('readonly',async s=>{const head=await request(s.heads.get(id));if(!head)fail('NOT_FOUND');return readRevision(s,id,head.revision);});},
  async listHeads(){return transaction('readonly',async s=>{const all=await request(s.heads.getAll());return Promise.all(all.map(head=>readRevision(s,head.id,head.revision)));});}
 };
 async function graph(s,ref){
  if(!isId(ref?.id)||!natural(ref.revision))fail('INVALID_MATERIAL');
  const manifest=await request(s.materialRevisions.get(key(ref.id,ref.revision)));if(!manifest)fail('NOT_FOUND');
  const documents=await Promise.all(manifest.parts.map(part=>readRevision(s,part.documentId,part.revision))),pages=[];
  for(const [index,part]of manifest.parts.entries()){
   const row=documents[index];if(row.payload.slides.length!==part.pages.length)fail('MATERIAL_MISMATCH');
   for(const [pageIndex,entry]of part.pages.entries()){
    const page=row.payload.slides[pageIndex],sourcePageNumber=typeof entry==='number'?entry:entry.sourcePageNumber;
    if(object(entry)&&entry.pageId!==page.id)fail('MATERIAL_MISMATCH');
    pages.push({index:pages.length,pageNumber:sourcePageNumber,document:row,page,partIndex:index,pageIndex});
   }
  }
  return {materialRef:{id:manifest.id,revision:manifest.revision},manifest,documents,pages};
 }
 async function ensureMaterial(result){
  if(!result?.complete||!isId(result.batchId)||!result.documents?.length||!Array.isArray(result.parts))fail('IMPORT_INCOMPLETE');
  const id=legacyId('m',result.batchId);
  return transaction('readwrite',async s=>{
   const old=await request(s.materials.get(id));if(old)return graph(s,{id,revision:old.revision});
   const parts=result.parts.map(part=>{const row=result.documents.find(row=>row.id===part.documentId);if(!row||!part.pages?.length||row.payload.slides.length!==part.pages.length||part.pages.some(n=>!Number.isSafeInteger(n)||n<1))fail('INVALID_MATERIAL');return {documentId:row.id,revision:row.revision,pages:part.pages.map((n,i)=>({pageId:row.payload.slides[i].id,sourcePageNumber:n}))};});
   const selected=parts.flatMap(p=>p.pages.map(page=>page.sourcePageNumber));if(new Set(selected).size!==selected.length||selected.length!==result.pageCount)fail('MATERIAL_MISMATCH');
   for(const part of parts)await readRevision(s,part.documentId,part.revision);
   const row={id,revision:0,batchId:result.batchId,title:result.documents[0].payload.source.filename.replace(/\.pptx$/i,''),sourceAssetId:result.documents[0].payload.source.assetId,parts};
   await request(s.materialRevisions.add(row,key(id,0)));await request(s.materials.put({id,revision:0},id));return graph(s,{id,revision:0});
  });
 }
 async function getMaterial(ref){return transaction('readonly',async s=>{if(ref.revision===undefined){const head=await request(s.materials.get(ref.id));if(!head)fail('NOT_FOUND');ref={id:ref.id,revision:head.revision};}return graph(s,ref);});}
 async function listMaterials(){return transaction('readonly',async s=>{const heads=await request(s.materials.getAll());return Promise.all(heads.map(head=>graph(s,head)));});}
 async function pinEdits({materialRef,drafts=[]}={}){
  if(!Array.isArray(drafts))fail('INVALID_DRAFTS');const cleaned=new Map(drafts.filter(Boolean).map(row=>{const clean=migrateRecord(row);return [clean.id,clean];}));
  return transaction('readwrite',async s=>{
   const materialHead=await request(s.materials.get(materialRef.id));if(materialHead?.revision!==materialRef.revision)fail('REVISION_CONFLICT');
   if(materialHead.revision===2147483647)fail('REVISION_LIMIT');
   const old=await graph(s,materialRef),parts=[];let changed=false;
   for(const [index,part]of old.manifest.parts.entries()){
    const base=old.documents[index],draft=cleaned.get(base.id);if(!draft||same(content(draft),content(base.payload))){parts.push(part);continue;}
    for(const field of ['id','source','originalSize','assets','assetRefs','origin'])if(!same(draft[field],base.payload[field]))fail('SOURCE_CHANGED');
    const head=await request(s.heads.get(base.id));if(head?.revision!==base.revision)fail('REVISION_CONFLICT');
    if(base.revision===2147483647)fail('REVISION_LIMIT');
    const payload=migrateRecord({...draft,revision:base.revision+1});if(bytes(payload)>524288)fail('REVISION_TOO_LARGE');
    await validateAssets(s,payload);const row={...base,revision:payload.revision,payload,createdAt:new Date().toISOString()};
    await request(s.revisions.add(row,key(base.id,row.revision)));await request(s.heads.put({id:base.id,revision:row.revision},base.id));parts.push({...part,revision:row.revision,pages:payload.slides.map(page=>({pageId:page.id,sourcePageNumber:page.source?.assetId===old.manifest.sourceAssetId?page.source.pageNumber??null:null}))});changed=true;
   }
   if(!changed)return old;
   const manifest={...old.manifest,revision:old.manifest.revision+1,parts};
   await request(s.materialRevisions.add(manifest,key(manifest.id,manifest.revision)));await request(s.materials.put({id:manifest.id,revision:manifest.revision},manifest.id));return graph(s,{id:manifest.id,revision:manifest.revision});
  });
 }
 return Object.freeze({repository,ensureMaterial,getMaterial,listMaterials,pinEdits,async close(){if(opening){(await opening).close();opening=null;}}});
}
