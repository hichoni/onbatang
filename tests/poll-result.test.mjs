// 투표 결과 장(app/poll-result.js): 호스트가 준 결과 거르기 · 장의 모양(막대 · 몇 명 · 몇 % · 참여 수).
import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPollResult, pollResultPage} from '../app/poll-result.js';
import {cleanDesign} from '../src/model.js';

test('only a real poll result (2~4 different short choices with whole counts) is accepted', () => {
  assert.deepEqual(cleanPollResult({question: '  정답은?\n', options: [' O ', 'X'], counts: [2, 0], extra: 1}), {question: '정답은?', options: ['O', 'X'], counts: [2, 0]});
  for (const raw of [null, {options: ['O'], counts: [1]}, {options: ['O', 'O'], counts: [1, 1]}, {options: ['O', 'X'], counts: [1]}, {options: ['O', 'X'], counts: [1, -1]}, {options: ['O', 'X'], counts: [1, 0.5]}, {options: ['O', ''], counts: [1, 1]}, {options: ['1', '2', '3', '4', '5'], counts: [0, 0, 0, 0, 0]}])
    assert.equal(cleanPollResult(raw), null, JSON.stringify(raw));
  assert.equal(cleanPollResult({question: '가'.repeat(99), options: ['a', 'b'], counts: [0, 0]}).question.length, 60);
});

test('the result page is a saved "result" slide: question, one bar row per choice, the most-voted bar stands out, total and date', () => {
  const page = pollResultPage({question: '지구는 둥글까요?', options: ['O', 'X', '모르겠어요'], counts: [6, 2, 0]}, 16 / 9, new Date(2026, 9, 23).getTime());
  assert.equal(page.source.kind, 'result');
  const d = cleanDesign(page, {keepSpaces: true}), texts = d.items.filter(i => i.t === 'text').map(i => i.text);
  assert.equal(d.items.length, page.items.length, 'every piece survives cleaning');
  assert.deepEqual(texts, ['투표 결과', '지구는 둥글까요?', 'O', '6명 · 75%', 'X', '2명 · 25%', '모르겠어요', '0명 · 0%', '8명 참여 · 2026. 10. 23.']);
  const bars = d.items.filter(i => i.t === 'shape');
  assert.equal(bars.length, 5, 'three tracks and two fills (an empty choice has no fill)');
  const fills = bars.filter(b => b.color !== '#e6ece9');
  assert.deepEqual(fills.map(b => b.color), ['#2f9e44', '#74b9a8']);
  assert.ok(Math.abs(fills[0].w / bars[0].w - 0.75) < 0.01);
  assert.ok(fills.every(b => b.x - b.w / 2 >= bars[0].x - bars[0].w / 2 - 0.01), 'fills start at the left of their track');
  // Nobody voted: no fills, 0%.
  const none = pollResultPage({options: ['O', 'X'], counts: [0, 0]});
  assert.equal(none.items.filter(i => i.t === 'shape').length, 2);
  assert.equal(none.items[1].text, '투표');
  assert.equal(pollResultPage({options: ['O'], counts: [1]}), null);
});
