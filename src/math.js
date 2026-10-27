// 수식 조각(t:'math'): TeX 글(tex)과, 고칠 때 MathJax 로 그린 모양(m: { vb: viewBox 네 수, n: 그림 나무 })을 저장한다.
// 보는 쪽(꾸미기 판 · 발표 · 공유 재생기 · 그림/PDF/영상 내보내기)은 MathJax 없이 저장한 모양만 그린다(mathView). 그래서 어디서나 같다.
// 저장한 모양은 다른 사람이 만든 파일에서 올 수도 있으니 믿지 않는다: 쓸 수 있는 요소(g · path · rect · text)와 속성, 값의 모양을
// 정해 두고(cleanMath) 그대로 맞는 것만 남긴다. 그릴 때도 innerHTML 을 쓰지 않고 요소를 하나씩 만든다.
const NS = 'http://www.w3.org/2000/svg';
export const MATH_LIMITS = Object.freeze({ tex: 600, nodes: 4000, depth: 40, path: 40000, total: 600000, text: 200 });
const NUM = /^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;
const TRANSFORM = /^(?:\s*(?:translate|scale|matrix|rotate)\(\s*-?[\d.eE]+(?:[\s,]+-?[\d.eE]+){0,5}\s*\)\s*)+$/;
const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9.,eE\s+-]*$/;
const PAINT = /^(?:currentColor|none|transparent|#[0-9a-f]{3,8}|[a-z]{3,20})$/i;
const FONT = /^[A-Za-z0-9\uac00-\ud7a3\s,"'-]{1,80}$/;
const SIZE = /^\d+(?:\.\d+)?(?:px|em|ex|%)?$/;
const STYLE = /^(?:normal|italic|bold|oblique|[1-9]00)$/;
const PAINTS = ['fill', 'stroke'];
const ALLOWED = {
  g: ['transform', 'fill', 'stroke', 'stroke-width'],
  path: ['d', 'transform', 'fill', 'stroke', 'stroke-width'],
  rect: ['x', 'y', 'width', 'height', 'transform', 'fill', 'stroke', 'stroke-width'],
  text: ['x', 'y', 'transform', 'font-size', 'font-family', 'font-style', 'font-weight', 'fill', 'stroke', 'stroke-width'],
};
function okValue(key, v) {
  if (typeof v !== 'string' || v.length > (key === 'd' ? MATH_LIMITS.path : 200)) return false;
  if (key === 'd') return PATH.test(v);
  if (key === 'transform') return TRANSFORM.test(v);
  if (PAINTS.includes(key)) return PAINT.test(v);
  if (key === 'font-family') return FONT.test(v);
  if (key === 'font-size') return SIZE.test(v);
  if (key === 'font-style' || key === 'font-weight') return STYLE.test(v);
  return NUM.test(v);                      // x · y · width · height · stroke-width
}
/** 수식 내용 정리: { tex, m: { vb: [x, y, w, h], n: [...] } }. 모양을 쓸 수 없으면 null. */
export function cleanMath(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const tex = String(r.tex ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, MATH_LIMITS.tex);
  const m = r.m && typeof r.m === 'object' ? r.m : null;
  if (!tex || !m || !Array.isArray(m.vb) || m.vb.length !== 4 || !m.vb.every(Number.isFinite) || !(m.vb[2] > 0 && m.vb[3] > 0)) return null;
  const budget = { nodes: 0, total: 0 };
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > MATH_LIMITS.depth || ++budget.nodes > MATH_LIMITS.nodes) return null;
    const allowed = ALLOWED[node.t];
    if (!allowed) return null;
    const a = {};
    for (const key of allowed) {
      const v = node.a?.[key];
      if (v === undefined) continue;
      if (!okValue(key, v)) return null;     // 모양이 틀린 값이 하나라도 있으면 그 요소는 버린다
      a[key] = v;
      if (key === 'd') budget.total += v.length;
    }
    if (budget.total > MATH_LIMITS.total) return null;
    const out = { t: node.t };
    if (Object.keys(a).length) out.a = a;
    if (node.t === 'text') {
      const s = String(node.s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, MATH_LIMITS.text);
      if (!s) return null;
      out.s = s;
    } else if (node.t === 'g') {
      const kids = (Array.isArray(node.c) ? node.c : []).map((k) => walk(k, depth + 1)).filter(Boolean);
      if (!kids.length) return null;           // 빈 묶음은 그릴 것이 없다
      out.c = kids;
    }
    return out;
  };
  const n = (Array.isArray(m.n) ? m.n : []).map((k) => walk(k, 1)).filter(Boolean);
  if (!n.length) return null;
  return { tex, m: { vb: m.vb.map((v) => Math.round(v * 100) / 100), n } };
}
/** MathJax 가 그린 <svg> → 저장할 모양 { vb, n }(쓸 수 있는 요소 · 속성만). 브라우저에서만. */
export function mathTree(svg) {
  const vb = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const take = (el) => {
    const t = el.tagName.toLowerCase();
    if (!ALLOWED[t]) return null;
    const a = {};
    for (const key of ALLOWED[t]) if (el.hasAttribute(key)) a[key] = el.getAttribute(key);
    const out = { t, ...(Object.keys(a).length ? { a } : {}) };
    if (t === 'text') out.s = el.textContent;
    if (t === 'g') { const c = [...el.children].map(take).filter(Boolean); if (c.length) out.c = c; }
    return out;
  };
  return { vb, n: [...svg.children].map(take).filter(Boolean) };
}
/** 수식 상자의 크기: 글자 한 줄(1em)이 카드 너비의 em%(처음은 6%: 제목 크기쯤) 가 되게. 카드 비율(aspect: 가로 ÷ 세로)로 높이(%)를 맞춘다. 92% · 80% 안으로. */
export function mathBox(m, aspect = 16 / 9, em = 6) {
  const [, , w, h] = m.vb;
  let width = (w / 1000) * em, height = (h / 1000) * em * aspect;
  const fit = Math.min(1, 92 / width, 80 / height);
  width *= fit; height *= fit;
  return { w: Math.max(2, Math.round(width * 100) / 100), h: Math.max(1, Math.round(height * 100) / 100) };
}
export const mathLabel = (tex) => `수식: ${String(tex).replace(/\s+/g, ' ').slice(0, 50)}`;
/** 수식 조각의 그림(자리 · 크기는 render.js 의 placeItem). 색은 글자색(currentColor)을 따른다. */
export function mathView(item) {
  const node = document.createElement('div');
  node.className = 'fi fi-math';
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', mathLabel(item.tex || ''));
  if (item.color) node.style.color = item.color;
  const clean = cleanMath(item);
  if (!clean) { node.classList.add('broken'); return node; }
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', clean.m.vb.join(' '));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const build = (parent, list) => {
    for (const k of list) {
      const el = document.createElementNS(NS, k.t);
      for (const [key, v] of Object.entries(k.a || {})) el.setAttribute(key, v);
      if (k.t === 'text') el.textContent = k.s;
      if (k.c) build(el, k.c);
      parent.append(el);
    }
  };
  build(svg, clean.m.n);
  node.append(svg);
  return node;
}
