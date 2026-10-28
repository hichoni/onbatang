// 수식 → PowerPoint 수식(OMML): MathJax 가 만든 MathML(tests/fixtures/math-mathml.json: 수식 창의 예시 · 넣기 단추 · 그 밖의 모양)을
// OMML 로 옮기고, PPTX 에는 PowerPoint 가 쓰는 모양(mc:AlternateContent → a14:m, 모르는 프로그램은 그림)으로 넣는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync } from 'fflate';
import { texMathmlToOmml, OMML_LIMITS } from '../src/omml.js';

globalThis.DOMParser ??= DOMParser;
const { createPptx, equationSize } = await import('../app/pptx.js');
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/math-mathml.json', import.meta.url), 'utf8'));
const mml = (tex) => { const f = fixtures.find((x) => x.tex === tex); assert.ok(f, tex); return f.mathml; };
const omml = (tex, options) => texMathmlToOmml(mml(tex), options, DOMParser);
const wellFormed = (xml) => new DOMParser({ onError: (level, message) => { if (level !== 'warning') throw Error(message); } })
  .parseFromString(`<r xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${xml}</r>`, 'application/xml');

test('every example and button of the math dialog becomes well-formed Office math', () => {
  assert.ok(fixtures.length >= 40);
  for (const { tex } of fixtures) {
    const out = omml(tex, { size: 4000 });
    wellFormed(out);
    assert.match(out, /^<m:oMathPara xmlns:m="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/math"><m:oMathParaPr>/, tex);
    assert.doesNotMatch(out, /\u2061|\u2062/, `${tex}: invisible operators are dropped`);
  }
});

test('structures: fraction · root · powers · sums · limits · cases · chemistry · accents', () => {
  const quad = omml('x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', { size: 4000 });
  assert.match(quad, /<m:f><m:fPr>.*<m:num>.*<m:rad><m:radPr><m:degHide m:val="1"\/>.*<m:deg\/><m:e>.*<m:sSup>.*<\/m:num><m:den>/s);
  assert.match(quad, /<m:r><a:rPr lang="en-US" sz="4000" b="0" i="1">.*?<m:t xml:space="preserve">x<\/m:t>/, 'a variable stays italic (no m:sty)');
  assert.match(quad, /<m:r><m:rPr><m:sty m:val="p"\/><\/m:rPr><a:rPr [^>]*i="0">.*?<m:t xml:space="preserve">2<\/m:t>/, 'numbers are upright');
  assert.match(omml('\\begin{cases} x+y=5 \\\\ x-y=1 \\end{cases}'), /<m:d><m:dPr><m:begChr m:val="\{"\/><m:endChr m:val=""\/>.*<m:eqArr>.*<\/m:eqArr>/s);
  const sum = omml('\\sum_{i=1}^{n} y');
  assert.match(sum, /<m:nary><m:naryPr><m:chr m:val="∑"\/><m:limLoc m:val="undOvr"\/><m:ctrlPr>.*<m:sub>.*i.*<\/m:sub><m:sup>.*n.*<\/m:sup><m:e>.*y.*<\/m:e><\/m:nary>/s);
  assert.match(omml('\\int_{a}^{b} y'), /<m:chr m:val="∫"\/><m:limLoc m:val="subSup"\/>/);
  assert.match(omml('\\iint_D f\\,dA'), /<m:chr m:val="∬"\/><m:limLoc m:val="subSup"\/><m:supHide m:val="1"\/>/);
  assert.match(omml('\\lim_{x \\to 0} y'), /<m:func><m:funcPr>.*<m:fName><m:limLow>.*lim.*<m:lim>.*→.*<\/m:lim><\/m:limLow><\/m:fName><m:e>.*y.*<\/m:e><\/m:func>/s);
  assert.match(omml('\\sin^2\\theta+\\cos^2\\theta=1'), /<m:func><m:funcPr>.*?<m:fName><m:sSup>.*?sin.*?<\/m:sSup><\/m:fName><m:e>.*?θ.*?<\/m:e><\/m:func>/s);
  assert.match(omml('\\log_2 8 = 3'), /<m:fName><m:sSub>.*log.*<\/m:sSub><\/m:fName><m:e>.*8.*<\/m:e>/s);
  // mhchem 의 H₂O: 투명한 받침 대신 앞의 H 가 아래첨자의 밑이 된다
  const water = omml('\\ce{2H2 + O2 -> 2H2O}');
  assert.match(water, /<m:sSub><m:sSubPr>.*?<\/m:sSubPr><m:e><m:r><m:rPr><m:sty m:val="p"\/><\/m:rPr>.*?<m:t xml:space="preserve">H<\/m:t><\/m:r><\/m:e><m:sub>.*?2.*?<\/m:sub><\/m:sSub>/s);
  assert.doesNotMatch(water, /<m:t xml:space="preserve">A<\/m:t>/, 'the invisible placeholder of mhchem is gone');
  assert.match(omml('\\vec{x}'), /<m:acc><m:accPr><m:chr m:val="\u20d7"\/>/);
  assert.match(omml('\\overline{AB}'), /<m:bar><m:barPr><m:pos m:val="top"\/>/);
  assert.match(omml('\\binom{n}{k}'), /<m:d>.*<m:f><m:fPr><m:type m:val="noBar"\/>/s);
  assert.match(omml('\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}'), /<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="2"\/>.*(<m:mr>.*){2}/s);
  assert.match(omml('\\cancel{x}'), /<m:borderBox><m:borderBoxPr><m:hideTop m:val="1"\/>.*<m:strikeBLTR m:val="1"\/>/s);
  assert.match(omml('\\mathbb{R}'), /<m:rPr><m:scr m:val="double-struck"\/><m:sty m:val="p"\/><\/m:rPr>/);
  assert.match(omml('\\mathbf{F}=m\\mathbf{a}'), /<m:sty m:val="b"\/><\/m:rPr><a:rPr [^>]*b="1"/);
  assert.match(omml('\\left( a+b \\right)'), /<m:d><m:dPr><m:begChr m:val="\("\/><m:endChr m:val="\)"\/>/);
});

test('size, color, transparency and Korean text', () => {
  // TeX 의 \\color 는 뒤에 오는 것을 모두 칠한다: x + 1 이 모두 빨강
  const red = omml('\\color{#e03131}{x}+1', { size: 3600, color: '#1c7ed6', alpha: 50 });
  assert.equal(red.match(/<a:srgbClr val="E03131"><a:alpha val="50000"\/><\/a:srgbClr>/g).length, 3);
  assert.doesNotMatch(red, /1C7ED6/);
  const out = omml('S=\\pi r^2', { size: 3600, color: '#1c7ed6', alpha: 50 });
  assert.match(out, /<a:srgbClr val="1C7ED6"><a:alpha val="50000"\/><\/a:srgbClr>.*?<m:t xml:space="preserve">π</s, 'the formula color');
  assert.ok(!/sz="(?!3600)/.test(out), 'every run has the asked size');
  const korean = omml('\\text{속력}=\\frac{\\text{거리}}{\\text{시간}}');
  assert.match(korean, /<a:rPr lang="ko-KR"[^>]*>.*?<a:ea typeface="맑은 고딕"\/><\/a:rPr><m:t xml:space="preserve">속력<\/m:t>/s);
  assert.equal(texMathmlToOmml(mml('\\pi'), { size: 1 }, DOMParser).match(/sz="(\d+)"/)[1], '100', 'the size is kept in the PowerPoint range');
});

test('what cannot be moved is refused (the export then uses the picture)', () => {
  const bad = (m) => assert.throws(() => texMathmlToOmml(m, {}, DOMParser));
  bad('<math xmlns="http://www.w3.org/1998/Math/MathML"><merror><mtext>Undefined control sequence</mtext></merror></math>');
  bad('<math xmlns="http://www.w3.org/1998/Math/MathML"><mmultiscripts><mi>x</mi></mmultiscripts></math>');
  bad('<html/>');
  bad('');
  let deep = '<mi>x</mi>';
  for (let i = 0; i < OMML_LIMITS.depth + 5; i++) deep = `<mrow>${deep}</mrow>`;
  bad(`<math xmlns="http://www.w3.org/1998/Math/MathML">${deep}</math>`);
  // 그릴 것 없는 수식
  bad('<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>');
});

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const renderItem = async () => ({ blob: new Blob([png], { type: 'image/png' }), bounds: { x: .2, y: .4, w: .6, h: .2 } });
const mathItem = (tex, extra = {}) => ({ id: 'emath00001', t: 'math', x: 50, y: 50, w: 60, h: 20, tex, color: '#1d2433', m: { vb: [0, -750, 3000, 1000], n: [{ t: 'path', a: { d: 'M0 0L10 10' } }] }, ...extra });
const slideXml = (bytes) => new TextDecoder().decode(unzipSync(bytes)['ppt/slides/slide1.xml']);
const size = { width: 12192000, height: 6858000, unit: 'emu' };

test('PPTX: a formula becomes a PowerPoint equation with the picture as the fallback', async () => {
  const tex = 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}';
  const asked = [];
  const out = await createPptx({ slides: [{ id: 'pmath00001', bg: '#ffffff', items: [mathItem(tex, { rot: 10 })] }], size, renderItem, mathml: async (t) => { asked.push(t); return mml(t); } });
  assert.deepEqual(asked, [tex]);
  assert.deepEqual(out.warnings, []);
  const xml = slideXml(out.bytes);
  wellFormed(xml.replace(/^<\?xml[^>]*\?>/, ''));
  assert.match(xml, /<mc:AlternateContent xmlns:mc="http:\/\/schemas\.openxmlformats\.org\/markup-compatibility\/2006"><mc:Choice xmlns:a14="http:\/\/schemas\.microsoft\.com\/office\/drawing\/2010\/main" Requires="a14"><p:sp>/);
  assert.match(xml, /<p:cNvPr id="2" name="emath00001" descr="수식: x=\\frac\{-b\\pm\\sqrt\{b\^2-4ac\}\}\{2a\}"\/><p:cNvSpPr txBox="1"\/>/);
  assert.match(xml, /<a:xfrm rot="600000"><a:off x="2438400" y="2743200"\/><a:ext cx="7315200" cy="1371600"\/><\/a:xfrm>/, 'the place, size and turn of the formula box');
  assert.match(xml, /<a:p><a:pPr algn="ctr"\/><a14:m><m:oMathPara .*<\/m:oMathPara><\/a14:m><a:endParaRPr lang="ko-KR" sz="10800" dirty="0"\/><\/a:p>/s);
  assert.match(xml, /<\/mc:Choice><mc:Fallback><p:pic><p:nvPicPr><p:cNvPr id="2" name="emath00001" descr="수식: /);
  assert.match(xml, /<a:blip r:embed="rId2"/);
  assert.equal(equationSize(mathItem(tex), { w: 7315200, h: 1371600 }), 10800, '1em = the box height for a formula 1em tall');
});

test('PPTX: without MathJax, or when a formula cannot be moved, it stays a picture and says so', async () => {
  const slides = [{ id: 'pmath00001', bg: '#ffffff', items: [mathItem('\\frac{x}{x}')] }];
  const plain = await createPptx({ slides, size, renderItem });
  assert.doesNotMatch(slideXml(plain.bytes), /a14:m|AlternateContent/);
  assert.deepEqual(plain.warnings.map((w) => w.code), ['MATH_AS_PICTURE']);
  const failed = await createPptx({ slides, size, renderItem, mathml: async () => { throw Error('offline'); } });
  assert.doesNotMatch(slideXml(failed.bytes), /a14:m/);
  assert.match(failed.warnings[0].message, /PowerPoint 수식으로 옮기지 못한 수식/);
  const broken = await createPptx({ slides, size, renderItem, mathml: async () => '<math xmlns="http://www.w3.org/1998/Math/MathML"><merror><mtext>x</mtext></merror></math>' });
  assert.equal(broken.warnings[0].code, 'MATH_AS_PICTURE');
  const image = await createPptx({ slides, size, mode: 'image', renderSlide: renderItem, mathml: async () => { throw Error('not asked'); } });
  assert.doesNotMatch(slideXml(image.bytes), /a14:m/, 'the picture PPTX stays pictures');
});
