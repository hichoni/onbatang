// Standalone product entry: common editor + optional account-free PPTX workspace.
// A host supplies its own brand, storage namespace and explicit material actions.
import {startMinican,openSavedDesign,isMinicanStarted} from './app.js';
import {ONBATANG_FONTS,ONBATANG_TITLE_FONT} from './fonts.js';
import {mountPptxApp} from './pptx-import/app.js';
import {toast} from './ui.js';

export async function startOnbatang({root=document.getElementById('app'),fonts=ONBATANG_FONTS,titleFont=ONBATANG_TITLE_FONT,storage='minican',onView,onMaterialSaved,materialActions=[],fontServices,styles=true,...options}={}){
 if(!root)throw Error('onbatang root');
 if(isMinicanStarted())throw Error('minican already started');
 if(styles)for(const href of [new URL('../src/editor.css',import.meta.url).href,new URL('./app.css',import.meta.url).href,new URL('./brand.css',import.meta.url).href,new URL('./pptx-import/style.css',import.meta.url).href]){
  if(![...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===href)){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
 }
 const editor=document.createElement('div'),workspace=document.createElement('section');workspace.className='op-root';workspace.hidden=true;root.classList.add('cv-standalone-shell');root.replaceChildren(editor,workspace);
 let view='home',usingPptx=false,controller,returnToEditor,returning=false;
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
  if(view==='edit')throw Error('그림을 저장한 뒤 PPT를 가져와주세요.');
  const prior={usingPptx,returnToEditor};
  returnToEditor=context?.from==='editor'?{...context,wasPptx:usingPptx,material:controller.getEditorContext()}:null;
  usingPptx=true;editor.hidden=true;workspace.hidden=false;
  try{await controller.open({newImport:context?.from==='editor'});}
  catch(error){usingPptx=prior.usingPptx;returnToEditor=prior.returnToEditor;editor.hidden=false;workspace.hidden=true;throw error;}
 };
 await startMinican({...options,root:editor,fonts,titleFont,storage,importAction:{label:'PPTX 가져오기',editorLabel:'내 PPT 올리기',open:openPptx},onView:next=>{
  view=next;onView?.(next);
  if(next==='home'&&usingPptx){editor.hidden=true;workspace.hidden=false;controller?.editorClosed().catch(error=>controller.reportError(error));}
 }});
 controller=mountPptxApp({root:workspace,storage,fonts,fontServices,onMaterialSaved,actions:materialActions,onClose:showHome,onEdit:async(id,pageIndex)=>{
  usingPptx=true;workspace.hidden=true;editor.hidden=false;
  try{await openSavedDesign(id,{slideIndex:pageIndex});returnToEditor=null;}
  catch(error){workspace.hidden=false;editor.hidden=true;throw error;}
 }});
 return {openPptx,showHome,library:controller.library};
}
