import {el} from '../src/dom.js';
import {cleanGaiActivity,cleanGaiPatch,cleanGaiResult,cleanGaiImage,GAI_APP_BRIDGE_MARKER,GAI_APP_CHECKPOINT_MARKER} from '../src/gai-app.js';
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'; media-src 'none'";
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const clone=value=>JSON.parse(JSON.stringify(value));

// This helper is injected before the generated source. It only accepts an
// explicit parent capture request; it never asks the host to create a result.
function canvasHelper(bridge){
 // Presentation remotes send PageDown/PageUp. Inside the app frame the host
 // cannot hear them, so forward only those (and Escape) when the app did not
 // use the key itself. Window bubbling runs after the app's own handlers.
 window.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||!['PageDown','PageUp','Escape'].includes(event.key))return;
  if(event.key!=='Escape'&&event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])'))return;
  parent.postMessage({type:'onbatang-app-key',bridge,key:event.key},'*');
 });
 // Explicit pixel surfaces only: do not mistake palettes, number tables or
 // arbitrary app buttons for a drawing. #pixel-grid supports saved older apps.
 function pixelCanvas(grid){
  const cells=[...grid.children];if(cells.length<4||cells.length>1024)throw Error('pixel cells');
  const pixels=cells.map(cell=>{
   const rect=cell.getBoundingClientRect(),style=getComputedStyle(cell),color=style.backgroundColor;
   if(rect.width<=0||rect.height<=0||style.visibility!=='visible'||style.display==='none'||Number(style.opacity)!==1||style.backgroundImage!=='none'||!/^rgb\(/.test(color)&&!/^rgba\([^,]+,[^,]+,[^,]+,\s*1\)$/.test(color))throw Error('pixel fill');
   return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,w:rect.width,h:rect.height,color};
  });
  const axis=key=>{const out=[];for(const p of [...pixels].sort((a,b)=>a[key]-b[key]))if(!out.length||Math.abs(p[key]-out.at(-1))>1)out.push(p[key]);return out;};
  const xs=axis('x'),ys=axis('y');if(xs.length<2||ys.length<2||xs.length>32||ys.length>32||xs.length*ys.length!==pixels.length)throw Error('pixel shape');
  for(const positions of [xs,ys])for(let i=2;i<positions.length;i++)if(Math.abs(positions[i]-positions[i-1]-(positions[1]-positions[0]))>1)throw Error('pixel spacing');
  const used=new Set(),size=Math.max(xs.length,ys.length),scale=Math.max(1,Math.floor(256/size)),canvas=document.createElement('canvas');
  canvas.width=xs.length*scale;canvas.height=ys.length*scale;const ctx=canvas.getContext('2d');if(!ctx)throw Error('pixel context');
  for(const p of pixels){
   if(Math.abs(p.w-pixels[0].w)>1||Math.abs(p.h-pixels[0].h)>1)throw Error('pixel size');
   const x=xs.findIndex(v=>Math.abs(v-p.x)<=1),y=ys.findIndex(v=>Math.abs(v-p.y)<=1),key=y*xs.length+x;
   if(x<0||y<0||used.has(key))throw Error('pixel position');used.add(key);ctx.fillStyle=p.color;ctx.fillRect(x*scale,y*scale,scale,scale);
  }
  return canvas;
 }
 window.addEventListener('message',async event=>{
  const d=event.data;if(event.source!==parent||d?.bridge!==bridge||d.type!=='onbatang-app-capture'||typeof d.request!=='string')return;
  // The Gai SDK observes change events and publishes before the capture task.
  try{if(typeof window.GAIClassroom?.flush==='function')await window.GAIClassroom.flush();else document.dispatchEvent(new Event('change',{bubbles:true}));}
  catch{parent.postMessage({type:'onbatang-app-captured',bridge,request:d.request,error:'APP_CAPTURE_FAILED'},'*');return;}
  setTimeout(()=>{
   let image,imageOmitted=false,source;const grid=document.querySelector('[data-onbatang-pixel-grid],#pixel-grid');
   try{source=grid?pixelCanvas(grid):document.querySelector('canvas');}catch{imageOmitted=true;}
   if(source?.width&&source?.height)try{
    for(const edge of [256,128,64]){
     const canvas=document.createElement('canvas'),scale=Math.min(1,edge/Math.max(source.width,source.height));
     canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
     const ctx=canvas.getContext('2d');if(!ctx)break;ctx.drawImage(source,0,0,canvas.width,canvas.height);
     const candidate=canvas.toDataURL('image/png');if(candidate.length<=40000){image=candidate;break;}
    }
    imageOmitted=!image;
   }catch{imageOmitted=true;}
   parent.postMessage({type:'onbatang-app-captured',bridge,request:d.request,...(image?{image}:{}),...(imageOmitted?{imageOmitted:true}:{})},'*');
  },0);
 });
}
// A trusted opaque wrapper is needed: its frame-src policy also blocks the
// generated frame from navigating itself to an external website. A policy in
// the generated frame alone cannot govern that frame's own navigation.
function wrapper(bridge,source){
 const frame=document.createElement('iframe');frame.dataset.gaiAppContent='';frame.title='수업 앱 실행';frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('referrerpolicy','no-referrer');frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
 frame.style.cssText='display:block;width:100%;height:100%;border:0;background:white';
 window.addEventListener('message',event=>{
  const d=event.data;if(!d||d.bridge!==bridge)return;
  if(event.source===frame.contentWindow&&['gai-classroom-report','onbatang-app-captured','onbatang-app-key'].includes(d.type))parent.postMessage(d,'*');
  else if(event.source===parent&&['gai-classroom-state','gai-classroom-result','onbatang-app-capture'].includes(d.type))frame.contentWindow?.postMessage(d,'*');
 });
 frame.srcdoc=source;document.body.append(frame);
}
function sandboxSource(activity,bridge){
 const source=activity.document.replaceAll(JSON.stringify(GAI_APP_BRIDGE_MARKER),json(bridge)).replaceAll(GAI_APP_CHECKPOINT_MARKER,json(activity.state));
 const inner=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><script>(${canvasHelper.toString()})(${json(bridge)});<\/script></head><body>${source}</body></html>`;
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>html,body{height:100%;margin:0;overflow:hidden}</style></head><body><script>(${wrapper.toString()})(${json(bridge)},${json(inner)});<\/script></body></html>`;
}

export function mountGaiApp(root,{activity:raw,onChange,onSave,onKey,saveLabel='결과를 다음 슬라이드에 저장',saveMessage='결과를 다음 슬라이드에 저장했어요.',hint='픽셀아트·그림판은 PNG 그림과 답을 함께 다음 슬라이드에 저장해요.',roomState}={}){
 const activity=cleanGaiActivity(raw),bridge=crypto.randomUUID();let checkpoint=clone(activity.state),reported={state:{},answer:'',score:null,completed:false,progress:0},destroyed=false,busy=false,ready=false,reportError=false,inFlight=0,serial=Promise.resolve(),capture=null;
 const frame=el('iframe',{class:'gai-app-frame',title:activity.title,sandbox:'allow-scripts',referrerpolicy:'no-referrer',allow:"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"});
 const status=el('p',{class:'gai-app-status',role:'status','aria-live':'polite',text:'앱의 진행 기록을 연결하고 있어요. 연결되면 결과를 저장할 수 있어요.'});
 const save=el('button',{type:'button',class:'gai-app-save',text:saveLabel,disabled:true});
 const body=el('section',{class:'gai-app-runtime','aria-label':activity.title},el('header',{},el('span',{class:'gai-app-kicker',text:'내가 만든 수업 앱'}),el('h2',{text:activity.title}),el('p',{class:'gai-app-instructions',text:activity.instructions})),frame,
  el('footer',{},el('p',{class:'gai-app-hint',text:hint}),save,status));
 const send=message=>{if(!destroyed)frame.contentWindow?.postMessage({...message,bridge},'*');};
 let currentRoom=roomState;
 const snapshot=()=>({connected:!!currentRoom,room:{phase:'running',round:1,message:'온바탕에서 연습하고 있어요.',ranking:false,...currentRoom},me:{id:'practice',nickname:'연습',checkpoint:clone(checkpoint),...clone(reported)},participants:[]});
 const handler=event=>{
  const d=event.data;if(destroyed||event.source!==frame.contentWindow||d?.bridge!==bridge)return;
  if(d.type==='onbatang-app-key'){if(['PageDown','PageUp','Escape'].includes(d.key))onKey?.(d.key);return;}
  if(d.type==='onbatang-app-captured'){
   if(!capture||d.request!==capture.request)return;
   let image;try{if(d.image!==undefined)image=cleanGaiImage(d.image);}catch{/* Invalid app-supplied pictures never reach a slide. */}
   const pending=capture;capture=null;clearTimeout(pending.timer);if(d.error){pending.reject(new Error('앱의 최신 진행 기록을 읽지 못했어요. 다시 시도해주세요.'));return;}pending.resolve({...(image?{image}:{}),...((d.imageOmitted===true||d.image!==undefined&&!image)?{imageOmitted:true}:{})});return;
  }
  if(d.type!=='gai-classroom-report'||!uuid(d.request))return;
  if(inFlight>=32){send({type:'gai-classroom-result',request:d.request,error:'진행 기록을 저장 중이에요. 잠시 뒤 다시 시도해주세요.'});return;}
  let patch;try{patch=cleanGaiPatch(d.patch);}catch{send({type:'gai-classroom-result',request:d.request,error:'앱의 진행 기록 형식이나 크기를 확인해주세요.'});return;}
  inFlight++;
  serial=serial.then(async()=>{
   if(destroyed)return;
   const next=patch.checkpoint===undefined?checkpoint:patch.checkpoint;
   checkpoint=clone(next);for(const key of ['state','answer','score','completed','progress'])if(patch[key]!==undefined)reported[key]=clone(patch[key]);
   if(patch.checkpoint!==undefined)await onChange?.(clone(next));
   if(destroyed)return;
   reportError=false;
   if(['checkpoint','state','answer','progress','score','completed'].every(key=>Object.hasOwn(patch,key))){if(!ready)status.textContent='앱 안에서 활동해 보세요. 결과는 아래 버튼으로 저장해요.';ready=true;save.disabled=busy||typeof onSave!=='function';}
   send({type:'gai-classroom-state',snapshot:snapshot()});send({type:'gai-classroom-result',request:d.request});
  }).catch(()=>{reportError=true;if(!destroyed){status.textContent='진행 기록을 저장하지 못했어요. 앱은 그대로 열려 있어요. 다시 시도해주세요.';send({type:'gai-classroom-result',request:d.request,error:'진행 기록을 저장하지 못했어요. 다시 시도해주세요.'});}}).finally(()=>{inFlight--;});
 };
 window.addEventListener('message',handler);
 body.addEventListener('click',event=>event.stopPropagation());
 for(const type of ['keydown','keyup'])body.addEventListener(type,event=>{if(event.key!=='Escape')event.stopPropagation();});
 save.addEventListener('click',async event=>{
  event.stopPropagation();if(busy||destroyed||!ready||typeof onSave!=='function')return;
  busy=true;save.disabled=true;frame.style.pointerEvents='none';status.textContent='앱의 결과를 준비하고 있어요.';
  try{
   const picture=await new Promise((resolve,reject)=>{
    const request=crypto.randomUUID(),timer=setTimeout(()=>{capture=null;reject(new Error('앱의 응답을 기다리다 멈췄어요. 진행 기록은 그대로예요. 다시 시도해주세요.'));},4000);
    capture={request,resolve,reject,timer};send({type:'onbatang-app-capture',request});
   });
   await serial;if(destroyed)return;if(reportError)throw new Error('앱의 진행 기록을 저장하지 못했어요. 다시 시도해주세요.');
   const result=cleanGaiResult({state:checkpoint,answer:reported.answer,score:reported.score,completed:reported.completed,progress:reported.progress,...picture});
   await onSave(result);if(!destroyed)status.textContent=result.imageOmitted?'앱 화면 그림은 생략하고 답과 진행 상태를 저장했어요.':saveMessage;
  }catch(error){if(!destroyed)status.textContent=`저장하지 못했어요. 앱과 진행 기록은 그대로예요. ${String(error?.message||'다시 시도해주세요.').slice(0,200)}`;}
  finally{busy=false;if(!destroyed){save.disabled=!ready;frame.style.pointerEvents='';}}
 });
 frame.srcdoc=sandboxSource(activity,bridge);root.replaceChildren(body);
 return {getState:()=>clone(checkpoint),setRoomState(value){currentRoom=value;send({type:'gai-classroom-state',snapshot:snapshot()});},destroy(){if(destroyed)return;destroyed=true;window.removeEventListener('message',handler);if(capture){clearTimeout(capture.timer);capture.resolve({});capture=null;}body.remove();}};
}
