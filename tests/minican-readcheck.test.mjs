// 영상의 읽기 시간 점검(src/film.js 의 readSeconds · readCheck): 장이 화면 글을 다 읽을 만큼 머무는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSeconds, readCheck, READ, filmPlan } from '../src/film.js';

const text = (t) => ({ t: 'text', text: t, x: 50, y: 50, w: 60, size: 6 });
test('읽는 데 드는 시간: 한글 · 한자 · 가나는 1초에 4.5자, 나머지는 15자, 그리고 1.5초. 빈칸은 세지 않고 글이 없으면 0', () => {
  assert.deepEqual(READ, { cjk: 4.5, other: 15, pad: 1.5 });
  assert.equal(readSeconds({ items: [] }), 0);
  assert.equal(readSeconds({ items: [{ t: 'shape', shape: 'rect' }] }), 0);
  assert.equal(readSeconds({ items: [text('가나다라마 바사아자차')] }), 10 / 4.5 + 1.5);
  assert.equal(readSeconds({ items: [text('Hello world!')] }), 11 / 15 + 1.5);
  assert.equal(readSeconds({ items: [text('漢字 かな'), { t: 'link', label: 'OK' }] }), 4 / 4.5 + 2 / 15 + 1.5);
});

test('모자란 장만 찾아 그 장에만 읽을 만큼의 머무는 시간을 준다(나머지 · 원본은 그대로)', () => {
  const long = { items: [text('가'.repeat(90))] }, short = { items: [text('제목')] }, rehearsed = { items: [text('가'.repeat(90))], dur: 30 };
  const { short: found, fit } = readCheck([short, long, rehearsed], { stay: 5 });
  assert.deepEqual(found.map((x) => x.index), [1]);
  assert.equal(found[0].need, 21.5);
  assert.ok(found[0].have >= 4.9 && found[0].have < 6, String(found[0].have));
  assert.equal(fit[1].dur, 22);
  assert.equal(fit[0], short); assert.equal(fit[2], rehearsed, 'a rehearsed slide that already has the time stays as it is');
  assert.equal('dur' in long, false, 'the input is not changed');
  // 맞춘 디자인으로 다시 짜면 모자란 장이 없다.
  assert.deepEqual(readCheck(fit, { stay: 5 }).short, []);
  assert.ok(filmPlan(fit, { stay: 5 }).ms > filmPlan([short, long, rehearsed], { stay: 5 }).ms);
});
