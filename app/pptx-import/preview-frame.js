// Bundled into an opaque-origin, scripts-only sandbox. This module is never mounted in the host page.
import {parseZipLazyMedia,buildPresentation,renderSlide} from '@aiden0z/pptx-renderer';
import rendererPackage from './vendor/renderer-version.js';
import {adaptPreviewPunctuation,previewTextBounds} from './preview-punctuation.js';
import {bulletChar} from './bullets.js';

const nonce=location.hash.slice(1),parentOrigin=new URL(location.href).origin,container=document.getElementById('slide');
let files,busy=false,opened=false;
const embeddedFaces=new Map(),NativeFontFace=globalThis.FontFace;let embeddedBytes=0,embeddedCaptureFailure=false;
// Capture only the bounded, decoded bytes the renderer actually gives the standard FontFace API.
// SVG image documents cannot inherit faces registered in their parent's document.fonts collection.
globalThis.FontFace=class extends NativeFontFace{
  constructor(family,source,descriptors){super(family,source,descriptors);
    if(/^__pptx_embedded_[a-z\d_]+$/i.test(family)&&(source instanceof ArrayBuffer||ArrayBuffer.isView(source))){
      const bytes=source instanceof ArrayBuffer?new Uint8Array(source):new Uint8Array(source.buffer,source.byteOffset,source.byteLength),key=family+':'+(descriptors?.weight||'400')+':'+(descriptors?.style||'normal');
      if(!embeddedFaces.has(key)){if(embeddedFaces.size>=16||embeddedBytes+bytes.byteLength>16*1024*1024){embeddedCaptureFailure=true;throw new Error('Embedded font raster budget exceeded');}embeddedBytes+=bytes.byteLength;embeddedFaces.set(key,{family,bytes:bytes.slice(),weight:descriptors?.weight||'400',style:descriptors?.style||'normal',face:this});}
    }
  }
};
const normalize=value=>String(value).normalize('NFC').trim().replace(/^(['"])(.*)\1$/,'$2').replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const limit={maxEntries:2000,maxEntryUncompressedBytes:32*1024*1024,maxTotalUncompressedBytes:100*1024*1024,maxMediaBytes:100*1024*1024,maxConcurrency:2};

// Defense in depth: no external relationship survives, even hyperlinks that preflight permits as warnings.
function safeXml(xml,mappings={}){
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.querySelector('parsererror'))fail('INVALID_XML','PPT 미리보기 XML을 읽지 못했어요.');
  const map=new Map(Object.entries(mappings).map(([from,to])=>[normalize(from),to]));
  for(const node of Array.from(doc.getElementsByTagName('*'))){
    if(node.localName==='Relationship'&&(node.getAttribute('TargetMode')?.toLowerCase()==='external'||/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(node.getAttribute('Target')||''))){node.remove();continue;}
    // Embedded-face declarations retain their original identity; renaming one would substitute
    // the original bytes under the replacement family and silently undo the user's font choice.
    // A Wingdings/Symbol bullet is a plain letter in that font; without the font the letter itself shows.
    if(node.localName==='buChar'){const font=Array.from(node.parentElement?.children||[]).find(n=>n.localName==='buFont'),face=font?.getAttribute('typeface')||'',char=node.getAttribute('char')||'',shown=bulletChar(char,face);
      if(shown&&shown!==char){node.setAttribute('char',shown);if(font)font.setAttribute('typeface','Arial');}}
    if(node.hasAttribute('typeface')&&!(node.localName==='font'&&node.parentElement?.localName==='embeddedFont')){const target=map.get(normalize(node.getAttribute('typeface')));if(target)node.setAttribute('typeface',target);}
  }
  return new XMLSerializer().serializeToString(doc);
}
function mappedFiles(mappings){
  const output={...files};
  for(const [key,value] of Object.entries(files)){
    if(typeof value==='string')output[key]=safeXml(value,mappings);
    else if(value instanceof Map&&key!=='media'&&key!=='fonts')output[key]=new Map([...value].map(([name,xml])=>[name,typeof xml==='string'?safeXml(xml,mappings):xml]));
  }
  return output;
}
function validateFonts(fonts,mappings){
  if(!Array.isArray(fonts)||fonts.length>25||!mappings||typeof mappings!=='object'||Array.isArray(mappings))fail('INVALID_FONTS','글꼴 교체 정보를 확인해 주세요.');
  let bytes=0;const families=new Set();
  for(const font of fonts){if(!/^mc-[a-z\d-]+$/i.test(font?.family)||!/^data:font\/woff2?;base64,[A-Za-z0-9+/]+=*$/.test(font?.url))fail('INVALID_FONTS','앱에 포함된 글꼴만 사용할 수 있어요.');bytes+=font.url.length;families.add(font.family);}
  if(bytes>48*1024*1024||Object.entries(mappings).some(([name,family])=>name.length>240||!families.has(family)))fail('INVALID_FONTS','글꼴 교체 정보가 너무 크거나 올바르지 않아요.');
}
function embeddedCss(){
  const base64=bytes=>{let binary='';for(let index=0;index<bytes.length;index+=8192)binary+=String.fromCharCode(...bytes.subarray(index,index+8192));return btoa(binary);};
  return [...embeddedFaces.values()].filter(font=>font.face.status==='loaded').map(font=>`@font-face{font-family:"${font.family}";font-weight:${font.weight==='700'?'700':'400'};font-style:${font.style==='italic'?'italic':'normal'};src:url("data:font/ttf;base64,${base64(font.bytes)}")}`).join('\n');
}
function fitClippedText(element,pageNumber){
  let adjusted=0;
  for(const layer of element.querySelectorAll('div')){
    const style=getComputedStyle(layer);if(style.display!=='flex'||style.flexDirection!=='column'||style.position!=='absolute'||!layer.textContent.trim()||!['hidden','clip'].includes(style.overflowY))continue;
    const sized=[...layer.querySelectorAll('[style]')].filter(node=>node.style.fontSize);
    if(!sized.length)continue;
    const fits=()=>{const box=layer.getBoundingClientRect(),text=previewTextBounds(layer);return !text||text.top>=box.top-1&&text.bottom<=box.bottom+1&&text.left>=box.left-1&&text.right<=box.right+1;};
    if(fits())continue;
    const sizes=sized.map(node=>parseFloat(getComputedStyle(node).fontSize)),apply=factor=>sized.forEach((node,index)=>node.style.fontSize=sizes[index]*factor+'px');
    let low=Math.max(.15,5/Math.min(...sizes)),high=1;if(low>=1)fail('TEXT_LAYOUT_UNSUPPORTED','이 쪽의 글상자를 잘리지 않게 그릴 수 없어요. 편집용 가져오기를 이용해 주세요.');
    apply(low);if(!fits())fail('TEXT_LAYOUT_UNSUPPORTED','이 쪽의 글상자를 잘리지 않게 그릴 수 없어요. 편집용 가져오기를 이용해 주세요.');
    for(let attempt=0;attempt<9;attempt++){const middle=(low+high)/2;apply(middle);if(fits())low=middle;else high=middle;}
    apply(low);adjusted++;
  }
  return adjusted?[{code:'TEXT_FIT_ADJUSTED',pageNumber,message:'브라우저 미리보기에서 글자가 잘리지 않도록 일부 글상자 안의 글자 크기를 조정했어요. 원본 파일과 편집용 내용은 유지돼요.'}]:[];
}
async function capture(element,width,height,scale,fonts){
  let nodes=0;const urls=new Map();
  const rasterImage=image=>{const w=image.naturalWidth,h=image.naturalHeight;if(!w||!h||w*h>20000000)fail('IMAGE_SIZE_LIMIT','PPT 그림의 크기가 너무 커요.');const canvas=document.createElement('canvas'),ratio=Math.min(1,2000/w,2000/h);canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');};
  const embed=async url=>{if(url.startsWith('#'))return url;if(!/^(?:blob:|data:image\/)/i.test(url))fail('EXTERNAL_RESOURCE','PPT의 외부 그림은 미리보기에서 사용할 수 없어요.');if(!urls.has(url))urls.set(url,(async()=>{const image=new Image();image.src=url;await image.decode();return rasterImage(image);})());return urls.get(url);};
  const inlineUrls=async value=>{const pattern=/url\(\s*(['"]?)(.*?)\1\s*\)/gi;let output='',cursor=0;for(const match of value.matchAll(pattern)){output+=value.slice(cursor,match.index)+`url("${await embed(match[2])}")`;cursor=match.index+match[0].length;}return output+value.slice(cursor);};
  const clone=async node=>{
    if(++nodes>30000)fail('RASTER_DOM_LIMIT','PPT 미리보기의 객체가 너무 많아요.');
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
    if(node.nodeType!==Node.ELEMENT_NODE)return document.createTextNode('');
    if(['SCRIPT','IFRAME','OBJECT','EMBED','AUDIO','VIDEO','LINK'].includes(node.tagName))return document.createTextNode('');
    let copy;
    if(node instanceof HTMLCanvasElement){copy=document.createElement('img');copy.src=node.toDataURL('image/png');}
    else if(node instanceof HTMLImageElement){copy=document.createElement('img');copy.src=rasterImage(node);}
    else{copy=node.cloneNode(false);for(const attribute of [...copy.attributes]){
      if(/^on/i.test(attribute.name)||['src','srcset','style'].includes(attribute.name))copy.removeAttribute(attribute.name);
      else if(attribute.localName==='href'){if(node.localName==='image'||node.localName==='use')copy.setAttributeNS(attribute.namespaceURI,attribute.name,await embed(attribute.value));else copy.removeAttribute(attribute.name);}
    }}
    const style=getComputedStyle(node);for(const property of style){let value=style.getPropertyValue(property);if(/url\(/i.test(value))value=await inlineUrls(value);copy.style.setProperty(property,value,style.getPropertyPriority(property));}
    if(!(node instanceof HTMLCanvasElement)&&!(node instanceof HTMLImageElement))for(const child of node.childNodes)copy.append(await clone(child));
    return copy;
  };
  const copy=await clone(element);copy.setAttribute('xmlns','http://www.w3.org/1999/xhtml');copy.style.margin='0';copy.style.position='relative';copy.style.left='0';copy.style.top='0';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));
  const definitions=document.createElementNS(svg.namespaceURI,'style');definitions.textContent=Array.from(document.head.querySelectorAll('style')).map(style=>style.textContent).join('\n')+'\n'+fonts.map(font=>`@font-face{font-family:"${font.family}";src:url("${font.url}")}`).join('\n')+'\n'+embeddedCss();svg.append(definitions);
  const foreign=document.createElementNS(svg.namespaceURI,'foreignObject');foreign.setAttribute('width','100%');foreign.setAttribute('height','100%');foreign.append(copy);svg.append(foreign);
  const serialized=new XMLSerializer().serializeToString(svg);if(serialized.length>32*1024*1024)fail('RASTER_DOM_LIMIT','PPT 미리보기 이미지의 구조가 너무 커요.');
  const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(serialized);await image.decode();
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
}
async function render({pageNumber,width,fonts=[],mappings={}}){
  embeddedFaces.clear();embeddedBytes=0;embeddedCaptureFailure=false;
  validateFonts(fonts,mappings);
  if(!Number.isSafeInteger(pageNumber)||!Number.isInteger(width)||width<64||width>1600)fail('INVALID_PAGE','미리보기 쪽과 크기를 확인해 주세요.');
  // Warm-up only: these faces have local() sources, so a device without them installed rejects
  // with a NetworkError. Text then falls back like any other missing font.
  await Promise.allSettled(['학교안심 이어달리기 L','학교안심 바른돋움 B'].map(name=>document.fonts.load(`16px "${name}"`,'글꼴 점검')));
  const presentation=buildPresentation(mappedFiles(mappings),{lazySlides:true});
  if(pageNumber<1||pageNumber>presentation.slides.length)fail('INVALID_PAGE','미리보기 쪽 번호를 확인해 주세요.');
  if(!Number.isFinite(presentation.width)||!Number.isFinite(presentation.height)||presentation.width<1||presentation.height<1||presentation.width>20000||presentation.height>20000)fail('SLIDE_SIZE','PPT 쪽 크기를 확인해 주세요.');
  const scale=Math.min(width/presentation.width,1600/presentation.height,Math.sqrt(4000000/(presentation.width*presentation.height))),errors=[];
  const createHandle=()=>renderSlide(presentation,presentation.slides[pageNumber-1],{pdfjs:false,onNavigate:()=>{},onNodeError:(_id,error)=>errors.push(String(error?.message||error)),fontFaces:fonts.map(font=>({family:font.family,source:`url("${font.url}")`})),embeddedFontLimits:{maxFaces:16,maxInputBytesPerFace:2097152,maxDecompressedBytesPerFace:4194304,maxTotalDecompressedBytes:16777216,maxProcessingMs:250}});
  let handle=createHandle();
  try{
    container.replaceChildren(handle.element);await handle.ready;
    if(errors.length)fail('RENDER_NODE_FAILED','일부 PPT 객체를 그리지 못해 이 쪽의 이미지 가져오기를 중단했어요.');
    handle.element.getBoundingClientRect();
    await Promise.all(Array.from(handle.element.querySelectorAll('img')).map(img=>img.decode()));
    const loads=new Map();for(const element of handle.element.querySelectorAll('*')){if(!element.textContent.trim())continue;const style=getComputedStyle(element),font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;if(!loads.has(font))loads.set(font,document.fonts.load(font,element.textContent));}
    // A face that cannot load (not installed, unreadable embedded bytes) falls back instead of failing the slide.
    const fontFallback=(await Promise.allSettled(loads.values())).some(load=>load.status==='rejected');await document.fonts.ready;await new Promise(requestAnimationFrame);
    if(embeddedCaptureFailure)fail('EMBEDDED_FONT_LIMIT','PPT 미리보기의 삽입 글꼴 용량이 한도를 넘었어요.');
    adaptPreviewPunctuation({presentation,slide:presentation.slides[pageNumber-1],element:handle.element,rendererVersion:rendererPackage.version});
    const fitWarnings=fitClippedText(handle.element,pageNumber),usedEmbedded=new Set();
    for(const element of handle.element.querySelectorAll('*'))for(const family of getComputedStyle(element).fontFamily.match(/__pptx_embedded_[a-z\d_]+/gi)||[])usedEmbedded.add(family);
    if([...usedEmbedded].some(family=>![...embeddedFaces.values()].some(font=>font.family===family&&font.face.status==='loaded')))fitWarnings.push({code:'EMBEDDED_FONT_UNAVAILABLE',pageNumber,message:'일부 삽입 글꼴을 읽지 못해 이 기기의 대체 글꼴로 미리보기를 그렸어요.'});
    else if(fontFallback)fitWarnings.push({code:'FONT_FALLBACK',pageNumber,message:'이 기기에 없는 글꼴은 대체 글꼴로 미리보기를 그렸어요.'});
    const canvas=await capture(handle.element,presentation.width,presentation.height,scale,fonts);
    let dataUrl=canvas.toDataURL('image/png'),quality=.9;
    while(dataUrl.length>341400&&quality>=.45){dataUrl=canvas.toDataURL('image/webp',quality);quality-=.1;}
    let output=canvas;
    while(dataUrl.length>341400&&output.width>320){const next=document.createElement('canvas');next.width=Math.round(output.width*.8);next.height=Math.round(output.height*.8);next.getContext('2d').drawImage(output,0,0,next.width,next.height);output=next;dataUrl=output.toDataURL('image/webp',.78);}
    if(dataUrl.length>341400)fail('RASTER_TOO_LARGE','이 쪽의 미리보기 이미지가 너무 커요.');
    return {dataUrl,width:output.width,height:output.height,warnings:fitWarnings};
  }finally{handle.dispose();container.replaceChildren();embeddedFaces.clear();embeddedBytes=0;}
}
document.addEventListener('click',event=>event.preventDefault(),true);
window.addEventListener('message',async event=>{
  if(event.source!==parent||event.origin!==parentOrigin||event.data?.nonce!==nonce||!/^[a-f\d]{48}$/.test(nonce))return;
  const data=event.data;if(typeof data.id!=='string'||!['open','render'].includes(data.method))return;
  const respond=(type,value)=>parent.postMessage({nonce,id:data.id,type,...value},parentOrigin);
  if(busy){respond('error',{error:{code:'PREVIEW_BUSY',message:'다른 PPT 미리보기를 처리하고 있어요.'}});return;}
  busy=true;
  try{
    let result;
    if(data.method==='open'){
      if(opened||!(data.bytes instanceof ArrayBuffer)||data.bytes.byteLength>50*1024*1024)fail('INVALID_SOURCE','PPT 원본 파일을 확인해 주세요.');
      files=await parseZipLazyMedia(data.bytes,limit);const presentation=buildPresentation(mappedFiles({}),{lazySlides:true});
      if(presentation.slides.length!==data.pageCount||data.pageCount>200)fail('PAGE_COUNT_MISMATCH','PPT 쪽 수가 원본과 달라요.');
      opened=true;result={pageCount:presentation.slides.length};
    }else{if(!opened)fail('PREVIEW_NOT_OPEN','PPT 파일을 먼저 열어 주세요.');result=await render(data);}
    respond('result',{result});
  // Only this frame's own string codes carry a message; browser errors (DOMException.code is a number) never reach the teacher raw.
  }catch(error){const own=typeof error?.code==='string';respond('error',{error:{code:own?error.code:'PREVIEW_FAILED',message:own?error.message:'PPT의 일부 표현을 미리보기 도구에서 그리지 못했어요.'}});}
  finally{busy=false;}
});
