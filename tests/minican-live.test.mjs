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

test('글자 효과: 스타일마다 하나 · 끌 수 있다 · 시간만으로 정해진다 · 영상은 글을 제 칸에 그린다', async () => {
  const { liveLook, liveLookName, lookAt, lookShadows, lookReach } = await import('../src/live.js');
  const { filmCells } = await import('../src/film.js');
  for (const s of LIVES) {
    const look = liveLook({ id: s.id });
    assert.ok(look && liveLookName(s.id), `${s.id} has a text look`);
    assert.ok(look.glow || look.shade, `${s.id} glows or shades`);
    assert.ok(lookReach(look) > 0 && lookReach(look) < 2);
  }
  // 끈 장: 저장 모양에 남고, 효과는 없다. 다른 값은 버린다.
  assert.deepEqual(cleanLive({ id: 'stars', text: false }), { id: 'stars', text: false });
  assert.deepEqual(cleanLive({ id: 'stars', text: 'off' }), { id: 'stars' });
  assert.deepEqual(cleanDesign({ items: [], live: { id: 'stars', text: false } }).live, { id: 'stars', text: false });
  assert.equal(liveLook({ id: 'stars', text: false }), null);
  assert.equal(liveLook(null), null);
  // 같은 때 · 같은 글이면 같은 값. 그림 · PDF(move: false)는 자리를 옮기지 않는다.
  const waves = liveLook({ id: 'waves' }), neon = liveLook({ id: 'synthwave' });
  assert.deepEqual(lookAt(neon, 2.5, 1), lookAt(neon, 2.5, 1));
  assert.notDeepEqual(lookAt(waves, 1, 0), lookAt(waves, 2, 0), 'it moves');
  assert.deepEqual({ ...lookAt(waves, 1, 0, { move: false }), a: 0, b: 0 }, { a: 0, b: 0, dx: 0, dy: 0 });
  const at = lookAt(neon, LIVE_STILL, 0);
  assert.ok(at.a + at.b > 0.5, 'the neon is lit');
  const shadows = lookShadows(neon, at);
  assert.ok(shadows.length >= 3 && shadows.every((x) => /^-?[\d.]+em -?[\d.]+em [\d.]+em rgba\(\d+, \d+, \d+, [\d.]+\)$/.test(x)), shadows.join(' | '));
  assert.equal(lookShadows(null, at).length, 0);
  // 영상: 효과가 켜진 장의 글은 하나씩 제 칸이고(프레임마다 빛을 입힌다), 끈 장의 글은 가만히 있는 묶음에 든다.
  const items = [{ t: 'shape', x: 50, y: 50, w: 20, h: 20 }, { t: 'text', x: 50, y: 30, w: 60, size: 8 }, { t: 'text', x: 50, y: 70, w: 60, size: 4 }];
  const boxes = items.map(() => ({ x: 100, y: 100, w: 200, h: 80 }));
  const lit = filmCells({ items, live: { id: 'stars' } }, {}, boxes, 1280, 720);
  assert.deepEqual(lit.map((c) => c.i), [-1, -1, 1, 2]);
  const plain = filmCells({ items, live: { id: 'stars', text: false } }, {}, boxes, 1280, 720);
  assert.deepEqual(plain.map((c) => c.items), [[], [0, 1, 2]]);
  // 빛이 퍼지는 만큼 글의 칸이 넓다.
  assert.ok(lit[2].box.w - 200 >= 2 * Math.ceil(0.08 * 1280 * 0.25));
});
