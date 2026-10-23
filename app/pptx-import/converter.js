import {inflateSync,zlibSync} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {crc32} from '../zip.js';
import {cleanSize,DOCUMENT_LIMITS,SLIDE_LIMITS,legacyId,cleanNotes,slideNotes,cleanAlt,cleanTopic} from '../../src/document.js';
import {importConvertedDocument} from '../import-document.js';
import {bulletChar,autoNumber} from './bullets.js';

export const PPTX_MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const PPTX_CONVERTER_VERSION='1.3.2';
export const PPTX_LIMITS=Object.freeze({zipBytes:52428800,uncompressedBytes:104857600,files:2000,partBytes:33554432,xmlBytes:2097152,xmlTotalBytes:8388608,xmlNodes:100000,xmlTotalNodes:50000,xmlDepth:64,pages:200,imageBytes:256000,imageEdge:8192,imagePixels:16777216,documentBytes:524288});
const NS={p:'http://schemas.openxmlformats.org/presentationml/2006/main',a:'http://schemas.openxmlformats.org/drawingml/2006/main',r:'http://schemas.openxmlformats.org/officeDocument/2006/relationships',rels:'http://schemas.openxmlformats.org/package/2006/relationships'};
export class PptxConversionError extends Error {
  constructor(code,message,details={}){super(message||code);this.name='PptxConversionError';this.code=code;this.details=details;}
}
const fail=(code,message,details)=>{throw new PptxConversionError(code,message,details);};
const children=node=>Array.from(node?.childNodes||[]).filter(n=>n.nodeType===1);
const direct=(node,name,ns=NS.a)=>children(node).find(n=>n.localName===name&&n.namespaceURI===ns);
const P14='http://schemas.microsoft.com/office/powerpoint/2010/main';
const all=(node,name,ns=NS.a)=>Array.from(node?.getElementsByTagNameNS(ns,name)||[]);
const attr=(node,key)=>node?.getAttribute(key)||'';
const relationId=node=>node?.getAttributeNS(NS.r,'id')||'';
const ownPlaceholder=node=>{const name={sp:'nvSpPr',pic:'nvPicPr',cxnSp:'nvCxnSpPr',graphicFrame:'nvGraphicFramePr'}[node?.localName];return !!name&&!!direct(direct(direct(node,name,NS.p),'nvPr',NS.p),'ph',NS.p);};
const warning=(code,message,pageNumber)=>({code,message,...(pageNumber?{pageNumber}:{})});
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const digest=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
function check(signal){if(signal?.aborted)fail('CANCELLED','PPT 가져오기를 취소했어요.');}
function progress(options,phase,completed,total){check(options.signal);options.onProgress?.({phase,completed,total});}
function safePath(name){return !!name&&!name.startsWith('/')&&!/[\\\u0000-\u001f:]/.test(name)&&name.split('/').every(p=>p&&p!=='.'&&p!=='..');}

// Inspect central and local ZIP headers before inflation; do not trust compressed lengths or names.
function unpack(bytes){
  if(bytes[0]===0xd0&&bytes[1]===0xcf&&bytes[2]===0x11&&bytes[3]===0xe0)fail('ENCRYPTED_OR_LEGACY_PPT','암호화된 PPTX 또는 이전 PPT 형식은 열 수 없어요.');
  if(bytes.length<22)fail('INVALID_ZIP','PPTX 압축 파일이 올바르지 않아요.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder('utf-8',{fatal:true});
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
  if(end<0||view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0)fail('UNSUPPORTED_ZIP','나뉜 압축이나 ZIP64 자료는 지원하지 않아요.');
  const count=view.getUint16(end+10,true),length=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
  if(count===65535||start===0xffffffff||length===0xffffffff||count!==view.getUint16(end+8,true))fail('UNSUPPORTED_ZIP','ZIP64 자료는 지원하지 않아요.');
  if(count<1||count>PPTX_LIMITS.files||start+length!==end)fail('ZIP_LIMIT','압축 파일 수나 구조가 지원 범위를 벗어났어요.');
  let at=start,total=0,xmlTotal=0;const entries=new Map(),ranges=[];
  for(let n=0;n<count;n++){
    if(at+46>end||view.getUint32(at,true)!==0x02014b50)fail('INVALID_ZIP','압축 목록이 손상되었어요.');
    const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),compressed=view.getUint32(at+20,true),size=view.getUint32(at+24,true);
    const nameLength=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
    if(flags&1||flags&64)fail('ENCRYPTED_PPTX','암호화된 PPTX는 지원하지 않아요.');
    if(![0,8].includes(method)||size===0xffffffff||compressed===0xffffffff)fail('UNSUPPORTED_ZIP','이 압축 방식은 지원하지 않아요.');
    if(at+46+nameLength+extra+comment>end||local+30>start)fail('INVALID_ZIP','압축 항목 위치가 올바르지 않아요.');
    let name;try{name=decoder.decode(bytes.subarray(at+46,at+46+nameLength));}catch{fail('UNSAFE_ZIP_PATH','압축 항목 이름을 읽을 수 없어요.');}
    const directory=name.endsWith('/');if(!safePath(directory?name.slice(0,-1):name)||entries.has(name))fail('UNSAFE_ZIP_PATH','중복되거나 안전하지 않은 압축 경로예요.');
    total+=size;
    if(size>PPTX_LIMITS.partBytes||total>PPTX_LIMITS.uncompressedBytes||(directory&&size))fail('ZIP_LIMIT','압축을 푼 자료가 너무 커요.');
    if(/\.(xml|rels)$/i.test(name)){xmlTotal+=size;if(size>PPTX_LIMITS.xmlBytes||xmlTotal>PPTX_LIMITS.xmlTotalBytes)fail('XML_TOTAL_LIMIT','XML 전체 크기가 변환 한도를 넘어요.');}
    if(view.getUint32(local,true)!==0x04034b50||view.getUint16(local+6,true)!==flags||view.getUint16(local+8,true)!==method)fail('INVALID_ZIP','압축 머리말이 일치하지 않아요.');
    const localNameLength=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true),dataStart=local+30+localNameLength+localExtra;
    if(dataStart+compressed>start)fail('INVALID_ZIP','압축 데이터가 파일 범위를 벗어났어요.');
    let localName;try{localName=decoder.decode(bytes.subarray(local+30,local+30+localNameLength));}catch{fail('INVALID_ZIP','압축 경로가 올바르지 않아요.');}
    if(localName!==name||(!(flags&8)&&(view.getUint32(local+18,true)!==compressed||view.getUint32(local+22,true)!==size)))fail('INVALID_ZIP','압축 항목 정보가 일치하지 않아요.');
    ranges.push([local,dataStart+compressed]);entries.set(name,{size,crc:view.getUint32(at+16,true),directory,method,dataStart,compressed});at+=46+nameLength+extra+comment;
  }
  if(at!==end)fail('INVALID_ZIP','압축 목록 길이가 올바르지 않아요.');
  ranges.sort((a,b)=>a[0]-b[0]);if(ranges.some((r,i)=>i&&r[0]<ranges[i-1][1]))fail('INVALID_ZIP','압축 항목이 서로 겹쳐요.');
  const files=Object.create(null);
  for(const [name,entry]of entries){
    const compressed=bytes.subarray(entry.dataStart,entry.dataStart+entry.compressed);
    // An extra byte detects forged uncompressed lengths without allocating an unbounded output.
    try{files[name]=entry.method===0?compressed:inflateSync(compressed,{out:new Uint8Array(entry.size+1)});}catch{fail('INVALID_ZIP','압축 데이터를 풀지 못했어요.');}
    if(files[name].length!==entry.size||crc32(files[name])!==entry.crc)fail('ZIP_INTEGRITY','압축 항목의 길이나 검사 값이 다릅니다.');
  }
  return files;
}
function xmlText(bytes,name){
  if(!bytes||bytes.length>PPTX_LIMITS.xmlBytes)fail('XML_LIMIT','XML 항목이 없거나 너무 커요.',{part:name});
  let value;try{value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('UNSUPPORTED_XML_ENCODING','UTF-8 XML만 지원해요.',{part:name});}
  if(value.includes('\0')||/encoding\s*=\s*['"](?!utf-8['"]|us-ascii['"])/i.test(value))fail('UNSUPPORTED_XML_ENCODING','UTF-8 XML만 지원해요.',{part:name});
  if(/<!\s*(DOCTYPE|ENTITY)\b/i.test(value))fail('UNSAFE_XML','외부 선언이나 사용자 정의 엔티티가 있는 XML은 열지 않아요.',{part:name});
  return value;
}
function preflightXml(files){
  let totalNodes=0;
  for(const name of Object.keys(files))if(/\.(xml|rels)$/i.test(name)){
    const value=xmlText(files[name],name);
    // Conservative lexical budget counts starts, declarations and comments, including those in CDATA.
    // It intentionally runs before any DOM parser. Unused parts need no DOM allocation.
    for(let at=value.indexOf('<');at!==-1;at=value.indexOf('<',at+1))if(value[at+1]!=='/'&&++totalNodes>PPTX_LIMITS.xmlTotalNodes)fail('XML_TOTAL_LIMIT','XML 전체 요소 수가 변환 한도를 넘어요.');
  }
}
function parseXml(bytes,name){
  const value=xmlText(bytes,name);
  let document,invalid=false;
  try{document=new DOMParser({errorHandler:{warning(){invalid=true;},error(){invalid=true;},fatalError(){invalid=true;}}}).parseFromString(value,'application/xml');}catch{invalid=true;}
  if(invalid||!document?.documentElement)fail('INVALID_XML','XML 항목을 읽지 못했어요.',{part:name});
  const stack=[[document.documentElement,1]];let count=0;
  while(stack.length){const [node,depth]=stack.pop();if(++count>PPTX_LIMITS.xmlNodes||depth>PPTX_LIMITS.xmlDepth)fail('XML_LIMIT','XML 구조가 너무 복잡해요.',{part:name});for(const child of children(node))stack.push([child,depth+1]);}
  return document;
}
function ownerPart(path){return path==='_rels/.rels'?'':path.replace(/(^|\/)\_rels\//,'$1').replace(/\.rels$/,'');}
function resolveTarget(owner,target){
  let decoded;try{decoded=decodeURIComponent(target);}catch{fail('UNSAFE_RELATIONSHIP','자료 연결 주소를 읽을 수 없어요.');}
  if(!decoded||/[\\\u0000-\u001f:?#]/.test(decoded)||decoded.startsWith('//'))fail('UNSAFE_RELATIONSHIP','외부 또는 안전하지 않은 자료 연결이에요.');
  const parts=decoded.startsWith('/')?[]:owner.split('/').slice(0,-1);
  for(const part of decoded.replace(/^\//,'').split('/')){if(part==='..'){if(!parts.length)fail('UNSAFE_RELATIONSHIP','자료 연결이 압축 밖을 가리켜요.');parts.pop();}else if(part&&part!=='.')parts.push(part);}
  const path=parts.join('/');if(!safePath(path))fail('UNSAFE_RELATIONSHIP','자료 연결 경로가 올바르지 않아요.');return path;
}
const REQUIRED_PARTS=new Set(['officeDocument','slide','slideLayout','slideMaster','theme']);
const MS_RELS=/^https?:\/\/schemas\.microsoft\.com\/office\/[0-9a-z/._-]*relationships\/[A-Za-z0-9._/-]+$/;
// Office relationship kinds keep their short name (slide, image…). Microsoft's own media kinds keep theirs so a video
// page is still reported on its own page; any other well-formed kind becomes "x-…" and is ignored.
function relationType(type){
  for(const base of [NS.r,NS.rels])if(type.startsWith(base+'/')&&type.length>base.length+1)return type.slice(type.lastIndexOf('/')+1);
  if(MS_RELS.test(type)){const name=type.slice(type.lastIndexOf('/')+1);return ['media','video','audio'].includes(name)?name:'x-'+name;}
  return /^(https?:\/\/|urn:)[\x21-\x7e]+$/.test(type)?'x-'+type.slice(type.lastIndexOf('/')+1):'';
}
function relationships(files,xml){
  const result=new Map();
  for(const name of Object.keys(files).filter(n=>n.endsWith('.rels'))){
    const doc=xml(name),map=new Map(),owner=ownerPart(name);
    if(doc.documentElement.namespaceURI!==NS.rels||doc.documentElement.localName!=='Relationships')fail('INVALID_RELATIONSHIP','자료 연결 목록이 올바르지 않아요.');
    for(const node of children(doc.documentElement)){
      if(node.namespaceURI!==NS.rels||node.localName!=='Relationship')fail('INVALID_RELATIONSHIP','알 수 없는 자료 연결이에요.');
      const id=attr(node,'Id'),type=relationType(attr(node,'Type'));
      // Canva, Google Slides and newer PowerPoint add their own relationship kinds (Microsoft HD photos, media,
      // web extensions…) and sometimes repeat an Id. Those never block the package: unknown kinds are kept
      // under an "x-" name nothing reads, a repeated Id keeps its first meaning.
      if(!id||!type)fail('INVALID_RELATIONSHIP','자료 연결 ID 또는 종류가 올바르지 않아요.');
      if(map.has(id))continue;
      // External targets are never resolved or fetched. Hyperlink actions can be omitted;
      // linked content is reported on its own page instead of rejecting the entire package.
      if(attr(node,'TargetMode').toLowerCase()==='external'){map.set(id,{type,external:true});continue;}
      const target=resolveTarget(owner,attr(node,'Target'));
      if(!Object.hasOwn(files,target)){
        // A part the slides need must be there; a missing extra (thumbnail, properties, extension) is left out.
        if(REQUIRED_PARTS.has(type))fail('MISSING_PART','연결된 파일이 PPTX 안에 없어요.',{part:target});
        continue;
      }
      map.set(id,{type,target});
    }
    result.set(owner,map);
  }
  return result;
}
function extractText(body){
  return all(body,'p').map(p=>children(p).map(n=>n.localName==='br'?'\n':n.localName==='tab'?'\t':all(n,'t').map(t=>t.textContent).join('')).join('')).join('\n');
}
function rawSlideText(slide){return extractText(slide);}
/** 노트 쪽에서 발표자가 적은 글(본문 칸)만 읽는다. 쪽 번호·머리글·날짜 칸은 뺀다. */
function notesBodyText(notes){
  const body=all(notes,'sp',NS.p).filter(sp=>{const ph=all(sp,'ph',NS.p)[0];return ph&&(attr(ph,'type')==='body'||!attr(ph,'type')&&attr(ph,'idx')==='1');});
  return cleanNotes(body.map(sp=>all(sp,'txBody',NS.p).map(extractText).join('\n')).join('\n').replace(/\n+$/,''));
}
const paragraphText=p=>children(p).map(n=>n.localName==='br'?'\n':n.localName==='tab'?'\t':all(n,'t').map(t=>t.textContent).join('')).join('');
/** extractText with each paragraph's list marker (its own or inherited) written in front, since the editor has no lists. */
function bulletedText(body,styles=[]){
  const counters=new Map();
  return all(body,'p').map(p=>{
    const pPr=direct(p,'pPr'),level=Math.max(0,Math.min(8,Number(attr(pPr,'lvl'))||0)),text=paragraphText(p);
    const chain=[pPr,...styles.flatMap(style=>[direct(style,`lvl${level+1}pPr`),direct(style,'defPPr')])].filter(Boolean);
    const marker=chain.map(node=>direct(node,'buNone')?{none:true}:direct(node,'buChar')?{char:attr(direct(node,'buChar'),'char')}:direct(node,'buAutoNum')?{scheme:attr(direct(node,'buAutoNum'),'type'),start:Number(attr(direct(node,'buAutoNum'),'startAt'))||1}:null).find(Boolean);
    for(const key of [...counters.keys()])if(key>level)counters.delete(key);
    // PowerPoint draws no marker on an empty paragraph.
    if(!marker||marker.none||!text.trim()){if(text.trim())counters.delete(level);return text;}
    if(marker.char!==undefined){
      const font=chain.map(node=>direct(node,'buFontTx')?'':direct(node,'buFont')?attr(direct(node,'buFont'),'typeface'):null).find(value=>value!==null)??'';
      counters.delete(level);const char=bulletChar(marker.char,font);return char?`${char} ${text}`:text;
    }
    const last=counters.get(level),n=last?.scheme===marker.scheme?last.n+1:marker.start;
    counters.set(level,{scheme:marker.scheme,n});return `${autoNumber(marker.scheme,n)} ${text}`;
  }).join('\n');
}
const unit=value=>Math.max(0,Math.min(1,value));
function colorTransforms(value,node,warn){
  let rgb=[1,3,5].map(at=>parseInt(value.slice(at,at+2),16)/255);
  for(const transform of children(node)){
    const kind=transform.localName,raw=attr(transform,'val');
    const amount=/^[+-]?\d+$/.test(raw)?Number(raw)/100000:/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(raw)?Number(raw.slice(0,-1))/100:NaN;
    if(transform.namespaceURI!==NS.a||children(transform).length||!['lumMod','lumOff','tint','shade'].includes(kind)||!Number.isFinite(amount)||(['tint','shade'].includes(kind)&&(amount<0||amount>1))){
      // Alpha belongs to each fill/stroke, whereas the editor's opacity belongs
      // to the whole element. Keep disclosing that limitation rather than
      // silently applying a fill's alpha to its otherwise opaque text or line.
      warn('COLOR_TRANSFORM_APPROXIMATE','일부 투명도·색 변환은 적용하지 못했어요. 원본과 비교해 주세요.');continue;
    }
    if(kind==='tint')rgb=rgb.map(channel=>channel*amount+1-amount);
    else if(kind==='shade')rgb=rgb.map(channel=>channel*amount);
    else{
      // DrawingML luminance transforms change HSL lightness, preserving hue
      // and saturation. RGB multiplication would darken the wrong components.
      const low=Math.min(...rgb),high=Math.max(...rgb),light=(low+high)/2,chroma=high-low;
      const next=unit(kind==='lumMod'?light*amount:light+amount);
      const saturation=chroma?chroma/(1-Math.abs(2*light-1)):0,nextChroma=(1-Math.abs(2*next-1))*saturation;
      rgb=chroma?rgb.map(channel=>(channel-low)*nextChroma/chroma+next-nextChroma/2):[next,next,next];
    }
  }
  return '#'+rgb.map(channel=>Math.round(unit(channel)*255).toString(16).padStart(2,'0')).join('');
}
function color(node,fallback,warn){
  const rgb=direct(node,'srgbClr');if(rgb&&/^[a-fA-F0-9]{6}$/.test(attr(rgb,'val')))return colorTransforms('#'+attr(rgb,'val').toLowerCase(),rgb,warn);
  const system=direct(node,'sysClr');if(system&&/^[a-fA-F0-9]{6}$/.test(attr(system,'lastClr')))return colorTransforms('#'+attr(system,'lastClr').toLowerCase(),system,warn);
  const scheme=direct(node,'schemeClr'),schemeName=attr(scheme,'val'),mapped=warn.colorMap?.[schemeName]||schemeName;
  if(scheme&&warn.themeColors?.[mapped])return colorTransforms(warn.themeColors[mapped],scheme,warn);
  if(node&&children(node).length)warn('THEME_COLOR_FALLBACK','테마 색은 기본 색으로 바꿨어요. 원본과 색을 비교해 주세요.');
  return fallback;
}
const IDENTITY=[1,0,0,1,0,0];
const matrixPoint=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const matrixProduct=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
function groupMatrix(group){
  const transform=direct(direct(group,'grpSpPr',NS.p),'xfrm'),off=direct(transform,'off'),ext=direct(transform,'ext'),chOff=direct(transform,'chOff'),chExt=direct(transform,'chExt');
  const raw=[attr(off,'x'),attr(off,'y'),attr(ext,'cx'),attr(ext,'cy'),attr(chOff,'x'),attr(chOff,'y'),attr(chExt,'cx'),attr(chExt,'cy')];
  if(raw.some(n=>!/^[-+]?\d+$/.test(n)))fail('INVALID_GROUP','그룹 좌표를 읽을 수 없어요.');
  const [x,y,w,h,cx,cy,cw,ch]=raw.map(Number);
  if(raw.some(n=>!Number.isSafeInteger(Number(n)))||Math.min(w,h,cw,ch)<=0)fail('INVALID_GROUP','그룹 크기가 올바르지 않아요.');
  const angle=Number(attr(transform,'rot')||0)/60000*Math.PI/180;
  if(!Number.isFinite(angle))fail('INVALID_GROUP','그룹 회전 값이 올바르지 않아요.');
  const sx=w/cw*(['1','true'].includes(attr(transform,'flipH'))?-1:1),sy=h/ch*(['1','true'].includes(attr(transform,'flipV'))?-1:1),cos=Math.cos(angle),sin=Math.sin(angle);
  const m=[cos*sx,sin*sx,-sin*sy,cos*sy,0,0];
  m[4]=x+w/2-m[0]*(cx+cw/2)-m[2]*(cy+ch/2);m[5]=y+h/2-m[1]*(cx+cw/2)-m[3]*(cy+ch/2);return m;
}
function* slideObjects(tree,warn,reject,matrix=IDENTITY,depth=0){
  for(const object of children(tree)){
    if(['nvGrpSpPr','grpSpPr'].includes(object.localName))continue;
    if(object.namespaceURI===NS.p&&object.localName==='grpSp'){
      try{if(['1','true'].includes(attr(direct(direct(object,'nvGrpSpPr',NS.p),'cNvPr',NS.p),'hidden')))fail('UNSUPPORTED_HIDDEN_OBJECT','숨긴 그룹이 있는 장은 아직 가져올 수 없어요.');if(depth>=12)fail('GROUP_LIMIT','그룹이 너무 깊게 중첩되어 있어요.');const next=matrixProduct(matrix,groupMatrix(object));warn('GROUP_FLATTENED','그룹의 위치·크기·순서를 유지하고 개별 편집 요소로 옮겼어요.');yield* slideObjects(object,warn,reject,next,depth+1);}
      catch(error){if(error instanceof PptxConversionError)reject(error.code,error.message);else throw error;}
    }else yield {object,matrix};
  }
}
function geometry(properties,size,warn,{line=false,matrix=IDENTITY}={}){
  const transform=direct(properties,'xfrm'),off=direct(transform,'off'),ext=direct(transform,'ext');
  if(!transform||!off||!ext)fail('INHERITED_GEOMETRY','틀에서 물려받은 위치는 아직 가져올 수 없어요.');
  const numbers=[attr(off,'x'),attr(off,'y'),attr(ext,'cx'),attr(ext,'cy')];
  if(numbers.some(n=>!/^[-+]?\d+$/.test(n)))fail('INVALID_GEOMETRY','요소 위치가 올바르지 않아요.');
  let [left,top,width,height]=numbers.map(Number);
  if(![left,top,width,height].every(Number.isSafeInteger)||width<0||height<0||(!line&&(width===0||height===0))||(line&&width===0&&height===0))fail('INVALID_GEOMETRY','요소 크기가 올바르지 않아요.');
  let rot=Number(attr(transform,'rot')||0)/60000;if(!Number.isFinite(rot))fail('INVALID_GEOMETRY','요소 회전 값이 올바르지 않아요.');
  let fx=['1','true'].includes(attr(transform,'flipH')),fy=['1','true'].includes(attr(transform,'flipV'));
  const radians=rot*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians),u=[matrix[0]*c+matrix[2]*s,matrix[1]*c+matrix[3]*s],v=[-matrix[0]*s+matrix[2]*c,-matrix[1]*s+matrix[3]*c];
  const scaleX=Math.hypot(...u),scaleY=Math.hypot(...v);
  if(!scaleX||!scaleY||Math.abs(u[0]*v[0]+u[1]*v[1])>scaleX*scaleY*0.00001)fail('UNSUPPORTED_GROUP_SKEW','기울어진 그룹 안의 요소는 아직 가져올 수 없어요.');
  const center=matrixPoint(matrix,left+width/2,top+height/2);width*=scaleX;height*=scaleY;left=center[0]-width/2;top=center[1]-height/2;
  rot=Math.atan2(u[1],u[0])*180/Math.PI;if(u[0]*v[1]-u[1]*v[0]<0)fy=!fy;
  const x=center[0]/size.width*100,y=center[1]/size.height*100,w=width/size.width*100,h=height/size.height*100;
  if(x<0||x>100||y<0||y>100)fail('UNSUPPORTED_GEOMETRY','화면 밖에 중심이 있는 요소는 가져올 수 없어요.');
  rot=((rot+180)%360+360)%360-180;if(rot!==Math.round(rot))warn('ROTATION_ROUNDED','회전 각도를 정수로 반올림했어요.');
  return {x,y,w,h,rot:Math.round(rot),fx,fy,left,top,width,height,scaleX,scaleY};
}
const position=g=>({x:g.x,y:g.y,w:g.w,h:g.h,rot:g.rot,fx:g.fx,fy:g.fy});
const MEDIA_TYPES={mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav'};
// PowerPoint 의 "자동으로" 트는 영상: 그 요소를 트는 명령(playFrom)이 장이 열릴 때 시작하는 묶음(evt="onBegin") 안에 있다.
// 그렇지 않으면(명령이 없거나 "클릭할 때") 누를 때 튼다.
function autoPlays(root,objectId){
  for(const cmd of all(root,'cmd',NS.p)){
    if(!/^playFrom/.test(attr(cmd,'cmd')||''))continue;
    if(attr(all(cmd,'spTgt',NS.p)[0],'spid')!==String(objectId))continue;
    for(let node=cmd.parentNode;node&&node!==root;node=node.parentNode){
      const conds=direct(node,'stCondLst',NS.p);
      if(conds&&children(conds).some(c=>c.localName==='cond'&&attr(c,'evt')==='onBegin'))return true;
    }
  }
  return false;
}
/** 그림 요소에 딸린 영상 · 소리 { kind, path, mime, bytes(이 파일 안에 있을 때만) }. 없으면 null. */
function mediaOf(object,pageRels,files){
  const nvPr=direct(direct(object,'nvPicPr',NS.p),'nvPr',NS.p);if(!nvPr)return null;
  const video=direct(nvPr,'videoFile'),audio=direct(nvPr,'audioFile')||direct(nvPr,'wavAudioFile'),embedded=all(nvPr,'media',P14)[0];
  if(!video&&!audio&&!embedded)return null;
  const ids=[embedded?.getAttributeNS(NS.r,'embed'),(video||audio)?.getAttributeNS(NS.r,'link'),(video||audio)?.getAttributeNS(NS.r,'embed')].filter(Boolean);
  const rel=ids.map(id=>pageRels.get(id)).find(r=>r&&!r.external&&files[r.target]);
  const path=rel?.target||'',ext=path.slice(path.lastIndexOf('.')+1).toLowerCase(),mime=MEDIA_TYPES[ext]||'';
  const kind=audio||mime.startsWith('audio/')?'audio':'video';
  return {kind,path,mime,...(rel&&mime.startsWith('video/')?{bytes:files[rel.target]}:{})};
}
// 표(a:tbl): 칸마다 네모(채움 · 테두리)와 글상자 하나로 옮긴다. 합친 칸(gridSpan · rowSpan)은 하나로, 덮인 칸(hMerge · vMerge)은 건너뛴다.
// 칸의 높이는 원본 행 높이를 표 틀의 크기에 맞춰 나눈다(글이 넘쳐 늘어난 행도 틀 크기에는 들어 있다).
function tableItems(object,tbl,{meta,size,matrix,warn,fonts}){
  const frame=direct(object,'xfrm',NS.p);
  if(!frame)fail('INHERITED_GEOMETRY','틀에서 물려받은 위치는 아직 가져올 수 없어요.');
  const g=geometry({childNodes:[{nodeType:1,localName:'xfrm',namespaceURI:NS.a,childNodes:frame.childNodes,getAttribute:key=>frame.getAttribute(key)}]},size,warn,{matrix});
  if(g.rot||g.fx||g.fy)fail('UNSUPPORTED_TABLE_ROTATION','돌리거나 뒤집은 표는 아직 가져올 수 없어요.');
  const cols=children(direct(tbl,'tblGrid')).filter(n=>n.localName==='gridCol').map(n=>Number(attr(n,'w')));
  const rows=children(tbl).filter(n=>n.localName==='tr'&&n.namespaceURI===NS.a),heights=rows.map(r=>Number(attr(r,'h')));
  if(!cols.length||!rows.length||cols.length>40||rows.length>60||[...cols,...heights].some(v=>!Number.isSafeInteger(v)||v<=0))fail('INVALID_TABLE','표의 칸 정보를 읽을 수 없어요.');
  const sumW=cols.reduce((a,b)=>a+b,0),sumH=heights.reduce((a,b)=>a+b,0),sx=g.width/sumW,sy=g.height/sumH;
  const before=(list,end)=>list.slice(0,end).reduce((a,b)=>a+b,0),span=(list,from,n)=>list.slice(from,from+n).reduce((a,b)=>a+b,0);
  const yes=v=>['1','true'].includes(v),cells=[];
  rows.forEach((row,r)=>children(row).filter(n=>n.localName==='tc'&&n.namespaceURI===NS.a).forEach((tc,c)=>{
    if(c>=cols.length)fail('INVALID_TABLE','표의 칸 수가 열 수보다 많아요.');
    if(yes(attr(tc,'hMerge'))||yes(attr(tc,'vMerge')))return;
    const w=Math.max(1,Math.min(cols.length-c,Number(attr(tc,'gridSpan'))||1)),h=Math.max(1,Math.min(rows.length-r,Number(attr(tc,'rowSpan'))||1));
    cells.push({tc,r,c,left:g.left+before(cols,c)*sx,top:g.top+before(heights,r)*sy,width:span(cols,c,w)*sx,height:span(heights,r,h)*sy});
  }));
  const pct=(v,total)=>v/total*100,items=[];
  const styled=cells.some(({tc})=>{const p=direct(tc,'tcPr');return direct(p,'solidFill')||['lnL','lnR','lnT','lnB'].some(k=>visibleLine(direct(p,k)));});
  if(!styled)warn('TABLE_STYLE_APPROXIMATE','표 스타일은 흰 칸과 옅은 테두리로 옮겼어요. 색은 원본과 다를 수 있어요.');
  for(const {tc,r,c,left,top,width,height} of cells){
    const props=direct(tc,'tcPr'),solid=direct(props,'solidFill');
    if(direct(props,'gradFill')||direct(props,'pattFill')||direct(props,'blipFill'))warn('TABLE_FILL_APPROXIMATE','그라데이션 · 그림으로 채운 칸은 단색으로 옮겼어요.');
    const edges=['lnL','lnR','lnT','lnB'].map(k=>direct(props,k)).filter(visibleLine).sort((a,b)=>Number(attr(b,'w')||12700)-Number(attr(a,'w')||12700));
    const box={x:pct(left+width/2,size.width),y:pct(top+height/2,size.height),w:pct(width,size.width),h:pct(height,size.height),rot:0,fx:false,fy:false};
    if(box.x<0||box.x>100||box.y<0||box.y>100||box.w<0.01||box.w>140||box.h<0.01||box.h>140)fail('UNSUPPORTED_GEOMETRY','표 칸의 배치가 편집 범위를 벗어났어요.');
    if(solid||edges.length||!styled){
      const shape={...meta(`cell:${r}:${c}`),t:'shape',...box,shape:'rect',color:solid?color(solid,'#ffffff',warn):'#ffffff'};
      if(edges.length){shape.line=Math.max(0.01,Math.min(4,lineWidth(edges[0],size)*g.scaleX));shape.lc=color(direct(edges[0],'solidFill'),'#222222',warn);if(!solid&&styled)shape.hollow=true;}
      else if(!styled){shape.line=0.06;shape.lc='#c9ced6';}
      if(edges.length>1&&new Set(edges.map(e=>attr(e,'w')+color(direct(e,'solidFill'),'#222222',()=>{}))).size>1)warn('TABLE_BORDER_APPROXIMATE','칸마다 다른 테두리는 가장 굵은 테두리 하나로 옮겼어요.');
      items.push(shape);
    }
    const body=direct(tc,'txBody'),value=body?extractText(body):'';
    if(!value.trim())continue;
    if(value.length>SLIDE_LIMITS.text)fail('TEXT_LIMIT',`한 칸의 글이 ${SLIDE_LIMITS.text}자를 넘어요.`);
    const first=all(body,'rPr')[0]||all(body,'endParaRPr')[0],paragraph=direct(children(body).find(n=>n.localName==='p'),'pPr');
    const points=Number(attr(first,'sz')||1800)/100;
    if(!Number.isFinite(points)||points<=0)fail('INVALID_TEXT_SIZE','글자 크기가 올바르지 않아요.');
    const wanted=points*g.scaleY/(size.width/12700)*100,fontSize=Math.max(0.1,Math.min(30,wanted));
    const margin=(key,fallback)=>{const raw=attr(props,key);return /^\d+$/.test(raw)?Number(raw):fallback;};
    const l=margin('marL',91440)*g.scaleX,rr=margin('marR',91440)*g.scaleX,t=margin('marT',45720)*g.scaleY,b=margin('marB',45720)*g.scaleY;
    const innerW=Math.max(width*0.2,width-l-rr),innerH=Math.max(height*0.2,height-t-b),cx=left+l+innerW/2,cy=top+t+innerH/2;
    for(const node of [...all(body,'latin'),...all(body,'ea')]){const font=attr(node,'typeface');if(font&&!font.startsWith('+')&&font.length<=240&&!/[\u0000-\u001f]/.test(font))fonts.add(font);}
    if(all(body,'rPr').length>1)warn('RICH_TEXT_FLATTENED','문단 안의 여러 서식은 첫 글자 서식으로 통일했어요.');
    const textFill=direct(first,'solidFill');
    items.push({...meta(`cell-text:${r}:${c}`),t:'text',x:pct(cx,size.width),y:pct(cy,size.height),w:pct(innerW,size.width),h:pct(innerH,size.height),rot:0,
      size:fontSize,font:'gothic',color:color(textFill,'#222222',warn),bold:yes(attr(first,'b')),italic:yes(attr(first,'i')),under:attr(first,'u')==='sng',
      align:{l:'l',ctr:'c',r:'r'}[attr(paragraph,'algn')]||'l',valign:({ctr:'middle',b:'bottom'})[attr(props,'anchor')]||'top',lh:1.2,nowrap:false,hangingPunct:false,text:value});
  }
  warn('TABLE_AS_SHAPES','표를 칸마다 네모와 글상자로 옮겼어요. 칸을 더하거나 합치는 표 편집은 아직 없어요.');
  return items;
}
function visibleLine(line){
  if(!line||direct(line,'noFill')||attr(line,'w')==='0')return false;
  return !!attr(line,'w')||children(line).some(node=>node.localName!=='extLst');
}
function lineWidth(line,size){
  const raw=attr(line,'w')||'12700';
  if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)<=0)fail('INVALID_GEOMETRY','선 굵기가 올바르지 않아요.');
  return Number(raw)/size.width*100;
}
// Recognize only the concrete OOXML capsule path. Arbitrary custom paths must
// remain unsupported; flattening every custom shape to a rectangle loses content.
function customCapsule(custom,g){
  const paths=children(direct(custom,'pathLst'));if(paths.length!==1)return false;
  const path=paths[0],w=Number(attr(path,'w')),h=Number(attr(path,'h')),r=h/2;
  if(!(Number.isSafeInteger(w)&&Number.isSafeInteger(h)&&w>=h&&h>0)||Math.abs(w*g.height-h*g.width)>Math.max(w*g.height,h*g.width)*0.00001)return false;
  const commands=children(path),types=['moveTo','lnTo','arcTo','lnTo','arcTo','lnTo','arcTo','lnTo','arcTo','close'];
  if(commands.length!==types.length||commands.some((node,i)=>node.localName!==types[i]))return false;
  const close=(a,b)=>a!==''&&Number.isFinite(Number(a))&&Math.abs(Number(a)-b)<=1;
  for(const [i,x,y]of [[0,r,0],[1,w-r,0],[3,w,r],[5,r,h],[7,0,r]]){
    const pt=direct(commands[i],'pt');if(!close(attr(pt,'x'),x)||!close(attr(pt,'y'),y))return false;
  }
  for(const [i,angle]of [[2,16200000],[4,0],[6,5400000],[8,10800000]])if(!close(attr(commands[i],'wR'),r)||!close(attr(commands[i],'hR'),r)||!close(attr(commands[i],'stAng'),angle)||!close(attr(commands[i],'swAng'),5400000))return false;
  return true;
}
function paragraphHanging(paragraph,styles=[]){
  const raw=attr(paragraph,'hangingPunct');
  if(raw!=='')return !['0','false'].includes(raw);
  const level=Number(attr(paragraph,'lvl')||0)+1;
  for(const style of styles){
    for(const node of [direct(style,`lvl${level}pPr`),direct(style,'defPPr')]){
      const value=attr(node,'hangingPunct');if(value!=='')return !['0','false'].includes(value);
    }
  }
  // Office differs from the standard's implied false (MS-OI29500 2.1.1406d).
  return true;
}
function textFrame(bodyPr,paragraph,g,size,points,warn,hangingPunct){
  const inset=(key,fallback)=>{
    const raw=attr(bodyPr,key);if(raw&&!/^\d+$/.test(raw))fail('INVALID_GEOMETRY','글상자 안쪽 여백이 올바르지 않아요.');
    return raw===''?fallback:Number(raw);
  };
  const l=inset('lIns',91440)*g.scaleX,r=inset('rIns',91440)*g.scaleX,t=inset('tIns',45720)*g.scaleY,b=inset('bIns',45720)*g.scaleY;
  const width=g.width-l-r,height=g.height-t-b;
  if(!(width>0&&height>0))fail('INVALID_GEOMETRY','글상자 안쪽 크기가 올바르지 않아요.');
  const angle=g.rot*Math.PI/180,dx=(l-r)/2,dy=(t-b)/2;
  const x=g.x+(dx*Math.cos(angle)-dy*Math.sin(angle))/size.width*100,y=g.y+(dx*Math.sin(angle)+dy*Math.cos(angle))/size.height*100,w=width/size.width*100,h=height/size.height*100;
  if(x<0||x>100||y<0||y>100||w<0.1||w>100||h<0.01||h>140)fail('UNSUPPORTED_GEOMETRY','글상자 배치가 편집 범위를 벗어났어요.');
  const spacing=direct(paragraph,'lnSpc'),spcPts=direct(spacing,'spcPts'),spcPct=direct(spacing,'spcPct');
  const desired=spcPts?Number(attr(spcPts,'val'))/100/points:spcPct?Number(attr(spcPct,'val'))/100000:1.25;
  if(!Number.isFinite(desired)||desired<=0)fail('INVALID_TEXT_SIZE','줄 간격이 올바르지 않아요.');
  const lh=Math.max(0.5,Math.min(4,desired));if(lh!==desired)warn('LINE_HEIGHT_ADJUSTED','줄 간격을 편집기가 지원하는 범위로 맞췄어요.');
  return {x,y,w,h,lh,nowrap:attr(bodyPr,'wrap')==='none',hangingPunct,valign:({ctr:'middle',b:'bottom'})[attr(bodyPr,'anchor')]||'top'};
}
const base64=bytes=>{let value='';for(let at=0;at<bytes.length;at+=8192)value+=String.fromCharCode(...bytes.subarray(at,at+8192));return btoa(value);};
// migrateRecord also keeps each distinct data URL in uploads. Include that
// storage copy in page budgets; per-page sums conservatively count shared images.
const storedItemBytes=items=>new TextEncoder().encode(JSON.stringify(items)).length+new TextEncoder().encode(JSON.stringify([...new Set(items.filter(i=>i.t==='image').map(i=>i.url))])).length;
function imageMime(bytes,path){
  const extension=path.split('.').pop().toLowerCase();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(at,length)=>new TextDecoder().decode(bytes.subarray(at,at+length));
  const checked=(mime,width,height)=>{
    if(!width||!height)fail('INVALID_IMAGE','그림의 화면 크기를 읽을 수 없어요.');
    if(width>PPTX_LIMITS.imageEdge||height>PPTX_LIMITS.imageEdge||width*height>PPTX_LIMITS.imagePixels)fail('IMAGE_DIMENSION_LIMIT','그림의 픽셀 크기가 너무 커요.');
    return {mime,width,height};
  };
  if(extension==='png'&&bytes.length>=33&&hex(bytes.subarray(0,8))==='89504e470d0a1a0a'&&ascii(12,4)==='IHDR'&&view.getUint32(8)===13){
    const result=checked('image/png',view.getUint32(16),view.getUint32(20));let at=8,hasData=false,hasEnd=false,count=0;
    while(at+12<=bytes.length){const length=view.getUint32(at),kind=ascii(at+4,4);if(++count>10000||at+12+length>bytes.length||crc32(bytes.subarray(at+4,at+8+length))!==view.getUint32(at+8+length))fail('INVALID_IMAGE','PNG 그림 구조나 검사 값이 올바르지 않아요.');if(['acTL','fcTL','fdAT'].includes(kind))fail('UNSUPPORTED_ANIMATED_IMAGE','움직이는 PNG는 정적 그림으로 바꾼 뒤 가져와 주세요.');if(kind==='IDAT')hasData=true;at+=12+length;if(kind==='IEND'){hasEnd=length===0;break;}}
    if(!hasData||!hasEnd||at!==bytes.length)fail('INVALID_IMAGE','PNG 그림의 본문이나 끝 부분이 없어요.');return result;
  }
  if(['jpg','jpeg'].includes(extension)&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255){
    if(bytes.at(-2)!==255||bytes.at(-1)!==217)fail('INVALID_IMAGE','JPEG 그림의 끝 부분이 없어요.');
    let at=2;
    while(at+4<=bytes.length){
      if(bytes[at++]!==255)break;while(bytes[at]===255)at++;const marker=bytes[at++];
      if(marker===0xd9||marker===0xda)break;if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;
      if(at+2>bytes.length)break;const length=view.getUint16(at);if(length<2||at+length>bytes.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8)return checked('image/jpeg',view.getUint16(at+5),view.getUint16(at+3));
      at+=length;
    }
    fail('INVALID_IMAGE','JPEG 그림의 크기 정보를 읽을 수 없어요.');
  }
  if(extension==='webp'&&bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
    const format=ascii(12,4),u24=at=>bytes[at]|bytes[at+1]<<8|bytes[at+2]<<16;
    if(format==='VP8X'){if(bytes[20]&2)fail('UNSUPPORTED_ANIMATED_IMAGE','움직이는 WebP 그림은 아직 가져올 수 없어요.');return checked('image/webp',u24(24)+1,u24(27)+1);}
    if(format==='VP8L'&&bytes[20]===0x2f){const bits=view.getUint32(21,true);return checked('image/webp',(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);}
    if(format==='VP8 '&&hex(bytes.subarray(23,26))==='9d012a')return checked('image/webp',view.getUint16(26,true)&0x3fff,view.getUint16(28,true)&0x3fff);
    fail('INVALID_IMAGE','WebP 그림의 크기 정보를 읽을 수 없어요.');
  }
  fail('UNSUPPORTED_IMAGE','PNG·JPEG·WebP 그림만 가져올 수 있어요.');
}

function pngChunk(type,data){
  const out=new Uint8Array(data.length+12),view=new DataView(out.buffer);view.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);view.setUint32(out.length-4,crc32(out.subarray(4,out.length-4)));return out;
}
// A strict, non-executing decoder for the common EMF wrapper containing exactly
// one uncompressed RGB DIB. No GDI commands, palettes, scripts or external data run.
// Layout: MS-EMF 2.3.1.7 EMR_STRETCHDIBITS; Win32 BITMAPINFOHEADER.
function emfBitmap(bytes){
  const reject=()=>fail('UNSUPPORTED_IMAGE','단일 RGB 비트맵이 아닌 EMF 그림은 아직 가져올 수 없어요.');
  if(bytes.length<128)return reject();const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const header=v.getUint32(4,true);
  if(v.getUint32(0,true)!==1||header<88||header>bytes.length-100||v.getUint32(40,true)!==0x464d4520||v.getUint32(48,true)!==bytes.length||v.getUint32(52,true)!==3)return reject();
  const at=header,length=v.getUint32(at+4,true),end=at+length;
  if(v.getUint32(at,true)!==81||length<120||end>bytes.length-20||v.getUint32(end,true)!==14||v.getUint32(end+4,true)!==bytes.length-end)return reject();
  const bmi=v.getUint32(at+48,true),bmiLength=v.getUint32(at+52,true),bits=v.getUint32(at+56,true),bitsLength=v.getUint32(at+60,true);
  if(bmi<80||bmiLength!==40||bmi+40>length||bits<bmi+40||bits+bitsLength>length||v.getUint32(at+64,true)!==0||v.getUint32(at+68,true)!==0x00cc0020)return reject();
  const base=at+bmi,w=v.getInt32(base+4,true),signedHeight=v.getInt32(base+8,true),h=Math.abs(signedHeight),bpp=v.getUint16(base+14,true);
  if(v.getUint32(base,true)!==40||w<=0||!h||v.getUint16(base+12,true)!==1||![24,32].includes(bpp)||v.getUint32(base+16,true)!==0||v.getUint32(base+32,true)!==0)return reject();
  if(w>PPTX_LIMITS.imageEdge||h>PPTX_LIMITS.imageEdge||w*h>PPTX_LIMITS.imagePixels)fail('IMAGE_DIMENSION_LIMIT','그림의 픽셀 크기가 너무 커요.');
  const stride=Math.ceil(w*bpp/32)*4,sourceW=v.getInt32(at+40,true),sourceH=v.getInt32(at+44,true);
  if(stride*h!==bitsLength||[24,28,32,36].some(n=>v.getInt32(at+n,true)!==0)||sourceW<w||sourceW>w+3||sourceH!==h||v.getInt32(at+72,true)!==sourceW||v.getInt32(at+76,true)!==sourceH)return reject();
  if([8,12,24,28].some(n=>v.getInt32(n,true)!==0)||v.getInt32(16,true)!==sourceW-1||v.getInt32(20,true)!==sourceH-1||v.getInt32(32,true)<=0||v.getInt32(36,true)<=0||[8,12].some(n=>v.getInt32(at+n,true)!==0)||v.getInt32(at+16,true)!==sourceW-1||v.getInt32(at+20,true)!==sourceH-1)return reject();
  const rows=new Uint8Array((w*3+1)*h),pixelBytes=bpp/8;
  for(let y=0;y<h;y++){const start=at+bits+(signedHeight>0?h-y-1:y)*stride,out=y*(w*3+1)+1;for(let x=0;x<w;x++){rows[out+x*3]=bytes[start+x*pixelBytes+2];rows[out+x*3+1]=bytes[start+x*pixelBytes+1];rows[out+x*3+2]=bytes[start+x*pixelBytes];}}
  const ihdr=new Uint8Array(13),ihdrView=new DataView(ihdr.buffer);ihdrView.setUint32(0,w);ihdrView.setUint32(4,h);ihdr[8]=8;ihdr[9]=2;
  const chunks=[Uint8Array.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',zlibSync(rows)),pngChunk('IEND',new Uint8Array())],out=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let offset=0;for(const part of chunks){out.set(part,offset);offset+=part.length;}return out;
}
async function rasterPicture(bytes,path,{crop,mask,aspect,optimize=false,byteLimit=PPTX_LIMITS.imageBytes},warn){
  if(/\.emf$/i.test(path)){bytes=emfBitmap(bytes);path='embedded.png';warn('EMF_BITMAP_EXTRACTED','EMF 안의 단일 비트맵을 PNG로 옮겼어요. 원본 픽셀을 보존하며 EMF 명령은 실행하지 않아요.');}
  const {mime,width,height}=imageMime(bytes,path),cropped=crop.some(n=>n!==0),cropWidth=width*(1-crop[0]-crop[2]),cropHeight=height*(1-crop[1]-crop[3]);
  if(crop.some(n=>!Number.isFinite(n)||n<0||n>=1)||cropWidth<=0||cropHeight<=0)fail('UNSUPPORTED_IMAGE_CROP','그림의 자르기 범위가 올바르지 않아요.');
  const stretched=Math.abs(cropWidth/cropHeight/aspect-1)>0.00001,large=bytes.length>PPTX_LIMITS.imageBytes;
  let bitmap;
  try{
    if(typeof createImageBitmap==='function'){bitmap=await createImageBitmap(new Blob([bytes],{type:mime}));if(bitmap.width!==width||bitmap.height!==height)fail('INVALID_IMAGE','그림의 실제 픽셀 크기가 머리말과 달라요.');}
    if(!cropped&&!stretched&&!mask&&!large&&!optimize)return {bytes,mime};
    if(!bitmap||typeof OffscreenCanvas!=='function')fail('IMAGE_TRANSFORM_UNAVAILABLE','이 그림의 자르기·크기 변환은 최신 브라우저에서 지원해요.');
    let w=Math.max(1,Math.min(1600,cropWidth)),h=w/aspect;if(h>1600){w*=1600/h;h=1600;}
    let result;
    for(let attempt=0;attempt<4;attempt++){
      const canvas=new OffscreenCanvas(Math.max(1,Math.round(w)),Math.max(1,Math.round(h))),ctx=canvas.getContext('2d');
      if(!ctx)fail('IMAGE_TRANSFORM_UNAVAILABLE','그림 변환 화면을 만들지 못했어요.');
      if(mask==='ellipse'){ctx.beginPath();ctx.ellipse(canvas.width/2,canvas.height/2,canvas.width/2,canvas.height/2,0,0,Math.PI*2);ctx.clip();}
      ctx.drawImage(bitmap,width*crop[0],height*crop[1],cropWidth,cropHeight,0,0,canvas.width,canvas.height);
      let blob=await canvas.convertToBlob({type:'image/png'});
      if(blob.size>byteLimit)blob=await canvas.convertToBlob({type:'image/webp',quality:0.86});
      if(blob.size<=byteLimit){result={bytes:new Uint8Array(await blob.arrayBuffer()),mime:blob.type};break;}
      if(Math.max(w,h)<=640)break;w*=0.75;h*=0.75;
    }
    if(!result)fail('IMAGE_LIMIT','화질을 유지한 그림이 저장 한도를 넘어요. 원본 그림을 줄인 후 다시 가져와 주세요.');
    if(cropped||mask)warn('IMAGE_CROP_APPLIED','원본의 그림 자르기·타원 마스크를 적용한 이미지로 옮겼어요. 원본은 보관합니다.');
    if(stretched)warn('IMAGE_STRETCH_APPLIED','원본 그림 상자의 가로·세로 비율을 이미지에 적용했어요.');
    if(large||optimize)warn('IMAGE_RESIZED','큰 그림을 브라우저에서 저장 가능한 크기로 줄였어요. 원본 그림은 PPT에 보관합니다.');
    return result;
  }catch(error){if(error instanceof PptxConversionError)throw error;fail('INVALID_IMAGE','브라우저에서 내장 그림을 읽거나 변환하지 못했어요.');}
  finally{bitmap?.close?.();}
}

async function pageData(context,path,pageNumber){
  const {xml,files,rels,size,source,fonts,defaultTextStyle}=context,doc=xml(path),root=doc.documentElement,warnings=[],fontUsage=[];
  const warn=(code,message)=>{if(!warnings.some(w=>w.code===code))warnings.push(warning(code,message,pageNumber));};
  let canImport=true;const reject=(code,message)=>{canImport=false;warn(code,message);};
  // 영상 · 소리: 그 그림(표지)은 그대로 가져오고, 장을 꽉 채운 영상은 그 장의 바탕 영상으로 쓴다(media. 파일을 저장하는 일은 workflow 가 한다).
  const media=[];
  if(root.namespaceURI!==NS.p||root.localName!=='sld')fail('INVALID_SLIDE','슬라이드 XML이 올바르지 않아요.',{pageNumber});
  const text=rawSlideText(doc),cSld=direct(root,'cSld',NS.p),tree=direct(cSld,'spTree',NS.p),items=[],seen=new Set();
  if(!tree)reject('INVALID_SLIDE','슬라이드 요소 목록이 없어요.');
  const hidden=attr(root,'show')==='0';
  if(hidden)warn('HIDDEN_SLIDE','원본에서 숨긴 장이에요. 가져오면 온바탕에서도 발표할 때 건너뛰는 숨긴 장이 돼요.');
  if(all(root,'timing',NS.p).length)warn('ANIMATION_OMITTED','애니메이션은 실행하지 않고 모든 요소의 정적 배치를 가져옵니다. 겹쳐 나타나는 내용은 원본과 비교해 주세요.');
  if(all(root,'transition',NS.p).length)warn('TRANSITION_OMITTED','장면 전환 효과는 가져오지 않아요.');
  const pageRels=rels.get(path)||new Map();let notesText='',speakerNotes='',inheritedBackground,theme,masterTextStyles;
  for(const rel of pageRels.values()){
    if(rel.external){if(rel.type==='hyperlink')warn('EXTERNAL_LINK_OMITTED','외부 하이퍼링크 동작은 제외하고 내용을 가져옵니다.');else reject('EXTERNAL_RESOURCE','외부 파일을 불러와야 하는 장은 가져올 수 없어요.');continue;}
    if(['oleObject','chart','diagramData','diagramDrawing'].includes(rel.type))reject('UNSUPPORTED_MEDIA','차트·개체가 있는 장은 아직 가져올 수 없어요.');
    if(rel.type==='notesSlide'){const notesDoc=xml(rel.target);notesText=rawSlideText(notesDoc);speakerNotes=notesBodyText(notesDoc);}
    if(rel.type==='hyperlink')warn('LINK_OMITTED','슬라이드 링크 동작은 제외하고 내용을 가져옵니다.');
    if(rel.type==='slideLayout'){
      const layout=xml(rel.target),layoutTree=all(layout,'spTree',NS.p)[0];
      warn('INHERITED_STYLE_APPROXIMATE','틀과 마스터의 글꼴·테마 서식은 기본 서식으로 표시해요.');
      if(children(layoutTree).some(n=>!['nvGrpSpPr','grpSpPr'].includes(n.localName)&&!ownPlaceholder(n)))reject('UNSUPPORTED_LAYOUT_CONTENT','틀에 놓인 그림이나 도형은 아직 가져올 수 없어요.');
      const masterRel=Array.from(rels.get(rel.target)?.values()||[]).find(r=>r.type==='slideMaster');
      let master;
      if(masterRel?.external)reject('EXTERNAL_RESOURCE','외부 슬라이드 마스터는 가져올 수 없어요.');
      else if(masterRel){master=xml(masterRel.target);const masterTree=all(master,'spTree',NS.p)[0];if(children(masterTree).some(n=>!['nvGrpSpPr','grpSpPr'].includes(n.localName)&&!ownPlaceholder(n)))reject('UNSUPPORTED_MASTER_CONTENT','슬라이드 마스터의 그림이나 도형은 아직 가져올 수 없어요.');}
      const themeRel=masterRel&&!masterRel.external&&Array.from(rels.get(masterRel.target)?.values()||[]).find(r=>r.type==='theme');
      if(themeRel?.external)reject('EXTERNAL_RESOURCE','외부 테마 자료는 가져올 수 없어요.');
      else if(themeRel){theme=xml(themeRel.target);warn.themeColors=Object.fromEntries(children(all(theme,'clrScheme')[0]).map(n=>[n.localName,color(n,'#ffffff',()=>{})]));}
      masterTextStyles=direct(master?.documentElement,'txStyles',NS.p);
      const colorMap=all(root,'overrideClrMapping')[0]||all(layout,'overrideClrMapping')[0]||all(master,'clrMap',NS.p)[0];
      warn.colorMap=Object.fromEntries(Array.from(colorMap?.attributes||[]).map(a=>[a.localName,a.value]));
      inheritedBackground=all(layout,'bg',NS.p)[0]||all(master,'bg',NS.p)[0];
    }
  }
  let bg='paper';const background=direct(cSld,'bg',NS.p)||inheritedBackground;
  if(background){
    const properties=direct(background,'bgPr',NS.p),solid=direct(properties,'solidFill'),reference=direct(background,'bgRef',NS.p),idx=Number(attr(reference,'idx'));
    const themeFill=Number.isSafeInteger(idx)&&idx>=1001?children(all(theme,'bgFillStyleLst')[0])[idx-1001]:null;
    if(solid)bg=color(solid,'#ffffff',warn);
    else if(reference&&themeFill?.localName==='solidFill'){const ph=color(reference,'#ffffff',warn);bg=attr(direct(themeFill,'schemeClr'),'val')==='phClr'?ph:color(themeFill,ph,warn);}
    else reject('UNSUPPORTED_BACKGROUND','단색 외의 배경은 아직 가져올 수 없어요.');
  }
  let photoCount=0;
  for(const {object,matrix} of slideObjects(tree,warn,reject)){
    if(items.length>SLIDE_LIMITS.items){reject('ITEM_LIMIT',`쪽당 요소 ${SLIDE_LIMITS.items}개를 넘어요.`);break;}
    if(object.localName==='pic'&&++photoCount>SLIDE_LIMITS.photos){reject('PHOTO_LIMIT',`쪽당 사진 ${SLIDE_LIMITS.photos}장을 넘어요.`);break;}
    if(object.namespaceURI!==NS.p){reject('UNSUPPORTED_ELEMENT','지원하지 않는 슬라이드 요소가 있어요.');continue;}
    if(['nvGrpSpPr','grpSpPr'].includes(object.localName))continue;
    try{
      if(!['sp','pic','cxnSp'].includes(object.localName)&&!(object.localName==='graphicFrame'&&all(object,'tbl').length))fail('UNSUPPORTED_ELEMENT','차트 · 다이어그램 등은 아직 가져올 수 없어요.');
      const identity=all(object,'cNvPr',NS.p)[0],objectId=attr(identity,'id');
      if(!/^\d{1,10}$/.test(objectId)||Number(objectId)>4294967295||seen.has(objectId))fail('DUPLICATE_OBJECT_ID','요소 이름표가 없거나 중복되었어요.');seen.add(objectId);
      if(['1','true'].includes(attr(identity,'hidden')))fail('UNSUPPORTED_HIDDEN_OBJECT','숨긴 요소가 있는 장은 아직 가져올 수 없어요.');
      const origin={kind:'pptx',sourceDocumentId:source.sourceDocumentId,assetId:source.assetId,pageNumber,objectId,sha256:source.sha256};
      const meta=role=>({id:legacyId('e',`${source.sha256}:${pageNumber}:${objectId}:${role}`),layout:'slide',source:origin,assetRefs:[source.assetId]});
      if(object.localName==='graphicFrame'){items.push(...tableItems(object,all(object,'tbl')[0],{meta,size,matrix,warn,fonts}));continue;}
      const props=direct(object,'spPr',NS.p),preset=attr(direct(props,'prstGeom'),'prst'),g=geometry(props,size,warn,{line:preset==='line'&&object.localName!=='pic',matrix});
      if(all(object,'effectLst').some(n=>children(n).length)||all(object,'effectDag').length)warn('EFFECTS_OMITTED','그림자·광택 효과는 가져오지 않아요.');
      if(all(object,'hlinkClick').length||all(object,'hlinkMouseOver').length)warn('LINK_OMITTED','클릭·마우스 링크 동작은 제외하고 내용을 가져옵니다.');
      if(object.localName==='pic'){
        const fill=direct(object,'blipFill',NS.p),blip=direct(fill,'blip'),rid=blip?.getAttributeNS(NS.r,'embed')||blip?.getAttributeNS(NS.r,'link'),rel=pageRels.get(rid),crop=direct(fill,'srcRect'),stretch=direct(fill,'stretch'),fillRect=direct(stretch,'fillRect');
        if(rel?.external)fail('EXTERNAL_RESOURCE','외부 그림을 불러와야 하는 장은 가져올 수 없어요.');
        if(!rel||rel.type!=='image')fail('MISSING_IMAGE','내장 그림 연결을 찾을 수 없어요.');
        if(direct(props,'custGeom')||(direct(props,'prstGeom')&&!['rect','ellipse'].includes(preset)))fail('UNSUPPORTED_IMAGE_MASK','이 도형 모양으로 자른 그림은 아직 가져올 수 없어요.');
        if(children(blip).length||direct(props,'ln'))warn('IMAGE_EFFECTS_OMITTED','그림 색 효과와 테두리는 가져오지 않아요.');
        if(direct(fill,'tile'))fail('UNSUPPORTED_IMAGE_CROP','바둑판으로 채운 그림은 아직 가져올 수 없어요.');
        if(!stretch||fillRect&&['l','t','r','b'].some(k=>Number(attr(fillRect,k)||0)!==0))fail('UNSUPPORTED_IMAGE_FILL','늘인 그림의 안쪽 여백이나 채우기 방식은 아직 가져올 수 없어요.');
        if(g.w<0.1||g.h<0.1||g.w>300*Math.max(1,size.height/size.width)||g.h>300*Math.max(1,size.width/size.height))fail('UNSUPPORTED_GEOMETRY','그림 크기가 편집 범위를 벗어났어요.');
        const {bytes,mime}=await rasterPicture(files[rel.target],rel.target,{crop:['l','t','r','b'].map(k=>Number(attr(crop,k)||0)/100000),mask:preset==='ellipse'?'ellipse':null,aspect:g.width/g.height},warn);
        const alt=cleanAlt(attr(identity,'descr'));
        const picture={...meta('image'),t:'image',...position(g),url:`data:${mime};base64,${base64(bytes)}`,...(alt?{alt}:{})};
        items.push(picture);
        const clip=mediaOf(object,pageRels,files);
        if(clip?.kind==='audio')warn('AUDIO_OMITTED','소리는 가져오지 않고 그 아이콘 그림만 가져와요. 원본 PPT는 보관됩니다.');
        else if(clip?.kind==='video'){
          // 장을 거의 다 덮는 영상은 바탕 영상으로(그 위의 글 · 도형은 영상 위에 그대로 놓인다). 작은 영상은 표지 그림으로 남긴다.
          const full=g.w>=96&&g.h>=96&&Math.abs(g.x-50)<=3&&Math.abs(g.y-50)<=3&&!g.rot;
          if(full&&clip.bytes){media.push({kind:'video',path:clip.path,mime:clip.mime,posterId:picture.id,bytes:clip.bytes,...(autoPlays(root,objectId)?{auto:true}:{})});warn('VIDEO_AS_SCENE','장을 채운 영상은 이 장의 바탕 영상으로 가져와요. 영상 파일은 이 기기에 저장돼요.');}
          else warn('VIDEO_AS_POSTER',clip.bytes?'장 일부에 놓인 영상은 표지 그림으로 가져왔어요. "바탕 영상"에서 영상을 다시 넣을 수 있어요.':'밖에 있는 영상이라 표지 그림만 가져왔어요. "바탕 영상"에서 영상을 넣을 수 있어요.');
        }
        continue;
      }
      const body=direct(object,'txBody',NS.p),value=body?extractText(body):'',solid=direct(props,'solidFill'),line=direct(props,'ln'),noFill=direct(props,'noFill');
      const shapes={rect:'rect',roundRect:'round',ellipse:'circle',triangle:'tri',diamond:'diamond',rightArrow:'arrow',leftArrow:'arrow',wedgeRectCallout:'bubble'},custom=direct(props,'custGeom'),capsule=custom&&customCapsule(custom,g),stroke=visibleLine(line);
      const textBox=['1','true'].includes(attr(all(object,'cNvSpPr',NS.p)[0],'txBox'));
      if(custom&&!capsule||(!shapes[preset]&&!textBox&&!capsule&&preset!=='line'))fail('UNSUPPORTED_SHAPE','이 도형 종류는 아직 가져올 수 없어요.');
      if(direct(props,'gradFill')||direct(props,'pattFill')||direct(props,'blipFill'))fail('UNSUPPORTED_FILL','그라데이션·패턴·그림 채우기는 아직 가져올 수 없어요.');
      if(preset==='line'){
        if(value)fail('UNSUPPORTED_SHAPE','선 안의 글은 아직 가져올 수 없어요.');
        if(!stroke)continue;
        if(['headEnd','tailEnd'].some(kind=>{const node=direct(line,kind);return node&&attr(node,'type')&&attr(node,'type')!=='none';}))fail('UNSUPPORTED_LINE_END','화살표 끝이 있는 선은 아직 가져올 수 없어요.');
        const thickness=lineWidth(line,size)*size.width/size.height,length=Math.hypot(g.width,g.height)/size.width*100;
        const angle=g.rot+Math.atan2(g.height*(g.fy?-1:1),g.width*(g.fx?-1:1))*180/Math.PI,rot=((Math.round(angle)+180)%360+360)%360-180;
        if(length<0.01||length>140||thickness<0.01||thickness>140)fail('UNSUPPORTED_GEOMETRY','선 크기가 편집 범위를 벗어났어요.');
        items.push({...meta('shape'),t:'shape',x:g.x,y:g.y,w:length,h:thickness,rot,shape:'rect',color:color(direct(line,'solidFill'),'#222222',warn)});continue;
      }
      const hasShape=!!solid||(!noFill&&!textBox)||stroke,emptyShape=!!noFill&&!stroke&&!value;
      if(hasShape||emptyShape){
        if(g.w<0.01||g.w>140||g.h<0.01||g.h>140)fail('UNSUPPORTED_GEOMETRY','도형 크기가 편집 범위를 벗어났어요.');
        const shape={...meta('shape'),t:'shape',...position(g),shape:capsule?'round':shapes[preset]||'rect',color:color(solid,'#d0ebff',warn)};
        if(emptyShape){shape.op=0;warn('EMPTY_SHAPE_PRESERVED','채움·테두리·본문이 없는 투명 도형도 원본 ID와 위치를 유지했어요.');}
        if(capsule){shape.r=100;warn('CUSTOM_CAPSULE_MAPPED','닫힌 캡슐 경로를 편집 가능한 둥근 도형으로 옮겼어요.');}
        if(!solid&&!noFill)warn('THEME_STYLE_FALLBACK','물려받은 도형 색은 기본 색으로 표시해요.');
        if(preset==='roundRect'){
          const adjustment=children(direct(direct(props,'prstGeom'),'avLst')).find(n=>attr(n,'name')==='adj'),formula=attr(adjustment,'fmla');
          const match=/^val\s+([-+]?\d+)$/.exec(formula),adj=adjustment?match&&Number(match[1]):16667;
          if(adj===null||!Number.isFinite(adj))fail('UNSUPPORTED_SHAPE_ADJUSTMENT','둥근 모서리 조절식을 읽을 수 없어요.');
          // OOXML roundRect radius = short side * pinned adj / 100000.
          // The editor expresses radius as a percentage of half the short side.
          shape.r=Math.round(Math.max(0,Math.min(50000,adj))/500);
        }
        if(['rightArrow','leftArrow','wedgeRectCallout'].includes(preset)){warn('SHAPE_APPROXIMATION','화살표·말풍선은 같은 종류의 편집 도형으로 옮겼어요. 조절점과 꼬리 위치는 원본과 다를 수 있어요.');if(preset==='leftArrow')shape.fx=!shape.fx;}
        if(stroke){const width=lineWidth(line,size);shape.line=Math.max(0.01,Math.min(4,width));shape.lc=color(direct(line,'solidFill'),'#222222',warn);if(width!==shape.line)warn('LINE_WIDTH_ADJUSTED','선 굵기를 편집기가 지원하는 범위로 맞췄어요.');if(noFill)shape.hollow=true;}
        items.push(shape);
      }
      if(value){
        if(value.length>SLIDE_LIMITS.text)fail('TEXT_LIMIT',`한 글상자가 ${SLIDE_LIMITS.text}자를 넘어요. 전체 문구는 검사 결과와 원본에 남아 있어요.`);
        if(g.w<0.1||g.w>100)fail('UNSUPPORTED_GEOMETRY','글상자 너비가 편집 범위를 벗어났어요.');
        const paragraphs=children(body).filter(node=>node.localName==='p'&&node.namespaceURI===NS.a);
        const runs=all(body,'rPr'),first=runs[0]||all(body,'endParaRPr')[0],paragraph=direct(paragraphs[0],'pPr'),bodyPr=direct(body,'bodyPr');
        if(attr(bodyPr,'vert')&&!['horz'].includes(attr(bodyPr,'vert')))fail('UNSUPPORTED_TEXT_DIRECTION','세로쓰기 글은 아직 가져올 수 없어요.');
        if(g.fx||g.fy)fail('UNSUPPORTED_TEXT_FLIP','뒤집힌 글상자는 아직 가져올 수 없어요.');
        const points=Number(attr(first,'sz')||1800)/100;
        if(!Number.isFinite(points)||points<=0)fail('INVALID_TEXT_SIZE','글자 크기가 올바르지 않아요.');
        const wanted=points*g.scaleY/(size.width/12700)*100,fontSize=Math.max(0.1,Math.min(30,wanted));
        if(wanted!==fontSize)warn('FONT_SIZE_ADJUSTED','글자 크기를 편집기가 지원하는 범위로 맞췄어요.');
        for(const node of [...all(body,'latin'),...all(body,'ea'),...all(body,'cs')]){const font=attr(node,'typeface');if(font&&font.length<=240&&!/[\u0000-\u001f]/.test(font))fonts.add(font);}
        const allowedFonts=['Arial','Calibri','Aptos','Malgun Gothic','맑은 고딕','돋움','Gulim','굴림','학교안심 이어달리기 L','학교안심 바른돋움 B'];
        const resolveFace=face=>{
          const match=/^\+(mj|mn)-(lt|ea|cs)$/.exec(face);
          if(!match)return face;
          const group=all(theme,match[1]==='mj'?'majorFont':'minorFont')[0];
          return attr(direct(group,match[2]==='lt'?'latin':match[2]),'typeface')
            ||attr(children(group).find(n=>n.localName==='font'&&attr(n,'script')==='Hang'),'typeface')||attr(direct(group,'latin'),'typeface')||face;
        };
        const rawFace=attr(direct(first,'ea'),'typeface')||attr(direct(first,'latin'),'typeface');
        const face=resolveFace(rawFace||`+${attr(direct(direct(object,'style',NS.p),'fontRef'),'idx')==='major'?'mj':'mn'}-ea`),typeface=allowedFonts.find(font=>font.toLowerCase()===face.toLowerCase());
        const originalNames=[...new Set([...all(body,'ea'),...all(body,'latin'),...all(body,'cs')].map(n=>resolveFace(attr(n,'typeface'))).filter(Boolean))];
        if(originalNames.length>64)warn('FONT_INVENTORY_LIMIT','이 글상자의 글꼴 종류가 많아 일부 이름만 점검해요. 원본의 사용 조건을 확인해 주세요.');
        fontUsage.push({elementId:meta('text').id,pageNumber,originalName:face,originalNames:originalNames.slice(0,64),...(typeface?{appliedTypeface:typeface}:{})});
        if(typeface)warn('SYSTEM_FONT_REQUIRED','원본 글꼴 이름을 보존했어요. 기기에 글꼴이 없으면 대체 글꼴로 표시됩니다.');
        else warn('FONT_SUBSTITUTION','원본 글꼴을 포함하지 않아 온바탕 기본 글꼴로 표시해요.');
        warn('TEXT_LAYOUT_APPROXIMATE','문단 간격·줄바꿈·글상자 여백은 원본과 다를 수 있어요.');
        if(runs.length>1)warn('RICH_TEXT_FLATTENED','문단 안의 여러 서식은 첫 글자 서식으로 통일했어요.');
        const placeholder=all(object,'ph',NS.p)[0],placeholderType=attr(placeholder,'type');
        const masterStyle=direct(masterTextStyles,['title','ctrTitle'].includes(placeholderType)?'titleStyle':placeholderType==='body'?'bodyStyle':'otherStyle',NS.p);
        const styles=[direct(body,'lstStyle'),masterStyle,defaultTextStyle];
        // A placeholder without a type is a content placeholder, which takes the master's body (list) style.
        const listStyles=placeholder&&!placeholderType?[direct(body,'lstStyle'),direct(masterTextStyles,'bodyStyle',NS.p),defaultTextStyle]:styles;
        const listed=bulletedText(body,listStyles);
        if(listed.length>SLIDE_LIMITS.text)fail('TEXT_LIMIT',`한 글상자가 ${SLIDE_LIMITS.text}자를 넘어요. 전체 문구는 검사 결과와 원본에 남아 있어요.`);
        if(listed!==value)warn('BULLETS_AS_TEXT','목록 기호와 번호를 글자로 넣었어요. 들여쓰기 위치는 원본과 다를 수 있어요.');
        const hangingPunct=paragraphHanging(paragraph,styles);
        if(paragraphs.some(node=>paragraphHanging(direct(node,'pPr'),styles)!==hangingPunct))warn('PARAGRAPH_STYLE_FLATTENED','문단별 문장부호 내어쓰기가 달라 첫 문단의 설정으로 표시해요. 원문은 보존합니다.');
        const frame=textFrame(bodyPr,paragraph,g,size,points,warn,hangingPunct);
        const align={l:'l',ctr:'c',r:'r'}[attr(paragraph,'algn')]||'l';
        const textFill=direct(first,'solidFill')||direct(direct(paragraph,'defRPr'),'solidFill')||direct(direct(object,'style',NS.p),'fontRef');
        const style={t:'text',rot:g.rot,size:fontSize,font:'gothic',...(typeface?{typeface}:{}),color:color(textFill,'#222222',warn),bold:['1','true'].includes(attr(first,'b')),italic:['1','true'].includes(attr(first,'i')),under:attr(first,'u')==='sng',align};
        // Keep the original text box and its geometry. Paragraph splitting cannot
        // infer automatic wrapping and can introduce overlaps even when no text is lost.
        items.push({...meta('text'),...style,...frame,text:listed});
      }
    }catch(error){if(error instanceof PptxConversionError)reject(error.code,error.message);else throw error;}
  }
  if(items.length>SLIDE_LIMITS.items)reject('ITEM_LIMIT',`쪽당 요소 ${SLIDE_LIMITS.items}개를 넘어요.`);
  if(items.filter(i=>i.t==='image').length>SLIDE_LIMITS.photos)reject('PHOTO_LIMIT',`쪽당 사진 ${SLIDE_LIMITS.photos}장을 넘어요.`);
  let itemBytes=storedItemBytes(items);
  if(canImport&&itemBytes>PPTX_LIMITS.documentBytes-8192&&typeof OffscreenCanvas==='function'){
    for(const item of items.filter(i=>i.t==='image').sort((a,b)=>b.url.length-a.url.length)){
      if(itemBytes<=PPTX_LIMITS.documentBytes-8192)break;
      try{
        const match=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(item.url),bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
        const result=await rasterPicture(bytes,`image.${match[1].split('/')[1]}`,{crop:[0,0,0,0],aspect:item.w*size.width/(item.h*size.height),optimize:true,byteLimit:Math.max(16000,Math.min(128000,bytes.length*0.6))},warn);
        const url=`data:${result.mime};base64,${base64(result.bytes)}`;if(url.length<item.url.length){item.url=url;itemBytes=storedItemBytes(items);}
      }catch(error){if(!(error instanceof PptxConversionError))throw error;}
    }
  }
  if(itemBytes>PPTX_LIMITS.documentBytes-4096)reject('DOCUMENT_SIZE_LIMIT','이 장의 편집 데이터가 저장 한도를 넘어요.');
  return {pageNumber,title:text.split('\n').find(v=>v.trim())?.slice(0,80)||`${pageNumber}쪽`,text,notesText,fontUsage,warnings,canImport,estimatedBytes:itemBytes+1024,
    ...(canImport&&media.length?{media}:{}),
    slide:{id:legacyId('p',`${source.sha256}:${pageNumber}`),bg,...slideNotes({notes:speakerNotes}),...(hidden?{hidden:true}:{}),source:{kind:'pptx',sourceDocumentId:source.sourceDocumentId,assetId:source.assetId,pageNumber,sha256:source.sha256},assetRefs:[source.assetId],items:canImport?items:[]}};
}

async function readPptx(file,options={}){
  check(options.signal);
  if(!(file instanceof Blob)||(file.type!==PPTX_MIME&&!(['','application/octet-stream'].includes(file.type)&&/\.pptx$/i.test(file.name||''))))fail('INVALID_PPTX_FILE','PPTX 파일을 선택해 주세요.');
  if(file.size<1||file.size>PPTX_LIMITS.zipBytes)fail('FILE_LIMIT','PPTX 파일은 50MB 이하만 지원해요.');
  const filename=file.name||'presentation.pptx';if(filename.length>240||/[\u0000-\u001f]/.test(filename))fail('INVALID_FILENAME','파일 이름이 너무 길거나 올바르지 않아요.');
  progress(options,'reading',0,1);const bytes=new Uint8Array(await file.arrayBuffer());check(options.signal);
  const sha256=await digest(bytes);progress(options,'package',0,1);const files=unpack(bytes),cache=new Map();
  if(Object.keys(files).some(p=>/vbaProject\.bin$|^EncryptionInfo$|^EncryptedPackage$/i.test(p)))fail('UNSUPPORTED_ACTIVE_CONTENT','매크로나 암호화된 자료는 지원하지 않아요.');
  preflightXml(files);
  const xml=path=>{if(!cache.has(path))cache.set(path,parseXml(files[path],path));return cache.get(path);};
  if(!Object.hasOwn(files,'[Content_Types].xml'))fail('INVALID_PPTX','PPTX 형식 정보가 없어요.');
  const rels=relationships(files,xml),main=Array.from(rels.get('')?.values()||[]).find(r=>r.type==='officeDocument');
  if(!main||main.external)fail('INVALID_PPTX','발표 자료의 시작 항목을 찾지 못했어요.');
  const presentation=xml(main.target),root=presentation.documentElement;
  if(root.namespaceURI!==NS.p||root.localName!=='presentation')fail('UNSUPPORTED_PPTX','이 발표 자료 형식은 지원하지 않아요.');
  const dimensions=direct(root,'sldSz',NS.p);let size;
  try{size=cleanSize({width:Number(attr(dimensions,'cx')),height:Number(attr(dimensions,'cy')),unit:'emu'});}catch{fail('UNSUPPORTED_SIZE','원본 화면 크기나 비율을 지원하지 않아요.');}
  const source={filename,sha256,byteLength:bytes.length,assetId:'a'+sha256.slice(0,24),sourceDocumentId:'s'+sha256.slice(0,24)};
  const list=direct(root,'sldIdLst',NS.p),slideIds=children(list),mainRels=rels.get(main.target)||new Map();
  if(!slideIds.length||slideIds.length>PPTX_LIMITS.pages)fail('PAGE_COUNT_LIMIT',`검사할 수 있는 원본은 ${PPTX_LIMITS.pages}쪽까지예요.`);
  const selected=options.selectedPages,retain=!options.inspectionOnly&&(selected===undefined?slideIds.length<=DOCUMENT_LIMITS.pages:Array.isArray(selected)&&selected.length<=DOCUMENT_LIMITS.pages);
  const pages=[],targets=new Set(),fonts=new Set();
  for(let i=0;i<slideIds.length;i++){
    progress(options,'slides',i,slideIds.length);const node=slideIds[i],rel=mainRels.get(relationId(node));
    if(node.namespaceURI!==NS.p||node.localName!=='sldId'||!rel||rel.type!=='slide'||targets.has(rel.target))fail('INVALID_SLIDE_ORDER','원본 쪽 순서나 연결이 올바르지 않아요.');
    targets.add(rel.target);const page=await pageData({xml,files,rels,size,source,fonts,defaultTextStyle:direct(root,'defaultTextStyle',NS.p)},rel.target,i+1);
    if(!retain||Array.isArray(selected)&&!selected.includes(i+1)){if(page.media?.length)page.videos=page.media.length;delete page.slide;delete page.media;}
    pages.push(page);
  }
  // PowerPoint 의 구역(p14:sectionLst) → 주제: 구역의 첫 장에 구역 이름을 주제로 붙인다.
  const sectionOf=new Map();
  for(const section of all(root,'section',P14)){const name=cleanTopic(attr(section,'name')),first=all(section,'sldId',P14)[0];if(name&&first)sectionOf.set(attr(first,'id'),name);}
  slideIds.forEach((node,i)=>{const topic=sectionOf.get(attr(node,'id'));if(topic&&pages[i].slide)pages[i].slide.topic=topic;});
  const warnings=[warning('EDITABLE_APPROXIMATION','지원하는 요소만 편집 가능한 형태로 옮깁니다. 원본 PPT 화면 렌더와 글꼴·테마의 동일 재현은 지원하지 않아요.')];
  progress(options,'complete',pages.length,pages.length);
  return {pageCount:pages.length,pages,source,originalSize:size,warnings,converter:{name:'onbatang-ooxml-browser',version:PPTX_CONVERTER_VERSION,fonts:[...fonts].sort()}};
}
// 살펴보기에는 영상의 바이트를 싣지 않는다(쪽마다 영상이 있는지만 남긴다).
const inspectionOf=parsed=>({...parsed,pages:parsed.pages.map(({slide,media,...page})=>(media?.length?{...page,videos:media.length}:page))});
export async function inspectPptx(file,options={}){return inspectionOf(await readPptx(file,{...options,inspectionOnly:true}));}
export async function convertPptx(file,options={}){
  const parsed=await readPptx(file,options),selected=options.selectedPages??parsed.pages.map(p=>p.pageNumber);
  if(!Array.isArray(selected)||!selected.length||selected.some(n=>!Number.isSafeInteger(n)||n<1||n>parsed.pageCount)||new Set(selected).size!==selected.length)fail('INVALID_PAGE_SELECTION','가져올 쪽 번호를 확인해 주세요.');
  if(selected.length>DOCUMENT_LIMITS.pages)fail('PAGE_LIMIT',`한 문서에는 ${DOCUMENT_LIMITS.pages}쪽까지 가져올 수 있어요.`,{inspection:inspectionOf(parsed)});
  const pages=selected.map(n=>parsed.pages[n-1]),blocked=pages.filter(p=>!p.canImport);
  if(blocked.length)fail(blocked[0].warnings.find(w=>['TEXT_LIMIT','ITEM_LIMIT','PHOTO_LIMIT'].includes(w.code))?.code||'UNSUPPORTED_SLIDES','선택한 쪽 중 아직 가져올 수 없는 자료가 있어요.',{pages:blocked.map(({slide,...p})=>p),source:parsed.source});
  const {source}=parsed;
  const importId=crypto.randomUUID().replaceAll('-','').slice(0,24);
  const report={contractVersion:1,jobId:'j'+importId,status:'ready',sourceDocumentId:source.sourceDocumentId,sourceAssetId:source.assetId,converter:parsed.converter,selectedPages:[...selected],pageCount:parsed.pageCount,fontUsage:pages.flatMap(p=>p.fontUsage),warnings:[...parsed.warnings,...pages.flatMap(p=>p.warnings)]};
  const document={id:'d'+importId,schemaVersion:1,revision:0,name:source.filename.replace(/\.pptx$/i,'').slice(0,30),originalSize:parsed.originalSize,size:{width:parsed.originalSize.width/9525,height:parsed.originalSize.height/9525,unit:'px'},
    source:{kind:'pptx',sourceDocumentId:source.sourceDocumentId,assetId:source.assetId,filename:source.filename,sha256:source.sha256},assetRefs:[source.assetId],
    assets:[{id:source.assetId,kind:'source',mimeType:PPTX_MIME,sha256:source.sha256,byteLength:source.byteLength}],slides:pages.map(p=>p.slide)};
  const record=importConvertedDocument({report,document}).record;
  if(new TextEncoder().encode(JSON.stringify(record)).length>PPTX_LIMITS.documentBytes)fail('DOCUMENT_SIZE_LIMIT','선택한 쪽의 편집 데이터가 512KB 저장 한도를 넘어요. 쪽을 나누어 가져와 주세요.',{inspection:inspectionOf(parsed)});
  // 바탕 영상으로 쓸 영상 파일들(쪽 번호와 함께). 문서에는 싣지 않는다: 부르는 쪽이 저장하고 그 열쇠를 장에 적는다.
  const media=pages.flatMap(p=>(p.media||[]).map(m=>({...m,pageNumber:p.pageNumber})));
  return {report,document:record,...(media.length?{media}:{})};
}
