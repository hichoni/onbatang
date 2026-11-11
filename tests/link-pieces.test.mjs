// 큰 그림은 조각 파트로 나눠 링크에 싣고, 받는 쪽이 다시 한 그림으로 잇는다(app/copy-link.js pieceRanges · splitParts · joinParts).
// 링크 서버는 큰 파트 하나를 아주 느리게 받는다(운영: 5MB 0.5초, 25MB 시간 초과)라서 그림 하나를 약 4MB 조각으로 올린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PART_TARGET_BYTES, GUEST_MAX_PARTS, GUEST_PART_MAX_BYTES, pieceRanges, splitParts, joinParts, guestRecords, createGuestLinks, createCopyIntake } from '../app/copy-link.js';

const bytes = (v) => new TextEncoder().encode(JSON.stringify(v)).length;
// 장마다 사진 하나(base64 글자 size 개)
const photo = (size, seed = 0) => 'data:image/jpeg;base64,' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.repeat(Math.ceil(size / 64) + 1).slice(seed % 64, (seed % 64) + size);
const design = (id, slides, size) => ({ id, name: `그림 ${id}`, ratio: '16:9', updatedAt: 1, slides: Array.from({ length: slides }, (_, i) => ({ id: `p${id}${i}`, bg: 'paper', items: [{ id: `e${id}${i}`, t: 'image', x: 1, y: 1, w: 10, h: 10, url: photo(size, i) }] })) });

test('a small drawing stays one part, without a piece mark', () => {
  const small = design('d01', 3, 1000);
  assert.deepEqual(splitParts([small]), [small]);
  assert.deepEqual(joinParts([small]), [small]);
});

test('a 14MB drawing goes as parts of about 4MB and comes back the same, in order', () => {
  const big = design('d02', 40, 350000);                      // 약 14MB · 40장
  assert.ok(bytes(big) > 13e6 && bytes(big) < 15e6, String(bytes(big)));
  const parts = splitParts([big]);
  assert.equal(parts.length, 4);
  for (const [i, part] of parts.entries()) {
    assert.deepEqual(part.piece, { i, n: parts.length });
    assert.equal(part.id, big.id); assert.equal(part.name, big.name);
    assert.ok(part.slides.length >= 1);
    assert.ok(bytes(part) <= PART_TARGET_BYTES, `part ${i}: ${bytes(part)}`);
  }
  assert.equal(parts.reduce((n, p) => n + p.slides.length, 0), 40);
  assert.deepEqual(joinParts(parts), [big]);
});

test('drawings next to each other keep apart; a slide bigger than the goal is a part of its own', () => {
  const a = design('d03', 2, 1000), b = design('d04', 12, 1000000), c = design('d05', 1, 9000000), d = design('d06', 3, 1000);
  b.slides[5].items[0].url = photo(6000000, 5);               // 장 하나가 목표(4MB)보다 크다
  const parts = splitParts([a, b, c, d]);
  // d04: 1MB 장 셋씩 묶다가 6MB 장(5번)은 혼자 간다. d05 는 장이 하나뿐이라 9MB여도 나누지 않는다.
  assert.deepEqual(parts.map((p) => [p.id, p.piece ? `${p.piece.i}/${p.piece.n}` : '-', p.slides.map((s) => s.id.slice(4)).join(',')]), [
    ['d03', '-', '0,1'], ['d04', '0/5', '0,1,2'], ['d04', '1/5', '3,4'], ['d04', '2/5', '5'], ['d04', '3/5', '6,7,8'], ['d04', '4/5', '9,10,11'], ['d05', '-', '0'], ['d06', '-', '0,1,2']]);
  assert.deepEqual(joinParts(parts), [a, b, c, d]);
});

test('when the parts would be too many, the pieces grow instead (up to the part cap)', () => {
  const big = design('d07', 60, 900000), others = Array.from({ length: 12 }, (_, i) => design(`e${i}`, 1, 1000));   // 약 54MB + 작은 그림 12개
  assert.equal(pieceRanges([big, ...others]).length, 15 + 12, '4MB 조각이면 파트 27개');
  const ranges = pieceRanges([big, ...others], { maxParts: GUEST_MAX_PARTS, cap: GUEST_PART_MAX_BYTES });
  assert.ok(ranges.length <= GUEST_MAX_PARTS && ranges.filter((r) => r.r === 0).length > 1, String(ranges.length));
  assert.ok(ranges.every((r) => r.bytes <= GUEST_PART_MAX_BYTES));
  const parts = splitParts([big, ...others], { maxParts: GUEST_MAX_PARTS, cap: GUEST_PART_MAX_BYTES });
  assert.ok(parts.every((p) => bytes(p) <= GUEST_PART_MAX_BYTES));
  assert.deepEqual(joinParts(parts), [big, ...others]);
});

test('joining tolerates parts that are not pieces and does not glue two different drawings', () => {
  const x = { id: 'dx', slides: [{ id: 's1' }], piece: { i: 0, n: 2 } }, y = { id: 'dx', slides: [{ id: 's2' }], piece: { i: 1, n: 2 } };
  const z = { id: 'dz', slides: [{ id: 's3' }], piece: { i: 1, n: 2 } };   // 앞 조각이 없는 조각
  assert.deepEqual(joinParts([x, y, z]), [{ id: 'dx', slides: [{ id: 's1' }, { id: 's2' }] }, { id: 'dz', slides: [{ id: 's3' }] }]);
  assert.deepEqual(joinParts([null, { id: 'dy', slides: [] }]), [null, { id: 'dy', slides: [] }]);
});

test('guestRecords gives the parts to send and says big only when one slide is over the part cap', () => {
  const plain = guestRecords([{ ...design('d08', 20, 400000), uploads: [{ id: 'u' }] }]);
  assert.equal(plain.records[0].uploads, undefined);
  assert.equal(plain.parts.length, 3); assert.equal(plain.big, false);   // 8MB → 4MB 안쪽 조각 셋
  assert.ok(plain.bytes > 8e6);
  const huge = design('d09', 1, GUEST_PART_MAX_BYTES + 1000);
  assert.equal(guestRecords([huge]).big, true);
});

test('a 7-day link sends a big drawing as pieces and the taker gets one drawing back', async () => {
  const store = { parts: [], calls: [] };
  const fetch = async (url, init) => {
    const name = url.split('/').pop(), args = JSON.parse(init.body || '{}');
    store.calls.push([name, args.p_n ?? null, init.body.length]);
    const ok = (body) => ({ ok: true, json: async () => body });
    if (name === 'onbatang_guest_copy_publish') { store.parts = Array(args.p_parts); return ok({ code: '0123456789ab', token: 't', version: 1, parts: args.p_parts }); }
    if (name === 'onbatang_guest_copy_put') { store.parts[args.p_n] = JSON.parse(JSON.stringify(args.p_record)); return ok({ code: '0123456789ab', version: 1 }); }
    if (name === 'onbatang_copy_info') return ok({ title: '큰 자료', parts: store.parts.length, version: 1, mode: 'edit' });
    if (name === 'onbatang_copy_part') return ok(store.parts[args.p_n]);
    throw Error(name);
  };
  const big = design('d10', 30, 400000), small = design('d11', 2, 1000);   // 약 12MB + 작은 것
  const made = await createGuestLinks({ fetch, url: 'https://x' }).publish({ title: '큰 자료', records: [big, small] });
  assert.equal(made.code, '0123456789ab');
  const puts = store.calls.filter((c) => c[0] === 'onbatang_guest_copy_put');
  assert.equal(puts.length, 5, 'four pieces of the 12MB drawing and the small one');
  assert.ok(puts.every((c) => c[2] < PART_TARGET_BYTES + 1000), 'every request body stays near the goal');
  const got = await createCopyIntake({ fetch, url: 'https://x' }).take('0123456789ab');
  assert.deepEqual(got.records, [big, small]);
});
