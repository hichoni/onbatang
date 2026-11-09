// 글꼴 알리기(브라우저). @font-face 로 이름과 파일 주소만 알려 두면, 브라우저는 그 글꼴을 실제로 쓰는 글이
// 화면에 나올 때에만 파일을 받는다. 그래서 글꼴이 많아도 안 쓰는 것은 받지 않는다.
import { fontFamilyOf } from './model.js';

const declared = new Set();

/**
 * @font-face 에 넣을 굵기 칸. noFakeBold 인 글꼴(이미 아주 굵고 파일이 한 굵기뿐)은 이 파일이 모든 굵기(100~900)를 맡는다고 알려,
 * 글에 '굵게'(font-weight 900)가 켜져도 브라우저가 가짜 굵게로 획을 덧그리지 않게 한다(덧그리면 '를' · '틀'의 속이 메워진다).
 */
export const fontFaceWeight = (f) => (f && f.noFakeBold === true ? ' font-weight: 100 900;' : '');

/**
 * 글꼴 파일을 브라우저에 알린다. fonts: configure({ fonts }) 에 준 것 가운데 url 이 있는 것들.
 * 같은 글꼴을 두 번 알려도 한 번만 적는다. format 은 파일 확장자로 짐작한다(ttf · otf · woff · woff2).
 */
export function registerFonts(fonts) {
  const rules = [];
  for (const f of fonts || []) {
    const family = f && f.url ? fontFamilyOf(f.id) : '';
    if (!family || declared.has(family)) continue;
    declared.add(family);
    const ext = String(f.url).split(/[?#]/)[0].split('.').pop().toLowerCase();
    const format = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' }[ext];
    rules.push(`@font-face { font-family: "${family}"; src: url("${String(f.url).replace(/["\\\n]/g, '')}")${format ? ` format("${format}")` : ''};${fontFaceWeight(f)} font-display: swap; }`);
  }
  if (!rules.length) return;
  const style = document.createElement('style');
  style.dataset.onbatang = 'fonts';
  style.textContent = rules.join('\n');
  document.head.append(style);
}

/** 이 글꼴 파일을 이미 받아 두었는지(받아 둔 것만 목록에서 그 글꼴로 보여 준다). */
export function fontReady(id) {
  const family = fontFamilyOf(id);
  if (!family) return false;
  try { return document.fonts.check(`16px "${family}"`); } catch { return false; }
}
