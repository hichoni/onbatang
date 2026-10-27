// 차트 고치기 창: 종류 · 제목 · 단위 · 표(항목 × 계열) · 값 보이기 · 색 묶음, 그리고 미리 보기.
// 표 칸에 엑셀 · 구글 시트 · 한글 표를 붙여 넣으면 표 전체를 바꾼다(chartFromText). 적용하면 onApply(차트 내용)을 부른다.
// 편집기 바깥 화면에 기대지 않게 브라우저의 <dialog> 하나로 그린다(모양은 editor.css 의 .fe-chart-dlg).
import { el } from './dom.js';
import { CHART_KINDS, CHART_LIMITS, CHART_PALETTES, CHART_PALETTE_NAMES, cleanChart, chartFromText, chartView } from './chart.js';

const KIND_ART = {
  bar: '<path d="M5 20V11h3.5v9zM10.25 20V5h3.5v15zM15.5 20v-6H19v6z"/>',
  hbar: '<path d="M4 5h9v3.5H4zM4 10.25h15v3.5H4zM4 15.5h6V19H4z"/>',
  line: '<path d="M4 18l5-6 4 3 7-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M14 1.5v8.5h8.5A8.5 8.5 0 0 0 14 1.5z"/>',
  donut: '<path d="M12 3a9 9 0 1 0 9 9h-4.5A4.5 4.5 0 1 1 12 7.5z"/><path d="M14 1.5v6.6a4.5 4.5 0 0 1 2.4 2.4h6.1A8.5 8.5 0 0 0 14 1.5z"/>',
};
export const chartKindIcon = (kind) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${KIND_ART[kind] || KIND_ART.bar}</svg>`;

/**
 * value: 지금 차트(조각) · aspect: 차트 상자의 가로 ÷ 세로(px) · onApply(내용) · onClose()
 * 돌려주는 것: { dialog, close() }
 */
export function openChartDialog({ value, aspect = 4 / 3, onApply, onClose } = {}) {
  let c = structuredClone(cleanChart(value) || cleanChart({ labels: ['항목 1'], series: [{ name: '계열 1', values: [0] }] }));
  const preview = el('div', { class: 'fe-chart-preview' });
  preview.style.aspectRatio = String(Math.min(3, Math.max(0.5, aspect || 4 / 3)));
  const table = el('table', { class: 'fe-chart-table' });
  const note = el('p', { class: 'fe-note fe-chart-note', role: 'status', 'aria-live': 'polite' });
  const kinds = el('div', { class: 'fe-chart-kinds', role: 'group', 'aria-label': '차트 종류' });
  const title = el('input', { class: 'fe-chart-input', type: 'text', maxlength: String(CHART_LIMITS.title), value: c.title || '', placeholder: '예) 우리 반이 좋아하는 과일', 'aria-label': '차트 제목', dataset: { chartTitle: '' } });
  const unit = el('input', { class: 'fe-chart-input unit', type: 'text', maxlength: String(CHART_LIMITS.unit), value: c.unit || '', placeholder: '명 · cm · %', 'aria-label': '단위', dataset: { chartUnit: '' } });
  const vals = el('input', { type: 'checkbox', checked: c.vals !== false, dataset: { chartVals: '' } });
  const palettes = el('div', { class: 'fe-chart-palettes', role: 'radiogroup', 'aria-label': '색 묶음' });
  const paste = el('textarea', { class: 'fe-chart-paste', rows: '4', placeholder: '항목\t1모둠\t2모둠\n사과\t8\t6\n바나나\t5\t7', 'aria-label': '표 붙여넣기', dataset: { chartPaste: '' } });
  const round = () => c.kind === 'pie' || c.kind === 'donut';

  const draw = () => preview.replaceChildren(Object.assign(chartView({ ...c, title: title.value, unit: unit.value, vals: vals.checked }), {}));
  const kindButtons = () => kinds.replaceChildren(...CHART_KINDS.map(([id, name]) => el('button', {
    class: `fe-chart-kind${c.kind === id ? ' on' : ''}`, type: 'button', 'aria-pressed': String(c.kind === id), dataset: { chartKind: id },
    onClick: () => { c.kind = id; kindButtons(); grid(); draw(); },
  }, el('span', { class: 'fe-chart-kind-art', html: chartKindIcon(id) }), el('span', { text: name }))));
  const paletteButtons = () => palettes.replaceChildren(...CHART_PALETTE_NAMES.map(([id, name]) => el('button', {
    class: `fe-chart-palette${c.palette === id ? ' on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(c.palette === id), title: name, dataset: { chartPalette: id },
    onClick: () => { c.palette = id; paletteButtons(); draw(); },
  }, ...CHART_PALETTES[id].slice(0, 4).map((color) => { const i = el('i'); i.style.background = color; return i; }), el('span', { text: name }))));

  // 표: 첫 줄은 계열 이름, 그 아래 줄마다 [항목, 값…]. 칸을 고치면 바로 미리 보기에 그린다.
  const num = (text) => { const n = Number(String(text).replace(/[,\s]/g, '').replace(/%$/, '')); return text.trim() === '' ? 0 : Number.isFinite(n) ? n : null; };
  function cell(text, onInput, attrs = {}) {
    const input = el('input', { class: 'fe-chart-cell', type: 'text', value: text, ...attrs });
    input.addEventListener('input', () => { onInput(input.value, input); draw(); });
    input.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text/plain') || '';
      if (!/[\t\n]/.test(text.trim())) return;          // 칸 하나짜리 글은 그대로 붙인다
      e.preventDefault(); fromText(text);
    });
    return input;
  }
  function grid() {
    const m = c.series.length, head = el('tr', {}, el('th', { scope: 'col', text: '항목' }),
      ...c.series.map((s, k) => el('th', { scope: 'col', class: round() && k ? 'off' : '' },
        el('span', { class: 'fe-chart-series' },
          cell(s.name, (v) => { s.name = v.slice(0, CHART_LIMITS.label); }, { 'aria-label': `${k + 1}번째 계열 이름`, maxlength: String(CHART_LIMITS.label), dataset: { chartSeries: String(k) } }),
          m > 1 ? el('button', { class: 'fe-chart-x', type: 'button', title: '이 계열 빼기', 'aria-label': `${s.name} 계열 빼기`, onClick: () => { c.series.splice(k, 1); grid(); draw(); } }, '×') : null))),
      m < CHART_LIMITS.series ? el('th', {}, el('button', { class: 'fe-chart-add', type: 'button', dataset: { chartAddSeries: '' }, title: '계열(비교할 묶음) 더하기', onClick: () => { c.series.push({ name: `계열 ${m + 1}`, values: c.labels.map(() => 0) }); grid(); draw(); } }, '+ 계열')) : null);
    const rows = c.labels.map((label, i) => el('tr', {},
      el('th', { scope: 'row' }, cell(label, (v) => { c.labels[i] = v.slice(0, CHART_LIMITS.label); }, { 'aria-label': `${i + 1}번째 항목 이름`, maxlength: String(CHART_LIMITS.label), dataset: { chartLabel: String(i) } })),
      ...c.series.map((s, k) => el('td', { class: round() && k ? 'off' : '' }, cell(String(s.values[i]), (v, input) => {
        const n = num(v); input.toggleAttribute('aria-invalid', n === null); s.values[i] = n ?? 0;
        note.textContent = n === null ? '숫자만 넣어 주세요(예: 12, 3.5, -2).' : '';
      }, { inputmode: 'decimal', 'aria-label': `${label} · ${s.name} 값`, dataset: { chartValue: `${i}:${k}` } }))),
      el('td', {}, c.labels.length > 1 ? el('button', { class: 'fe-chart-x', type: 'button', title: '이 줄 빼기', 'aria-label': `${label} 줄 빼기`, onClick: () => { c.labels.splice(i, 1); c.series.forEach((s) => s.values.splice(i, 1)); grid(); draw(); } }, '×') : null)));
    const more = c.labels.length < CHART_LIMITS.labels ? el('tr', {}, el('td', { colspan: String(m + 2) }, el('button', { class: 'fe-chart-add', type: 'button', dataset: { chartAddRow: '' }, onClick: () => {
      c.labels.push(`항목 ${c.labels.length + 1}`); c.series.forEach((s) => s.values.push(0)); grid(); draw();
      table.querySelector(`[data-chart-label="${c.labels.length - 1}"]`)?.select();
    } }, '+ 항목'))) : null;
    table.replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows, more));
    note.textContent = round() && m > 1 ? '원 · 도넛은 첫 계열만 그려요.' : '';
  }
  function fromText(text) {
    const got = chartFromText(text);
    if (!got) { note.textContent = '붙여 넣은 글에서 표를 찾지 못했어요. 칸은 탭이나 쉼표로 나뉘어 있어야 해요.'; return; }
    c.labels = got.labels; c.series = got.series;
    grid(); draw();
    note.textContent = `표를 붙여 넣었어요: 항목 ${got.labels.length}개 · 계열 ${got.series.length}개${got.series.length >= CHART_LIMITS.series || got.labels.length >= CHART_LIMITS.labels ? ` (항목 ${CHART_LIMITS.labels}개 · 계열 ${CHART_LIMITS.series}개까지)` : ''}.`;
  }
  for (const input of [title, unit]) input.addEventListener('input', draw);
  vals.addEventListener('change', draw);

  const dialog = el('dialog', { class: 'fe-chart-dlg', 'aria-labelledby': 'fe-chart-dlg-title' });
  let done = false;
  const close = () => { if (done) return; done = true; try { dialog.close(); } catch { /* 이미 닫힘 */ } dialog.remove(); onClose?.(); };
  const apply = () => {
    if (table.querySelector('[aria-invalid]')) { note.textContent = '숫자가 아닌 칸이 있어요. 빨간 칸을 고쳐 주세요.'; table.querySelector('[aria-invalid]').focus(); return; }
    const out = cleanChart({ ...c, title: title.value, unit: unit.value, vals: vals.checked });
    if (!out) return;
    if (!out.title) out.title = undefined;
    if (!out.unit) out.unit = undefined;
    if (out.vals !== false) out.vals = undefined;
    onApply?.(out);
    close();
  };
  dialog.append(
    el('form', { method: 'dialog', class: 'fe-chart-form', onSubmit: (e) => { e.preventDefault(); apply(); } },
      el('header', { class: 'fe-chart-head' }, el('h2', { id: 'fe-chart-dlg-title', text: '차트 고치기' }), el('button', { class: 'fe-chart-close', type: 'button', 'aria-label': '닫기', onClick: close }, '✕')),
      el('div', { class: 'fe-chart-main' },
        el('div', { class: 'fe-chart-side' },
          kinds,
          el('label', { class: 'fe-chart-field' }, el('span', { text: '제목' }), title),
          el('div', { class: 'fe-chart-row' }, el('label', { class: 'fe-chart-field' }, el('span', { text: '단위' }), unit), el('label', { class: 'fe-chart-check' }, vals, ' 값 보이기')),
          el('div', { class: 'fe-chart-field' }, el('span', { text: '색' }), palettes),
          el('div', { class: 'fe-chart-tablewrap' }, table),
          note,
          el('details', { class: 'fe-chart-pastebox' }, el('summary', { text: '엑셀 · 구글 시트에서 붙여넣기' }),
            el('p', { class: 'fe-note', text: '표의 칸을 복사해 아래에 붙여 넣거나, 위 표의 아무 칸에 바로 붙여 넣어요. 첫 줄이 이름(1모둠 · 2모둠)이면 계열 이름이 돼요.' }),
            paste, el('button', { class: 'fe-btn', type: 'button', dataset: { chartPasteApply: '' }, onClick: () => fromText(paste.value) }, '표로 바꾸기'))),
        el('div', { class: 'fe-chart-view' }, el('span', { class: 'fe-chart-label', text: '미리 보기' }), preview)),
      el('footer', { class: 'fe-chart-foot' },
        el('button', { class: 'fe-btn', type: 'button', onClick: close }, '취소'),
        el('button', { class: 'fe-btn primary', type: 'submit', dataset: { chartApply: '' } }, '적용'))));
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  kindButtons(); paletteButtons(); grid(); draw();
  document.body.append(dialog);
  dialog.showModal();
  requestAnimationFrame(() => table.querySelector('[data-chart-label="0"]')?.focus());
  return { dialog, close };
}
