import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeGif, quantize, GIF_LIMITS} from '../app/gif.js';

// A small independent GIF decoder (LZW + blocks) to check what the encoder wrote.
function decodeGif(bytes) {
  let p = 0;
  const u8 = () => bytes[p++], u16 = () => bytes[p++] | (bytes[p++] << 8);
  const sig = String.fromCharCode(...bytes.slice(0, 6)); p = 6;
  const width = u16(), height = u16(), flags = u8(); u8(); u8();
  assert.equal(flags & 0x80, 0);
  const frames = []; let loop = null, delay = 0;
  for (;;) {
    const b = u8();
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = u8();
      const blocks = [];
      for (let n = u8(); n; n = u8()) { blocks.push(bytes.slice(p, p + n)); p += n; }
      if (label === 0xff && String.fromCharCode(...blocks[0]) === 'NETSCAPE2.0') loop = blocks[1][1] | (blocks[1][2] << 8);
      if (label === 0xf9) delay = blocks[0][1] | (blocks[0][2] << 8);
      continue;
    }
    assert.equal(b, 0x2c);
    u16(); u16(); const w = u16(), h = u16(), f = u8();
    const size = 1 << ((f & 7) + 1), palette = bytes.slice(p, p + size * 3); p += size * 3;
    const minCode = u8(); const data = [];
    for (let n = u8(); n; n = u8()) { data.push(...bytes.slice(p, p + n)); p += n; }
    const clear = 1 << minCode, end = clear + 1, out = [];
    let codeSize = minCode + 1, dict = [], prev = null, bit = 0;
    const reset = () => { dict = Array.from({length: clear}, (_, i) => [i]); dict.push(null, null); codeSize = minCode + 1; prev = null; };
    reset();
    for (;;) {
      let code = 0;
      for (let i = 0; i < codeSize; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
      if (code === clear) { reset(); continue; }
      if (code === end) break;
      let entry = dict[code];
      if (!entry) { assert.equal(code, dict.length); entry = [...prev, prev[0]]; }
      out.push(...entry);
      if (prev) dict.push([...prev, entry[0]]);
      prev = entry;
      if (dict.length === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    const rgb = new Uint8Array(w * h * 3);
    out.forEach((k, i) => { rgb[i * 3] = palette[k * 3]; rgb[i * 3 + 1] = palette[k * 3 + 1]; rgb[i * 3 + 2] = palette[k * 3 + 2]; });
    assert.equal(out.length, w * h);
    frames.push({w, h, delay, rgb});
  }
  return {sig, width, height, loop, frames};
}
const flat = (w, h, paint) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = paint(x, y), q = (y * w + x) * 4; d[q] = r; d[q + 1] = g; d[q + 2] = b; d[q + 3] = 255; } return d; };

test('flat slides come back exactly: looping GIF89a with one palette per frame and per-frame delays', () => {
  const W = 64, H = 36;
  const a = flat(W, H, (x, y) => (x < 32 ? [255, 255, 255] : y < 18 ? [61, 75, 192] : [255, 201, 60]));
  const b = flat(W, H, (x) => [x * 4, 0, 255 - x * 4]);
  const gif = encodeGif([{data: a, delay: 300}, {data: b, delay: 50}], {width: W, height: H});
  const back = decodeGif(gif);
  assert.equal(back.sig, 'GIF89a');
  assert.deepEqual([back.width, back.height, back.loop], [W, H, 0]);
  assert.deepEqual(back.frames.map(f => f.delay), [300, 50]);
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) assert.equal(back.frames[0].rgb[i * 3 + c], a[i * 4 + c]);
  // A 64-step gradient survives with every value within the 5-bit grouping.
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) assert.ok(Math.abs(back.frames[1].rgb[i * 3 + c] - b[i * 4 + c]) <= 8);
});

test('more than 256 colours fall back to the nearest chosen colour, and long runs reset the LZW table', () => {
  const W = 200, H = 120;
  const noisy = flat(W, H, (x, y) => [(x * 37 + y * 11) % 256, (x * 13 + y * 29) % 256, (x * y) % 256]);
  const {palette, indices} = quantize(noisy);
  assert.ok(palette.length / 3 <= 256);
  assert.equal(indices.length, W * H);
  const back = decodeGif(encodeGif([{data: noisy, delay: 100}], {width: W, height: H, loop: 3}));
  assert.equal(back.loop, 3);
  let far = 0;
  for (let i = 0; i < W * H; i++) far += Math.abs(back.frames[0].rgb[i * 3] - noisy[i * 4]) > 64 ? 1 : 0;
  assert.ok(far < W * H * 0.05, `far ${far}`);
  // A single colour (palette of one) still makes a valid 2-colour table.
  const one = decodeGif(encodeGif([{data: flat(8, 8, () => [10, 20, 30]), delay: 1}], {width: 8, height: 8}));
  assert.deepEqual([...one.frames[0].rgb.slice(0, 3)], [10, 20, 30]);
  assert.equal(one.frames[0].delay, 2);
});

test('bad sizes and too many frames are refused', () => {
  assert.throws(() => encodeGif([{data: new Uint8ClampedArray(16), delay: 1}], {width: 3, height: 1}), /화소 수/);
  assert.throws(() => encodeGif([], {width: 2, height: 2}), /쪽까지/);
  assert.throws(() => encodeGif([{data: new Uint8ClampedArray(4), delay: 1}], {width: 0, height: 1}), /크기/);
  assert.throws(() => encodeGif(Array.from({length: GIF_LIMITS.frames + 1}, () => ({data: new Uint8ClampedArray(4), delay: 1})), {width: 1, height: 1}), /쪽까지/);
});
