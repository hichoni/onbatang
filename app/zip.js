// 파일 여러 개를 압축 파일(.zip) 하나로 묶는다. 줄이지 않고 그대로 담는다(PNG·JPG 는 이미 줄어 있어서 다시 줄여도 거의 그대로다).
// 바깥 라이브러리 없이 쓰려고 꼭 필요한 만큼만 만들었다. DOM 을 쓰지 않는 순수 함수라 node 에서도 테스트한다.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
/** 파일 내용의 검사 값(CRC-32). */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 파일들을 zip 하나로 묶는다. files: [{ name(영어·숫자 이름), bytes(Uint8Array) }]. 돌려주는 것: Uint8Array.
 * when: 파일에 적을 날짜(Date).
 */
export function zipStore(files, when = new Date()) {
  const enc = new TextEncoder();
  const time = ((when.getHours() & 31) << 11) | ((when.getMinutes() & 63) << 5) | ((when.getSeconds() >> 1) & 31);
  const date = (((when.getFullYear() - 1980) & 127) << 9) | (((when.getMonth() + 1) & 15) << 5) | (when.getDate() & 31);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(String(file.name));
    const data = file.bytes;
    const crc = crc32(data);
    // 파일마다: 머리말(30바이트) + 이름 + 내용
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);              // 풀 때 필요한 버전
    head.setUint16(6, 0x0800, true);          // 이름은 UTF-8
    head.setUint16(8, 0, true);               // 줄이지 않음
    head.setUint16(10, time, true);
    head.setUint16(12, date, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, data.length, true);
    head.setUint32(22, data.length, true);
    head.setUint16(26, name.length, true);
    head.setUint16(28, 0, true);
    parts.push(new Uint8Array(head.buffer), name, data);
    // 맨 뒤에 붙는 목록의 한 줄(46바이트) + 이름
    const row = new DataView(new ArrayBuffer(46));
    row.setUint32(0, 0x02014b50, true);
    row.setUint16(4, 20, true);
    row.setUint16(6, 20, true);
    row.setUint16(8, 0x0800, true);
    row.setUint16(10, 0, true);
    row.setUint16(12, time, true);
    row.setUint16(14, date, true);
    row.setUint32(16, crc, true);
    row.setUint32(20, data.length, true);
    row.setUint32(24, data.length, true);
    row.setUint16(28, name.length, true);
    row.setUint32(42, offset, true);          // 이 파일의 머리말이 시작하는 자리
    central.push(new Uint8Array(row.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

// ---------- 큰 파일(영상)도 담는 zip: 내용을 한 덩어리로 모으지 않고 Blob 조각으로 잇는다 ----------
const stamp = (when) => [
  ((when.getHours() & 31) << 11) | ((when.getMinutes() & 63) << 5) | ((when.getSeconds() >> 1) & 31),
  (((when.getFullYear() - 1980) & 127) << 9) | (((when.getMonth() + 1) & 15) << 5) | (when.getDate() & 31),
];
const LIMIT = 0xffffffff;
/**
 * 파일들을 zip 하나(Blob)로 묶는다. files: [{ name, data(Uint8Array 또는 Blob) }]. 줄이지 않고 그대로 담는다.
 * 영상처럼 큰 내용은 검사 값만 읽어 내고, 내용은 받은 Blob 을 그대로 이어 붙인다(메모리에 한 번 더 베끼지 않는다).
 */
export async function zipBlob(files, when = new Date()) {
  const enc = new TextEncoder(), [time, date] = stamp(when);
  const parts = [], central = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(String(file.name));
    const data = file.data instanceof Blob ? file.data : new Uint8Array(file.data);
    const size = data instanceof Blob ? data.size : data.length;
    const crc = crc32(data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data);
    if (size >= LIMIT || offset + 30 + name.length + size >= LIMIT) throw Object.assign(Error('zip_too_large'), { code: 'zip_too_large' });
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true);
    head.setUint16(10, time, true); head.setUint16(12, date, true); head.setUint32(14, crc, true);
    head.setUint32(18, size, true); head.setUint32(22, size, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    parts.push(new Uint8Array(head.buffer), name, data);
    const row = new DataView(new ArrayBuffer(46));
    row.setUint32(0, 0x02014b50, true); row.setUint16(4, 20, true); row.setUint16(6, 20, true); row.setUint16(8, 0x0800, true); row.setUint16(10, 0, true);
    row.setUint16(12, time, true); row.setUint16(14, date, true); row.setUint32(16, crc, true);
    row.setUint32(20, size, true); row.setUint32(24, size, true); row.setUint16(28, name.length, true); row.setUint32(42, offset, true);
    central.push(new Uint8Array(row.buffer), name);
    offset += 30 + name.length + size;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  if (files.length > 0xffff || offset + centralSize + 22 >= LIMIT) throw Object.assign(Error('zip_too_large'), { code: 'zip_too_large' });
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
}

/**
 * zip 파일(Blob)의 목록을 읽는다: [{ name, size, crc, read() }]. read() 는 내용(Uint8Array)을 꺼내며 검사 값이 맞는지 본다
 * (맞지 않으면 'zip_broken'). 줄이지 않고 담은 것(zipStore · zipBlob)과 흔한 방식(deflate)으로 줄인 것을 읽는다.
 * 큰 파일도 필요한 부분만 잘라 읽는다.
 */
export async function readZip(blob) {
  const broken = () => Object.assign(Error('zip_broken'), { code: 'zip_broken' });
  const bytes = async (from, to) => new Uint8Array(await blob.slice(from, to).arrayBuffer());
  if (!(blob instanceof Blob) || blob.size < 22) throw broken();
  const tailFrom = Math.max(0, blob.size - 22 - 0xffff), tail = await bytes(tailFrom, blob.size);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { at = i; break; }
  if (at < 0) throw broken();
  const end = new DataView(tail.buffer, tail.byteOffset + at, 22);
  const count = end.getUint16(10, true), dirSize = end.getUint32(12, true), dirAt = end.getUint32(16, true);
  if (dirAt + dirSize > blob.size) throw broken();
  const dir = await bytes(dirAt, dirAt + dirSize), view = new DataView(dir.buffer, dir.byteOffset, dir.byteLength), dec = new TextDecoder();
  const out = [];
  for (let p = 0, n = 0; n < count; n++) {
    if (p + 46 > dir.length || view.getUint32(p, true) !== 0x02014b50) throw broken();
    const method = view.getUint16(p + 10, true), crc = view.getUint32(p + 16, true), packed = view.getUint32(p + 20, true), size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), noteLen = view.getUint16(p + 32, true), local = view.getUint32(p + 42, true);
    const name = dec.decode(dir.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + noteLen;
    if (method !== 0 && method !== 8) throw broken();
    out.push({ name, size, crc, async read() {
      const head = await bytes(local, local + 30), h = new DataView(head.buffer);
      if (head.length < 30 || h.getUint32(0, true) !== 0x04034b50) throw broken();
      const from = local + 30 + h.getUint16(26, true) + h.getUint16(28, true);
      if (from + packed > blob.size) throw broken();
      let data = await bytes(from, from + packed);
      if (method === 8) {
        if (typeof DecompressionStream !== 'function') throw broken();
        data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      }
      if (data.length !== size || crc32(data) !== crc) throw broken();
      return data;
    } });
  }
  return out;
}
