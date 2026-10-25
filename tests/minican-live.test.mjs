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
