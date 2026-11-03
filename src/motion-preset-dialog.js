import {el} from './dom.js';
import {EFFECT_ASSETS,effectArt} from './effect-assets.js';
import {effectFrames,runEffectFrames} from './effect-frames.js';
import {sceneContent} from './effect-scenes.js';
import {createPresetLibrary,presetForContent,MOTION_PRESET_KEY} from './motion-presets.js';

const button=(text,fn,primary=false)=>el('button',{type:'button',class:'ce-button'+(primary?' primary':''),text,onClick:fn});
function modal(title,small=false){
  const opener=document.activeElement;
  const dialog=el('dialog',{class:'fe-motion-library'+(small?' mp-save':''),'aria-label':title});
  const close=()=>{dialog.close();dialog.remove();opener?.focus({preventScroll:true});};
  const header=el('header',{class:'mp-header'},el('div',{},el('small',{},'ONBATANG · MY MOTION'),el('h2',{},title)),button('닫기',close));
  dialog.append(header);dialog.addEventListener('keydown',e=>e.stopPropagation());
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  return {dialog,close,show:()=>{document.body.append(dialog);dialog.showModal();}};
}
const storageNote='이 기기·이 사이트의 브라우저에 저장해요. 공용·가이랩이나 다른 기기로 옮길 때는 보관함 파일을 내려받아 가져오세요.';
export function openSaveMotionPreset(asset,options,content,onSaved){
  const {dialog,close,show}=modal('움직임 이름 붙여 저장',true);
  const name=el('input',{type:'text',maxlength:40,value:asset.name+' · 나의 움직임','aria-label':'프리셋 이름'});
  const status=el('p',{class:'mp-status',role:'status'});
  const save=button('새 프리셋 저장',()=>{
    try{const preset=createPresetLibrary(localStorage).save(asset.id,options,content,name.value);close();onSaved?.(preset);}
    catch(error){status.textContent=error.message;}
  },true);
  dialog.append(el('div',{class:'mp-save-body'},el('div',{class:'mp-preview','aria-hidden':'true'},effectArt(asset.id,false,{...options,content})),
    el('label',{},'프리셋 이름',name),el('p',{},'문구·색감·배치·등장 순서·시간을 함께 보관해요. 같은 이름으로 저장해도 기존 프리셋을 덮어쓰지 않아요.'),
    el('small',{},storageNote),status,save));
  name.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();save.click();}};
  show();name.focus();name.select();
}

export function openMotionLibrary({effectId,content,onApply}={}){
  const {dialog,close,show}=modal('내 움직임 보관함');
  let selected,rows=[],stop,frames,library;
  const assets=EFFECT_ASSETS.filter(a=>a.cinematic),assetFor=id=>assets.find(a=>a.id===id);
  const status=el('p',{class:'mp-status',role:'status'}),count=el('span',{class:'mp-count'});
  const search=el('input',{type:'search',placeholder:'이름으로 찾기','aria-label':'프리셋 검색'});
  const filter=el('select',{'aria-label':'프리셋 효과 종류'},el('option',{value:''},'모든 움직임'),...assets.map(a=>el('option',{value:a.id},a.name)));
  if(effectId){filter.value=effectId;filter.disabled=true;}
  const list=el('div',{class:'mp-list',role:'group','aria-label':'저장한 프리셋'});
  const preview=el('div',{class:'mp-preview'}),title=el('h3'),type=el('small');
  const name=el('input',{type:'text',maxlength:40,'aria-label':'선택한 프리셋 이름'});
  const wording=el('select',{'aria-label':'프리셋 문구 적용'},
    el('option',{value:'current'},'현재 글에 움직임만 적용'),el('option',{value:'saved'},'저장한 문구도 함께 사용'));
  if(!content){wording.value='saved';wording.disabled=true;}
  const seek=el('input',{type:'range',min:0,max:1000,step:1,value:1000,'aria-label':'프리셋 재생 위치'});
  const time=el('output'),validation=el('p',{class:'mp-validation'});
  const halt=()=>{stop?.();stop=null;play.textContent='▶ 미리보기';};
  const current=()=>rows.find(p=>p.id===selected);
  const applied=()=>presetForContent(current(),wording.value==='current');
  const play=button('▶ 미리보기',()=>{
    if(stop){halt();return;}if(!frames)return;
    preview.replaceChildren(frames.svg);const start=+seek.value>=1000?0:+seek.value/1000;paint(start);
    play.textContent='Ⅱ 멈춤';stop=runEffectFrames(frames,start,frames.duration,paint,()=>{stop=null;play.textContent='▶ 미리보기';});
  },true);
  function paint(p){seek.value=Math.round(p*1000);time.textContent=(p*frames.duration/1000).toFixed(1)+' / '+(frames.duration/1000).toFixed(1)+'초';}
  seek.oninput=()=>{halt();if(!frames)return;preview.replaceChildren(frames.svg);frames.paint(+seek.value/1000);paint(+seek.value/1000);};
  const apply=button('이 움직임 불러오기',()=>{
    if(!current()||apply.disabled)return;
    const preset=current(),options=applied();close();onApply?.(preset.effectId,options);
  },true);apply.hidden=!onApply;
  const confirmDelete=el('div',{class:'mp-delete-confirm',hidden:true},el('span',{},'보관함에서 지울까요? 슬라이드에 적용한 움직임은 남아요.'),
    button('삭제 확인',()=>mutate(()=>{library.remove(selected);selected=null;})),button('취소',()=>{confirmDelete.hidden=true;}));
  const detail=el('section',{class:'mp-detail',hidden:true},el('div',{},type,title),preview,
    el('div',{class:'mp-transport'},play,seek,time),el('label',{},'불러올 문구',wording),validation,apply,
    el('details',{class:'mp-manage'},el('summary',{},'이름 변경 · 복제 · 삭제'),el('label',{},'프리셋 이름',name),
      el('div',{class:'mp-actions'},button('이름 변경',()=>mutate(()=>library.rename(selected,name.value))),
        button('복제',()=>mutate(()=>{selected=library.duplicate(selected).id;})),
        button('삭제',()=>{confirmDelete.hidden=false;})),confirmDelete));
  const empty=el('p',{class:'mp-empty'},'저장한 움직임이 아직 없어요. 화면 · 타임라인 편집에서 꾸민 뒤 이름을 붙여 저장하세요.');
  function renderPreview(){
    halt();confirmDelete.hidden=true;
    const preset=current();detail.hidden=!preset;empty.hidden=!!preset;frames=null;if(!preset)return;
    title.textContent=preset.name;type.textContent=assetFor(preset.effectId).name+(preset.options.reveal==='step'?' · 하나씩 공개':'');name.value=preset.name;
    const options=applied(),source=content||{t:'text',text:preset.options.sceneText};
    const valid=!!sceneContent(preset.effectId,source,options.sceneText);
    apply.disabled=!valid;play.disabled=!valid;seek.disabled=!valid;
    validation.textContent=valid?'불러온 뒤 슬라이드에 적용하면 저장돼요.':preset.effectId==='rollingnumber'?'현재 글에 숫자가 없어요. 저장한 문구도 함께 사용하거나 숫자가 든 글을 골라 주세요.':'현재 글이 비어 있어요. 저장한 문구도 함께 사용해 주세요.';
    preview.replaceChildren();if(!valid)return;
    frames=effectFrames(preset.effectId,{...options,content:source});frames.paint(1);preview.append(frames.svg);paint(1);
  }
  function renderList(){
    const visible=rows.filter(p=>(!filter.value||p.effectId===filter.value)&&p.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
    if(!visible.some(p=>p.id===selected))selected=visible[0]?.id;
    count.textContent=rows.length+' / 60개';
    list.replaceChildren(...visible.map(p=>el('button',{type:'button',class:'mp-preset','aria-pressed':String(p.id===selected),dataset:{preset:p.id},onClick:()=>{selected=p.id;renderList();}},
      el('span',{class:'mp-swatch',style:'--fe-preset-ink:'+(p.options.accent||assetFor(p.effectId).ink[0]),'aria-hidden':'true'},'✦'),
      el('span',{},el('b',{},p.name),el('small',{},assetFor(p.effectId).name)))));
    empty.textContent=rows.length?'조건에 맞는 프리셋이 없어요. 검색어나 효과 종류를 바꿔 보세요.':'저장한 움직임이 아직 없어요. 화면 · 타임라인 편집에서 꾸민 뒤 이름을 붙여 저장하세요.';
    renderPreview();
  }
  function reload(){try{library=createPresetLibrary(localStorage);rows=library.list();renderList();}catch(error){status.textContent=error.message;}}
  function mutate(fn){try{fn();status.textContent='보관함에 저장했어요.';reload();}catch(error){status.textContent=error.message;}}
  filter.onchange=search.oninput=renderList;wording.onchange=renderPreview;
  const file=el('input',{type:'file',accept:'.json,application/json',hidden:true,'aria-label':'움직임 보관함 파일'});
  const importButton=button('파일 가져오기',()=>file.click());
  file.onchange=async()=>{
    const selectedFile=file.files?.[0];file.value='';if(!selectedFile)return;
    importButton.disabled=true;
    try{
      if(selectedFile.size>500000)throw Error('프리셋 파일은 500KB 이하로 골라 주세요.');
      const result=createPresetLibrary(localStorage).import(await selectedFile.text());
      status.textContent=result.added+'개 추가 · 이미 있는 '+result.skipped+'개 유지';reload();
    }catch(error){status.textContent=error.message;}finally{importButton.disabled=false;}
  };
  const download=button('보관함 파일 내려받기',()=>{
    try{
      const text=createPresetLibrary(localStorage).export(),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
      const a=el('a',{href:url,download:'onbatang-motion-presets.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      status.textContent='공용·가이랩에서 파일 가져오기로 이어 쓸 수 있어요.';
    }catch(error){status.textContent=error.message;}
  });
  dialog.append(el('p',{class:'mp-storage'},storageNote),el('div',{class:'mp-body'},
    el('aside',{class:'mp-sidebar'},el('div',{class:'mp-count-row'},el('b',{},'나의 프리셋'),count),search,filter,list),
    el('div',{class:'mp-detail-wrap'},empty,detail)),
    el('footer',{class:'mp-footer'},el('div',{class:'mp-actions'},download,importButton,file),status));
  const onStorage=e=>{if(e.key===MOTION_PRESET_KEY||e.key===null)reload();};
  window.addEventListener('storage',onStorage);
  dialog.addEventListener('close',()=>{halt();window.removeEventListener('storage',onStorage);},{once:true});
  show();reload();search.focus();
}
