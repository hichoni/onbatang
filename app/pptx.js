// Editable PresentationML export. Stored designs and source files are never changed.
// Package parts follow ISO/IEC 29500 PresentationML; ZIP creation stays dependency-free.
import {zipStore} from './zip.js';
import {cleanDesign, settings, fontList, backgroundOf, hangsPunctuation} from '../src/model.js';
import {designToBlob, designSheet} from '../src/export.js';
import {itemView, paintCard} from '../src/render.js';
import {sceneFrame} from '../src/scene.js';
import {runPieces} from '../src/runs.js';
import { linkEnds, linkControl, linkCorners, linkLabelAt, linkLabelSize } from '../src/links.js';
import { texMathmlToOmml } from '../src/omml.js';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const PPTX_MAX_SLIDES = 200;
export const PPTX_MAX_BYTES = 128 * 1024 * 1024;
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const encoder = new TextEncoder();
const nativeShapes = new Set(['rect', 'round', 'circle', 'pill', 'line']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export class PptxExportError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'PptxExportError'; this.code = code; this.details = details; }
}
const fail = (code, message, details) => { throw new PptxExportError(code, message, details); };
const abort = signal => { if (signal?.aborted) throw new DOMException('내보내기를 취소했어요.', 'AbortError'); };
async function cancellable(job, signal) {
  if (signal?.aborted) { Promise.resolve(job).catch(() => {}); abort(signal); }
  if (!signal) return job;
  let stop;
  try { return await Promise.race([job, new Promise((_, reject) => { stop = () => reject(new DOMException('내보내기를 취소했어요.', 'AbortError')); signal.addEventListener('abort', stop, {once: true}); })]); }
  finally { signal.removeEventListener('abort', stop); }
}
function xml(value) {
  const text = String(value);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)) fail('INVALID_XML_TEXT', '저장할 수 없는 문자가 있어요. 글을 확인해 주세요.');
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
const color = value => /^#[a-f0-9]{6}$/i.test(value || '') ? value.slice(1).toUpperCase() : '1D2433';
const solid = (value, opacity = 100) => `<a:solidFill><a:srgbClr val="${color(value)}">${opacity < 100 ? `<a:alpha val="${Math.round(opacity * 1000)}"/>` : ''}</a:srgbClr></a:solidFill>`;
const rels = entries => XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map(([id, type, target]) => `<Relationship Id="${xml(id)}" Type="${R}/${type}" Target="${xml(target)}"/>`).join('')}</Relationships>`;
const group = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const namespaces = `xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"`;
// 발표자 노트: 노트 쪽(세로 A4 비율)의 아래쪽 본문 칸에 글만 적는다. PowerPoint 의 노트 창에 그대로 보인다.
const NOTES_BODY = '<p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>';
const notesText = text => `<p:sp>${NOTES_BODY}<p:txBody><a:bodyPr/><a:lstStyle/>${text.split('\n').map(line => line ? `<a:p><a:r><a:rPr lang="ko-KR" dirty="0"/><a:t xml:space="preserve">${xml(line)}</a:t></a:r></a:p>` : '<a:p><a:endParaRPr lang="ko-KR"/></a:p>').join('')}</p:txBody></p:sp>`;

function dimensions(size, aspect) {
  let ratio = Number.isFinite(aspect) && aspect >= .25 && aspect <= 4 ? aspect : 16 / 9;
  if (size !== undefined) {
    if (!object(size) || !['px', 'pt', 'emu'].includes(size.unit) || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) fail('INVALID_SLIDE_SIZE', '슬라이드 크기를 확인해 주세요.');
    ratio = size.width / size.height;
    if (ratio < .25 || ratio > 4) fail('INVALID_SLIDE_SIZE', '지원하는 슬라이드 비율은 1:4부터 4:1까지예요.');
    const scale = {px: 9525, pt: 12700, emu: 1}[size.unit];
    if (size.unit !== 'px' || (size.width >= 128 && size.height >= 128)) {
      const width = Math.round(size.width * scale), height = Math.round(size.height * scale);
      if (width < 914400 || height < 914400 || width > 51206400 || height > 51206400) fail('INVALID_SLIDE_SIZE', 'PowerPoint 슬라이드의 가로와 세로는 각각 1~56인치여야 해요.');
      return {width, height, aspect: ratio};
    }
  }
  return {width: 9144000, height: Math.round(9144000 / ratio), aspect: ratio};
}
function transform(box, item = {}) {
  const rot = Math.round((item.rot || 0) * 60000);
  return `<a:xfrm${rot ? ` rot="${rot}"` : ''}${item.fx ? ' flipH="1"' : ''}${item.fy ? ' flipV="1"' : ''}><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.max(1, Math.round(box.w))}" cy="${Math.max(1, Math.round(box.h))}"/></a:xfrm>`;
}
function itemBox(item, size, textHeight) {
  const w = item.w * size.width / 100;
  const h = item.t === 'text' ? (item.h ? item.h * size.height / 100 : textHeight) : item.h * size.height / 100;
  return {x: item.x * size.width / 100 - w / 2, y: item.y * size.height / 100 - h / 2, w, h};
}
// 연결선 → PowerPoint 의 직선 연결선(straightConnector1). 굵기 · 색 · 점선 · 화살표 머리가 그대로 고칠 수 있게 들어간다.
// (두 도형에 "붙는" 연결은 하지 않는다: PowerPoint 에서 도형을 옮기면 선은 제자리에 남는다.)
// 선 위의 글 → 선의 한가운데에 놓는 작은 글상자(흰 바탕 · 선 색 굵은 글). PowerPoint 에서 그대로 고칠 수 있다.
function nativeLinkLabel(item, id, size) {
  const [cx, cy] = linkLabelAt(item, settings().aspect).map((v, k) => v * (k ? size.height : size.width) / 100);
  const emu = linkLabelSize(item) / 100 * size.width, pt = emu / 12700;
  const w = Math.round(Array.from(item.label).length * emu * 1.05 + emu), h = Math.round(emu * 1.7);
  // 모양: 흰 바탕(처음) · 선 색 바탕에 흰 글('fill') · 바탕 없이('none'). 글꼴은 글상자와 같은 규칙으로 이름을 적는다.
  const fill = item.labelStyle === 'none' ? '<a:noFill/>' : item.labelStyle === 'fill' ? solid(item.color, item.op) : solid('#ffffff', 100);
  const ink = item.labelStyle === 'fill' ? solid('#ffffff', item.op) : solid(item.color, item.op);
  const family = item.labelFont ? typeface({ font: item.labelFont }, () => {}) : '';
  const face = family ? `<a:latin typeface="${xml(family)}"/><a:ea typeface="${xml(family)}"/><a:cs typeface="${xml(family)}"/>` : '';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(`${item.id || '연결선'} 글`)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(cx - w / 2)}" y="${Math.round(cy - h / 2)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="${item.labelStyle === 'none' ? 'rect' : 'roundRect'}"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" rIns="0" tIns="0" bIns="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ko-KR" sz="${Math.max(100, Math.round(pt * 100))}" b="1" dirty="0">${ink}${face}</a:rPr><a:t>${xml(item.label)}</a:t></a:r></a:p></p:txBody></p:sp>`;
}
function nativeLink(item, id, size) {
  const toEmu = ([x, y]) => [x * size.width / 100, y * size.height / 100];
  const [[x1, y1], [x2, y2]] = linkEnds(item, settings().aspect).map(toEmu);
  // 머리 모양 → PowerPoint 의 선 끝 모양(막대는 PowerPoint 에 없어 머리 없이). 빈 동그라미는 동그라미로.
  const ENDS = { arrow: 'triangle', open: 'arrow', dot: 'oval', ring: 'oval', diamond: 'diamond' };
  const endType = (shape) => ENDS[shape || 'arrow'] || '';
  const atStart = item.head === 'both' || item.head === 'start' ? endType(item.startShape) : '', atEnd = item.head === 'end' || item.head === 'both' ? endType(item.endShape) : '';
  const head = atStart ? `<a:headEnd type="${atStart}"/>` : '', tail = atEnd ? `<a:tailEnd type="${atEnd}"/>` : '';
  const dashVal = item.dash === 'dot' ? 'sysDot' : item.dash === 'dashdot' ? 'dashDot' : item.dash ? 'dash' : '';
  const ln = `<a:ln w="${Math.max(1, Math.round(item.line / 100 * size.width))}" cap="${item.dash === true ? 'flat' : 'rnd'}">${solid(item.color, item.op)}${dashVal ? `<a:prstDash val="${dashVal}"/>` : ''}${head}${tail}</a:ln>`;
  const corners = linkCorners(item, settings().aspect);
  if (corners) {
    // 꺾인 선: 곧은 마디 셋으로 된 열린 도형(채우기 없음). 화살표 머리는 선(ln)에 붙는다.
    const [m1, m2] = corners.map(toEmu), all = [[x1, y1], m1, m2, [x2, y2]];
    const left = Math.min(...all.map((p) => p[0])), top = Math.min(...all.map((p) => p[1]));
    const w = Math.max(1, Math.round(Math.max(...all.map((p) => p[0])) - left)), h = Math.max(1, Math.round(Math.max(...all.map((p) => p[1])) - top));
    const pt = ([x, y]) => `<a:pt x="${Math.round(x - left)}" y="${Math.round(y - top)}"/>`;
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(item.id || `연결선 ${id}`)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(left)}" y="${Math.round(top)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}" fill="none"><a:moveTo>${pt(all[0])}</a:moveTo><a:lnTo>${pt(m1)}</a:lnTo><a:lnTo>${pt(m2)}</a:lnTo><a:lnTo>${pt(all[3])}</a:lnTo></a:path></a:pathLst></a:custGeom><a:noFill/>${ln.replace(/(<\/a:solidFill>(?:<a:prstDash val="[A-Za-z]+"\/>)?)/, '$1<a:round/>')}</p:spPr></p:sp>`;
  }
  const control = linkControl(item, settings().aspect);
  if (control) {
    // 곡선: 2차 베지어 하나로 된 열린 도형(채우기 없음). 화살표 머리는 선(ln)에 붙어 그대로 고칠 수 있다.
    const [qx, qy] = toEmu(control);
    const left = Math.min(x1, x2, qx), top = Math.min(y1, y2, qy);
    const w = Math.max(1, Math.round(Math.max(x1, x2, qx) - left)), h = Math.max(1, Math.round(Math.max(y1, y2, qy) - top));
    const pt = (x, y) => `<a:pt x="${Math.round(x - left)}" y="${Math.round(y - top)}"/>`;
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(item.id || `연결선 ${id}`)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(left)}" y="${Math.round(top)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}" fill="none"><a:moveTo>${pt(x1, y1)}</a:moveTo><a:quadBezTo>${pt(qx, qy)}${pt(x2, y2)}</a:quadBezTo></a:path></a:pathLst></a:custGeom><a:noFill/>${ln}</p:spPr></p:sp>`;
  }
  const flip = `${x2 < x1 ? ' flipH="1"' : ''}${y2 < y1 ? ' flipV="1"' : ''}`;
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${xml(item.id || `연결선 ${id}`)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${flip}><a:off x="${Math.round(Math.min(x1, x2))}" y="${Math.round(Math.min(y1, y2))}"/><a:ext cx="${Math.max(1, Math.round(Math.abs(x2 - x1)))}" cy="${Math.max(1, Math.round(Math.abs(y2 - y1)))}"/></a:xfrm><a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>${ln}</p:spPr></p:cxnSp>`;
}
function nativeShape(item, box, id, size) {
  const rounded = ['round', 'pill', 'line'].includes(item.shape) || item.r > 0;
  const preset = item.shape === 'circle' ? 'ellipse' : rounded ? 'roundRect' : 'rect';
  // Legacy round rectangles use 4cqw in editor.css (lines use 1cqw), capped
  // at half the short side. Resolve against this export's aspect, not global config.
  const radius = item.shape === 'pill' ? 100 : item.r ?? (item.shape === 'round' || item.shape === 'line'
    ? Math.min(100, (item.shape === 'round' ? 8 : 2) * size.width / Math.min(box.w, box.h)) : 0);
  const edge = Math.min((item.line || 0) * size.width / 100, Math.min(box.w, box.h) / 2);
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(item.id || `도형 ${id}`)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${transform(box, item)}<a:prstGeom prst="${preset}"><a:avLst>${preset === 'roundRect' ? `<a:gd name="adj" fmla="val ${Math.round(radius * 500)}"/>` : ''}</a:avLst></a:prstGeom>${item.hollow ? '<a:noFill/>' : solid(item.color, item.op)}<a:ln w="${Math.round(edge)}">${edge ? solid(item.lc || item.color, item.op) : '<a:noFill/>'}</a:ln></p:spPr></p:sp>`;
}
function typeface(item, warn) {
  if (item.typeface) return item.typeface;
  const font = fontList().find(candidate => candidate.id === item.font);
  const family = font?.exportFamily || (font?.family && !/^mc-|^gai-/.test(font.family) ? font.family : font?.name && font.id !== 'gothic' ? font.name : '맑은 고딕');
  if (font?.id !== 'gothic' && !font?.exportFamily && (!font?.family || /^mc-|^gai-/.test(font.family))) warn('FONT_NAME_INFERRED', '글꼴의 표시 이름을 사용했어요. PowerPoint에서 글꼴 이름을 확인해 주세요.', {font: family});
  return family;
}
function nativeText(item, box, id, size, warn) {
  const requestedSize = item.size * size.width / 12700;
  if (!Number.isFinite(requestedSize) || requestedSize < 100 || requestedSize > 400000) fail('UNSUPPORTED_FONT_SIZE', 'PowerPoint에서 편집할 글자 크기는 1~4000pt여야 해요. 글자 크기를 바꾸거나 그림 PPTX로 내보내 주세요.', {elementId: item.id, pointSize: requestedSize / 100});
  const family = typeface(item, warn), fontSize = Math.round(requestedSize);
  warn('FONT_NOT_EMBEDDED', '글자는 편집할 수 있으며, 받는 기기에 글꼴이 없으면 다른 글꼴로 보일 수 있어요.', {font: family});
  const styleOf = (b, i, u) => `lang="ko-KR" sz="${fontSize}" b="${b ? 1 : 0}" i="${i ? 1 : 0}"${u ? ' u="sng"' : ''}`;
  const style = styleOf(item.bold, item.italic, item.under);
  // 글 테두리(a:ln)와 그림자(a:outerShdw). 화면의 테두리는 글자 크기의 약 9%라 PowerPoint 에서도 그 굵기로 맞춘다.
  const outline = item.stroke ? `<a:ln w="${Math.round(requestedSize / 100 * 12700 * .09)}">${solid(item.stroke, item.op)}</a:ln>` : '';
  const shadow = item.shadow ? '<a:effectLst><a:outerShdw blurRad="50800" dist="25400" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr></a:outerShdw></a:effectLst>' : '';
  // 부분 서식(runs): 구간마다 굵게 · 기울임 · 밑줄 · 색이 다른 a:r 로 나눈다.
  const propsOf = (run = null) => `<a:rPr ${run ? styleOf(run.b ?? item.bold, run.i ?? item.italic, run.u ?? item.under) : style}>${outline}${solid(run?.c || item.color, item.op)}${shadow}<a:latin typeface="${xml(family)}"/><a:ea typeface="${xml(family)}"/><a:cs typeface="${xml(family)}"/></a:rPr>`;
  const properties = propsOf();
  const lines = [[]];
  for (const piece of runPieces(item.text, item.runs)) piece.text.split('\n').forEach((part, k) => { if (k) lines.push([]); if (part) lines[lines.length - 1].push({ text: part, run: piece.run }); });
  const runsXml = (pieces) => (pieces.length ? pieces : [{ text: '', run: null }]).map(({ text, run }) => `<a:r>${run ? propsOf(run) : properties}<a:t xml:space="preserve">${xml(text)}</a:t></a:r>`).join('');
  const inset = item.bgc ? Math.round(item.size * size.width / 100 * .5) : 0;
  // CSS line-height multiplies the font size. DrawingML percentages multiply
  // the font's normal line metrics instead, making otherwise identical text taller.
  // Exact points preserve the authored baseline distance without shrinking text
  // to an explicit frame whose visible overflow may be intentional in the editor.
  const lineSpacing = Math.round(requestedSize * (item.lh || 1.25));
  const paragraphs = lines.map(pieces => `<a:p><a:pPr algn="${{l: 'l', c: 'ctr', r: 'r'}[item.align] || 'ctr'}" hangingPunct="${hangsPunctuation(item) ? 1 : 0}"><a:lnSpc><a:spcPts val="${lineSpacing}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr>${runsXml(pieces)}<a:endParaRPr ${style}/></a:p>`).join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(item.id || `글상자 ${id}`)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${transform(box, item)}<a:prstGeom prst="${item.bgc ? 'roundRect' : 'rect'}"><a:avLst/></a:prstGeom>${item.bgc ? solid(item.bgc, item.op) : '<a:noFill/>'}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="${item.nowrap ? 'none' : 'square'}" lIns="${inset}" rIns="${inset}" tIns="${Math.round(inset * .44)}" bIns="${Math.round(inset * .44)}" anchor="${{top: 't', middle: 'ctr', bottom: 'b'}[item.valign] || 't'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}
function picture(box, id, relation, name, item = {}, crop = '') {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${xml(name)}"${item.alt ? ` descr="${xml(item.alt)}"` : ''}/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relation}">${item.op < 100 ? `<a:alphaModFix amt="${Math.round(item.op * 1000)}"/>` : ''}</a:blip>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform(box, item)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></p:spPr></p:pic>`;
}
// 수식 → PowerPoint 수식(고칠 수 있다). PowerPoint 가 스스로 쓰는 모양 그대로: 수식을 모르는 프로그램은 대신 그림(fallback)을 쓴다.
// 글상자는 수식 조각의 자리 · 크기 · 돌림을 그대로 쓰고, 수식은 가운데에 놓는다. 그림은 지금 보이는 모양이다(설명 글은 TeX).
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006', A14 = 'http://schemas.microsoft.com/office/drawing/2010/main';
function equation(box, id, relation, pictureBox, omml, item, name, size) {
  const descr = ` descr="${xml(`수식: ${item.tex}`.slice(0, 1000))}"`;
  const shape = `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(name)}"${descr}/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${transform(box, item)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`
    + `<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr"/><a14:m>${omml}</a14:m><a:endParaRPr lang="ko-KR" sz="${size}" dirty="0"/></a:p></p:txBody></p:sp>`;
  return `<mc:AlternateContent xmlns:mc="${MC}"><mc:Choice xmlns:a14="${A14}" Requires="a14">${shape}</mc:Choice><mc:Fallback>${picture(pictureBox, id, relation, name, {...item, alt: `수식: ${item.tex}`})}</mc:Fallback></mc:AlternateContent>`;
}
/** 수식 글자 크기(1/100 pt): 저장한 모양(1000 = 1em)이 수식 상자에 들어간 배율에서 1em 의 높이. */
export function equationSize(item, box) {
  const [, , w, h] = item.m?.vb || [];
  if (!(w > 0 && h > 0)) return 2800;
  const em = Math.min(box.w / w, box.h / h) * 1000;   // EMU
  return Math.max(100, Math.min(400000, Math.round(em / 12700 * 100)));
}
function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new PptxExportError('RASTER_FAILED', '그림을 파일로 만들지 못했어요.')), 'image/png'));
}
async function imageElement(url, signal) {
  abort(signal);
  if (typeof Image === 'undefined') fail('BROWSER_REQUIRED', '사진을 내보내려면 브라우저가 필요해요.');
  const image = new Image(); image.decoding = 'sync';
  let timer, onAbort;
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve; image.onerror = () => reject(new PptxExportError('IMAGE_UNAVAILABLE', '사진을 읽지 못했어요. 빠진 그림 없이 저장하려면 다시 확인해 주세요.'));
      onAbort = () => reject(new DOMException('내보내기를 취소했어요.', 'AbortError'));
      signal?.addEventListener('abort', onAbort, {once: true});
      timer = setTimeout(() => reject(new PptxExportError('IMAGE_TIMEOUT', '사진을 읽는 시간이 길어 내보내기를 멈췄어요.')), 45000);
      image.src = url;
    });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  abort(signal);
  if (!image.naturalWidth || !image.naturalHeight) fail('IMAGE_UNAVAILABLE', '사진 크기를 읽지 못했어요.');
  return image;
}
async function photo(item, signal) {
  const response = await fetch(item.url, {signal, method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer'});
  if (!response.ok) fail('IMAGE_UNAVAILABLE', '사진 파일을 읽지 못했어요.');
  const blob = await response.blob(); abort(signal);
  if (blob.size > PPTX_MAX_BYTES) fail('PPTX_SIZE_LIMIT', '사진 파일이 너무 커요.');
  const url = URL.createObjectURL(blob);
  try {
    const image = await imageElement(url, signal);
    if (['image/png', 'image/jpeg'].includes(blob.type)) return {blob, width: image.naturalWidth, height: image.naturalHeight};
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    if (canvas.width * canvas.height > 16777216) fail('IMAGE_SIZE_LIMIT', '사진 해상도가 너무 커요.');
    canvas.getContext('2d').drawImage(image, 0, 0);
    return {blob: await canvasBlob(canvas), width: canvas.width, height: canvas.height};
  } finally { URL.revokeObjectURL(url); }
}
async function prepareRaster(design, signal, aspect) {
  const prepared = structuredClone(design);
  for (const item of prepared.items) {
    if (item.t === 'yt') fail('UNSUPPORTED_VIDEO', '연결한 동영상은 PPTX로 내보낼 수 없어요. 그림으로 바꾼 뒤 다시 저장해 주세요.');
    if (item.t !== 'image') continue;
    const {blob} = await photo(item, signal);
    item.url = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
    });
  }
  if (prepared.video) {
    const blob = await settings().loadVideo?.(prepared.video.src);
    if (!(blob instanceof Blob) || !blob.size) fail('VIDEO_UNAVAILABLE', '영상 파일이 없어서 첫 장면을 만들 수 없어요.');
    const frame = await sceneFrame(prepared.video, {edge: Math.min(1920, Math.max(1280, Math.round(1280 / aspect)))});
    if (!frame?.url) fail('VIDEO_UNAVAILABLE', '영상의 첫 장면을 읽지 못했어요. 빠진 그림 없이 저장하려면 영상을 확인해 주세요.');
    await imageElement(frame.url, signal);
  }
  abort(signal); return prepared;
}
async function renderWhole(design, options) {
  const prepared = await prepareRaster(design, options.signal, options.aspect);
  return designToBlob(prepared, {width: 1280, aspect: options.aspect});
}
async function renderElement(design, index, options) {
  const prepared = await prepareRaster({...design, items: [design.items[index]], video: undefined}, options.signal, options.aspect);
  const width = 1280, height = Math.round(width / options.aspect);
  const rendered = await designSheet(prepared, [{items: [0], bg: false, box: {x: 0, y: 0, w: width, h: height}, at: {x: 0, y: 0}}], {width, height, sheetWidth: width, sheetHeight: height});
  abort(options.signal);
  // PowerPoint selects a picture's rectangular frame, including transparent
  // pixels. A full-slide frame would cover unrelated editable objects below it.
  // Crop the already painted result so rotation, masks, flips and antialiasing
  // stay exact, and keep only the part visible inside the slide.
  const rgba = rendered.canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!rgba[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  // Retain an entirely transparent/off-slide element as a 1px transparent
  // picture instead of dropping its identity or leaving a slide-sized hitbox.
  if (right < left) { left = 0; top = 0; right = 0; bottom = 0; }
  const canvas = document.createElement('canvas');
  canvas.width = right - left + 1; canvas.height = bottom - top + 1;
  canvas.getContext('2d').drawImage(rendered.canvas, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return {blob: await canvasBlob(canvas), missingFonts: rendered.missingFonts,
    bounds: {x: left / width, y: top / height, w: canvas.width / width, h: canvas.height / height}};
}

function rasterBox(rendered, size) {
  if (!rendered?.bounds) return {x: 0, y: 0, w: size.width, h: size.height};
  const box = rendered.bounds;
  if (!object(box) || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(box[key])) || box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || box.x + box.w > 1 + Number.EPSILON || box.y + box.h > 1 + Number.EPSILON) fail('INVALID_RASTER', '그림의 위치를 확인하지 못해서 PPTX를 저장하지 않았어요.');
  return {x: box.x * size.width, y: box.y * size.height, w: box.w * size.width, h: box.h * size.height};
}
async function textHeight(item, size, warn) {
  if (item.h) return item.h * size.height / 100;
  if (typeof document !== 'undefined' && document.body) {
    await document.fonts?.ready;
    const card = paintCard(document.createElement('div'), 'paper'); card.className = 'fe-card';
    card.style.cssText = `position:fixed;left:-20000px;top:0;width:960px;height:${960 / size.aspect}px;visibility:hidden;pointer-events:none;`;
    card.style.setProperty('--fe-ratio', String(size.aspect));
    const node = itemView({...item, rot: 0, fx: false, fy: false}); card.append(node); document.body.append(card);
    try { const height = node.getBoundingClientRect().height; if (height > 0) return height / 960 * size.width; } finally { card.remove(); }
  }
  warn('TEXT_HEIGHT_APPROXIMATE', '글상자 높이를 줄 수로 계산했어요. PowerPoint에서 줄 바꿈을 확인해 주세요.');
  return Math.max(1, item.text.split('\n').length) * item.size * size.width / 100 * (item.lh || 1.25) + (item.bgc ? item.size * size.width / 100 * .44 : 0);
}

/** Every slide is exported, or the operation rejects without a partial download.
 * renderSlide(design,{aspect,signal,pageNumber}) / renderItem(design,index,options)
 * can be injected; each must return Blob or {blob,missingFonts?} with a PNG/JPEG image.
 * renderItem may include bounds:{x,y,w,h} in 0..1 slide coordinates for a cropped image.
 */
// 주제 → PowerPoint 구역(p14:sectionLst). 구역은 모든 장을 빠짐없이 덮어야 하므로, 첫 주제 앞의 장들은 「처음」 구역이 된다.
const SECTION_URI = '{521415D9-36F7-43E2-AB2F-B90AF26B5E84}';
const P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
export function sectionList(topics) {
  const groups = [];
  topics.forEach((name, i) => { if (!groups.length || name) groups.push({ name: name || '처음', ids: [] }); groups[groups.length - 1].ids.push(256 + i); });
  if (!topics.some(Boolean)) return '';
  const guid = (n) => `{${String(n + 1).padStart(8, '0')}-0000-4000-8000-${String(n + 1).padStart(12, '0')}}`;
  return `<p:extLst><p:ext uri="${SECTION_URI}"><p14:sectionLst xmlns:p14="${P14}">${groups.map((g, n) => `<p14:section name="${xml(g.name)}" id="${guid(n)}"><p14:sldIdLst>${g.ids.map((id) => `<p14:sldId id="${id}"/>`).join('')}</p14:sldIdLst></p14:section>`).join('')}</p14:sectionLst></p:ext></p:extLst>`;
}
/**
 * mathml(tex) → MathML 글(약속): 주면 수식을 PowerPoint 에서 고칠 수 있는 수식으로 넣는다(src/omml.js). 없거나 옮기지 못하면 그림으로 넣는다.
 */
export async function createPptx({slides, aspect = 16 / 9, size, title = '온바탕', mode = 'editable', signal, onProgress, renderSlide = renderWhole, renderItem = renderElement, mathml = null} = {}) {
  abort(signal);
  if (!Array.isArray(slides) || !slides.length || slides.length > PPTX_MAX_SLIDES) fail('SLIDE_LIMIT', '슬라이드를 1~200쪽 선택해 주세요.');
  if (!['editable', 'image'].includes(mode)) fail('INVALID_MODE', '편집 가능한 PPTX 또는 그림 PPTX를 선택해 주세요.');
  if (typeof title !== 'string' || title.length > 1000) fail('INVALID_TITLE', '파일 제목을 확인해 주세요.');
  xml(title);
  const slideSize = dimensions(size, aspect), input = structuredClone(slides), warnings = [], files = [], media = [], content = [], slideIds = [];
  const topics = [];   // 장마다 그 장에서 시작하는 주제 이름(PowerPoint 의 구역)
  let byteCount = 0, noted = false;
  const add = (name, value) => { const bytes = typeof value === 'string' ? encoder.encode(value) : value; byteCount += bytes.length + name.length * 2 + 100; if (byteCount > PPTX_MAX_BYTES) fail('PPTX_SIZE_LIMIT', 'PPTX 파일이 128MB를 넘어요. 자료를 나누어 내보내 주세요.'); files.push({name, bytes}); };
  const warn = (pageNumber, elementId) => (code, message, extra = {}) => warnings.push({code, pageNumber, ...(elementId ? {elementId} : {}), message, ...extra});
  async function addImage(rendered, warning) {
    abort(signal); const blob = rendered instanceof Blob ? rendered : rendered?.blob;
    if (!(blob instanceof Blob) || !blob.size || !['image/png', 'image/jpeg'].includes(blob.type)) fail('INVALID_RASTER', '그림을 완성하지 못해서 PPTX를 저장하지 않았어요.');
    if (blob.size + byteCount > PPTX_MAX_BYTES) fail('PPTX_SIZE_LIMIT', 'PPTX 파일이 128MB를 넘어요.');
    const ext = blob.type === 'image/jpeg' ? 'jpeg' : 'png', name = `image${media.length + 1}.${ext}`;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (ext === 'png' ? bytes.length < 24 || ![137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value) : bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) fail('INVALID_RASTER', '그림 파일 형식이 잘못되어 PPTX를 저장하지 않았어요.');
    add(`ppt/media/${name}`, bytes); media.push(name);
    for (const font of rendered?.missingFonts || []) warning('FONT_UNAVAILABLE', '그림을 만들 때 글꼴을 불러오지 못했어요.', {font});
    return name;
  }
  for (let index = 0; index < input.length; index += 1) {
    abort(signal); const raw = input[index], pageNumber = index + 1;
    if (!object(raw) || !Array.isArray(raw.items)) fail('INVALID_SLIDE', '슬라이드 내용을 확인해 주세요.', {pageNumber});
    const design = cleanDesign(raw, {keepSpaces: true});
    if (design.items.length !== raw.items.length || design.items.some((item, n) => item.t !== raw.items[n].t || (item.t === 'text' && item.text !== raw.items[n].text))) fail('UNSUPPORTED_CONTENT', '정리 과정에서 달라지는 요소가 있어요. 원본을 보존하기 위해 내보내기를 멈췄어요.', {pageNumber});
    const pageWarn = warn(pageNumber), relations = [['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']], shapes = [];
    if (design.notes) relations.push([`rId${relations.length + 1}`, 'notesSlide', `../notesSlides/notesSlide${pageNumber}.xml`]);
    const full = {x: 0, y: 0, w: slideSize.width, h: slideSize.height};
    async function raster(result, name, item = {}, box = full, crop = '') {
      const mediaName = await addImage(result, warn(pageNumber, item.id));
      const relation = `rId${relations.length + 1}`; relations.push([relation, 'image', `../media/${mediaName}`]);
      shapes.push(picture(box, shapes.length + 2, relation, name, item, crop));
    }
    const options = {aspect: slideSize.aspect, signal, pageNumber};
    // 수식 하나를 PowerPoint 수식으로: TeX → MathML(mathml) → OMML. 옮기지 못하면 false(부르는 쪽이 그림으로 넣는다).
    async function equationOf(item, itemIndex, id) {
      const box = itemBox(item, slideSize), sz = equationSize(item, box);
      let omml = '';
      try { omml = texMathmlToOmml(await cancellable(Promise.resolve(mathml(item.tex)), signal), {size: sz, color: item.color, alpha: item.op ?? 100}); }
      catch (error) { if (error?.name === 'AbortError') throw error; return false; }
      const rendered = await cancellable(renderItem(design, itemIndex, options), signal);
      const mediaName = await addImage(rendered, warn(pageNumber, item.id));
      const relation = `rId${relations.length + 1}`; relations.push([relation, 'image', `../media/${mediaName}`]);
      shapes.push(equation(box, id, relation, rasterBox(rendered, slideSize), omml, item, item.id || `수식 ${id}`, sz));
      return true;
    }
    if (design.video || design.pa || design.tr || design.items.some(item => (item.an && item.an !== 'none') || item.em || item.ex || item.aw || (item.lp && item.lp !== 'none'))) pageWarn('STATIC_EXPORT', '움직임과 소리는 포함하지 않고 현재 그림을 저장해요.');
    // 웹사이트 장: PowerPoint 에는 사이트가 들어가지 않는다(표지 그림 · 주소만).
    if (design.web) pageWarn('WEB_AS_PICTURE', `웹사이트 장은 표지 그림으로 저장해요. 주소: ${design.web.url}`);
    if (mode === 'image') await raster(await cancellable(renderSlide(design, options), signal), `슬라이드 ${pageNumber}`);
    else {
      if (design.video || design.web || !/^#[a-f0-9]{6}$/i.test(backgroundOf(design.bg).bg)) {
        if (!design.video && !design.web) pageWarn('BACKGROUND_RASTERIZED', '꾸민 바탕은 모양을 보존한 그림으로 저장해요.');
        await raster(await cancellable(renderSlide({...design, items: []}, options), signal), design.video ? '영상 첫 장면' : design.web ? '웹사이트 표지' : '슬라이드 바탕');
      }
      for (let itemIndex = 0; itemIndex < design.items.length; itemIndex += 1) {
        abort(signal); const item = design.items[itemIndex], itemWarn = warn(pageNumber, item.id), id = shapes.length + 2;
        if (item.t === 'text') shapes.push(nativeText(item, itemBox(item, slideSize, await cancellable(textHeight(item, slideSize, itemWarn), signal)), id, slideSize, itemWarn));
        else if (item.t === 'shape' && nativeShapes.has(item.shape)) shapes.push(nativeShape(item, itemBox(item, slideSize), id, slideSize));
        else if (item.t === 'link') { shapes.push(nativeLink(item, id, slideSize)); if (item.label) shapes.push(nativeLinkLabel(item, shapes.length + 2, slideSize)); }
        else if (item.t === 'image' && item.mask === 'none') {
          const loaded = await photo(item, signal), box = itemBox(item, slideSize), sourceAspect = loaded.width / loaded.height, targetAspect = box.w / box.h;
          const horizontal = sourceAspect > targetAspect, crop = Math.max(0, Math.round((1 - (horizontal ? targetAspect / sourceAspect : sourceAspect / targetAspect)) * 50000));
          const c=item.crop,explicit=c?`<a:srcRect l="${Math.round(c.x*100000)}" t="${Math.round(c.y*100000)}" r="${Math.round((1-c.x-c.w)*100000)}" b="${Math.round((1-c.y-c.h)*100000)}"/>`:null;
          await raster(loaded, item.id || `사진 ${id}`, item, box, explicit??(crop ? `<a:srcRect ${horizontal ? `l="${crop}" r="${crop}"` : `t="${crop}" b="${crop}"`}/>` : ''));
        } else if (item.t === 'math' && typeof mathml === 'function' && await equationOf(item, itemIndex, id)) {
          // 고칠 수 있는 수식으로 넣었다(그림은 수식을 모르는 프로그램이 쓴다)
        } else {
          if (item.t === 'web') itemWarn('WEB_AS_PICTURE', `웹사이트 상자는 표지 그림으로 저장해요. 주소: ${item.url}`);
          else if (item.t === 'math') itemWarn('MATH_AS_PICTURE', 'PowerPoint 수식으로 옮기지 못한 수식은 보이는 그대로 그림으로 저장해요. 고치려면 온바탕에서 고쳐 다시 내려받아요.');
          else if (item.t === 'chart') itemWarn('CHART_AS_PICTURE', `차트${item.title ? ` '${item.title}'` : ''}는 보이는 그대로 그림으로 저장해요. 숫자를 고치려면 온바탕에서 고쳐 다시 내려받아요.`);
          else itemWarn('ELEMENT_RASTERIZED', '이 요소는 모양을 보존한 그림으로 저장해요.', {type: item.t, ...(item.shape ? {shape: item.shape} : {})});
          const rendered = await cancellable(renderItem(design, itemIndex, options), signal);
          await raster(rendered, item.id || `그림 ${id}`, {}, rasterBox(rendered, slideSize));
        }
      }
    }
    abort(signal);
    add(`ppt/slides/slide${pageNumber}.xml`, XML + `<p:sld ${namespaces}${design.hidden ? ' show="0"' : ''}><p:cSld><p:bg><p:bgPr>${solid(backgroundOf(design.bg).bg)}<a:effectLst/></p:bgPr></p:bg><p:spTree>${group}${shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    add(`ppt/slides/_rels/slide${pageNumber}.xml.rels`, rels(relations));
    slideIds.push(`<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`);
    topics.push(design.topic || '');
    content.push([`/ppt/slides/slide${pageNumber}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml']);
    if (design.notes) {
      add(`ppt/notesSlides/notesSlide${pageNumber}.xml`, XML + `<p:notes ${namespaces}><p:cSld><p:spTree>${group}${notesText(design.notes)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`);
      add(`ppt/notesSlides/_rels/notesSlide${pageNumber}.xml.rels`, rels([['rId1', 'notesMaster', '../notesMasters/notesMaster1.xml'], ['rId2', 'slide', `../slides/slide${pageNumber}.xml`]]));
      content.push([`/ppt/notesSlides/notesSlide${pageNumber}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml']);
      noted = true;
    }
    onProgress?.({completed: pageNumber, total: input.length, pageNumber});
  }
  const parts = [
    ['/ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'],
    ['/ppt/slideMasters/slideMaster1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml'],
    ['/ppt/slideLayouts/slideLayout1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml'],
    ['/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'],
    ['/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'],
    ['/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml'], ...content,
    ...(noted ? [['/ppt/notesMasters/notesMaster1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml'], ['/ppt/theme/theme2.xml', 'application/vnd.openxmlformats-officedocument.theme+xml']] : [])];
  const notesMasterId = `rId${input.length + 2}`;
  add('[Content_Types].xml', XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>${parts.map(([name, type]) => `<Override PartName="${name}" ContentType="${type}"/>`).join('')}</Types>`);
  add('_rels/.rels', XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${R}/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  add('docProps/core.xml', XML + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:creator>온바탕</dc:creator></cp:coreProperties>`);
  add('docProps/app.xml', XML + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>온바탕</Application><Slides>${input.length}</Slides></Properties>`);
  add('ppt/presentation.xml', XML + `<p:presentation ${namespaces}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${noted ? `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterId}"/></p:notesMasterIdLst>` : ''}<p:sldIdLst>${slideIds.join('')}</p:sldIdLst><p:sldSz cx="${slideSize.width}" cy="${slideSize.height}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/>${sectionList(topics)}</p:presentation>`);
  add('ppt/_rels/presentation.xml.rels', rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ...input.map((_, i) => [`rId${i + 2}`, 'slide', `slides/slide${i + 1}.xml`]), ...(noted ? [[notesMasterId, 'notesMaster', 'notesMasters/notesMaster1.xml']] : [])]));
  const colorMap = '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';
  add('ppt/slideMasters/slideMaster1.xml', XML + `<p:sldMaster ${namespaces}><p:cSld><p:spTree>${group}</p:spTree></p:cSld>${colorMap}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]));
  add('ppt/slideLayouts/slideLayout1.xml', XML + `<p:sldLayout ${namespaces} type="blank" preserve="1"><p:cSld name="빈 슬라이드"><p:spTree>${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
  const colors = {dk1:'000000',lt1:'FFFFFF',dk2:'1D2433',lt2:'FFFDF5',accent1:'1C7ED6',accent2:'2F9E44',accent3:'FFD43B',accent4:'E03131',accent5:'7048E8',accent6:'F76707',hlink:'0563C1',folHlink:'954F72'};
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const theme = XML + `<a:theme xmlns:a="${A}" name="온바탕"><a:themeElements><a:clrScheme name="온바탕">${Object.entries(colors).map(([key, value]) => `<a:${key}><a:srgbClr val="${value}"/></a:${key}>`).join('')}</a:clrScheme><a:fontScheme name="온바탕"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="맑은 고딕"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="맑은 고딕"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="온바탕"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${[6350,12700,19050].map(width => `<a:ln w="${width}" cap="flat" cmpd="sng" algn="ctr">${fill}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`).join('')}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  add('ppt/theme/theme1.xml', theme);
  if (noted) {
    add('ppt/theme/theme2.xml', theme);
    add('ppt/notesMasters/notesMaster1.xml', XML + `<p:notesMaster ${namespaces}><p:cSld><p:spTree>${group}<p:sp>${NOTES_BODY}<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="ko-KR"/></a:p></p:txBody></p:sp></p:spTree></p:cSld>${colorMap}</p:notesMaster>`);
    add('ppt/notesMasters/_rels/notesMaster1.xml.rels', rels([['rId1', 'theme', '../theme/theme2.xml']]));
  }
  abort(signal); const bytes = zipStore(files); abort(signal);
  if (bytes.length > PPTX_MAX_BYTES) fail('PPTX_SIZE_LIMIT', 'PPTX 파일이 128MB를 넘어요.');
  return {blob: new Blob([bytes], {type: PPTX_MIME}), bytes, mimeType: PPTX_MIME, ext: 'pptx', slideCount: input.length, warnings, size: {width: slideSize.width, height: slideSize.height, unit: 'emu'}};
}
