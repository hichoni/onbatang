// 디자인을 그림 파일(PNG · JPG)로 만든다(브라우저). 내려받거나 다른 곳(질문 공책 등)에 붙일 때 쓴다.
//
// 방법: 화면에 그릴 때와 똑같은 요소(designView)를 SVG 안에 넣어(<foreignObject>) 그림 한 장으로 읽고, canvas 에 그려 파일로 만든다.
// 그래서 줄 바꿈·글꼴·도형이 편집 화면에서 보던 그대로 나온다.
// SVG 그림 안에서는 바깥 파일을 부를 수 없으므로, 스타일·글꼴·사진을 모두 그 안에 글자(data 주소)로 넣는다.
// 최신 크롬·엣지에서 된다(사파리는 이렇게 그린 canvas 를 파일로 꺼내지 못하게 막을 수 있다. 그때는 오류를 던진다).
import { el } from './dom.js';
import { designView, itemView, paintCard } from './render.js';
import { sceneView, scenesReady } from './scene.js';
import { cleanDesign, settings, fontList, fontFamilyOf } from './model.js';
import { loadArt } from './art.js';

const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// XML 에 쓸 수 없는 글자(제어 문자, 짝을 잃은 반쪽 글자)가 하나라도 있으면 그림 전체가 읽히지 않는다. 미리 뺀다.
const xmlSafe = (s) => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');

let cssJob = null;
/** 모듈의 스타일 글(한 번만 받아 둔다). */
function moduleCss() {
  cssJob ||= fetch(new URL('./editor.css', import.meta.url)).then((res) => {
    if (!res.ok) throw new Error(`editor.css 를 받지 못했어요 (${res.status})`);
    return res.text();
  }).catch((ex) => { cssJob = null; throw ex; });
  return cssJob;
}

const fontJobs = new Map();          // 글꼴 파일 주소 → data 주소(받는 중이면 약속)
function fontData(url) {
  if (!fontJobs.has(url)) {
    fontJobs.set(url, fetch(url).then((res) => { if (!res.ok) throw new Error('font'); return res.blob(); }).then(toDataUrl)
      .catch(() => { fontJobs.delete(url); return ''; }));
  }
  return fontJobs.get(url);
}
// 디자인이 쓰는 글꼴의 @font-face 들(파일이 있는 글꼴만). 못 받은 글꼴은 기본 글꼴로 나오고, 그 이름을 missing 에 적는다.
async function fontRules(design) {
  const used = new Set(design.items.flatMap((it) => (it.t === 'text' ? [it.font] : it.t === 'link' && it.label && it.labelFont ? [it.labelFont] : [])));
  const missing = [];
  const rules = await Promise.all(fontList().filter((f) => used.has(f.id) && f.url).map(async (f) => {
    const data = await fontData(new URL(f.url, document.baseURI).href);
    if (!data) missing.push(f.name || f.id);
    return data ? `@font-face { font-family: "${fontFamilyOf(f.id)}"; src: url("${data}"); }` : '';
  }));
  return { css: rules.join('\n'), missing };
}
// 사진을 그림 안에 넣을 수 있게 data 주소로 바꾼다. 못 받은 사진은 뺀다.
async function inlineImages(card) {
  await Promise.all([...card.querySelectorAll('img')].map(async (img) => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('data:')) return;
    try {
      const res = await fetch(src, src.startsWith('blob:') ? {} : { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      img.setAttribute('src', await toDataUrl(await res.blob()));
    } catch {
      img.remove();
    }
  }));
}

// 요소(node)를 너비 W · 높이 H 의 그림으로 읽어 canvas 에 그린다. fontCss: 그 안에서 쓸 @font-face 들.
async function paintNode(node, W, H, fontCss) {
  const css = await moduleCss();
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const xhtml = xmlSafe(new XMLSerializer().serializeToString(node));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<foreignObject x="0" y="0" width="${W}" height="${H}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;margin:0;font-family:${escapeXml(family).replace(/"/g, '&quot;')};">`
    + `<style>${escapeXml(xmlSafe(`${fontCss}\n${css}`))}</style>${xhtml}</div></foreignObject></svg>`;
  const img = new Image();
  img.decoding = 'sync';
  const loaded = new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('그림으로 바꾸지 못했어요')); });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  try { await img.decode(); } catch { /* 이미 읽혔다 */ }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  return canvas;
}

// 영상 장면의 첫 모습을 그림으로 꺼낼 때의 긴 쪽(px): 내보내는 크기만큼, 다만 너무 크지 않게(원본보다 키우지는 않는다).
const sceneEdgeFor = (W, H) => Math.min(1920, Math.max(W, H));

/**
 * 디자인을 canvas 에 그린다. { canvas, width, height, missingFonts(받지 못해 기본 글꼴로 그린 글꼴의 이름들) }
 * - width: 그림의 너비(px). 높이는 비율(aspect: 가로 ÷ 세로. 안 주면 configure 의 값)에 맞춘다.
 */
export async function designToCanvas(design, { width = 1080, aspect = settings().aspect } = {}) {
  const d = cleanDesign(design);
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const W = Math.max(16, Math.min(4096, Math.round(width)));
  const H = Math.max(16, Math.round(W / ratio));
  // 영상 장면이 있으면 그 첫 모습이 바탕에 그림으로 들어간다(그림 파일에는 영상이 움직이지 않는다).
  // 영상 파일이 이 기기에 없으면 카드의 바탕색만 나온다(화면의 "영상이 없어요" 이름표는 내보내지 않는다).
  if (d.items.some((it) => it.t === 'art')) await loadArt();          // 그림 묶음의 그림은 그리기 전에 불러 둔다
  const card = designView(d, { sceneEdge: sceneEdgeFor(W, H), sceneNote: false });
  card.style.setProperty('--fe-ratio', String(ratio));
  card.style.setProperty('--fe-card-radius', '0');
  card.style.width = `${W}px`;
  card.style.height = `${H}px`;
  await scenesReady(card);
  const [fonts] = await Promise.all([fontRules(d), inlineImages(card)]);
  const canvas = await paintNode(card, W, H, fonts.css);
  return { canvas, width: W, height: H, missingFonts: fonts.missing };
}

/**
 * 디자인의 요소들을 칸(cell)마다 따로, 투명한 바탕에 그려 큰 그림 한 장(sheet)에 늘어놓는다.
 * 영상으로 만들 때 요소를 하나씩 움직이려고 쓴다(video.js). 글꼴을 한 번만 넣으므로, 요소마다 따로 그리는 것보다 훨씬 빠르다.
 * - design: 정리된 디자인(cleanDesign 을 거친 것. 요소 번호를 그대로 쓴다)
 * - cells: [{ items: [요소 번호…], bg(카드의 바탕도 그릴지), box: { x, y, w, h }(카드 위에서 잘라 낼 자리. px), at: { x, y }(sheet 위에 놓을 자리. px) }]
 *          바탕을 그리는 칸은 카드 밖으로 나간 것을 자르고, 나머지 칸은 자르지 않는다(움직이다 보면 카드 안으로 들어올 수 있다).
 * - width · height: 카드의 크기(px) · sheetWidth · sheetHeight: 큰 그림의 크기(px)
 * 돌려주는 것: { canvas, missingFonts }
 */
export async function designSheet(design, cells, { width, height, sheetWidth, sheetHeight }) {
  if (design.items.some((it) => it.t === 'art')) await loadArt();
  const root = el('div');
  root.style.cssText = `position:relative;width:${sheetWidth}px;height:${sheetHeight}px;overflow:hidden;`;
  for (const c of cells) {
    const card = paintCard(el('div', { class: 'fe-card' }, ...c.items.map((i) => itemView(design.items[i]))), design.bg);
    card.style.setProperty('--fe-ratio', String(width / height));
    card.style.setProperty('--fe-card-radius', '0');
    Object.assign(card.style, { position: 'absolute', left: `${-c.box.x}px`, top: `${-c.box.y}px`, width: `${width}px`, height: `${height}px` });
    if (!c.bg) Object.assign(card.style, { background: 'transparent', overflow: 'visible' });
    // 영상 장면의 첫 모습은 바탕과 함께 맨 아래 칸에 그린다(영상으로 만들 때에도 멈춘 그림으로 들어간다).
    else if (design.video) card.prepend(sceneView(design.video, { edge: sceneEdgeFor(width, height), note: false }));
    const cell = el('div', {}, card);
    cell.style.cssText = `position:absolute;left:${c.at.x}px;top:${c.at.y}px;width:${c.box.w}px;height:${c.box.h}px;overflow:hidden;`;
    root.append(cell);
  }
  await scenesReady(root);
  const [fonts] = await Promise.all([fontRules(design), inlineImages(root)]);
  return { canvas: await paintNode(root, sheetWidth, sheetHeight, fonts.css), missingFonts: fonts.missing };
}

/**
 * 디자인을 그림 파일로 만든다. { blob, type, ext, width, height, missingFonts }
 * - width · aspect: designToCanvas 와 같다.
 * - type: 'image/png'(기본) 또는 'image/jpeg'. quality: JPG 의 화질(0~1).
 */
export async function designToBlob(design, { width = 1080, aspect, type = 'image/png', quality = 0.9 } = {}) {
  const made = await designToCanvas(design, { width, aspect });
  const mime = type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise((resolve, reject) => {
    try { made.canvas.toBlob(resolve, mime, quality); } catch (ex) { reject(ex); }
  });
  if (!blob) throw new Error('그림 파일로 만들지 못했어요');
  return { blob, type: mime, ext: mime === 'image/jpeg' ? 'jpg' : 'png', width: made.width, height: made.height, missingFonts: made.missingFonts };
}
