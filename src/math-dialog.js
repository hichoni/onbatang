// 수식 고치기 창: TeX 글 · 넣기 단추(분수 · 제곱 · 루트 …) · 예시 · 미리 보기. MathJax(src/mathjax/, 3.2.2)는 이 창을 처음 열 때 받는다.
// 적용하면 onApply({ tex, m }): m 은 MathJax 가 그린 모양을 저장할 수 있게 고른 것(math.js 의 mathTree · cleanMath).
import { el } from './dom.js';
import { cleanMath, mathTree, mathView, MATH_LIMITS } from './math.js';

let job = null;
/** MathJax 를 한 번만 받는다(TeX → SVG, 글꼴 모양을 바로 길(path)로: fontCache none). */
export function loadMathJax() {
  if (globalThis.MathJax?.tex2svg) return Promise.resolve(globalThis.MathJax);
  if (job) return job;
  job = new Promise((resolve, reject) => {
    // noundefined 를 빼서 모르는 명령(\\fracc 등)을 빨간 글로 그리지 않고 오류로 알린다.
    globalThis.MathJax = { tex: { packages: { '[+]': ['mhchem', 'cancel', 'color'], '[-]': ['noundefined'] } }, svg: { fontCache: 'none' }, startup: { typeset: false }, options: { enableMenu: false } };
    const script = document.createElement('script');
    script.src = new URL('./mathjax/tex-svg-full.js', import.meta.url).href;
    script.async = true;
    script.onload = () => Promise.resolve(globalThis.MathJax?.startup?.promise).then(() => (globalThis.MathJax?.tex2svg ? resolve(globalThis.MathJax) : reject(new Error('MATHJAX'))), reject);
    script.onerror = () => { job = null; script.remove(); reject(new Error('MATHJAX')); };
    document.head.append(script);
  });
  return job;
}
// MathJax 의 영어 오류 글 → 쉬운 말
const ERRORS = [
  [/^Missing close brace/, '닫는 } 가 빠졌어요.'],
  [/^Extra close brace or missing open brace/, '여는 { 가 빠졌거나 } 가 남아요.'],
  [/^Undefined control sequence (\\\S+)/, (m) => `모르는 명령이에요: ${m[1]} (철자를 확인해 주세요)`],
  [/^Missing argument for (\\\S+)/, (m) => `${m[1]} 뒤에 {…} 칸이 더 필요해요.`],
  [/^Double exponent/, '^ 가 겹쳤어요. {} 로 묶어 주세요(예: {x^2}^3).'],
  [/^Double subscripts/, '_ 가 겹쳤어요. {} 로 묶어 주세요.'],
  [/^Extra \\right|^Missing \\right|^Extra \\left/, '\\left 와 \\right 는 짝을 맞춰 써요.'],
  [/^Misplaced &/, '& 는 표(\\begin{cases} …)안에서만 써요.'],
];
export function mathError(message) {
  const text = String(message || '');
  for (const [rule, say] of ERRORS) { const m = rule.exec(text); if (m) return typeof say === 'function' ? say(m) : say; }
  return `수식을 읽지 못했어요${text ? ` (${text.slice(0, 80)})` : ''}.`;
}
/** TeX → { m } 또는 { error }. MathJax 가 준비된 뒤에. */
export function renderTex(MathJax, tex) {
  const box = MathJax.tex2svg(tex, { display: true }), svg = box.querySelector('svg');
  const bad = svg?.querySelector('[data-mjx-error]');
  if (!svg || bad) return { error: mathError(bad?.getAttribute('title') || bad?.textContent) };
  const clean = cleanMath({ tex, m: mathTree(svg) });
  return clean ? { m: clean.m } : { error: '이 수식은 너무 크거나 그릴 수 없는 모양이 있어요.' };
}
// 넣기 단추: [보이는 글, 넣을 글, 커서를 둘 자리(넣을 글 안의 번호 · 없으면 끝), 설명]
export const MATH_KEYS = Object.freeze([
  ['a/b', '\\frac{}{}', 6, '분수'], ['x²', '^{}', 2, '제곱 · 위첨자'], ['x₁', '_{}', 2, '아래첨자'], ['√', '\\sqrt{}', 6, '루트'], ['ⁿ√', '\\sqrt[n]{}', 9, 'n제곱근'],
  ['×', '\\times ', null, '곱하기'], ['÷', '\\div ', null, '나누기'], ['±', '\\pm ', null, '더하기 빼기'], ['≠', '\\neq ', null, '같지 않다'], ['≤', '\\le ', null, '작거나 같다'], ['≥', '\\ge ', null, '크거나 같다'], ['≈', '\\approx ', null, '거의 같다'],
  ['π', '\\pi ', null, '원주율'], ['θ', '\\theta ', null, '세타'], ['α', '\\alpha ', null, '알파'], ['∞', '\\infty ', null, '무한대'], ['°', '^\\circ ', null, '도(각도 · 온도)'], ['∠', '\\angle ', null, '각'],
  ['Σ', '\\sum_{i=1}^{n} ', null, '합'], ['∫', '\\int_{a}^{b} ', null, '적분'], ['lim', '\\lim_{x \\to 0} ', null, '극한'], ['( )', '\\left(  \\right)', 7, '크기가 맞는 괄호'], ['→', '\\rightarrow ', null, '화살표'], ['v⃗', '\\vec{}', 5, '벡터'],
  ['가', '\\text{}', 6, '한글 · 낱말 쓰기'], ['H₂O', '\\ce{}', 4, '화학식 (예: \\ce{H2O})'],
]);
export const MATH_EXAMPLES = Object.freeze([
  ['근의 공식', 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}'], ['피타고라스 정리', 'a^2+b^2=c^2'], ['원의 넓이', 'S=\\pi r^2'],
  ['속력', '\\text{속력}=\\frac{\\text{거리}}{\\text{시간}}'], ['분수의 덧셈', '\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}'], ['연립방정식', '\\begin{cases} x+y=5 \\\\ x-y=1 \\end{cases}'],
  ['물이 생기는 반응', '\\ce{2H2 + O2 -> 2H2O}'], ['광합성', '\\ce{6CO2 + 6H2O -> C6H12O6 + 6O2}'],
]);

/** tex: 지금 수식(없으면 빈 칸) · onApply({ tex, m }) · onClose() → { dialog, close() } */
export function openMathDialog({ tex = '', onApply, onClose } = {}) {
  const input = el('textarea', { class: 'fe-math-input', rows: '3', maxlength: String(MATH_LIMITS.tex), spellcheck: 'false', autocomplete: 'off', placeholder: '예) x^2+2x+1=0   ·   \\frac{1}{2}   ·   \\ce{H2O}', 'aria-label': '수식(TeX)', dataset: { mathTex: '' } });
  input.value = tex;
  const preview = el('div', { class: 'fe-math-preview', 'aria-live': 'polite' });
  const status = el('p', { class: 'fe-note fe-math-status', role: 'status' });
  const apply = el('button', { class: 'fe-btn primary', type: 'submit', disabled: true, dataset: { mathApply: '' } }, '적용');
  let MathJax = null, last = null, timer = 0;
  const draw = () => {
    clearTimeout(timer); timer = 0;
    const value = input.value.trim();
    last = null; apply.disabled = true;
    if (!MathJax) return;
    if (!value) { preview.replaceChildren(el('span', { class: 'fe-math-empty', text: '수식을 적으면 여기에 보여요.' })); status.textContent = ''; return; }
    const got = renderTex(MathJax, value);
    if (got.error) { status.textContent = got.error; status.classList.add('bad'); preview.classList.add('stale'); return; }
    status.textContent = ''; status.classList.remove('bad'); preview.classList.remove('stale');
    last = { tex: value, m: got.m };
    preview.replaceChildren(mathView(last));
    apply.disabled = false;
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 160); });
  // 넣기: 고른 곳(또는 커서 자리)에 넣고, 빈 {} 안으로 커서를 옮긴다. 고른 글이 있으면 첫 {} 안에 넣는다(예: x 를 고르고 √ → \sqrt{x}).
  const insert = (text, caret) => {
    const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s, picked = input.value.slice(s, e);
    let piece = text, at = caret ?? text.length;
    if (picked && caret !== null) { piece = text.slice(0, caret) + picked + text.slice(caret); at = caret + picked.length + (text.indexOf('}{', caret) === caret ? 2 : 0); }
    input.setRangeText(piece, s, e, 'end');
    input.focus(); input.setSelectionRange(s + at, s + at);
    draw();
  };
  const keys = el('div', { class: 'fe-math-keys', role: 'group', 'aria-label': '넣기' }, ...MATH_KEYS.map(([face, text, caret, name]) => el('button', {
    class: 'fe-math-key', type: 'button', title: `${name}: ${text.trim()}`, 'aria-label': name, dataset: { mathKey: text.trim() }, onClick: () => insert(text, caret),
  }, face)));
  const examples = el('div', { class: 'fe-math-examples', role: 'group', 'aria-label': '예시' }, ...MATH_EXAMPLES.map(([name, text]) => el('button', {
    class: 'fe-math-example', type: 'button', dataset: { mathExample: name }, title: text, onClick: () => { input.value = text; input.focus(); draw(); },
  }, name)));
  const dialog = el('dialog', { class: 'fe-math-dlg', 'aria-labelledby': 'fe-math-dlg-title' });
  let done = false;
  const close = () => { if (done) return; done = true; clearTimeout(timer); try { dialog.close(); } catch { /* 이미 닫힘 */ } dialog.remove(); onClose?.(); };
  dialog.append(el('form', { method: 'dialog', class: 'fe-math-form', onSubmit: (e) => { e.preventDefault(); draw(); if (!last) { input.focus(); return; } onApply?.(last); close(); } },
    el('header', { class: 'fe-chart-head' }, el('h2', { id: 'fe-math-dlg-title', text: '수식' }), el('button', { class: 'fe-chart-close', type: 'button', 'aria-label': '닫기', onClick: close }, '✕')),
    el('div', { class: 'fe-math-main' },
      preview,
      el('label', { class: 'fe-chart-field' }, el('span', { text: '수식(TeX)' }), input),
      status,
      keys,
      el('div', { class: 'fe-chart-field' }, el('span', { text: '예시' }), examples),
      el('p', { class: 'fe-note', text: '한글은 \\text{속력} 처럼, 화학식은 \\ce{H2O} 처럼 써요. 단추를 누르면 커서 자리에 들어가요. 수식 모양은 저장해 두어서 발표 · 공유 링크 · 그림에서도 똑같이 보여요.' })),
    el('footer', { class: 'fe-chart-foot' }, el('button', { class: 'fe-btn', type: 'button', onClick: close }, '취소'), apply)));
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dialog);
  dialog.showModal();
  preview.replaceChildren(el('span', { class: 'fe-math-empty', text: '수식 도구를 준비하고 있어요…' }));
  loadMathJax().then((mj) => { if (done) return; MathJax = mj; draw(); }, () => {
    if (done) return;
    preview.replaceChildren(el('span', { class: 'fe-math-empty', text: '수식 도구를 받지 못했어요. 연결을 확인하고 창을 다시 열어 주세요.' }));
  });
  requestAnimationFrame(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
  return { dialog, close };
}
