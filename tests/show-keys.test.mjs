import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {showAction, pageIndex, swipeStep, showClock, SHOW_KEYS} from '../app/show-keys.js';
import {cleanHtmlLesson} from '../app/html-lesson-runtime.js';
import {gaiLessonContext} from '../app/gai-maker.js';

const key = (k, extra = {}) => ({key: k, code: extra.code ?? (/^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : k), ...extra});
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+jHnQAAAAASUVORK5CYII=';

test('presentation keys: PowerPoint-style navigation, remote clicker keys and tool letters', () => {
  for (const k of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']) assert.deepEqual(showAction(key(k)), {type: 'next'}, k);
  for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']) assert.deepEqual(showAction(key(k)), {type: 'prev'}, k);
  assert.deepEqual(showAction(key('Home')), {type: 'first'});
  assert.deepEqual(showAction(key('End')), {type: 'last'});
  assert.deepEqual(showAction(key('Escape')), {type: 'close'});
  const letters = {b: 'black', w: 'white', g: 'overview', p: 'pen', l: 'laser', e: 'erase', s: 'presenter', f: 'fullscreen', k: 'video', h: 'help', n: 'next'};
  for (const [k, type] of Object.entries(letters)) assert.deepEqual(showAction(key(k)), {type}, k);
  // Korean input mode: the physical key position still counts.
  assert.deepEqual(showAction({key: 'ㅠ', code: 'KeyB'}), {type: 'black'});
  assert.deepEqual(showAction({key: '.', code: 'Period'}), {type: 'black'});
  assert.deepEqual(showAction({key: '?', code: 'Slash', shiftKey: true}), {type: 'help'});
  // Browser and OS shortcuts stay with the browser.
  for (const mod of ['ctrlKey', 'metaKey', 'altKey']) assert.equal(showAction(key('p', {[mod]: true})), null);
  assert.equal(showAction(key('F5')), null);
  assert.equal(showAction(key('q')), null);
});

test('typing a page number then Enter jumps there; Escape cancels the number first', () => {
  const state = {};
  assert.deepEqual(showAction(key('1', {code: 'Digit1'}), state), {type: 'digits', value: '1'});
  assert.deepEqual(showAction(key('2', {code: 'Numpad2'}), state), {type: 'digits', value: '12'});
  assert.deepEqual(showAction(key('Enter'), state), {type: 'goto', page: 12});
  assert.equal(state.digits, '');
  assert.deepEqual(showAction(key('Enter'), state), {type: 'next'});
  showAction(key('7', {code: 'Digit7'}), state);
  assert.deepEqual(showAction(key('Escape'), state), {type: 'digits', value: ''});
  assert.deepEqual(showAction(key('Escape'), state), {type: 'close'});
  showAction(key('0', {code: 'Digit0'}), state);
  assert.deepEqual(showAction(key('Enter'), state), {type: 'digits', value: ''});
  for (const d of '12345') showAction(key(d, {code: `Digit${d}`}), state);
  assert.equal(state.digits, '345');
  assert.equal(pageIndex(12, 5), 4);
  assert.equal(pageIndex(0, 5), 0);
  assert.equal(pageIndex(3, 5), 2);
});

test('swipes turn pages only for clear horizontal moves; clock text stays short', () => {
  assert.equal(swipeStep(-120, 10), 1);
  assert.equal(swipeStep(120, -20), -1);
  assert.equal(swipeStep(30, 0), 0);
  assert.equal(swipeStep(-80, 90), 0);
  assert.equal(swipeStep(NaN, 0), 0);
  assert.equal(showClock(0), '0:00');
  assert.equal(showClock(65_400), '1:05');
  assert.equal(showClock(3_723_000), '1:02:03');
  assert.ok(SHOW_KEYS.length >= 8 && SHOW_KEYS.every(([k, v]) => k && v));
});

test('HTML lessons carry bounded speaker notes only when the page has them', () => {
  const lesson = cleanHtmlLesson({version: 1, id: 'dlesson001', title: '노트 수업', pages: [
    {id: 'ppage00001', image: png, aspect: 16 / 9, notes: '여기서 질문하기\r\n\u0007둘째 줄'},
    {id: 'ppage00002', image: png, aspect: 16 / 9, notes: '   '},
    {id: 'ppage00003', image: png, aspect: 16 / 9},
  ]});
  assert.equal(lesson.pages[0].notes, '여기서 질문하기\n둘째 줄');
  assert.equal(Object.hasOwn(lesson.pages[1], 'notes'), false);
  assert.equal(Object.hasOwn(lesson.pages[2], 'notes'), false);
  assert.deepEqual(cleanHtmlLesson(JSON.parse(JSON.stringify(lesson))), lesson);
});

test('가이X context includes the teacher notes of chosen slides, bounded and only when present', () => {
  const page = (id, text, notes) => ({page: {id, items: [{t: 'text', text}], ...(notes ? {notes} : {})}});
  const entries = [page('p1', '도입', '질문: 무엇이 보이나요?'), page('p2', '전개', '가'.repeat(5000)), page('p3', '정리')];
  const chosen = JSON.parse(gaiLessonContext(entries, 'p2', '수업', {referenceIds: ['p1', 'p2', 'p3']}));
  assert.equal(chosen.slides[0].teacherNotes, '질문: 무엇이 보이나요?');
  assert.equal(chosen.slides[1].teacherNotes.length, 1200);
  assert.equal(Object.hasOwn(chosen.slides[2], 'teacherNotes'), false);
  const flow = JSON.parse(gaiLessonContext(entries, 'p2', '수업'));
  assert.equal(flow.slides[0].teacherNotes, '질문: 무엇이 보이나요?');
  assert.equal(flow.slides[1].teacherNotes.length, 400);
});

test('apps forward only remote-clicker keys they did not use, through the trusted bridge', () => {
  const source = readFileSync(new URL('../app/gai-app.js', import.meta.url), 'utf8');
  assert.match(source, /if\(event\.defaultPrevented\|\|event\.ctrlKey\|\|event\.metaKey\|\|event\.altKey\|\|!\['PageDown','PageUp','Escape'\]\.includes\(event\.key\)\)return;/);
  assert.match(source, /\['gai-classroom-report','onbatang-app-captured','onbatang-app-key'\]\.includes\(d\.type\)\)parent\.postMessage/);
  assert.match(source, /if\(d\.type==='onbatang-app-key'\)\{if\(\['PageDown','PageUp','Escape'\]\.includes\(d\.key\)\)onKey\?\.\(d\.key\);return;\}/);
  const runtime = readFileSync(new URL('../app/html-lesson-bundle.js', import.meta.url), 'utf8');
  assert.match(runtime, /onbatang-app-key/, 'the downloaded HTML lesson uses the same bridge');
  assert.match(runtime, /ost-presenter/, 'the downloaded HTML lesson carries the presenter window');
});
