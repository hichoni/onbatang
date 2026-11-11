// 움직임 자동 다듬기: rules that read only the layout of a slide and return the same edit instructions AI-G uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import {configure, cleanDesign} from '../src/model.js';
import {editContext, checkEdits, applyEdits, LOCAL_LIMITS} from '../app/ai-edits.js';
import {polishMotion, POLISH_BUSY} from '../app/motion-polish.js';

configure({aspect: 16 / 9, maxItems: 60, maxPhotos: 10, motion: true, cleanImage: img => (typeof img?.url === 'string' && img.url.startsWith('data:image/png;base64,') ? {url: img.url} : null)});
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const T = (text, x, y, w, size, o = {}) => ({t: 'text', text, x, y, w, size, color: '#121a3a', font: 'gothic', bold: false, align: 'c', ...o});
const S = (shape, x, y, w, h, o = {}) => ({t: 'shape', shape, x, y, w, h, color: '#ffc93c', ...o});
const I = (x, y, w, h) => ({t: 'image', url: PHOTO, x, y, w, h, mask: 'none'});
const head = [T('대회 지도에서 배운 세 가지', 50, 17, 86, 4.4, {align: 'l'}), S('round', 10.2, 25, 6.4, 0.9)];
const run = (slides, opts) => {
  const picks = slides.map((_, i) => i), ctx = editContext(slides, picks, {limits: LOCAL_LIMITS});
  const plan = polishMotion(slides, ctx, opts);
  const checked = checkEdits(plan, ctx, {limits: LOCAL_LIMITS, slides});
  assert.deepEqual(checked.dropped, [], 'every instruction the rules make is one the editor accepts');
  return {plan, done: applyEdits(slides, checked.ops, ctx, {limits: LOCAL_LIMITS})};
};
const motion = it => [it.an, it.dl, it.lp].filter(v => v !== undefined);

test('a row of cards enters from the left in turn and what sits on a card follows it; the title focuses and its bar wipes', () => {
  const cards = [20, 50, 80].flatMap((x, k) => [S('round', x, 56, 26, 40, {color: '#ffffff'}), T(String(k + 1), x, 44, 10, 4), T(`${k + 1}번째 이야기`, x, 60, 22, 2.5)]);
  const {done, plan} = run([cleanDesign({bg: '#f7f5ef', items: [...head, ...cards]})]);
  const items = done.slides[0].items;
  assert.deepEqual(motion(items[0]), ['blur']);
  assert.deepEqual(motion(items[1]), ['wipe', 0.2]);
  assert.deepEqual([2, 5, 8].map(i => motion(items[i])), [['left', 0.3], ['left', 0.6], ['left', 0.9]]);
  assert.deepEqual([3, 4].map(i => motion(items[i])), [['fade', 0.4], ['fade', 0.5]]);
  assert.deepEqual(motion(items[10]), ['fade', 1]);
  assert.ok(plan.ops.every(o => o.why), 'each instruction says why in a few words');
  assert.equal(plan.say, '장의 모양을 보고 움직임을 입혔어요.');
});

test('big numbers stamp one beat apart, flow arrows blink, small icons breathe, chips pop', () => {
  const {done} = run([cleanDesign({bg: '#f7f5ef', items: [
    T('30년', 25, 50, 20, 8), T('해마다 열립니다', 25, 62, 22, 2.5), T('25개', 75, 50, 20, 8),
    S('arrow', 50, 50, 3, 4), S('arrow', 50, 70, 3, 4, {aw: true}),
    ...[20, 40, 60].map(x => S('star', x, 85, 3, 5)),
    ...['관찰', '질문', '기록'].map((w, k) => T(w, 20 + k * 12, 30, 10, 2.5, {bgc: '#121a3a', color: '#ffffff'})),
  ]})]);
  const items = done.slides[0].items;
  assert.deepEqual([0, 2].map(i => motion(items[i])), [['stomp', 0.4], ['stomp', 0.9]]);
  assert.deepEqual(motion(items[1]), ['fade', 0.6]);
  assert.deepEqual([items[3].lp, items[4].lp], ['blink', undefined], 'a piece that appears on a click does not loop');
  assert.deepEqual([5, 6, 7].map(i => items[i].lp), ['breathe', 'breathe', 'breathe']);
  assert.deepEqual([8, 9, 10].map(i => motion(items[i])), [['pop'], ['pop', 0.1], ['pop', 0.1]]);
});

test('a row of photos comes in turn with the frames behind them; one large photo zooms', () => {
  const row = [25, 50, 75].flatMap(x => [S('rect', x, 55, 22, 32, {color: '#ffffff'}), I(x, 55, 20, 28)]);
  const {done} = run([cleanDesign({bg: '#f7f5ef', items: [...head, ...row]}), cleanDesign({bg: '#f7f5ef', items: [S('rect', 50, 55, 62, 62, {color: '#ffffff'}), I(50, 55, 60, 58)]})]);
  const [a, b] = done.slides;
  assert.deepEqual([2, 3, 4, 5, 6, 7].map(i => motion(a.items[i])), [['left', 0.3], ['left', 0.3], ['left', 0.6], ['left', 0.6], ['left', 0.8], ['left', 0.8]]);
  assert.deepEqual([motion(b.items[0]), motion(b.items[1])], [['zoom'], ['zoom']]);
});

test('transitions follow the kind of slide: section covers zoom-blur, a new topic on a light slide pushes up, a quiz flips, a wall opens in a circle', () => {
  const slides = [
    cleanDesign({bg: 'navy', topic: '여는 말', items: [T('표지', 50, 40, 80, 8, {color: '#ffffff'}), S('circle', 50, 50, 60, 100, {color: '#26318f'})]}),
    cleanDesign({bg: 'navy', topic: '1부', items: [{...T('01', 20, 40, 30, 22, {color: '#ffc93c'}), layout: 'slide'}, T('나의 발명', 50, 60, 60, 6, {color: '#ffffff'})]}),
    cleanDesign({bg: '#f7f5ef', topic: '1부', items: [...head]}),
    cleanDesign({bg: '#f7f5ef', topic: '2부', items: [...head, S('round', 30, 60, 30, 30, {color: '#ffffff'}), T('카드 속 글', 30, 60, 26, 2.5)]}),
    {bg: 'paper', topic: '2부', activity: {kind: 'quiz'}, items: [T('문제', 50, 30, 80, 5)]},
    {bg: 'paper', topic: '2부', activity: {kind: 'wall'}, items: [T('gbe.ai.kr/w', 50, 40, 80, 6), T('123 456', 50, 62, 40, 8)]},
  ];
  const {done} = run(slides);
  assert.deepEqual(done.slides.map(s => s.tr), [undefined, 'zoomblur', undefined, 'pushup', 'flip', 'circle']);
  assert.equal(done.slides[0].items[1].lp, 'breathe', 'the big circle behind the cover breathes');
  assert.equal(done.slides[1].items[0].lp, 'float', 'the section number floats');
  assert.deepEqual(motion(done.slides[5].items[0]), ['type']);
  assert.deepEqual(motion(done.slides[5].items[1]), ['stomp', 1.3, 'breathe']);
  assert.deepEqual(done.slides[4].items, slides[4].items, 'a quiz slide keeps its pieces as they are');
});

test('what the teacher already set stays; a slide with a combo effect keeps its entrances; running twice changes nothing more', () => {
  const made = cleanDesign({bg: '#f7f5ef', tr: 'fade', topic: '새 주제', items: [{...head[0], an: 'rise', dl: 1}, head[1], S('arrow', 50, 50, 3, 4, {lp: 'none'}), T('40%', 50, 60, 20, 8)]});
  const combo = cleanDesign({bg: '#f7f5ef', pa: 'kinetic', items: [...head, T('70%', 50, 60, 20, 8), S('arrow', 50, 80, 3, 4)]});
  const first = cleanDesign({bg: 'paper', topic: '앞 주제', items: [T('첫 장', 50, 20, 80, 5)]});
  const {done} = run([first, made, combo]);
  const [, a, b] = done.slides;
  assert.equal(a.tr, 'fade');
  assert.deepEqual([motion(a.items[0]), a.items[2].lp, motion(a.items[3])], [['rise', 1], 'none', ['stomp', 0.4]]);
  assert.deepEqual(b.items.map(it => it.an), [undefined, undefined, undefined, undefined]);
  assert.equal(b.items[3].lp, 'blink');
  assert.equal(run(done.slides).done.count, 0);
  // Without keeping: the rules replace what was there.
  const fresh = run([first, made], {keep: false}).done.slides[1];
  assert.deepEqual([fresh.tr, motion(fresh.items[0]), fresh.items[2].lp], ['pushup', ['blur', 1], 'blink']);
});

test('a very busy slide only gets a transition; only the chosen slides are touched', () => {
  const busy = cleanDesign({bg: '#f7f5ef', topic: '바쁜 장', items: [...head, ...Array.from({length: POLISH_BUSY}, (_, k) => ({...S('circle', 3 + (k % 20) * 4.8, 40 + Math.floor(k / 20) * 20, 3, 5), layout: 'slide'}))]});
  const first = cleanDesign({bg: 'paper', items: [T('첫 장', 50, 20, 80, 5)]});
  const slides = [first, busy];
  const ctx = editContext(slides, [1], {limits: LOCAL_LIMITS});
  const plan = polishMotion(slides, ctx);
  assert.deepEqual(plan.ops, [{op: 'slide', slide: 'p1', tr: 'pushup', why: '새 주제로 넘어가요'}]);
  assert.deepEqual(polishMotion(slides, editContext(slides, [], {limits: LOCAL_LIMITS})), {say: '', ops: []});
});
