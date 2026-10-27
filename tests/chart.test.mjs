import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanChart, sampleChart, chartFromText, chartScale, chartSummary, chartNumber, CHART_LIMITS, CHART_KINDS } from '../src/chart.js';
import { cleanItem, newChart, itemLabel, configure } from '../src/model.js';
import { newRecord, migrateRecord } from '../app/designs.js';
import { validatePageInput } from '../src/document.js';

test('a chart is a small table plus looks; bad input is trimmed, not trusted', () => {
  const c = cleanChart({ kind: 'nope', labels: ['  사과 ', '', 'x'.repeat(50)], series: [{ name: '', values: ['8', '1,200', 'abc'] }, { values: [1] }, 3, { name: 'c' }, { name: 'd' }], palette: 'neon', title: ' 제목 ', unit: '명명명명명명명명', vals: 'no', color: 'red' });
  assert.equal(c.kind, 'bar');
  assert.deepEqual(c.labels, ['사과', '항목 2', 'x'.repeat(CHART_LIMITS.label)]);
  assert.deepEqual(c.series.map((s) => s.name), ['계열 1', '계열 2', 'c']);
  assert.deepEqual(c.series[0].values, [8, 1200, 0]);
  assert.deepEqual(c.series[1].values, [1, 0, 0], 'missing values become 0 and every series has one value per label');
  assert.equal(c.palette, 'basic');
  assert.equal(c.title, '제목');
  assert.equal(c.unit.length, CHART_LIMITS.unit);
  assert.equal(c.vals, undefined, 'values show unless switched off');
  assert.equal(c.color, undefined);
  assert.equal(cleanChart({ labels: [], series: [{ values: [] }] }), null);
  assert.equal(cleanChart({ labels: ['a'], series: [] }), null);
  assert.equal(cleanChart({ labels: Array(30).fill('a'), series: [{ values: [] }] }).labels.length, CHART_LIMITS.labels);
  for (const [kind] of CHART_KINDS) assert.equal(sampleChart(kind).kind, kind);
});

test('tables pasted from spreadsheets: tabs or commas, a header row names the series', () => {
  assert.deepEqual(chartFromText('과목\t1반\t2반\n국어\t85\t78\n수학\t72\t88\n'), { labels: ['국어', '수학'], series: [{ name: '1반', values: [85, 72] }, { name: '2반', values: [78, 88] }] });
  assert.deepEqual(chartFromText('봄,7\r\n여름,9\r\n\r\n가을,"5"'), { labels: ['봄', '여름', '가을'], series: [{ name: '계열 1', values: [7, 9, 0] }] });
  assert.deepEqual(chartFromText('a\t1,000\t50%').series.map((s) => s.values), [[1000], [50]]);
  assert.equal(chartFromText('a\t1\t2\t3\t4\t5').series.length, CHART_LIMITS.series);
  assert.equal(chartFromText('   \n  '), null);
});

test('axis ticks start at zero, use friendly steps, and never fall to 2.5 for whole counts', () => {
  assert.deepEqual(chartScale([8, 5, 11, 4]).ticks, [0, 5, 10, 15]);
  assert.deepEqual(chartScale([0.2, 0.7]).ticks, [0, 0.2, 0.4, 0.6, 0.8]);
  assert.deepEqual(chartScale([-3, 12]).ticks, [-5, 0, 5, 10, 15]);
  assert.deepEqual(chartScale([0, 0]).ticks, [0, 1]);
  assert.ok(chartScale([3, 1, 2]).ticks.every(Number.isInteger));
  assert.equal(chartNumber(1234.5), '1,234.5');
});

test('screen readers and the layer list hear the numbers', () => {
  const c = sampleChart('bar');
  assert.equal(chartSummary(c), "막대 차트 '우리 반이 좋아하는 과일': 사과 8명, 바나나 5명, 딸기 11명, 포도 4명");
  assert.match(chartSummary(sampleChart('line')), /^꺾은선 차트 '강낭콩 키 재기': 1모둠: 1일 0cm, .* \/ 2모둠: /);
  configure({ aspect: 16 / 9 });
  assert.match(itemLabel(newChart('pie')), /^원 차트/);
});

test('chart items survive the editor sanitizer and the stored record, and only chart keys travel', () => {
  configure({ aspect: 16 / 9 });
  const item = newChart('donut', { vals: false, palette: 'cool', color: '#112233', fx: true });
  assert.equal(item.fx, undefined, 'charts do not flip');
  assert.equal(item.w, 64);
  assert.ok(Math.abs(item.h - 64 * 3 / 4 * 16 / 9) < 0.1, 'about 4:3 on the card');
  const record = newRecord('16:9');
  record.slides[0] = { ...record.slides[0], items: [item] };
  const back = migrateRecord(JSON.parse(JSON.stringify(migrateRecord(record)))).slides[0].items[0];
  assert.deepEqual(cleanItem(back), cleanItem({ ...item, id: back.id }));
  assert.deepEqual([back.kind, back.palette, back.vals, back.color, back.labels.length], ['donut', 'cool', false, '#112233', 4]);
  assert.doesNotThrow(() => validatePageInput({ items: [item] }));
});
