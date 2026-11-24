import {el} from './ui.js';
import {readPixels,canvasToPng,ACCEPT_IMAGES} from '../src/images.js';
import {cleanStoryPhoto,storyPhotoId,storyPhotoGroups,replaceStoryPhoto} from '../src/story-photos.js';
export {ACCEPT_IMAGES};
const dataUrl=blob=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(Error('사진을 읽지 못했어요.'));r.readAsDataURL(blob);});
export async function readStoryPhoto(file){
 if(!file||file.size>10*1024*1024||!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('10MB 이하 PNG·JPG·WebP 사진을 골라 주세요.');
 for(const max of [1000,700,480]){
  const {canvas,ratio}=await readPixels(file,max);
  try{const made=await canvasToPng(canvas);if(made.blob.size<=550000)return cleanStoryPhoto({id:storyPhotoId(),url:await dataUrl(made.blob),ratio,alt:'이야기 사진'});}
  finally{canvas.width=canvas.height=0;}
 }
 throw Error('사진 용량을 줄이지 못했어요. 더 작은 사진을 골라 주세요.');
}
export function createStoryPhotoManager(host){
 let disposed=false,busy=false,pending=null,undoToken=null;
 const list=el('fieldset',{class:'story-photo-list',style:{border:'0',padding:'0',margin:'0',minWidth:'0'}}),status=el('p',{role:'status','aria-live':'polite'}),preview=el('div',{class:'story-photo-compare'});
 const apply=el('button',{class:'btn btn-primary',type:'button',disabled:true,onClick:async()=>{
  if(!pending||busy)return;
  try{
   if(JSON.stringify(host.slides())!==JSON.stringify(pending.base))throw Error('사진을 고르는 동안 자료가 바뀌었어요. 다시 골라 주세요.');
   const problem=host.blocked();if(problem)throw Error(problem);
   busy=true;apply.disabled=true;
   const token=await host.apply(pending.next,pending.base);if(!token)throw Error('사진을 적용하지 못했어요. 기존 자료는 유지됩니다.');
   undoToken=token;pending=null;preview.replaceChildren();draw();status.textContent='연결된 사진을 바꿨어요. 각 장의 위치·크기·동작·발화는 그대로예요.';
  }catch(e){status.textContent=e.message;}finally{busy=false;if(!disposed)apply.disabled=!pending;}
 }},'연결된 사진에 적용 · 차감 없음');
 const undo=el('button',{class:'btn',type:'button',disabled:true,onClick:async()=>{
  if(busy||!undoToken)return;
  if(!host.canUndo(undoToken)){status.textContent='그 뒤에 편집한 내용이 있어요. 편집기의 실행 취소로 순서대로 되돌려 주세요.';return;}
  busy=true;try{if(await host.undo(undoToken)){undoToken=null;pending=null;preview.replaceChildren();draw();status.textContent='사진 교체를 되돌렸어요.';}}finally{busy=false;}
 }},'사진 교체 되돌리기');
 const root=el('section',{class:'story-author','aria-label':'이야기 사진'},el('h2',{text:'이야기 사진'}),el('p',{class:'cv-down-note',text:'같은 사진을 쓴 발화 단계와 장면을 함께 바꿉니다. 사진 선택·교체는 AI를 호출하지 않습니다. 위치·크기·잘라 보기·동작·발화는 유지합니다.'}),list,preview,status,el('div',{class:'story-actions'},apply,undo));
 function draw(){
  list.replaceChildren();undo.disabled=!undoToken;apply.disabled=!pending;
  const groups=storyPhotoGroups(host.slides());
  if(!groups.length)list.append(el('p',{text:'원고로 이야기 만들기에서 장면 사진을 넣으면 여기에 보여요.'}));
  groups.forEach((g,i)=>{
   const input=el('input',{type:'file',accept:ACCEPT_IMAGES,'aria-label':`${i+1}번 연결 사진 교체`,disabled:g.diverged||g.locked,onChange:async()=>{
    const file=input.files?.[0];if(!file||busy||disposed)return;
    const base=structuredClone(host.slides());busy=true;list.disabled=true;pending=null;preview.replaceChildren();apply.disabled=true;status.textContent='사진을 읽고 있어요.';
    try{const photo=await readStoryPhoto(file);if(disposed)return;pending={base,next:replaceStoryPhoto(base,g.id,photo)};
     const pages=base.flatMap((s,i)=>s.items.some(it=>it.morphKey===g.id)?[i]:[]),pair=el('div',{class:'story-photo-pair'});
     const show=i=>pair.replaceChildren(el('figure',{},host.view(base[i]),el('figcaption',{text:'교체 전'})),el('figure',{},host.view(pending.next[i]),el('figcaption',{text:'교체 후 · 배치와 잘라 보기 유지'})));
     const pick=el('select',{'aria-label':'사진 교체 미리보기 장',onChange:e=>show(Number(e.target.value))},...pages.map(i=>el('option',{value:String(i),text:`${i+1}번째 장에서 비교`})));show(pages[0]);
     preview.replaceChildren(el('label',{},'발표 화면에서 비교',pick),pair);
     apply.textContent=`${g.pages}개 장 · ${g.count}곳에 적용 · 차감 없음`;status.textContent='비교한 뒤 적용해 주세요. 아직 발표는 바뀌지 않았어요.';
    }catch(e){if(!disposed)status.textContent=e.message;}finally{busy=false;input.value='';if(!disposed){list.disabled=false;apply.disabled=!pending;}}
   }});
   list.append(el('article',{class:'story-photo-row'},el('img',{src:g.url,alt:g.alt}),el('div',{},el('p',{text:`${g.alt} · ${g.pages}개 장 / ${g.count}곳`}),g.diverged?el('p',{text:'개별 교체한 사진이 섞여 있어 함께 바꾸기를 멈췄어요.'}):g.locked?el('p',{text:'잠근 사진이 있어 함께 바꾸기를 멈췄어요.'}):null,el('label',{},'새 사진으로 함께 바꾸기',input))));
  });
 }
 draw();return {node:root,destroy(){disposed=true;}};
}
