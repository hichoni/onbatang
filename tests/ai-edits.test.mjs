// AI-G 도우미의 편집 지시: what is sent (text and layout only), what an answer may change, and how it is applied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {configure, cleanDesign} from '../src/model.js';
import {editContext, checkEdits, applyEdits, rolesOf, titleOf, isDark, motionCatalog, EDIT_LIMITS, LOCAL_LIMITS} from '../app/ai-edits.js';

configure({aspect: 16 / 9, maxItems: 40, maxPhotos: 10, motion: true, cleanImage: img => (typeof img?.url === 'string' && img.url.startsWith('data:image/png;base64,') ? {url: img.url} : null)});
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const T = (text, x, y, w, size, o = {}) => ({t: 'text', text, x, y, w, size, color: '#121a3a', font: 'gothic', bold: false, align: 'l', ...o});
const S = (shape, x, y, w, h, o = {}) => ({t: 'shape', shape, x, y, w, h, color: '#ffc93c', ...o});
const deck = () => [
  cleanDesign({bg: '#f7f5ef', topic: '1부', tr: 'slide', notes: '먼저 물어봅니다.', items: [
    T('1부 · 지도', 50, 9, 86, 1.8, {bold: true}),
    T('검색, 검색, 검색', 50, 17, 86, 4.4),
    S('round', 10.2, 25, 6.4, 0.9),
    T('40 ~ 70%', 30, 52, 30, 9, {align: 'c'}),
    S('arrow', 50, 52, 3, 4),
    S('round', 72, 55, 34, 38, {color: '#ffffff'}),
    {t: 'image', url: PHOTO, x: 72, y: 55, w: 30, h: 34, mask: 'none', alt: '특허 검색 화면'},
    T('비슷한 것은 있지만, 내 것만의 다른 점이 분명해야 합니다', 50, 88, 90, 2.2, {align: 'c', bold: true}),
    T('잠근 글', 20, 70, 20, 2, {lock: true}),
  ]}),
  cleanDesign({bg: 'navy', items: [T('다음 장의 제목', 50, 20, 80, 5, {color: '#ffffff'}), T('본문 한 줄', 50, 50, 80, 3, {color: '#ffffff'})]}),
  cleanDesign({bg: 'paper', items: [T('셋째 장', 50, 20, 80, 5)]}),
];

test('roles are read from the layout: title, kicker, number, bar, arrow, photo and its frame, closing line', () => {
  const [one, two] = deck();
  assert.deepEqual(rolesOf(one), ['kicker', 'title', 'bar', 'number', 'arrow', 'frame', 'photo', 'closing', 'body']);
  assert.equal(titleOf(one), '검색, 검색, 검색');
  assert.equal(isDark(two), true);
  assert.equal(isDark(one), false);
});

test('the request carries text, layout and current motion under short keys, never the picture itself', () => {
  const slides = deck();
  const ctx = editContext(slides, [0], {title: '삼척 연수'});
  const sent = JSON.stringify(ctx.request);
  assert.ok(!sent.includes('base64') && !sent.includes('data:image'), 'no picture data leaves the device');
  assert.deepEqual(ctx.request.deck, {title: '삼척 연수', count: 3, aspect: 1.78});
  const [page] = ctx.request.slides;
  assert.deepEqual([page.key, page.no, page.topic, page.dark, page.tr, page.notes], ['p1', 1, '1부', false, 'slide', '먼저 물어봅니다.']);
  assert.deepEqual(page.items.map(it => it.key), ['p1.1', 'p1.2', 'p1.3', 'p1.4', 'p1.5', 'p1.6', 'p1.7', 'p1.8', 'p1.9']);
  assert.deepEqual(page.items[1], {key: 'p1.2', t: 'text', role: 'title', x: 50, y: 17, w: 86, text: '검색, 검색, 검색', size: 4.4, align: 'l'});
  assert.deepEqual(page.items[6], {key: 'p1.7', t: 'image', role: 'photo', x: 72, y: 55, w: 30, h: 34, alt: '특허 검색 화면'});
  assert.deepEqual(ctx.request.around, [{no: 2, title: '다음 장의 제목'}]);
  assert.deepEqual(ctx.find('p1.4'), {slide: 0, item: 3});
  assert.deepEqual(ctx.find('p1'), {slide: 0});
  assert.equal(ctx.find('p9'), null);
  assert.equal(ctx.keyOf(0, 3), 'p1.4');
  assert.equal(ctx.locked('p1.9'), true, 'a locked box keeps its words');
});

test('a request keeps to its size: slides beyond the limit are left out, long text is clipped and then frozen, decoration goes first', () => {
  const many = Array.from({length: 30}, (_, k) => cleanDesign({bg: 'paper', items: [T(`${k + 1}번째 장`, 50, 20, 80, 5)]}));
  const ctx = editContext(many, [29, 0, 3, 3, ...many.map((_, k) => k), 99, -1]);
  assert.equal(EDIT_LIMITS.slides, 24, 'one ticket polishes up to 24 slides');
  assert.deepEqual(ctx.picks, Array.from({length: 24}, (_, k) => k));
  assert.equal(ctx.cut.slides, 6);
  assert.deepEqual(editContext(many, [8, 0, 3, 3, 1], {limits: {...EDIT_LIMITS, slides: 3}}).picks, [0, 1, 3]);
  const long = [cleanDesign({bg: 'paper', items: [{...T('가'.repeat(900), 50, 50, 80, 3), layout: 'slide'}]})];
  const clipped = editContext(long, [0]);
  assert.equal(Array.from(clipped.request.slides[0].items[0].text).length, EDIT_LIMITS.text + 1);
  assert.equal(clipped.locked('p1.1'), true);
  const busy = [cleanDesign({bg: 'paper', items: [T('제목', 50, 15, 80, 5), ...Array.from({length: 20}, (_, k) => S('circle', 5 + k * 4, 80, 2, 3.5)), T('본문', 50, 50, 80, 3)]})];
  const few = editContext(busy, [0], {limits: {...EDIT_LIMITS, items: 5}});
  assert.deepEqual(few.request.slides[0].items.map(it => it.role), ['title', 'deco', 'deco', 'deco', 'body']);
  assert.equal(few.cut.items, 17);
  assert.equal(few.keyOf(0, 21), 'p1.22', 'keys follow the place of the piece, not the order sent');
  const small = editContext(many, [0, 1, 2], {limits: {...EDIT_LIMITS, bytes: 420}});
  assert.ok(small.picks.length < 3 && small.picks.length >= 1 && small.cut.slides >= 1);
});

test('an answer is checked: unknown instructions, keys that were not sent and unknown effects are dropped', () => {
  const slides = deck(), ctx = editContext(slides, [0]);
  const {say, ops, dropped} = checkEdits({say: '  숫자가 주인공이라   쿵 찍었어요. ', ops: [
    {op: 'text', item: 'p1.8', text: '비슷한 것은 있지만, 다른 점이 분명하게', why: '짧게'},
    {op: 'mark', item: 'p1.8', words: ['다른 점', '다른 점', '', 7]},
    {op: 'move', item: 'p1.4', an: 'stomp', dl: 1.54, why: '숫자는 쿵'},
    {op: 'move', item: 'p1.5', lp: 'blink', aw: 'yes'},
    {op: 'slide', slide: 'p1', tr: 'pushup', notes: '손을 들어 물어봅니다.', topic: '  1부 · 지도  '},
    {op: 'move', item: 'p1.4', an: 'teleport'},
    {op: 'move', item: 'p2.1', an: 'fade'},
    {op: 'text', item: 'p1.9', text: '잠긴 글 바꾸기'},
    {op: 'text', item: 'p1.2', text: '   '},
    {op: 'delete', item: 'p1.2'},
    {op: 'slide', slide: 'p1', tr: 'warp'},
    {op: 'slide', slide: 'p1.2', tr: 'fade'},
    'nonsense', null,
    {op: 'move', item: 'p1.2', dl: 99, sp: 'slow', em: 'pulse', ex: 'fade', an: null},
  ]}, ctx, {slides});
  assert.equal(say, '숫자가 주인공이라 쿵 찍었어요.');
  assert.deepEqual(ops, [
    {op: 'text', item: 'p1.8', text: '비슷한 것은 있지만, 다른 점이 분명하게', why: '짧게'},
    {op: 'mark', item: 'p1.8', words: ['다른 점']},
    {op: 'move', item: 'p1.4', an: 'stomp', dl: 1.5, why: '숫자는 쿵'},
    {op: 'move', item: 'p1.5', lp: 'blink'},
    {op: 'slide', slide: 'p1', tr: 'pushup', topic: '1부 · 지도', notes: '손을 들어 물어봅니다.'},
    {op: 'move', item: 'p1.2', an: null, em: 'pulse', ex: 'fade', sp: 'slow', dl: 10},
  ]);
  assert.equal(dropped.length, 9);
  assert.deepEqual(checkEdits({ops: 'x'}, ctx), {say: '', ops: [], dropped: []});
});

test('instructions apply to a copy; the result says what changed in plain words and undo data stays whole', () => {
  const slides = deck(), ctx = editContext(slides, [0, 1]);
  const before = JSON.stringify(slides);
  const {ops} = checkEdits({ops: [
    {op: 'text', item: 'p1.8', text: '비슷한 것은 있지만, 다른 점이 분명하게', why: '짧게'},
    {op: 'mark', item: 'p1.8', words: ['다른 점', '없는 낱말']},
    {op: 'move', item: 'p1.4', an: 'stomp', dl: 1.5, why: '숫자는 쿵'},
    {op: 'move', item: 'p1.5', lp: 'blink'},
    {op: 'slide', slide: 'p1', tr: 'pushup', notes: '손을 들어 물어봅니다.'},
    {op: 'slide', slide: 'p2', tr: 'zoomblur'},
    {op: 'move', item: 'p2.2', an: 'mask', aw: true},
  ]}, ctx, {slides});
  const done = applyEdits(slides, ops, ctx);
  assert.equal(JSON.stringify(slides), before, 'the deck given is not touched');
  assert.equal(done.slides[2], slides[2], 'slides without changes are the same objects');
  const [one, two] = done.slides;
  assert.equal(one.items[7].text, '비슷한 것은 있지만, 다른 점이 분명하게');
  assert.deepEqual(one.items[7].runs, [{s: 12, e: 16, c: '#d9480f'}]);
  assert.deepEqual([one.items[3].an, one.items[3].dl, one.items[4].lp, one.tr, one.notes], ['stomp', 1.5, 'blink', 'pushup', '손을 들어 물어봅니다.']);
  assert.deepEqual([two.tr, two.items[1].an, two.items[1].aw], ['zoomblur', 'mask', true]);
  assert.deepEqual(done.changes.map(c => c.index), [0, 1]);
  assert.deepEqual(done.changes[0].lines.map(l => l.text), [
    '글: "비슷한 것은 있지만, 내 것만의 다른 점이 분명해야…" → "비슷한 것은 있지만, 다른 점이 분명하게"',
    '강조: "다른 점"',
    '"40 ~ 70%": 나타나기 ‘쿵 찍기’ · 1.5초 늦게',
    '도형: 화살표: 계속 ‘반짝반짝’',
    '전환: 위로 밀기 · 발표자 노트: "손을 들어 물어봅니다."',
  ]);
  assert.equal(done.changes[0].lines[0].why, '짧게');
  assert.equal(done.count, 7);
  for (const s of done.slides) assert.deepEqual(cleanDesign(s), s, 'every slide is still a valid design as saved');
  // Choosing only some of the lines.
  const part = applyEdits(slides, ops, ctx, {skip: new Set([0, 1, 4, 5, 6])});
  assert.deepEqual(part.changes.map(c => c.lines.map(l => l.op)), [[2, 3]]);
  assert.equal(part.slides[0].items[7].text, slides[0].items[7].text);
  // Nothing to change: no slide is replaced.
  const same = applyEdits(done.slides, ops, editContext(done.slides, [0, 1]));
  assert.equal(same.count, 0);
  assert.deepEqual(same.slides, done.slides);
});

test('a slide edited while waiting is left alone; activity slides keep their pieces; too many loops are trimmed', () => {
  const slides = deck(), ctx = editContext(slides, [0, 1]);
  const ops = checkEdits({ops: [{op: 'move', item: 'p1.4', an: 'stomp'}, {op: 'move', item: 'p2.2', an: 'mask'}]}, ctx, {slides}).ops;
  const later = slides.slice();
  later[0] = {...slides[0], notes: '그 사이 고친 노트'};
  const done = applyEdits(later, ops, ctx);
  assert.deepEqual(done.stale, [0]);
  assert.deepEqual(done.changes.map(c => c.index), [1]);
  assert.equal(done.slides[0], later[0]);

  const quiz = [{bg: 'paper', activity: {kind: 'quiz'}, items: [T('문제', 50, 30, 80, 5), T('보기', 50, 60, 80, 3)]}];
  const qctx = editContext(quiz, [0]);
  assert.equal(qctx.request.slides[0].kind, 'quiz');
  const checked = checkEdits({ops: [{op: 'text', item: 'p1.1', text: '바꾼 문제'}, {op: 'move', item: 'p1.2', an: 'pop'}, {op: 'slide', slide: 'p1', tr: 'flip', notes: '20초'}]}, qctx, {slides: quiz});
  assert.deepEqual(checked.ops, [{op: 'slide', slide: 'p1', tr: 'flip', notes: '20초'}]);
  const wall = [{bg: 'paper', activity: {kind: 'wall'}, items: [T('gbe.ai.kr/w', 50, 40, 80, 6), T('123 456', 50, 60, 40, 8)]}];
  const wctx = editContext(wall, [0]);
  assert.deepEqual(checkEdits({ops: [{op: 'text', item: 'p1.2', text: '999 999'}, {op: 'move', item: 'p1.2', an: 'stomp'}]}, wctx, {slides: wall}).ops, [{op: 'move', item: 'p1.2', an: 'stomp'}]);

  const dots = [cleanDesign({bg: 'paper', items: Array.from({length: 12}, (_, k) => S('star', 6 + k * 7, 50, 4, 7))})];
  const dctx = editContext(dots, [0]);
  const loops = checkEdits({ops: dots[0].items.map((_, k) => ({op: 'move', item: `p1.${k + 1}`, lp: 'breathe', an: 'pop'}))}, dctx, {slides: dots}).ops;
  const trimmed = applyEdits(dots, loops, dctx);
  assert.equal(trimmed.slides[0].items.filter(it => it.lp).length, EDIT_LIMITS.idles);
  assert.equal(trimmed.slides[0].items.filter(it => it.an === 'pop').length, 12, 'only the loop is trimmed, the entrance stays');
  assert.equal(trimmed.dropped.length, 1);
  assert.ok(trimmed.changes[0].lines.at(-1).text.endsWith('나타나기 ‘튀어나오기’'));
  assert.equal(applyEdits(dots, loops, dctx, {limits: LOCAL_LIMITS}).slides[0].items.filter(it => it.lp).length, EDIT_LIMITS.idles, 'work done on the device keeps the same calm');
});

test('changing a text keeps the marked words that are still there; clearing motion removes the fields', () => {
  const slides = [cleanDesign({bg: 'navy', pa: 'kinetic', tr: 'fade', topic: '옛 주제', items: [
    {...T('질문은 사람이, 만들기는 AI와', 50, 20, 86, 4.4, {color: '#ffffff'}), runs: [{s: 0, e: 2, c: '#ffd43b'}, {s: 13, e: 15, c: '#ffd43b'}], an: 'blur', dl: 0.4, lp: 'float', aw: true},
    T('둘째 글', 50, 60, 80, 3, {color: '#ffffff'}),
  ]})];
  const ctx = editContext(slides, [0]);
  const ops = checkEdits({ops: [
    {op: 'text', item: 'p1.1', text: '질문은 사람이 합니다'},
    {op: 'move', item: 'p1.1', an: null, lp: 'none', dl: null, aw: false},
    {op: 'mark', item: 'p1.2', words: ['둘째']},
    {op: 'slide', slide: 'p1', tr: null, pa: null, topic: '', notes: ''},
  ]}, ctx, {slides}).ops;
  const [one] = applyEdits(slides, ops, ctx).slides;
  assert.deepEqual(one.items[0].runs, [{s: 0, e: 2, c: '#ffd43b'}], 'the word that is gone loses its colour');
  assert.deepEqual([one.items[0].an, one.items[0].lp, one.items[0].dl, one.items[0].aw], [undefined, 'none', undefined, undefined]);
  assert.deepEqual(one.items[1].runs, [{s: 0, e: 2, c: '#ffd43b'}], 'a new mark follows the accent already used on the slide');
  assert.deepEqual([one.tr, one.pa, one.topic], [undefined, undefined, undefined]);
  assert.deepEqual(cleanDesign(one), one);
});

test('one instruction can move a row of pieces in turn', () => {
  const slides = deck(), ctx = editContext(slides, [0]);
  const {ops, dropped} = checkEdits({ops: [{op: 'move', items: ['p1.6', 'p1.7', 'p9.9'], an: 'left', dl: 0.3, step: 0.25, why: '사진을 차례로'}, {op: 'move', items: ['p1.4', 'p1.5'], lp: 'breathe'}]}, ctx, {slides});
  assert.deepEqual(ops, [
    {op: 'move', item: 'p1.6', an: 'left', dl: 0.3, why: '사진을 차례로'},
    {op: 'move', item: 'p1.7', an: 'left', dl: 0.6, why: '사진을 차례로'},
    {op: 'move', item: 'p1.4', lp: 'breathe'},
    {op: 'move', item: 'p1.5', lp: 'breathe'},
  ]);
  assert.equal(dropped.length, 1);
});

test('the catalogue lists every effect name the editor knows', () => {
  const c = motionCatalog();
  assert.deepEqual(Object.keys(c), ['enter', 'idle', 'emphasis', 'exit', 'transition', 'combo']);
  assert.ok(c.enter.some(([id, name]) => id === 'stomp' && name === '쿵 찍기'));
  assert.ok(c.transition.some(([id]) => id === 'zoomblur') && c.idle.some(([id]) => id === 'blink') && c.combo.every(row => row.length === 3));
  assert.ok(JSON.stringify(c).length < 4000);
});
