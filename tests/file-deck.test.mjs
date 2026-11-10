// 온바탕 파일로 연 여러 파트 자료의 묶음(fileDeck)은 파트 그림 기록 안에 적혀 계정을 거쳐 다른 기기로 간다.
// 모양이 이상한 묶음은 버리되 그림은 그대로 읽고, 사본은 원래 묶음에 끼지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateRecord, copyRecord, fileDeckOf, newDesignId } from '../app/designs.js';
import { packOnbatang, readOnbatang, freshCopy } from '../app/onbatang-file.js';

const rec = (id, more = {}) => ({ id, name: '발명 수업 · 1', ratio: '16:9', slides: [{ id: 'pdeckpage01', bg: 'paper', items: [] }], updatedAt: 1792900000000, ...more });
const deck = { id: 'fdeckabc123', title: '발명 수업', part: 1, parts: 3, pageOrder: ['pdeckpage02', 'pdeckpage01'] };

test('fileDeck: 파트 기록에 묶음을 적으면 정리를 거쳐도 그대로 남는다', () => {
  const r = migrateRecord(rec(newDesignId(1792900000000, 0.1), { fileDeck: deck }));
  assert.deepEqual(r.fileDeck, deck);
  assert.deepEqual(migrateRecord(r).fileDeck, deck, '다시 정리해도 같다');
  const plain = migrateRecord(rec(newDesignId(1792900000001, 0.2)));
  assert.equal('fileDeck' in plain, false, '묶음이 없으면 칸도 없다');
});

test('fileDeck: 모양이 이상하면 묶음만 버리고 그림은 읽는다', () => {
  const bad = [
    null, 'x', [], { ...deck, id: 'X!' }, { ...deck, parts: 1, part: 0 }, { ...deck, part: 3 }, { ...deck, part: -1 },
    { ...deck, parts: 101 }, { ...deck, part: 1.5 },
  ];
  for (const fileDeck of bad) {
    const r = migrateRecord(rec(newDesignId(1792900000002, Math.random()), { fileDeck }));
    assert.equal(r.fileDeck, undefined, JSON.stringify(fileDeck));
    assert.equal(r.slides.length, 1);
  }
  assert.deepEqual(fileDeckOf({ ...deck, pageOrder: ['pdeckpage01', 'pdeckpage01'] }).fileDeck.pageOrder, undefined, '겹친 쪽 차례는 버린다');
  assert.deepEqual(fileDeckOf({ ...deck, title: '  긴   이름 ' }).fileDeck.title, '긴 이름');
  assert.equal('title' in fileDeckOf({ ...deck, title: '' }).fileDeck, false);
});

test('fileDeck: 사본(copyRecord · 온바탕 파일 사본으로 열기)은 원래 묶음을 버린다', async () => {
  const id = newDesignId(1792900000003, 0.3);
  assert.equal(copyRecord(rec(id, { fileDeck: deck })).fileDeck, undefined);
  const parts = [0, 1].map((part) => migrateRecord(rec(newDesignId(1792900000010 + part, part / 3 + 0.1), { name: `발명 수업 · ${part + 1}`, slides: [{ id: `pdeckpart0${part}`, bg: 'paper', items: [] }], fileDeck: { id: 'fdeckabc123', title: '발명 수업', part, parts: 2 } })));
  const file = await readOnbatang(await packOnbatang({ title: '발명 수업', records: parts, deck: { title: '발명 수업' }, app: '0.141.0' }), { app: '0.141.0' });
  assert.deepEqual(file.records.map((r) => r.fileDeck?.part), [0, 1], '온바탕 파일에도 묶음이 담긴다');
  const copy = freshCopy(file, { now: 1792950000000 });
  assert.deepEqual(copy.records.map((r) => migrateRecord(r).fileDeck), [undefined, undefined]);
  assert.ok(copy.deck, '파일의 묶음(deck)은 남아 연 쪽이 새 묶음으로 적는다');
});
