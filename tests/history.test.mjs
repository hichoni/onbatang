import test from 'node:test';
import assert from 'node:assert/strict';
import { packValue, unpackValue, packRecord, restoredRecord, versionsToDrop, whenLabel, HISTORY_LIMIT, HISTORY_RECENT } from '../app/history.js';
import { newRecord, migrateRecord } from '../app/designs.js';
import { newId } from '../src/document.js';

const PHOTO = 'data:image/png;base64,' + 'A'.repeat(2000);
const deck = (text, extra = {}) => {
  const r = newRecord('16:9');
  r.slides[0] = { ...r.slides[0], items: [{ id: newId(), t: 'text', layout: 'slide', text, x: 50, y: 50, w: 60, size: 4, color: '#222222', align: 'c', font: 'gothic' }, { id: newId(), t: 'image', layout: 'slide', url: PHOTO, x: 30, y: 30, w: 20, h: 20 }] };
  return migrateRecord({ ...r, ...extra });
};

test('photos are kept once by their SHA-256; a version stores only the key and comes back exactly', async () => {
  const assets = new Map(), value = { a: PHOTO, b: [PHOTO, 'data:short'], c: 'plain' };
  const packed = await packValue(value, assets);
  assert.equal(assets.size, 1);
  const [sum] = assets.keys();
  assert.match(sum, /^[a-f0-9]{64}$/);
  assert.deepEqual(packed, { a: `onbatang-history-asset:${sum}`, b: [`onbatang-history-asset:${sum}`, 'data:short'], c: 'plain' });
  assert.deepEqual(unpackValue(packed, assets), value);
  assert.throws(() => unpackValue(packed, new Map()), { code: 'MISSING_ASSET' });
  assert.equal(unpackValue('onbatang-history-asset:not-a-key', new Map()), 'onbatang-history-asset:not-a-key', 'only exact keys are replaced');
});

test('the content signature ignores name, revision and time, and changes when a slide changes', async () => {
  const a = await packRecord(deck('안녕'));
  const renamed = await packRecord({ ...a.record, name: '다른 이름', revision: 9, updatedAt: 123 });
  const changed = structuredClone(a.record); changed.slides[0].items[0].text = '안녕하세요';
  const edited = await packRecord(changed);
  assert.equal(a.sig, renamed.sig);
  assert.notEqual(a.sig, edited.sig);
  assert.deepEqual(a.refs.length, 1);
  assert.ok(!JSON.stringify(a.body).includes('AAAA'), 'the body keeps no photo bytes');
});

test('restoring keeps the current identity, name and provenance, takes the old content and bumps the revision', () => {
  const old = deck('예전 글'), current = migrateRecord({ ...deck('지금 글'), id: old.id, name: '지금 이름', revision: 7, source: { kind: 'local' } });
  const twoPages = migrateRecord({ ...old, slides: [...old.slides, { items: [] }] });
  const back = restoredRecord(current, twoPages, 1000);
  assert.equal(back.id, current.id);
  assert.equal(back.name, '지금 이름');
  assert.equal(back.revision, 8);
  assert.equal(back.updatedAt, 1000);
  assert.equal(back.slides.length, 2);
  assert.equal(back.slides[0].items[0].text, '예전 글');
  assert.deepEqual(back.uploads, twoPages.uploads);
});

test('keeps the latest 20 versions and then one per earlier day, 30 in all', () => {
  const day = 24 * 3600e3, start = Date.UTC(2026, 9, 27, 3), list = [];
  let key = 0;
  for (let i = 0; i < 25; i++) list.push({ key: ++key, at: start - i * 60e3 });              // 오늘 25판
  for (let d = 1; d <= 15; d++) for (let i = 0; i < 3; i++) list.push({ key: ++key, at: start - d * day - i * 60e3 });   // 그 앞 15일, 하루 3판
  const drop = new Set(versionsToDrop(list)), keep = list.filter((v) => !drop.has(v.key));
  assert.equal(keep.length, HISTORY_LIMIT);
  const newest = [...list].sort((a, b) => b.at - a.at).slice(0, HISTORY_RECENT);
  for (const v of newest) assert.ok(!drop.has(v.key), 'the most recent ones always stay');
  const older = keep.filter((v) => !newest.includes(v));
  assert.equal(new Set(older.map((v) => new Date(v.at).toDateString())).size, older.length, 'one per earlier day');
  assert.ok(older.every((v) => list.filter((w) => new Date(w.at).toDateString() === new Date(v.at).toDateString()).every((w) => w.at <= v.at)), 'the latest of that day');
  assert.deepEqual(versionsToDrop(list.slice(0, 10)), []);
});

test('times read as today, yesterday or a date', () => {
  const now = new Date(2026, 9, 27, 15, 30).getTime();
  assert.equal(whenLabel(new Date(2026, 9, 27, 15, 12).getTime(), now), '오늘 오후 3:12');
  assert.equal(whenLabel(new Date(2026, 9, 26, 9, 5).getTime(), now), '어제 오전 9:05');
  assert.equal(whenLabel(new Date(2026, 9, 24, 0, 0).getTime(), now), '10월 24일(토) 오전 12:00');
  assert.equal(whenLabel(new Date(2025, 2, 3, 12, 0).getTime(), now), '2025년 3월 3일(월) 오후 12:00');
});
