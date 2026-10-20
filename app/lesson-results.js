// Data-only return envelope. Never load or execute HTML/app code from a result file.
import {isId,isObject,newId} from '../src/document.js';
import {cleanActivity} from '../src/activity.js';
import {isDesignId,migrateRecord,MAX_SLIDES,aspectOf} from './designs.js';
const bad=message=>{throw Error(message);};
const canonical=v=>JSON.stringify(v,(_,x)=>isObject(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const resultDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)))),b=>b.toString(16).padStart(2,'0')).join('');
export async function activityDefinitionHash(raw){const value=cleanActivity(raw),{state,cells,...definition}=value;return resultDigest(definition);}
export function cleanLessonTarget(raw){
 if(!isObject(raw)||!['document','material'].includes(raw.kind)||(raw.kind==='document'?!isDesignId(raw.id):!isId(raw.id)))bad('원래 온바탕 자료 연결 정보를 확인해주세요.');
 return {kind:raw.kind,id:raw.id};
}
export function cleanLessonBinding(raw){
 if(!isObject(raw)||!isDesignId(raw.documentId)||!isId(raw.pageId)||!isId(raw.activityId)||!['pixel-art','gai-app'].includes(raw.kind)||!/^[a-f0-9]{64}$/.test(raw.definitionHash))bad('활동 연결 정보를 확인해주세요.');
 return {documentId:raw.documentId,pageId:raw.pageId,activityId:raw.activityId,kind:raw.kind,definitionHash:raw.definitionHash};
}
export function cleanResultPng(value){
 if(typeof value!=='string'||value.length>2_000_000||!/^data:image\/png;base64,[A-Za-z\d+/=]+$/.test(value))bad('결과 그림의 형식이나 크기를 확인해주세요.');
 let bytes;try{bytes=Uint8Array.from(atob(value.slice(22)),c=>c.charCodeAt(0));}catch{bad('결과 그림을 읽지 못했어요.');}
 if(bytes.length<33||[137,80,78,71,13,10,26,10].some((b,i)=>bytes[i]!==b))bad('PNG 결과 그림이 아니에요.');
 const d=new DataView(bytes.buffer),w=d.getUint32(16),h=d.getUint32(20);
 if(!w||!h||w>4096||h>4096||w*h>8_000_000)bad('결과 그림 크기가 너무 커요.');return value;
}
export function cleanReturnedResults(raw){
 if(!isObject(raw)||raw.version!==1||raw.kind!=='onbatang-html-results'||!isId(raw.lessonId)||typeof raw.title!=='string'||raw.title.length>160||!Array.isArray(raw.results)||raw.results.length>100)bad('온바탕용 결과 JSON 파일을 선택해주세요.');
 const seen=new Set(),results=raw.results.map(row=>{
  if(!isObject(row)||!isId(row.id)||seen.has(row.id)||!Number.isFinite(row.aspect)||row.aspect<.25||row.aspect>4||typeof row.answer!=='string'||row.answer.length>2000||typeof row.completed!=='boolean')bad('결과 번호·내용·화면 비율을 확인해주세요.');
  seen.add(row.id);return {id:row.id,binding:cleanLessonBinding(row.binding),aspect:row.aspect,image:cleanResultPng(row.image),answer:row.answer,completed:row.completed};
 });
 const out={kind:raw.kind,version:1,lessonId:raw.lessonId,title:raw.title,target:cleanLessonTarget(raw.target),results};
 if(new TextEncoder().encode(JSON.stringify(out)).length>20_000_000)bad('결과 파일이 너무 커요. 결과를 나누어 내보내주세요.');return out;
}
export function returnedResultsFromLesson(lesson){
 if(!lesson.target)bad('이전 HTML에는 자료 연결 정보가 없어요. 온바탕에서 HTML 수업을 새로 내려받아주세요.');
 return cleanReturnedResults({kind:'onbatang-html-results',version:1,lessonId:lesson.id,title:lesson.title,target:lesson.target,
  results:lesson.pages.filter(p=>p.result&&p.binding).map(p=>({id:p.id,binding:p.binding,aspect:p.aspect,image:p.image,answer:p.resultData?.answer||'',completed:p.resultData?.completed??true}))});
}
// Check against current activity definitions, not executable code in a file.
export async function inspectReturnedResults(raw,{target,records}){
 const packet=cleanReturnedResults(raw);if(canonical(packet.target)!==canonical(cleanLessonTarget(target)))bad('다른 자료의 결과예요. 이 HTML을 내려받은 원래 자료에서 가져와주세요.');
 const pages=records.flatMap(record=>record.slides.map(page=>({record,page}))),rows=[];
 for(const result of packet.results){
  const owner=pages.find(v=>v.record.id===result.binding.documentId&&v.page.id===result.binding.pageId);
  if(!owner?.page.activity||owner.page.activity.id!==result.binding.activityId||owner.page.activity.kind!==result.binding.kind||await activityDefinitionHash(owner.page.activity)!==result.binding.definitionHash)bad('원래 활동이 바뀌었거나 없어졌어요. 결과 파일은 그대로 보관하고 같은 활동이 있는 자료를 확인해주세요.');
  const digest=await resultDigest(result),prior=pages.find(v=>v.page.source?.kind==='result'&&v.page.source.sourceDocumentId===packet.lessonId&&v.page.source.objectId==='html:'+result.id);
  if(prior&&prior.page.source.sha256!==digest)bad('이미 저장된 결과와 같은 번호인데 내용이 달라요. 기존 결과를 보존하기 위해 가져오지 않았어요.');
  rows.push({result,digest,duplicate:!!prior,title:owner.page.activity.title,sourcePosition:pages.indexOf(owner)+1});
 }
 return {packet,rows};
}
export async function planReturnedResults(raw,{target,records,pageOrder,selected}){
 const inspected=await inspectReturnedResults(raw,{target,records}),wanted=new Set(selected);
 if(wanted.size!==selected.length||selected.some(id=>!inspected.rows.some(r=>r.result.id===id)))bad('가져올 결과를 다시 선택해주세요.');
 const next=records.map(record=>structuredClone(record)),order=[...pageOrder],added=[];
 for(const row of inspected.rows.filter(r=>wanted.has(r.result.id)&&!r.duplicate)){
  const r=row.result,owner=next.find(d=>d.id===r.binding.documentId),source=owner.slides.find(p=>p.id===r.binding.pageId);
  const id=newId('p'),text=r.answer||`${row.title} · ${r.completed?'완료':'진행 중'}`;
  const width=Math.min(88,76*r.aspect/aspectOf(owner));
  const page={id,bg:'#fffdf5',source:{kind:'result',sourceDocumentId:inspected.packet.lessonId,objectId:'html:'+r.id,sha256:row.digest},origin:{documentId:owner.id,pageId:source.id,revision:owner.revision},items:[
   {id:newId('e'),t:'image',layout:'slide',url:r.image,x:50,y:44,w:width,h:width*aspectOf(owner)/r.aspect},
   {id:newId('e'),t:'text',layout:'slide',text,x:50,y:94,w:90,h:10,size:1.7,color:'#273f3a',align:'c',font:'gothic'}]};
  // Existing parts participate in one atomic fixed save. Never mutate a source
  // page or silently write a partial subset when capacity is insufficient.
  let destination;
  for(const record of [owner,...next.filter(d=>d.id!==owner.id)]){
   if(record.slides.length>=MAX_SLIDES||Math.abs(aspectOf(record)-aspectOf(owner))>.000001)continue;
   const candidate=migrateRecord({...record,slides:[...record.slides,page]});
   if(new TextEncoder().encode(JSON.stringify(candidate)).length<=500000){destination=record;break;}
  }
  if(!destination)bad('자료에 결과를 둘 공간이 부족해요. 선택한 결과를 줄여주세요. 아무 결과도 저장하지 않았어요.');
  destination.slides.push(page);let at=order.indexOf(source.id)+1;
  while(at<order.length&&next.some(d=>d.slides.some(p=>p.id===order[at]&&p.source?.kind==='result'&&p.origin?.pageId===source.id)))at++;
  order.splice(at,0,id);added.push({documentId:destination.id,pageId:id});
 }
 if(order.length>200)bad('전체 자료는 최대 200쪽이에요. 결과 선택을 줄여주세요.');
 return {documents:next.filter((d,i)=>d.slides.length!==records[i].slides.length).map(migrateRecord),pageOrder:order,added,duplicates:inspected.rows.filter(r=>wanted.has(r.result.id)&&r.duplicate).length};
}
