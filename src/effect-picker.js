import { el } from './dom.js';
import { EFFECT_ASSETS, effectArt, cleanEffect, previewEffect } from './effect-assets.js';
import { CLUE_LIMITS, clueOptions } from './clue-card.js';
import { reducedMotion } from './motion-preference.js';
import { mountMotionStudy } from './motion-study.js';
import { introBpm } from './effect-scenes.js';

export function effectPicker(item, apply, aspect=1) {
  const saved = cleanEffect(item.effect,item);
  let selected = saved?.id || EFFECT_ASSETS[0].id;
  const choices = el('div', { class:'fe-fx-choices', role:'group', 'aria-label':'그래픽 효과 선택' });
  const sample = el('div', { class:'fe-fx-sample', 'aria-hidden':'true' });
  const study=el('div',{class:'fe-study-author',hidden:true});
  const cueDrafts=new Map(saved?.stops?[[saved.id,saved.stops]]:[]);
  let stopStudy;
  const hint = el('small', { class:'fe-note' });
  const option = ([value, text]) => el('option',{ value, text });
  const pace=el('select',{'aria-label':'재생 속도'},...[
    ['normal','보통'],['slow','여유롭게'],['fast','빠르게'],
  ].map(option));
  const palette=el('select',{'aria-label':'효과 색감'},...[
    ['original','기본 색감'],['lagoon','민트 · 바다'],['sunset','노을 · 산호'],['iris','보라 · 오로라'],
  ].map(option));
  pace.value=saved?.pace || 'normal'; palette.value=saved?.palette || 'original';
  let step=0, active;
  const prompt=el('input',{type:'text',maxlength:CLUE_LIMITS.prompt,value:saved?.prompt||'',placeholder:'어떤 답이 떠오르나요?'});
  const hints=Array.from({length:CLUE_LIMITS.hints},(_,i)=>el('input',{type:'text',maxlength:CLUE_LIMITS.hint,value:saved?.hints?.[i]||''}));
  const cardFields=el('fieldset',{class:'fe-clue-fields'},el('legend',{text:'단서 카드 만들기'}),
    el('p',{class:'fe-note',text:'정답으로 쓸 글 · '+(item.t==='text'?item.text:'')}),
    el('label',{},'학생에게 보여 줄 질문',prompt),
    ...hints.map((input,i)=>el('label',{},'힌트 '+(i+1)+' (선택)',input)));
  const bpm=el('input',{type:'number',min:60,max:180,step:1,value:String(saved?.bpm||100),'aria-label':'분당 박자'});
  const tempo=el('label',{},'분당 박자 (60–180 BPM)',bpm);
  const speed=el('label',{},'재생 속도',pace);
  function options(){
    if(selected==='beatintro')return {bpm:introBpm(Number(bpm.value))};
    return selected==='cluecard'?clueOptions({prompt:prompt.value,hints:hints.map(input=>input.value)}):{};
  }
  bpm.onchange=()=>{bpm.value=String(introBpm(Number(bpm.value)||100));preview(true);};
  cardFields.oninput=()=>{step=0;preview(false);};
  const when = el('select', { 'aria-label':'그래픽 효과 재생 시점' },
    el('option', { value:'press', text:'이 조각을 누를 때' }), el('option', { value:'open', text:'장이 열릴 때' }));
  when.value = saved?.when || 'press';
  const observe=el('input',{type:'checkbox',checked:saved?.observe});
  const studyOption=el('label',{class:'fe-observe-option'},observe,'발표에서 멈춰 보며 설명하기');
  function updateWhen(){
    when.disabled=(!!active.last && active.id!=='cluecard') || (!active.last && observe.checked);
    if(when.disabled)when.value='press';
  }
  observe.onchange=()=>{updateWhen();preview(false);};
  const replay=el('button',{class:'fe-btn',type:'button',onClick:()=>{
    if(active.last) step=(step+1)%(active.last(item,options())+1);
    preview(true,!active.last && reducedMotion(sample));
  }});
  function preview(animate, playOnce=false) {
    const opts=options();
    stopStudy?.();stopStudy=null;
    const observing=!active.last && observe.checked;
    study.hidden=!observing;sample.hidden=observing;replay.hidden=observing;
    if(observing){
      stopStudy=mountMotionStudy(study,active,{content:{...item,aspect},pace:pace.value,palette:palette.value,...opts,
        stops:cueDrafts.get(selected)},null,stops=>cueDrafts.set(selected,stops));
      return;
    }
    replay.textContent=active.last?(step===active.last(item,opts)?'처음부터':active.next(step,item,opts)):(reducedMotion(sample)?'움직임 한 번 재생':'다시 보기');
    previewEffect(sample,selected,animate,{content:{...item,aspect},step,pace:pace.value,palette:palette.value,playOnce,...opts});
  }
  pace.onchange=palette.onchange=() => preview(true);
  function pick(asset, animate) {
    selected = asset.id;active=asset;step=0;
    tempo.hidden=selected!=='beatintro';speed.hidden=!tempo.hidden;
    if(!tempo.hidden)pace.value='normal';
    cardFields.hidden=selected!=='cluecard';
    if(cardFields.hidden)controls.insertBefore(choices,cardFields);
    else controls.append(choices);
    studyOption.hidden=!!asset.last;
    updateWhen();
    hint.textContent = asset.hint;
    for (const button of choices.querySelectorAll('button')) button.setAttribute('aria-pressed',String(button.dataset.effectAsset === selected));
    preview(animate);
  }
  for (const [filter,title] of [[a=>a.last,'질문하고 단계별 공개'],[a=>a.example&&!a.last,'수업 내용 강조'],[a=>!a.example,'시선을 끄는 효과']]) {
    choices.append(el('b',{class:'fe-fx-group',text:title}));
    for(const asset of EFFECT_ASSETS.filter(filter)) {
      const allowed=!!cleanEffect({id:asset.id},item);
      const sub=asset.requires || (asset.example?.t==='text'?'글 조각 전용':'막대 차트 전용');
      choices.append(el('button', { type:'button', class:'fe-fx-choice', dataset:{effectAsset:asset.id},
        disabled:!allowed,title:allowed?asset.hint:sub,onClick:() => pick(asset,true) },
        el('span', { class:'fe-fx-icon','aria-hidden':'true' },effectArt(asset.id)), el('span',{},asset.name, !allowed && el('small',{text:sub}))));
    }
  }
  const note = el('input', { type:'text', maxLength:120, placeholder:'함께 보여 줄 설명 (선택)', 'aria-label':'효과 설명', value:saved?.note || '' });
  const save = el('button', { class:'fe-btn primary', type:'button', dataset:{applyEffect:''}, text:'고른 조각에 적용',
    onClick:() => apply(cleanEffect({ id:selected, when:when.value, observe:!active.last && observe.checked, stops:cueDrafts.get(selected), note:note.value, pace:pace.value, palette:palette.value,...options() },item)) });
  const controls=el('div', { class:'fe-fx-controls' }, sample,study,
      el('div',{class:'fe-fx-preview-actions'},hint,replay),
      cardFields, choices, el('div',{class:'fe-fx-settings'},tempo,speed,el('label',{},'효과 색감',palette)),
      studyOption, el('label',{},'재생 시점',when), note,
      el('div', { class:'fe-row' }, save, saved && el('button', { class:'fe-btn', type:'button', text:'효과 빼기', onClick:() => apply(null) })));
  pick(EFFECT_ASSETS.find(asset => asset.id === selected),false);
  return el('details', { class:'fe-fx-picker', open:!!saved },
    el('summary', { text:'HTML 그래픽 효과' + (saved ? ' · '+EFFECT_ASSETS.find(asset => asset.id === saved.id).name : '') }),controls);
}
