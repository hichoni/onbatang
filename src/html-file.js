// Uploaded documents stay inert until opened in an opaque-origin sandbox.
export const HTML_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const cleanHtmlPoster = value => typeof value === 'string' && value.length <= 400000 && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
export const isHtmlFile = file => /\.html?$/i.test(file?.name || '') || file?.type?.split(';')[0].trim().toLowerCase() === 'text/html';
export function cleanHtmlFile(value) {
  if (!value || typeof value.html !== 'string' || !value.html.trim() || value.html.includes('\0')) return null;
  if (value.html.length > HTML_FILE_MAX_BYTES || new TextEncoder().encode(value.html).length > HTML_FILE_MAX_BYTES) return null;
  const filename = String(value.filename || 'HTML 자료.html').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) || 'HTML 자료.html';
  const poster=cleanHtmlPoster(value.poster);
  return { html: value.html, filename, ...(poster ? {poster} : {}) };
}
// A neutral base prevents relative image/script URLs from targeting the host application.
// The iframe sandbox (never allow-same-origin) also applies to nested frames and navigation.
// dpr: 줄여 보일 때의 실제 선명도(화면 비율 × 줄인 비율). 화면 비율로 그림 해상도를 정하는 HTML(three.js 등)이
// 보이는 것보다 몇 배 큰 그림을 만들지 않게, 문서의 스크립트보다 먼저 window.devicePixelRatio 를 그 값으로 바꿔 둔다.
export function htmlFileSource(html, {dpr} = {}) {
  const shim = Number.isFinite(dpr) && dpr > 0 ? `<script>try{window.devicePixelRatio=${Math.round(dpr * 1000) / 1000}}catch{}</script>` : '';
  return '<!doctype html><meta charset="utf-8"><base href="about:blank">' + shim + WEBKIT_CANVAS_ORDER + html;
}
// 아이폰 · 아이패드(iOS 의 모든 브라우저 = WebKit): 가속 2D canvas 는 따로 레이어가 되고(RenderHTMLCanvas::requiresLayer →
// canvasCompositingStrategy 가 CanvasPaintedToLayer), 레이어는 같은 SVG 안의 나머지 내용(옛 SVG 그리기는 레이어를 주지 않는다)보다 늘 위에 그려진다.
// 그래서 SVG foreignObject 안의 canvas 가 문서에서 그 뒤에 오는 SVG 글자 · 도형을 덮는다
// (2026-11-21 K-EDU27 발표: 사진을 그린 canvas 가 "따뜻함" 글자를 가리고, 저울 선이 카드 글자 위로 올라왔다).
// 아직 붙지 않았거나 foreignObject 안에 있는 canvas 의 2D 문맥을 willReadFrequently(가속하지 않음)로 만들면 레이어 없이 문서 순서대로 그려진다.
// 작성자가 willReadFrequently 를 정했으면 따른다. 다른 기기와 WebGL canvas 는 그대로다(WebGL 은 늘 레이어라 이 방법으로 고칠 수 없다).
const WEBKIT_CANVAS_ORDER = '<script>(()=>{try{const n=navigator;if(!(/iP(hone|od|ad)/.test(n.userAgent)||n.platform==="MacIntel"&&n.maxTouchPoints>1))return;'
  + 'const p=HTMLCanvasElement.prototype,get=p.getContext;p.getContext=function(type,options){'
  + 'if(type==="2d"&&!(options&&"willReadFrequently"in Object(options))&&(!this.isConnected||this.closest("foreignObject")))options={...options,willReadFrequently:true};'
  + 'return get.call(this,type,options)}}catch{}})()</script>';
export const HTML_FILE_SANDBOX = 'allow-scripts allow-forms allow-modals allow-downloads allow-presentation allow-pointer-lock';
