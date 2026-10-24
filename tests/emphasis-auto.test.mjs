import test from 'node:test';
import assert from 'node:assert/strict';
import {planMotion, hasMotion, EMPHASES, EMPHASIS_IDS, emphasisKeyframes, emphasisPose, emphasisTime} from '../src/motion.js';
import {filmPlan, slidePoses} from '../src/film.js';
import {slideDur, DUR_LIMIT} from '../src/document.js';
import {cleanDesign} from '../src/model.js';
import {slideExtra} from '../app/designs.js';
import {cleanHtmlLesson} from '../app/html-lesson-runtime.js';
import {showAction, autoDelay, AUTO_SECONDS, SHOW_KEYS} from '../app/show-keys.js';

const text = (id, value, y, patch = {}) => ({id, t: 'text', text: value, x: 50, y, w: 50, size: 5, ...patch});

test('emphasis is a stored element value that adds a click step after any reveal, in reading order', () => {
  assert.deepEqual(EMPHASIS_IDS, ['pulse', 'shake', 'grow', 'spin', 'flash', 'jump', 'squash', 'tada', 'focus', 'rubber', 'wobble', 'boom', 'flip', 'swing']);
  assert.equal(EMPHASES.length, 14);
  const design = cleanDesign({id: 'ppage00001', bg: '#fff', items: [text('eaaaaaaa01', '아래', 80, {em: 'shake'}), text('eaaaaaaa02', '위', 20, {aw: true, em: 'pulse'}), text('eaaaaaaa03', '가운데', 50, {em: 'nope'})]});
  assert.equal(design.items[0].em, 'shake');
  assert.equal(Object.hasOwn(design.items[2], 'em'), false);
  assert.deepEqual(planMotion(design).clicks, [{i: 1, enter: 'fade', mirror: false}, {i: 1, emphasis: 'pulse'}, {i: 0, emphasis: 'shake'}]);
  assert.equal(hasMotion({items: [{t: 'text', em: 'grow'}]}), true);
  // Emphasis frames start and end at the element's own look.
  for (const id of EMPHASIS_IDS) {
    const k = emphasisKeyframes({rot: 10, op: 80}, id);
    assert.equal(k.ms, emphasisTime(id));
    assert.equal(k.keyframes[0].transform, k.keyframes.at(-1).transform.replace('rotate(370deg)', 'rotate(10deg)'));
    const rest = emphasisPose(id, k.ms);
    assert.deepEqual([rest.x, rest.y, rest.k, rest.o], [0, 0, 1, 1]);
    assert.ok(Math.abs(rest.r % 360) < 1e-9);
  }
  const peak = id => Math.max(...Array.from({length: 83}, (_, n) => emphasisPose(id, n * 10).k));
  assert.ok(peak('grow') > 1.29 && peak('pulse') > 1.11);
  assert.equal(emphasisKeyframes({}, 'nope'), null);
});

test('video plays emphasis steps on their own and keeps the element visible before its turn', () => {
  const design = cleanDesign({id: 'ppage00001', bg: '#fff', items: [text('eaaaaaaa01', '강조', 30, {em: 'grow'})]});
  const plan = filmPlan([design], {stay: 5});
  const [move] = plan.slides[0].moves;
  assert.equal(move.emphasis, 'grow');
  assert.equal(move.ms, emphasisTime('grow'));
  assert.equal(slidePoses(plan.slides[0], move.start - 10).size, 0);
  assert.ok(Math.max(...Array.from({length: 80}, (_, n) => slidePoses(plan.slides[0], move.start + n * 10).get(0)?.k || 1)) > 1.29);
  assert.equal(slidePoses(plan.slides[0], move.start + move.ms + 1).size, 0);
});

test('rehearsed seconds are whole seconds within a limit, survive cleaning, steer video stays and HTML lessons', () => {
  assert.deepEqual(slideDur({dur: 12}), {dur: 12});
  for (const bad of [0, 1.5, -3, DUR_LIMIT + 1, '9', null]) assert.deepEqual(slideDur({dur: bad}), {});
  const page = {id: 'ppage00001', bg: '#fff', dur: 7, items: [text('eaaaaaaa01', 'a', 30)]};
  assert.equal(cleanDesign(page).dur, 7);
  assert.equal(slideExtra(page).dur, 7);
  const plan = filmPlan([cleanDesign(page), cleanDesign({...page, id: 'ppage00002', dur: undefined})], {stay: 3});
  assert.ok(plan.slides[0].ms >= 7000 && plan.slides[0].ms < 9000, String(plan.slides[0].ms));
  assert.ok(plan.slides[1].ms >= 3000 && plan.slides[1].ms < 5000, String(plan.slides[1].ms));
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  const lesson = cleanHtmlLesson({version: 1, id: 'lsn0000001', title: '수업', pages: [{id: 'ppage00001', image, aspect: 1.5, dur: 4}, {id: 'ppage00002', image, aspect: 1.5, dur: 'x'}]});
  assert.equal(lesson.pages[0].dur, 4);
  assert.equal(Object.hasOwn(lesson.pages[1], 'dur'), false);
});

test('A and R keys; auto-advance splits a slide time across its click steps, never under a second', () => {
  assert.deepEqual(showAction({key: 'a', code: 'KeyA'}), {type: 'auto'});
  assert.deepEqual(showAction({key: 'ㄱ', code: 'KeyR'}), {type: 'rehearse'});
  assert.ok(SHOW_KEYS.some(([k]) => k === 'A') && SHOW_KEYS.some(([k]) => k === 'R'));
  assert.equal(autoDelay(undefined), AUTO_SECONDS * 1000);
  assert.equal(autoDelay(9, 2), 3000);
  assert.equal(autoDelay(2, 5), 1000);
  assert.equal(autoDelay(-1), AUTO_SECONDS * 1000);
});
