import {importConvertedDocument} from '../import-document.js';
import {migrateRecord,isDesignId} from '../designs.js';
import {cleanAssets,isId,isObject,DOCUMENT_LIMITS} from '../../src/document.js';

/** Errors retain the caller's conversion data and Blob; recovery does not claim permanent storage. */
export class OnbatangImportStorageError extends Error {
  constructor(code,{stage,original,recovery,cause,path,details}={}) {
    super(`${code}: ${stage}`,cause?{cause}:undefined);
    this.name='OnbatangImportStorageError';this.code=code;this.stage=stage;
    this.original=original;this.recovery=recovery;
    if(path!==undefined)this.path=path;
    if(details!==undefined)this.details=details;
  }
}
const fail=(code,details)=>{throw Object.assign(new Error(code),{code,details});};
const natural=n=>Number.isSafeInteger(n)&&n>=0;
const clone=v=>JSON.parse(JSON.stringify(v));
const ordered=v=>Array.isArray(v)?v.map(ordered):isObject(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const equal=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const withoutRevision=record=>{const {revision,...rest}=record;return rest;};
// Host import details live in the sidecar. The common document contract stays unchanged.
function importDetails(original,report) {
  const text=(v,max=240)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
  const inPage=n=>Number.isSafeInteger(n)&&original.selectedPages.includes(n);
  const checkRows=(key,check)=>{
    if(original[key]===undefined)return;
    if(!Array.isArray(original[key])||original[key].length>800||original[key].some(row=>!isObject(row)||!check(row)))fail('INVALID_IMPORT_REPORT');
    report[key]=clone(original[key].filter(row=>report.selectedPages.includes(row.pageNumber)));
  };
  checkRows('fontUsage',row=>isId(row.elementId)&&inPage(row.pageNumber)&&text(row.originalName)
    &&(row.appliedTypeface===undefined||text(row.appliedTypeface))
    &&(row.originalNames===undefined||Array.isArray(row.originalNames)&&row.originalNames.length<=64&&row.originalNames.every(name=>text(name))));
  checkRows('fontChanges',row=>isId(row.elementId)&&inPage(row.pageNumber)&&text(row.from)&&text(row.to,64));
  if(original.importModes!==undefined){
    if(!isObject(original.importModes)||Object.entries(original.importModes).some(([n,mode])=>!inPage(Number(n))||!['editable','image'].includes(mode)))fail('INVALID_IMPORT_REPORT');
    report.importModes=Object.fromEntries(Object.entries(original.importModes).filter(([n])=>report.selectedPages.includes(Number(n))));
  }
  if(original.importBatch!==undefined){
    const batch=original.importBatch;
    if(!isObject(batch)||!isId(batch.id)||!Number.isSafeInteger(batch.partIndex)||batch.partIndex<1||batch.partIndex>200
      ||!Array.isArray(batch.selectedPages)||!batch.selectedPages.length||batch.selectedPages.length>200
      ||batch.selectedPages.some(n=>!Number.isSafeInteger(n)||n<1||n>report.pageCount)||new Set(batch.selectedPages).size!==batch.selectedPages.length
      ||!equal(batch.pages,original.selectedPages)||batch.pages.some(n=>!batch.selectedPages.includes(n)))fail('INVALID_IMPORT_REPORT');
    report.importBatch={...clone(batch),pages:[...report.selectedPages]};
  }
  if(new TextEncoder().encode(JSON.stringify({importReport:report})).length>65536)fail('IMPORT_REPORT_SIZE_LIMIT');
  return report;
}
async function hashBlob(blob) {
  const bytes=await blob.arrayBuffer();
  const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}
function requireBlob(blob,mimeType) {
  if(!(blob instanceof Blob)||blob.size===0)fail('INVALID_SOURCE_BLOB');
  if(blob.type&&blob.type!==mimeType)fail('SOURCE_MIME_MISMATCH',{expected:mimeType,actual:blob.type});
}
function sourceAsset(record,report) {
  const asset=record.assets.find(a=>a.id===report.sourceAssetId);
  if(!asset||asset.kind!=='source')fail('MISSING_SOURCE_ASSET');
  return asset;
}
function historicalReport(report,record) {
  const text=(v,max=240)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f]/.test(v);
  const pages=(value,empty=false)=>Array.isArray(value)&&(empty||value.length>0)
    &&value.every(n=>natural(n)&&n>0&&n<=report.pageCount)&&new Set(value).size===value.length;
  if(!isObject(report)||report.contractVersion!==1||report.status!=='ready'
    ||!['jobId','sourceDocumentId','sourceAssetId'].every(k=>isId(report[k]))
    ||!natural(report.pageCount)||report.pageCount===0||!pages(report.selectedPages)
    ||report.selectedPages.length>DOCUMENT_LIMITS.pages
    ||!isObject(report.converter)||!text(report.converter.name)||!text(report.converter.version)
    ||!Array.isArray(report.converter.fonts)||report.converter.fonts.some(v=>!text(v)))fail('INVALID_IMPORT_REPORT');
  const warnings=report.warnings??[];
  if(!Array.isArray(warnings)||warnings.some(w=>!isObject(w)||!text(w.code)||!text(w.message,2000)
    ||(w.pageNumber!==undefined&&(!natural(w.pageNumber)||w.pageNumber===0||w.pageNumber>report.pageCount))))fail('INVALID_IMPORT_REPORT');
  if(report.availablePages!==undefined&&(!pages(report.availablePages)||report.selectedPages.some(n=>!report.availablePages.includes(n))))fail('INVALID_IMPORT_REPORT');
  if(report.omittedPages!==undefined&&(!pages(report.omittedPages,true)||report.omittedPages.some(n=>report.selectedPages.includes(n))
    ||(report.availablePages!==undefined&&!equal(report.omittedPages,report.availablePages.filter(n=>!report.selectedPages.includes(n))))))fail('INVALID_IMPORT_REPORT');
  if(!['pptx','pdf'].includes(record.source?.kind)||record.source?.sourceDocumentId!==report.sourceDocumentId
    ||record.source?.assetId!==report.sourceAssetId)fail('SOURCE_MISMATCH');
  const asset=sourceAsset(record,report);
  const mime=record.source.kind==='pptx'?'application/vnd.openxmlformats-officedocument.presentationml.presentation':'application/pdf';
  if(asset.mimeType!==mime)fail('SOURCE_MISMATCH');
}
function verifySource(record,report,blob,sha256) {
  const asset=sourceAsset(record,report);
  requireBlob(blob,asset.mimeType);
  if(asset.byteLength!==undefined&&asset.byteLength!==blob.size)fail('SOURCE_SIZE_MISMATCH',{expected:asset.byteLength,actual:blob.size});
  // Later pages may come from other documents/results; only this source asset's references share its hash.
  const references=[asset,record.source,...record.slides.flatMap(p=>[p.source,...p.items.map(e=>e.source)]).filter(s=>s?.assetId===asset.id)];
  for(const value of references) {
    if(value?.sha256&&value.sha256!==sha256)fail('SOURCE_HASH_MISMATCH',{assetId:asset.id});
  }
  return asset;
}
function bindSource(record,report,uploaded,blob,sha256) {
  const [asset]=cleanAssets([uploaded]);
  const expected=sourceAsset(record,report);
  if(asset.id!==expected.id||asset.kind!=='source'||asset.mimeType!==expected.mimeType
    ||asset.sha256!==sha256||asset.byteLength!==blob.size||!asset.storageKey)fail('ASSET_INTEGRITY',{assetId:expected.id});
  const bind=value=>value?.assetId===asset.id?{...value,sha256}:value;
  return migrateRecord({...record,source:bind(record.source),assets:record.assets.map(a=>a.id===asset.id?asset:a),
    slides:record.slides.map(p=>({...p,source:bind(p.source),items:p.items.map(e=>({...e,source:bind(e.source)}))}))});
}
function revisionEnvelope(value,id,revision) {
  if(!isObject(value)||value.kind!=='document'||value.id!==id||!natural(value.revision)
    ||(revision!==undefined&&value.revision!==revision)||value.payload?.revision!==value.revision||value.payload?.id!==id
    ||!isObject(value.sidecar?.importReport))fail('INVALID_STORED_REVISION');
  return {...value,payload:migrateRecord(value.payload)};
}
function wrapped(error,stage,original,recovery) {
  return new OnbatangImportStorageError(error.code||'IMPORT_STORAGE_FAILED',{
    stage,original,recovery,cause:error,path:error.path,details:error.details,
  });
}

/**
 * The repository enforces owner checks, immutable assets and revision CAS.
 * This service does not parse/render PPTX, retry network calls, or retire failed uploads.
 */
export function createOnbatangImportStorage({repository}={}) {
  for(const name of ['uploadAsset','saveRevision','getHead','getRevision','readAsset']) {
    if(typeof repository?.[name]!=='function')throw new TypeError(`repository.${name} is required`);
  }
  return {
    async saveConvertedDocument({input,sourceBlob,selectedPages,expectedRevision=null}={}) {
      let stage='validation';
      const recovery={input,sourceBlob,selectedPages,expectedRevision,uploadedAsset:null};
      try {
        // Reject unsupported data before any repository operation or upload.
        const converted=importConvertedDocument(input,selectedPages===undefined?{}:{selectedPages});
        converted.report=importDetails(input.report,converted.report);
        if(expectedRevision!==null&&(!natural(expectedRevision)||expectedRevision===Number.MAX_SAFE_INTEGER))fail('INVALID_EXPECTED_REVISION');
        const descriptor=sourceAsset(converted.record,converted.report);
        if(!descriptor.sha256&&!converted.record.source.sha256)fail('SOURCE_HASH_REQUIRED');
        requireBlob(sourceBlob,descriptor.mimeType);
        stage='source-verification';
        const sha256=await hashBlob(sourceBlob);
        verifySource(converted.record,converted.report,sourceBlob,sha256);
        stage='upload';
        const uploaded=await repository.uploadAsset({assetId:descriptor.id,kind:'source',mimeType:descriptor.mimeType,blob:sourceBlob});
        recovery.uploadedAsset=uploaded;
        stage='asset-binding';
        const payload=bindSource(converted.record,converted.report,uploaded,sourceBlob,sha256);
        const sidecar={importReport:converted.report},wantedRevision=expectedRevision===null?0:expectedRevision+1;
        stage='retry-check';
        let head;
        try {head=await repository.getHead({kind:'document',id:payload.id});}
        catch(error){if(error.code!=='NOT_FOUND')throw error;}
        // A lost save response may be retried. Only the original expected revision and identical snapshot qualify.
        if(head?.revision===wantedRevision&&equal(withoutRevision(head.payload||{}),withoutRevision(payload))
          &&equal(head.sidecar,sidecar))return revisionEnvelope(head,payload.id,wantedRevision);
        stage='revision-save';
        const saved=await repository.saveRevision({kind:'document',id:payload.id,payload,expectedRevision,sidecar});
        const checked=revisionEnvelope(saved,payload.id,wantedRevision);
        if(!equal(withoutRevision(checked.payload),withoutRevision(payload))||!equal(checked.sidecar,sidecar))fail('INVALID_STORED_REVISION');
        return checked;
      } catch(error) {throw wrapped(error,stage,input,recovery);}
    },
    /**
     * 끊긴 가져오기: 같은 PPT(sha256) · 같은 쪽 고르기로 시작했지만 다 저장하지 못한 묶음 가운데 가장 새것.
     * 저장한 파트가 1번부터 빠짐없이 이어져 있고 그 쪽들이 고른 쪽의 앞부분일 때만 돌려준다(이어서 저장해도 차례가 맞게).
     * 돌려주는 것: { batchId, parts: [{ pages, envelope }] } 또는 null. 목록을 못 읽는 저장소면 null.
     */
    async findIncompleteBatch({sha256,selectedPages}={}) {
      if(typeof repository.listHeads!=='function'||!/^[a-f0-9]{64}$/.test(String(sha256||''))||!Array.isArray(selectedPages))return null;
      const batches=new Map();
      for(const head of await repository.listHeads({kind:'document'})){
        const batch=head?.sidecar?.importReport?.importBatch;
        if(!batch?.id||head.payload?.source?.sha256!==sha256||!equal(batch.selectedPages,selectedPages))continue;
        if(!batches.has(batch.id))batches.set(batch.id,[]);
        batches.get(batch.id).push({index:batch.partIndex,pages:[...batch.pages],envelope:head,at:String(head.createdAt||'')});
      }
      const found=[];
      for(const [batchId,parts] of batches){
        parts.sort((a,b)=>a.index-b.index);
        const pages=parts.flatMap(p=>p.pages);
        if(parts.some((p,k)=>p.index!==k+1)||pages.length>=selectedPages.length||!pages.every((n,k)=>n===selectedPages[k]))continue;
        found.push({batchId,parts:parts.map(({pages,envelope})=>({pages,envelope})),at:parts.reduce((m,p)=>p.at>m?p.at:m,'')});
      }
      found.sort((a,b)=>b.at.localeCompare(a.at));
      return found[0]?{batchId:found[0].batchId,parts:found[0].parts}:null;
    },
    async reopenDocument({id,revision}={}) {
      let stage='revision-read';
      const recovery={id,revision,sourceBlob:null,uploadedAsset:null};
      let original;
      try {
        if(!isDesignId(id)||(revision!==undefined&&!natural(revision)))fail('INVALID_DOCUMENT_REF');
        const loaded=revision===undefined?await repository.getHead({kind:'document',id}):await repository.getRevision({kind:'document',id,revision});
        original=loaded;
        const envelope=revisionEnvelope(loaded,id,revision);
        const report=envelope.sidecar.importReport;
        // The report describes the import event. Current pages can be moved, deleted or added after import.
        // revisionEnvelope already validates today's document via migrateRecord; validate history independently.
        historicalReport(report,envelope.payload);
        const asset=sourceAsset(envelope.payload,report);
        if(!asset.sha256||asset.byteLength===undefined||!asset.storageKey)fail('ASSET_INTEGRITY',{assetId:asset.id});
        recovery.uploadedAsset=asset;
        stage='source-read';
        const sourceBlob=await repository.readAsset(asset.id);
        recovery.sourceBlob=sourceBlob;
        requireBlob(sourceBlob,asset.mimeType);
        stage='source-verification';
        verifySource(envelope.payload,report,sourceBlob,await hashBlob(sourceBlob));
        return {...envelope,sidecar:clone(envelope.sidecar),sourceBlob};
      } catch(error) {throw wrapped(error,stage,original,recovery);}
    },
  };
}
