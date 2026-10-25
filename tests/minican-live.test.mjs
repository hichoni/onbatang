// 움직이는 바탕(src/live.js)의 저장 모양: 아는 스타일의 이름만 남기고, 장의 이름표에서 늘 같은 씨앗을 만든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVES, LIVE_GROUPS, LIVE_STILL, cleanLive, designLive, liveSeed } from '../src/live.js';
import { cleanDesign } from '../src/model.js';

test('스타일 목록 · 정리 · 씨앗', () => {
  assert.equal(LIVES.length, 25);
  assert.equal(new Set(LIVES.map((s) => s.id)).size, 25, 'ids are unique');
  // 고르는 칸의 묶음: 모든 스타일이 꼭 한 묶음에 든다.
  const grouped = LIVE_GROUPS.flatMap((g) => g.ids);
  assert.deepEqual([...grouped].sort(), LIVES.map((s) => s.id).sort());
  assert.ok(LIVES.every((s) => LIVE_GROUPS.some((g) => g.id === s.group && g.ids.includes(s.id))));
  for (const s of LIVES) { assert.match(s.id, /^[a-z]+$/); assert.ok(s.name && s.hint); assert.match(s.bg, /^#[0-9a-f]{6}$/); }
  assert.ok(LIVE_STILL > 0);
  assert.deepEqual(cleanLive({ id: 'stars', extra: '<x>' }), { id: 'stars' });
  assert.deepEqual(cleanLive('chalk'), { id: 'chalk' });
  for (const bad of [null, {}, { id: 'nope' }, 'javascript:x', 3]) assert.equal(cleanLive(bad), null);
  assert.deepEqual(designLive({ live: { id: 'waves' } }), { live: { id: 'waves' } });
  assert.deepEqual(designLive({ live: { id: 'x' } }), {});
  assert.equal(liveSeed('p123'), liveSeed('p123'));
  assert.notEqual(liveSeed('p123'), liveSeed('p124'));
  assert.deepEqual(cleanDesign({ items: [], live: { id: 'aurora', speed: 9 } }).live, { id: 'aurora' });
  assert.equal('live' in cleanDesign({ items: [] }), false);
});

test('글자 효과: 바탕마다 하나 + 어느 장에나 쓰는 것 · 고르기 · 끄기 · 시간만으로 정해진다 · 영상은 글을 제 칸에 그린다', async () => {
  const { liveLook, liveLookName, lookAt, lookShadows, lookReach, slideLook, cleanLook, lookById, TEXT_LOOKS, LOOK_GROUPS, LOOK_NONE } = await import('../src/live.js');
  const { filmCells } = await import('../src/film.js');
  // 고르는 칸: 바탕 25가지마다 하나 + 어느 장에나 어울리는 12가지. 모든 효과가 꼭 한 묶음에 든다.
  assert.equal(TEXT_LOOKS.length, 37);
  assert.equal(new Set(TEXT_LOOKS.map((l) => l.id)).size, 37);
  assert.deepEqual(LOOK_GROUPS.flatMap((g) => g.ids).sort(), TEXT_LOOKS.map((l) => l.id).sort());
  for (const s of LIVES) assert.equal(liveLook({ id: s.id })?.id, s.id, `${s.id} has a matching look`);
  for (const l of TEXT_LOOKS) {
    const look = lookById(l.id);
    assert.ok(l.name && liveLookName(l.id) === l.name);
    assert.ok(look.pals.length || look.shades.length || look.bob || look.sway || look.shake, `${l.id} does something`);
    assert.ok(lookReach(look) > 0 && lookReach(look) < 2, `${l.id} reach`);
  }
  // 저장 값: 아는 효과 · 'none' 만. 고른 효과가 바탕보다 먼저고, 바탕이 없는 장에도 쓴다.
  assert.equal(cleanLook('fire'), 'fire'); assert.equal(cleanLook(LOOK_NONE), 'none');
  for (const bad of ['nope', 3, null, 'constructor', '__proto__']) assert.equal(cleanLook(bad), null);
  assert.deepEqual(cleanDesign({ items: [], look: 'rainbow' }).look, 'rainbow');
  assert.equal('look' in cleanDesign({ items: [], look: 'x' }), false);
  assert.deepEqual(designLive({ live: { id: 'stars' }, look: 'none' }), { live: { id: 'stars' }, look: 'none' });
  assert.equal(slideLook({ live: { id: 'stars' } }).id, 'stars');
  assert.equal(slideLook({ live: { id: 'stars' }, look: 'gold' }).id, 'gold');
  assert.equal(slideLook({ look: 'gold' }).id, 'gold');
  assert.equal(slideLook({ live: { id: 'stars' }, look: 'none' }), null);
  assert.equal(slideLook({ items: [] }), null);
  // 옛 장: 바탕에서 끈 것(live.text: false)은 그대로 꺼져 있다.
  assert.deepEqual(cleanLive({ id: 'stars', text: false }), { id: 'stars', text: false });
  assert.equal(slideLook({ live: { id: 'stars', text: false } }), null);
  // 같은 때 · 같은 글이면 같은 값. 그림 · PDF(move: false)는 자리를 옮기지 않는다.
  const waves = lookById('waves'), neon = lookById('synthwave'), bow = lookById('rainbow');
  assert.deepEqual(lookAt(neon, 2.5, 1), lookAt(neon, 2.5, 1));
  assert.notDeepEqual(lookAt(waves, 1, 0), lookAt(waves, 2, 0), 'it moves');
  assert.deepEqual([lookAt(waves, 1, 0, { move: false }).dx, lookAt(waves, 1, 0, { move: false }).dy], [0, 0]);
  const at = lookAt(neon, LIVE_STILL, 0);
  assert.ok(at.w[0] + at.w[1] > 0.5, 'the neon is lit');
  // 무지개: 여섯 빛깔이 차례로 넘어간다(한때에 많아야 둘이 켜진다).
  const lit = [0, 1.1, 2.2, 3.3, 4.4, 5.5].map((t) => lookAt(bow, t + 0.01, 0).w.findIndex((v) => v > 0.5));
  assert.deepEqual(lit, [0, 1, 2, 3, 4, 5]);
  assert.ok(lookAt(bow, 2.7, 0).w.filter((v) => v > 0).length <= 2);
  // 통통: 늘 위로만 튄다.
  assert.ok([0.1, 0.3, 0.6, 0.8].every((t) => lookAt(lookById('bounce'), t, 0).dy <= 0));
  const shadows = lookShadows(neon, at);
  assert.ok(shadows.length >= 3 && shadows.every((x) => /^-?[\d.]+em -?[\d.]+em [\d.]+em rgba\(\d+, \d+, \d+, [\d.]+\)$/.test(x)), shadows.join(' | '));
  assert.equal(lookShadows(lookById('longshadow'), lookAt(lookById('longshadow'), 1)).length, 10);
  assert.equal(lookShadows(null, at).length, 0);
  // 영상: 효과가 켜진 장의 글은 하나씩 제 칸이고(프레임마다 효과를 입힌다), 끈 장의 글은 가만히 있는 묶음에 든다. 바탕이 없는 장도 같다.
  const items = [{ t: 'shape', x: 50, y: 50, w: 20, h: 20 }, { t: 'text', x: 50, y: 30, w: 60, size: 8 }, { t: 'text', x: 50, y: 70, w: 60, size: 4 }];
  const boxes = items.map(() => ({ x: 100, y: 100, w: 200, h: 80 }));
  const live = filmCells({ items, live: { id: 'stars' } }, {}, boxes, 1280, 720);
  assert.deepEqual(live.map((c) => c.i), [-1, -1, 1, 2]);
  assert.deepEqual(filmCells({ items, live: { id: 'stars' }, look: 'none' }, {}, boxes, 1280, 720).map((c) => c.items), [[], [0, 1, 2]]);
  assert.deepEqual(filmCells({ items, look: 'fire' }, {}, boxes, 1280, 720).map((c) => c.i), [-1, 1, 2]);
  assert.deepEqual(filmCells({ items }, {}, boxes, 1280, 720).map((c) => c.items), [[0, 1, 2]]);
  // 빛이 퍼지는 만큼 글의 칸이 넓다.
  assert.ok(live[2].box.w - 200 >= 2 * Math.ceil(0.08 * 1280 * 0.25));
});

test('글상자마다 글자 효과: 고른 것이 장의 효과보다 먼저 · 없음은 그 글만 · 영상은 효과가 있는 글만 제 칸', async () => {
  const { itemLook, itemLooks, lookById, lookReach } = await import('../src/live.js');
  const { filmCells } = await import('../src/film.js');
  const { styleOf } = await import('../src/model.js');
  const text = (lk, y) => ({ t: 'text', text: '글', x: 50, y, w: 60, size: 8, ...(lk === undefined ? {} : { lk }) });
  // 저장: 아는 효과 · 'none' 만 남고, 글이 아닌 요소에는 붙지 않는다.
  const d = cleanDesign({ look: 'gold', items: [text('fire', 20), text('none', 40), text(undefined, 60), text('nope', 70), { t: 'shape', x: 50, y: 50, w: 10, h: 10, lk: 'fire' }] });
  assert.deepEqual(d.items.map((it) => it.lk), ['fire', 'none', undefined, undefined, undefined]);
  // 고른 것 → 없음 → 장의 효과(황금빛).
  assert.deepEqual(itemLooks(d).map((l) => l?.id ?? null), ['fire', null, 'gold', 'gold', null]);
  assert.equal(itemLook({ t: 'text', lk: 'ice' }, null).id, 'ice');
  assert.equal(itemLook({ t: 'text' }, lookById('gold')).id, 'gold');
  assert.equal(itemLook({ t: 'shape', lk: 'ice' }, lookById('gold')), null);
  // 장의 효과가 없어도 고른 글상자에는 효과가 있다.
  assert.deepEqual(itemLooks(cleanDesign({ items: [text('pop', 30), text(undefined, 60)] })).map((l) => l?.id ?? null), ['pop', null]);
  // 서식 복사에 글자 효과도 실린다.
  assert.equal(styleOf(d.items[0]).values.lk, 'fire');
  // 영상: 효과가 있는 글만 제 칸이고, 칸은 그 글의 효과가 퍼지는 만큼 넓다(황금빛 > 덜덜 떨기).
  const items = [text('gold', 30), text(undefined, 50), text('shake', 70)];
  const boxes = items.map(() => ({ x: 100, y: 100, w: 200, h: 80 }));
  const cells = filmCells({ items }, {}, boxes, 1280, 720);
  assert.deepEqual(cells.map((c) => [c.i, c.items]), [[-1, []], [0, [0]], [-1, [1]], [2, [2]]]);
  assert.ok(lookReach(lookById('gold')) > lookReach(lookById('shake')));
  assert.ok(cells[1].box.w > cells[3].box.w, 'the wide glow gets more room');
});

test('나타나는 움직임: 효과마다 하나 · 시간만으로 정해진다 · 끝나면 제 모습 · 따로 나타나는 글은 자리를 옮기지 않는다', async () => {
  const { TEXT_LOOKS, lookById, lookIntro, introAt, lookAt, lookShadows } = await import('../src/live.js');
  const kinds = new Set();
  for (const l of TEXT_LOOKS) {
    const look = lookById(l.id), intro = lookIntro(look);
    assert.ok(intro && intro.name && intro.ms >= 600 && intro.ms <= 1500, `${l.id} has an intro`);
    kinds.add(intro.id);
    // 끝나면 없다(다 나온 모습 = 그림 · PDF 의 모습).
    assert.equal(introAt(look, intro.ms / 1000 + 0.01), null);
    assert.equal(introAt(look, Infinity), null);
    assert.deepEqual(lookAt(look, 3, 0, { u: 9 }), lookAt(look, 3, 0));
    // 같은 때면 같은 모습.
    assert.deepEqual(introAt(look, 0.37), introAt(look, 0.37));
  }
  assert.equal(kinds.size, 12, [...kinds].join());
  // 피어나기: 처음엔 흐릿하고(투명 · 흐림) 끝으로 갈수록 또렷하다.
  const gold = lookById('gold');
  assert.ok(lookAt(gold, 0, 0, { u: 0.02 }).alpha < 0.2 && lookAt(gold, 0, 0, { u: 0.02 }).blur > 0.15);
  assert.ok(lookAt(gold, 1, 0, { u: 1 }).alpha > 0.95);
  // 네온: 켜지기 전엔 꺼진 모습(빛 0).
  const neon = lookAt(lookById('synthwave'), 0, 0, { u: 0 });
  assert.ok(neon.alpha < 0.2 && neon.w.every((v) => v === 0));
  // 떨어져 튀기: 위에서 떨어진다. 따로 나타나기 효과가 있는 글(plain)은 자리를 옮기지 않는다.
  assert.ok(lookAt(lookById('bounce'), 0, 0, { u: 0.05 }).dy < -0.9);
  assert.ok(lookAt(lookById('bounce'), 0, 0, { u: 0.05, plain: true }).dy > -0.2);
  // 쾅 찍기: 크게서 찍힌다(plain 이면 크기는 그 효과에 맡긴다).
  assert.ok(lookAt(lookById('pop'), 0, 0, { u: 0.02 }).scale > 1.3);
  assert.equal(lookAt(lookById('pop'), 0, 0, { u: 0.02, plain: true }).scale, 1);
  // 고르는 중인 글(move: false)도 나타나는 움직임은 보인다.
  assert.ok(lookAt(lookById('pop'), 0, 0, { u: 0.02, move: false }).scale > 1.3);
  // 그림자 뻗기: 그림자의 길이가 0 에서 끝까지 자란다.
  const ls = lookById('longshadow');
  const lens = [0.05, 0.5, 2].map((u) => Number(/^([\d.]+)em/.exec(lookShadows(ls, lookAt(ls, 0, 0, { u })).at(-1))[1]));
  assert.ok(lens[0] < 0.02 && lens[1] > lens[0] && Math.abs(lens[2] - 0.25) < 1e-9, lens.join());
  // 무지개 훑기: 한 바퀴를 앞서 돌고 끝나므로, 끝난 뒤 빛깔이 튀지 않는다.
  const bow = lookById('rainbow'), d = lookIntro(bow).ms / 1000;
  assert.deepEqual(lookAt(bow, d + 0.2, 0, { u: d - 0.0001 }).w.map((v) => Math.round(v * 10)), lookAt(bow, d + 0.2, 0, { u: d + 0.001 }).w.map((v) => Math.round(v * 10)));
});

test('사라지는 움직임: 효과마다 짝 · 끝나면 보이지 않음 · 나타나는 움직임보다 먼저 · 장마다 끄기 · 영상은 다음 장이 있을 때만', async () => {
  const { TEXT_LOOKS, lookById, lookIntro, lookOutro, outroAt, lookAt, LOOK_OUT_MS } = await import('../src/live.js');
  const { filmPlan } = await import('../src/film.js');
  const kinds = new Set();
  for (const l of TEXT_LOOKS) {
    const look = lookById(l.id), out = lookOutro(look);
    assert.ok(out && out.name && out.ms >= 400 && out.ms <= LOOK_OUT_MS, `${l.id} has an outro`);
    kinds.add(out.id);
    assert.equal(outroAt(look, -0.01), null, 'not before it starts');
    assert.equal(outroAt(look, out.ms / 1000 + 0.01).alpha, 0, 'gone after it ends');
    assert.equal(lookAt(look, 3, 0, { out: 5 }).alpha, 0);
    assert.deepEqual(outroAt(look, 0.33), outroAt(look, 0.33));
  }
  assert.equal(kinds.size, 12);
  assert.ok(new Set(TEXT_LOOKS.map((l) => `${lookIntro(lookById(l.id)).id}>${lookOutro(lookById(l.id)).id}`)).size === 12, 'each intro has one outro');
  // 튀어 올라 사라지기: 위로 올라간다. 사라질 때는 따로 나타나기 효과가 있어도(plain) 자리를 옮긴다. 나타나는 중에 넘겨도 사라지기가 먼저다.
  const bounce = lookById('bounce');
  assert.ok(lookAt(bounce, 0, 0, { out: 0.6 }).dy < -0.6);
  assert.ok(lookAt(bounce, 0, 0, { out: 0.6, plain: true }).dy < -0.6);
  assert.ok(lookAt(bounce, 0, 0, { u: 0.05, out: 0.6 }).dy < -0.6);
  assert.equal(lookAt(lookById('pop'), 0, 0, { out: 0.55 }).scale > 1.2, true, 'lifted up');
  // 장마다 끄기(lkin · lkout)는 끈 것만 남는다.
  assert.deepEqual([cleanDesign({ items: [], lkin: false, lkout: false }).lkin, cleanDesign({ items: [], lkin: false, lkout: false }).lkout], [false, false]);
  assert.equal('lkin' in cleanDesign({ items: [], lkin: true }), false);
  // 영상: 다음 장이 있고 이어 움직이기 전환이 아니며 끄지 않은 장만 사라지는 움직임을 한다(마지막 장은 그대로 끝난다).
  const page = (id, extra = {}) => cleanDesign({ id, items: [{ id: `${id}e`, t: 'text', text: '글', x: 50, y: 50, w: 50, size: 6, lk: 'gold' }], ...extra });
  const plan = filmPlan([page('pout00001'), page('pout00002', { tr: 'move' }), page('pout00003', { lkout: false }), page('pout00004'), page('pout00005')]);
  assert.deepEqual(plan.slides.map((s) => s.leave), [false, true, false, true, false]);
  assert.equal(JSON.stringify(plan.slides[0]).includes('leave'), false, 'not part of the plan JSON');
});
