// Shared, storage-independent document contract. No network or host account concepts.
export const SCHEMA_VERSION = 1;
export const DOCUMENT_LIMITS = Object.freeze({ pages: 20, items: 40, photos: 10, text: 120, assets: 256 });
// Imported slides keep authored text boxes and pictures as individual elements.
// The public marker also works after a guest projection removes provenance.
// PPT 에서 가져온 장(slide 배치 요소)은 표의 칸마다 네모와 글이 하나씩 생기므로 요소를 더 많이 둔다.
export const SLIDE_LIMITS = Object.freeze({ items: 160, photos: 40, text: 4096 });
// Speaker notes are plain text for the presenter only: never drawn on the slide.
export const NOTES_LIMIT = 5000;
/** 발표자 노트. 글이 아니거나 비어 있으면 ''(저장하지 않는다). 너무 긴 것은 자르고 조종 문자는 뺀다(줄바꿈·탭은 둔다). */
export function cleanNotes(value) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, NOTES_LIMIT);
  return text.trim() ? text : '';
}
/** 장에 노트가 있으면 { notes }, 없으면 {} (장을 새로 짜 맞추는 곳마다 함께 펼쳐 넣는다). */
export const slideNotes = slide => { const notes = cleanNotes(slide?.notes); return notes ? { notes } : {}; };
/** 발표할 때 건너뛰는(숨긴) 장이면 { hidden: true }, 아니면 {} (그 장은 지우지 않고 편집·저장·PPTX 에는 남는다). */
export const slideHidden = slide => (slide?.hidden === true ? { hidden: true } : {});
/** 리허설로 잰 그 장의 머무는 시간(초, 1~3600 의 정수). 자동 넘기기와 영상 만들기가 쓴다. 없거나 틀리면 {}. */
export const DUR_LIMIT = 3600;
export const slideDur = slide => (Number.isInteger(slide?.dur) && slide.dur >= 1 && slide.dur <= DUR_LIMIT ? { dur: slide.dur } : {});
/** 주제(구역) 이름: 이 장부터 새 주제가 시작된다(PowerPoint 의 구역). 한 줄 글로 40자까지. 비면 ''. */
export const TOPIC_LIMIT = 40;
export function cleanTopic(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, TOPIC_LIMIT).join('').trim();
}
/**
 * 발표에 나오는 장들의 주제 이름(id → 이름). 숨긴 장에서 시작한 주제는 그다음에 나오는 장으로 넘긴다
 * (그 장에 제 주제가 있으면 그것을 쓴다). 발표 · HTML 수업 · 전체 보기가 함께 쓴다.
 */
export function shownTopics(pages) {
  const out = new Map();
  let pending = '';
  for (const page of Array.isArray(pages) ? pages : []) {
    const name = cleanTopic(page?.topic);
    if (page?.hidden === true) { if (name) pending = name; continue; }
    if (name || pending) out.set(page?.id, name || pending);
    pending = '';
  }
  return out;
}
/** 장에 주제 이름이 있으면 { topic }, 없으면 {}. */
export const slideTopic = slide => { const topic = cleanTopic(slide?.topic); return topic ? { topic } : {}; };
/**
 * 장 목록을 주제로 묶는다: 주제 이름이 있는 장에서 새 묶음이 시작된다. 첫 주제 앞의 장들은 이름 없는 묶음('')이다.
 * 돌려주는 것: [{ name, start(첫 장 번호), end(끝 장 번호, 포함) }] (장이 없으면 [])
 */
export function topicGroups(names) {
  const out = [];
  (Array.isArray(names) ? names : []).forEach((value, i) => {
    const name = cleanTopic(value);
    if (!out.length || name) out.push({ name, start: i, end: i });
    else out[out.length - 1].end = i;
  });
  return out;
}
/** 그림 설명(대체 텍스트)의 한도와 정리: 한 줄 글로(조종 문자·줄바꿈은 빈칸으로, 앞뒤 빈칸은 뺀다). 비면 ''. */
export const ALT_LIMIT = 300;
export function cleanAlt(value) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, ALT_LIMIT).join('');
}
export const isSlideItem = item => item?.layout === 'slide' || item?.source?.kind === 'pptx';
export const itemTextLimit = (item, ordinary = DOCUMENT_LIMITS.text) => isSlideItem(item) ? Math.max(ordinary, SLIDE_LIMITS.text) : ordinary;
export function pageLimits(page, ordinary = DOCUMENT_LIMITS) {
  return Array.isArray(page?.items) && page.items.some(isSlideItem)
    ? { ...ordinary, items: Math.max(ordinary.items, SLIDE_LIMITS.items), photos: Math.max(ordinary.photos, SLIDE_LIMITS.photos) }
    : ordinary;
}
export class DocumentError extends Error {
  constructor(code, path, original, details = {}) {
    super(`${code}: ${path}`);
    this.name = 'DocumentError'; this.code = code; this.path = path;
    // The caller can export/retry the untouched input; never mistake a partial result for success.
    this.original = original; this.details = details;
  }
}
export const fail = (code, path, original, details) => { throw new DocumentError(code, path, original, details); };
export const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
export const isId = v => typeof v === 'string' && /^[a-z][a-z0-9]{5,31}$/.test(v);
export function newId(prefix = 'e') {
  return prefix + (globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 24)
    || Date.now().toString(36) + Math.random().toString(36).slice(2, 14));
}
// Stable migration IDs: no randomness or clock, including repeated reads of the same legacy row.
export function legacyId(prefix, seed) {
  let a = 2166136261, b = 5381;
  for (const c of String(seed)) { a = Math.imul(a ^ c.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ c.charCodeAt(0); }
  return prefix + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
const field = (v, key, test, out, path) => {
  if (v[key] !== undefined) {
    if (!test(v[key])) fail('INVALID_FIELD', `${path}.${key}`, v);
    out[key] = v[key];
  }
};
const short = n => v => typeof v === 'string' && v.length > 0 && v.length <= n && !/[\u0000-\u001f]/.test(v);
const natural = v => Number.isSafeInteger(v) && v >= 0;
export function cleanSize(v, path = 'size') {
  if (!isObject(v) || !Number.isFinite(v.width) || !Number.isFinite(v.height) || v.width <= 0 || v.height <= 0
    || v.width > 1e9 || v.height > 1e9 || !['px', 'pt', 'emu'].includes(v.unit)) fail('INVALID_SIZE', path, v);
  const aspect = v.width / v.height;
  if (aspect < 0.25 || aspect > 4) fail('UNSUPPORTED_ASPECT', path, v, { min: 0.25, max: 4 });
  return { width: v.width, height: v.height, unit: v.unit };
}
export function cleanSource(v) {
  if (!isObject(v) || !['local', 'pptx', 'pdf', 'image', 'result'].includes(v.kind)) fail('INVALID_SOURCE', 'source', v);
  const out = { kind: v.kind };
  for (const k of ['sourceDocumentId', 'assetId']) field(v, k, isId, out, 'source');
  for (const k of ['filename', 'objectId']) field(v, k, short(240), out, 'source');
  field(v, 'sha256', x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x), out, 'source');
  field(v, 'pageNumber', x => natural(x) && x > 0, out, 'source');
  return out;
}
export function cleanOrigin(v) {
  if (!isObject(v)) fail('INVALID_ORIGIN', 'origin', v);
  const out = {};
  for (const k of ['documentId', 'pageId', 'elementId']) field(v, k, isId, out, 'origin');
  field(v, 'revision', natural, out, 'origin');
  if (!Object.keys(out).length) fail('INVALID_ORIGIN', 'origin', v);
  return out;
}
export function metadata(v, { identity = false } = {}) {
  const out = {};
  if (identity && v?.id !== undefined) {
    if (!isId(v.id)) fail('INVALID_ID', 'id', v);
    out.id = v.id;
  }
  if (v?.source !== undefined) out.source = cleanSource(v.source);
  if (v?.origin !== undefined) out.origin = cleanOrigin(v.origin);
  if (v?.assetRefs !== undefined) {
    if (!Array.isArray(v.assetRefs) || v.assetRefs.length > DOCUMENT_LIMITS.assets || v.assetRefs.some(x => !isId(x))) fail('INVALID_ASSET_REFS', 'assetRefs', v);
    if (new Set(v.assetRefs).size !== v.assetRefs.length) fail('DUPLICATE_ID', 'assetRefs', v);
    out.assetRefs = [...v.assetRefs];
  }
  return out;
}
export function cleanAssets(list = []) {
  if (!Array.isArray(list) || list.length > DOCUMENT_LIMITS.assets) fail('ASSET_LIMIT', 'assets', list);
  const seen = new Set();
  return list.map(v => {
    if (!isObject(v) || !isId(v.id) || seen.has(v.id)) fail('INVALID_ASSET', 'assets.id', v);
    seen.add(v.id);
    if (!['source', 'render', 'image', 'structure', 'snapshot'].includes(v.kind) || !short(100)(v.mimeType)) fail('INVALID_ASSET', 'assets', v);
    const out = { id: v.id, kind: v.kind, mimeType: v.mimeType };
    field(v, 'sha256', x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x), out, 'asset');
    field(v, 'byteLength', natural, out, 'asset');
    // A logical reference, never fetched by the editor. Hosts resolve it after authorization.
    field(v, 'storageKey', x => short(500)(x) && !x.includes('..') && !/[:\\]/.test(x) && !x.startsWith('/'), out, 'asset');
    return out;
  });
}
export function validatePageInput(page, limits = DOCUMENT_LIMITS) {
  const items = page?.items;
  if (!Array.isArray(items)) fail('INVALID_ITEMS', 'items', page);
  limits = pageLimits(page, limits);
  if (items.length > limits.items) fail('ITEM_LIMIT', 'items', page, { limit: limits.items, actual: items.length });
  if (items.filter(x => x?.t === 'image').length > limits.photos) fail('PHOTO_LIMIT', 'items', page, { limit: limits.photos });
  const seen = new Set();
  for (const [i, item] of items.entries()) {
    if (!isObject(item) || !['text', 'emoji', 'shape', 'art', 'yt', 'image', 'link'].includes(item.t)) fail('UNSUPPORTED_ELEMENT', `items.${i}`, page);
    if (item.id !== undefined) {
      if (!isId(item.id)) fail('INVALID_ID', `items.${i}.id`, page);
      if (seen.has(item.id)) fail('DUPLICATE_ID', `items.${i}.id`, page);
      seen.add(item.id);
    }
    const textLimit = itemTextLimit(item, limits.text);
    if (item.t === 'text' && (typeof item.text !== 'string' || item.text.length > textLimit)) fail('TEXT_LIMIT', `items.${i}.text`, page, { limit: textLimit, actual: item.text?.length });
  }
}
export function validateReferences(record) {
  const assets = new Set(record.assets.map(a => a.id)), seen = new Set([record.id]);
  const check = (v, path) => {
    if (v !== record) { if (seen.has(v.id)) fail('DUPLICATE_ID', `${path}.id`, record); seen.add(v.id); }
    for (const id of [...(v.assetRefs || []), ...(v.source?.assetId ? [v.source.assetId] : [])]) {
      if (!assets.has(id)) fail('MISSING_ASSET', `${path}.assetRefs`, record, { assetId: id });
    }
  };
  check(record, 'document');
  record.slides.forEach((p, i) => { check(p, `slides.${i}`); p.items.forEach((e, j) => check(e, `slides.${i}.items.${j}`)); });
}
