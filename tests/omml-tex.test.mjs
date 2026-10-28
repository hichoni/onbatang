// PPT 가져오기의 수식: PowerPoint 수식(OMML, tests/fixtures/powerpoint-math-slide.xml 은 PowerPoint 가 쓰는 모양 그대로)을
// TeX 로 읽어(src/omml-tex.js) 온바탕 수식 조각으로 바꾼다. 변환기는 원본의 수식 그림을 자리에 넣어 두고(maths 목록),
// 화면 쪽(workflow 의 renderImportedMath)이 MathJax 로 그려 그 자리를 수식 조각으로 바꾼다. 긴 글 속의 수식은 한 줄 글로.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { DOMParser } from '@xmldom/xmldom';
import { zipSync, unzipSync } from 'fflate';
import { ommlTex, ommlText } from '../src/omml-tex.js';
import { convertPptx, inspectPptx, PPTX_MIME } from '../app/pptx-import/converter.js';
import { renderImportedMath } from '../app/pptx-import/workflow.js';
import { importConvertedDocument } from '../app/import-document.js';
import { crc32 } from '../app/zip.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const slideXml = await readFile(new URL('./fixtures/powerpoint-math-slide.xml', import.meta.url), 'utf8');
const A14 = 'http://schemas.microsoft.com/office/drawing/2010/main';
const fromSlide = () => Array.from(new DOMParser().parseFromString(slideXml, 'application/xml').getElementsByTagNameNS(A14, 'm'));
const math = (body) => new DOMParser().parseFromString(`<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${body}</m:oMath>`, 'application/xml').documentElement;
const r = (t, upright) => `<m:r>${upright ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : ''}<m:t>${t}</m:t></m:r>`;
const italic = (word) => [...word].map((c) => /[a-z]/.test(c) ? (c === 'h' ? String.fromCharCode(0x210e) : String.fromCodePoint(0x1d44e + c.charCodeAt(0) - 97)) : c).join('');

test('PowerPoint equations read back as TeX (math-italic letters → plain) and as one line of text', () => {
  const [quad, sum, area, pyth] = fromSlide();
  assert.equal(ommlTex(quad), 'x=\\frac{-b±\\sqrt{b^{2}-4ac}}{2a}');
  assert.equal(ommlText(quad), 'x=(−b±√(b²−4ac))/(2a)');
  assert.equal(ommlTex(sum), '\\sum_{k=1}^{n} k^{2}=\\frac{n\\left( n+1 \\right)\\left( 2n+1 \\right)}{6}');
  assert.equal(ommlTex(area), 'S=πr^{2}');
  assert.equal(ommlText(pyth), 'a²+b²=c²');
});

test('structures PowerPoint writes: cases · functions · chemistry · matrices · accents · roots · limits · words', () => {
  const tex = (body) => ommlTex(math(body));
  assert.equal(tex(`<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr><m:e>${r(italic('x+y=5'))}</m:e><m:e>${r(italic('x−y=1'))}</m:e></m:eqArr></m:e></m:d>`),
    '\\begin{cases}x+y=5 \\\\ x-y=1\\end{cases}');
  assert.equal(tex(`<m:func><m:fName>${r('sin', 1)}</m:fName><m:e>${r(String.fromCodePoint(0x1d703))}</m:e></m:func>`), '\\sin θ');
  assert.equal(tex(`${r('2', 1)}<m:sSub><m:e>${r('H', 1)}</m:e><m:sub>${r('2')}</m:sub></m:sSub>${r('O', 1)}`), '2\\mathrm{H}_{2}\\mathrm{O}', 'upright element symbols stay upright');
  assert.equal(tex(`<m:d><m:e><m:m><m:mr><m:e>${r('1')}</m:e><m:e>${r('0')}</m:e></m:mr><m:mr><m:e>${r('0')}</m:e><m:e>${r('1')}</m:e></m:mr></m:m></m:e></m:d>`), '\\begin{pmatrix}1 & 0 \\\\ 0 & 1\\end{pmatrix}');
  assert.equal(tex(`<m:acc><m:accPr><m:chr m:val="${String.fromCharCode(0x20d7)}"/></m:accPr><m:e>${r(italic('v'))}</m:e></m:acc>`), '\\vec{v}');
  assert.equal(tex(`<m:rad><m:deg>${r('3')}</m:deg><m:e>${r('8')}</m:e></m:rad>`), '\\sqrt[3]{8}');
  assert.equal(tex(`<m:func><m:fName><m:limLow><m:e>${r('lim', 1)}</m:e><m:lim>${r(italic('x→0'))}</m:lim></m:limLow></m:fName><m:e>${r(italic('f'))}</m:e></m:func>`), '\\lim_{x→0} f');
  assert.equal(tex(`<m:nary><m:naryPr><m:chr m:val="∫"/></m:naryPr><m:sub>${r('0')}</m:sub><m:sup>${r('1')}</m:sup><m:e>${r(italic('xdx'))}</m:e></m:nary>`), '\\int_{0}^{1} xdx');
  assert.equal(tex(`${r('넓이', 1)}${r('=')}${r(italic('ab'))}`), '\\text{넓이}=ab', 'Korean words become \\text');
  assert.equal(tex(`<m:r><m:rPr><m:nor/></m:rPr><m:t>if </m:t></m:r>${r(italic('x>0'))}`), '\\text{if }x>0');
  assert.equal(tex(`${r(italic('x'))}${r('∈')}${r(String.fromCharCode(0x211d))}`), 'x∈\\mathbb{R}');
  assert.throws(() => tex('<m:zzz/>'), /OMML_UNSUPPORTED/, 'an unknown element is refused, so the caller keeps the original picture');
});

// 그림(PNG) 한 장: 머리말의 크기만 쓰인다(Node 에서는 그림을 다시 그리지 않는다)
function png(width, height) {
  const chunk = (kind, data) => { const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer); view.setUint32(0, data.length); out.set(enc.encode(kind), 4); out.set(data, 8); view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out; };
  const head = new Uint8Array(13), view = new DataView(head.buffer); view.setUint32(0, width); view.setUint32(4, height); head.set([8, 0, 0, 0, 0], 8);
  const rows = new Uint8Array((width + 1) * height);
  return Uint8Array.from([...[137, 80, 78, 71, 13, 10, 26, 10], ...chunk('IHDR', head), ...chunk('IDAT', deflateSync(rows)), ...chunk('IEND', new Uint8Array())]);
}
async function mathPptx() {
  const parts = unzipSync(await readFile(new URL('../tools/fixtures/pptx/self-authored-4x3.pptx', import.meta.url)));
  const name = 'ppt/slides/slide1.xml', rels = 'ppt/slides/_rels/slide1.xml.rels';
  const boxes = slideXml.match(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/g);
  parts[name] = enc.encode(dec.decode(parts[name]).replace('</p:spTree>', boxes.join('') + '</p:spTree>'));
  const sizes = [[400, 100], [250, 100], [190, 30], [800, 90]];
  sizes.forEach(([w, h], i) => { parts[`ppt/media/math${i + 1}.png`] = png(w, h); });
  parts[rels] = enc.encode(dec.decode(parts[rels]).replace('</Relationships>', sizes.map((_, i) => `<Relationship Id="rIdM${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/math${i + 1}.png"/>`).join('') + '</Relationships>'));
  return new File([zipSync(parts)], 'math.pptx', { type: PPTX_MIME });
}

test('PPT import: an equation box comes in as its original picture with the TeX to draw; a long sentence keeps its equation as one line of text', async () => {
  const converted = await convertPptx(await mathPptx(), { selectedPages: [1] }), slide = converted.document.slides[0];
  const codes = converted.report.warnings.map((w) => w.code);
  assert.ok(codes.includes('MATH_IMPORTED') && codes.includes('MATH_AS_TEXT'), codes.join());
  assert.ok(!codes.includes('UNSUPPORTED_ELEMENT'));
  assert.equal(converted.maths.length, 3, 'the three equation boxes (one with a short label); the sentence stays text');
  const [quad, sum, area] = converted.maths;
  assert.equal(quad.tex, 'x=\\frac{-b±\\sqrt{b^{2}-4ac}}{2a}');
  assert.equal(area.tex, '\\text{넓이: } S=πr^{2}', 'a short label goes in with the equation');
  assert.equal(quad.color, '#c00000');
  assert.equal(quad.pageNumber, 1);
  assert.deepEqual([quad.ax, quad.ay, sum.ax, sum.ay, area.ax], ['c', 'c', 'c', 't', 'l'], 'display equations centre; an inline one follows the paragraph');
  assert.ok(Math.abs(quad.emH - 3200 / 100 * 12700 / 6858000 * 100) < 1e-9, 'size: 32pt of a 7.5in slide');
  for (const m of converted.maths) {
    const stand = slide.items.find((item) => item.id === m.id);
    assert.equal(stand?.t, 'image', 'until it is drawn, the original equation picture holds the place');
    assert.match(stand.url, /^data:image\/png;base64,/);
    assert.match(stand.alt, /^수식: /);
  }
  assert.equal(slide.items.find((item) => item.id === quad.id).alt, '수식: x=(−b±√(b²−4ac))/(2a)');
  const sentence = slide.items.find((item) => item.t === 'text' && item.text.includes('직각삼각형'));
  assert.match(sentence.text, /이것을 식으로 쓰면 a²\+b²=c² 이에요\.$/);
  assert.ok(!converted.report.fontUsage.find((f) => f.elementId === sentence.id).originalNames.includes('Cambria Math'), 'the equation font does not become the sentence\'s font');
  assert.deepEqual(importConvertedDocument(converted).record.slides[0].items.map((i) => i.id), slide.items.map((i) => i.id));
  // 수식이 아닌 새 요소(새 차트 등: Fallback 이 "볼 수 없어요" 글상자)는 전처럼 그 장을 고칠 수 있게 가져오지 않는다
  const parts = unzipSync(await readFile(new URL('../tools/fixtures/pptx/self-authored-4x3.pptx', import.meta.url))), name = 'ppt/slides/slide1.xml';
  parts[name] = enc.encode(dec.decode(parts[name]).replace('</p:spTree>', '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:cx1="http://schemas.microsoft.com/office/drawing/2015/9/8/chartex" Requires="cx1"><p:graphicFrame/></mc:Choice><mc:Fallback><p:sp><p:nvSpPr><p:cNvPr id="9" name="차트"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>이 차트는 현재 버전에서 사용할 수 없습니다</a:t></a:r></a:p></p:txBody></p:sp></mc:Fallback></mc:AlternateContent></p:spTree>'));
  const chart = await inspectPptx(new File([zipSync(parts)], 'chart.pptx', { type: PPTX_MIME }));
  assert.equal(chart.pages[0].canImport, false);
  assert.ok(chart.pages[0].warnings.some((w) => w.code === 'UNSUPPORTED_ELEMENT'));
});

test('drawing imported equations: each stand-in becomes an onbatang math item in its box; what cannot be drawn keeps the picture', async () => {
  const converted = await convertPptx(await mathPptx(), { selectedPages: [1] }), document = structuredClone(converted.document);
  const [quad, sum, area] = converted.maths;
  const shape = { vb: [0, -750, 4000, 1000], n: [{ t: 'path', a: { d: 'M0 0L10 10' } }] };
  const kit = { MathJax: {}, renderTex: (_, tex) => tex === sum.tex ? { error: 'no' } : { m: shape } };
  const result = await renderImportedMath(document, converted.maths, { load: async () => kit });
  assert.deepEqual(result, { done: 2, failed: 1 });
  const items = document.slides[0].items, at = (id) => items.find((item) => item.id === id);
  const drawn = at(quad.id);
  assert.equal(drawn.t, 'math');
  assert.equal(drawn.tex, quad.tex);
  assert.deepEqual(drawn.m, shape);
  assert.equal(drawn.color, '#c00000');
  const h = quad.emH, w = 4 * quad.emH / (4 / 3);
  assert.ok(Math.abs(drawn.h - h) < 0.01 && Math.abs(drawn.w - w) < 0.01, 'one em of the drawing is the original font size');
  assert.ok(Math.abs(drawn.x - quad.box.x) < 0.01 && Math.abs(drawn.y - quad.box.y) < 0.01, 'a centred display equation sits in the middle of its box');
  const left = at(area.id);
  assert.ok(Math.abs(left.x - (area.box.x - area.box.w / 2 + area.inset.l + left.w / 2)) < 0.01, 'an inline equation starts at the box\'s left inset');
  assert.equal(at(sum.id).t, 'image', 'the one that failed keeps the original picture');
  const stand = converted.document.slides[0].items.find((item) => item.id === quad.id);
  assert.deepEqual([drawn.source, drawn.assetRefs, drawn.layout], [stand.source, stand.assetRefs, stand.layout], 'the same identity as the stand-in');
  const saved = importConvertedDocument({ ...converted, document }).record.slides[0].items.find((item) => item.id === quad.id);
  assert.deepEqual([saved.t, saved.tex, saved.m.vb], ['math', quad.tex, shape.vb], 'the drawn equation is stored as it is');
  assert.deepEqual(await renderImportedMath(structuredClone(converted.document), converted.maths, { load: async () => { throw Error('offline'); } }), { done: 0, failed: 3 });
});
