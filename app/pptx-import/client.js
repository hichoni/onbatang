export class PptxWorkerError extends Error {
  constructor(code,message,details={}){super(message||code);this.name='PptxWorkerError';this.code=code;this.details=details;}
}
const error=(code,message,details)=>new PptxWorkerError(code,message,details);

// Each request owns a worker: abort/timeout terminates CPU work and cannot affect another import.
export function createPptxClient({workerFactory=()=>new Worker(new URL('./vendor/pptx-worker.js',import.meta.url),{type:'module'}),timeoutMs=60000}={}){
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new TypeError('timeoutMs must be positive');
  let serial=0;
  const run=(method,file,{signal,onProgress,selectedPages}={})=>new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(error('CANCELLED','PPT 가져오기를 취소했어요.'));return;}
    let worker,timer,done=false;const id=String(++serial);
    const finish=(failure,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker?.terminate();failure?reject(failure):resolve(result);};
    const cancel=()=>finish(error('CANCELLED','PPT 가져오기를 취소했어요.'));
    try{
      worker=workerFactory();
      worker.addEventListener('message',({data})=>{
        if(done||data?.id!==id)return;
        if(data.type==='progress'){try{onProgress?.(data.progress);}catch{/* A progress view must not break conversion. */}}
        else if(data.type==='result')finish(null,data.result);
        else if(data.type==='error')finish(error(data.error?.code||'CONVERSION_FAILED',data.error?.message,data.error?.details));
      });
      worker.addEventListener('error',()=>finish(error('WORKER_FAILED','PPT 변환 작업을 시작하거나 실행하지 못했어요.')));
      worker.addEventListener('messageerror',()=>finish(error('WORKER_FAILED','PPT 변환 결과를 읽지 못했어요.')));
      signal?.addEventListener('abort',cancel,{once:true});
      if(signal?.aborted){cancel();return;}
      timer=setTimeout(()=>finish(error('CONVERSION_TIMEOUT','PPT 변환 시간이 60초를 넘었어요. 쪽이나 파일을 나누어 다시 시도해 주세요.')),timeoutMs);
      worker.postMessage({id,method,file,options:{selectedPages}});
    }catch(cause){finish(error('WORKER_UNAVAILABLE','이 환경에서는 PPT 변환 작업을 시작할 수 없어요.',{reason:String(cause.message||cause)}));}
  });
  return {inspectPptx:(file,options)=>run('inspect',file,options),convertPptx:(file,options)=>run('convert',file,options),previewPptx:(file,options)=>run('preview',file,options)};
}
const client=createPptxClient();
export const inspectPptx=(file,options)=>client.inspectPptx(file,options);
export const convertPptx=(file,options)=>client.convertPptx(file,options);
export const previewPptx=(file,options)=>client.previewPptx(file,options);
