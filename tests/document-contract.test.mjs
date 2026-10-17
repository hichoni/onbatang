import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateRecord, copyRecord, copySlide, moveSlide, aspectOf, withSlideMotion } from '../app/designs.js';
import { cleanDesign, configure, duplicateItem, pasteItem } from '../src/model.js';
const sample = () => JSON.parse(readFileSync(new URL('../app/samples/studio-document.json', import.meta.url)));
const roundtrip = value => JSON.parse(JSON.stringify(value));
configure({ maxItems: 40, maxPhotos: 10, maxText: 120 });

test('common sample survives sanitizing and two JSON save/reopen cycles with stable references', () => {
  let r = migrateRecord(sample());
  const expected = roundtrip(r);
  for (let n = 0; n < 2; n++) r = migrateRecord(roundtrip({ ...r, slides: r.slides.map(p => cleanDesign(p)) }));
  assert.equal(r.id, expected.id);
  assert.equal(r.schemaVersion, 1); assert.equal(r.revision, 0);
  assert.deepEqual(r.originalSize, expected.originalSize);
  assert.deepEqual(r.assets, expected.assets); assert.deepEqual(r.source, expected.source);
  assert.deepEqual(r.slides.map(p => p.id), expected.slides.map(p => p.id));
  assert.deepEqual(r.slides[0].items.map(e => [e.id, e.source, e.assetRefs]), expected.slides[0].items.map(e => [e.id, e.source, e.assetRefs]));
  assert.equal(aspectOf(r), 4 / 3);
  const reordered = migrateRecord({ ...r, slides: moveSlide(r.slides, 0, 1)[0] });
  assert.equal(reordered.slides[1].id, r.slides[0].id);
});

test('legacy migration is deterministic, nonmutating and idempotent, retaining existing identity/layout', () => {
  const raw = { id: 'dlegacy123', ratio: '4:3', name: '예전 그림', design: { bg: 'mint', items: [{ t: 'text', id: 'eexisting123', text: '  긴 원문\n줄 바꿈  ', x: 15, y: 29, w: 32 }] } };
  const before = roundtrip(raw), once = migrateRecord(raw);
  assert.deepEqual(raw, before);
  assert.deepEqual(migrateRecord(raw), once);
  assert.deepEqual(migrateRecord(roundtrip(once)), once);
  assert.equal(once.slides[0].items[0].id, 'eexisting123');
  const view = cleanDesign(once.slides[0]);
  assert.equal(view.items[0].text, raw.design.items[0].text);
  assert.deepEqual([view.items[0].x, view.items[0].y, view.items[0].w], [15, 29, 32]);
  const missing = { slides: [{ items: [{t:'text',text:'ID 없는 자료'}] }] };
  assert.deepEqual(migrateRecord(missing), migrateRecord(missing));
});

test('copies get unique document, page and element identities with source and lineage intact', () => {
  const r = migrateRecord(sample()), copy = copyRecord(r);
  assert.notEqual(copy.id, r.id); assert.deepEqual(copy.source, r.source);
  assert.deepEqual(copy.origin, { documentId: r.id, revision: r.revision });
  assert.notEqual(copy.slides[0].id, r.slides[0].id);
  assert.equal(copy.slides[0].items[0].origin.elementId, r.slides[0].items[0].id);
  const [pages] = copySlide(r.slides, 0);
  migrateRecord({ ...r, slides: pages });
  assert.notEqual(pages[1].items[0].id, pages[0].items[0].id);
  for (const e of [duplicateItem(r.slides[0].items, 0), pasteItem([], r.slides[0].items[0])]) {
    assert.notEqual(e.id, r.slides[0].items[0].id); assert.equal(e.origin.elementId, r.slides[0].items[0].id);
  }
});

test('applying or clearing motion across pages preserves page identity, source, assets and video', () => {
  const r = migrateRecord(sample()), page = { ...r.slides[0], pa: 'rise', tr: 'fade', video: {src:'vexample123',dur:2} };
  const next = withSlideMotion(page, {tr:'slide'});
  assert.equal(next.pa,undefined);assert.equal(next.tr,'slide');
  for(const k of ['id','source','assetRefs','video','items'])assert.deepEqual(next[k],page[k]);
  const cleared=withSlideMotion(next,{});
  assert.equal(cleared.tr,undefined);assert.equal(cleared.id,page.id);
  assert.equal(migrateRecord({...r,slides:[cleared,r.slides[1]]}).slides[0].id,page.id);
});

test('unsupported schemas, invalid metadata, duplicate IDs and dangling assets reject without changing input', () => {
  const cases = [
    [r => r.schemaVersion = 2, 'UNSUPPORTED_SCHEMA'],
    [r => r.revision = -1, 'INVALID_REVISION'],
    [r => r.size.width = 0, 'INVALID_SIZE'],
    [r => r.slides[1].id = r.slides[0].id, 'DUPLICATE_ID'],
    [r => r.slides[1].items[0].id = r.slides[0].items[0].id, 'DUPLICATE_ID'],
    [r => r.assetRefs = ['amissing123'], 'MISSING_ASSET'],
    [r => r.source.kind = 'script', 'INVALID_SOURCE'],
    [r => r.assets[0].storageKey = '../secret', 'INVALID_FIELD'],
  ];
  for (const [change, code] of cases) {
    const r = sample(); change(r); const before = roundtrip(r);
    assert.throws(() => migrateRecord(r), e => e.code === code && e.original === r);
    assert.deepEqual(r, before);
  }
  const r = sample(); r.secret = {}; r.source.extra = 'not allowed'; r.slides[0].items[0].callback = {};
  const clean = migrateRecord(r);
  assert.equal(clean.secret, undefined); assert.equal(clean.source.extra, undefined); assert.equal(clean.slides[0].items[0].callback, undefined);
});

test('21 pages, long source text, excess editable objects fail explicitly with original available', () => {
  for (const [change, code] of [
    [r => r.slides = Array.from({length:21}, () => ({items:[]})), 'PAGE_LIMIT'],
    [r => r.slides[0].items[0].text = '가'.repeat(121), 'TEXT_LIMIT'],
    [r => r.slides[0].items = Array.from({length:41}, () => ({t:'text',text:'가'})), 'ITEM_LIMIT'],
  ]) {
    const r = sample(); change(r);
    assert.throws(() => migrateRecord(r), e => e.code === code && e.original === r);
  }
  const page = {id:'ppage123',items:[{t:'text',text:'가'.repeat(121)}]};
  assert.throws(() => cleanDesign(page), {code:'TEXT_LIMIT'});
});
