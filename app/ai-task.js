// A request is durable before it can spend a ticket. Leaving detaches the watcher,
// never cancels the server job. Reopening uses the same id, including a lost POST.
import {aiDraftStore} from './ai-draft-store.js';
const terminal=new Set(['invalid','not_configured','job_missing','max_failed','ai_quota','INVALID_ANSWER','INVALID_COMPOSE','INVALID_SLIDES','INVALID_PROMPT']);
export function createAiTask({key,provider,prepare=async()=>{},change=()=>{},result=()=>{}}){
 const store=aiDraftStore(key+'.task');let task=null,controller=null,disposed=false,away=false;
 const emit=()=>{if(!disposed&&!away)change(task);};
 const hide=()=>{away=true;controller?.abort();},show=()=>{away=false;emit();void follow();};
 globalThis.addEventListener?.('pagehide',hide);globalThis.addEventListener?.('pageshow',show);
 const keep=()=>store.write(task);
 async function follow(){
  if(disposed||away||controller||task?.state!=='pending')return;
  const active=controller=new AbortController();task.message='접수한 작업을 확인하고 있어요.';delete task.error;emit();
  try{
   await provider.connect();active.signal.throwIfAborted();
   const answer=await provider.generate(task.input,{signal:active.signal,requestId:task.id,jobId:task.jobId,onProgress:p=>{
    if(disposed||controller!==active)return;
    task.message=p?.message||'AI-G가 만들고 있어요.';task.stage=p?.stage||'building';
    if(p?.jobId&&task.jobId!==p.jobId){task.jobId=p.jobId;void keep().catch(()=>{});}emit();
   }});
   active.signal.throwIfAborted();
   task={...task,state:'ready',answer,message:'완성했어요. 결과를 확인하고 적용해 주세요.'};
   await keep();if(!disposed){emit();await result(task);}
  }catch(e){
   if(disposed||away)return;
   const failed=terminal.has(e.code)||task.state==='ready';
   task={...task,state:failed?'failed':'pending',message:failed?e.message:'연결 확인이 필요해요. 접수한 작업은 서버에서 계속됩니다.',error:e.message};
   await keep().catch(()=>{});
  }finally{if(controller===active)controller=null;emit();if(!disposed&&!away&&active.signal.aborted)void follow();}
 }
 const ready=store.read().then(async saved=>{if(disposed)return;task=saved;if(task){emit();if(task.state==='pending')void follow();else if(task.state==='ready')await result(task);}}).catch(()=>{if(!disposed)change({state:'failed',message:'AI 작업 기록을 읽지 못했어요. 다시 열어 주세요.'});});
 return {ready,busy:()=>task?.state==='pending',running:()=>!!controller,current:()=>task,
  async start(input,meta){await ready;if(disposed||task?.state==='pending')throw Error('진행 중인 AI 작업을 먼저 확인해 주세요.');
   const previous=task;task={id:crypto.randomUUID(),createdAt:Date.now(),state:'pending',stage:'preparing',message:'발표와 요청을 저장하고 있어요.',input:structuredClone(input),meta:structuredClone(meta)};emit();
   try{await prepare();await keep();}catch(e){task=previous;emit();throw Error('작업을 안전하게 저장하지 못해 AI 요청을 보내지 않았어요.');}
   if(!disposed)void follow();
  },retry(){if(task?.state==='pending')void follow();},async clear(id){if(id&&task?.id!==id)return;task=null;await keep();emit();},destroy(){disposed=true;controller?.abort();globalThis.removeEventListener?.('pagehide',hide);globalThis.removeEventListener?.('pageshow',show);}
 };
}
