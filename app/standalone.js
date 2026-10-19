// Standalone product entry: common editor + optional account-free PPTX workspace.
// A host supplies its own brand, storage namespace and explicit material actions.
import {startMinican,openSavedDesign,isMinicanStarted} from './app.js';
import {ONBATANG_FONTS,ONBATANG_TITLE_FONT} from './fonts.js';
import {mountPptxApp} from './pptx-import/app.js';
import {toast} from './ui.js';
import {getDesign,putDesign,replaceDesignIfUnchanged} from './store.js';
import {migrateRecord} from './designs.js';
import {createGaiPopupProvider} from './gai-provider.js';

export async function startOnbatang({root=document.getElementById('app'),fonts=ONBATANG_FONTS,titleFont=ONBATANG_TITLE_FONT,storage='minican',onView,onMaterialSaved,materialActions=[],fontServices,styles=true,...options}={}){
 if(!root)throw Error('onbatang root');
 if(isMinicanStarted())throw Error('minican already started');
 // Existing visitors may still have the previous CSS cached for an hour.
 // A release key fetches the matching editor layout without reloading a drawing.
 if(styles)for(const href of [new URL('../src/editor.css?v=0.28.1',import.meta.url).href,new URL('./app.css?v=0.28.1',import.meta.url).href,new URL('./brand.css?v=0.28.1',import.meta.url).href,new URL('./pptx-import/style.css?v=0.28.1',import.meta.url).href]){
  if(![...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===href)){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
 }
 const editor=document.createElement('div'),workspace=document.createElement('section');workspace.className='op-root';workspace.hidden=true;root.classList.add('cv-standalone-shell');root.replaceChildren(editor,workspace);
 let view='home',usingPptx=false,controller,returnToEditor,returning=false,retainedInline;
 const showHome=async()=>{
  if(returnToEditor){
   if(returning)return;returning=true;
   const context=returnToEditor;
   try{await controller.restoreEditorContext(context.material);await openSavedDesign(context.designId,{slideIndex:context.slideIndex,tab:'upload'});returnToEditor=null;usingPptx=context.wasPptx;workspace.hidden=true;editor.hidden=false;}
   catch{toast('편집하던 그림을 다시 열지 못했어요. 저장된 그림은 유지돼요. 다시 돌아가기를 눌러주세요.',5000);}
   finally{returning=false;}
   return;
  }
  usingPptx=false;workspace.hidden=true;editor.hidden=false;
 };
 const openPptx=async(context)=>{
  if(context?.inline){
   const inline=context.inline;
   let session=retainedInline;
   if(session){retainedInline=null;session.inline=inline;inline.root.replaceChildren(session.mount);await session.local.resume();}
   else{
    const mount=document.createElement('section');mount.className='cv-retained-ppt';inline.root.append(mount);
    session={mount,inline,completed:false,local:null};
    session.local=mountPptxApp({root:mount,storage,fonts,fontServices,embedded:true,autoEdit:true,retainOnClose:true,onMaterialSaved,actions:materialActions,onClose:()=>session.inline?.close(),onEdit:async(id,pageIndex)=>{
     const previous={usingPptx,returnToEditor,material:controller.getEditorContext()};
     try{
      await controller.restoreEditorContext(session.local.getEditorContext());usingPptx=true;returnToEditor=null;
      session.completed=true;
      await session.inline.openDesign(id,{slideIndex:pageIndex,tab:'upload'});
     }catch(error){
      session.completed=false;usingPptx=previous.usingPptx;returnToEditor=previous.returnToEditor;await controller.restoreEditorContext(previous.material);throw error;
     }
    }});
   }
   let disposed=false;
   return {requestClose:()=>session.local.requestClose(),async dispose(){
    if(disposed)return;disposed=true;
    if(session.completed)await session.local.dispose();
    else{session.inline=null;session.mount.remove();retainedInline=session;}
   }};
  }
  if(view==='edit')throw Error('그림을 저장한 뒤 PPT를 가져와주세요.');
  const prior={usingPptx,returnToEditor};
  returnToEditor=context?.from==='editor'?{...context,wasPptx:usingPptx,material:controller.getEditorContext()}:null;
  usingPptx=true;editor.hidden=true;workspace.hidden=false;
  try{await controller.open({newImport:context?.from==='editor'});}
  catch(error){usingPptx=prior.usingPptx;returnToEditor=prior.returnToEditor;editor.hidden=false;workspace.hidden=true;throw error;}
 };
 const materialNavigation={async load({designId}){
  const graphs=await controller.library.listMaterials(),graph=graphs.find(value=>value.documents.some(row=>row.id===designId));
  if(!graph)return null;
  const documents=[];
  for(const row of graph.documents){let draft=await getDesign(row.id);if(!draft)draft=await putDesign(row.payload);documents.push(draft);}
  return {title:graph.manifest.title,documents,materialRef:graph.materialRef,pageOrder:graph.pages.map(value=>value.page.id)};
 },async reorder({designId,materialRef,pageIds}){
  const graph=await controller.library.saveOrder({materialRef,pageOrder:pageIds});
  await controller.restoreEditorContext(graph);
  return materialNavigation.load({designId});
 },async saveActivity({designId,materialRef,document,pageOrder,expectedDocument}){
  const canonical=value=>JSON.stringify(value,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
  const before=await getDesign(designId);
  const content=raw=>{if(!raw)return null;const {updatedAt,...value}=raw;return canonical(value);};
  if(expectedDocument&&content(before)!==content(migrateRecord(expectedDocument)))throw Error('다른 창에서 이 자료를 편집했어요. 다시 열어 확인해주세요.');
  const graph=await controller.library.pinEdits({materialRef,drafts:[document],pageOrder});
  const fixed=graph.documents.find(row=>row.id===designId).payload,warnings=[];let saved=fixed,recoveryRequired=false;
  try{saved=await replaceDesignIfUnchanged(fixed,before);}catch{recoveryRequired=true;warnings.push('전체 자료에는 저장했지만 편집 사본은 갱신하지 않았어요. 다른 창의 편집과 저장 공간을 확인해주세요.');}
  // After pinning, return an honest receipt even if a local draft cannot be read.
  const documents=[];
  for(const row of graph.documents){try{documents.push(row.id===designId?saved:(await getDesign(row.id)||row.payload));}catch{documents.push(row.payload);recoveryRequired=true;}}
  try{await controller.restoreEditorContext(graph);}catch{recoveryRequired=true;warnings.push('전체 자료에는 저장했어요. 내 자료에서 다시 열어주세요.');}
  return {title:graph.manifest.title,documents,materialRef:graph.materialRef,pageOrder:graph.pages.map(value=>value.page.id),warnings,recoveryRequired};
 }};
 await startMinican({appMaker:createGaiPopupProvider(),...options,root:editor,fonts,titleFont,storage,materialNavigation,importAction:{label:'PPTX 가져오기',hideHome:true,editorLabel:'내 PPT 올리기',editorMode:'inline',open:openPptx},onView:next=>{
  view=next;onView?.(next);
  if(next==='home'){usingPptx=false;workspace.hidden=true;editor.hidden=false;}
 }});
 controller=mountPptxApp({root:workspace,storage,fonts,fontServices,onMaterialSaved,actions:materialActions,onClose:showHome,onEdit:async(id,pageIndex)=>{
  usingPptx=true;workspace.hidden=true;editor.hidden=false;
  try{await openSavedDesign(id,{slideIndex:pageIndex});returnToEditor=null;}
  catch(error){workspace.hidden=false;editor.hidden=true;throw error;}
 }});
 return {openPptx,showHome,library:controller.library};
}
