import {installHtmlPresentation} from './html-presentation.js';
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
  return '<!doctype html><meta charset="utf-8"><base href="about:blank">' + shim + PRESENTATION + html;
}
// 아이폰 · 아이패드(iOS 의 모든 브라우저 = WebKit)에서 SVG foreignObject 안의 가속 2D canvas 는 따로 레이어가 되어, 문서에서 그 뒤에 오는
// SVG 글자 · 도형보다 늘 위에 그려진다(RenderHTMLCanvas::requiresLayer → canvasCompositingStrategy 가 CanvasPaintedToLayer).
// 0.157.1 은 그런 canvas 를 모두 willReadFrequently(가속하지 않음)로 열어 순서를 맞췄지만, 아이폰에서 같은 장면이 60fps 에서 17fps 로
// 떨어졌다(2026-11-21 K-EDU27, 사용자 아이폰 측정). 그래서 온바탕은 canvas 를 건드리지 않는다. 순서가 중요한 canvas 만 작성자가
// getContext('2d', {willReadFrequently: true}) 로 열거나, 글자를 canvas 위의 다른 층(HTML)으로 올리면 된다(docs: GAI onbatang-html-import.md).
// 장면 단위로 넘기는 HTML 발표와 이어 주는 연결(src/html-presentation.js). 연결 전에는 아무것도 바꾸지 않는다.
const PRESENTATION = '<script>(' + installHtmlPresentation.toString() + ')();</script>';
export const HTML_FILE_SANDBOX = 'allow-scripts allow-forms allow-modals allow-downloads allow-presentation allow-pointer-lock';
