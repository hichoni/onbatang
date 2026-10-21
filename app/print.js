// PDF·인쇄용 문서를 만든다(화면을 모르는 순수한 함수: 그림 주소와 노트를 받아 HTML 글을 돌려준다).
// 쪽 나누기는 CSS @page · break-after 로 한다. 브라우저 인쇄 창의 "PDF로 저장"이 그대로 PDF 를 만든다.
export const PRINT_LAYOUTS = Object.freeze([
  { id: 'slides', name: '슬라이드 한 장씩', per: 1, hint: '가로 A4 한 쪽에 슬라이드 한 장을 크게 담아요.' },
  { id: 'notes', name: '노트와 함께', per: 1, hint: '세로 A4 위쪽에 슬라이드, 아래쪽에 발표자 노트를 담아요(발표 준비용).' },
  { id: 'h2', name: '한 쪽에 2장', per: 2, hint: '세로 A4 한 쪽에 슬라이드 두 장(학생 나눔용).' },
  { id: 'h4', name: '한 쪽에 4장', per: 4, hint: '세로 A4 한 쪽에 슬라이드 네 장.' },
  { id: 'h6', name: '한 쪽에 6장', per: 6, hint: '세로 A4 한 쪽에 슬라이드 여섯 장(복습 자료용).' },
]);
const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = (url) => (/^(blob:|data:image\/(png|jpeg);)/.test(String(url)) ? String(url) : '');

/**
 * pages: [{ url(blob: 또는 data:image), aspect, notes, number }] · layout: PRINT_LAYOUTS 의 id
 * 돌려주는 것: 인쇄용 HTML 글 한 벌(바깥 파일·스크립트 없음).
 */
export function printHtml(title, pages, layout = 'slides') {
  const kind = PRINT_LAYOUTS.find((v) => v.id === layout) || PRINT_LAYOUTS[0];
  const landscape = kind.id === 'slides';
  const cols = kind.per >= 4 ? 2 : 1, rows = Math.ceil(kind.per / cols);
  const slide = (p) => `<figure class="slide"><img src="${escape(safeUrl(p.url))}" alt="${p.number}쪽"><figcaption>${p.number}</figcaption></figure>`;
  const sheets = [];
  if (kind.id === 'notes') {
    for (const p of pages) sheets.push(`<section class="sheet notes">${slide(p)}<div class="note${p.notes ? '' : ' empty'}">${escape(p.notes || '노트 없음')}</div></section>`);
  } else {
    for (let i = 0; i < pages.length; i += kind.per) sheets.push(`<section class="sheet grid">${pages.slice(i, i + kind.per).map(slide).join('')}</section>`);
  }
  // A4: 가로 297×210mm · 세로 210×297mm. 여백 10mm 를 뺀 높이에 맞춘다.
  const height = landscape ? 188 : 275;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escape(title || '온바탕')}</title><style>
@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #1d2433; font-family: system-ui, -apple-system, "Malgun Gothic", sans-serif; }
.sheet { height: ${height}mm; break-after: page; page-break-after: always; overflow: hidden; }
.sheet:last-child { break-after: auto; page-break-after: auto; }
.grid { display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, minmax(0, 1fr)); gap: ${kind.per === 1 ? 0 : 6}mm; }
.slide { margin: 0; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5mm; }
.slide img { display: block; max-width: 100%; max-height: calc(100% - 6mm); object-fit: contain; border: .3mm solid #c9cfdc; }
.slide figcaption { font-size: 8pt; color: #697399; }
.notes { display: grid; grid-template-rows: 125mm minmax(0, 1fr); gap: 6mm; }
.note { padding: 4mm 5mm; border-top: .4mm solid #c9cfdc; font-size: 11.5pt; line-height: 1.6; white-space: pre-wrap; overflow: hidden; }
.note.empty { color: #9aa0b4; }
</style></head><body>${sheets.join('')}</body></html>`;
}
