// Standalone product entry: common editor + optional account-free PPTX workspace.
// A host supplies its own brand, storage namespace and explicit material actions.
import {startMinican,openSavedDesign,isMinicanStarted} from './app.js';
import {ONBATANG_FONTS,ONBATANG_TITLE_FONT} from './fonts.js';
import {mountPptxApp} from './pptx-import/app.js';

export async function startOnbatang({root=document.getElementById('app'),fonts=ONBATANG_FONTS,titleFont=ONBATANG_TITLE_FONT,storage='minican',onView,onMaterialSaved,materialActions=[],fontServices,styles=true,...options}={}){
 if(!root)throw Error('onbatang root');
 if(isMinicanStarted())throw Error('minican already started');
 if(styles)for(const href of [new URL('../src/editor.css',import.meta.url).href,new URL('./app.css',import.meta.url).href,new URL('./brand.css',import.meta.url).href,new URL('./pptx-import/style.css',import.meta.url).href]){
  if(![...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===href)){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
 }
 const editor=document.createElement('div'),workspace=document.createElement('section');workspace.className='op-root';workspace.hidden=true;root.classList.add('cv-standalone-shell');root.replaceChildren(editor,workspace);
 let view='home',usingPptx=false,controller;
 const showHome=()=>{usingPptx=false;workspace.hidden=true;editor.hidden=false;};
 const openPptx=async()=>{if(view==='edit')throw Error('지금 편집을 마친 뒤 PPT를 가져와주세요.');usingPptx=true;editor.hidden=true;workspace.hidden=false;await controller.open();};
 await startMinican({...options,root:editor,fonts,titleFont,storage,importAction:{label:'PPTX 가져오기',open:openPptx},onView:next=>{
  view=next;onView?.(next);
  if(next==='home'&&usingPptx){editor.hidden=true;workspace.hidden=false;controller?.editorClosed().catch(error=>controller.reportError(error));}
 }});
 controller=mountPptxApp({root:workspace,storage,fonts,fontServices,onMaterialSaved,actions:materialActions,onClose:showHome,onEdit:async(id,pageIndex)=>{
  usingPptx=true;workspace.hidden=true;editor.hidden=false;
  try{await openSavedDesign(id);if(pageIndex>0)editor.querySelector(`.cv-slide[data-slide="${pageIndex}"]`)?.click();}
  catch(error){workspace.hidden=false;editor.hidden=true;throw error;}
 }});
 return {openPptx,showHome,library:controller.library};
}
