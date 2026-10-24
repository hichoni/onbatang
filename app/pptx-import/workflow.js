import {convertPptx} from './client.js';
import {DOCUMENT_LIMITS,cleanSize,isId,legacyId,newId} from '../../src/document.js';
import {migrateRecord} from '../designs.js';
import {applyFontPlan,loadImportFontAssets} from './fonts.js';

const MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation';
const BUDGET=524288-16384;
const clone=value=>structuredClone(value);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const fail=(code,message)=>{throw Object.assign(Error(message||code),{code});};
const cancelled=signal=>{if(signal?.aborted)fail('CANCELLED','가져오기를 취소했어요. 이미 저장한 자료는 보관됩니다.');};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
async function sha(file){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');}

/** Contiguous parts keep the selected source order. No page is silently dropped. */
export function planImportParts(inspection,selectedPages,importModes={}){
 if(!Array.isArray(inspection?.pages)||!Array.isArray(selectedPages)||!selectedPages.length||selectedPages.length>200
   ||new Set(selectedPages).size!==selectedPages.length)fail('INVALID_PAGE_SELECTION','가져올 슬라이드를 선택해 주세요.');
 const available=new Map(inspection.pages.map(p=>[p.pageNumber,p])),parts=[];let pages=[],size=0;
 for(const n of selectedPages){
  const page=available.get(n),mode=importModes[n]||'editable';
  if(!Number.isSafeInteger(n)||!page||!['image','editable'].includes(mode))fail('INVALID_PAGE_SELECTION');
  if(mode==='editable'&&!page.canImport)fail('UNSUPPORTED_SLIDES',`${n}쪽은 화면 이미지로 가져오기를 선택해 주세요.`);
  const estimate=mode==='image'?240000:Math.max(0,Number(page.estimatedBytes)||0);
  if(pages.length&&(pages.length>=DOCUMENT_LIMITS.pages||size+estimate>BUDGET)){parts.push(pages);pages=[];size=0;}
  pages.push(n);size+=estimate;
 }
 if(pages.length)parts.push(pages);
 return parts;
}

/** Raster copies are bounded; the untouched PPT remains the source asset. */
export async function compressImportPreview(dataUrl,{signal}={}){
 if(typeof dataUrl!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)||dataUrl.length>16000000)fail('INVALID_PREVIEW_IMAGE');
 cancelled(signal);
 if(dataUrl.length<=200000)return dataUrl;
 if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')fail('IMAGE_TRANSFORM_UNAVAILABLE');
 const binary=atob(dataUrl.slice(dataUrl.indexOf(',')+1)),raw=Uint8Array.from(binary,c=>c.charCodeAt(0));
 const bitmap=await createImageBitmap(new Blob([raw],{type:dataUrl.slice(5,dataUrl.indexOf(';'))}));
 try{
  if(bitmap.width>8192||bitmap.height>8192||bitmap.width*bitmap.height>16777216)fail('IMAGE_DIMENSION_LIMIT');
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  for(let attempt=0;attempt<7;attempt++){
   cancelled(signal);const factor=scale*.8**attempt,canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*factor)),Math.max(1,Math.round(bitmap.height*factor)));
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   const blob=await canvas.convertToBlob({type:'image/webp',quality:.88});
   if(blob.size<=145000){let value='';const data=new Uint8Array(await blob.arrayBuffer());for(let i=0;i<data.length;i+=8192)value+=String.fromCharCode(...data.subarray(i,i+8192));return `data:${blob.type};base64,${btoa(value)}`;}
  }
  fail('IMAGE_LIMIT','이 슬라이드 이미지를 저장 가능한 크기로 만들지 못했어요. 원본은 유지됩니다.');
 }finally{bitmap.close();}
}

function shell(inspection){
 const source=inspection.source,size=cleanSize(inspection.originalSize);
 if(!source||!isId(source.assetId)||!isId(source.sourceDocumentId)||!/^[a-f0-9]{64}$/.test(source.sha256))fail('INVALID_IMPORT');
 return {id:newId('d'),schemaVersion:1,revision:0,name:source.filename.replace(/\.pptx$/i,'').slice(0,30),originalSize:size,size:{width:size.width/9525,height:size.height/9525,unit:'px'},
  source:{kind:'pptx',sourceDocumentId:source.sourceDocumentId,assetId:source.assetId,filename:source.filename,sha256:source.sha256},assetRefs:[source.assetId],
  assets:[{id:source.assetId,kind:'source',mimeType:MIME,sha256:source.sha256,byteLength:source.byteLength}],slides:[]};
}

// 영상 파일을 이 기기의 영상 저장소(app/videos.js)에 맡긴다. 영상을 틀 수 없는 브라우저면 null(그 장은 표지 그림으로 남는다).
async function keepVideoDefault({blob,design}){
 const [{probeVideo},{saveVideo}]=await Promise.all([import('../../src/scene.js'),import('../videos.js')]);
 const info=await probeVideo(blob);if(!info)return null;
 return {src:await saveVideo({blob,design,seconds:info.seconds}),dur:info.seconds};
}
/** 화면 그림이 한 가지 색뿐인지(영상만 있는 장 · 나중에 나타나는 요소만 있는 장이 까맣게 찍힌다). 알 수 없으면 false. */
export async function blankPicture(dataUrl){
 try{
  if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')return false;
  const match=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(dataUrl||''));if(!match)return false;
  const raw=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([raw],{type:match[1]})),canvas=new OffscreenCanvas(48,27),ctx=canvas.getContext('2d');
  ctx.drawImage(bitmap,0,0,48,27);bitmap.close?.();
  const data=ctx.getImageData(0,0,48,27).data;let min=[255,255,255],max=[0,0,0];
  for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++){min[c]=Math.min(min[c],data[i+c]);max[c]=Math.max(max[c],data[i+c]);}
  return max.every((v,c)=>v-min[c]<=10);
 }catch{return false;}
}

/** One user operation, multiple fixed documents when needed. Retry reuses exact inputs. */
export function createPptxImportWorkflow({imports,convert=convertPptx,applyFonts=applyFontPlan,loadFonts=loadImportFontAssets,keepVideo=keepVideoDefault,isBlank=blankPicture}={}){
 if(typeof imports?.saveConvertedDocument!=='function')throw new TypeError('imports.saveConvertedDocument is required');
 const jobs=new Map();
 async function saveAll(options={}){
  const {file,inspection,selectedPages,importModes={},fontPlan,previewSession,signal,onProgress=()=>{},retryToken}=options;
  let job,acquired=false;
  try{
   cancelled(signal);
   if(!(file instanceof Blob)||!inspection?.source||file.size!==inspection.source.byteLength)fail('INVALID_SOURCE_BLOB');
   const fingerprint=await sha(file);if(fingerprint!==inspection.source.sha256)fail('SOURCE_HASH_MISMATCH');
   const signature=JSON.stringify(canonical({fingerprint,selectedPages,importModes,fontPlan:fontPlan||null}));
   if(retryToken){job=jobs.get(retryToken);if(!job||job.signature!==signature)fail('IMPORT_RETRY_MISMATCH','이어서 저장할 때는 처음 선택한 파일과 설정을 유지해 주세요.');}
   else{
    if([...jobs.values()].some(active=>active.running&&active.signature===signature))fail('IMPORT_IN_PROGRESS');
    if(jobs.size>=5){const completed=[...jobs].find(([,j])=>j.complete);if(completed)jobs.delete(completed[0]);else fail('IMPORT_QUEUE_FULL');}
    const token=newId('j');
    // 끊긴 가져오기(창을 닫았거나 새로 고침): 같은 PPT · 같은 쪽 고르기면 이미 저장한 파트는 그대로 두고 남은 쪽부터 이어서 저장한다.
    const prior=typeof imports.findIncompleteBatch==='function'?await imports.findIncompleteBatch({sha256:fingerprint,selectedPages}):null;
    if(prior){
     const done=new Set(prior.parts.flatMap(p=>p.pages)),rest=selectedPages.filter(n=>!done.has(n));
     job={token,signature,batchId:prior.batchId,selectedPages:[...selectedPages],resumed:done.size,
      queue:[...prior.parts.map(p=>({pages:[...p.pages],envelope:p.envelope})),...planImportParts(inspection,rest,importModes).map(pages=>({pages}))],running:false,complete:false};
    }else job={token,signature,batchId:token,selectedPages:[...selectedPages],queue:planImportParts(inspection,selectedPages,importModes).map(pages=>({pages})),running:false,complete:false};
    jobs.set(token,job);
   }
   if(job.running)fail('IMPORT_IN_PROGRESS');
   if(job.complete)return result(job);
   job.running=true;acquired=true;
   const sourceBlob=new Blob([file],{type:MIME});
   // current: 지금 다루는 쪽들(보여 주는 쪽이 "담는 중"으로 그린다).
   const progress=(phase,current)=>{const stored=job.queue.filter(p=>p.envelope).flatMap(p=>p.pages);try{onProgress({phase,completed:stored.length,total:job.selectedPages.length,documents:job.queue.filter(p=>p.envelope).length,...(job.resumed?{resumed:job.resumed}:{}),...(current?{current:[...current]}:{})});}catch{/* Status rendering cannot cancel a durable write. */}};
   for(let index=0;index<job.queue.length;index++){
    const part=job.queue[index];if(part.envelope)continue;cancelled(signal);progress('converting',part.pages);
    try{
     if(!part.input){
      // 그림으로 가져오려던 쪽의 화면이 한 가지 색뿐이면(영상만 있는 장처럼 까맣게 찍힌 것), 글 · 도형으로 가져올 수 있는 쪽은 그렇게 바꾼다.
      const rendered=new Map(),blankPages=[];
      let fontAssets;
      for(const n of part.pages.filter(n=>importModes[n]==='image')){
       if(typeof previewSession?.renderPage!=='function')fail('PREVIEW_UNAVAILABLE',`${n}쪽의 PPT 화면을 먼저 확인해 주세요.`);
       cancelled(signal);
       if(fontPlan&&!fontAssets)fontAssets=await loadFonts(fontPlan,{signal});
       progress('rendering',[n]);
       const picture=await previewSession.renderPage(n,{width:1600,signal,fontPlan,fontAssets});
       if(await isBlank(picture.dataUrl)){blankPages.push(n);if(inspection.pages.find(p=>p.pageNumber===n)?.canImport)continue;}
       rendered.set(n,picture);
      }
      const switched=blankPages.filter(n=>!rendered.has(n));
      const editable=part.pages.filter(n=>(importModes[n]||'editable')==='editable'||switched.includes(n));
      const converted=editable.length?await convert(file,{selectedPages:editable,signal}):null;
      const document=converted?clone(converted.document):shell(inspection);
      const pages=new Map(document.slides.map(p=>[p.source.pageNumber,p]));
      // 장을 채운 영상: 이 기기에 저장하고 그 장의 바탕 영상으로 깐다(표지 그림은 뺀다). 저장하지 못하면 표지 그림이 남는다.
      const videoNotes=[];
      for(const m of converted?.media||[]){
       const slide=pages.get(m.pageNumber);if(!slide||slide.video)continue;
       cancelled(signal);progress('video',[m.pageNumber]);
       try{
        const video=await keepVideo({blob:new Blob([m.bytes],{type:m.mime}),design:document.id,pageNumber:m.pageNumber});
        if(!video?.src){videoNotes.push(m.pageNumber);continue;}
        slide.video={src:video.src,dur:video.dur,fit:'cover',...(m.auto?{auto:true}:{})};      // PPT 에서 "자동으로"였던 것만 저절로. 아니면 누를 때 튼다
        slide.items=slide.items.filter(item=>item.id!==m.posterId);
       }catch(error){if(error?.code==='CANCELLED')throw error;videoNotes.push(m.pageNumber);}
      }
      for(const [n,picture] of rendered){
       cancelled(signal);
       const url=await compressImportPreview(picture.dataUrl,{signal}),source={...document.source,pageNumber:n};delete source.filename;
       pages.set(n,{id:legacyId('p',`${inspection.source.sha256}:${n}`),bg:'paper',source,assetRefs:[inspection.source.assetId],items:[{
        id:legacyId('e',`${inspection.source.sha256}:${n}:rendered-slide`),t:'image',layout:'slide',x:50,y:50,w:100,h:100,rot:0,op:100,mask:'none',url,source:{...source,objectId:'rendered-slide'},assetRefs:[inspection.source.assetId]}]});
      }
      document.slides=part.pages.map(n=>pages.get(n));
      if(document.slides.some(p=>!p))fail('PAGE_NOT_AVAILABLE');
      const before=clone(document),applied=fontPlan?applyFonts(document,fontPlan):document;
      // Font services return a document; wrappers may additionally report applied changes.
      let payload=migrateRecord(applied.document||applied);
      if(job.queue.length>1)payload={...payload,name:payload.name.slice(0,23)+` · ${index+1}`};
      const fontUsage=inspection.pages.filter(p=>part.pages.includes(p.pageNumber)).flatMap(p=>p.fontUsage||[]);
      const report=converted?clone(converted.report):{contractVersion:1,jobId:newId('j'),status:'ready',sourceDocumentId:inspection.source.sourceDocumentId,sourceAssetId:inspection.source.assetId,converter:clone(inspection.converter),selectedPages:[],pageCount:inspection.pageCount,warnings:[]};
      report.selectedPages=[...part.pages];report.fontUsage=fontUsage;
      report.importBatch={id:job.batchId,partIndex:index+1,selectedPages:job.selectedPages,pages:[...part.pages]};
      report.importModes=Object.fromEntries(part.pages.map(n=>[n,switched.includes(n)?'editable':importModes[n]||'editable']));
      for(const n of switched)report.warnings.push({code:'BLANK_IMAGE_SWITCHED',message:`${n}쪽은 PPT 화면이 한 가지 색으로만 보여서(영상 · 나중에 나타나는 요소) 글 · 도형으로 가져왔어요.`,pageNumber:n});
      for(const n of blankPages.filter(n=>rendered.has(n)))report.warnings.push({code:'BLANK_IMAGE',message:`${n}쪽의 PPT 화면이 한 가지 색으로만 보여요. 원본과 비교해 주세요.`,pageNumber:n});
      for(const n of videoNotes)report.warnings.push({code:'VIDEO_NOT_SAVED',message:`${n}쪽의 영상을 이 기기에 저장하지 못해 표지 그림으로 가져왔어요. "바탕 영상"에서 다시 넣을 수 있어요.`,pageNumber:n});
      report.fontChanges=payload.slides.flatMap(p=>p.items.filter(e=>e.t==='text').flatMap(e=>{
       const old=before.slides.find(page=>page.id===p.id)?.items.find(i=>i.id===e.id);
       return old&&(old.font!==e.font||old.typeface!==e.typeface)?[{elementId:e.id,pageNumber:p.source.pageNumber,from:fontUsage.find(u=>u.elementId===e.id)?.originalName||old.typeface||old.font,to:e.font}]:[];
      }));
      if(part.pages.some(n=>importModes[n]==='image'))report.warnings.push({code:'SLIDE_IMAGE_MODE',message:'선택한 슬라이드는 화면 이미지로 가져왔어요. 그림 안의 글·도형은 개별 편집할 수 없으며 원본 PPT는 보관됩니다.'});
      if(bytes(payload)>524288||bytes({importReport:report})>65536)fail('DOCUMENT_SIZE_LIMIT');
      part.input={document:payload,report};
     }
     cancelled(signal);progress('saving',part.pages);
     // Do not abandon an in-flight durable write on cancel; record its receipt first.
     part.envelope=await imports.saveConvertedDocument({input:part.input,sourceBlob});
     part.input=null;progress('saved');
    }catch(error){
     // A local size rejection happens before persistence. Other save errors may
     // have committed already, so their prepared input must survive for retry.
     if(['DOCUMENT_SIZE_LIMIT','REVISION_TOO_LARGE'].includes(error.code)&&part.pages.length>1){
      const middle=Math.ceil(part.pages.length/2);job.queue.splice(index,1,{pages:part.pages.slice(0,middle)},{pages:part.pages.slice(middle)});index--;continue;
     }
     throw error;
    }
   }
   job.complete=true;progress('complete');return result(job);
  }catch(error){
   if(job){const recovery=result(job);error.recovery={...error.recovery,...recovery,retryToken:job.token,failedPages:job.queue.filter(p=>!p.envelope).flatMap(p=>p.pages)};}
   throw error;
  }finally{if(acquired)job.running=false;}
 }
 function result(job){const saved=job.queue.filter(p=>p.envelope);return {complete:job.complete,...(job.resumed?{resumed:job.resumed}:{}),documents:saved.map(p=>p.envelope),parts:saved.map(p=>({documentId:p.envelope.id,pages:[...p.pages]})),pageCount:saved.reduce((n,p)=>n+p.pages.length,0),batchId:job.batchId,retryToken:job.token};}
 return {saveAll,dispose:()=>jobs.clear()};
}
