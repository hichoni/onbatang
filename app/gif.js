// 움직이는 GIF(GIF89a) 만들기: 바깥 라이브러리 없이, 그림(RGBA 화소)들을 받아 GIF 파일의 바이트를 돌려준다(화면을 모르는 순수한 함수).
// 슬라이드는 평평한 색이 많아서, 쪽마다 가장 많이 쓰인 색 256가지로 줄이는 방식(많이 쓰인 색 고르기)으로 충분히 또렷하다.
// 색 줄이기: 빨강·초록·파랑을 5비트씩(32768칸)으로 묶어 세고, 많은 칸부터 256개를 고른다(칸의 색은 그 칸 화소들의 평균).
// 나머지 칸은 가장 가까운 고른 색으로 바꾼다. 압축은 GIF 의 LZW(코드 길이 12비트까지, 가득 차면 처음부터)다.

/** 한 GIF 의 쪽 수 한도와, 한 쪽의 화소 수 한도(메모리를 지키려고). */
export const GIF_LIMITS = Object.freeze({ frames: 120, pixels: 1280 * 1280 });

/** RGBA 화소(Uint8ClampedArray)를 256색 이하의 판과 색 번호로 바꾼다. 돌려주는 것: { palette: Uint8Array(색 수 × 3), indices: Uint8Array } */
export function quantize(rgba) {
  const n = rgba.length >> 2;
  const count = new Uint32Array(32768), sum = new Float64Array(32768 * 3);
  const bins = new Uint16Array(n);
  for (let p = 0, q = 0; p < n; p++, q += 4) {
    const bin = ((rgba[q] >> 3) << 10) | ((rgba[q + 1] >> 3) << 5) | (rgba[q + 2] >> 3);
    bins[p] = bin;
    count[bin]++;
    sum[bin * 3] += rgba[q]; sum[bin * 3 + 1] += rgba[q + 1]; sum[bin * 3 + 2] += rgba[q + 2];
  }
  const used = [];
  for (let b = 0; b < 32768; b++) if (count[b]) used.push(b);
  used.sort((a, b) => count[b] - count[a] || a - b);
  const chosen = used.slice(0, 256);
  const palette = new Uint8Array(Math.max(2, chosen.length) * 3);
  const index = new Int16Array(32768).fill(-1);
  chosen.forEach((b, k) => {
    for (let c = 0; c < 3; c++) palette[k * 3 + c] = Math.round(sum[b * 3 + c] / count[b]);
    index[b] = k;
  });
  // 고르지 못한 칸: 가장 가까운 고른 색(빨강·초록·파랑 거리의 제곱이 가장 작은 것)
  for (const b of used.slice(256)) {
    const r = Math.round(sum[b * 3] / count[b]), g = Math.round(sum[b * 3 + 1] / count[b]), bl = Math.round(sum[b * 3 + 2] / count[b]);
    let best = 0, dist = Infinity;
    for (let k = 0; k < chosen.length; k++) {
      const d = (palette[k * 3] - r) ** 2 + (palette[k * 3 + 1] - g) ** 2 + (palette[k * 3 + 2] - bl) ** 2;
      if (d < dist) { dist = d; best = k; }
    }
    index[b] = best;
  }
  const indices = new Uint8Array(n);
  for (let p = 0; p < n; p++) indices[p] = index[bins[p]];
  return { palette, indices };
}

// 늘어나는 바이트 그릇(큰 GIF 도 숫자 배열보다 가볍게).
function writer() {
  let buf = new Uint8Array(1 << 16), len = 0;
  return {
    push(...bytes) {
      if (len + bytes.length > buf.length) { const next = new Uint8Array(Math.max(buf.length * 2, len + bytes.length)); next.set(buf); buf = next; }
      for (const b of bytes) buf[len++] = b;
    },
    bytes: () => buf.slice(0, len),
  };
}

// GIF 의 LZW 압축. 색 번호들을 받아 (255바이트 이하로 나눈) 바이트 조각들로 적는다.
function lzw(indices, minCode, out) {
  const clear = 1 << minCode, end = clear + 1;
  let size = minCode + 1, next = end + 1, dict = new Map();
  let bits = 0, acc = 0;
  const block = [];
  const flush = () => { if (block.length) { out.push(block.length, ...block); block.length = 0; } };
  const emit = (code) => {
    acc |= code << bits; bits += size;
    while (bits >= 8) { block.push(acc & 255); acc >>>= 8; bits -= 8; if (block.length === 255) flush(); }
  };
  emit(clear);
  let prefix = indices.length ? indices[0] : 0;
  for (let p = 1; p < indices.length; p++) {
    const c = indices[p], key = (prefix << 8) | c, got = dict.get(key);
    if (got !== undefined) { prefix = got; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << size) && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map(); size = minCode + 1; next = end + 1;
    }
    prefix = c;
  }
  emit(prefix);
  emit(end);
  if (bits > 0) block.push(acc & 255);
  flush();
  out.push(0);
}

/**
 * 쪽들을 GIF 파일 하나로. frames: [{ data(RGBA, 길이 width×height×4), delay(1/100초 단위) }] · loop: 0 이면 끝없이 되풀이.
 * 돌려주는 것: Uint8Array(GIF 파일).
 */
export function encodeGif(frames, { width, height, loop = 0 } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535 || width * height > GIF_LIMITS.pixels) throw new Error('GIF 크기를 확인해 주세요.');
  if (!Array.isArray(frames) || !frames.length || frames.length > GIF_LIMITS.frames) throw new Error(`GIF 는 ${GIF_LIMITS.frames}쪽까지 만들 수 있어요.`);
  const out = writer();
  const word = (v) => out.push(v & 255, (v >> 8) & 255);
  out.push(...[...'GIF89a'].map((c) => c.charCodeAt(0)));
  word(width); word(height);
  out.push(0x00, 0, 0);                                   // 전체 색판 없음(쪽마다 제 색판)
  // 되풀이(NETSCAPE2.0)
  out.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1); word(loop); out.push(0);
  for (const frame of frames) {
    if (!frame?.data || frame.data.length !== width * height * 4) throw new Error('GIF 쪽의 화소 수가 크기와 달라요.');
    const { palette, indices } = quantize(frame.data);
    const colors = palette.length / 3;
    let bitsPer = 1;
    while ((1 << bitsPer) < colors) bitsPer++;
    const delay = Math.max(2, Math.min(65535, Math.round(frame.delay) || 100));
    out.push(0x21, 0xf9, 4, 0x04); word(delay); out.push(0, 0);   // 그래픽 조절: 그린 채로 두기(disposal 1) · 기다리기
    out.push(0x2c); word(0); word(0); word(width); word(height);
    out.push(0x80 | (bitsPer - 1));                       // 이 쪽의 색판
    for (let k = 0; k < (1 << bitsPer); k++) out.push(palette[k * 3] || 0, palette[k * 3 + 1] || 0, palette[k * 3 + 2] || 0);
    const minCode = Math.max(2, bitsPer);
    out.push(minCode);
    lzw(indices, minCode, out);
  }
  out.push(0x3b);
  return out.bytes();
}
