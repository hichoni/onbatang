import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanAlt, ALT_LIMIT, slideHidden} from '../src/document.js';
import {cleanDesign, LINE_SPACINGS, styleOf} from '../src/model.js';
import {textShadow} from '../src/render.js';
import {migrateRecord, slideExtra} from '../app/designs.js';
import {createPptx, PPTX_MIME} from '../app/pptx.js';
import {convertPptx} from '../app/pptx-import/converter.js';
import {PRINT_LAYOUTS, printHtml} from '../app/print.js';
import {findText, replaceText} from '../app/find-replace.js';
import {crc32} from '../app/zip.js';
import {unzipSync} from 'fflate';

const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+jHnQAAAAASUVORK5CYII=', 'base64');
for (let offset=8;offset<pngBytes.length;){const length=pngBytes.readUInt32BE(offset);pngBytes.writeUInt32BE(crc32(pngBytes.subarray(offset+4,offset+8+length)),offset+8+length);offset+=length+12;}
const pngUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;
const text = (id, value, patch = {}) => ({id, t: 'text', text: value, x: 50, y: 40, w: 80, h: 20, size: 6, color: '#123456', align: 'c', ...patch});
const record = slides => ({id: 'd1700000000000aa', name: '시험', ratio: '16:9', slides, updatedAt: 1});
const xmlOf = files => name => new TextDecoder().decode(files[name]);
async function withImage(run) {
  const previous = globalThis.Image;
  globalThis.Image = class { naturalWidth = 20; naturalHeight = 10; set src(value) { queueMicrotask(() => this.onload()); } };
  try { return await run(); } finally { if (previous === undefined) delete globalThis.Image; else globalThis.Image = previous; }
}

test('photo alt text is one bounded line and survives clean/save/reopen', () => {
  assert.equal(cleanAlt('  강아지가\n공을\t물고   있다\u0007 '), '강아지가 공을 물고 있다');
  assert.equal(cleanAlt(7), '');
  assert.equal(Array.from(cleanAlt('🐶'.repeat(ALT_LIMIT + 9))).length, ALT_LIMIT);
  const page = {id: 'ppage00001', bg: '#ffffff', items: [{id: 'ephoto0001', t: 'image', url: pngUrl, x: 50, y: 50, w: 30, h: 30, alt: ' 바다 사진 '}]};
  assert.equal(cleanDesign(page).items[0].alt, '바다 사진');
  assert.equal(Object.hasOwn(cleanDesign({...page, items: [{...page.items[0], alt: '   '}]}).items[0], 'alt'), false);
  const reopened = migrateRecord(JSON.parse(JSON.stringify(record([cleanDesign(page)]))));
  assert.equal(reopened.slides[0].items[0].alt, '바다 사진');
});

test('hidden slides are kept (only a true flag), and every place that rebuilds a slide carries it', () => {
  assert.deepEqual(slideHidden({hidden: true}), {hidden: true});
  assert.deepEqual(slideHidden({hidden: 'yes'}), {});
  const page = {id: 'ppage00001', bg: '#ffffff', hidden: true, items: [text('etext00001', '정답')]};
  assert.equal(cleanDesign(page).hidden, true);
  assert.equal(Object.hasOwn(cleanDesign({...page, hidden: false}), 'hidden'), false);
  assert.equal(slideExtra(page).hidden, true);
  const reopened = migrateRecord(JSON.parse(JSON.stringify(record([page, {id: 'ppage00002', bg: '#ffffff', items: []}]))));
  assert.equal(reopened.slides[0].hidden, true);
  assert.equal(Object.hasOwn(reopened.slides[1], 'hidden'), false);
});

test('text line spacing, outline and shadow are bounded style values that style copy moves', () => {
  const item = cleanDesign({id: 'ppage00001', bg: '#fff', items: [text('etext00001', '글', {lh: 9, stroke: 'not-a-color', shadow: 'yes'})]}).items[0];
  assert.equal(item.lh, 4);
  assert.match(item.stroke, /^#[0-9a-f]{6}$/i);
  assert.equal(Object.hasOwn(item, 'shadow'), false);
  const plain = cleanDesign({id: 'ppage00001', bg: '#fff', items: [text('etext00001', '글')]}).items[0];
  for (const key of ['lh', 'stroke', 'shadow']) assert.equal(Object.hasOwn(plain, key), false, key);
  assert.deepEqual(LINE_SPACINGS, [1, 1.15, 1.3, 1.5, 2]);
  assert.deepEqual(Object.keys(styleOf({...item, shadow: true}).values).filter(k => ['lh', 'stroke', 'shadow'].includes(k)).sort(), ['lh', 'shadow', 'stroke']);
  assert.equal(textShadow({}), '');
  const ring = textShadow({stroke: '#ffffff'});
  assert.equal(ring.split('),').length > 1 || ring.split(', ').length >= 8, true);
  assert.match(ring, /#ffffff/);
  assert.match(textShadow({shadow: true}), /rgba\(0, ?0, ?0, ?\.5\)/);
});

test('editable PPTX writes alt text, outline, shadow, line spacing and hidden slides, and import reads hidden slides back', async () => {
  await withImage(async () => {
    const slides = [
      {id: 'ppage00001', bg: '#ffffff', items: [text('etext00001', '테두리 글', {stroke: '#1d2433', shadow: true, lh: 1.5}), {id: 'ephoto0001', t: 'image', url: pngUrl, x: 50, y: 70, w: 20, h: 20, mask: 'none', alt: '바다 & <파도>'}]},
      {id: 'ppage00002', bg: '#ffffff', hidden: true, items: [text('etext00002', '정답 장')]},
    ];
    const result = await createPptx({slides, size: {width: 12192000, height: 6858000, unit: 'emu'}, title: '빠른 개선'});
    const files = unzipSync(result.bytes), xml = xmlOf(files);
    const one = xml('ppt/slides/slide1.xml'), two = xml('ppt/slides/slide2.xml');
    assert.match(one, /descr="바다 &amp; &lt;파도&gt;"/);
    assert.match(one, /<a:ln w="\d+"><a:solidFill><a:srgbClr val="1D2433"/i);
    assert.match(one, /<a:effectLst><a:outerShdw /);
    assert.match(one, /<a:lnSpc><a:spcPts val="8640"\/><\/a:lnSpc>/); // 57.6pt 글자 × 1.5
    assert.match(two, /<p:sld [^>]*show="0"/);
    assert.doesNotMatch(one, /show="0"/);
    // 그림 가져오기는 브라우저의 그림판(OffscreenCanvas)이 있어야 해서 그림 설명 되읽기는 브라우저 시험에서 본다.
    const textOnly = await createPptx({slides: slides.map(s => ({...s, items: s.items.filter(v => v.t === 'text')})), size: {width: 12192000, height: 6858000, unit: 'emu'}});
    const imported = await convertPptx(new File([textOnly.bytes], 'quick.pptx', {type: PPTX_MIME}));
    const [first, second] = imported.document.slides;
    assert.equal(Object.hasOwn(first, 'hidden'), false);
    assert.equal(second.hidden, true);
    const back = migrateRecord(imported.document);
    assert.equal(back.slides[1].hidden, true);
  });
});

test('print layouts: one self-contained page set, landscape only for single slides, notes escaped, unsafe image URLs dropped', () => {
  assert.deepEqual(PRINT_LAYOUTS.map(v => v.id), ['slides', 'notes', 'h2', 'h4', 'h6']);
  const pages = Array.from({length: 7}, (_, i) => ({url: i === 6 ? 'javascript:alert(1)' : `blob:https://x/${i}`, aspect: 16 / 9, notes: i === 0 ? '말할 것 <b>&</b>' : '', number: i + 1}));
  const slides = printHtml('수업 <1>', pages, 'slides');
  assert.match(slides, /size: A4 landscape/);
  assert.equal(slides.match(/<section class="sheet grid">/g).length, 7);
  assert.match(slides, /<title>수업 &lt;1&gt;<\/title>/);
  assert.doesNotMatch(slides, /javascript:/);
  assert.doesNotMatch(slides, /<script/i);
  const h6 = printHtml('t', pages, 'h6');
  assert.match(h6, /size: A4 portrait/);
  assert.equal(h6.match(/<section/g).length, 2);
  assert.match(h6, /repeat\(2, minmax/);
  assert.equal(printHtml('t', pages, 'h4').match(/<section/g).length, 2);
  assert.equal(printHtml('t', pages, 'h2').match(/<section/g).length, 4);
  const notes = printHtml('t', pages, 'notes');
  assert.equal(notes.match(/<section class="sheet notes">/g).length, 7);
  assert.match(notes, /말할 것 &lt;b&gt;&amp;&lt;\/b&gt;/);
  assert.match(notes, /class="note empty">노트 없음/);
  assert.match(printHtml('t', pages, 'unknown'), /size: A4 landscape/);
});

test('find counts literal matches in unlocked text boxes and optionally notes', () => {
  const slides = [
    {id: 'ppage00001', items: [text('etext00001', '사과 사과 Apple'), {...text('etext00002', '사과'), lock: true}, {id: 'eshape0001', t: 'shape'}], notes: '사과 묻기'},
    {id: 'ppage00002', items: [text('etext00003', 'a.b (사과?)')]},
    {id: 'ppage00003', items: []},
  ];
  assert.deepEqual(findText(slides, {find: '사과'}), {total: 4, slides: [{index: 0, count: 3}, {index: 1, count: 1}]});
  assert.deepEqual(findText(slides, {find: '사과', notes: false}).total, 3);
  assert.equal(findText(slides, {find: 'apple'}).total, 1);
  assert.equal(findText(slides, {find: 'apple', caseSensitive: true}).total, 0);
  assert.equal(findText(slides, {find: '(사과?)'}).total, 1);
  assert.equal(findText(slides, {find: '.'}).total, 1);
  assert.deepEqual(findText(slides, {find: ''}), {total: 0, slides: []});
});

test('replace leaves locked boxes, untouched slides and over-limit boxes alone; empty notes are removed', () => {
  const slides = [
    {id: 'ppage00001', items: [text('etext00001', '사과 사과'), {...text('etext00002', '사과'), lock: true}], notes: '사과'},
    {id: 'ppage00002', items: [text('etext00003', '배')]},
    {id: 'ppage00003', items: [text('etext00004', '사과')]},
  ];
  const before = structuredClone(slides);
  const r = replaceText(slides, {find: '사과', replace: '$&$1', limit: () => 20});
  assert.deepEqual(slides, before);
  assert.equal(r.slides[0].items[0].text, '$&$1 $&$1');
  assert.equal(r.slides[0].items[1].text, '사과');
  assert.equal(r.slides[0].notes, '$&$1');
  assert.equal(r.slides[1], slides[1]);
  assert.equal(r.count, 4);
  const tight = replaceText(slides, {find: '사과', replace: '아주 긴 과일 이름', limit: () => 8});
  assert.equal(tight.skipped, 2);
  assert.equal(tight.slides[0].items[0].text, '사과 사과');
  const cleared = replaceText(slides, {find: '사과', replace: ''});
  assert.equal(Object.hasOwn(cleared.slides[0], 'notes'), false);
  assert.equal(replaceText(slides, {find: '사과', replace: 'x', notes: false}).slides[0].notes, '사과');
});
