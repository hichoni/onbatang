// 움직이는 바탕(src/live.js)의 저장 모양: 아는 스타일의 이름만 남기고, 장의 이름표에서 늘 같은 씨앗을 만든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVES, LIVE_STILL, cleanLive, designLive, liveSeed } from '../src/live.js';
import { cleanDesign } from '../src/model.js';

test('스타일 목록 · 정리 · 씨앗', () => {
  assert.equal(LIVES.length, 12);
  assert.equal(new Set(LIVES.map((s) => s.id)).size, 12, 'ids are unique');
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
