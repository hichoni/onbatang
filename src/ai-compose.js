// Native Onbatang composition data. No HTML, scripts, external URLs or DOM.
import {SHAPE_ASSETS} from './shapes.js';
import {ENTERS,IDLES,EMPHASES,EXITS,TRANSITIONS} from './motion.js';
import {newId} from './document.js';
export const COMPOSE_LIMITS=Object.freeze({pages:24,items:24,photos:3,prompt:1800,reference:16000,text:400,notes:3000,bytes:480000});
const bad=message=>{throw Error(message);},obj=v=>v&&typeof v==='object'&&!Array.isArray(v),hex=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const word=(v,max,label,empty=false)=>{if(typeof v!=='string'||v.length>max||!empty&&!v.trim())bad(label+'을 확인해주세요.');return v.trim();};
const number=(v,min,max,label)=>{if(!Number.isFinite(v)||v<min||v>max)bad(label+' 범위를 확인해주세요.');return Math.round(v*100)/100;};
const known=new Map(SHAPE_ASSETS.map(s=>[s.id,s]));
const motion={an:ENTERS,lp:IDLES,em:EMPHASES,ex:EXITS,tr:TRANSITIONS};
export function nativeComposeCatalog(fonts=[]){return {
 shapes:SHAPE_ASSETS.map(({id,name})=>[id,name]),
 fonts:[['gothic','기본'],...fonts.filter(f=>f.id!=='gothic').map(f=>[f.id,f.name])].slice(0,80),
 motion:Object.fromEntries(Object.entries(motion).map(([k,rows])=>[k,rows.map(({id,name})=>[id,name])]))
};}
export function cleanComposeRequest(input){
 if(!obj(input)||input.kind!=='slides'||input.task!=='compose')bad('발표 제작 요청을 확인해주세요.');
 const prompt=word(input.prompt,COMPOSE_LIMITS.prompt,'발표 의도'),reference=word(input.reference??'',COMPOSE_LIMITS.reference,'참고 원고',true);
 if(!Number.isInteger(input.count))bad('장 수를 정수로 적어주세요.');const count=number(input.count,1,COMPOSE_LIMITS.pages,'장 수');
 const fonts=input.fonts??[['gothic','기본']];if(!Array.isArray(fonts)||fonts.length<1||fonts.length>80)bad('글꼴 목록을 확인해주세요.');
 const fontRows=fonts.map(row=>{if(!Array.isArray(row)||row.length!==2||!/^[-a-zA-Z0-9_]{1,60}$/.test(row[0]))bad('글꼴 이름을 확인해주세요.');return [row[0],word(row[1],80,'글꼴 이름')];});
 if(new Set(fontRows.map(f=>f[0])).size!==fontRows.length)bad('글꼴 이름이 겹쳐요.');
 const photos=(input.photos??[]);if(!Array.isArray(photos)||photos.length>COMPOSE_LIMITS.photos)bad('사진은 세 장까지 골라주세요.');
 const seen=new Set(),photoRows=photos.map(p=>{if(!obj(p)||!/^photo[1-3]$/.test(p.id)||seen.has(p.id))bad('사진 연결을 확인해주세요.');seen.add(p.id);return {id:p.id,alt:word(p.alt,160,'사진 설명'),aspect:number(p.aspect,.1,10,'사진 비율')};});
 const rawAspect=input.aspect??16/9;if(!Number.isFinite(rawAspect)||rawAspect<.3||rawAspect>3)bad('화면 비율을 확인해주세요.');const aspect=Math.round(rawAspect*100000)/100000;
 return {kind:'slides',task:'compose',prompt,count,reference,fonts:fontRows,photos:photoRows,aspect};
}
function effect(raw,key){if(raw[key]===undefined)return {};if(raw[key]==='none'&&['an','lp'].includes(key))return {[key]:'none'};if(!motion[key].some(m=>m.id===raw[key]))bad('온바탕에 없는 움직임이에요.');return {[key]:raw[key]};}
/** Shared whitelist for complete decks and individual element additions. */
export function validateNativeItem(raw,request,shares=new Set()){
 const fonts=new Set((request.fonts||[['gothic','기본']]).map(f=>f[0])),photos=new Set((request.photos||[]).map(p=>p.id));
   if(!obj(raw)||!['text','shape','image'].includes(raw.t))bad('온바탕의 글·도형·사진으로 구성해주세요.');
   const it={t:raw.t,x:number(raw.x,0,100,'가로 위치'),y:number(raw.y,0,100,'세로 위치'),w:number(raw.w,raw.t==='text'?10:raw.t==='image'?5:2,100,'너비')};
   if(raw.rot!==undefined)it.rot=number(raw.rot,-180,180,'회전');
   if(raw.op!==undefined)it.op=number(raw.op,10,100,'불투명도');
   if(raw.morphKey!==undefined){if(!/^m[a-z0-9]{6,48}$/.test(raw.morphKey)||shares.has(raw.morphKey))bad('한 장 안에서 공유 대상 이름이 겹쳐요.');it.morphKey=raw.morphKey;shares.add(raw.morphKey);}
   for(const k of ['an','lp','em','ex'])Object.assign(it,effect(raw,k));
   if(raw.aw!==undefined){if(typeof raw.aw!=='boolean')bad('등장 순서를 확인해주세요.');it.aw=raw.aw;}
   if(raw.dl!==undefined)it.dl=number(raw.dl,0,3,'등장 간격');
   if(raw.sp!==undefined){if(!['fast','slow'].includes(raw.sp))bad('움직임 빠르기를 확인해주세요.');it.sp=raw.sp;}
   if(raw.t==='text'){
    it.text=word(raw.text,COMPOSE_LIMITS.text,'화면 글');it.size=number(raw.size,1.8,18,'글자 크기');
    if(!hex(raw.color))bad('글자 색을 확인해주세요.');it.color=raw.color;
    it.align=raw.align??'l';if(!['l','c','r'].includes(it.align))bad('글자 정렬을 확인해주세요.');
    it.font=raw.font??(request.fonts?.[0]?.[0]||'gothic');if(!fonts.has(it.font))bad('온바탕에 없는 글꼴이에요.');
    if(raw.bold!==undefined){if(typeof raw.bold!=='boolean')bad('글자 굵기를 확인해주세요.');it.bold=raw.bold;}
    it.lh=raw.lh===undefined?1.2:number(raw.lh,1,1.6,'줄 간격');
    if(it.x-it.w/2<-.01||it.x+it.w/2>100.01)bad('글상자가 장의 가로 범위를 벗어났어요.');
    // Use native slide text limits, so text is never silently truncated at 120 chars.
    it.layout='slide';
   }else{
    it.h=number(raw.h,raw.t==='image'?5:.6,100,'높이');
    if(raw.t==='shape'){
     if(!known.has(raw.shape)||!hex(raw.color))bad('도형 이름과 색을 확인해주세요.');it.shape=raw.shape;it.color=raw.color;
     if(raw.r!==undefined)it.r=number(raw.r,0,100,'모서리');
     if(raw.line!==undefined){it.line=number(raw.line,.1,5,'테두리');if(!hex(raw.lc))bad('테두리 색을 확인해주세요.');it.lc=raw.lc;if(raw.hollow===true)it.hollow=true;}
    }else{if(!photos.has(raw.asset))bad('첨부하지 않은 사진은 만들 수 없어요.');it.asset=raw.asset;}
   }
   return it;
}
export function validateComposition(value,input){
 const request=cleanComposeRequest(input);
 if(!obj(value)||!Array.isArray(value.ops)||value.ops.length!==request.count)bad(`요청한 ${request.count}장이 모두 있어야 해요. 기존 발표는 그대로 유지됩니다.`);
 if(new TextEncoder().encode(JSON.stringify(value)).length>COMPOSE_LIMITS.bytes)bad('만든 발표 데이터가 너무 커요.');
 const say=word(value.say,600,'제작 설명',true),title=word(value.title,60,'발표 제목');
 const ops=value.ops.map((page,index)=>{
  if(!obj(page)||page.op!=='page'||!hex(page.bg)||!Array.isArray(page.items)||page.items.length<1||page.items.length>COMPOSE_LIMITS.items)bad(`${index+1}장의 요소를 확인해주세요.`);
  const topic=word(page.title,60,'장 제목'),notes=word(page.notes,COMPOSE_LIMITS.notes,'발표자 원고',true);
  const shares=new Set();
  const items=page.items.map(raw=>{
   return validateNativeItem(raw,request,shares);
  });
  if(!items.some(it=>it.t==='text'&&it.text.trim()))bad(`${index+1}장에 읽을 수 있는 제목이나 문구가 없어요.`);
  if(!items.some(it=>it.t==='text'&&!it.aw))bad(`${index+1}장의 모든 글이 클릭 뒤에 숨겨져 있어요. 첫 문구는 바로 보여야 해요.`);
  if(items.filter(it=>it.t==='image').length>3)bad('한 장의 사진은 세 개까지 사용해주세요.');
  return {op:'page',title:topic,bg:page.bg,notes,items,...effect(page,'tr')};
 });
 return {title,say,ops,dropped:0};
}
export function compositionSlides(value,request,photos=[]){
 const checked=validateComposition(value,request),photoMap=new Map(photos.map(p=>[p.id,p]));
 return checked.ops.map(page=>({id:newId('p'),bg:page.bg,topic:page.title.slice(0,40),notes:page.notes,...(page.tr?{tr:page.tr}:{}),items:page.items.map(raw=>{
  const {asset,...it}=raw;if(it.t==='image'){const photo=photoMap.get(asset);if(!photo?.url)bad('사진 원본을 다시 선택해주세요.');Object.assign(it,{url:photo.url,alt:photo.alt});}
  return {id:newId('e'),...it};
 })}));
}
