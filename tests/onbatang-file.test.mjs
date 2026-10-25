// 온바탕 파일(app/onbatang-file.js): 고친 그대로 담고 그대로 연다. 여러 파트 PPT · 사진 · 바탕 영상 · 움직임 · 글자 효과 · 노트 · 숨긴 장 · 활동까지
// 모든 칸이 한 글자도 다르지 않게 돌아오고, 깨진 파일 · 다른 파일 · 더 새 온바탕의 파일은 열지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { packOnbatang, readOnbatang, freshCopy, videoOwners, usedFonts, compareVersions, FILE_TYPE } from '../app/onbatang-file.js';
import { migrateRecord } from '../app/designs.js';
import { zipStore, zipBlob, readZip } from '../app/zip.js';
import { newPixelActivity } from '../src/pixel-art.js';

const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
// 한 PPT 를 나눠 담은 두 파트: 온바탕의 거의 모든 칸을 쓴다.
const part = (n, pages) => migrateRecord({
  id: `d${String(n).repeat(24)}`, name: `메이커 캠프 · ${n}`, ratio: '16:9', revision: 7, updatedAt: 1792900000000 + n,
  source: { kind: 'pptx', sourceDocumentId: 'dsource00000000000000001', filename: '메이커 캠프.pptx', pageNumber: 1 },
  uploads: [photo],
  slides: pages.map((p, i) => ({
    id: `p${n}page${i}0000000000000000`, bg: '#0b0d24', pa: 'pop', tr: 'morph', notes: `노트 ${n}-${i}\n둘째 줄`, topic: '도입', dur: 12, hidden: i === 1,
    live: { id: 'synthwave' }, look: 'gold', lkout: false,
    ...(i === 0 ? { video: { src: `vkey${n}00000`, dur: 9.5, in: 1, out: 8, vol: 0.4, fit: 'cover', auto: true } } : {}),
    ...(p.activity ? { activity: p.activity } : {}),
    items: [
      { id: `e${n}t${i}000000000000`, t: 'text', text: '굵게 보통', x: 50, y: 30, w: 60, size: 8, color: '#ffffff', stroke: '#000000', shadow: 2, lk: 'fire', lkem: true, lkloop: true,
        em: 'pulse', an: 'rise', dl: 0.3, sp: 1.2, runs: [{ s: 0, e: 2, b: true }], font: 'gothic', align: 'c', lh: 1.4 },
      { id: `e${n}i${i}000000000000`, t: 'image', url: photo, x: 20, y: 70, w: 20, h: 20, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, alt: '사진 설명' },
      { id: `e${n}s${i}000000000000`, t: 'shape', shape: 'rect', x: 80, y: 70, w: 10, h: 10, color: '#ff0000', rot: 15, op: 0.8 },
      { id: `e${n}l${i}000000000000`, t: 'link', from: `e${n}s${i}000000000000`, to: `e${n}i${i}000000000000`, head: 'end', curve: true, label: '이어요' },
      { id: `e${n}y${i}000000000000`, t: 'yt', yt: 'dQw4w9WgXcQ', x: 50, y: 50, w: 30, start: 5, end: 20, cc: true, loop: true, full: true },
    ],
  })),
});

test('an onbatang file brings every part, page, field and background video back exactly', async () => {
  const records = [part(1, [{ activity: newPixelActivity({ size: 8 }) }, {}]), part(2, [{}, {}, {}])];
  const videos = [
    { key: 'vkey100000', blob: new Blob([new Uint8Array(300000).map((_, i) => i % 251)], { type: 'video/mp4' }), seconds: 9.5, at: 1792800000000 },
    { key: 'vkey200000', blob: new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'video/webm' }), seconds: 2, at: 1792800000001 },
  ];
  const pageOrder = [records[1].slides[0].id, ...records[0].slides.map((p) => p.id), ...records[1].slides.slice(1).map((p) => p.id)];
  const fonts = [{ id: 'gai-poster', name: '학교안심 포스터', desc: '힘 있는 제목', exportFamily: 'Hakgyoansim Poster B', family: '', license: 'SIL OPEN FONT LICENSE Version 1.1', blob: new Blob([new Uint8Array([119, 79, 70, 50, 1, 2])], { type: 'font/woff2' }) }];
  const file = await packOnbatang({ title: '메이커 캠프', records, deck: { title: '메이커 캠프', pageOrder }, videos, fonts, app: '0.91.0', now: new Date('2026-10-25T10:00:00Z') });
  assert.equal(file.type, FILE_TYPE);
  const got = await readOnbatang(file, { app: '0.91.0' });
  assert.deepEqual(got.records, records, 'records are identical, field for field');
  assert.deepEqual(got.records.map(migrateRecord), records, 'and open to the same record');
  assert.deepEqual(got.deck, { title: '메이커 캠프', pageOrder });
  assert.equal(got.title, '메이커 캠프');
  assert.equal(got.videos.length, 2);
  for (const [i, v] of got.videos.entries()) {
    assert.equal(v.key, videos[i].key);
    assert.equal(v.blob.type, videos[i].blob.type);
    assert.equal(v.seconds, videos[i].seconds);
    assert.equal(v.at, videos[i].at);
    assert.deepEqual(new Uint8Array(await v.blob.arrayBuffer()), new Uint8Array(await videos[i].blob.arrayBuffer()));
  }
  assert.equal(got.fonts.length, 1);
  const { blob: fontBlob, ...fontMeta } = got.fonts[0], { blob: fontBlob0, ...fontMeta0 } = fonts[0];
  assert.deepEqual(fontMeta, fontMeta0);
  assert.deepEqual(new Uint8Array(await fontBlob.arrayBuffer()), new Uint8Array(await fontBlob0.arrayBuffer()));
  assert.equal(fontBlob.type, 'font/woff2');
  // 파일에서 온 글꼴 이름은 CSS 에 들어가므로 이상한 글자가 든 이름은 버린다
  const evil = await readOnbatang(await packOnbatang({ records: [records[0]], fonts: [{ ...fonts[0], family: 'x"; } body { display: none } @font-face { font-family: "y', exportFamily: 'A";}' }], app: '0.91.0' }));
  assert.equal(evil.fonts[0].family, ''); assert.equal(evil.fonts[0].exportFamily, '');
  assert.deepEqual([...usedFonts(records)].sort(), ['gothic']);
  assert.deepEqual([...videoOwners(got.records)], [['vkey100000', records[0].id], ['vkey200000', records[1].id]]);
  // 보통의 zip 이라 다른 프로그램으로도 풀린다.
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  assert.deepEqual(Object.keys(files).sort(), ['documents/0.json', 'documents/1.json', 'fonts/0', 'onbatang.json', 'videos/0', 'videos/1']);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(files['documents/1.json'])), records[1]);
});

test('broken, foreign and newer files are refused with a reason', async () => {
  const records = [part(3, [{}])];
  const good = new Uint8Array(await (await packOnbatang({ records, app: '0.91.0' })).arrayBuffer());
  const code = async (blob, app = '0.91.0') => { try { await readOnbatang(blob, { app }); return 'opened'; } catch (error) { return error.code; } };
  assert.equal(await code(new Blob([good])), 'opened');
  // 내용 한 바이트가 바뀌면 검사 값이 맞지 않는다
  const text = new TextDecoder().decode(good), at = text.indexOf('메이커') + 1, bad = good.slice(); bad[at] ^= 1;
  assert.equal(await code(new Blob([bad])), 'broken');
  // 끝이 잘린 파일
  assert.equal(await code(new Blob([good.slice(0, good.length - 40)])), 'not_onbatang');
  // 다른 zip(PPTX 따위) · zip 이 아닌 것
  assert.equal(await code(new Blob([zipStore([{ name: 'ppt/presentation.xml', bytes: new TextEncoder().encode('<p/>') }])])), 'not_onbatang');
  assert.equal(await code(new Blob(['hello'])), 'not_onbatang');
  // 더 새 온바탕에서 만든 파일: 이 온바탕이 모르는 칸이 빠질 수 있어 열지 않는다(새로 고침하면 열린다)
  assert.equal(await code(new Blob([good]), '0.90.9'), 'newer');
  assert.equal(await code(new Blob([good]), '0.92.0'), 'opened');
  assert.ok(compareVersions('0.100.0', '0.91.0') > 0 && compareVersions('0.91.0', '0.91.0') === 0);
});

test('a copy opened beside the same work gets new identities but the same content and page order', async () => {
  const records = [part(4, [{ activity: newPixelActivity({ size: 8 }) }, {}]), part(5, [{}])];
  const pageOrder = [records[1].slides[0].id, ...records[0].slides.map((p) => p.id)];
  const got = await readOnbatang(await packOnbatang({ records, deck: { title: 'X', pageOrder }, app: '0.91.0' }));
  const copy = freshCopy(got, { now: 1792950000000 });
  assert.equal(copy.records.length, 2);
  for (const [i, r] of copy.records.entries()) {
    assert.notEqual(r.id, records[i].id);
    assert.notEqual(r.source.sourceDocumentId, records[i].source.sourceDocumentId);
    assert.equal(r.source.sourceDocumentId, copy.records[0].source.sourceDocumentId, 'the parts stay one PPT');
    r.slides.forEach((p, k) => {
      assert.notEqual(p.id, records[i].slides[k].id);
      const { id, activity, ...rest } = p, { id: id0, activity: a0, ...rest0 } = records[i].slides[k];
      assert.deepEqual(rest, rest0, 'the page content is untouched');
      if (a0) { assert.notEqual(activity.id, a0.id); assert.deepEqual({ ...activity, id: 0 }, { ...a0, id: 0 }); }
    });
    assert.deepEqual(migrateRecord(r).slides.map((p) => p.items), records[i].slides.map((p) => p.items));
  }
  assert.deepEqual(copy.deck.pageOrder, [copy.records[1].slides[0].id, ...copy.records[0].slides.map((p) => p.id)]);
});

test('zipBlob joins large parts without copying them, and readZip reads stored and deflated entries', async () => {
  const big = new Blob([new Uint8Array(2_000_000).fill(7)]);
  const zip = await zipBlob([{ name: 'a.txt', data: new TextEncoder().encode('안녕') }, { name: 'b.bin', data: big }]);
  const entries = await readZip(zip);
  assert.deepEqual(entries.map((e) => [e.name, e.size]), [['a.txt', 6], ['b.bin', 2_000_000]]);
  assert.equal(new TextDecoder().decode(await entries[0].read()), '안녕');
  assert.equal((await entries[1].read()).every((n) => n === 7), true);
  const { zipSync } = await import('fflate');
  const deflated = await readZip(new Blob([zipSync({ 'c.txt': new TextEncoder().encode('x'.repeat(1000)) }, { level: 9 })]));
  assert.equal(new TextDecoder().decode(await deflated[0].read()), 'x'.repeat(1000));
});
