// 글상자 부분 서식(runs): 정리 · 입히기 · 풀기 · 글을 고친 뒤 맞추기 · 저장 · PPTX 내보내기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRuns, styleRuns, runsAll, dropRunKey, runPieces, shiftRuns, styleAt } from '../src/runs.js';
import { cleanItem } from '../src/model.js';
import { migrateRecord, newRecord } from '../app/designs.js';
import { createPptx } from '../app/pptx.js';

const item = (patch = {}) => cleanItem({ t: 'text', text: '[선택] 도전! 우리 가족 아침 걷기\n아침식사 및 휴식', x: 50, y: 50, color: '#1d2433', ...patch });

test('runs are clipped, merged, sorted and drop values equal to the whole box', () => {
  const it = item();
  assert.deepEqual(cleanRuns(it.text, [{ s: 5, e: 8, b: true }, { s: 0, e: 4, b: true }, { s: 4, e: 5, b: true }, { s: -3, e: 0, b: true }, { s: 900, e: 999, i: true }], it), [{ s: 0, e: 8, b: true }]);
  assert.deepEqual(cleanRuns(it.text, [{ s: 0, e: 4, c: '#1D2433' }, { s: 0, e: 4, b: false }, { s: 0, e: 4, c: 'red' }], it), [], 'same as the box, or not a colour');
  assert.deepEqual(cleanRuns(it.text, [{ s: 0, e: 6, b: true }, { s: 2, e: 4, b: false }], it), [{ s: 0, e: 2, b: true }, { s: 4, e: 6, b: true }], 'a later run wins');
});

test('styling a selection toggles only that part; the whole-box toggle clears the part', () => {
  let it = item();
  it = cleanItem({ ...it, runs: styleRuns(it, 0, 21, { b: true }) });
  assert.deepEqual(it.runs, [{ s: 0, e: 21, b: true }]);
  assert.equal(runsAll(it, 0, 21, 'b'), true);
  assert.equal(runsAll(it, 0, 25, 'b'), false);
  it = cleanItem({ ...it, runs: styleRuns(it, 0, 4, { c: '#e03131' }) });
  assert.deepEqual(it.runs, [{ s: 0, e: 4, b: true, c: '#e03131' }, { s: 4, e: 21, b: true }]);
  assert.deepEqual(styleAt(it, 1), { b: true, i: false, u: false, c: '#e03131' });
  assert.deepEqual(styleAt(it, 23), { b: false, i: false, u: false, c: '#1d2433' });
  // 전체 굵게를 누르면 부분 굵게는 지운다(색은 남는다)
  const whole = cleanItem({ ...it, bold: true, runs: dropRunKey({ ...it, bold: true }, 'b') });
  assert.deepEqual(whole.runs, [{ s: 0, e: 4, c: '#e03131' }]);
  assert.deepEqual(runPieces(whole.text, whole.runs).map((p) => [p.text, !!p.run]), [['[선택]', true], [' 도전! 우리 가족 아침 걷기\n아침식사 및 휴식', false]]);
});

test('typing moves runs with the text; new letters take the style of the letter before', () => {
  const it = cleanItem({ ...item(), runs: [{ s: 5, e: 7, b: true }] });       // '도전'
  assert.deepEqual(shiftRuns(it.text, '아주 ' + it.text, it.runs, it), [{ s: 8, e: 10, b: true }]);
  assert.deepEqual(shiftRuns(it.text, it.text.slice(0, 7) + '해' + it.text.slice(7), it.runs, it), [{ s: 5, e: 8, b: true }]);
  assert.deepEqual(shiftRuns(it.text, it.text.slice(0, 6) + it.text.slice(7), it.runs, it), [{ s: 5, e: 6, b: true }]);
  assert.deepEqual(shiftRuns(it.text, it.text.slice(0, 5) + it.text.slice(7), it.runs, it), [], 'deleting the styled letters drops the run');
});

test('runs survive saving and reopening a record', () => {
  const record = newRecord('16:9');
  record.slides = [{ items: [{ id: 'etext000001', t: 'text', text: '굵게 보통', x: 50, y: 50, w: 50, size: 6, runs: [{ s: 0, e: 2, b: true, c: '#e03131' }, { s: 1, e: 9, junk: 1 }] }] }];
  const again = migrateRecord(JSON.parse(JSON.stringify(migrateRecord(record))));
  assert.deepEqual(again.slides[0].items[0].runs, [{ s: 0, e: 2, b: true, c: '#e03131' }]);
});

test('PPTX export writes one a:r per styled piece, per paragraph', async () => {
  const text = { id: 'etext001', t: 'text', layout: 'slide', text: '[선택] 도전\n아침식사', x: 50, y: 30, w: 80, h: 20, size: 4, color: '#123456', align: 'l', typeface: '맑은 고딕',
    runs: [{ s: 0, e: 4, b: true, c: '#e03131' }, { s: 5, e: 10, u: true }] };
  const { bytes } = await createPptx({ slides: [{ id: 'ppage001', bg: '#ffffff', items: [text] }], size: { width: 12192000, height: 6858000, unit: 'emu' } });
  const xml = new TextDecoder().decode(bytes);
  const runs = [...xml.matchAll(/<a:r><a:rPr ([^>]*)>(?:(?!<\/a:rPr>).)*?<a:srgbClr val="([0-9A-Fa-f]{6})"(?:(?!<\/a:r>).)*?<a:t xml:space="preserve">([^<]*)<\/a:t><\/a:r>/g)].map((m) => [m[3], /b="1"/.test(m[1]), /u="sng"/.test(m[1]), m[2].toLowerCase()]);
  assert.deepEqual(runs, [['[선택]', true, false, 'e03131'], [' ', false, false, '123456'], ['도전', false, true, '123456'], ['아침', false, true, '123456'], ['식사', false, false, '123456']]);
});

test('replacing a styled word keeps its style; find & replace moves the runs', async () => {
  const { replaceText } = await import('../app/find-replace.js');
  const base = item(), at = base.text.indexOf('아침식사');
  const it = cleanItem({ ...base, runs: [{ s: 5, e: 7, b: true }, { s: at, e: at + 4, c: '#e03131' }] });   // '도전', '아침식사'
  const slice = (x) => x.runs.map((r) => x.text.slice(r.s, r.e));
  const renamed = { ...it, text: it.text.replace('도전', '챌린지') };
  assert.deepEqual(slice({ ...renamed, runs: shiftRuns(it.text, renamed.text, it.runs, it) }), ['챌린지', '아침식사']);
  const one = replaceText([{ items: [it] }], { find: '아침', replace: '저녁' }).slides[0].items[0];
  assert.equal(one.text, '[선택] 도전! 우리 가족 저녁 걷기\n저녁식사 및 휴식');
  assert.deepEqual(slice(one), ['도전', '저녁식사']);
});
