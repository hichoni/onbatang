// PDF 가져오기: PDF 의 쪽마다 그 쪽 그림 한 장(잠근 사진)으로 장을 만든다. 쪽의 글은 고르면 발표자 노트에 넣는다.
// PDF 는 브라우저 안에서 pdf.js(app/pdf/vendor, tools/build-pdf-import.mjs)로 열고 그린다. 서버로 보내지 않는다. pdf.js 는 처음 쓸 때만 받는다.
// 장은 한 그림에 20장(MAX_SLIDES)까지라 더 많으면 "이름 · 1", "이름 · 2" 파트로 나눈다(내 그림에서 한 칸으로 묶인다: designs.js homeEntries).
import { migrateRecord, newDesignId, MAX_SLIDES, MAX_NAME } from './designs.js';
import { newId, NOTES_LIMIT } from '../src/document.js';

export const PDF_LIMITS = Object.freeze({ fileBytes: 200 * 1024 * 1024, pages: 100, edge: 2000, bytes: 260000 });
const ASPECT = { min: 0.25, max: 4 };

/** "1-5, 8, 10-12" → [1,2,3,4,5,8,10,11,12](적은 차례 그대로, 같은 쪽은 한 번). 비우면 모든 쪽. 틀리면 Error(쉬운 말). */
export function parsePages(text, count) {
  const value = String(text ?? '').replace(/[~〜–—]/g, '-').replace(/\s+/g, '');
  if (!value) return Array.from({ length: count }, (_, i) => i + 1);
  const out = [], seen = new Set();
  for (const part of value.split(/[,，、]/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) throw new Error(`"${part}" 는 쪽 번호가 아니에요. 예) 1-5, 8`);
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < 1 || a > count || b > count) throw new Error(`이 PDF 는 ${count}쪽까지 있어요. 1부터 ${count} 사이로 적어 주세요.`);
    for (let n = a; a <= b ? n <= b : n >= b; n += a <= b ? 1 : -1) if (!seen.has(n)) { seen.add(n); out.push(n); }
  }
  if (!out.length) throw new Error('가져올 쪽을 적어 주세요.');
  return out;
}
/** pdf.js 의 글 조각들 → 노트 글(줄 바꿈은 살리고 빈 칸은 하나로). */
export function pageText(items) {
  let text = '';
  for (const it of Array.isArray(items) ? items : []) {
    if (typeof it?.str !== 'string') continue;
    text += it.str;
    if (it.hasEOL) text += '\n';
  }
  return text.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, NOTES_LIMIT);
}
const fit = (page, slide) => (page >= slide ? { w: 100, h: (100 * slide) / page } : { w: (100 * page) / slide, h: 100 });
/** 파일 이름 → 그림 이름(.pdf 빼고, 파트 번호가 붙을 자리를 남긴다). */
export function pdfName(filename, parts = 1) {
  const base = String(filename || 'PDF').replace(/\.pdf$/i, '').replace(/\s+/g, ' ').trim() || 'PDF';
  return parts > 1 ? base.slice(0, MAX_NAME - 6).trim() : base.slice(0, MAX_NAME);
}
/**
 * 그린 쪽들 → 그림 기록들. pages: [{ number, url(data 주소), width, height(쪽 크기, pt), text? }].
 * 첫 쪽의 모양을 그림의 모양으로 하고, 모양이 다른 쪽은 가운데에 맞춰 넣는다(흰 바탕).
 */
export function pdfRecords({ filename, pages, notes = true, now = Date.now(), sourceDocumentId = newId('s') }) {
  if (!Array.isArray(pages) || !pages.length) throw new Error('가져올 쪽이 없어요.');
  const first = pages[0], raw = first.width / first.height, aspect = Math.min(ASPECT.max, Math.max(ASPECT.min, raw));
  const size = aspect === raw ? { width: Math.max(1, Math.round(first.width)), height: Math.max(1, Math.round(first.height)), unit: 'pt' } : { width: Math.round(1000 * aspect), height: 1000, unit: 'pt' };
  const chunks = [];
  for (let i = 0; i < pages.length; i += MAX_SLIDES) chunks.push(pages.slice(i, i + MAX_SLIDES));
  const name = pdfName(filename, chunks.length), file = String(filename || '').slice(0, 240);
  return chunks.map((chunk, k) => migrateRecord({
    id: newDesignId(now + k), name: chunks.length > 1 ? `${name} · ${k + 1}` : name, size, originalSize: size,
    source: { kind: 'pdf', sourceDocumentId, ...(file ? { filename: file } : {}) },
    slides: chunk.map((p) => {
      const box = fit(p.width / p.height, aspect);
      return {
        id: newId('p'), bg: '#ffffff', source: { kind: 'pdf', sourceDocumentId, pageNumber: p.number },
        items: [{ id: newId('e'), t: 'image', layout: 'slide', x: 50, y: 50, w: box.w, h: box.h, rot: 0, op: 100, mask: 'none', url: p.url, lock: true, alt: `${name} ${p.number}쪽` }],
        ...(notes && p.text ? { notes: p.text } : {}),
      };
    }),
    updatedAt: now + k,
  }));
}

// ---------- 브라우저에서 PDF 열기 · 그리기 ----------
let lib = null;
async function pdfjs() {
  if (!lib) lib = import('./pdf/vendor/pdf.min.mjs').then((m) => { m.GlobalWorkerOptions.workerSrc = new URL('./pdf/vendor/pdf.worker.min.mjs', import.meta.url).href; return m; }).catch((error) => { lib = null; throw error; });
  return lib;
}
const ERRORS = { PasswordException: '암호가 걸린 PDF 는 열 수 없어요. 암호를 푼 PDF 로 다시 해 주세요.', InvalidPDFException: 'PDF 파일이 아니거나 망가진 파일이에요.' };
/** PDF 파일을 연다: { pageCount, size(첫 쪽 pt), page(n) → 그린 쪽, close() }. */
export async function openPdf(file) {
  if (!file || file.size > PDF_LIMITS.fileBytes) throw new Error(`PDF 는 ${PDF_LIMITS.fileBytes / 1024 / 1024}MB 까지 가져올 수 있어요.`);
  const m = await pdfjs(), base = new URL('./pdf/vendor/', import.meta.url).href;
  const task = m.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: `${base}cmaps/`, cMapPacked: true, wasmUrl: `${base}wasm/`, isEvalSupported: false, enableXfa: false, useSystemFonts: true });
  let doc;
  try { doc = await task.promise; }
  catch (error) { const e = new Error(ERRORS[error?.name] || 'PDF 를 열지 못했어요. 다른 PDF 로 해 보거나, PDF 로 다시 저장해 주세요.'); e.code = error?.name || 'PDF_OPEN_FAILED'; throw e; }
  const one = await doc.getPage(1), vp = one.getViewport({ scale: 1 });
  one.cleanup();
  return {
    pageCount: doc.numPages, size: { width: vp.width, height: vp.height },
    /** n 쪽을 그린다: { number, url, width, height, text } */
    async page(n, { text = true, edge = PDF_LIMITS.edge, bytes = PDF_LIMITS.bytes } = {}) {
      const page = await doc.getPage(n);
      try {
        const base = page.getViewport({ scale: 1 }), scale = edge / Math.max(base.width, base.height), viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width)); canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise;
        const url = await squeeze(canvas, bytes);
        canvas.width = canvas.height = 0;
        const words = text ? pageText((await page.getTextContent()).items) : '';
        return { number: n, url, width: base.width, height: base.height, ...(words ? { text: words } : {}) };
      } finally { page.cleanup(); }
    },
    close() { return task.destroy(); },
  };
}
const blobOf = (canvas, type, quality) => new Promise((done) => canvas.toBlob(done, type, quality));
// 그린 쪽 → data 주소. 웹피(되지 않는 브라우저는 JPEG)로 bytes 안에 들 때까지 화질을, 그다음 크기를 줄인다.
async function squeeze(canvas, bytes) {
  let source = canvas;
  for (let step = 0; step < 8; step++) {
    const quality = [0.86, 0.78, 0.7, 0.62][Math.min(step, 3)];
    if (step >= 4) {
      const next = document.createElement('canvas');
      next.width = Math.max(1, Math.round(source.width * 0.85)); next.height = Math.max(1, Math.round(source.height * 0.85));
      next.getContext('2d').drawImage(source, 0, 0, next.width, next.height);
      if (source !== canvas) source.width = source.height = 0;
      source = next;
    }
    let blob = await blobOf(source, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') blob = await blobOf(source, 'image/jpeg', quality);
    if (!blob) break;
    if (blob.size <= bytes || step === 7) return dataUrl(blob);
  }
  throw new Error('이 쪽을 그림으로 만들지 못했어요.');
}
async function dataUrl(blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < data.length; i += 8192) text += String.fromCharCode(...data.subarray(i, i + 8192));
  return `data:${blob.type};base64,${btoa(text)}`;
}
