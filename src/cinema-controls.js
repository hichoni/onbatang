import {el} from './dom.js';
import {cinemaSettings, cinemaTuning, sceneContent} from './effect-scenes.js';
import {EFFECT_PALETTES} from './effect-assets.js';
import {openCinemaStudio} from './cinema-studio.js';

// The gallery and editor both edit a draft. Only the editor's Apply command writes a slide.
export function cinemaControls(asset, initial, source, onEdit, commit) {
  const dial=cinemaTuning[asset.id], key='onbatang-cinema-style-v1-'+asset.id;
  const scale=dial.scale||1;
  function styleOptions(raw){
    const result=cinemaSettings(asset.id,raw);
    if(raw.palette==='original'||Object.hasOwn(EFFECT_PALETTES,raw.palette))result.palette=raw.palette;
    if(asset.id!=='beatintro' && ['normal','slow','fast'].includes(raw.pace))result.pace=raw.pace;
    return result;
  }
  let draft=styleOptions(initial);
  const field=(label,control)=>el('label',{},label,control);
  const action=(name,fn)=>el('button',{type:'button',class:'fe-btn',text:name,onClick:fn});
  const words=el('textarea',{rows:3,maxlength:144,'aria-label':'효과 문구'});
  const color=el('input',{type:'color','aria-label':'강조색'});
  const hex=el('input',{type:'text',maxlength:7,spellcheck:'false','aria-label':'강조색 코드',placeholder:'#336699'});
  const select=(name,items)=>el('select',{'aria-label':name},...items.map(([value,text])=>el('option',{value},text)));
  const colors=select('장면 색감',[['original','기본 색감'],['lagoon','민트 · 바다'],['sunset','노을 · 산호'],['iris','보라 · 오로라']]);
  const speed=select('장면 재생 속도',[['normal','보통'],['fast','빠르게'],['slow','여유롭게']]);
  const tuning=asset.id==='spotlighttitle'
    ? el('select',{'aria-label':dial.label},el('option',{value:'right'},'왼쪽 → 오른쪽'),el('option',{value:'left'},'오른쪽 → 왼쪽'))
    : el('input',{type:'number',min:dial.min/scale,max:dial.max/scale,step:dial.step||1,'aria-label':dial.label});
  const tuneValue=()=>tuning.type==='number'?Math.round(tuning.valueAsNumber*scale):tuning.value;
  const message=el('small',{role:'status'});
  const valid=()=>!!sceneContent(asset.id,{t:'text',text:source().text},draft.sceneText);
  function report(note=''){
    words.setAttribute('aria-invalid',String(!valid()));
    message.textContent=valid()?note:asset.id==='rollingnumber'?'8자리 이내의 숫자가 든 문장을 입력해 주세요.':'표시할 글을 입력해 주세요.';
  }
  function refresh(){
    const base=source();
    words.value=draft.sceneText??base.text;
    colors.value=draft.palette??(base.palette||'original');speed.value=draft.pace??(base.pace||'normal');
    color.value=draft.accent??(EFFECT_PALETTES[colors.value]||asset.ink)[0];
    hex.value=color.value;
    const tuned=draft[dial.key]??(asset.id==='beatintro'?base.bpm:undefined)??dial.base;
    tuning.value=tuning.type==='number'?tuned/scale:tuned;
    report();
  }
  function changed(animate=false,note=''){
    report(note);onEdit(animate);
  }
  words.oninput=()=>{
    const text=Array.from(words.value.trim()).slice(0,72).join('');
    if(text && text!==source().text)draft.sceneText=text;
    else delete draft.sceneText;
    // Replacing the whole message resets per-phrase wording, but keeps its layout.
    if(draft.sceneTracks)draft.sceneTracks=draft.sceneTracks.map(({text,...layout})=>layout);
    changed();
  };
  words.onblur=()=>{words.value=draft.sceneText??source().text;};
  color.oninput=()=>{draft.accent=color.value;hex.value=color.value;changed();};
  colors.onchange=()=>{draft.palette=colors.value;delete draft.accent;refresh();changed();};
  speed.onchange=()=>{draft.pace=speed.value;changed(true);};
  hex.oninput=()=>{
    const value=hex.value.trim().replace(/^#?/,'#');
    if(/^#[a-f\d]{6}$/i.test(value)){draft.accent=value.toLowerCase();color.value=value;changed();}
  };
  hex.onblur=()=>{hex.value=color.value;};
  tuning.oninput=()=>{
    if(tuning.type==='number' && (!tuning.value || !tuning.validity.valid))return;
    draft[dial.key]=tuneValue();
    changed(true);
  };
  tuning.onchange=()=>{
    if(tuning.type==='number' && tuning.value && Number.isFinite(tuning.valueAsNumber)){
      draft[dial.key]=Math.max(dial.min,Math.min(dial.max,tuneValue()));
    }
    refresh();changed(true);
  };
  const reset=action('꾸미기 초기화',()=>{draft={};refresh();changed(false,'원래 문구와 기본 연출로 돌아왔어요.');});
  const saveStyle=action('내 스타일 저장',()=>{
    const style=styleOptions({accent:color.value,palette:colors.value,pace:speed.value,[dial.key]:tuneValue()});
    try{localStorage.setItem(key,JSON.stringify(style));report('이 기기에 강조색과 움직임 설정을 저장했어요.');}
    catch{report('이 브라우저에 스타일을 저장할 수 없어요.');}
  });
  const loadStyle=action('내 스타일 불러오기',()=>{
    try{
      const stored=localStorage.getItem(key);
      if(!stored){report('이 효과에서 먼저 내 스타일을 저장해 주세요.');return;}
      const style=JSON.parse(stored);
      draft={...styleOptions({...style,sceneText:undefined}),sceneText:draft.sceneText,sceneTracks:draft.sceneTracks};
      refresh();changed(true,'현재 문구에 저장한 스타일을 적용했어요.');
    }catch{report('저장한 스타일을 읽을 수 없어요.');}
  });
  const label=asset.id==='fieldroute'?'수업 단계 · 한 줄에 한 단계':asset.id==='rollingnumber'?'숫자가 든 문장':'효과 문구';
  const studio=action('화면 · 타임라인 편집',()=>{
    if(!valid())return;
    openCinemaStudio(asset,{palette:colors.value,pace:speed.value,...draft},
      {t:'text',text:source().text},result=>{draft=styleOptions(result);refresh();changed();commit?.();},{commit:!!commit});
  });
  const node=el('fieldset',{class:'fe-cinema-fields'},el('legend',{},asset.name+' 꾸미기'),
    studio,el('small',{},'구절을 직접 옮기고 크기·등장 순서·시간을 한 화면에서 조절해요. 아래 전체 문구를 바꾸면 구절별 글도 새 문구를 따라가요.'),
    field(label,words),el('small',{},'첫 72자를 사용해요. 문구를 비우면 원래 글을 따라가요.'),
    el('div',{class:'fe-cinema-values'},field('장면 색감',colors),asset.id!=='beatintro'&&field('재생 속도',speed)),
    el('div',{class:'fe-cinema-values'},field('강조색',color),field('색상 코드',hex)),
    field(dial.label+(dial.unit?' ('+dial.unit+')':''),tuning),
    el('div',{class:'fe-cinema-buttons'},reset,saveStyle,loadStyle),message);
  refresh();
  return {node,read:()=>({...draft}),valid,refresh};
}
