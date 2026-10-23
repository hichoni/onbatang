// 내 그림 목록의 묶기 · 거르기 · 늘어놓기(homeEntries · arrangeEntries)와 발표할 때 보여 줄 발표자 노트(spokenNotes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { homeEntries, arrangeEntries, createdOf, newDesignId } from '../app/designs.js';
import { spokenNotes } from '../app/show-keys.js';

const ppt = { kind: 'pptx', sourceDocumentId: 's' + 'a'.repeat(24) };
const rec = (id, name, { source = { kind: 'local' }, pages = 1, at = 0 } = {}) => ({ id, name, source, slides: Array.from({ length: pages }, () => ({})), updatedAt: at });

test('the numbered parts of one PPT become one deck entry in part order', () => {
  const list = [rec('d3', '캠프 · 3', { source: ppt, pages: 3 }), rec('d1', '캠프 · 1', { source: ppt, pages: 2, at: 50 }), rec('d2', '캠프 · 2', { source: ppt, pages: 2, at: 90 }), rec('d9', '나무', { at: 70 })];
  const [deck, single] = homeEntries(list);
  assert.equal(deck.deck, true);
  assert.equal(deck.name, '캠프');
  assert.deepEqual(deck.records.map((r) => r.id), ['d1', 'd2', 'd3']);
  assert.equal(deck.pages, 7);
  assert.equal(deck.updatedAt, 90);
  assert.equal(deck.createdAt, 50);
  assert.equal(single.deck, false);
  assert.equal(single.name, '나무');
});

test('a second import of the same PPT is its own deck; a lone part or a local design is not grouped', () => {
  const list = [rec('d1', '캠프 · 1', { source: ppt, at: 1 }), rec('d2', '캠프 · 2', { source: ppt, at: 1 }), rec('d3', '캠프 · 1', { source: ppt, at: 9 }), rec('d4', '캠프 · 2', { source: ppt, at: 9 }),
    rec('d5', '다른 · 1', { source: { ...ppt, sourceDocumentId: 's' + 'b'.repeat(24) } }), rec('d6', '그림 · 2')];
  const entries = homeEntries(list);
  assert.deepEqual(entries.filter((e) => e.deck).map((e) => e.records.map((r) => r.id)), [['d1', 'd2'], ['d3', 'd4']]);
  assert.deepEqual(entries.filter((e) => !e.deck).map((e) => e.records[0].id), ['d5', 'd6']);
});

test('host groups (one import each) win over name grouping and carry the import date', () => {
  const list = [rec('d1', '캠프 · 1', { source: ppt }), rec('d2', '캠프 · 2', { source: ppt }), rec('d3', '캠프 · 1', { source: ppt })];
  const entries = homeEntries(list, [{ id: 'b1', title: '2026 캠프', documents: ['d2', 'd1'], createdAt: '2026-10-22T13:00:00.000Z' }, { id: 'b2', documents: ['d3'] }]);
  assert.equal(entries[0].key, 'g:b1');
  assert.equal(entries[0].name, '2026 캠프');
  assert.deepEqual(entries[0].records.map((r) => r.id), ['d1', 'd2']);
  assert.equal(entries[0].createdAt, Date.parse('2026-10-22T13:00:00.000Z'));
  assert.equal(entries.length, 2, 'a one-part host group stays a single card');
});

test('filter by kind and name, sort by recent edit, creation or name; unknown dates go last', () => {
  const made = (ms) => newDesignId(ms);
  const a = rec(made(Date.UTC(2026, 9, 1)), '나무 관찰', { at: Date.UTC(2026, 9, 20) });
  const b = rec(made(Date.UTC(2026, 9, 5)), '가을 소풍', { at: Date.UTC(2026, 9, 10) });
  const c = rec('d1', '캠프 · 1', { source: ppt }), d = rec('d2', '캠프 · 2', { source: ppt });
  assert.equal(createdOf(a), Date.UTC(2026, 9, 1));
  assert.equal(createdOf(c), 0);
  const entries = homeEntries([c, a, d, b]);
  const names = (opts) => arrangeEntries(entries, opts).map((e) => e.name);
  assert.deepEqual(names({ sort: 'recent' }), ['나무 관찰', '가을 소풍', '캠프']);
  assert.deepEqual(names({ sort: 'made' }), ['가을 소풍', '나무 관찰', '캠프']);
  assert.deepEqual(names({ sort: 'name' }), ['가을 소풍', '나무 관찰', '캠프']);
  assert.deepEqual(names({ kind: 'ppt' }), ['캠프']);
  assert.deepEqual(names({ kind: 'mine' }), ['나무 관찰', '가을 소풍']);
  assert.deepEqual(names({ query: ' 소 풍' }), ['가을 소풍']);
});

test('spoken notes drop the source memo lines a PPT tool left, and keep the teacher\'s own lines', () => {
  const notes = '참가 가족이 착석하면 정식 표지로 넘깁니다.\n자료: C:/Users/choni/AppData/Local/Temp/codex-clipboard-0e15.png\n시각 자료: 내장 image_gen으로 생성한 설명용 이미지 (darkbg). 실제 사진이 아닙니다.\n시각자료: (ai)\nC:\\Users\\me\\x.png\n자료: 활동지 3쪽 나눠 주기\n시간: 5분';
  assert.equal(spokenNotes(notes), '참가 가족이 착석하면 정식 표지로 넘깁니다.\n자료: 활동지 3쪽 나눠 주기\n시간: 5분');
  assert.equal(spokenNotes('자료: /Users/me/a.png\n시각 자료: 그림'), '');
  assert.equal(spokenNotes(''), '');
  assert.equal(spokenNotes(undefined), '');
});
