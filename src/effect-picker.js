import { el } from './dom.js';
import { EFFECT_ASSETS, effectArt, cleanEffect, previewEffect } from './effect-assets.js';

export function effectPicker(item, apply) {
  const saved = cleanEffect(item.effect);
  let selected = saved?.id || EFFECT_ASSETS[0].id;
  const choices = el('div', { class:'fe-fx-choices', role:'group', 'aria-label':'그래픽 효과 선택' });
  const sample = el('div', { class:'fe-fx-sample', 'aria-hidden':'true' });
  const hint = el('small', { class:'fe-note' });
  const option = ([value, text]) => el('option',{ value, text });
  const pace=el('select',{'aria-label':'재생 속도'},...[
    ['normal','보통'],['slow','여유롭게'],['fast','빠르게'],
  ].map(option));
  const palette=el('select',{'aria-label':'효과 색감'},...[
    ['original','기본 색감'],['lagoon','민트 · 바다'],['sunset','노을 · 산호'],['iris','보라 · 오로라'],
  ].map(option));
  pace.value=saved?.pace || 'normal'; palette.value=saved?.palette || 'original';
  const preview = animate => previewEffect(sample,selected,animate,{content:item,pace:pace.value,palette:palette.value});
  pace.onchange=palette.onchange=() => preview(true);
  function pick(asset, animate) {
    selected = asset.id;
    hint.textContent = asset.hint;
    for (const button of choices.querySelectorAll('button')) button.setAttribute('aria-pressed',String(button.dataset.effectAsset === selected));
    preview(animate);
  }
  for (const [group,title] of [[true,'수업 내용 강조'],[false,'시선을 끄는 효과']]) {
    choices.append(el('b',{class:'fe-fx-group',text:title}));
    for(const asset of EFFECT_ASSETS.filter(a=>!!a.example===group)) {
      const allowed=!!cleanEffect({id:asset.id},item);
      const sub=asset.id==='kinetic'?'글 조각 전용':'막대 차트 전용';
      choices.append(el('button', { type:'button', class:'fe-fx-choice', dataset:{effectAsset:asset.id},
        disabled:!allowed,title:allowed?asset.hint:sub,onClick:() => pick(asset,true) },
        el('span', { class:'fe-fx-icon' },effectArt(asset.id)), el('span',{},asset.name, !allowed && el('small',{text:sub}))));
    }
  }
  pick(EFFECT_ASSETS.find(asset => asset.id === selected),false);
  const when = el('select', { 'aria-label':'그래픽 효과 재생 시점' },
    el('option', { value:'press', text:'이 조각을 누를 때' }), el('option', { value:'open', text:'장이 열릴 때' }));
  when.value = saved?.when || 'press';
  const note = el('input', { type:'text', maxLength:120, placeholder:'함께 보여 줄 설명 (선택)', 'aria-label':'효과 설명', value:saved?.note || '' });
  const save = el('button', { class:'fe-btn primary', type:'button', dataset:{applyEffect:''}, text:'고른 조각에 적용',
    onClick:() => apply(cleanEffect({ id:selected, when:when.value, note:note.value, pace:pace.value, palette:palette.value },item)) });
  return el('details', { class:'fe-fx-picker', open:!!saved },
    el('summary', { text:'HTML 그래픽 효과' + (saved ? ' · '+EFFECT_ASSETS.find(asset => asset.id === saved.id).name : '') }),
    el('div', { class:'fe-fx-controls' }, sample,
      el('div',{class:'fe-fx-preview-actions'},hint,el('button',{class:'fe-btn',type:'button',text:'다시 보기',onClick:()=>preview(true)})),
      choices, el('div',{class:'fe-fx-settings'},el('label',{},'재생 속도',pace),el('label',{},'효과 색감',palette)),
      el('label',{},'재생 시점',when), note,
      el('div', { class:'fe-row' }, save, saved && el('button', { class:'fe-btn', type:'button', text:'효과 빼기', onClick:() => apply(null) }))));
}
