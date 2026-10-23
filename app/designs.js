// 미니캔 앱의 규칙: 그림 한 편의 기록, 화면 비율, 이름, 차례, 내려받는 크기.
// DOM·저장소를 쓰지 않는 순수 함수만 둔다. 디자인 그 자체({ bg, items })의 모양과 정리는 모듈(src/model.js)의 것을 쓴다.
//
// 그림 한 편은 슬라이드 여러 장으로 되어 있다: { id, name, ratio, slides: [{ bg, items }, …], uploads: [사진(data 주소), …], updatedAt }
// 슬라이드에는 움직임(pa · tr)과 영상 장면(video: 그 장의 바탕에 까는 영상)이 딸릴 수 있다. 영상 파일은 이 기기에만 있고(videos.js), 슬라이드에는 그 열쇠와 쓰는 구간만 적힌다.
// (슬라이드가 생기기 전의 기록은 design 하나만 가지고 있다. 읽을 때 슬라이드 한 장짜리로 바꾼다.)
// uploads 는 그 그림에 올린 파일들이다(업로드 칸의 "올린 파일"). 슬라이드에서 쓰는 사진은 모두 여기에도 있고,
// 올려 두기만 하고 아직 쓰지 않은 사진도 여기에 남는다. 이 칸이 없는 예전 기록은 슬라이드에서 쓰는 사진들로 읽는다.
// 그림은 이 기기(브라우저의 IndexedDB, store.js)에만 저장된다. 서버로는 아무것도 보내지 않는다.

/** 고를 수 있는 화면 비율(aspect 는 가로 ÷ 세로). */
import { SCHEMA_VERSION, DOCUMENT_LIMITS, DocumentError, fail, isId, newId, legacyId, cleanSize, metadata, cleanAssets, validatePageInput, validateReferences, slideNotes, slideHidden, slideTopic, slideDur } from '../src/document.js';
import { relink } from '../src/links.js';
import { cleanActivity } from '../src/activity.js';
import {cleanCrop} from '../src/crop.js';
export { SCHEMA_VERSION, DocumentError };

export const RATIOS = [
  { id: '1:1', name: '정사각형', desc: '카드 한 장', aspect: 1 },
  { id: '4:5', name: '세로', desc: '포스터처럼', aspect: 4 / 5 },
  { id: '16:9', name: '가로', desc: '발표 화면처럼', aspect: 16 / 9 },
  { id: '9:16', name: '길게', desc: '휴대폰 화면처럼', aspect: 9 / 16 },
];
export const MAX_DESIGNS = 30;        // 둘 수 있는 그림 수
export const MAX_SLIDES = 20;         // 그림 한 편의 슬라이드 수
export const MAX_NAME = 30;
export const MAX_CARD_PHOTOS = 10;    // 슬라이드 한 장에 놓을 수 있는 사진 수
export const MAX_UPLOADS = 20;        // 그림 한 편에 올려 둘 수 있는 파일 수(더 올리려면 안 쓰는 것을 지운다)
const MAX_LIBRARY = 60;               // 목록의 한도(예전 그림은 슬라이드마다 다른 사진을 써서 20개를 넘을 수 있다)

/** 내려받는 그림의 크기. edge 는 긴 쪽의 길이(px). */
export const EXPORT_SIZES = [
  { id: 'small', name: '작게', edge: 1080, desc: '메시지로 보내거나 문서에 붙일 때' },
  { id: 'medium', name: '보통', edge: 1920, desc: '화면에 크게 띄울 때' },
  { id: 'large', name: '크게', edge: 3840, desc: '인쇄하거나 아주 큰 화면에 띄울 때' },
];
export const DEFAULT_EXPORT = 'medium';
/** 지난번에 고른 내려받기 크기·파일 종류를 기억해 두는 자리(localStorage). */
export const EXPORT_KEY = 'minican.export';
/** 영상으로 내려받을 때의 크기. short 는 짧은 쪽의 길이(px). 큰 화면에 띄워도 글자가 또렷한 쪽(1080)을 기본으로 둔다. */
export const VIDEO_SIZES = [
  { id: 'hd', name: '작게', short: 720, desc: '파일이 작아요. 메시지로 보낼 때' },
  { id: 'fhd', name: '보통', short: 1080, desc: '글자가 또렷해요. 화면에 띄울 때' },
];
export const DEFAULT_VIDEO = 'fhd';
/** 그 크기로 내려받을 때의 가로·세로(px). aspect 는 가로 ÷ 세로. 긴 쪽이 edge 가 된다. */
export function exportSize(sizeId, aspect) {
  const size = EXPORT_SIZES.find((x) => x.id === sizeId) || EXPORT_SIZES.find((x) => x.id === DEFAULT_EXPORT);
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const width = a >= 1 ? size.edge : Math.round(size.edge * a);
  const height = a >= 1 ? Math.round(size.edge / a) : size.edge;
  return { id: size.id, width, height };
}

export const ratioOf = (id) => {
  const preset = RATIOS.find((r) => r.id === id);
  if (preset) return preset;
  const m = typeof id === 'string' && /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(id);
  const aspect = m && Number(m[1]) / Number(m[2]);
  return aspect >= 0.25 && aspect <= 4 ? { id, name: '원본 비율', desc: id, aspect } : RATIOS[0];
};
export const aspectOf = record => record?.size ? cleanSize(record.size).width / record.size.height : ratioOf(record?.ratio).aspect;
/** Describe the stored canvas without rounding it to an editor preset or resizing it. */
export function canvasRatioOf(record) {
  // Allow only floating-point representation noise, not a nearby custom ratio.
  const sameAspect = (a, b) => Math.abs(a - b) <= Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 4;
  const aspect = aspectOf(record), preset = RATIOS.find(value => sameAspect(value.aspect, aspect));
  const originalSize = record?.originalSize ? cleanSize(record.originalSize, 'originalSize') : null;
  const original = record?.source?.kind === 'pptx' && originalSize !== null
    && sameAspect(originalSize.width / originalSize.height, aspect);
  const size = original ? originalSize : record?.size ? cleanSize(record.size) : null;
  let id = preset?.id || ratioOf(record?.ratio).id;
  if (!preset && size) {
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const divisor = Number.isSafeInteger(size.width) && Number.isSafeInteger(size.height) ? gcd(size.width, size.height) : 1;
    id = `${size.width / divisor}:${size.height / divisor}`;
  }
  return { id, aspect, preset: preset?.id || null, original,
    label: `${original ? '원본 비율' : '현재 비율'} · ${id}` };
}
/** 새 그림의 모양으로 쓸, 지난번에 고른 모양을 기억해 두는 자리(localStorage). */
export const RATIO_KEY = 'minican.ratio';
/** 꾸미는 화면의 발표자 노트 칸을 펴 두었는지 기억해 두는 자리(localStorage). */
export const NOTES_OPEN_KEY = 'minican.notes-open';

/** 새 그림의 이름표. */
export function newDesignId(now = Date.now(), rand = Math.random()) {
  return `d${now.toString(36)}${Math.floor(rand * 36 ** 4).toString(36).padStart(4, '0')}`;
}
export const isDesignId = (id) => typeof id === 'string' && /^d[a-z0-9]{6,24}$/.test(id);

const cleanName = (raw) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

// 장의 움직임(조합 효과 pa · 전환 효과 tr). 슬라이드를 새로 짜 맞추는 곳마다 함께 옮겨 적는다(빠뜨리면 저장하면서 움직임이 사라진다).
// 여기서는 짧은 이름인지만 본다: 어떤 효과가 있는지는 편집기 모듈(src/motion.js)이 알고, 모르는 이름은 그릴 때 버려진다.
const MOTION_ID = /^[a-z][a-z0-9]{1,11}$/;
export function slideMotion(slide) {
  const out = {};
  for (const key of ['pa', 'tr']) if (typeof slide?.[key] === 'string' && MOTION_ID.test(slide[key])) out[key] = slide[key];
  return out;
}

// 장의 영상 장면(그 장의 바탕에 까는 영상). 여기서는 모양만 본다: 열쇠가 짧은 글이고 길이가 숫자인지.
// 값의 범위(쓰는 구간이 원본 안에 있는지 등)는 그릴 때 편집기 모듈(src/model.js 의 cleanVideo)이 맞춘다.
const VIDEO_KEY = /^[A-Za-z0-9_-]{4,64}$/;
export function slideVideo(slide) {
  const v = slide?.video;
  if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.src !== 'string' || !VIDEO_KEY.test(v.src) || !Number.isFinite(v.dur) || !(v.dur > 0)) return {};
  const video = { src: v.src, dur: v.dur };
  for (const key of ['in', 'out', 'vol']) if (Number.isFinite(v[key])) video[key] = v[key];
  if (v.fit === 'cover' || v.fit === 'contain') video.fit = v.fit;
  return { video };
}
/** 장에 딸린 것 모두(움직임 · 영상 장면 · 발표자 노트). 슬라이드를 새로 짜 맞추는 곳({ bg, items } 를 만드는 곳)마다 함께 펼쳐 넣는다(빠뜨리면 저장하면서 사라진다). */
export const slideExtra = (slide) => ({ ...metadata(slide, { identity: true }), ...slideMotion(slide), ...slideVideo(slide), ...slideNotes(slide), ...slideHidden(slide), ...slideTopic(slide), ...slideDur(slide), ...(slide?.activity === undefined ? {} : {activity:cleanActivity(slide.activity)}) });
export function withSlideMotion(slide, motion) {
  const { pa, tr, ...extra } = slideExtra(slide);
  return { bg: slide.bg, items: slide.items, ...extra, ...slideMotion(motion) };
}
/** 영상 장면이 있는 장인지. */
export const hasVideo = (slide) => !!slideVideo(slide).video;
/** 슬라이드들이 쓰는 영상 파일의 열쇠들(같은 파일은 한 번만). */
export function deckVideos(slides) {
  return [...new Set((Array.isArray(slides) ? slides : []).map((d) => slideVideo(d).video?.src).filter(Boolean))];
}
/**
 * 그 그림(designId)에 딸린 영상 파일 가운데 이제 아무 데서도 쓰지 않는 것들의 열쇠(이 기기에서 지워도 되는 것).
 * - files: 이 기기에 있는 영상 파일들 [{ key, design(그 파일을 넣은 그림) }] · more: 그 밖에 살펴볼 열쇠들(지운 그림이 쓰던 것)
 * - used: 지금 쓰이는 열쇠들(그 그림의 지금 슬라이드 + 내가 아는 다른 모든 그림의 슬라이드)
 * 다른 그림에 딸린 파일은 건드리지 않는다.
 */
export function unusedVideos(files, designId, used, more = []) {
  const busy = new Set(used);
  const mine = (Array.isArray(files) ? files : []).filter((f) => f && f.design === designId).map((f) => f.key);
  return [...new Set([...mine, ...more])].filter((key) => typeof key === 'string' && key && !busy.has(key));
}

// Visual fields remain compatible with model.js; nested extension data is explicitly validated.
const ITEM_FIELDS = ['t', 'x', 'y', 'w', 'h', 'rot', 'op', 'lock', 'g', 'an', 'aw', 'em', 'lp', 'fx', 'fy', 'text', 'size', 'color', 'font', 'bold', 'italic', 'under', 'align', 'valign', 'lh', 'nowrap', 'hangingPunct', 'typeface', 'bgc', 'ch', 'shape', 'r', 'line', 'lc', 'hollow', 'art', 'yt', 'start', 'auto', 'url', 'path', 'mask', 'alt', 'stroke', 'shadow', 'from', 'to', 'head', 'dash', 'curve', 'elbow', 'fromSide', 'toSide', 'bend', 'turn', 'startShape', 'endShape', 'label', 'labelAt', 'avoid', 'labelSize', 'labelStyle', 'labelFont', 'fromPos', 'toPos'];   // 연결선의 자리(pts · vh)는 저장하지 않는다: 읽을 때 잇는 두 조각에서 다시 계산한다
const cleanSlide = (d, index, documentId) => {
  if (!d || typeof d !== 'object' || Array.isArray(d)) fail('INVALID_PAGE', `slides.${index}`, d);
  const pageId = d.id ?? legacyId('p', `${documentId}:page:${index}`);
  if (d.items !== undefined && !Array.isArray(d.items)) fail('INVALID_ITEMS', `slides.${index}.items`, d);
  const items = Array.isArray(d.items) ? d.items : [];
  validatePageInput({ ...d, items });
  return { bg: d.bg, ...slideExtra({ ...d, id: pageId }), items: items.map((item, i) => {
    const out = {};
    for (const k of ITEM_FIELDS) if (['string', 'number', 'boolean'].includes(typeof item[k])) out[k] = item[k];
    const crop=item.t==='image'?cleanCrop(item.crop):null;
    return { ...out, ...(crop?{crop}:{}), ...(item.layout==='slide'?{layout:'slide'}:{}), ...metadata({ ...item, id: item.id ?? legacyId('e', `${documentId}:${pageId}:${i}`) }, { identity: true }) };
  }) };
};
/**
 * 저장해 둔 기록 하나를 정리한다. { id, name, ratio, slides, updatedAt, … } 모양이 아니면 null.
 * 슬라이드(디자인)는 그대로 둔다(그릴 때 모듈의 cleanDesign 이 정리한다). 다만 터무니없이 큰 것은 받지 않는다.
 * 슬라이드가 생기기 전의 기록(design 하나)은 슬라이드 한 장짜리로 읽는다.
 */
export function cleanRecord(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  if (r.id !== undefined && !isDesignId(r.id)) return null;
  if (r.schemaVersion !== undefined && r.schemaVersion !== SCHEMA_VERSION) fail('UNSUPPORTED_SCHEMA', 'schemaVersion', raw, { supported: SCHEMA_VERSION });
  const one = r.design && typeof r.design === 'object' && !Array.isArray(r.design) ? [r.design] : null;
  const many = Array.isArray(r.slides) && r.slides.length ? r.slides : one;
  if (!many) return null;
  if (many.length > MAX_SLIDES) fail('PAGE_LIMIT', 'slides', raw, { limit: MAX_SLIDES, actual: many.length });
  const id = r.id ?? legacyId('d', JSON.stringify(raw));
  const slides = many.map((d, i) => cleanSlide(d, i, id));
  const preset = ratioOf(r.ratio);
  const pair = preset.id.split(':').map(Number);
  const size = cleanSize(r.size ?? r.originalSize ?? { width: pair[0], height: pair[1], unit: 'px' });
  const revision = r.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) fail('INVALID_REVISION', 'revision', raw);
  const out = {
    id, schemaVersion: SCHEMA_VERSION, revision,
    size, originalSize: cleanSize(r.originalSize ?? size, 'originalSize'),
    source: { kind: 'local' }, ...metadata(r), assets: cleanAssets(r.assets),
    name: cleanName(r.name) || '이름 없는 그림',
    ratio: `${size.width}:${size.height}`,
    slides,
    uploads: libraryOf(r.uploads, slides),
    updatedAt: Number.isFinite(r.updatedAt) && r.updatedAt > 0 ? r.updatedAt : 0,
  };
  validateReferences(out);
  return out;
}

/** Import/migration boundary. Rejection retains the exact input, with a machine-readable reason. */
export function migrateRecord(raw) {
  try {
    const record = cleanRecord(raw);
    if (!record) fail('INVALID_RECORD', 'document', raw);
    return record;
  } catch (error) {
    if (error instanceof DocumentError) error.original = raw;
    throw error;
  }
}
/** A copy has fresh identities; origin references describe where its content came from. */
export function copyRecord(raw) {
  const r = migrateRecord(raw), id = newDesignId();
  return migrateRecord({ ...r, id, revision: 0, name: `${r.name} 복사`, origin: { documentId: r.id, revision: r.revision },
    slides: r.slides.map(p => ({ ...p, id: newId('p'), ...(p.activity?{activity:{...p.activity,id:newId('a')}}:{}), origin: { documentId: r.id, pageId: p.id, revision: r.revision },
      items: p.items.map(e => ({ ...e, id: newId(), origin: { documentId: r.id, pageId: p.id, elementId: e.id, revision: r.revision } })) })) });
}

// ---------- 올린 파일 목록 ----------
const isPhotoData = (u) => typeof u === 'string' && u.length <= 3000000 && /^data:image\/(png|jpeg|webp);base64,/.test(u);
/** 슬라이드들에서 쓰는 사진(data 주소)들. 같은 사진은 한 번만. */
export function deckPhotos(slides) {
  const out = [];
  for (const d of Array.isArray(slides) ? slides : []) {
    for (const it of Array.isArray(d?.items) ? d.items : []) {
      if (it && it.t === 'image' && isPhotoData(it.url) && !out.includes(it.url)) out.push(it.url);
    }
  }
  return out;
}
/**
 * 올린 파일 목록을 정리한다: 올린 차례대로(uploads), 그 뒤에 슬라이드에서 쓰는데 목록에 없던 사진을 붙인다
 * (배경을 지워 새로 생긴 사진, 목록이 없던 예전 그림의 사진). 같은 사진은 한 번만, 사진이 아닌 것은 뺀다.
 */
export function libraryOf(uploads, slides) {
  const out = [];
  for (const u of [...(Array.isArray(uploads) ? uploads : []), ...deckPhotos(slides)]) {
    if (isPhotoData(u) && !out.includes(u)) out.push(u);
  }
  if (out.length > MAX_LIBRARY) fail('UPLOAD_LIMIT', 'uploads', uploads, { limit: MAX_LIBRARY });
  return out;
}
/** 그 사진을 뺀 슬라이드들(올린 파일을 지울 때 쓴 곳에서도 지운다). 바뀐 것이 없으면 받은 목록을 그대로 돌려준다. */
export function dropPhoto(slides, url) {
  let changed = false;
  const out = (Array.isArray(slides) ? slides : []).map((d) => {
    const items = (Array.isArray(d?.items) ? d.items : []).filter((it) => !(it && it.t === 'image' && it.url === url));
    if (items.length === (d?.items || []).length) return d;
    changed = true;
    return { ...d, items };
  });
  return changed ? out : slides;
}

/** 새 기록(빈 슬라이드 한 장). n 은 "그림 n" 이름에 쓸 번호. */
export function newRecord(ratio, n = 1, now = Date.now()) {
  return migrateRecord({ id: newDesignId(now), name: `그림 ${n}`, ratio: ratioOf(ratio).id, slides: [{ items: [] }], updatedAt: now });
}
/** 최근에 고친 것부터. */
export function sortRecords(list) {
  return list.slice().sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}
/** 다음 "그림 n" 번호: 이미 있는 번호 가운데 가장 큰 것 + 1. */
export function nextNumber(list) {
  const used = list.map((r) => /^그림 (\d+)$/.exec(r.name)).filter(Boolean).map((m) => Number(m[1]));
  return (used.length ? Math.max(...used) : 0) + 1;
}
/** 아무것도 없는 그림인지(모든 슬라이드에 요소도, 영상 장면도 없는지). */
export const isBlank = (record) => !(Array.isArray(record?.slides) && record.slides.some((d) => (Array.isArray(d?.items) && d.items.length) || hasVideo(d)));

/**
 * 내려받을 파일 이름(확장자 빼고). 영어·숫자로만 짓는다(한글 이름은 브라우저에 따라 이름이 사라질 수 있다).
 * page 를 주면 몇째 장인지 붙인다('…-03').
 */
export function fileName(now = new Date(), page = 0) {
  const p = (v) => String(v).padStart(2, '0');
  const base = `onbatang-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return page > 0 ? `${base}-${p(page)}` : base;
}

// ---------- 슬라이드 다루기(모두 새 목록을 돌려준다) ----------

const emptySlide = () => ({ id: newId('p'), items: [] });
/**
 * at 번째 슬라이드 뒤에 빈 슬라이드를 넣는다. [새 목록, 새 슬라이드의 번호]. 꽉 찼으면 [그대로, -1]. bg 를 주면 그 배경으로.
 * like 를 주면 그 슬라이드의 움직임(조합 효과 · 전환 효과)을 이어받는다(앞 장과 같은 모양으로 넘어가고 나오게).
 */
export function addSlide(slides, at, bg, like = null) {
  if (slides.length >= MAX_SLIDES) return [slides, -1];
  const i = Math.min(slides.length, Math.max(0, at + 1));
  const next = slides.slice();
  next.splice(i, 0, { ...emptySlide(), ...(bg === undefined ? {} : { bg }), ...slideMotion(like) });
  return [next, i];
}
/** at 번째 슬라이드를 복제해 바로 뒤에 넣는다. [새 목록, 복제된 것의 번호]. 꽉 찼으면 [그대로, -1]. */
export function copySlide(slides, at) {
  if (slides.length >= MAX_SLIDES || !slides[at]) return [slides, -1];
  const next = slides.slice();
  const original = slides[at], page = JSON.parse(JSON.stringify(original));
  page.id = newId('p');
  if(page.activity)page.activity.id=newId('a');
  if (original.id) page.origin = { pageId: original.id };
  const ids = new Map();
  page.items = page.items.map(e => { const id = newId(); if (e.id) ids.set(e.id, id); return { ...e, id, ...(e.id ? { origin: { elementId: e.id, ...(original.id ? { pageId: original.id } : {}) } } : {}) }; });
  page.items = relink(page.items, ids);          // 연결선은 복제한 장의 두 조각을 잇는다
  next.splice(at + 1, 0, page);
  return [next, at + 1];
}
/** at 번째 슬라이드를 지운다. 마지막 한 장은 지우지 않고 비운다. [새 목록, 이어서 보여 줄 번호] */
export function removeSlide(slides, at) {
  if (!slides[at]) return [slides, at];
  if (slides.length === 1) return [[emptySlide()], 0];
  const next = slides.filter((_, i) => i !== at);
  return [next, Math.min(at, next.length - 1)];
}
/** at 번째 슬라이드를 앞(-1)이나 뒤(+1)로 옮긴다. [새 목록, 옮긴 뒤의 번호] */
export function moveSlide(slides, at, step) {
  const to = at + step;
  if (!slides[at] || to < 0 || to >= slides.length) return [slides, at];
  const next = slides.slice();
  [next[at], next[to]] = [next[to], next[at]];
  return [next, to];
}
/** '10월 4일 10:30' 처럼. */
export function whenText(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 사진 한 장의 한도(data 주소의 글자 수). 넘으면 setup.js 가 더 작게 줄인다(기기의 저장 공간을 아낀다). */
export const PHOTO_MAX_CHARS = 1000000;

/**
 * 들여 쓰는 곳의 표시(이름과 로고 그림 주소)를 정리한다. 꾸미는 화면 위 막대 맨 앞에 작게 놓는다.
 * 로고는 같은 곳의 상대 주소·https·그림 data 주소만 받는다. 아니면 표시하지 않는다(null).
 */
export function cleanBrand(raw) {
  const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
  const logo = typeof raw?.logo === 'string' ? raw.logo.trim() : '';
  if (!name || name.length > 40 || !logo || logo.length > 2000 || logo.startsWith('//')) return null;
  if (!/^(?:https:\/\/|data:image\/(?:png|jpeg|webp|svg\+xml)[;,]|\.{0,2}\/|[a-z0-9_-]+\/)/i.test(logo) || /^[a-z][a-z0-9+.-]*:/i.test(logo) && !/^(?:https|data):/i.test(logo)) return null;
  return { name, logo };
}
