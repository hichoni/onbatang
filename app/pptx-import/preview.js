import {inspectPptx} from './client.js';
import {defaultImportFontServices} from './fonts.js';

export const PPTX_PREVIEW_RENDERER=Object.freeze({id:'aiden0z-pptx-renderer',version:'1.3.0',label:'PPT 파일 미리보기 · 원본과 다를 수 있음'});
export class PptxPreviewError extends Error {
  constructor(code,message,details={}){super(message||code);this.name='PptxPreviewError';this.code=code;this.details=details;}
}
const failure=(code,message,details)=>new PptxPreviewError(code,message,details);
const cancelled=()=>failure('CANCELLED','PPT 미리보기를 취소했어요.');
const warning={code:'PPTX_PREVIEW_APPROXIMATE',message:'PPT 파일을 브라우저에서 그린 미리보기예요. PowerPoint의 글꼴·효과·배치와 다를 수 있어요.'};
const fatalCodes=new Set(['EXTERNAL_RESOURCE','UNSAFE_RELATIONSHIP','UNSAFE_PATH','INVALID_IMAGE','IMAGE_SIZE_LIMIT','IMAGE_DECODE_FAILED']);
const maxRasterBytes=256000;
const randomNonce=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');

/** Validates the original again before passing it to the independent third-party parser.
 * Supplied inspection is a UX hint, never authorization to skip ZIP/XML safety checks. */
export function createPptxPreview({timeoutMs=60000,inspect=inspectPptx,document:dom=globalThis.document,window:win=globalThis.window,fontServices=defaultImportFontServices,loadFonts=fontServices.loadImportFontAssets}={}){
  if(!Number.isFinite(timeoutMs)||timeoutMs<1)throw new TypeError('timeoutMs must be positive');
  const {createFontPlan,resolveImportFontReplacement}=fontServices;
  if(typeof createFontPlan!=='function'||typeof resolveImportFontReplacement!=='function'||typeof loadFonts!=='function')throw new TypeError('fontServices are required');
  return {async open(file,{signal,onProgress,inspection}={}){
    if(signal?.aborted)throw cancelled();
    const checked=await inspect(file,{signal,onProgress});
    if(signal?.aborted)throw cancelled();
    if(inspection?.source&&(inspection.source.sha256!==checked.source.sha256||inspection.source.byteLength!==checked.source.byteLength))throw failure('SOURCE_MISMATCH','점검한 PPT와 미리보기 파일이 달라요.');
    if(!dom?.createElement||!win?.addEventListener)throw failure('PREVIEW_UNAVAILABLE','이 환경에서는 PPT 미리보기를 사용할 수 없어요.');
    const bytes=await file.arrayBuffer();if(signal?.aborted)throw cancelled();
    const nonce=randomNonce(),frame=dom.createElement('iframe'),pending=new Map(),cache=new Map();
    let sequence=0,disposed=false,queue=Promise.resolve(),cacheBytes=0;
    frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('aria-hidden','true');frame.setAttribute('title','PPT 파일 미리보기 처리');
    // Offscreen iframes may indefinitely throttle requestAnimationFrame used by renderers.
    frame.style.cssText='position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;pointer-events:none;opacity:0;z-index:-1;';
    frame.src=new URL('./vendor/preview-frame.html',import.meta.url).href+'#'+nonce;
    const dispose=()=>{if(disposed)return;disposed=true;win.removeEventListener('message',receive);frame.remove();cache.clear();cacheBytes=0;for(const entry of [...pending.values()])entry.finish(failure('PREVIEW_DISPOSED','PPT 미리보기를 닫았어요.'));};
    const receive=event=>{
      // An allow-scripts-only frame has an opaque origin. Both its WindowProxy and nonce are required.
      if(disposed||event.source!==frame.contentWindow||event.origin!=='null'||event.data?.nonce!==nonce)return;
      const entry=pending.get(event.data.id);if(!entry)return;
      if(event.data.type==='result')entry.finish(null,event.data.result);
      else if(event.data.type==='error')entry.finish(failure(event.data.error?.code||'PREVIEW_FAILED',event.data.error?.message,event.data.error?.details));
    };
    const request=(method,payload={},requestSignal)=>new Promise((resolve,reject)=>{
      if(disposed){reject(failure('PREVIEW_DISPOSED','PPT 미리보기를 닫았어요.'));return;}
      if(requestSignal?.aborted){reject(cancelled());return;}
      const id=String(++sequence);let timer,done=false;
      const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);pending.delete(id);requestSignal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
      const abort=()=>{finish(cancelled());dispose();};
      pending.set(id,{finish});requestSignal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>{finish(failure('PREVIEW_TIMEOUT','PPT 미리보기 시간이 초과됐어요. 다시 열어 주세요.'));dispose();},timeoutMs);
      try{frame.contentWindow.postMessage({nonce,id,method,...payload},'*',method==='open'?[payload.bytes]:[]);}catch(error){finish(error);dispose();}
    });
    win.addEventListener('message',receive);
    try{
      await new Promise((resolve,reject)=>{
        let timer;const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);frame.onload=null;frame.onerror=null;};
        const abort=()=>{clean();reject(cancelled());};
        frame.onload=()=>{clean();resolve();};frame.onerror=()=>{clean();reject(failure('PREVIEW_UNAVAILABLE','PPT 미리보기 도구를 불러오지 못했어요.'));};
        signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{clean();reject(failure('PREVIEW_TIMEOUT','PPT 미리보기 도구를 불러오는 시간이 초과됐어요.'));},timeoutMs);
        dom.body.append(frame);if(signal?.aborted)abort();
      });
      const opened=await request('open',{bytes,pageCount:checked.pageCount},signal);
      if(opened.pageCount!==checked.pageCount)throw failure('PAGE_COUNT_MISMATCH','PPT 미리보기의 쪽 수가 원본과 달라요.');
      const pages=checked.pages.map(page=>({pageNumber:page.pageNumber,available:!page.warnings.some(w=>fatalCodes.has(w.code)),warnings:[warning,...page.warnings],reason:page.warnings.find(w=>fatalCodes.has(w.code))?.message}));
      const renderPage=(pageNumber,{width=1280,purpose='image',signal:jobSignal,fontPlan,fontAssets}={})=>{
        const job=async()=>{
          if(disposed)throw failure('PREVIEW_DISPOSED','PPT 미리보기를 닫았어요.');if(jobSignal?.aborted)throw cancelled();
          if(!Number.isSafeInteger(pageNumber)||pageNumber<1||pageNumber>pages.length)throw failure('INVALID_PAGE','미리보기 쪽 번호를 확인해 주세요.');
          const page=pages[pageNumber-1];if(!page.available)throw failure('PAGE_UNAVAILABLE',page.reason||'이 쪽의 PPT 미리보기를 만들 수 없어요.');
          if(!Number.isFinite(width))throw failure('INVALID_WIDTH','미리보기 크기를 확인해 주세요.');
          width=Math.round(Math.min(purpose==='thumbnail'?640:1600,Math.max(64,width)));
          const plan=createFontPlan(fontPlan||{}),names=new Set([plan.mappings,...(plan.rules||[]).map(rule=>rule.mappings)].flatMap(map=>Object.keys(map)));
          const mappings=Object.fromEntries([...names].map(name=>[name,resolveImportFontReplacement(name,plan,pageNumber)?.family]).filter(([,family])=>family));
          const key=JSON.stringify([pageNumber,width,purpose,mappings]);
          if(cache.has(key)){const hit=cache.get(key);cache.delete(key);cache.set(key,hit);return structuredClone(hit);}
          const fonts=Object.keys(mappings).length?(fontAssets||await loadFonts(plan,{signal:jobSignal})):{fonts:[],licenseNotices:[]};
          if(jobSignal?.aborted)throw cancelled();
          let raster;
          try{raster=await request('render',{pageNumber,width,fonts:fonts.fonts,mappings});}
          catch(error){if(!['CANCELLED','PREVIEW_DISPOSED','PREVIEW_TIMEOUT'].includes(error.code)){page.available=false;page.reason=error.message;}throw error;}
          if(jobSignal?.aborted)throw cancelled();
          if(typeof raster?.dataUrl!=='string'||!/^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(raster.dataUrl)||raster.dataUrl.length>Math.ceil(maxRasterBytes*4/3)+100||!Number.isInteger(raster.width)||!Number.isInteger(raster.height)||raster.width<1||raster.height<1||raster.width*raster.height>4000000)throw failure('INVALID_RASTER','PPT 미리보기 이미지가 올바르지 않아요.');
          const result={...raster,url:raster.dataUrl,pageNumber,kind:'pptx',available:true,warnings:[...page.warnings,...(raster.warnings||[])],renderer:PPTX_PREVIEW_RENDERER,licenseNotices:fonts.licenseNotices};
          cache.set(key,result);cacheBytes+=raster.dataUrl.length;
          while(cacheBytes>8*1024*1024&&cache.size>1){const first=cache.keys().next().value;cacheBytes-=cache.get(first).dataUrl.length;cache.delete(first);}
          return structuredClone(result);
        };
        const result=queue.then(job);queue=result.catch(()=>{});
        // Cancelling a view drops its result, while the serial queue waits for the bounded job.
        // Closing/changing the source calls dispose(), which removes the running frame immediately.
        if(!jobSignal)return result;
        return new Promise((resolve,reject)=>{const abort=()=>reject(cancelled());jobSignal.addEventListener('abort',abort,{once:true});result.then(resolve,reject).finally(()=>jobSignal.removeEventListener('abort',abort));if(jobSignal.aborted)abort();});
      };
      return {pageCount:checked.pageCount,source:structuredClone(checked.source),renderer:PPTX_PREVIEW_RENDERER,pages,renderPage,dispose};
    }catch(error){dispose();throw error;}
  }};
}

/** UI adapter; a new load disposes the preceding file and its image cache. */
export function createPptxPreviewProvider(options={}){
  const factory=createPptxPreview(options);let session,generation=0;
  return {async load({file,...settings}){const current=++generation;session?.dispose();session=undefined;const next=await factory.open(file,settings);if(current!==generation){next.dispose();throw cancelled();}session=next;return {pageCount:next.pageCount,source:next.source,renderer:next.renderer,pages:next.pages};},
    getPage({pageNumber,...settings}){if(!session)return Promise.reject(failure('PREVIEW_NOT_OPEN','PPT 파일을 먼저 열어 주세요.'));return session.renderPage(pageNumber,settings);},
    dispose(){generation++;session?.dispose();session=undefined;}};
}
