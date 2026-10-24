// 모션그래픽 움직임: 새 모습 값(가로 · 세로 늘이기 · 흐림 · 네 방향 가리개 · 계단 빠르기) · 새 효과 · 사라지기 · 빠르기 · 늦추기 · 안무 조합 · 새 전환.
// 화면(키프레임)과 영상(그 순간의 모습)이 같은 표를 따르는지, 차례가 바르게 짜이는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTER_IDS, EXIT_IDS, EXITS, COMBO_IDS, TRANSITION_IDS, SPEEDS, DELAY_MAX,
  enterKeyframes, enterPose, enterTime, exitKeyframes, exitPose, exitTime, emphasisTime, emphasisPose, idleTime,
  planMotion, hasMotion, clipInsets, typePoints, easeFn, motionTransform, transitionFrames, transitionPose, tweenItem,
} from '../src/motion.js';
import {filmPlan, slidePoses} from '../src/film.js';
import {cleanDesign} from '../src/model.js';

const text = (id, value, y, patch = {}) => ({id, t: 'text', text: value, x: 50, y, w: 50, size: 5, ...patch});
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const REST = {x: 0, y: 0, k: 1, kx: 1, ky: 1, r: 0, o: 1, b: 0, clip: 0};
const atRest = (p) => Object.entries(REST).every(([k, v]) => near(p[k], v, 1e-4)) && (!p.stops || p.tk >= p.stops.length);

test('every entrance starts from its first frame and lands exactly on the element\'s own look (screen and video agree)', () => {
  for (const id of ENTER_IDS) {
    const item = {t: 'text', text: '모션그래픽', rot: 0, op: 100};
    const k = enterKeyframes(item, id);
    assert.ok(k && k.keyframes.length >= 2, id);
    assert.equal(k.ms, enterTime(id, item), id);
    const end = enterPose(id, k.ms, {item});
    assert.ok(atRest(end), `${id} ends at rest: ${JSON.stringify(end)}`);
    assert.equal(end.done, true);
    // 처음 모습은 숨었거나 · 가렸거나 · 옮겨졌거나 · 작거나 · 흐리다(무엇인가 다르다).
    const start = enterPose(id, 0, {item});
    assert.ok(!atRest(start), `${id} starts away from rest`);
    // 흐림을 쓰는 효과는 화면에서도 filter 를 쓴다(쓰지 않으면 filter 가 없다).
    const blurred = k.keyframes.some((f) => f.filter);
    assert.equal(blurred, Array.from({length: 40}, (_, n) => enterPose(id, (k.ms * n) / 40, {item}).b).some((b) => b > 0), `${id} blur parity`);
  }
});

test('exits begin at the element\'s own look and end gone; they are offered as their own list', () => {
  assert.deepEqual(EXIT_IDS, ['fade', 'sink', 'up', 'shrink', 'away', 'wipe', 'blur', 'pop', 'drop', 'vortex', 'blast', 'zoomout', 'skid']);
  assert.ok(EXITS.every((e) => typeof e.name === 'string' && e.name.length));
  for (const id of EXIT_IDS) {
    const item = {t: 'shape', rot: 0, op: 80};
    const k = exitKeyframes(item, id);
    assert.equal(k.ms, exitTime(id));
    assert.ok(atRest(exitPose(id, 0)), `${id} starts at rest`);
    assert.ok(atRest(exitPose(id, -100)), `${id} waits at rest`);
    const end = exitPose(id, k.ms * 2);
    assert.ok(end.o < 0.01 || end.clip > 99.99 || end.k < 0.01, `${id} ends gone: ${JSON.stringify(end)}`);
    assert.equal(k.keyframes.at(-1).opacity ?? 0.8, end.o < 0.01 ? 0 : 0.8, id);
  }
  assert.equal(exitKeyframes({}, 'nope'), null);
  assert.equal(exitPose('nope', 0), null);
});

test('stretching follows the element\'s own axes, after flips', () => {
  assert.equal(motionTransform({fx: true}, {kx: 0.5, ky: 2}), 'translate(calc(-50% + 0cqw), calc(-50% + 0cqw)) rotate(0deg) scale(-0.5, 2)');
  assert.equal(motionTransform({rot: 30}, {k: 2, kx: 0.5}), 'translate(calc(-50% + 0cqw), calc(-50% + 0cqw)) rotate(30deg) scale(1, 2)');
  // 늘어나는 효과는 실제로 가로 · 세로를 따로 늘인다.
  const mid = Array.from({length: 30}, (_, n) => enterPose('stretch', n * 25));
  assert.ok(mid.some((p) => p.kx < 0.5) && mid.some((p) => p.ky > 1.2));
  assert.ok(Array.from({length: 30}, (_, n) => enterPose('flip', n * 25)).some((p) => p.kx < 0.2));
});

test('the mask can cover any side, mirrors with flipped elements, and opens from the middle for split', () => {
  assert.deepEqual(clipInsets(100, false), [-25, 125, -25, -25], 'default: right side');
  assert.deepEqual(clipInsets(100, true), [-25, -25, -25, 125], 'flipped: the other side on the element');
  assert.deepEqual(clipInsets(100, false, 'l'), [-25, -25, -25, 125]);
  assert.deepEqual(clipInsets(100, false, 't'), [125, -25, -25, -25]);
  assert.deepEqual(clipInsets(100, false, 'b'), [-25, -25, 125, -25]);
  assert.deepEqual(clipInsets(100, false, 'b', true), [125, -25, -25, -25], 'upside-down element: top on the element');
  assert.deepEqual(clipInsets(100, false, 'x'), [-25, 50, -25, 50]);
  assert.deepEqual(clipInsets(0, false, 'y'), [-25, -25, -25, -25]);
  assert.deepEqual(clipInsets(100, false, 'y'), [50, -25, 50, -25]);
  // 효과가 고른 쪽이 화면의 키프레임과 영상의 모습에 똑같이 들어간다.
  const k = enterKeyframes({}, 'mask');
  assert.equal(k.keyframes[0].clipPath, 'inset(-25% -25% 125% -25%)');
  assert.equal(enterPose('mask', 0).side, 'b');
  assert.equal(enterPose('split', 0).side, 'x');
  assert.equal(enterPose('wipe', 0, {mirror: true}).side, 'l', 'coming from the right also flips the mask');
  assert.equal(enterKeyframes({}, 'wipe', {mirror: true}).keyframes[0].clipPath, 'inset(-25% -25% -25% 125%)');
});

test('typing reveals one character at a time: up to where each character sits, line after line; screen and video share the steps', () => {
  const ease = easeFn('steps(4, end)');
  assert.deepEqual([0, 0.1, 0.25, 0.49, 0.5, 0.99, 1].map(ease), [0, 0, 0.25, 0.25, 0.5, 0.75, 1]);
  assert.equal(easeFn('steps(3)')(0.5), 1 / 3);
  assert.equal(easeFn('steps(1, end)')(0.999), 0);
  // 잰 글자 자리(두 줄): 첫 줄 두 글자, 둘째 줄 한 글자.
  const stops = [{x: 30, top: 0, bottom: 50}, {x: 60, top: 0, bottom: 50}, {x: 45, top: 50, bottom: 100}];
  const item = {t: 'text', text: '가나\n다', size: 5, w: 50};
  const k = enterKeyframes(item, 'type', {stops});
  assert.equal(k.ms, 300, 'three characters: shortest');
  assert.equal(k.keyframes.length, 4);
  assert.ok(k.keyframes.slice(0, -1).every((f) => f.easing === 'steps(1, end)'));
  assert.equal(k.keyframes[0].clipPath, 'polygon(-25% -25%, -25% -25%, -25% -25%, -25% -25%, -25% -25%, -25% -25%)', 'nothing at first');
  assert.equal(k.keyframes[2].clipPath, 'polygon(-25% -25%, 125% -25%, 125% 0%, 60% 0%, 60% 50%, -25% 50%)', 'two characters of the first line');
  assert.equal(k.keyframes[3].clipPath, 'polygon(-25% -25%, 125% -25%, 125% 125%, 125% 125%, 125% 125%, -25% 125%)', 'all of it at the end');
  // 영상: 같은 때에 같은 칸(tk). 칸 사이에서는 그대로다.
  const pose = (ms) => enterPose('type', ms, {item, stops});
  assert.deepEqual([0, 99, 101, 199, 201, 299, 300].map((ms) => pose(ms).tk), [0, 0, 1, 1, 2, 2, 3]);
  assert.deepEqual(typePoints(pose(250).stops, pose(250).tk), [[-25, -25], [125, -25], [125, 0], [60, 0], [60, 50], [-25, 50]]);
  assert.deepEqual(typePoints(stops, 3)[2], [125, 125]);
  assert.ok(atRest(pose(300)));
  // 길이는 글자 수로만 정한다(잰 것과 상관없이 화면 · 영상 · 시간표가 같다).
  assert.equal(enterTime('type', item), 300);
  assert.equal(enterTime('type', {t: 'text', text: '가'.repeat(30)}), 30 * 55);
  assert.equal(enterTime('type', {t: 'text', text: '가'.repeat(500)}), 2700, 'long text is capped');
  assert.equal(enterTime('type', {t: 'shape'}), 800);
  // 잴 수 없을 때의 어림: 한 줄 글은 글자 너비대로(가운데 맞춤이면 글이 놓인 데서), 여러 줄 글은 한 줄씩.
  const guess = enterPose('type', 0, {item: {t: 'text', text: '안녕 하세요', size: 5, w: 50, align: 'c'}}).stops;
  assert.equal(guess.length, 5);
  assert.ok(guess[0].x > 25 && guess[0].x < 40 && guess[4].x > 70 && guess[4].x < 80, JSON.stringify(guess.map((s) => s.x)));
  assert.ok(guess.every((s, n) => !n || s.x > guess[n - 1].x));
  assert.ok(enterPose('type', 0, {item: {t: 'text', text: '안녕 하세요', size: 5, w: 50, align: 'l'}}).stops[0].x < 12);
  const rows = enterPose('type', 0, {item: {t: 'text', text: '가'.repeat(30), size: 5, w: 50}}).stops;
  assert.equal(rows.length, 3, 'about three lines in that box');
  assert.ok(rows[1].x === 125 && near(rows[1].top, 100 / 3) && near(rows[1].bottom, 200 / 3));
  assert.equal(enterPose('type', 0, {item: {t: 'text', text: '첫 줄\n둘째 줄', size: 5, w: 50}}).stops.length, 2);
  assert.equal(enterPose('type', 0, {item: {t: 'shape'}}).stops.length, 8, 'not text: eight bands');
  // 아주 긴 글은 60 칸까지만.
  assert.equal(enterKeyframes({t: 'text', text: 'a'.repeat(80), size: 1, w: 90}, 'type').keyframes.length, 61);
});

test('speed scales every motion of that element; delay holds only its entrance back', () => {
  assert.deepEqual(SPEEDS.map((s) => s.id), ['fast', '', 'slow']);
  const fast = {t: 'text', sp: 'fast'};
  const slow = {t: 'text', sp: 'slow'};
  assert.equal(enterTime('rise', fast), Math.round(enterTime('rise') * 0.6));
  assert.equal(enterTime('rise', slow), Math.round(enterTime('rise') * 1.6));
  assert.equal(enterKeyframes(slow, 'rise').ms, enterTime('rise', slow));
  assert.equal(exitTime('fade', fast), Math.round(exitTime('fade') * 0.6));
  assert.equal(emphasisTime('pulse', slow), Math.round(emphasisTime('pulse') * 1.6));
  assert.equal(idleTime('float', slow), Math.round(idleTime('float') * 1.6));
  // 늦추기는 장이 열릴 때 나오는 그 요소에만.
  const design = cleanDesign({id: 'ppage00001', bg: '#fff', pa: 'rise', items: [
    text('eaaaaaaa01', '제목', 20),
    text('eaaaaaaa02', '천천히', 50, {dl: 1.5, sp: 'slow'}),
  ]});
  const plan = planMotion(design);
  const [a, b] = plan.auto;
  assert.equal(b.delay - a.delay, 90 + 1500);
  assert.equal(plan.ms, b.delay + enterTime('rise', design.items[1]));
  // 영상도 같은 때 · 같은 길이다.
  const film = filmPlan([design]).slides[0];
  const move = film.moves.find((m) => m.i === 1);
  assert.equal(move.start - film.lead, b.delay);
  assert.equal(move.ms, enterTime('rise', design.items[1]));
});

test('motion values are stored cleanly: unknown ones dropped, delay rounded and capped', () => {
  const d = cleanDesign({id: 'ppage00001', bg: '#fff', items: [
    text('eaaaaaaa01', '가', 20, {ex: 'away', sp: 'fast', dl: 0.34}),
    text('eaaaaaaa02', '나', 50, {ex: 'nope', sp: 'warp', dl: -1}),
    text('eaaaaaaa03', '다', 80, {dl: 99}),
    text('eaaaaaaa04', '라', 90, {dl: 0.02}),
  ]});
  assert.deepEqual([d.items[0].ex, d.items[0].sp, d.items[0].dl], ['away', 'fast', 0.3]);
  for (const k of ['ex', 'sp', 'dl']) assert.equal(Object.hasOwn(d.items[1], k), false, k);
  assert.equal(d.items[2].dl, DELAY_MAX);
  assert.equal(Object.hasOwn(d.items[3], 'dl'), false, 'rounds to nothing');
  assert.equal(hasMotion({items: [{t: 'text', ex: 'fade'}]}), true);
  const mid = tweenItem({t: 'text', x: 0, y: 0, ex: 'fade', sp: 'fast', dl: 1}, {t: 'text', x: 10, y: 0, ex: 'fade', sp: 'fast', dl: 1}, 0.5);
  for (const k of ['ex', 'sp', 'dl']) assert.equal(Object.hasOwn(mid, k), false, k);
});

test('exits join the click steps after reveal and emphasis; on video they stay gone for the rest of the slide', () => {
  const design = cleanDesign({id: 'ppage00001', bg: '#fff', items: [
    text('eaaaaaaa01', '아래', 80, {ex: 'sink'}),
    text('eaaaaaaa02', '위', 20, {aw: true, em: 'pulse', ex: 'away'}),
  ]});
  const plan = planMotion(design);
  assert.deepEqual(plan.clicks, [{i: 1, enter: 'fade', mirror: false}, {i: 1, emphasis: 'pulse'}, {i: 1, exit: 'away'}, {i: 0, exit: 'sink'}]);
  const slide = filmPlan([design]).slides[0];
  const gone = slide.moves.find((m) => m.exit === 'sink');
  assert.equal(gone.ms, exitTime('sink'));
  assert.equal(slidePoses(slide, gone.start - 1).has(0), false, 'still there before its turn');
  assert.ok(slidePoses(slide, gone.start + gone.ms / 2).get(0).o < 1);
  assert.ok(slidePoses(slide, gone.start + gone.ms + 5000).get(0).o < 0.01, 'stays gone');
  assert.ok(slidePoses(slide, Infinity).get(0).o < 0.01, 'the finished look has it gone');
  assert.ok(slide.ms >= gone.start + gone.ms, 'the slide lasts until it is gone');
  assert.equal(JSON.stringify(slide).includes('"items"'), false, 'the plan stays small as JSON');
});

test('choreography combos: lead title, centre-out, left-to-right, shuffled, typed one after another, slow push-in', () => {
  for (const id of ['kinetic', 'assemble', 'ripple', 'cascade', 'cinema', 'spring', 'typing', 'glitch', 'slam']) assert.ok(COMBO_IDS.includes(id), id);
  const items = [
    {id: 'eaaaaaaa00', t: 'image', url: 'data:image/png;base64,AAAA', x: 50, y: 50, w: 100, h: 100},
    text('eaaaaaaa01', '큰 제목', 15, {size: 9}),
    text('eaaaaaaa02', '왼쪽', 60, {x: 15, w: 20}),
    text('eaaaaaaa03', '가운데', 55, {x: 50, w: 20}),
    text('eaaaaaaa04', '오른쪽', 60, {x: 85, w: 20}),
  ];
  const plan = (pa) => planMotion(cleanDesign({id: 'ppage00001', bg: '#fff', pa, items}));
  const k = plan('kinetic');
  assert.equal(k.auto.find((a) => a.i === 1).enter, 'slam', 'the biggest text lands');
  assert.equal(k.auto.find((a) => a.i === 2).enter, 'mask', 'the rest rises from a line');
  assert.equal(k.auto.find((a) => a.i === 0).enter, 'blurzoom', 'the backdrop settles in');
  const order = (p) => p.auto.filter((a) => a.i > 0).sort((a, b) => a.delay - b.delay).map((a) => a.i);
  assert.equal(order(plan('ripple'))[0], 3, 'centre first');
  assert.deepEqual(order(plan('cascade')).slice(0, 2), [2, 1], 'left to right (title is in the middle column)');
  assert.deepEqual(order(plan('assemble')), order(plan('assemble')), 'shuffle is the same every time');
  assert.notDeepEqual(order(plan('assemble')), [1, 2, 3, 4], 'and really shuffled');
  // 타자기: 앞 줄이 거의 다 써진 뒤에 다음 줄.
  const t = plan('typing');
  const typed = t.auto.filter((a) => a.enter === 'type').sort((a, b) => a.delay - b.delay);
  assert.equal(typed.length, 4);
  for (let n = 1; n < typed.length; n++) assert.ok(typed[n].delay >= typed[n - 1].delay + enterTime('type', items[typed[n - 1].i]) * 0.8);
  // 영화처럼: 바탕 사진이 다 나온 뒤에 천천히 다가간다.
  const c = plan('cinema');
  assert.deepEqual(c.loops.map((l) => [l.i, l.loop]), [[0, 'zoomin']]);
  assert.equal(c.loops[0].after, enterTime('blurzoom'));
  // 바탕이 아닌 사진에는 붙지 않고, 요소가 '가만히'면 붙지 않는다.
  assert.equal(planMotion(cleanDesign({id: 'ppage00001', bg: '#fff', pa: 'cinema', items: [{...items[0], lp: 'none'}]})).loops.length, 0);
});

test('new transitions move up and down, blur while passing, and open from the middle', () => {
  for (const id of ['whip', 'zoomblur', 'pushup', 'coverdown', 'split', 'reveal']) assert.ok(TRANSITION_IDS.includes(id), id);
  const up = transitionFrames('pushup', 1);
  assert.equal(up.next[0].transform, 'translate(0%, 100%)');
  assert.equal(up.old[1].transform, 'translate(0%, -100%)');
  assert.equal(transitionFrames('pushup', -1).next[0].transform, 'translate(0%, -100%)');
  const whip = transitionFrames('whip', 1, {w: 800});
  assert.equal(whip.next[0].filter, 'blur(20px)');
  assert.equal(whip.next[1].filter, 'blur(0px)');
  // 영상: 같은 모습을 그 순간의 값으로 준다.
  const half = transitionPose('whip', 1, 280);
  assert.ok(half.next.b > 0 && half.old.b > 0);
  assert.equal(transitionPose('whip', 1, 560).next.b, 0);
  assert.equal(transitionPose('pushup', 1, 0).next.y, 100);
  assert.equal(transitionPose('pushup', 1, 600).next.y, 0);
  assert.deepEqual(transitionPose('split', 1, 0).next.inset, [0, 50, 0, 50]);
  // 예전 전환은 그대로다.
  assert.equal(transitionFrames('slide', 1).next[0].transform, 'translateX(100%)');
  assert.equal(transitionFrames('zoom', 1).next[0].transform, 'scale(0.7)');
});

test('impact effects are stored, start and end where they should, and transitions match the video pose', () => {
  const enters = ['shock', 'vortex', 'burst', 'skid', 'smash', 'flare'], exits = ['vortex', 'blast', 'zoomout', 'skid'];
  const emphases = ['rubber', 'wobble', 'boom', 'flip', 'swing'], combos = ['impact', 'blast', 'storm'], turns = ['flash', 'punch', 'spin', 'drop', 'roll', 'glitch'];
  for (const id of enters) { assert.ok(ENTER_IDS.includes(id), id); assert.ok(atRest(enterPose(id, enterTime(id) * 2)), `${id} lands at rest`); }
  for (const id of emphases) { assert.ok(atRest(emphasisPose(id, 0)) && atRest(emphasisPose(id, 5000)), `${id} returns to rest`); }
  for (const id of combos) assert.ok(COMBO_IDS.includes(id), id);
  // 저장: 새 값이 정리(clean)를 거쳐도 그대로 남는다.
  const design = cleanDesign({ id: 'pimpact001', bg: '#fff', pa: 'impact', tr: 'spin', items: enters.map((an, i) => ({ id: `eimpact00${i}`, t: 'shape', shape: 'rect', x: 10 + i * 10, y: 50, w: 8, h: 8, color: '#277565', an, ...(exits[i] ? { ex: exits[i] } : {}), ...(emphases[i] ? { em: emphases[i] } : {}) })) });
  assert.equal(design.pa, 'impact'); assert.equal(design.tr, 'spin');
  assert.deepEqual(design.items.map((it) => [it.an, it.ex, it.em]), enters.map((an, i) => [an, exits[i], emphases[i]]));
  for (const id of turns) {
    assert.ok(TRANSITION_IDS.includes(id), id);
    const f = transitionFrames(id, 1), end = transitionPose(id, 1, f.ms);
    assert.ok(end.done && end.next.o === 1 && end.next.k === 1 && end.next.x === 0 && end.next.y === 0 && end.next.r === 0 && end.next.lt === 0, `${id} lands on the next slide: ${JSON.stringify(end.next)}`);
    // 돌리기 · 밝기를 쓰는 전환은 모든 키프레임을 같은 꼴로 적는다(돌린 바퀴 수를 잃지 않게).
    for (const side of [f.next, f.old].filter(Boolean)) {
      const forms = new Set(side.map((k) => (k.transform || '').replace(/[-\d.]+/g, '#')));
      assert.ok(forms.size <= 1, `${id} uses one transform form: ${[...forms]}`);
    }
  }
  assert.match(transitionFrames('spin', 1).next[0].transform, /rotate\(-200deg\)/);
  assert.match(transitionFrames('flash', 1).old[1].filter, /brightness\(4\)/);
  assert.equal(transitionPose('flash', 1, 650 * 0.45).old.lt, 3);
});
