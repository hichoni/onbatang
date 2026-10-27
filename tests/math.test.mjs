import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cleanMath, mathBox, mathLabel, MATH_LIMITS } from '../src/math.js';
import { mathError, MATH_KEYS, MATH_EXAMPLES } from '../src/math-dialog.js';
import { cleanItem, newMath, refitMath, itemLabel, configure } from '../src/model.js';
import { newRecord, migrateRecord } from '../app/designs.js';
import { validatePageInput } from '../src/document.js';
import { buildMathJax, MATHJAX_VERSION } from '../tools/build-mathjax.mjs';

const shape = (w = 3000, h = 1000) => ({ vb: [0, -800, w, h], n: [{ t: 'g', a: { fill: 'currentColor', transform: 'scale(1,-1)' }, c: [{ t: 'path', a: { d: 'M0 0L100 100Z' } }, { t: 'text', a: { x: '0', y: '0', 'font-size': '884px', 'font-family': 'serif' }, s: '속력' }] }] });

test('a stored formula keeps only plain drawing parts: no scripts, events, links or foreign content', () => {
  const evil = cleanMath({
    tex: ' x\u0000 ', m: { vb: [0, 0, 100, 100], n: [
      { t: 'script', s: 'alert(1)' },
      { t: 'g', a: { onload: 'x()', fill: 'red' }, c: [{ t: 'path', a: { d: 'M0 0L1 1', fill: 'javascript:alert(1)' } }, { t: 'path', a: { d: 'M0 0L5 5', style: 'x' } }, { t: 'path', a: { d: 'M0 0 url(#x)' } }] },
      { t: 'foreignObject', c: [{ t: 'path', a: { d: 'M0 0' } }] }, { t: 'image', a: { href: 'x.png' } }, { t: 'use', a: { href: '#a' } },
      { t: 'text', a: { 'font-family': 'a;b{}' }, s: 'x' }, { t: 'text', s: '' }, { t: 'rect', a: { width: '10', height: 'calc(1px)' } },
      { t: 'path', a: { d: 'M0 0', transform: 'translate(1,2) scale(.5)' } },
    ] },
  });
  assert.equal(evil.tex, 'x');
  assert.deepEqual(evil.m.n, [{ t: 'g', a: { fill: 'red' }, c: [{ t: 'path', a: { d: 'M0 0L5 5' } }] }, { t: 'path', a: { d: 'M0 0', transform: 'translate(1,2) scale(.5)' } }],
    'unknown tags and attributes vanish; a part with one bad value is dropped whole');
  assert.equal(cleanMath({ tex: 'x', m: { vb: [0, 0, 0, 10], n: shape().n } }), null, 'an empty view box draws nothing');
  assert.equal(cleanMath({ tex: '', m: shape() }), null);
  assert.equal(cleanMath({ tex: 'x', m: { vb: [0, 0, 1, 1], n: [{ t: 'script' }] } }), null);
  assert.equal(cleanMath({ tex: 'x'.repeat(900), m: shape() }).tex.length, MATH_LIMITS.tex);
  let deep = { t: 'path', a: { d: 'M0 0' } };
  for (let i = 0; i < MATH_LIMITS.depth + 5; i++) deep = { t: 'g', c: [deep] };
  assert.equal(cleanMath({ tex: 'x', m: { vb: [0, 0, 1, 1], n: [deep] } }), null, 'too deep');
  assert.equal(cleanMath({ tex: 'x', m: { vb: [0, 0, 1, 1], n: Array(MATH_LIMITS.nodes + 10).fill({ t: 'path', a: { d: 'M0 0' } }) } }).m.n.length, MATH_LIMITS.nodes, 'too many parts are cut');
});

test('a formula box sizes its letters like a title and stays on the card', () => {
  assert.deepEqual(mathBox({ vb: [0, 0, 3000, 1000] }, 16 / 9), { w: 18, h: 10.67 });
  assert.deepEqual(mathBox({ vb: [0, 0, 3000, 1000] }, 1), { w: 18, h: 6 });
  const long = mathBox({ vb: [0, 0, 40000, 1000] }, 16 / 9);
  assert.equal(long.w, 92, 'a very long formula fits the card width');
  const tall = mathBox({ vb: [0, 0, 1000, 20000] }, 16 / 9);
  assert.equal(tall.h, 80);
  assert.equal(mathLabel('a  +\n b'), '수식: a + b');
});

test('math items survive the editor sanitizer and the stored record; editing keeps the letter size', () => {
  configure({ aspect: 16 / 9 });
  const item = newMath({ tex: '\\text{속력}', m: shape() }, { color: '#123456', fx: true });
  assert.deepEqual([item.t, item.w, item.h, item.color, item.fx], ['math', 18, 10.7, '#123456', undefined]);
  assert.equal(itemLabel(item), '수식: \\text{속력}');
  assert.equal(newMath({ tex: 'x', m: { vb: [0, 0, 1, 1], n: [] } }), null);
  assert.equal(cleanItem({ t: 'math', x: 1, y: 1, w: 9, h: 9, tex: 'x' }), null, 'a formula without its drawing is not kept');
  const record = newRecord('16:9');
  record.slides[0] = { ...record.slides[0], items: [item] };
  const back = migrateRecord(JSON.parse(JSON.stringify(migrateRecord(record)))).slides[0].items[0];
  assert.deepEqual(cleanItem(back), cleanItem({ ...item, id: back.id }));
  assert.equal(back.m.n[0].c[1].s, '속력');
  assert.doesNotThrow(() => validatePageInput({ items: [item] }));
  const bigger = { ...item, w: 36 };
  assert.deepEqual(refitMath(bigger, { tex: 'y', m: shape(6000) }), { tex: 'y', m: shape(6000), w: 72, h: 21.33 }, 'twice as wide formula, same letters');
  assert.equal(refitMath(item, { tex: 'y', m: null }), null);
});

test('MathJax errors read as plain words; the keys and examples are ready to insert', () => {
  assert.equal(mathError('Missing close brace'), '닫는 } 가 빠졌어요.');
  assert.equal(mathError('Undefined control sequence \\fracc'), '모르는 명령이에요: \\fracc (철자를 확인해 주세요)');
  assert.equal(mathError('Missing argument for \\frac'), '\\frac 뒤에 {…} 칸이 더 필요해요.');
  assert.match(mathError('Something odd'), /^수식을 읽지 못했어요 \(Something odd\)\.$/);
  assert.equal(mathError(''), '수식을 읽지 못했어요.');
  for (const [, text, caret] of MATH_KEYS) if (caret !== null) assert.ok(caret <= text.length && text.slice(caret - 1, caret + 1).match(/[{[(]|\s/), text);
  assert.ok(MATH_EXAMPLES.some(([, tex]) => tex.includes('\\ce{')), 'chemistry examples');
  assert.ok(MATH_EXAMPLES.some(([, tex]) => tex.includes('\\text{')), 'Korean words in formulas');
});

test('MathJax ships exactly as published, with its license', async () => {
  const result = await buildMathJax({ check: true });
  assert.equal(result.version, MATHJAX_VERSION);
  const manifest = JSON.parse(await readFile(new URL('../src/mathjax/BUILD.json', import.meta.url), 'utf8'));
  assert.equal(manifest.packages.mathjax, '3.2.2');
  assert.match(await readFile(new URL('../src/mathjax/LICENSE.txt', import.meta.url), 'utf8'), /Apache License/);
});
