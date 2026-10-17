import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { importConvertedDocument } from '../app/import-document.js';
import { migrateRecord, aspectOf } from '../app/designs.js';
import { DocumentError } from '../src/document.js';
import { crc32 } from '../app/zip.js';

const sample = name => JSON.parse(readFileSync(new URL(`../app/samples/${name}.json`, import.meta.url), 'utf8'));
const input = () => ({ report: sample('studio-import'), document: sample('studio-document') });
function rejected(value, code, options) {
  const before = JSON.stringify(value);
  assert.throws(() => importConvertedDocument(value, options), error => {
    assert.ok(error instanceof DocumentError);
    assert.equal(error.code, code);
    assert.equal(error.original, value);
    assert.equal(JSON.stringify(error.original), before);
    return true;
  });
  assert.equal(JSON.stringify(value), before);
}

test('shared sample imports at 4:3 and retains identities, original size and source through two reopenings', () => {
  const value = input(), before = JSON.stringify(value);
  const { record, report } = importConvertedDocument(value);
  assert.equal(aspectOf(record), 4 / 3);
  assert.deepEqual(record.originalSize, value.document.originalSize);
  assert.equal(record.id, value.document.id);
  assert.deepEqual(record.slides.map(p => p.id), value.document.slides.map(p => p.id));
  assert.deepEqual(record.slides.flatMap(p => p.items.map(e => e.id)), value.document.slides.flatMap(p => p.items.map(e => e.id)));
  assert.equal(record.slides[1].source.pageNumber, 2);
  assert.ok(record.slides.every(p => p.source.assetId === report.sourceAssetId));
  assert.ok(record.slides.flatMap(p => p.items).every(e => e.source.assetId === report.sourceAssetId));
  const reopened = migrateRecord(JSON.parse(JSON.stringify(migrateRecord(JSON.parse(JSON.stringify(record))))));
  assert.deepEqual(reopened, record);
  assert.deepEqual(report.selectedPages, [1, 2]);
  assert.equal(JSON.stringify(value), before);
});

test('explicit page selection follows requested original order and reports omitted pages', () => {
  const value = input();
  const ordered = importConvertedDocument(value, { selectedPages: [2, 1] });
  assert.deepEqual(ordered.record.slides.map(p => p.id), value.document.slides.map(p => p.id).reverse());
  assert.deepEqual(ordered.record.slides.map(p => p.source.pageNumber), [2, 1]);
  const subset = importConvertedDocument(value, { selectedPages: [2] });
  assert.deepEqual(subset.report.omittedPages, [1]);
  assert.equal(subset.record.assets[0].storageKey, value.document.assets[0].storageKey);
  assert.equal(subset.record.slides[0].items[0].text, value.document.slides[1].items[0].text);
});

test('missing identities are deterministic across selection and ordering', () => {
  const value = input();
  delete value.document.id;
  for (const p of value.document.slides) { delete p.id; for (const e of p.items) delete e.id; }
  const whole = importConvertedDocument(value).record;
  const subset = importConvertedDocument(value, { selectedPages: [2] }).record;
  assert.equal(whole.id, subset.id);
  assert.deepEqual(whole.slides[1], subset.slides[0]);
  assert.deepEqual(importConvertedDocument(value).record, whole);
});

test('21 pages fail explicitly; a deliberate subset can include page 21 without silent truncation', () => {
  const value = input();
  value.report.pageCount = 21;
  value.report.selectedPages = Array.from({ length: 21 }, (_, i) => i + 1);
  value.document.slides = value.report.selectedPages.map(n => ({ items: [{ t: 'text', text: `직접 작성한 ${n}쪽` }] }));
  rejected(value, 'PAGE_LIMIT');
  const { record, report } = importConvertedDocument(value, { selectedPages: [21, 2] });
  assert.deepEqual(record.slides.map(p => p.source.pageNumber), [21, 2]);
  assert.equal(record.slides[0].items[0].text, '직접 작성한 21쪽');
  assert.equal(report.pageCount, 21);
  assert.equal(report.omittedPages.length, 19);
});

test('long extracted text is rejected intact instead of shortened into a successful document', () => {
  const value = input();
  const original = '긴 원문은 변환 보고서와 원본 파일에 보존합니다. '.repeat(8);
  value.document.slides[0].items[0].text = original;
  rejected(value, 'TEXT_LIMIT');
  assert.equal(value.document.slides[0].items[0].text, original);
});

test('invalid page mappings and unavailable selections never claim success', () => {
  const value = input();
  rejected(value, 'DUPLICATE_PAGE_SELECTION', { selectedPages: [1, 1] });
  rejected(value, 'INVALID_PAGE_SELECTION', { selectedPages: [] });
  rejected(value, 'INVALID_PAGE_SELECTION', { selectedPages: [0] });
  const missing = input(); missing.report.pageCount = 3;
  rejected(missing, 'PAGE_NOT_AVAILABLE', { selectedPages: [3] });
  const wrongCount = input(); wrongCount.document.slides.pop();
  rejected(wrongCount, 'PAGE_COUNT_MISMATCH');
  const wrongSource = input(); wrongSource.document.slides[0].source.pageNumber = 2;
  rejected(wrongSource, 'SOURCE_MISMATCH');
});

test('readiness, contracts, source identity and source asset are validated before import', () => {
  for (const [edit, code] of [
    [v => { v.report.status = 'running'; }, 'IMPORT_NOT_READY'],
    [v => { v.report.contractVersion = 2; }, 'UNSUPPORTED_IMPORT_CONTRACT'],
    [v => { v.report.sourceAssetId = 'amismatch001'; }, 'MISSING_SOURCE_ASSET'],
    [v => { v.report.sourceDocumentId = 'smismatch001'; }, 'SOURCE_MISMATCH'],
    [v => { delete v.document.originalSize; }, 'MISSING_ORIGINAL_SIZE'],
    [v => { v.document.schemaVersion = 2; }, 'UNSUPPORTED_SCHEMA'],
    [v => { v.document.slides[1].id = v.document.slides[0].id; }, 'DUPLICATE_ID'],
    [v => { v.document.assets[0].storageKey = '../outside.pptx'; }, 'INVALID_FIELD'],
    [v => { v.report.converter.fonts = [null]; }, 'INVALID_CONVERTER'],
  ]) {
    const value = input(); edit(value); rejected(value, code);
  }
});

test('self-authored PPTX archives match manifest, page count, dimensions and unabridged expected text', () => {
  const root = new URL('../tools/fixtures/pptx/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  for (const fixture of manifest.fixtures) {
    const bytes = readFileSync(new URL(fixture.file, root));
    assert.equal(bytes.length, fixture.byteLength);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256);
    // These fixtures use ZIP store: inspect entries and verify their CRC, without a converter or dependency.
    const entries = new Map();
    let at = 0;
    while (bytes.readUInt32LE(at) === 0x04034b50) {
      assert.equal(bytes.readUInt16LE(at + 8), 0);
      const length = bytes.readUInt32LE(at + 18), nameLength = bytes.readUInt16LE(at + 26), extraLength = bytes.readUInt16LE(at + 28);
      const name = bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8');
      const start = at + 30 + nameLength + extraLength, content = bytes.subarray(start, start + length);
      assert.equal(crc32(content), bytes.readUInt32LE(at + 14), name);
      entries.set(name, content.toString('utf8'));
      at = start + length;
    }
    assert.equal(bytes.readUInt32LE(at), 0x02014b50);
    assert.ok(entries.has('[Content_Types].xml'));
    const presentation = entries.get('ppt/presentation.xml');
    assert.equal([...presentation.matchAll(/<p:sldId /g)].length, fixture.pageCount);
    assert.match(presentation, /<p:sldSz cx="9144000" cy="6858000" type="screen4x3"/);
    const expected = JSON.parse(readFileSync(new URL(fixture.file.replace('.pptx', '.expected.json'), root), 'utf8'));
    assert.equal(expected.document.source.sha256, fixture.sha256);
    assert.equal(expected.document.assets[0].byteLength, bytes.length);
    expected.document.slides.forEach((p, i) => {
      const xml = entries.get(`ppt/slides/slide${i + 1}.xml`);
      assert.equal(xml.match(/<a:t>([^<]*)<\/a:t>/)[1], p.items[0].text);
      assert.equal(p.items[0].text.length, fixture.textLengths[i]);
    });
    if (fixture.expectedAdapterResult === 'ready') {
      const record = importConvertedDocument(expected).record;
      assert.equal(aspectOf(record), 4 / 3);
      assert.equal(record.slides.length, fixture.pageCount);
    } else rejected(expected, fixture.expectedAdapterResult);
  }
});
