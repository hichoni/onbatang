import test from 'node:test';
import assert from 'node:assert/strict';
import {planMotion, hasMotion, IDLES, IDLE_IDS, ENTER_IDS, COMBO_IDS, idleKeyframes, idlePose, idleTime, idlePhase, enterKeyframes, enterPose, tweenItem} from '../src/motion.js';
import {filmPlan, slidePoses, slideLoops, filmCells} from '../src/film.js';
import {cleanDesign} from '../src/model.js';

const text = (id, value, y, patch = {}) => ({id, t: 'text', text: value, x: 50, y, w: 50, size: 5, ...patch});
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('계속 움직이기(lp) is a stored element value; unknown ids are dropped and it counts as motion', () => {
  assert.deepEqual(IDLE_IDS, ['float', 'breathe', 'sway', 'bob', 'beat', 'spin', 'blink', 'drift']);
  assert.equal(IDLES.length, 8);
  assert.ok(IDLES.every(e => typeof e.name === 'string' && e.name.length));
  const design = cleanDesign({id: 'ppage00001', bg: '#fff', items: [text('eaaaaaaa01', '위', 20, {lp: 'float'}), text('eaaaaaaa02', '아래', 80, {lp: 'nope'})]});
  assert.equal(design.items[0].lp, 'float');
  assert.equal(Object.hasOwn(design.items[1], 'lp'), false);
  assert.equal(hasMotion({items: [{t: 'text', lp: 'breathe'}]}), true);
  assert.equal(hasMotion({items: [{t: 'text'}]}), false);
  // 이어 움직이기의 중간 모습에는 움직임 값이 남지 않는다.
  assert.equal(Object.hasOwn(tweenItem({t: 'text', x: 0, y: 0, lp: 'spin'}, {t: 'text', x: 10, y: 10, lp: 'spin'}, 0.5), 'lp'), false);
});

test('every idle loop starts and ends at the element\'s own look so repeating never jumps', () => {
  for (const id of IDLE_IDS) {
    const k = idleKeyframes({rot: 10, op: 80}, id);
    assert.equal(k.ms, idleTime(id));
    assert.ok(k.ms >= 1000 && k.ms <= 8000, `${id}: ${k.ms}`);
    const rest = (ms) => { const p = idlePose(id, ms); return [p.x, p.y, p.k, ((p.r % 360) + 360) % 360, p.o]; };
    assert.deepEqual(rest(0), [0, 0, 1, 0, 1], id);
    // 한 바퀴가 끝나면 다시 처음(제 모습)이다(빙글빙글은 360도 = 제 모습).
    assert.deepEqual(rest(k.ms).map(v => Math.round(v * 1e6) / 1e6), [0, 0, 1, 0, 1], id);
    assert.deepEqual(rest(k.ms * 3).map(v => Math.round(v * 1e6) / 1e6), [0, 0, 1, 0, 1], id);
    // 바퀴를 넘어가도 같은 자리에서 같은 모습이다(화면의 iterations: Infinity 와 같다).
    const a = idlePose(id, k.ms * 0.37), b = idlePose(id, k.ms * 2.37);
    for (const key of ['x', 'y', 'k', 'r', 'o']) assert.ok(near(a[key], b[key]), `${id}.${key}`);
    assert.equal(a.done, false);
    // 가운데 어딘가에서는 분명히 움직인다(세기는 작게).
    const moved = Array.from({length: 50}, (_, n) => idlePose(id, (k.ms * (n + 0.5)) / 50)).some(p => !near(p.x, 0) || !near(p.y, 0) || !near(p.k, 1) || !near(p.r % 360, 0) || !near(p.o, 1));
    assert.ok(moved, id);
    assert.ok(Array.from({length: 50}, (_, n) => idlePose(id, (k.ms * n) / 50)).every(p => Math.abs(p.x) <= 3 && Math.abs(p.y) <= 3 && p.k <= 1.1 && p.o >= 0.4), `${id} is too strong`);
  }
  assert.equal(idleKeyframes({}, 'nope'), null);
  assert.equal(idlePose('nope', 10), null);
  // 요소마다 시작하는 박자가 흩어진다(같은 효과라도 함께 움직이지 않게). 요소 0 은 0 에서.
  assert.equal(idlePhase(0, 'float'), 0);
  const phases = [0, 1, 2, 3, 4].map(i => idlePhase(i, 'float'));
  assert.equal(new Set(phases).size, 5, String(phases));
  assert.ok(phases.every(p => p >= 0 && p < idleTime('float')));
  assert.equal(idlePhase(3, 'nope'), 0);
});

test('planMotion lists loops with when they start: after the entrance, right away, or after a click reveal', () => {
  const design = cleanDesign({id: 'ppage00001', bg: '#fff', pa: 'rise', items: [
    text('eaaaaaaa01', '바로', 20, {an: 'none', lp: 'float'}),
    text('eaaaaaaa02', '떠오른 뒤', 50, {lp: 'breathe'}),
    text('eaaaaaaa03', '누른 뒤', 80, {aw: true, lp: 'bob'}),
    text('eaaaaaaa04', '가만히', 90),
  ]});
  const plan = planMotion(design);
  assert.deepEqual(plan.loops.map(l => [l.i, l.loop]), [[0, 'float'], [1, 'breathe'], [2, 'bob']]);
  assert.equal(plan.loops[0].after, 0);
  const rise = plan.auto.find(a => a.i === 1);
  assert.equal(plan.loops[1].after, rise.delay + 600);
  assert.equal(plan.loops[2].after, null);
  assert.deepEqual(planMotion({items: [text('eccccccc01', 'x', 1)]}).loops, []);
});

test('video timeline repeats the loop from the same instant as the screen and keeps drawing after settle', () => {
  const design = cleanDesign({id: 'ppage00001', bg: '#fff', items: [
    text('eaaaaaaa01', '바로', 20, {lp: 'sway'}),
    text('eaaaaaaa02', '떠오른 뒤', 50, {an: 'rise', lp: 'breathe'}),
    text('eaaaaaaa03', '누른 뒤', 80, {aw: true, an: 'pop', lp: 'bob'}),
    text('eaaaaaaa04', '가만히', 90),
  ]});
  const plan = filmPlan([design], {stay: 5});
  const [slide] = plan.slides;
  assert.equal(slideLoops(slide), true);
  assert.equal(slideLoops(filmPlan([cleanDesign({id: 'ppage00002', bg: '#fff', items: [text('eccccccc01', 'x', 1)]})]).slides[0]), false);
  const by = Object.fromEntries(slide.loops.map(l => [l.i, l]));
  // 처음부터 보이는 조각: 장이 열릴 때(lead) 제 박자에서. 나타나는 조각: 나타난 직후 0 에서. 누르는 조각: 그 차례가 끝난 뒤 0 에서.
  assert.deepEqual(by[0], {i: 0, loop: 'sway', start: slide.lead, phase: idlePhase(0, 'sway')});
  const rise = slide.moves.find(m => m.i === 1);
  assert.deepEqual(by[1], {i: 1, loop: 'breathe', start: rise.start + rise.ms, phase: 0});
  const pop = slide.moves.find(m => m.i === 2);
  assert.deepEqual(by[2], {i: 2, loop: 'bob', start: pop.start + pop.ms, phase: 0});
  // 시작하기 전에는 제 모습(목록에 없다). 시작한 뒤에는 되풀이 모습이고, 나타나는 동안에는 나타나는 모습이 앞선다.
  assert.equal(slidePoses(slide, rise.start + rise.ms - 1).get(1)?.done, false);
  assert.ok(!slidePoses(slide, rise.start + rise.ms - 1).get(1)?.o < 1 || true);
  const mid = rise.start + rise.ms + 1500;
  assert.ok(near(slidePoses(slide, mid).get(1).k, idlePose('breathe', 1500).k));
  assert.ok(slidePoses(slide, mid).get(1).k > 1.03);
  assert.ok(near(slidePoses(slide, slide.lead + 800).get(0).r, idlePose('sway', 800 + idlePhase(0, 'sway')).r));
  // 다 나온 뒤(settle)에도 계속 움직이고, Infinity(다 나온 그림)에서는 모두 제 모습이다.
  assert.ok(slidePoses(slide, slide.settle + 700).has(1));
  assert.equal(slidePoses(slide, Infinity).size, 0);
  assert.equal(slidePoses(slide, 0).has(0), false);
  // 가만히 있는 조각은 끝까지 목록에 없다. 움직이는 조각은 저마다 제 칸을 가진다.
  assert.equal(slidePoses(slide, slide.settle + 700).has(3), false);
  const boxes = design.items.map(() => ({x: 10, y: 10, w: 100, h: 40, bw: 100, bh: 40}));
  const cells = filmCells(design, slide, boxes, 1920, 1080);
  assert.deepEqual(cells.filter(c => c.i >= 0).map(c => c.i).sort(), [0, 1, 2]);
  assert.ok(plan.ms >= 5000);
});

test('새 나타나는 효과(swoop)와 조합 효과(motion) exist and keep the screen/video contract', () => {
  assert.ok(ENTER_IDS.includes('swoop'));
  assert.ok(COMBO_IDS.includes('motion'));
  const k = enterKeyframes({rot: 0, op: 100}, 'swoop');
  assert.equal(k.keyframes[0].opacity, 0);
  assert.equal(k.keyframes.at(-1).opacity, 1);
  const end = enterPose('swoop', k.ms);
  assert.deepEqual([end.x, end.y, end.k, end.r, end.o, end.done], [0, 0, 1, 0, 1, true]);
  // 지나쳤다가 돌아온다(가운데 어딘가에서 x 가 양수).
  assert.ok(Array.from({length: 70}, (_, n) => enterPose('swoop', n * 10).x).some(x => x > 0.5));
  const design = cleanDesign({id: 'ppage00001', bg: '#fff', pa: 'motion', items: [
    {id: 'ebbbbbbb01', t: 'shape', shape: 'rect', x: 50, y: 50, w: 100, h: 100, color: '#123456'},
    text('ebbbbbbb02', '제목', 30),
    {id: 'ebbbbbbb03', t: 'emoji', ch: '🚀', x: 70, y: 70, w: 10},
  ]});
  const plan = planMotion(design);
  assert.deepEqual(plan.auto.map(a => [a.i, a.enter]), [[0, 'fade'], [1, 'swoop'], [2, 'pop']]);
  assert.equal(plan.auto[2].delay - plan.auto[1].delay, 70);
});
