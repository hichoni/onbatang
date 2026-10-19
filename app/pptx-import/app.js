import {createPptxLibrary} from './library.js';
import {createOnbatangImportStorage} from './import-storage.js';
import {createImportUiServices} from './ui-services.js';
import {mountImportWorkspace} from './workspace.js';
import {defaultImportFontServices} from './fonts.js';
import {getDesign,putDesign} from '../store.js';
import {designView} from '../../src/render.js';
import {configure} from '../../src/model.js';
import {aspectOf} from '../designs.js';
import {createPptx} from '../pptx.js';

const clone=value=>structuredClone(value);
const el=(tag,text,attrs={})=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);return node;};
const message=error=>({REVISION_CONFLICT:'다른 창에서 자료를 먼저 저장했어요. 편집은 기기에 남아 있으니 자료를 다시 열어 확인해주세요.',SOURCE_CHANGED:'원본 출처가 달라 저장하지 않았어요. 편집은 기기에 남아 있어요.',STORAGE_UNAVAILABLE:'이 브라우저에 저장할 수 없어요. 저장 권한과 남은 공간을 확인해주세요.',REVISION_TOO_LARGE:'이 파트의 편집 자료가 너무 커요. 사진 크기를 줄인 뒤 다시 저장해주세요.',MIXED_SLIDE_SIZE:'파트마다 슬라이드 비율이 달라요. 전체 PPTX로 내려받으려면 같은 비율로 맞춰주세요. 편집본과 원본은 그대로 보관됩니다.'}[error?.code]||error?.message||'작업을 마치지 못했어요. 입력한 자료는 유지됩니다.');
const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=el('a','',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};

/** Device-only import workspace. Hosts may add explicit actions without an account SDK. */
export function mountPptxApp({root,storage='minican',fonts,fontServices=defaultImportFontServices,onEdit,onClose,onMaterialSaved,actions=[],embedded=false,autoEdit=false}={}){
 if(!root||typeof onEdit!=='function')throw new TypeError('root and onEdit are required');
 const library=createPptxLibrary({storage}),imports=createOnbatangImportStorage({repository:library.repository});
 const services=createImportUiServices({imports,fonts,fontServices});let current,active=0,busy=false,readOnly=false,exportDialog,latestImport,disposed=false,disposal;
 const importRoot=el('section'),materialRoot=el('section',undefined,{class:'op-material',hidden:''});root.append(importRoot,materialRoot);
 const baseSave=services.saveAll;services.saveAll=async options=>{
  let result;try{result=await baseSave(options);}catch(error){latestImport=error.recovery||null;throw error;}
  latestImport=result;
  if(result.complete){
   try{const graph=await library.ensureMaterial(result);result.materialRef=graph.materialRef;}
   catch(error){error.recovery={...result,complete:false};throw error;}
  }
  return result;
 };
 const button=(text,action,attrs={})=>{const node=el('button',text,{type:'button',...attrs});node.addEventListener('click',()=>Promise.resolve(action()).catch(error=>say(message(error),true)));return node;};
 const status=el('p','',{role:'status','aria-live':'polite','data-pptx-status':''});
 function say(text,failure=false){if(disposed)return;status.textContent=text;status.dataset.error=String(failure);}
 function locked(value){busy=value;materialRoot.setAttribute('aria-busy',String(value));for(const node of materialRoot.querySelectorAll('button'))node.disabled=value;}
 async function source(graph){const row=await imports.reopenDocument({id:graph.documents[0].id,revision:0});if(!disposed)download(row.sourceBlob,row.payload.source.filename||'original.pptx');}
 async function renderLibrary(host){
  const rows=await library.listMaterials();if(disposed)return;if(!rows.length){host.append(el('p','가져온 PPT가 아직 없어요.'));return;}
  for(const graph of rows){const card=el('article',undefined,{class:'oi-result-part','data-pptx-material':graph.manifest.id});
   const text=el('div');text.append(el('strong',graph.manifest.title),el('p',`${graph.pages.length}쪽 · 이 기기에 저장`));
   card.append(text,button('자료 열기',()=>showMaterial(graph.materialRef)),button('원본 PPTX',()=>source(graph)));host.append(card);
  }
 }
 const workspace=mountImportWorkspace({root:importRoot,services,embedded,onClose:async()=>{
  if(busy){say('작업이 끝난 뒤 돌아가주세요.');return false;}
  return onClose?.();
 },onComplete:autoEdit?completeImport:undefined,onOpenDocument:async row=>{
  current=latestImport?.materialRef?await library.getMaterial(latestImport.materialRef):null;readOnly=false;active=0;await edit(row);
 },onOpenMaterial:ref=>showMaterial(ref),renderLibrary});
 async function prepareEdit(row,pageIndex){
  const draft=await getDesign(row.id);if(disposed)return;
  if(!draft)await putDesign(row.payload);if(disposed)return;
  await onEdit(row.id,pageIndex);
 }
 async function completeImport(result){
  if(disposed||result?.complete!==true)return;
  if(busy)throw Error('작업이 끝난 뒤 새 자료를 열어주세요.');
  locked(true);
  try{
   const graph=result.materialRef?await library.getMaterial(result.materialRef):await library.ensureMaterial(result);
   if(disposed)return;
   current=graph;readOnly=false;active=0;
   const first=graph.pages[0];if(!first)throw Error('저장한 자료의 첫 쪽을 찾지 못했어요.');
   await prepareEdit(first.document,first.pageIndex);
  }finally{locked(false);}
 }
 async function working(graph){
  if(readOnly)return graph;
  const rows=await Promise.all(graph.documents.map(async row=>{const draft=await getDesign(row.id);return {...row,payload:draft||row.payload};}));
  const pages=rows.flatMap((row,partIndex)=>row.payload.slides.map((page,pageIndex)=>({page,pageIndex,partIndex,document:row,pageNumber:page.source?.pageNumber??null})));
  return {...graph,documents:rows,pages};
 }
 async function edit(row,pageIndex=0){
  if(busy||disposed)return;locked(true);
  try{await prepareEdit(row,pageIndex);}
  finally{locked(false);}
 }
 async function pin(){
  if(!current)throw Error('자료를 먼저 열어주세요.');
  if(readOnly)throw Error('이전 저장본은 읽기 전용이에요. 최신 편집본을 열어주세요.');
  const drafts=await Promise.all(current.documents.map(row=>getDesign(row.id)));
  current=await library.pinEdits({materialRef:current.materialRef,drafts});
  await onMaterialSaved?.(clone(current));return current;
 }
 async function save(){if(busy)return;locked(true);try{await pin();await paint();say('편집본을 저장했어요. 원본 PPT와 이전 저장본은 보존됩니다.');}finally{locked(false);}}
 async function showMaterial(ref,{readOnly:fixed=false}={}){
  if(disposed)return;
  if(busy)throw Error('작업이 끝난 뒤 이동해주세요.');
  const graph=await library.getMaterial(ref);if(disposed)return;
  const latest=await library.getMaterial({id:ref.id});if(disposed)return;
  current=graph;readOnly=fixed||current.materialRef.revision<latest.materialRef.revision;active=Math.min(active,current.pages.length-1);importRoot.hidden=true;materialRoot.hidden=false;await paint();
 }
 async function paint(){
  if(disposed||!current)return;
  const graph=await working(current);if(disposed)return;active=Math.max(0,Math.min(active,graph.pages.length-1));
  const header=el('header',undefined,{class:'op-header'}),title=el('div');title.append(el('h1',current.manifest.title),el('p',`${graph.pages.length}쪽 · 온바탕${readOnly?' · 이전 저장본 읽기 전용':''}`));
  header.append(button('내 PPT 자료',()=>showLibrary()),title,button('내 그림',requestClose));
  const tools=el('div',undefined,{class:'op-tools'});
  if(readOnly)tools.append(button('최신 편집본 보기',async()=>showMaterial({id:current.manifest.id}),{'data-pptx-latest':''}));
  else tools.append(button('이 쪽 편집',()=>edit(graph.pages[active].document,graph.pages[active].pageIndex),{'data-pptx-edit':''}),button('편집본 저장',save,{'data-pptx-save':''}));
  tools.append(button('PPTX 내려받기',()=>askExport(),{'data-pptx-export':''}),button('원본 PPTX',()=>source(current),{'data-pptx-original':''}));
  for(const action of readOnly?[]:actions)if(typeof action?.label==='string'&&typeof action.run==='function')tools.append(button(action.label,async()=>{locked(true);try{await pin();await action.run(clone(current));}finally{locked(false);}}));
  const sheet=el('section',undefined,{class:'op-sheet','aria-label':'전체 자료의 현재 슬라이드'});
  const selected=graph.pages[active];configure({aspect:aspectOf(selected.document.payload)});sheet.append(designView(selected.page));
  const rail=el('nav',undefined,{class:'op-pages','aria-label':'전체 슬라이드'});
  for(const [index,value]of graph.pages.entries()){
   const node=button(`${index+1} · ${value.pageNumber?`원본 ${value.pageNumber}쪽`:'새 쪽'}`,async()=>{active=index;await paint();},{'data-pptx-page':String(index),'aria-current':String(index===active)});
   node.prepend(designView(value.page));rail.append(node);
  }
  const history=el('details',undefined,{class:'op-history'});history.append(el('summary','원본과 저장 기록'));
  history.append(el('p',`자료 저장본 ${current.manifest.revision} · ${current.documents.length}개 파트를 하나의 자료로 보관합니다.`));
  history.append(button('처음 가져온 자료 보기',()=>showMaterial({id:current.manifest.id,revision:0},{readOnly:true}),{'data-pptx-original-material':''}));
  materialRoot.replaceChildren(header,tools,status,sheet,rail,history);say(readOnly?'이전 저장본을 그대로 보고 있어요. 최신 편집과 원본은 각각 보관됩니다.':'편집은 자동 저장됩니다. 편집본 저장을 누르면 전체 자료에도 반영돼요.');
 }
 function showLibrary(){if(busy||disposed)return;current=null;readOnly=false;materialRoot.hidden=true;importRoot.hidden=false;workspace.showLibrary();}
 function askExport(){
  if(busy||exportDialog?.open)return;
  const dialog=exportDialog=el('dialog',undefined,{class:'op-export','aria-label':'PPTX 내려받기'});
  dialog.append(el('h2','PPTX 내려받기'),el('p','전체 슬라이드를 한 파일로 내려받아요. 원본 PPT는 그대로 보관합니다.'));
  for(const [value,title,help]of [['editable','글·요소 편집형','PowerPoint에서 글·도형·그림을 고칠 수 있어요. 글꼴·배치는 기기에 따라 달라질 수 있어요.'],['image','슬라이드 이미지형','현재 보이는 모습을 쪽마다 한 장의 그림으로 넣어요. 그림 안의 글은 따로 편집할 수 없어요.']]){
   const label=el('label'),input=el('input',undefined,{type:'radio',name:'pptx-mode',value});input.checked=value==='editable';label.append(input,el('strong',title),el('p',help));dialog.append(label);
  }
  const result=el('p','',{role:'status'}),close=button('취소',()=>dialog.close()),go=button('PPTX 내려받기',async()=>{
   close.disabled=true;go.disabled=true;locked(true);
   try{
    if(!readOnly)await pin();const graph=await library.getMaterial(current.materialRef),mode=dialog.querySelector('input:checked').value;
    const ratio=aspectOf(graph.documents[0].payload);if(graph.documents.some(row=>Math.abs(aspectOf(row.payload)-ratio)>.001))throw Object.assign(Error('MIXED_SLIDE_SIZE'),{code:'MIXED_SLIDE_SIZE'});
    const created=await createPptx({slides:graph.pages.map(row=>row.page),size:graph.documents[0].payload.size,aspect:aspectOf(graph.documents[0].payload),title:graph.manifest.title,mode,onProgress:value=>{result.textContent=`PPTX를 만들고 있어요. ${value.completed??''}`;}});
    download(created.blob,graph.manifest.title.replace(/[\\/:*?"<>|]/g,'_')+(mode==='image'?' · 이미지':' · 편집')+'.pptx');dialog.close();await paint();say('전체 PPTX를 내려받았어요. 원본은 그대로 보관됩니다.');
   }catch(error){result.textContent=message(error);}finally{locked(false);close.disabled=false;go.disabled=false;}
  },{'data-pptx-export-confirm':''});dialog.append(result,close,go);dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('close',()=>{dialog.remove();exportDialog=null;});root.append(dialog);dialog.showModal();
 }
 async function requestClose(){
  if(disposed)return true;
  if(busy){say('작업이 끝난 뒤 돌아가주세요.');return false;}
  return workspace.requestClose();
 }
 function dispose(){
  if(disposal)return disposal;
  disposed=true;
  disposal=Promise.resolve().then(async()=>{workspace.dispose();services.dispose();exportDialog?.close();try{await library.close();}finally{root.replaceChildren();}});
  return disposal;
 }
 return {library,requestClose,getEditorContext:()=>({materialRef:current?clone(current.materialRef):null,active}),
  async restoreEditorContext(context){current=context?.materialRef?await library.getMaterial(context.materialRef):null;active=context?.active||0;readOnly=false;},
  async open({newImport=false}={}){if(disposed)throw Error('가져오기 화면을 다시 열어주세요.');importRoot.hidden=false;materialRoot.hidden=true;if(newImport&&workspace.startNewImport())latestImport=null;},showMaterial,showLibrary,reportError:error=>say(message(error),true),async editorClosed(){if(current&&!disposed){importRoot.hidden=true;materialRoot.hidden=false;await paint();}},dispose};
}
