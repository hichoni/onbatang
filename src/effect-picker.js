import { el } from './dom.js';
import { EFFECT_ASSETS, effectArt, cleanEffect, previewEffect } from './effect-assets.js';

export function effectPicker(item, apply) {
  const saved = cleanEffect(item.effect);
  let selected = saved?.id || EFFECT_ASSETS[0].id;
  const choices = el('div', { class:'fe-fx-choices', role:'group', 'aria-label':'그래픽 효과 선택' });
  const sample = el('div', { class:'fe-fx-sample', 'aria-hidden':'true' });
  const hint = el('small', { class:'fe-note' });
  function pick(asset, animate) {
    selected = asset.id;
    hint.textContent = asset.hint;
    for (const button of choices.children) button.setAttribute('aria-pressed',String(button.dataset.effectAsset === selected));
    previewEffect(sample, selected, animate);
  }
  for (const asset of EFFECT_ASSETS) {
    choices.append(el('button', { type:'button', class:'fe-fx-choice', dataset:{effectAsset:asset.id},
      onClick:() => pick(asset,true) }, el('span', { class:'fe-fx-icon' }, effectArt(asset.id)), asset.name));
  }
  pick(EFFECT_ASSETS.find(asset => asset.id === selected),false);
  const when = el('select', { 'aria-label':'그래픽 효과 재생 시점' },
    el('option', { value:'press', text:'이 조각을 누를 때' }), el('option', { value:'open', text:'장이 열릴 때' }));
  when.value = saved?.when || 'press';
  const note = el('input', { type:'text', maxLength:120, placeholder:'함께 보여 줄 설명 (선택)', 'aria-label':'효과 설명', value:saved?.note || '' });
  const save = el('button', { class:'fe-btn primary', type:'button', dataset:{applyEffect:''}, text:'고른 조각에 적용',
    onClick:() => apply(cleanEffect({ id:selected, when:when.value, note:note.value })) });
  return el('details', { class:'fe-fx-picker', open:!!saved },
    el('summary', { text:'HTML 그래픽 효과' + (saved ? ' · '+EFFECT_ASSETS.find(asset => asset.id === saved.id).name : '') }),
    el('div', { class:'fe-fx-controls' }, sample, hint, choices, when, note,
      el('div', { class:'fe-row' }, save, saved && el('button', { class:'fe-btn', type:'button', text:'효과 빼기', onClick:() => apply(null) }))));
}
