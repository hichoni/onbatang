// 온바탕 파일(.onbatang): 꾸미던 자료를 고친 그대로 한 파일에 담아 내려받고, 어느 온바탕(공용 온바탕 · 가이랩)에서나 그대로 연다.
// 담는 것: 그림 기록(PPT 면 모든 파트. 이 기기에 저장된 그대로) · 바탕에 깐 영상 파일(열쇠 그대로) · 여러 파트 PPT 의 묶음(이름 · 쪽 차례)
// · 받는 온바탕에 없을 수 있는 글꼴(가이랩 글꼴 등. 자유 글꼴 사용 허락 글과 함께).
// 사진 · 글 · 도형 · 움직임 · 글자 효과 · 전환 · 발표자 노트 · 숨긴 장 · 활동은 모두 그림 기록 안에 들어 있다.
// 파일은 줄이지 않은 zip 이다(app/zip.js). 안의 모든 내용은 검사 값(CRC-32)으로 확인한 뒤에야 연다. DOM 을 쓰지 않아 node 에서도 테스트한다.
import { zipBlob, readZip } from './zip.js';
import { migrateRecord, isDesignId, newDesignId } from './designs.js';
import { newId } from '../src/document.js';

export const FILE_EXT = 'onbatang';
export const FILE_TYPE = 'application/vnd.onbatang+zip';
export const FILE_ACCEPT = '.onbatang';
const FORMAT = 'onbatang-file', VERSION = 1, MANIFEST = 'onbatang.json';
const VIDEO_KEY = /^[A-Za-z0-9_-]{4,64}$/, FONT_ID = /^[\w-]{1,64}$/;
const short = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
// 글꼴 이름은 CSS 에 들어간다(font-family): 파일에서 온 것은 글자 · 숫자 · 빈칸 · _ - 만 받는다.
const familyName = (v) => (typeof v === 'string' && /^[A-Za-z0-9 _-]{1,100}$/.test(v) ? v : '');

/** 파일을 열지 못한 까닭: not_onbatang(온바탕 파일이 아님) · broken(내용이 깨짐) · newer(더 새 온바탕에서 만든 파일) · empty(그림이 없음) */
export class OnbatangFileError extends Error {
  constructor(code, cause) { super(code); this.name = 'OnbatangFileError'; this.code = code; if (cause) this.cause = cause; }
}
const fail = (code, cause) => { throw new OnbatangFileError(code, cause); };
const enc = (value) => new TextEncoder().encode(JSON.stringify(value));
/** '0.91.0' 처럼 적힌 두 버전을 견준다(a 가 더 새것이면 양수). */
export function compareVersions(a, b) {
  const parts = (v) => String(v || '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

/**
 * 온바탕 파일(Blob)을 만든다.
 * - records: 그림 기록들(이 기기에 저장된 그대로. PPT 면 파트 차례대로)
 * - deck: 여러 파트 PPT 의 묶음 { title, pageOrder(왼쪽 목록에 보이는 쪽 차례) } 또는 null
 * - videos: [{ key, blob, seconds?, at? }] 그림들이 쓰는 바탕 영상 파일(열쇠 그대로)
 * - fonts: [{ id, name, desc?, exportFamily?, family?, license?(글), blob }] 그림들이 쓰는 글꼴 가운데 받는 온바탕에 없을 수 있는 것
 */
export async function packOnbatang({ title = '', records, deck = null, videos = [], fonts = [], app = '', now = new Date() }) {
  if (!Array.isArray(records) || !records.length) fail('empty');
  const files = [];
  const manifest = {
    format: FORMAT, version: VERSION, app: String(app), savedAt: now.toISOString(), title: String(title || records[0].name || ''),
    documents: records.map((r, i) => ({ id: r.id, path: `documents/${i}.json` })),
    deck: deck && records.length > 1 ? { title: String(deck.title || ''), ...(Array.isArray(deck.pageOrder) ? { pageOrder: [...deck.pageOrder] } : {}) } : null,
    videos: videos.map((v, i) => ({ key: v.key, path: `videos/${i}`, type: v.blob.type || '', bytes: v.blob.size, seconds: Number(v.seconds) || 0, at: Number(v.at) || 0 })),
    fonts: fonts.map((f, i) => ({ id: f.id, path: `fonts/${i}`, name: short(f.name, 100), desc: short(f.desc, 200), exportFamily: short(f.exportFamily, 100), family: short(f.family, 100), type: f.blob.type || '', license: short(f.license, 200000) })),
  };
  files.push({ name: MANIFEST, data: enc(manifest) });
  records.forEach((r, i) => files.push({ name: `documents/${i}.json`, data: enc(r) }));
  videos.forEach((v, i) => files.push({ name: `videos/${i}`, data: v.blob }));
  fonts.forEach((f, i) => files.push({ name: `fonts/${i}`, data: f.blob }));
  return new Blob([await zipBlob(files, now)], { type: FILE_TYPE });
}

/**
 * 온바탕 파일을 읽는다. 모든 내용의 검사 값을 확인하고, 그림 기록이 이 온바탕이 여는 모양인지 본다.
 * 돌려주는 것: { title, records(파일에 든 그대로), deck, videos: [{ key, blob, seconds, at }], fonts: [{ id, name, desc, exportFamily, family, license, blob }], app, savedAt }
 * app: 지금 온바탕의 버전. 파일이 더 새 온바탕에서 만들어졌으면 'newer'(이 온바탕이 모르는 내용이 빠질 수 있어서 열지 않는다).
 */
export async function readOnbatang(blob, { app = '' } = {}) {
  let entries;
  try { entries = await readZip(blob); } catch (error) { fail('not_onbatang', error); }
  const byName = new Map(entries.map((e) => [e.name, e]));
  const json = async (name) => {
    const entry = byName.get(name);
    if (!entry) fail('broken');
    try { return JSON.parse(new TextDecoder().decode(await entry.read())); } catch (error) { fail('broken', error); }
  };
  if (!byName.has(MANIFEST)) fail('not_onbatang');
  const manifest = await json(MANIFEST);
  if (manifest?.format !== FORMAT) fail('not_onbatang');
  if (!Number.isSafeInteger(manifest.version) || manifest.version > VERSION || (app && compareVersions(manifest.app, app) > 0)) fail('newer');
  if (!Array.isArray(manifest.documents) || !manifest.documents.length) fail('empty');
  const records = [];
  for (const doc of manifest.documents) {
    const record = await json(doc?.path);
    if (!record || record.id !== doc.id || !isDesignId(record.id)) fail('broken');
    try { migrateRecord(record); } catch (error) { fail(error?.code === 'UNSUPPORTED_SCHEMA' ? 'newer' : 'broken', error); }
    records.push(record);
  }
  if (new Set(records.map((r) => r.id)).size !== records.length) fail('broken');
  const videos = [];
  for (const v of Array.isArray(manifest.videos) ? manifest.videos : []) {
    const entry = byName.get(v?.path);
    if (!entry || !VIDEO_KEY.test(v.key || '')) fail('broken');
    let bytes;
    try { bytes = await entry.read(); } catch (error) { fail('broken', error); }
    videos.push({ key: v.key, blob: new Blob([bytes], { type: typeof v.type === 'string' ? v.type : '' }), seconds: Number(v.seconds) || 0, at: Number(v.at) || 0 });
  }
  const fonts = [];
  for (const f of Array.isArray(manifest.fonts) ? manifest.fonts : []) {
    const entry = byName.get(f?.path);
    if (!entry || !FONT_ID.test(f.id || '')) fail('broken');
    let bytes;
    try { bytes = await entry.read(); } catch (error) { fail('broken', error); }
    fonts.push({ id: f.id, name: short(f.name, 100), desc: short(f.desc, 200), exportFamily: familyName(f.exportFamily), family: familyName(f.family), license: short(f.license, 200000), blob: new Blob([bytes], { type: short(f.type, 100) }) });
  }
  const deck = manifest.deck && typeof manifest.deck === 'object' && records.length > 1
    ? { title: String(manifest.deck.title || ''), ...(Array.isArray(manifest.deck.pageOrder) ? { pageOrder: manifest.deck.pageOrder.filter((id) => typeof id === 'string') } : {}) } : null;
  return { title: String(manifest.title || ''), records, deck, videos, fonts, app: String(manifest.app || ''), savedAt: String(manifest.savedAt || '') };
}

/**
 * 이 기기에 이미 같은 그림이 있을 때 따로 여는 사본: 그림 · 장 · 활동에 새 이름표를 주고(내용은 그대로),
 * 같은 PPT 의 파트끼리만 묶이게 새 원본 번호를 준다. 쪽 차례는 새 장 이름표로 옮긴다. 영상 열쇠는 그대로 함께 쓴다.
 */
export function freshCopy(file, { now = Date.now(), rand = Math.random } = {}) {
  const pages = new Map(), sources = new Map(), ids = new Set();
  const sourceId = (old) => { if (!sources.has(old)) sources.set(old, `c${now.toString(36)}${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}`.slice(0, 32)); return sources.get(old); };
  const records = file.records.map((input, i) => {
    let id = newDesignId(now + i, rand());
    while (!isDesignId(id) || ids.has(id)) id = newDesignId(now + i, rand());
    ids.add(id);
    const old = input.source?.sourceDocumentId, fresh = old ? sourceId(old) : null;
    const slides = input.slides.map((slide) => {
      const page = newId('p');
      pages.set(slide.id, page);
      return { ...slide, id: page, ...(fresh && slide?.source?.sourceDocumentId === old ? { source: { ...slide.source, sourceDocumentId: fresh } } : {}),
        ...(slide.activity ? { activity: { ...slide.activity, id: newId('a') } } : {}) };
    });
    return { ...input, id, slides, ...(fresh ? { source: { ...input.source, sourceDocumentId: fresh } } : {}) };
  });
  const deck = file.deck ? { ...file.deck, ...(file.deck.pageOrder ? { pageOrder: file.deck.pageOrder.map((id) => pages.get(id) || id) } : {}) } : null;
  return { ...file, records, deck };
}

/** 그림들이 쓰는 글꼴의 이름표(글 · 연결선 이름표의 글꼴). */
export function usedFonts(records) {
  const out = new Set();
  for (const r of records) for (const s of r.slides || []) for (const it of s?.items || []) for (const id of [it?.font, it?.labelFont]) if (typeof id === 'string' && id) out.add(id);
  return out;
}

/** 파일이 쓰는 영상 열쇠 → 그 영상을 쓰는 (첫) 그림의 이름표. 영상 파일에 적어 둔다(그 그림을 지울 때 딸린 영상을 찾으려고). */
export function videoOwners(records) {
  const owners = new Map();
  for (const r of records) for (const s of r.slides || []) { const key = s?.video?.src; if (typeof key === 'string' && !owners.has(key)) owners.set(key, r.id); }
  return owners;
}
