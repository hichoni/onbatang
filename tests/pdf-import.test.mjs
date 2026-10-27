import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parsePages, pageText, pdfRecords, pdfName, PDF_LIMITS } from '../app/pdf-import.js';
import { homeEntries, arrangeEntries, MAX_SLIDES, HOME_KINDS } from '../app/designs.js';
import { buildPdfImport, PDFJS_VERSION } from '../tools/build-pdf-import.mjs';

const URL1 = 'data:image/webp;base64,' + 'A'.repeat(4000);
const page = (number, extra = {}) => ({ number, url: URL1, width: 595.28, height: 841.89, ...extra });

test('page ranges read like a teacher writes them, in the written order, each page once', () => {
  assert.deepEqual(parsePages('', 4), [1, 2, 3, 4]);
  assert.deepEqual(parsePages(' 1-3, 8 ,2', 10), [1, 2, 3, 8]);
  assert.deepEqual(parsePages('5~3', 6), [5, 4, 3]);
  assert.deepEqual(parsePages('2，4、6', 6), [2, 4, 6]);
  assert.throws(() => parsePages('0-2', 5), /1부터 5 사이/);
  assert.throws(() => parsePages('7', 5), /5쪽까지/);
  assert.throws(() => parsePages('셋', 5), /쪽 번호가 아니에요/);
});

test('page text keeps its lines, squeezes spaces and fits the notes limit', () => {
  assert.equal(pageText([{ str: '식물의  한살이', hasEOL: true }, { str: '  씨앗', hasEOL: false }, { str: '이 싹 터요', hasEOL: true }, { str: '', hasEOL: true }, { str: '', hasEOL: true }, { str: '끝' }]), '식물의 한살이\n씨앗이 싹 터요\n\n끝');
  assert.equal(pageText([{ str: 'x'.repeat(9000) }]).length, 5000);
  assert.equal(pageText(null), '');
});

test('pages become locked full-page pictures; other page shapes fit inside; text goes to the notes only when asked', () => {
  const [record] = pdfRecords({ filename: '가정통신문.pdf', pages: [page(1, { text: '1쪽 글' }), page(2, { width: 841.89, height: 595.28 })], now: 1000 });
  assert.equal(record.name, '가정통신문');
  assert.deepEqual(record.size, { width: 595, height: 842, unit: 'pt' }, 'whole points: the ratio label reads 595:842');
  assert.equal(record.source.kind, 'pdf');
  assert.equal(record.source.filename, '가정통신문.pdf');
  const [a, b] = record.slides.map((s) => s.items[0]);
  assert.deepEqual([a.t, a.x, a.y, a.w, a.h, a.lock, a.alt], ['image', 50, 50, 100, 100, true, '가정통신문 1쪽']);
  assert.equal(b.w, 100); assert.ok(b.h < 51 && b.h > 49, 'a landscape page fits a portrait slide');
  assert.equal(record.slides[0].notes, '1쪽 글');
  assert.equal(record.slides[0].source.pageNumber, 1);
  assert.equal(pdfRecords({ filename: 'a.pdf', pages: [page(1, { text: '글' })], notes: false })[0].slides[0].notes, undefined);
  assert.deepEqual(record.uploads, [URL1], 'the page picture is listed once among the uploads');
});

test('more than 20 pages become numbered parts that home shows as one PDF entry', () => {
  const pages = Array.from({ length: 45 }, (_, i) => page(i + 1));
  const records = pdfRecords({ filename: '2학기 과학 실험 안내문 최종본(수정).pdf', pages, now: 5000 });
  assert.deepEqual(records.map((r) => r.slides.length), [MAX_SLIDES, MAX_SLIDES, 5]);
  assert.deepEqual(records.map((r) => r.name), ['2학기 과학 실험 안내문 최종본(수정) · 1', '2학기 과학 실험 안내문 최종본(수정) · 2', '2학기 과학 실험 안내문 최종본(수정) · 3']);
  assert.equal(pdfRecords({ filename: `${'가'.repeat(40)}.pdf`, pages })[0].name, `${'가'.repeat(24)} · 1`, 'a long name leaves room for the part number');
  assert.ok(records.every((r) => r.name.length <= 30));
  assert.equal(new Set(records.map((r) => r.source.sourceDocumentId)).size, 1);
  const entries = homeEntries(records);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].pages, 45);
  assert.equal(entries[0].ppt, true);
  assert.equal(arrangeEntries(entries, { kind: 'ppt' }).length, 1, 'the "PPT · PDF" filter keeps it');
  assert.deepEqual(HOME_KINDS.find(([id]) => id === 'ppt'), ['ppt', 'PPT · PDF']);
  assert.equal(pdfName('보고서.PDF'), '보고서');
  assert.equal(pdfName('   '), 'PDF');
  assert.ok(PDF_LIMITS.pages >= 100 && PDF_LIMITS.bytes < 400000);
});

test('pdf.js ships exactly as published: fixed version, Korean CMaps, image decoders and licenses', async () => {
  const result = await buildPdfImport({ check: true });
  assert.equal(result.version, PDFJS_VERSION);
  assert.ok(result.cmaps >= 20);
  const root = new URL('../app/pdf/vendor/', import.meta.url), manifest = JSON.parse(await readFile(new URL('BUILD.json', root), 'utf8'));
  assert.equal(manifest.packages['pdfjs-dist'], '6.4.299');
  for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs', 'wasm/openjpeg.wasm', 'wasm/jbig2.wasm', 'licenses/pdfjs-LICENSE.txt', 'cmaps/UniKS-UCS2-H.bcmap', 'cmaps/Adobe-Korea1-UCS2.bcmap']) {
    const bytes = await readFile(new URL(name, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files[name].sha256, name);
  }
  const notice = await readFile(new URL('../NOTICE', import.meta.url), 'utf8');
  assert.match(notice, /pdfjs-dist 6\.4\.299/);
});
