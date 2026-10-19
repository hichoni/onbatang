import {ONBATANG_FONTS} from '../fonts.js';

export class ImportFontError extends Error {
 constructor(code,message){super(message);this.name='ImportFontError';this.code=code;}
}
const fail=(code,message)=>{throw new ImportFontError(code,message);};
const labels=Object.freeze({'app-provided':'앱 제공 글꼴 적용',device:'기기 글꼴 확인',unknown:'기기 표시 확인 전',substituted:'현재 대체 중'});
const bundleLicense={licenseStatus:'bundled-ofl',licenseLabel:'앱 제공 파일 · OFL 확인',licenseNote:'앱에 포함된 글꼴 파일과 OFL 고지를 확인했어요.'};
const namedOflNote='KERIS가 안내한 이 이름의 글꼴은 OFL이에요. PPT에 지정된 이름만으로 원본 글꼴 파일의 진위나 동일성을 확인한 것은 아니에요.';
const microsoftNote='Microsoft 공식 FAQ의 Windows 제공 글꼴 안내예요. 기기에 있는 글꼴을 지정한 표시와 문서·출력 이용은 웹폰트 서버 재배포와 별개예요. 문서 내장은 파일의 내장 허용 정보와 앱 조건을 따르며, 다른 경로로 받은 파일은 해당 이용 조건을 확인해주세요.';
// Exact names only: neither a vendor-like prefix nor a font's price establishes its license.
const namedCatalog=[
 {key:'keris-bareondotum-b',aliases:['학교안심 바른돋움 B','학교안심 바른돋움B','학교안심바른돋움 B','학교안심바른돋움B','Hakgyoansim Bareondotum B','HakgyoansimBareondotumB'],licenseStatus:'official-ofl',licenseLabel:'OFL 공식 안내 확인',licenseUrl:'https://copyright.keris.or.kr/wft/fntDwnldView?fntGrpId=GFT202301110000000000001',licenseNote:namedOflNote},
 {key:'keris-yieodalligi-l',aliases:['학교안심 이어달리기 L','학교안심 이어달리기L','학교안심이어달리기 L','학교안심이어달리기L','Hakgyoansim Yieodalligi L','HakgyoansimYieodalligiL'],licenseStatus:'official-ofl',licenseLabel:'OFL 공식 안내 확인',licenseUrl:'https://copyright.keris.or.kr/wft/fntDwnldView?fntGrpId=GFT202509240000000000007',licenseNote:namedOflNote},
 {key:'microsoft-malgun',aliases:['맑은 고딕','맑은고딕','Malgun Gothic'],licenseStatus:'microsoft-usage',licenseLabel:'문서·기기 표시 가능 / 웹폰트 재배포 별도',licenseUrl:'https://learn.microsoft.com/en-us/typography/fonts/font-faq',licenseNote:microsoftNote},
 {key:'microsoft-calibri',aliases:['Calibri'],licenseStatus:'microsoft-usage',licenseLabel:'문서·기기 표시 가능 / 웹폰트 재배포 별도',licenseUrl:'https://learn.microsoft.com/en-us/typography/fonts/font-faq',licenseNote:microsoftNote},
];
const english=['Gowun Batang','Gowun Dodum','Do Hyeon','Jua','Bagel Fat One','Gugi','Dongle','Yeon Sung','Single Day','Poor Story','Gamja Flower','Hi Melody','Nanum Pen Script','Nanum Brush Script','East Sea Dokdo'];
export const DEFAULT_IMPORT_FONT_REGISTRY=Object.freeze(ONBATANG_FONTS.map((f,i)=>Object.freeze({
 id:f.id,name:f.name,desc:f.desc,family:'mc-'+f.id,aliases:Object.freeze([f.name,english[i]]),fontUrl:f.url,
 licenseUrl:new URL('../fonts/'+f.id+'-OFL.txt',import.meta.url).href
})));

/** One independent registry per application; host font IDs remain stable in saved plans. */
export function createImportFontServices({registry:entries=DEFAULT_IMPORT_FONT_REGISTRY}={}){
 if(!Array.isArray(entries)||entries.length>256)fail('INVALID_FONT_REGISTRY','앱 글꼴 목록을 확인해 주세요.');
 const ids=new Set();
 const registry=Object.freeze(entries.map(f=>{
  if(!f||typeof f.id!=='string'||!(/^[a-z][a-z0-9-]{0,63}$/).test(f.id)||ids.has(f.id)
    ||typeof f.name!=='string'||!f.name.trim()||f.name.length>240
    ||typeof f.family!=='string'||!(/^mc-[a-z\d-]{1,156}$/i).test(f.family)
    ||!Array.isArray(f.aliases)||!f.aliases.length||f.aliases.length>64||f.aliases.some(a=>typeof a!=='string'||!a.trim()||a.length>240||/[\u0000-\u001f\u007f]/.test(a))
    ||typeof f.fontUrl!=='string'||!f.fontUrl||typeof f.licenseUrl!=='string'||!f.licenseUrl)fail('INVALID_FONT_REGISTRY','앱 글꼴 목록을 확인해 주세요.');
  ids.add(f.id);
  let fontUrl,licenseUrl;try{fontUrl=new URL(f.fontUrl,import.meta.url).href;licenseUrl=new URL(f.licenseUrl,import.meta.url).href;}catch{fail('INVALID_FONT_REGISTRY','앱 글꼴 주소를 확인해 주세요.');}
  return Object.freeze({...f,fontUrl,licenseUrl,aliases:Object.freeze([...f.aliases]),license:'OFL-1.1',...bundleLicense,
    renderStatus:'app-provided',renderLabel:labels['app-provided'],status:'app-provided',statusLabel:labels['app-provided']});
 }));
const byId=new Map(registry.map(f=>[f.id,f]));
const normalize=name=>String(name??'').normalize('NFC').trim().replace(/^(['"])(.*)\1$/,'$2').replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const cleanName=name=>{
 if(typeof name!=='string'||!name.trim()||name.length>240||/[\u0000-\u001f\u007f]/.test(name))fail('INVALID_FONT_NAME','원본 글꼴 이름을 확인해 주세요.');
 return name.normalize('NFC').trim();
};
const matchingFont=name=>registry.find(f=>f.aliases.some(alias=>normalize(alias)===normalize(name)));
const namedFont=name=>namedCatalog.find(f=>f.aliases.some(alias=>normalize(alias)===normalize(name)));
const fontKey=name=>namedFont(name)?.key||matchingFont(name)?.id||normalize(name);
function licenseOf(name,bundle){
 if(bundle)return {...bundleLicense,licenseUrl:bundle.licenseUrl,sourceFileVerified:false};
 const named=namedFont(name);
 if(named)return {licenseStatus:named.licenseStatus,licenseLabel:named.licenseLabel,licenseUrl:named.licenseUrl,licenseNote:named.licenseNote,sourceFileVerified:false};
 return {licenseStatus:'unknown',licenseLabel:'이용 안내 확인 전',licenseUrl:null,licenseNote:'이 이름에 연결된 공식 이용 안내를 아직 확인하지 않았어요. 사용 금지를 뜻하지 않으며, 원본 파일을 받은 곳의 이용 조건을 확인해주세요.',sourceFileVerified:false};
}
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);

/** Only bundled files are verified here. A matching source name does not verify the source font file's license. */
function getImportFontRegistry(){return registry.map(f=>({...f,aliases:[...f.aliases]}));}

/** Page numbers refer to the original PPT, not the order of a selected subset. */
function cleanRule({scopePages='all',mappings={}}={}){
 if(scopePages!=='all'&&(!Array.isArray(scopePages)||scopePages.some(n=>!Number.isSafeInteger(n)||n<1)||new Set(scopePages).size!==scopePages.length))fail('INVALID_FONT_SCOPE','글꼴을 바꿀 원본 쪽 번호를 확인해 주세요.');
 if(!record(mappings))fail('INVALID_FONT_PLAN','글꼴 교체 목록을 확인해 주세요.');
 const normalized=new Set(),entries=[];
 for(const [key,target] of Object.entries(mappings)){
  const name=cleanName(key),norm=normalize(name);
  if(normalized.has(norm))fail('DUPLICATE_FONT_MAPPING','같은 원본 글꼴의 교체 규칙이 겹쳐요.');
  normalized.add(norm);
  if(target!==null&&!byId.has(target))fail('UNKNOWN_FONT_TARGET','앱에서 제공하는 교체 글꼴을 골라 주세요.');
  entries.push([name,target]);
 }
 return {scopePages:scopePages==='all'?'all':[...scopePages].sort((a,b)=>a-b),mappings:Object.fromEntries(entries)};
}
function createFontPlan({scopePages='all',mappings={},rules=[],sourceNamesByElementId={},fontNamesByElementId={}}={}){
 if(!record(sourceNamesByElementId)||!record(fontNamesByElementId)||!Array.isArray(rules)||rules.length>200||rules.some(rule=>!record(rule)))fail('INVALID_FONT_PLAN','글꼴 교체 목록을 확인해 주세요.');
 const sources=Object.fromEntries(Object.entries(sourceNamesByElementId).map(([id,name])=>{
  if(!id||id.length>240)fail('INVALID_ELEMENT_ID','글꼴의 요소 ID를 확인해 주세요.');
  return [id,cleanName(name)];
 }));
 const names=Object.fromEntries(Object.entries(fontNamesByElementId).map(([id,values])=>{
  if(!id||id.length>240||!Array.isArray(values)||values.length>64)fail('INVALID_FONT_INVENTORY','글상자 안의 원본 글꼴 목록을 확인해 주세요.');
  return [id,[...new Set(values.map(cleanName))]];
 }));
 return {version:1,...cleanRule({scopePages,mappings}),rules:rules.map(cleanRule),sourceNamesByElementId:sources,fontNamesByElementId:names};
}
function checkedPlan(plan){
 if(plan?.version!==undefined&&plan.version!==1)fail('FONT_PLAN_VERSION','지원하지 않는 글꼴 교체 계획이에요.');
 return createFontPlan(plan);
}
const planRules=plan=>[plan,...plan.rules];
function replacement(names,plan,pageNumber){
 const normalized=new Set((Array.isArray(names)?names:[names]).map(normalize));let selected=[];
 for(const rule of planRules(plan)){
  if(rule.scopePages!=='all'&&!rule.scopePages.includes(pageNumber))continue;
  const matches=Object.entries(rule.mappings).filter(([source])=>normalized.has(normalize(source)));
  if(!matches.length)continue;
  selected=matches;
 }
 if(new Set(selected.map(([,id])=>id)).size>1)fail('MIXED_FONT_TARGET_CONFLICT','한 글상자 안의 여러 원본 글꼴에 서로 다른 교체를 지정했어요. 글상자 전체에 쓸 글꼴 하나를 골라 주세요.');
 return selected[0]?.[1]?byId.get(selected[0][1]):null;
}
/** Returns a registry entry or null (keep the original). No arbitrary family or URL can become a target. */
function resolveImportFontReplacement(sourceFont,plan,pageNumber){
 const result=replacement(sourceFont,checkedPlan(plan),pageNumber);
 return result?{...result,aliases:[...result.aliases]}:null;
}
const pageOf=(page,index)=>Number.isSafeInteger(page?.source?.pageNumber)?page.source.pageNumber:Number.isSafeInteger(page?.pageNumber)?page.pageNumber:index+1;
const ownSource=(map,id)=>Object.hasOwn(map,id)?map[id]:undefined;
const originalOf=(item,map)=>ownSource(map,item.id)||item.typeface||byId.get(item.font)?.name||'원본 글꼴 정보 없음';

/** Always call on the preserved baseline; an empty plan is also the undo operation. */
function applyFontPlan(document,plan={}){
 const checked=checkedPlan(plan);
 if(!record(document)||!Array.isArray(document.slides))fail('INVALID_FONT_DOCUMENT','가져온 문서의 쪽을 확인해 주세요.');
 const next=structuredClone(document);
 next.slides.forEach((page,index)=>{
  if(!Array.isArray(page.items))fail('INVALID_FONT_DOCUMENT','가져온 쪽의 요소를 확인해 주세요.');
  for(const item of page.items){
   if(item.t!=='text')continue;
   const originals=[originalOf(item,checked.sourceNamesByElementId),...(ownSource(checked.fontNamesByElementId,item.id)||[])];
   const target=replacement(originals,checked,pageOf(page,index));
   if(target){item.font=target.id;delete item.typeface;}
  }
 });
 return next;
}

function usageOf(input,sources){
 const value=input?.document||input;
 const pages=Array.isArray(value?.slides)?value.slides:Array.isArray(value?.pages)?value.pages:Array.isArray(value)?value:value?.items?[value]:[];
 return pages.flatMap((page,index)=>{
  const number=pageOf(page,index);
  if(Array.isArray(page.fontUsage))return page.fontUsage.flatMap(u=>{
   const names=[...new Map([ownSource(sources,u.elementId)||u.originalName,...(Array.isArray(u.originalNames)?u.originalNames:[])].filter(v=>typeof v==='string'&&v.trim()).map(v=>[normalize(v),v])).values()];
   return names.map(originalName=>({elementId:u.elementId,pageNumber:u.pageNumber??number,originalName,appliedTypeface:u.appliedTypeface,appliedFontId:u.appliedFontId,mixed:names.length>1}));
  });
  return (page.slide?.items||page.items||[]).filter(item=>item.t==='text').map(item=>({elementId:item.id,pageNumber:number,originalName:originalOf(item,sources),appliedTypeface:item.typeface,appliedFontId:item.font,knownUsage:true}));
 });
}

/** deviceFonts must contain names actually verified by the caller; a requested CSS family is not that proof. */
function collectImportFonts(input,{sourceNamesByElementId={},fontNamesByElementId={},deviceFonts=[]}={}){
 if(!record(sourceNamesByElementId)||!record(fontNamesByElementId)||!Array.isArray(deviceFonts))fail('INVALID_FONT_INVENTORY','원본 글꼴 목록을 확인해 주세요.');
 const device=new Set(deviceFonts.map(fontKey)),groups=new Map();
 const usages=usageOf(input,sourceNamesByElementId).flatMap(usage=>{
  const names=ownSource(fontNamesByElementId,usage.elementId);if(!Array.isArray(names))return [usage];
  return [...new Map([usage.originalName,...names].map(name=>[normalize(name),name])).values()].map(originalName=>({...usage,originalName,mixed:names.length>1||usage.mixed}));
 });
 const seen=new Set();
 for(const usage of usages){
  if(typeof usage.originalName!=='string'||!usage.originalName.trim())continue;
  const sourceFont=cleanName(usage.originalName),key=normalize(sourceFont),target=byId.get(usage.appliedFontId);
  const usageKey=JSON.stringify([usage.pageNumber,usage.elementId,key]);if(usage.elementId&&seen.has(usageKey))continue;seen.add(usageKey);
  const originalMatch=matchingFont(sourceFont),family=usage.appliedTypeface||target?.family||'system-ui',name=usage.appliedTypeface||target?.name||'기본 글꼴';
  const changed=usage.appliedTypeface?fontKey(sourceFont)!==fontKey(usage.appliedTypeface):!target||!target.aliases.some(alias=>normalize(alias)===key);
  const status=changed?'substituted':target&&!usage.appliedTypeface?'app-provided':device.has(fontKey(sourceFont))?'device':'unknown';
  if(!groups.has(key))groups.set(key,{sourceFont,pageNumbers:new Set(),elementIds:new Set(),mixedElementIds:new Set(),count:0,applied:new Map(),statuses:new Set(),sourceMatchedTargetId:originalMatch?.id??null,...licenseOf(sourceFont,!changed&&!usage.appliedTypeface?target:null),sourceFileVerified:false,deviceAvailable:device.has(fontKey(sourceFont))?true:null});
  const group=groups.get(key);group.count++;group.pageNumbers.add(usage.pageNumber);if(usage.elementId)group.elementIds.add(usage.elementId);group.statuses.add(status);
  if(usage.mixed&&usage.elementId)group.mixedElementIds.add(usage.elementId);
  const appliedKey=usage.appliedTypeface?'face:'+normalize(family):'id:'+(target?.id||usage.appliedFontId||'gothic');
  const appliedStatus=target&&!usage.appliedTypeface?'app-provided':device.has(fontKey(family))?'device':'unknown';
  if(!group.applied.has(appliedKey))group.applied.set(appliedKey,{id:target?.id??null,family,name,count:0,status:appliedStatus,statusLabel:labels[appliedStatus],renderStatus:appliedStatus,renderLabel:labels[appliedStatus],...licenseOf(name,target&&!usage.appliedTypeface?target:null)});
  group.applied.get(appliedKey).count++;
 }
 return [...groups.values()].map(group=>{
  const statuses=[...group.statuses],status=statuses.includes('substituted')?'substituted':statuses.includes('unknown')?'unknown':statuses.includes('device')?'device':'app-provided';
  return {...group,pageNumbers:[...group.pageNumbers].sort((a,b)=>a-b),elementIds:[...group.elementIds],mixedElementIds:[...group.mixedElementIds],mixed:group.mixedElementIds.size>0,applied:[...group.applied.values()],statuses,status,statusLabel:labels[status],renderStatus:status,renderLabel:labels[status]};
 });
}

const base64=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);};
function abort(signal){if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');}
async function readBounded(response,max,signal){
 if(!response.ok)fail('FONT_ASSET_LOAD','앱 글꼴 파일을 불러오지 못했어요.');
 const length=Number(response.headers.get('content-length'));
 if(length>max)fail('FONT_ASSET_SIZE','앱 글꼴 파일 크기를 확인해 주세요.');
 if(!response.body?.getReader){const data=new Uint8Array(await response.arrayBuffer());if(data.length>max)fail('FONT_ASSET_SIZE','앱 글꼴 파일 크기를 확인해 주세요.');abort(signal);return data;}
 const reader=response.body.getReader(),parts=[];let lengthRead=0;
 try{while(true){abort(signal);const {done,value}=await reader.read();if(done)break;lengthRead+=value.length;if(lengthRead>max)fail('FONT_ASSET_SIZE','앱 글꼴 파일 크기를 확인해 주세요.');parts.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 const data=new Uint8Array(lengthRead);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}return data;
}

/** Fetch only our registry assets; sandbox previews receive data URLs and complete notices, without new remote-font permissions. */
async function loadImportFontAssets(plan={}, {fetchImpl=globalThis.fetch,signal}={}){
 const checked=checkedPlan(plan),ids=[...new Set(planRules(checked).flatMap(rule=>Object.values(rule.mappings)).filter(Boolean))];
 abort(signal);
 if(ids.length>25)fail('FONT_ASSET_SIZE','한 번에 바꾸는 앱 글꼴은 25종까지예요.');
 const loaded=await Promise.all(ids.map(async id=>{
  const font=byId.get(id),origin=new URL(import.meta.url).origin;
  for(const url of [font.fontUrl,font.licenseUrl])if(new URL(url).origin!==origin)fail('FONT_ASSET_ORIGIN','앱에 포함된 글꼴만 불러올 수 있어요.');
  const [fontResponse,licenseResponse]=await Promise.all([fetchImpl(font.fontUrl,{signal,redirect:'error'}),fetchImpl(font.licenseUrl,{signal,redirect:'error'})]);
  const [bytes,noticeBytes]=await Promise.all([readBounded(fontResponse,16*1024*1024,signal),readBounded(licenseResponse,128*1024,signal)]);
  const magic=String.fromCharCode(...bytes.slice(0,4));if(!['wOFF','wOF2'].includes(magic))fail('INVALID_FONT_ASSET','앱 글꼴 파일 형식을 확인해 주세요.');
  const notice=new TextDecoder().decode(noticeBytes);if(!/SIL OPEN FONT LICENSE/i.test(notice)||!/Version 1\.1/i.test(notice))fail('INVALID_FONT_LICENSE','앱 글꼴의 이용 조건을 확인하지 못했어요.');
  const format=magic==='wOF2'?'woff2':'woff',url=`data:font/${format};base64,${base64(bytes)}`;
  return {font:{id:font.id,name:font.name,desc:font.desc,family:font.family,url},notice:{id:font.id,license:font.license,licenseUrl:font.licenseUrl,text:notice},css:`/* ${notice.replaceAll('*/','* /').replaceAll('<','＜')} */\n@font-face{font-family:"${font.family}";src:url("${url}") format("${format}");font-display:swap;}`};
 }));
 abort(signal);
 return {fonts:loaded.map(v=>v.font),css:loaded.map(v=>v.css).join('\n'),licenseNotices:loaded.map(v=>v.notice),familiesBySource:Object.fromEntries(Object.entries(checked.mappings).filter(([,id])=>id).map(([source,id])=>[source,byId.get(id).family]))};
}

 return Object.freeze({getImportFontRegistry,createFontPlan,resolveImportFontReplacement,applyFontPlan,collectImportFonts,loadImportFontAssets});
}

export const defaultImportFontServices=createImportFontServices();
export const {getImportFontRegistry,createFontPlan,resolveImportFontReplacement,applyFontPlan,collectImportFonts,loadImportFontAssets}=defaultImportFontServices;
