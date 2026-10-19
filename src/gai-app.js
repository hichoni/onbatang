// Generated apps are stored as inert text. Only app/gai-app.js may execute it,
// inside its opaque sandbox. No account, room or service credentials belong here.
import {DocumentError, isId, newId} from './document.js';
export const GAI_APP_BRIDGE_MARKER = 'ONBATANG_APP_BRIDGE_TOKEN';
export const GAI_APP_CHECKPOINT_MARKER = '{"onbatangRestoreMarker":"ONBATANG_APP_CHECKPOINT"}';
export const GAI_APP_LIMITS = Object.freeze({documentProject:420000, checkpoint:18000, state:6000, answer:2000, image:40000});
const fail=(path,raw)=>{throw new DocumentError('INVALID_ACTIVITY',`activity.${path}`,raw);};
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
export function cleanGaiJson(raw,limit=GAI_APP_LIMITS.checkpoint,path='state'){
 let nodes=0;
 const walk=(v,depth)=>{
  if(depth>24||++nodes>20000)fail(path,raw);
  if(v===null||typeof v==='boolean'||typeof v==='string')return v;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(Array.isArray(v)){if(v.length>5000)fail(path,raw);return Array.from(v,item=>walk(item,depth+1));}
  if(v&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v))){
   return Object.fromEntries(Object.entries(v).map(([key,value])=>{
    if(['__proto__','prototype','constructor'].includes(key))fail(path,raw);
    return [key,walk(value,depth+1)];
   }));
  }
  fail(path,raw);
 };
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail(path,raw);
 const value=walk(raw,0);if(bytes(value)>limit)fail(path,raw);return value;
}
export function cleanGaiActivity(raw){
 if(raw===undefined)return undefined;
 if(!raw||raw.version!==1||raw.kind!=='gai-app'||!isId(raw.id))fail('kind',raw);
 if(typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>80||/[\u0000-\u001f]/.test(raw.title))fail('title',raw);
 if(typeof raw.instructions!=='string'||raw.instructions.length>400||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw.instructions))fail('instructions',raw);
 if(typeof raw.document!=='string'||!raw.document.includes(JSON.stringify(GAI_APP_BRIDGE_MARKER))||!raw.document.includes(GAI_APP_CHECKPOINT_MARKER))fail('document',raw);
 const project=cleanGaiJson(raw.project,GAI_APP_LIMITS.documentProject,'project'),state=cleanGaiJson(raw.state,GAI_APP_LIMITS.checkpoint);
 if(new TextEncoder().encode(raw.document).length+bytes(project)>GAI_APP_LIMITS.documentProject)fail('documentProject',raw);
 return {version:1,kind:'gai-app',id:raw.id,title:raw.title,instructions:raw.instructions,document:raw.document,project,state};
}
export function newGaiActivity(options){return cleanGaiActivity({version:1,kind:'gai-app',id:newId('a'),instructions:'',state:{},...options});}
export function cleanGaiPatch(raw){
 const patch=cleanGaiJson(raw,30000,'report'),out={};
 for(const [key,value]of Object.entries(patch)){
  if(key==='checkpoint'||key==='state')out[key]=cleanGaiJson(value,key==='checkpoint'?GAI_APP_LIMITS.checkpoint:GAI_APP_LIMITS.state,key);
  else if(key==='answer'){if(typeof value!=='string'||value.length>GAI_APP_LIMITS.answer)fail(key,raw);out[key]=value;}
  else if(key==='progress'){if(!Number.isFinite(value)||value<0||value>100)fail(key,raw);out[key]=value;}
  else if(key==='score'){if(value!==null&&!Number.isFinite(value))fail(key,raw);out[key]=value;}
  else if(key==='completed'){if(typeof value!=='boolean')fail(key,raw);out[key]=value;}
  else if(key==='source'){if(!['app','template','student'].includes(value))fail(key,raw);}
  else fail(key,raw);
 }
 return out;
}
export function cleanGaiImage(value){
 if(typeof value!=='string'||value.length>GAI_APP_LIMITS.image||!/^data:image\/png;base64,[A-Za-z\d+/=]+$/.test(value))fail('image',value);
 let data;try{data=Uint8Array.from(atob(value.slice(22)),c=>c.charCodeAt(0));}catch{fail('image',value);}
 if(data.length<24||[137,80,78,71,13,10,26,10].some((v,i)=>data[i]!==v))fail('image',value);
 const view=new DataView(data.buffer),w=view.getUint32(16),h=view.getUint32(20);
 if(w<1||h<1||w>1024||h>1024)fail('image',value);
 return value;
}
export function cleanGaiResult(raw){
 if(!raw||typeof raw!=='object')fail('result',raw);
 const state=cleanGaiJson(raw.state??{},GAI_APP_LIMITS.checkpoint),patch=cleanGaiPatch({answer:raw.answer??'',score:raw.score??null,completed:raw.completed??false,progress:raw.progress??0});
 return {state,...patch,...(raw.image===undefined?{}:{image:cleanGaiImage(raw.image)}),...(raw.imageOmitted===true?{imageOmitted:true}:{})};
}
const aspectOf=value=>Number.isFinite(value)&&value>=.25&&value<=4?value:16/9;
const text=(value,x,y,w,size,extra={})=>({id:newId('e'),t:'text',layout:'slide',text:value,x,y,w,size,font:'gothic',color:'#273f3a',align:'c',...extra});
const fitText=(value,w,h,aspect,max)=>{
 let size=max;
 // Conservative full-width glyph estimate keeps the original answer intact.
 while(size>.1){const columns=Math.max(1,Math.floor(w/size)),rows=value.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil([...line].length/columns)),0);if(rows*size*1.3*aspect<=h)break;size-=.05;}
 return Math.max(.1,Math.round(size*100)/100);
};
export function gaiAppCover(raw,aspect){
 const a=cleanGaiActivity(raw),ar=aspectOf(aspect);
 return {bg:'#f1f7f3',items:[text('내가 만든 수업 앱',50,17,88,2.6),text(a.title,50,38,88,ar>=1?4.5:5.5,{bold:true}),text(a.instructions.slice(0,130),50,61,82,2.3),text('발표에서 이 화면으로 바로 실행해요',50,86,88,2.1)]};
}
export function gaiAppResult(raw,result,aspect){
 const a=cleanGaiActivity(raw),r=cleanGaiResult(result),ar=aspectOf(aspect),summary=r.answer||`진행 ${Math.round(r.progress)}%${r.completed?' · 완료':''}${r.score===null?'':` · 점수 ${r.score}`}`;
 const items=[text(`${a.title} · 결과`,50,10,90,3.2,{bold:true})];
 if(r.image){
  const long=summary.length>220,data=Uint8Array.from(atob(r.image.slice(22)),c=>c.charCodeAt(0)),view=new DataView(data.buffer),imageAspect=view.getUint32(16)/view.getUint32(20),w=Math.min(84,(long?28:53)*imageAspect/ar),h=long?43:20;
  items.push({id:newId('e'),t:'image',layout:'slide',url:r.image,x:50,y:long?31:46,w,h:w*ar/imageAspect});
  items.push(text(summary,50,long?72:84,88,fitText(summary,88,h,ar,1.8),{h,lh:1.3,valign:'middle'}));
 }else items.push(text(summary,50,55,88,fitText(summary,88,70,ar,3),{h:70,lh:1.3,valign:'middle'}));
 return {id:newId('p'),source:{kind:'result'},bg:'#fffdf5',items};
}
