import { el } from '../src/dom.js';
import { cleanPixelActivity, newPixelActivity } from '../src/pixel-art.js';

export function pixelArtImage(raw, cells = raw.cells) {
  const a = cleanPixelActivity({ ...raw, cells });
  const canvas = document.createElement('canvas'), unit = 48;
  canvas.width = canvas.height = a.size * unit;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('그림을 만들 수 없어요. 다시 시도해 주세요.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  a.cells.forEach((color, i) => {
    if (color < 0) return;
    ctx.fillStyle = a.palette[color];
    ctx.fillRect(i % a.size * unit, Math.floor(i / a.size) * unit, unit, unit);
  });
  return canvas.toDataURL('image/png');
}

export function mountPixelArt(root, { activity: raw, onSave, onChange } = {}) {
  const activity = cleanPixelActivity(raw);
  let cells = [...activity.cells], color = 0, undo = [], stroke = null, pointer = null, focus = 0, busy = false, destroyed = false;
  const abort = new AbortController(), signal = abort.signal;
  const status = el('p', { class: 'pixel-status', role: 'status', 'aria-live': 'polite' });
  const board = el('div', { class: 'pixel-grid', role: 'grid', 'aria-label': '픽셀아트 그리기', 'aria-rowcount': activity.size, 'aria-colcount': activity.size });
  board.style.setProperty('--pixel-size', activity.size);
  const cellNodes = cells.map((_, i) => el('button', { type: 'button', class: 'pixel-cell', role: 'gridcell', tabindex: i === 0 ? '0' : '-1', 'aria-rowindex': Math.floor(i / activity.size) + 1, 'aria-colindex': i % activity.size + 1, dataset: { pixel: i } }));
  for (let r = 0; r < activity.size; r++) board.append(el('div', { class: 'pixel-row', role: 'row' }, cellNodes.slice(r * activity.size, (r + 1) * activity.size)));
  const palette = el('div', { class: 'pixel-palette', role: 'group', 'aria-label': '그릴 색' });
  const colors = [...activity.palette, null].map((value, i) => {
    const button = el('button', { type: 'button', class: 'pixel-color', 'aria-label': value ? `${i + 1}번 색 ${value}` : '지우개', 'aria-pressed': String(i === 0), title: value || '지우개', text: value ? String(i + 1) : '지우개' });
    if (value) { button.style.backgroundColor = value; button.style.color = contrast(value); }
    button.addEventListener('click', () => { color = value ? i : -1; colors.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i))); });
    palette.append(button); return button;
  });
  const undoButton = el('button', { type: 'button', text: '되돌리기', disabled: true });
  const clearButton = el('button', { type: 'button', text: '모두 지우기' });
  const clearConfirm = el('div', { class: 'pixel-confirm', hidden: true }, el('span', { text: '그림을 모두 지울까요? 되돌리기로 복구할 수 있어요.' }));
  clearConfirm.append(el('button', { type: 'button', text: '지우기', onclick: () => { snapshot(); cells.fill(-1); clearConfirm.hidden = true; changed(); } }), el('button', { type: 'button', text: '취소', onclick: () => { clearConfirm.hidden = true; clearButton.focus(); } }));
  const save = el('button', { type: 'button', class: 'pixel-primary', text: '결과를 다음 슬라이드에 저장', disabled: typeof onSave !== 'function' });
  const body = el('section', { class: 'pixel-app', 'aria-label': activity.title },
    el('header', {}, el('span', { class: 'pixel-kicker', text: '픽셀아트 활동' }), el('h2', { text: activity.title }), el('p', { class: 'pixel-instructions', text: activity.instructions })),
    el('div', { class: 'pixel-workspace' }, board, el('aside', { class: 'pixel-tools' }, el('h3', { text: '색을 고르고 그려요' }), palette,
      el('p', { class: 'pixel-hint', text: '칸을 누르거나 끌어서 색칠해요. 키보드는 방향키로 이동하고 Space로 칠해요.' }),
      el('div', { class: 'pixel-actions' }, undoButton, clearButton), clearConfirm, save, status)));
  root.replaceChildren(body);
  function draw() {
    cellNodes.forEach((node, i) => {
      node.style.backgroundColor = cells[i] < 0 ? '#ffffff' : activity.palette[cells[i]];
      node.setAttribute('aria-label', `${Math.floor(i / activity.size) + 1}행 ${i % activity.size + 1}열, ${cells[i] < 0 ? '빈 칸' : `${cells[i] + 1}번 색 ${activity.palette[cells[i]]}`}`);
    });
    undoButton.disabled = busy || !undo.length;
  }
  function snapshot() { undo.push([...cells]); if (undo.length > 40) undo.shift(); }
  function changed() { draw(); onChange?.([...cells]); }
  function paint(index) {
    if (busy || index < 0 || index >= cells.length || cells[index] === color) return;
    if (!stroke) { snapshot(); stroke = true; }
    cells[index] = color; draw();
  }
  function end() { if (stroke) { stroke = null; onChange?.([...cells]); } pointer = null; }
  function at(event) {
    const rect = board.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return -1;
    return Math.floor(y / rect.height * activity.size) * activity.size + Math.floor(x / rect.width * activity.size);
  }
  board.addEventListener('pointerdown', event => {
    if (busy || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); pointer = event.pointerId; board.setPointerCapture(pointer); paint(at(event));
  }, { signal });
  board.addEventListener('pointermove', event => { if (event.pointerId === pointer) { event.preventDefault(); paint(at(event)); } }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) board.addEventListener(type, end, { signal });
  // The board handles pointer painting; a zero-detail click is keyboard/AT activation.
  board.addEventListener('click', event => { if (event.detail === 0 && !busy) { const index = Number(event.target.dataset.pixel); if (Number.isInteger(index)) { paint(index); end(); } } }, { signal });
  board.addEventListener('keydown', event => {
    const index = Number(event.target.dataset.pixel);
    if (!Number.isInteger(index)) return;
    let next = index;
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'ArrowRight') next = Math.min(cells.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - activity.size);
    else if (event.key === 'ArrowDown') next = Math.min(cells.length - 1, index + activity.size);
    else if (event.key === 'Home') next = Math.floor(index / activity.size) * activity.size;
    else if (event.key === 'End') next = Math.floor(index / activity.size) * activity.size + activity.size - 1;
    else return;
    event.preventDefault(); cellNodes[focus].tabIndex = -1; focus = next; cellNodes[focus].tabIndex = 0; cellNodes[focus].focus();
  }, { signal });
  // Let Escape reach the presenter, but never let drawing/navigation keys change slides.
  body.addEventListener('keydown', event => { if (event.key !== 'Escape') event.stopPropagation(); }, { signal });
  body.addEventListener('keyup', event => { if (event.key !== 'Escape') event.stopPropagation(); }, { signal });
  body.addEventListener('click', event => event.stopPropagation(), { signal });
  undoButton.addEventListener('click', () => { if (busy || !undo.length) return; end(); cells = undo.pop(); changed(); status.textContent = '마지막 그리기를 되돌렸어요.'; });
  clearButton.addEventListener('click', () => { clearConfirm.hidden = !clearConfirm.hidden; });
  save.addEventListener('click', async event => {
    // Saving can synchronously remove this app; stop before its ancestor listener
    // is disposed so the same click cannot advance the newly rendered slide.
    event.stopPropagation();
    if (busy || destroyed) return;
    end(); busy = true; status.textContent = '결과를 저장하고 있어요.';
    body.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try { await onSave([...cells]); if (!destroyed) status.textContent = '결과를 다음 슬라이드에 저장했어요.'; }
    catch (error) { if (!destroyed) status.textContent = `저장하지 못했어요. 그림은 그대로 있어요. ${error?.message || '다시 시도해 주세요.'}`; }
    finally { busy = false; if (!destroyed) { body.querySelectorAll('button').forEach(b => { b.disabled = false; }); draw(); } }
  });
  draw();
  return { getCells: () => [...cells], destroy() { end(); destroyed = true; abort.abort(); body.remove(); } };
}

function contrast(hex) {
  const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16));
  return rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 150 ? '#162c26' : '#ffffff';
}

export function createPixelArtSetup({ activity: raw, onApply, onCancel } = {}) {
  let activity = raw ? cleanPixelActivity(raw) : newPixelActivity(), busy = false;
  const title = el('input', { type: 'text', value: activity.title, maxlength: 80, required: true });
  const instructions = el('textarea', { rows: 3, maxlength: 400, value: activity.instructions });
  const size = el('select', { 'aria-label': '칸 수' }, [8, 12, 16].map(n => el('option', { value: n, text: `${n} × ${n}칸` })));
  size.value = String(activity.size);
  const status = el('p', { class: 'pixel-status', role: 'status' });
  const confirm = el('div', { class: 'pixel-confirm', hidden: true });
  const fields = activity.palette.map((color, i) => el('label', { class: 'pixel-color-field' }, `${i + 1}`, el('input', { type: 'color', value: color, 'aria-label': `${i + 1}번 색` })));
  const save = el('button', { type: 'submit', class: 'pixel-primary', text: raw ? '활동 설정 저장' : '활동 슬라이드 추가' });
  const form = el('form', { class: 'pixel-setup' }, el('h2', { text: raw ? '픽셀아트 설정' : '픽셀아트 활동 넣기' }),
    el('p', { text: '지금 슬라이드 다음에 활동을 넣어요. 발표에서 직접 그리고 결과를 다음 슬라이드에 남길 수 있어요.' }),
    el('label', {}, '활동 이름', title), el('label', {}, '활동 안내', instructions), el('label', {}, '칸 수', size), confirm,
    el('fieldset', {}, el('legend', { text: '활동에서 사용할 색' }), el('div', { class: 'pixel-setup-palette' }, fields)), status,
    el('div', { class: 'pixel-actions' }, el('button', { type: 'button', text: '취소', onclick: () => { if (!busy) onCancel?.(); } }), save));
  size.addEventListener('change', () => {
    const next = Number(size.value);
    if (next === activity.size) return;
    if (activity.cells.some(c => c !== -1)) {
      size.value = String(activity.size); confirm.hidden = false;
      confirm.replaceChildren(el('span', { text: `${next} × ${next}칸으로 바꾸면 활동의 시작 그림을 비워요. 결과 슬라이드는 그대로 남아요.` }),
        el('button', { type: 'button', text: '그림을 비우고 바꾸기', onclick: () => { activity = { ...activity, size: next, cells: Array(next ** 2).fill(-1) }; size.value = String(next); confirm.hidden = true; } }),
        el('button', { type: 'button', text: '기존 칸 유지', onclick: () => { confirm.hidden = true; } }));
    } else activity = { ...activity, size: next, cells: Array(next ** 2).fill(-1) };
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !form.reportValidity()) return;
    if (!title.value.trim()) { status.textContent = '활동 이름을 적어 주세요.'; title.focus(); return; }
    busy = true; form.querySelectorAll('input,textarea,select,button').forEach(n => { n.disabled = true; });
    try { await onApply(cleanPixelActivity({ ...activity, title: title.value.trim(), instructions: instructions.value, palette: fields.map(label => label.querySelector('input').value) })); }
    catch (error) { status.textContent = `활동을 저장하지 못했어요. ${error?.message || '다시 시도해 주세요.'}`; }
    finally { busy = false; form.querySelectorAll('input,textarea,select,button').forEach(n => { n.disabled = false; }); }
  });
  form.addEventListener('keydown', event => { if (event.key !== 'Escape') event.stopPropagation(); });
  return form;
}
