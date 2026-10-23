// 온바탕 편집기의 규칙(모델): 카드 위에 놓는 요소(텍스트·그래픽·도형·사진)의 모양과 정리, 끌기·크기·돌리기 계산, 템플릿.
// (발표할 때의 움직임 규칙은 motion.js 에 따로 있다. 여기서는 그 값을 정리해 주기만 한다.)
// DOM 도 저장소도 쓰지 않는 순수 함수만 둔다. 그래서 node 에서 그대로 테스트할 수 있고, 어떤 프로젝트에도 옮겨 쓸 수 있다.
//
// 디자인 한 장은 { bg, items } 이다.
//   - bg: 배경. 정해 둔 이름(BACKGROUNDS 의 id) 또는 '#rrggbb'.
//   - items: 요소들. 뒤에 있을수록 위에 보인다.
//   - video(있을 때만): 영상 장면. 이 장의 바탕에 까는 영상 { src, dur, in, out, vol, fit, auto }. 요소들은 그 위에 놓인다(아래 "영상 장면").
//     auto: true 면 장이 열리면 바로 튼다. 없으면 발표하다가 누를 때(다음 장으로) 튼다(PowerPoint 의 "클릭할 때"와 같다. 그때까지 첫 모습으로 기다린다).
// 자리(x, y)는 요소의 가운데 점을 카드의 가로·세로에 대한 백분율로, 크기(w)는 카드 너비에 대한 백분율로 적는다.
// 글자 크기(size)도 카드 너비를 100 으로 본 값이라, 카드가 커지거나 작아져도 모양이 그대로다.
//
// 프로젝트마다 다른 것(글꼴 목록, 어떤 그림 주소를 믿을지, 카드 비율, 개수 한도)은 configure() 로 한 번 정해 둔다.
import { SHAPE_ASSETS, SHAPE_GROUPS, shapeAsset } from './shapes.js';
import { isArtId, artColorable, artAspect, artPack, artName } from './art.js';
import { isYouTubeId, ytStart, ytTime } from './youtube.js';
import { ENTER_IDS, COMBO_IDS, TRANSITION_IDS, EMPHASIS_IDS, IDLE_IDS, EXIT_IDS, SPEED_IDS, DELAY_MAX, STILL } from './motion.js';
import { metadata, newId, fail, validatePageInput, isSlideItem, itemTextLimit, pageLimits, slideNotes, slideHidden, slideTopic, slideDur, cleanAlt, ALT_LIMIT } from './document.js';
export { cleanAlt, ALT_LIMIT };
import { cleanActivity } from './activity.js';
import { cleanCrop } from './crop.js';
import { LINK_HEADS, LINK_LINE, LINK_SIDES, LINK_BEND, LINK_SHAPES, LINK_LABEL_MAX, LINK_LABEL_AT, LINK_LABEL_SIZES, LINK_LABEL_STYLES, LINK_POS, CURVE_BEND, layoutLinks } from './links.js';

export { SHAPE_GROUPS };

export const MAX_ITEMS = 24;          // 카드 한 장에 놓을 수 있는 요소 수(기본값)
export const MAX_ITEM_TEXT = 120;     // 글상자 하나의 글자 수(기본값)
export const MAX_PHOTOS = 3;          // 카드 한 장에 넣을 수 있는 사진 수(기본값)

/** 배경 색(기본 목록). ink 는 그 위에 올릴 글자색, accent 는 강조색. */
export const BACKGROUNDS = [
  { id: 'navy', name: '남색', bg: '#26318f', ink: '#ffffff', accent: '#ffd43b' },
  { id: 'paper', name: '종이', bg: '#fffdf5', ink: '#1d2433', accent: '#d9480f' },
  { id: 'sky', name: '하늘', bg: '#d0ebff', ink: '#12305a', accent: '#1864ab' },
  { id: 'sun', name: '햇살', bg: '#ffd43b', ink: '#3b2f00', accent: '#8a4b00' },
  { id: 'mint', name: '민트', bg: '#d3f9d8', ink: '#123d1c', accent: '#2b8a3e' },
  { id: 'rose', name: '분홍', bg: '#ffe3e3', ink: '#5c1a1a', accent: '#c92a2a' },
  { id: 'grape', name: '보라', bg: '#5f3dc4', ink: '#ffffff', accent: '#ffe066' },
  { id: 'night', name: '밤하늘', bg: '#1d2433', ink: '#f8f9fa', accent: '#74c0fc' },
];
export const DEFAULT_BG = 'paper';

/** 기본 글꼴: 기기에 들어 있는 글꼴 하나. 프로젝트의 글꼴은 configure({ fonts }) 로 더한다. */
export const DEFAULT_FONT = 'gothic';
const SYSTEM_FONT = { id: DEFAULT_FONT, name: '기본', desc: '기기에 들어 있는 글씨' };

// 기본으로 믿는 그림 주소: https 주소, 이 화면에서 만든 blob 주소, 그림 data 주소.
// 다른 사람이 쓴 디자인을 보여 주는 프로젝트라면 configure({ cleanImage }) 로 "우리 저장소의 주소만"처럼 좁혀야 한다.
function defaultCleanImage(img) {
  const url = typeof img?.url === 'string' ? img.url : '';
  const ok = /^https:\/\/[^\s"'<>]+$/.test(url) ? url.length <= 2000
    : /^blob:[^\s"'<>]+$/.test(url) ? url.length <= 500
      : /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url) && url.length <= 4000000;
  if (!ok) return null;
  return typeof img.path === 'string' && img.path ? { path: img.path.slice(0, 300), url } : { url };
}

const config = {
  fonts: [SYSTEM_FONT],
  fontAliases: {},
  cleanImage: defaultCleanImage,
  backgrounds: BACKGROUNDS,
  aspect: 1,
  maxItems: MAX_ITEMS,
  maxPhotos: MAX_PHOTOS,
  maxUploads: 0,              // 올린 파일 목록에 둘 수 있는 파일 수. 0 이면 목록을 쓰지 않는다(올리면 바로 카드에 놓이기만 한다)
  photoEdge: 800,             // 넣는 사진의 긴 쪽(px)
  maxText: MAX_ITEM_TEXT,
  layouts: null,              // null 이면 아래 LAYOUTS
  motion: false,              // 참이면 편집기에 움직임(애니메이션)을 고르는 칸이 나온다(발표 화면이 있는 프로젝트만 켠다)
  motionNote: '',             // 움직임 칸 아래의 안내 글(비우면 기본 글). 움직임이 어디에서 보이는지는 프로젝트마다 다르다
  loadVideo: null,            // 영상 장면의 파일을 꺼내 주는 함수(열쇠 → Blob 또는 null). 영상 장면을 쓰는 프로젝트만 준다
};

/**
 * 프로젝트에 맞게 한 번 정해 둔다(화면을 그리기 전에). 준 것만 바뀐다.
 * - fonts: [{ id, name, desc?, url?, family?, special? }] 기본 글꼴 뒤에 붙는다. url 이 있으면 fonts.js 가 그 파일을 글꼴로 알린다.
 *          family 는 화면에 쓸 글꼴 이름(없으면 'mc-' + id).
 * - fontAliases: { 옛 id: 새 id } 예전에 저장된 글꼴 이름을 이어 줄 때.
 * - cleanImage(img): 그림 정보 { url, path? } 를 살펴 믿을 수 있으면 { url, path? } 를, 아니면 null 을 돌려주는 함수.
 * - backgrounds: [{ id, name, bg, ink, accent? }] 배경 색 목록.
 * - aspect: 카드의 가로 ÷ 세로(정사각형 1, 16:9 는 16 / 9, 세로 4:5 는 0.8).
 * - maxItems · maxPhotos · maxText: 카드 한 장의 한도.
 * - maxUploads: 올린 파일 목록에 둘 수 있는 파일 수(기본 0: 목록을 쓰지 않는다). 1 이상이면 업로드 칸에 올린 파일들이 나오고,
 *               눌러서 다시 넣거나 지울 수 있다. 목록은 편집기의 getUploads() 로 꺼내 디자인과 함께 저장한다(편집기를 만들 때 uploads 로 다시 준다).
 * - photoEdge: 넣는 사진을 줄일 때의 긴 쪽(px, 400~2400. 기본 800). 크게 내보낼 프로젝트는 키운다(사진 파일이 커진다).
 * - motion: 참이면 편집기에서 움직임을 고를 수 있다(요소가 나타나는 효과 · 조합 효과 · 전환 효과. motion.js). 기본은 꺼져 있다:
 *           움직임은 발표 화면처럼 그것을 트는 화면이 있어야 쓸모가 있다(motion.js 의 playDesign · playTransition 으로 튼다).
 * - motionNote: 움직임 칸 아래에 적을 안내 글(120자까지). 움직임이 어디에서 보이는지 알려 준다. 비우면 "발표를 누르면 보여요 …" 가 나온다.
 * - loadVideo(src): 영상 장면의 파일(Blob)을 돌려주는 함수(비동기 가능. 이 기기에 없으면 null). 디자인에는 파일의 열쇠(src)만 들어 있어서,
 *                   영상 장면을 그리거나 트는 곳(scene.js)이 이것으로 파일을 꺼낸다. 주지 않으면 영상 장면은 "영상이 없어요"로 보인다.
 * - layouts: 템플릿 목록(LAYOUTS 와 같은 모양). items 는 목록 대신 함수여도 된다: items(aspect) 가 그 모양(가로 ÷ 세로)에 맞는 요소들을 돌려준다
 *            (정사각형과 가로로 긴 카드의 배치를 달리할 때).
 */
export function configure(next = {}) {
  if (Array.isArray(next.fonts)) {
    config.fonts = [SYSTEM_FONT, ...next.fonts.filter((f) => f && typeof f.id === 'string' && f.id !== DEFAULT_FONT && /^[\w-]+$/.test(f.id))];
  }
  if (next.fontAliases && typeof next.fontAliases === 'object') config.fontAliases = { ...next.fontAliases };
  if (typeof next.cleanImage === 'function') config.cleanImage = next.cleanImage;
  if (Array.isArray(next.backgrounds) && next.backgrounds.length) config.backgrounds = next.backgrounds;
  if (Number.isFinite(next.aspect) && next.aspect > 0) config.aspect = Math.min(4, Math.max(0.25, next.aspect));
  if (Number.isFinite(next.photoEdge) && next.photoEdge >= 400 && next.photoEdge <= 2400) config.photoEdge = Math.round(next.photoEdge);
  for (const key of ['maxItems', 'maxPhotos', 'maxText', 'maxUploads']) {
    if (Number.isInteger(next[key]) && next[key] >= 0) config[key] = next[key];
  }
  if (Array.isArray(next.layouts)) config.layouts = next.layouts;
  if (typeof next.motion === 'boolean') config.motion = next.motion;
  if (typeof next.motionNote === 'string') config.motionNote = next.motionNote.trim().slice(0, 120);
  if (typeof next.loadVideo === 'function' || next.loadVideo === null) config.loadVideo = next.loadVideo;
  return settings();
}
/** 지금 설정(읽기용 사본). */
export function settings() {
  return { ...config, fonts: config.fonts.slice(), layouts: config.layouts || LAYOUTS };
}

/** 고를 수 있는 글꼴 전부(기본 글꼴이 맨 앞). */
export function fontList() {
  return config.fonts.slice();
}
/** 화면에 쓸 글꼴 이름(CSS font-family 의 첫 이름). 기본 글꼴이나 목록에 없는 id 면 빈 문자열. */
export function fontFamilyOf(id) {
  if (id === DEFAULT_FONT) return '';
  const f = config.fonts.find((k) => k.id === id);
  return f ? (f.family || `mc-${f.id}`) : '';
}
const cleanFont = (raw) => {
  const id = typeof raw === 'string' && Object.hasOwn(config.fontAliases, raw) ? config.fontAliases[raw] : raw;
  return config.fonts.some((f) => f.id === id) ? id : DEFAULT_FONT;
};

/** 글자·도형 색. */
export const COLORS = [
  { hex: '#1d2433', name: '검정' },
  { hex: '#ffffff', name: '하양' },
  { hex: '#868e96', name: '회색' },
  { hex: '#e03131', name: '빨강' },
  { hex: '#f76707', name: '주황' },
  { hex: '#ffd43b', name: '노랑' },
  { hex: '#2f9e44', name: '초록' },
  { hex: '#1c7ed6', name: '파랑' },
  { hex: '#26318f', name: '남색' },
  { hex: '#7048e8', name: '보라' },
  { hex: '#e64980', name: '분홍' },
  { hex: '#8d5524', name: '갈색' },
];

/** 카드에 놓을 수 있는 도형·꾸밈 요소(이름과 분류). 그림과 기본 크기·색은 shapes.js 에 있다. */
export const SHAPES = SHAPE_ASSETS.map(({ id, name, group }) => ({ id, name, group }));

export const ALIGNS = ['l', 'c', 'r'];
export const TEXT_SIZE = { min: 2.5, max: 30 };
// Imported slides contain small labels and thin rules. Keep the ordinary editing
// defaults, while preserving these authored dimensions through cleaning and edits.
// The render-only layout marker survives guest projections that strip provenance.
const pptxItem = isSlideItem;
// Office defaults imported slide paragraphs to hanging punctuation. Keep an
// explicit false: public render-only items lose private source metadata.
export const hangsPunctuation = item => typeof item?.hangingPunct === 'boolean'
  ? item.hangingPunct : pptxItem(item);
export const textLimit = item => itemTextLimit(item, config.maxText);
const textMin = item => pptxItem(item) ? 0.1 : TEXT_SIZE.min;
const widthMin = item => pptxItem(item) ? 0.1 : 10;
const shapeMin = item => pptxItem(item) ? 0.01 : SIZE.min;
const heightMin = item => pptxItem(item) ? 0.01 : 0.6;
const LOCAL_TYPEFACES = ['Arial','Calibri','Aptos','Malgun Gothic','맑은 고딕','돋움','Gulim','굴림','학교안심 이어달리기 L','학교안심 바른돋움 B'];
/** 투명도: 100 이면 또렷하고, 낮을수록 비쳐 보인다. 아예 안 보이면 다시 고르기 어려워 10 까지만. */
export const OPACITY = { min: 10, max: 100 };
/** 사진의 테두리 모양. */
export const MASKS = [
  { id: 'none', name: '네모' },
  { id: 'round', name: '둥글게' },
  { id: 'circle', name: '동그라미' },
];
/**
 * 도형의 테두리 굵기(카드 너비를 100 으로 본 값). 막대는 1~10 단계이고 한 단계가 step 이다. base 는 처음 두를 때의 굵기.
 * 굵기는 요소를 키우거나 줄여도 그대로다.
 */
export const EDGE = { min: 0.4, max: 4, step: 0.4, base: 1.2 };
// 모서리 둥글기를 정하지 않은 둥근 네모는 예전처럼 카드 너비의 4% 로 둥글다(editor.css 의 .sh-round).
const OLD_ROUND = 4;
const SIZE = { min: 2, max: 140 };
const PHOTO_MIN = 5;
const photoMin = item => pptxItem(item) ? 0.1 : PHOTO_MIN;
const PHOTO_MAX = 300;          // 사진은 카드보다 크게 키워 배경처럼 깔 수 있다
const shapeIds = SHAPES.map((s) => s.id);
const maskIds = MASKS.map((m) => m.id);

const num = (v, lo, hi, fallback, precision = 10) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(hi, Math.max(lo, n)) * precision) / precision;
};
const measure = (item, ...args) => num(...args, pptxItem(item) ? 10000 : 10);
// Screen-pixel nudges and anchored resizing need sub-tenth-percent positions,
// including after save/reopen. Dimension limits and their precision stay intact.
const position = (value, fallback) => num(value, 0, 100, fallback, 10000);
// 숫자로 적힌 값인가(없는 값·빈 글·글자는 아니다). "정하지 않음"과 0 을 가려야 하는 값에 쓴다.
const given = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v));

/** '#rrggbb' 만 색으로 받는다(소문자로). 아니면 fallback. */
export function cleanColor(raw, fallback = '#1d2433') {
  const s = String(raw ?? '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(s) ? s : fallback;
}

/** 배경 색 위에 올릴 글자색: 밝은 배경에는 어두운 글자, 어두운 배경에는 흰 글자. */
export function inkFor(hex) {
  const c = cleanColor(hex, '#ffffff');
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 >= 150 ? '#1d2433' : '#ffffff';
}

/** 배경. 목록의 이름이면 그것을, '#rrggbb' 면 그 색을(글자색은 밝기에 맞춰 정한다), 모르는 값이면 기본 배경을 돌려준다. */
export function backgroundOf(id) {
  const hex = cleanColor(id, '');
  if (hex) return { id: hex, name: '고른 색', bg: hex, ink: inkFor(hex), accent: inkFor(hex) };
  const list = config.backgrounds;
  return list.find((b) => b.id === id) || list.find((b) => b.id === DEFAULT_BG) || list[0];
}
/** 배경 값을 정리한다: 목록의 이름이나 '#rrggbb' 만 남기고, 아니면 기본 배경. */
export function cleanBg(raw) {
  return config.backgrounds.some((b) => b.id === raw) ? raw : cleanColor(raw, backgroundOf(DEFAULT_BG).id);
}

/** 그림 정보를 살펴 { url, path? } 로 정리한다(믿을 수 없는 주소면 null). 무엇을 믿을지는 configure({ cleanImage }) 가 정한다. */
export function cleanImg(img) {
  if (!img || typeof img !== 'object') return null;
  const out = config.cleanImage(img);
  return out && typeof out.url === 'string' ? out : null;
}

/** 글을 max 글자(UTF-16 단위)까지 자르되, 이모지처럼 두 칸짜리 글자가 반으로 잘려 깨지지 않게 한다(깨진 글자는 저장이 안 된다). */
export function clip(text, max) {
  const s = String(text ?? '').slice(0, max);
  const last = s.charCodeAt(s.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? s.slice(0, -1) : s;
}

const lines = (raw) => String(raw ?? '').split(/\r\n|\r|\n/).map((l) => l.replace(/[ \t]+/g, ' ').trim())
  .join('\n').replace(/\n{3,}/g, '\n\n').trim();

/**
 * 놓은 것 하나를 저장할 수 있는 모양으로 정리한다. 모르는 종류이거나 내용이 없으면 null.
 * keepSpaces: 쓰는 중인 글이라 공백을 줄이지 않고 길이만 맞춘다(빈 글상자도 남긴다).
 */
export function cleanItem(item, { keepSpaces = false } = {}) {
  const it = item && typeof item === 'object' ? item : {};
  const base = {
    ...metadata(it),
    ...(pptxItem(it) ? {layout:'slide'} : {}),
    x: position(it.x, 50), y: position(it.y, 50), rot: Math.round(num(it.rot, -180, 180, 0)),
    op: Math.round(num(it.op, pptxItem(it) ? 0 : OPACITY.min, OPACITY.max, OPACITY.max)), // 빈 PPT 객체도 이름표를 보존한다.
    lock: it.lock === true,                                                // 잠금(실수로 움직이지 않게)
  };
  // 이름표(id)는 있을 때만 남긴다: 여럿이 함께 꾸미는 프로젝트가 요소를 가려낼 때 쓴다(틴커랩 미니캔의 "함께 만드는 그림"). 혼자 쓰는 그림에는 없다.
  if (typeof it.id === 'string' && /^[a-z][a-z0-9]{5,31}$/.test(it.id)) base.id = it.id;
  // 그룹(g): 같은 표를 단 요소들은 한 번에 고르고 함께 옮긴다. 그룹으로 묶었을 때만 적는다.
  if (typeof it.g === 'string' && GROUP_ID.test(it.g)) base.g = it.g;
  // 움직임(발표할 때)은 정했을 때만 적는다. an: 나타나는 효과(또는 'none' = 가만히) · aw: 누를 때 나타난다(motion.js).
  if (ENTER_IDS.includes(it.an) || it.an === STILL) base.an = it.an;
  if (it.aw === true) base.aw = true;
  if (EMPHASIS_IDS.includes(it.em)) base.em = it.em;          // 강조 효과: 누를 때 한 번 움직인다
  if (IDLE_IDS.includes(it.lp) || it.lp === STILL) base.lp = it.lp;   // 계속 움직이기: 다 나온 뒤 장에 머무는 동안 되풀이해 움직인다('none' = 조합 효과가 있어도 가만히)
  if (EXIT_IDS.includes(it.ex)) base.ex = it.ex;              // 사라지는 효과: 누를 때 사라진다(나타나기 · 강조 다음 차례)
  if (SPEED_IDS.includes(it.sp)) base.sp = it.sp;             // 빠르기: 그 요소의 모든 움직임을 빠르게 · 느리게
  if (Number.isFinite(it.dl) && Math.round(Math.min(DELAY_MAX, it.dl) * 10) > 0) base.dl = Math.round(Math.min(DELAY_MAX, it.dl) * 10) / 10;   // 늦추기(초, 0.1 단위): 장이 열릴 때 제 차례보다 늦게
  const flip = { fx: it.fx === true, fy: it.fy === true };                 // 좌우·상하 뒤집기
  if (it.t === 'text') {
    const text = clip(keepSpaces ? String(it.text ?? '') : lines(it.text), textLimit(it));
    if (!text && !keepSpaces) return null;
    return {
      t: 'text', ...base, w: measure(base,it.w, widthMin(base), 100, 80), text,
      size: measure(base,it.size, textMin(base), TEXT_SIZE.max, 7),
      ...(typeof it.hangingPunct === 'boolean' ? {hangingPunct:it.hangingPunct} : {}),
      // 줄 간격(글자 크기의 배수). 가져온 PPT 의 값도, 도구 막대의 줄 간격 단계도 이것이다. 정하지 않으면 기본(1.3).
      ...(given(it.lh) ? {lh:measure(base,it.lh,0.5,4,1.25)} : {}),
      // 글 테두리(stroke: 색) · 그림자(shadow): 사진 위 제목이 잘 읽히게. 정했을 때만 적는다.
      ...(it.stroke ? {stroke: cleanColor(it.stroke, '#ffffff')} : {}),
      ...(it.shadow === true ? {shadow: true} : {}),
      ...(pptxItem(base) ? {
        ...(given(it.h) ? {h:measure(base,it.h,0.01,140,10),valign:['top','middle','bottom'].includes(it.valign)?it.valign:'top'} : {}),
        ...(it.nowrap===true ? {nowrap:true} : {}),
        ...(LOCAL_TYPEFACES.includes(it.typeface) ? {typeface:it.typeface} : {}),
      } : {}),
      color: cleanColor(it.color),
      font: cleanFont(it.font),
      bold: it.bold === true,
      italic: it.italic === true,
      under: it.under === true,
      align: ALIGNS.includes(it.align) ? it.align : 'c',
      bgc: it.bgc ? cleanColor(it.bgc, '') : '',
    };
  }
  if (it.t === 'emoji') {
    const ch = typeof it.ch === 'string' ? it.ch.trim().slice(0, 16) : '';
    if (!ch) return null;
    return { t: 'emoji', ...base, ...flip, w: num(it.w, 4, SIZE.max, 20), ch };
  }
  if (it.t === 'shape') {
    const out = {
      t: 'shape', ...base, ...flip, w: measure(base,it.w, shapeMin(base), SIZE.max, 30), h: measure(base,it.h, heightMin(base), SIZE.max, 30),
      shape: shapeIds.includes(it.shape) ? it.shape : 'rect',
      color: cleanColor(it.color, '#1c7ed6'),
    };
    // 꾸밈(모서리·테두리)은 정했을 때만 적는다. 그래서 예전에 저장한 도형은 정리해도 그 모양 그대로다.
    const asset = shapeAsset(out.shape);
    // r: 모서리 둥글기(0~100). 짧은 변의 절반에 대한 % 라서 100 이면 양 끝이 반원이 된다. 크기를 바꿔도 둥근 정도가 그대로다.
    if (asset.corner && given(it.r)) out.r = Math.round(num(it.r, 0, 100, 0));
    // line: 테두리 굵기 · lc: 테두리 색 · hollow: 속을 비운다(테두리만). 테두리가 없으면 속을 비울 수 없다(보이지 않게 되므로).
    if (asset.edge && Number(it.line) > 0) {
      out.line = measure(base,it.line, pptxItem(base)?0.01:EDGE.min, EDGE.max, EDGE.base);
      out.lc = cleanColor(it.lc, out.color);
      if (it.hollow === true) out.hollow = true;
    }
    return out;
  }
  if (it.t === 'art') {
    // 그림 묶음의 그림(art.js): 이름만 저장한다. 한 가지 색으로 그린 묶음(선 아이콘 · 픽셀)만 색을 적는다.
    if (!isArtId(it.art) || !artPack(it.art)) return null;
    const out = { t: 'art', ...base, ...flip, w: num(it.w, SIZE.min, SIZE.max, 22), h: num(it.h, 0.6, SIZE.max, 22), art: it.art };
    if (artColorable(it.art)) out.color = cleanColor(it.color, '#1d2433');
    return out;
  }
  if (it.t === 'yt') {
    // 유튜브 영상(youtube.js): 영상의 이름표와 시작 시각만 저장한다. 뒤집지 않는다(글자가 거꾸로 보이므로).
    if (!isYouTubeId(it.yt)) return null;
    const out = { t: 'yt', ...base, w: num(it.w, SIZE.min, SIZE.max, 60), h: num(it.h, 0.6, SIZE.max, 60), yt: it.yt };
    const start = ytStart(it.start);
    if (start) out.start = start;
    if (it.auto === true) out.auto = true;          // 발표할 때 장이 열리면 바로 튼다(아니면 스페이스 바를 누를 때)
    return out;
  }
  if (it.t === 'link') {
    // 연결선(links.js): 잇는 두 조각의 이름표와 꾸밈만 저장한다. 자리(x·y·w·h·pts·vh)는 cleanItems 가 두 조각에서 다시 계산한다.
    const isRef = (v) => typeof v === 'string' && /^[a-z][a-z0-9]{5,31}$/.test(v);
    if (!isRef(it.from) || !isRef(it.to) || it.from === it.to) return null;
    const out = {
      t: 'link', ...base, rot: 0, from: it.from, to: it.to,
      head: LINK_HEADS.includes(it.head) ? it.head : 'end',
      color: cleanColor(it.color, '#1d2433'),
      line: Math.round(num(it.line, LINK_LINE.min, LINK_LINE.max, LINK_LINE.base) * 100) / 100,
      // 점선: true(긴 점선) · 'dot'(동글 점) · 'dashdot'(긴 점과 점)
      ...(it.dash === true || it.dash === 'dot' || it.dash === 'dashdot' ? { dash: it.dash } : {}),
      // 머리 모양(처음 모양인 뾰족 화살표면 적지 않는다)
      ...(LINK_SHAPES.includes(it.startShape) && it.startShape !== 'arrow' ? { startShape: it.startShape } : {}),
      ...(LINK_SHAPES.includes(it.endShape) && it.endShape !== 'arrow' ? { endShape: it.endShape } : {}),
      // 선 위의 글: 한 줄(줄바꿈 · 겹친 띄어쓰기는 한 칸으로), LINK_LABEL_MAX 자까지
      ...(typeof it.label === 'string' && it.label.trim() ? { label: Array.from(it.label.replace(/\s+/g, ' ').trim()).slice(0, LINK_LABEL_MAX).join('') } : {}),
      ...(typeof it.label === 'string' && it.label.trim() && Number.isFinite(it.labelAt) && num(it.labelAt, LINK_LABEL_AT.min, LINK_LABEL_AT.max, 0.5, 1000) !== 0.5 ? { labelAt: num(it.labelAt, LINK_LABEL_AT.min, LINK_LABEL_AT.max, 0.5, 1000) } : {}),
      // 선 위 글의 크기 · 모양 · 글꼴(글이 있을 때만, 처음 값이면 적지 않는다)
      ...(typeof it.label === 'string' && it.label.trim() && Object.hasOwn(LINK_LABEL_SIZES, it.labelSize) ? { labelSize: it.labelSize } : {}),
      ...(typeof it.label === 'string' && it.label.trim() && LINK_LABEL_STYLES.includes(it.labelStyle) ? { labelStyle: it.labelStyle } : {}),
      ...(typeof it.label === 'string' && it.label.trim() && typeof it.labelFont === 'string' && cleanFont(it.labelFont) === it.labelFont && it.labelFont !== DEFAULT_FONT ? { labelFont: it.labelFont } : {}),
      // 곡선과 꺾인 선은 둘 중 하나(둘 다 적혀 있으면 꺾인 선)
      ...((it.elbow === 1 || it.elbow === -1) ? { elbow: it.elbow } : it.curve === 1 || it.curve === -1 ? { curve: it.curve } : {}),
      // 피해 가기: 꺾인 선만(다른 조각을 뚫지 않는 길을 스스로 찾는다)
      ...(it.avoid === true && (it.elbow === 1 || it.elbow === -1) ? { avoid: true } : {}),
      // 붙는 곳(없으면 알아서). 꾸밈이 아니라 잇는 자리라 스타일 복사에는 넣지 않는다.
      ...(LINK_SIDES.includes(it.fromSide) ? { fromSide: it.fromSide } : {}),
      ...(LINK_SIDES.includes(it.toSide) ? { toSide: it.toSide } : {}),
      // 고른 옆 위의 자리(가운데면 적지 않는다)
      ...(LINK_SIDES.includes(it.fromSide) && Number.isFinite(it.fromPos) && num(it.fromPos, LINK_POS.min, LINK_POS.max, 0.5, 100) !== 0.5 ? { fromPos: num(it.fromPos, LINK_POS.min, LINK_POS.max, 0.5, 100) } : {}),
      ...(LINK_SIDES.includes(it.toSide) && Number.isFinite(it.toPos) && num(it.toPos, LINK_POS.min, LINK_POS.max, 0.5, 100) !== 0.5 ? { toPos: num(it.toPos, LINK_POS.min, LINK_POS.max, 0.5, 100) } : {}),
    };
    // 손잡이로 고친 곡선의 깊이 · 꺾이는 자리(그 모양일 때만, 처음 값이면 적지 않는다)
    if (out.curve && Number.isFinite(it.bend)) { const b = num(it.bend, LINK_BEND.min, LINK_BEND.max, CURVE_BEND, 1000); if (b !== CURVE_BEND) out.bend = b; }
    if (out.elbow && Number.isFinite(it.turn)) { const v = num(it.turn, 0, 1, 0.5, 1000); if (v !== 0.5) out.turn = v; }
    // 계산해 둔 자리는 그대로 받아 두었다가(그릴 때 바로 쓰게) cleanItems 에서 새로 맞춘다.
    if (Array.isArray(it.pts) && [4, 6, 8].includes(it.pts.length) && it.pts.every(Number.isFinite) && [it.w, it.h, it.vh].every((v) => Number.isFinite(v) && v > 0)) Object.assign(out, { w: it.w, h: it.h, vh: it.vh, pts: [...it.pts] });
    else Object.assign(out, { w: 1, h: 1, vh: 1, pts: [0, 0, 0, 0] });
    return out;
  }
  if (it.t === 'image') {
    const img = cleanImg(it);
    if (!img) return null;
    const crop = cleanCrop(it.crop);
    return {
      t: 'image', ...base, ...flip, w: measure(base,it.w, photoMin(base), photoMax().w, 50), h: measure(base,it.h, photoMin(base), photoMax().h, 50),
      mask: maskIds.includes(it.mask) ? it.mask : 'none', ...img, ...(crop ? {crop} : {}),
      // 그림 설명(대체 텍스트): 화면 읽기 프로그램과 PPTX 의 설명 칸에 쓴다.
      ...(cleanAlt(it.alt) ? {alt: cleanAlt(it.alt)} : {}),
    };
  }
  return null;
}

/** 도구 막대의 줄 간격 단계(글자 크기의 배수). */
export const LINE_SPACINGS = [1, 1.15, 1.3, 1.5, 2];

/** 요소들을 정리한다. 한도(기본 24개, 사진 3장)까지만 남긴다. */
export function cleanItems(items, opts) {
  const limits = pageLimits({items}, {items:config.maxItems,photos:config.maxPhotos,text:config.maxText});
  if (opts?.strict) validatePageInput({ items }, limits);
  const out = [];
  let photos = 0;
  for (const raw of Array.isArray(items) ? items : []) {
    const it = cleanItem(raw, opts);
    if (!it) { if (opts?.strict) fail('UNSUPPORTED_ELEMENT', 'items', items); continue; }
    if (it.t === 'image' && ++photos > limits.photos) continue;
    out.push(it);
    if (out.length >= limits.items) break;
  }
  // 연결선은 잇는 두 조각에서 자리를 다시 계산한다(조각이 없어진 선은 빠진다).
  return layoutLinks(out, config.aspect);
}

/**
 * 디자인 한 장 { bg, items } 을 저장하거나 그릴 수 있는 모양으로 정리한다.
 * 저장소에서 읽어 온 값, 다른 사람이 만든 값은 그리기 전에 꼭 이것을 거친다(모르는 값·믿을 수 없는 그림 주소는 버려진다).
 */
export function cleanDesign(design, opts) {
  const d = design && typeof design === 'object' ? design : {};
  const options = d.id ? { ...opts, strict: true, keepSpaces: true } : opts;
  return { ...metadata(d, { identity: true }), bg: cleanBg(d.bg), items: cleanItems(d.items, options), ...designMotion(d), ...designVideo(d), ...slideNotes(d), ...slideHidden(d), ...slideTopic(d), ...slideDur(d), ...(d.activity === undefined ? {} : {activity:cleanActivity(d.activity)}) };
}
/**
 * 디자인의 움직임: pa(요소들의 조합 효과) · tr(이 장이 넘어올 때의 전환 효과). 정해 둔 것만 담아 돌려준다(없으면 빈 객체).
 * 디자인을 새로 짜 맞추는 곳({ bg, items } 를 만드는 곳)에서 이것을 함께 펼쳐 넣으면 움직임이 따라간다.
 */
export function designMotion(design) {
  const out = {};
  if (COMBO_IDS.includes(design?.pa)) out.pa = design.pa;
  if (TRANSITION_IDS.includes(design?.tr)) out.tr = design.tr;
  return out;
}

// ---------- 영상 장면(한 장의 바탕에 까는 영상) ----------
// 영상 파일 그 자체는 디자인에 들어 있지 않다. 디자인은 파일을 가리키는 열쇠(src)와, 그 가운데 어디부터 어디까지 쓰는지만 가진다.
//   { src, dur, in, out, vol, fit }
//   - src: 파일의 열쇠(어디에 두는지는 프로젝트가 정한다. configure({ loadVideo }) 로 꺼낸다)
//   - dur: 원본의 길이(초) · in ~ out: 그 가운데 쓰는 구간(초). 앞뒤를 잘라도 원본은 그대로다.
//   - vol: 소리 크기(0~100. 0 이면 소리 없음) · fit: 화면 맞춤('cover' 꽉 채우기 · 'contain' 다 보이게)

/** 영상 장면의 화면 맞춤. */
export const VIDEO_FITS = [
  { id: 'cover', name: '꽉 채우기', hint: '화면을 가득 채워요(가장자리가 조금 잘릴 수 있어요)' },
  { id: 'contain', name: '다 보이게', hint: '영상이 다 보여요(남는 곳은 까맣게 돼요)' },
];
export const MIN_VIDEO = 0.5;          // 쓰는 구간의 가장 짧은 길이(초). 원본이 이보다 짧으면 영상 장면으로 쓰지 않는다
const MAX_VIDEO = 3600;               // 원본 길이의 한도(초)
const sec = (v) => Math.round(v * 100) / 100;
/** 영상 파일의 열쇠로 쓸 수 있는 글인가(영어·숫자·-·_ 4~64자). */
export const isVideoKey = (key) => typeof key === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(key);

/** 영상 장면을 정리한다. 열쇠가 이상하거나 길이를 모르면 null. 쓰는 구간은 원본 안에서, 가장 짧은 길이(MIN_VIDEO)보다 길게 맞춘다. */
export function cleanVideo(raw) {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!v || !isVideoKey(v.src)) return null;
  if (!Number.isFinite(Number(v.dur))) return null;
  const dur = sec(Math.min(MAX_VIDEO, Number(v.dur)));
  if (!(dur >= MIN_VIDEO)) return null;
  // 시작을 먼저 0.01초 단위로 맞춘 뒤에 끝을 정한다(맞추기 전의 값으로 끝을 정하면, 맞추면서 구간이 가장 짧은 길이보다 짧아질 수 있다).
  const from = sec(given(v.in) ? Math.min(dur - MIN_VIDEO, Math.max(0, Number(v.in))) : 0);
  const to = sec(given(v.out) ? Math.min(dur, Math.max(from + MIN_VIDEO, Number(v.out))) : dur);
  return {
    src: v.src, dur, in: from, out: to,
    vol: given(v.vol) ? Math.round(Math.min(100, Math.max(0, Number(v.vol)))) : 100,
    fit: VIDEO_FITS.some((f) => f.id === v.fit) ? v.fit : 'cover',
    ...(v.auto === true ? { auto: true } : {}),
  };
}
/**
 * 디자인의 영상 장면: 있으면 { video } 를, 없으면 빈 객체를 돌려준다.
 * 디자인을 새로 짜 맞추는 곳({ bg, items } 를 만드는 곳)에서 designMotion 과 함께 펼쳐 넣으면 영상 장면이 따라간다.
 */
export function designVideo(design) {
  const video = cleanVideo(design?.video);
  return video ? { video } : {};
}
/** 쓰는 구간의 길이(초). */
export const videoSeconds = (video) => (video ? sec(video.out - video.in) : 0);
/**
 * 앞(edge 'in')이나 뒤('out')를 자른다. 반대쪽 끝은 그대로 두고, 구간이 MIN_VIDEO 보다 짧아지지 않게 멈춘다.
 * 정리된 새 영상 장면을 돌려준다(값이 이상하면 받은 것을 정리해서 그대로).
 */
export function trimVideo(video, edge, value) {
  const v = cleanVideo(video);
  const t = Number(value);
  if (!v || !Number.isFinite(t)) return v;
  if (edge === 'in') return cleanVideo({ ...v, in: Math.min(v.out - MIN_VIDEO, Math.max(0, t)) });
  if (edge === 'out') return cleanVideo({ ...v, out: Math.max(v.in + MIN_VIDEO, Math.min(v.dur, t)) });
  return v;
}
/** '0:07' · '1:05.3' 처럼(tenths: 소수 첫째 자리까지). */
export function videoTime(seconds, { tenths = false } = {}) {
  const s = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
  const whole = tenths ? Math.floor(s * 10 + 1e-6) / 10 : Math.round(s);
  const m = Math.floor(whole / 60);
  const rest = whole - m * 60;
  return `${m}:${tenths ? rest.toFixed(1).padStart(4, '0') : String(rest).padStart(2, '0')}`;
}

/** 빈 디자인. */
export function emptyDesign(bg = DEFAULT_BG) {
  return { bg: cleanBg(bg), items: [] };
}
/** 디자인에 쓴 글들(글상자의 글). */
export function designTexts(design) {
  return (Array.isArray(design?.items) ? design.items : []).filter((it) => it?.t === 'text' && it.text).map((it) => it.text);
}
/** 디자인에 넣은 사진들 [{ url, path? }] (안 쓰게 된 파일을 정리할 때 견준다). */
export function designImages(design) {
  return (Array.isArray(design?.items) ? design.items : []).filter((it) => it?.t === 'image' && it.url)
    .map((it) => (it.path ? { url: it.url, path: it.path } : { url: it.url }));
}

// ---------- 새로 놓기 ----------

export function newText(text = '글을 써요', extra = {}) {
  return cleanItem({ t: 'text', x: 50, y: 50, w: 80, text, size: 7, color: '#1d2433', align: 'c', ...extra }, { keepSpaces: true });
}
export function newEmoji(ch, extra = {}) {
  return cleanItem({ t: 'emoji', x: 50, y: 50, w: 22, ch, ...extra });
}
// 높이(h)는 카드 "세로"에 대한 백분율이다. 카드가 정사각형이 아니면 같은 길이라도 가로와 세로의 백분율이 다르므로,
// 너비 단위로 정한 높이에 카드의 가로 ÷ 세로(aspect)를 곱해 맞춘다.
const tall = (h) => h * config.aspect;
// 사진 크기의 한도. 정사각형 카드에서는 가로·세로 모두 300 이고, 길쭉한 카드에서는 짧은 쪽에 대한 백분율이 그만큼 커진다
// (세로로 긴 사진을 가로로 긴 카드에 꽉 차게 깔 수 있어야 하므로).
function photoMax() {
  return { w: Math.round(PHOTO_MAX * Math.max(1, 1 / config.aspect)), h: Math.round(PHOTO_MAX * Math.max(1, config.aspect)) };
}
/** 도형·꾸밈 요소: 그 애셋의 기본 크기와 색으로 가운데에 놓는다(shapes.js). 모르는 이름이면 네모. */
export function newShape(shape, extra = {}) {
  const a = shapeAsset(shape) || shapeAsset('rect');
  return cleanItem({ t: 'shape', x: 50, y: 50, shape: a.id, color: a.color, w: a.w, h: tall(a.h), r: a.r, ...extra });
}
/** 그림 묶음의 그림(art.js): 그 묶음의 기본 너비로, 그림의 비율을 지켜 가운데에 놓는다. 모르는 이름이면 null. */
export function newArt(id, extra = {}) {
  const pack = artPack(id);
  if (!pack) return null;
  const w = pack.w;
  return cleanItem({ t: 'art', x: 50, y: 50, art: id, w, h: tall(w / artAspect(id)), ...(pack.color ? { color: '#1d2433' } : {}), ...extra });
}
/** 유튜브 영상(youtube.js): 카드 너비의 60% 로, 16:9 비율을 지켜 가운데에 놓는다. 모르는 이름표면 null. */
export function newYouTube(id, { start = 0, ...extra } = {}) {
  if (!isYouTubeId(id)) return null;
  return cleanItem({ t: 'yt', x: 50, y: 50, yt: id, start, w: 60, h: tall(60 * 9 / 16), ...extra });
}
/** 선의 굵기(카드 너비를 100 으로 본 값). 막대는 1~15 단계이고 한 단계가 step 이다. */
export const THICK = { min: 0.8, max: 6.4, step: 0.4 };
/** 선인가(선·점선): 높이가 곧 굵기라서, 도구 막대에 "굵기"가 나온다. */
export const isLine = (item) => item?.t === 'shape' && !!shapeAsset(item.shape)?.thin;
/** 선의 굵기(카드 너비 단위). 높이는 카드 "세로"에 대한 백분율이라 카드의 비율로 나눠서 잰다. */
export const thickOf = (item) => Math.round((item.h / config.aspect) * 10) / 10;
/** 선의 굵기를 바꾼다(길이·자리·기울기는 그대로). */
export function thicken(item, thick) {
  if (!isLine(item)) return item;
  const t = Math.min(THICK.max, Math.max(THICK.min, Number(thick) || THICK.min));
  return heightenItem(item, t * config.aspect);
}
/** 모서리 둥글기를 바꿀 수 있는 도형인가(네모·둥근 네모). */
export const canRound = (item) => item?.t === 'shape' && !!shapeAsset(item.shape)?.corner;
/** 테두리를 두르거나 속을 비울 수 있는 도형인가(면 하나로 된 그림). */
export const canEdge = (item) => item?.t === 'shape' && !!shapeAsset(item.shape)?.edge;
/**
 * 지금 모서리 둥글기(0~100: 짧은 변의 절반에 대한 %). 막대의 처음 자리로 쓴다.
 * 둥글기를 정하지 않은 둥근 네모(예전 디자인·템플릿)는 카드 너비의 4% 로 둥글므로, 그것을 지금 크기에 견준 값을 돌려준다.
 */
export function cornerOf(item) {
  if (!canRound(item)) return 0;
  if (given(item.r)) return item.r;
  if (item.shape !== 'round') return 0;
  const half = Math.min(item.w, item.h / config.aspect) / 2;
  return half > 0 ? Math.round(Math.min(100, (OLD_ROUND / half) * 100)) : 100;
}
// 사진을 가로세로 비율(ratio = 세로 ÷ 가로)을 지키면서 카드의 가로·세로 box% 안에 들어가게 놓는다.
function photoIn(img, box) {
  const { ratio = 1, ...rest } = img || {};
  const r = (Number.isFinite(ratio) && ratio > 0 ? ratio : 1) * config.aspect;     // 세로% ÷ 가로%
  const w = r > 1 ? box / r : box;
  return cleanItem({ t: 'image', x: 50, y: 50, ...rest, w, h: w * r });
}
/** 사진: 비율을 지키면서 카드의 절반쯤 크기로 놓는다. img 는 { url, path?, ratio }. */
export function newPhoto(img) {
  return photoIn(img, 50);
}

// ---------- 끌기·크기·돌리기 ----------

const SNAP = 1.5;
/** 가운데(50) 가까이 오면 딱 붙인다. [값, 붙었는지] */
export function snapCenter(v) {
  return Math.abs(v - 50) <= SNAP ? [50, true] : [v, false];
}

/** 옮기기. snap 이 true 면 가운데에 붙인다. { item, guides: { v, h } } */
export function moveItem(item, x, y, { snap = true } = {}) {
  const [sx, onV] = snap ? snapCenter(x) : [x, false];
  const [sy, onH] = snap ? snapCenter(y) : [y, false];
  return { item: { ...item, x: position(sx, 50), y: position(sy, 50) }, guides: { v: onV, h: onH } };
}

/** 전체 크기를 k 배로(글상자는 글자 크기도 함께). 너무 작아지거나 커지지 않게 한계를 둔다. */
export function scaleItem(item, k) {
  const f = Number.isFinite(k) && k > 0 ? k : 1;
  if (item.t === 'text') {
    const size = measure(item,item.size * f, textMin(item), TEXT_SIZE.max, item.size);
    const real = size / item.size;
    return { ...item, size, w: measure(item,item.w * real, widthMin(item), 100, item.w), ...(given(item.h)?{h:measure(item,item.h*real,0.01,140,item.h)}:{}) };
  }
  if (item.t === 'emoji') return { ...item, w: num(item.w * f, 4, SIZE.max, item.w) };
  // 도형·사진: 가로세로 비율을 지킨다.
  const max = item.t === 'image' ? photoMax() : { w: SIZE.max, h: SIZE.max };
  const lo = item.t === 'image' ? Math.max(photoMin(item) / item.w, photoMin(item) / item.h) : Math.max(shapeMin(item) / item.w, heightMin(item) / item.h);
  const hi = Math.min(max.w / item.w, max.h / item.h);
  const real = Math.min(hi, Math.max(lo, f));
  return { ...item, w: measure(item,item.w * real, 0, max.w, item.w), h: measure(item,item.h * real, 0, max.h, item.h) };
}

/** 너비만(글상자·도형). */
export function widenItem(item, w) {
  if (item.t === 'text') return { ...item, w: measure(item,w, widthMin(item), 100, item.w) };
  if (item.t === 'shape') return { ...item, w: measure(item,w, shapeMin(item), SIZE.max, item.w) };
  return item;
}
/** 높이만(도형). */
export function heightenItem(item, h) {
  return item.t === 'shape' ? { ...item, h: measure(item,h, heightMin(item), SIZE.max, item.h) } : item;
}

/** 돌리기. 0·90·180·-90 도 가까이에서는 딱 붙인다. */
export function rotateItem(item, deg) {
  let d = ((Math.round(deg) + 180) % 360 + 360) % 360 - 180;
  for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(d - s) <= 4) d = s;
  if (d === -180) d = 180;
  return { ...item, rot: d };
}

/** 순서 바꾸기(뒤에 있을수록 위에 보인다). to: 'up' · 'down' · 'top' · 'bottom'. [새 목록, 새 번호] */
export function reorder(items, i, to) {
  if (i < 0 || i >= items.length) return [items, i];
  const last = items.length - 1;
  const at = to === 'top' ? last : to === 'bottom' ? 0 : to === 'up' ? Math.min(last, i + 1) : Math.max(0, i - 1);
  if (at === i) return [items, i];
  const list = items.slice();
  const [it] = list.splice(i, 1);
  list.splice(at, 0, it);
  return [list, at];
}

/**
 * i 번째 요소를 to 번째 자리로 옮긴다(레이어 목록에서 끌어 놓을 때). 다른 요소들의 차례는 그대로다. [새 목록, 옮긴 뒤의 번호]
 * 번호는 "뒤에 있을수록 위에 보인다"는 목록의 번호다. 자리가 그대로이거나 번호가 틀리면 [받은 목록, i].
 */
export function moveLayer(items, i, to) {
  const n = Array.isArray(items) ? items.length : 0;
  if (!Number.isInteger(i) || !Number.isInteger(to) || i < 0 || i >= n) return [items, i];
  const at = Math.min(n - 1, Math.max(0, to));
  if (at === i) return [items, i];
  const list = items.slice();
  const [it] = list.splice(i, 1);
  list.splice(at, 0, it);
  return [list, at];
}

/**
 * 여럿이 함께 꾸밀 때: 되돌리기 기록 하나(요소 목록)에 다른 사람이 바꾼 것을 끼워 넣는다.
 * 그래서 실행 취소는 내가 한 것만 되돌리고, 다른 사람이 바꾼 것은 그대로 남는다.
 *   patch.items: Map(이름표 → 새 요소 또는 null(지웠다)) · patch.added: Set(다른 사람이 새로 넣은 이름표) · patch.order: 지금 이름표 차례
 * 기록에 있는 요소는 그 자리에서 바꾸거나 빼고, 다른 사람이 새로 넣은 것은 지금 차례에서 바로 앞에 있는 요소 뒤에 넣는다(없으면 맨 아래).
 * (내가 넣은 요소를 다른 사람이 고친 것은 내가 넣기 전의 기록에 생기지 않는다.)
 */
export function rebaseItems(list, { items: patch = new Map(), added = new Set(), order = [] } = {}) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(list) ? list : []) {
    if (it && it.id && patch.has(it.id)) {
      seen.add(it.id);
      const v = patch.get(it.id);
      if (v) out.push(v);
    } else out.push(it);
  }
  for (const [id, v] of patch) {
    if (!v || seen.has(id) || !added.has(id)) continue;
    const before = order.slice(0, Math.max(0, order.indexOf(id))).reverse().find((k) => out.some((x) => x && x.id === k));
    const at = before ? out.findIndex((x) => x && x.id === before) + 1 : 0;
    out.splice(at, 0, v);
  }
  return out;
}

/** 복사해서 조금 옆에 놓는다. 꽉 찼거나 사진이 한도까지 있으면 null. */
export function duplicateItem(items, i) {
  const it = items[i];
  const limits = pageLimits({items}, {items:config.maxItems,photos:config.maxPhotos,text:config.maxText});
  if (!it || items.length >= limits.items) return null;
  if (it.t === 'image' && items.filter((k) => k.t === 'image').length >= limits.photos) return null;
  const { id, ...copy } = it;            // 복제한 것은 다른 요소다: 이름표를 물려받지 않는다
  return { ...copy, ...(id ? { id: newId(), origin: { elementId: id } } : {}), x: position(it.x + 4, 50), y: position(it.y + 4, 50) };
}

/**
 * 복사해 둔 요소를 붙여 넣을 새 요소. at({ x, y })을 주면 그 자리에, 아니면 원래 자리에서 조금 옆에 놓는다.
 * 잠금은 풀어서 붙인다. 꽉 찼거나 사진이 3장이면 null.
 */
export function pasteItem(items, item, at = null) {
  const limits = pageLimits({items:[...items,item]}, {items:config.maxItems,photos:config.maxPhotos,text:config.maxText});
  if (!item || items.length >= limits.items) return null;
  if (item.t === 'image' && items.filter((k) => k.t === 'image').length >= limits.photos) return null;
  const { id, ...copy } = item;          // 붙여 넣은 것은 다른 요소다: 이름표를 물려받지 않는다
  return cleanItem({ ...copy, ...(id ? { id: newId(), origin: { elementId: id } } : {}), x: at ? at.x : item.x + 4, y: at ? at.y : item.y + 4, lock: false }, { keepSpaces: true });
}

/** 화면에 보일 짧은 이름(레이어 목록용). */
export function itemLabel(it) {
  if (it.t === 'text') return `텍스트: ${(it.text || '(빈 글)').replace(/\s+/g, ' ').slice(0, 10)}`;
  if (it.t === 'emoji') return `그래픽 ${it.ch}`;
  if (it.t === 'shape') return `도형: ${SHAPES.find((s) => s.id === it.shape)?.name || '네모'}`;
  if (it.t === 'art') return `그림: ${artName(it.art) || it.art.slice(3)}`;
  if (it.t === 'yt') return `유튜브 영상${it.start ? ` (${ytTime(it.start)}부터)` : ''}`;
  if (it.t === 'link') return `연결선${it.head === 'none' ? '' : ' (화살표)'}${it.label ? ` "${it.label}"` : ''}`;
  return '사진';
}

/** 크기를 한 숫자로(크기 막대용): 글상자는 글자 크기, 나머지는 너비. */
export function sizeOf(item) {
  return item.t === 'text' ? item.size : item.w;
}
/** 크기 막대에서 고른 값으로 맞춘다(비율은 지킨다). */
export function resizeTo(item, value) {
  const now = sizeOf(item);
  return now > 0 ? scaleItem(item, value / now) : item;
}
/** 크기 막대의 범위. */
export function sizeRange(item) {
  if (item.t === 'text') return { min: textMin(item), max: TEXT_SIZE.max, step: pptxItem(item)?0.1:0.5 };
  if (item.t === 'emoji') return { min: 4, max: 100, step: 1 };
  return { min: item.t === 'image' ? photoMin(item) : shapeMin(item), max: item.t === 'image' ? 200 : 100, step: 1 };
}

/**
 * 페이지(카드)에 맞춰 정렬한다. where: 'left' · 'center' · 'right' · 'top' · 'middle' · 'bottom'.
 * hw, hh 는 화면에서 잰 절반 너비·절반 높이(카드 너비를 100 으로 본 값). 글상자와 그래픽은 그려 봐야 크기를 알 수 있어서 받는다.
 */
export function alignItem(item, where, hw = 0, hh = 0) {
  const x = where === 'left' ? hw : where === 'right' ? 100 - hw : where === 'center' ? 50 : item.x;
  const y = where === 'top' ? hh : where === 'bottom' ? 100 - hh : where === 'middle' ? 50 : item.y;
  return { ...item, x: position(x, item.x), y: position(y, item.y) };
}

// ---------- 그룹 ----------
const GROUP_ID = /^g[a-z0-9]{3,15}$/;
/** 새 그룹 표. */
export function newGroupId(now = Date.now(), rand = Math.random()) {
  return `g${now.toString(36).slice(-6)}${Math.floor(rand * 36 ** 4).toString(36).padStart(4, '0')}`;
}
/**
 * 복제하거나 붙여 넣은 요소들의 그룹 표를 새것으로 바꾼다(원래 그룹과 섞이지 않게). 같은 표였던 것끼리는 새 표도 같다.
 * 한 그룹에서 하나만 들어 있으면 그것은 그룹에서 뺀다(혼자인 그룹은 뜻이 없다).
 */
export function regroup(list, makeId = newGroupId) {
  const counts = new Map();
  for (const it of list) if (it?.g) counts.set(it.g, (counts.get(it.g) || 0) + 1);
  const fresh = new Map();
  return list.map((it) => {
    if (!it?.g) return it;
    const { g, ...rest } = it;
    if (counts.get(g) < 2) return rest;
    if (!fresh.has(g)) fresh.set(g, makeId(Date.now(), Math.random()));
    return { ...rest, g: fresh.get(g) };
  });
}

/**
 * 여럿을 함께 키우고 줄인다(고른 것들을 감싸는 상자의 모서리 손잡이). (ax, ay): 그대로 있는 점(잡은 모서리의 맞은편 모서리).
 * 모두 같은 배율이어야 모양이 흐트러지지 않으므로, 어느 하나라도 더 커지거나 작아질 수 없으면 배율을 그만큼 줄인다.
 * 돌려주는 것: { items(받은 차례대로), k(실제로 쓴 배율) }
 */
export function scaleItems(items, k, ax, ay) {
  let f = Number.isFinite(k) && k > 0 ? k : 1;
  for (let pass = 0; pass < 2; pass++) {
    for (const it of items) {
      const real = it.w > 0 ? scaleItem(it, f).w / it.w : f;
      if (f > 1 && real < f) f = Math.max(1, real);
      if (f < 1 && real > f) f = Math.min(1, real);
    }
  }
  return {
    k: f,
    items: items.map((it) => {
      const sized = scaleItem(it, f);
      return { ...sized, x: position(ax + (it.x - ax) * f, it.x), y: position(ay + (it.y - ay) * f, it.y) };
    }),
  };
}

/**
 * 여럿을 서로에게 맞춰 정렬할 때 각자의 새 가운데. boxes: [{ x, y, hw, hh }]
 * (가운데와, 화면에서 잰 반너비·반높이. 모두 카드 너비·높이를 100 으로 본 값). 고른 것들을 감싸는 상자의 그 변(가운데)에 맞춘다.
 * where: 'left' · 'center' · 'right'(가로) · 'top' · 'middle' · 'bottom'(세로). 돌려주는 것: [{ x, y }] (받은 차례대로).
 */
export function alignBoxes(boxes, where) {
  if (!boxes.length) return [];
  const left = Math.min(...boxes.map((b) => b.x - b.hw));
  const right = Math.max(...boxes.map((b) => b.x + b.hw));
  const top = Math.min(...boxes.map((b) => b.y - b.hh));
  const bottom = Math.max(...boxes.map((b) => b.y + b.hh));
  return boxes.map((b) => ({
    x: where === 'left' ? left + b.hw : where === 'right' ? right - b.hw : where === 'center' ? (left + right) / 2 : b.x,
    y: where === 'top' ? top + b.hh : where === 'bottom' ? bottom - b.hh : where === 'middle' ? (top + bottom) / 2 : b.y,
  }));
}

/**
 * 고르게 펼치기: 양 끝의 것은 그대로 두고, 사이의 빈칸이 모두 같아지게 가운데를 옮긴다. axis: 'x'(가로) · 'y'(세로).
 * 셋보다 적으면 옮길 것이 없어 받은 자리 그대로. 돌려주는 것: [{ x, y }] (받은 차례대로).
 */
export function distributeBoxes(boxes, axis) {
  const out = boxes.map((b) => ({ x: b.x, y: b.y }));
  if (boxes.length < 3 || (axis !== 'x' && axis !== 'y')) return out;
  const half = axis === 'x' ? 'hw' : 'hh';
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a][axis] - boxes[b][axis]);
  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  const start = first[axis] - first[half];
  const gap = (last[axis] + last[half] - start - boxes.reduce((n, b) => n + 2 * b[half], 0)) / (boxes.length - 1);
  let at = start;
  for (const i of order) {
    out[i][axis] = at + boxes[i][half];
    at += 2 * boxes[i][half] + gap;
  }
  return out;
}

/** 여럿을 함께 옮길 때 움직일 수 있는 만큼으로 줄인 거리: 가운데가 카드 밖(0 ~ 100)으로 나가는 것이 없게 한다. [dx, dy] */
export function clampShift(items, dx, dy) {
  const xs = items.map((it) => it.x);
  const ys = items.map((it) => it.y);
  return [
    Math.min(100 - Math.max(...xs), Math.max(-Math.min(...xs), dx)),
    Math.min(100 - Math.max(...ys), Math.max(-Math.min(...ys), dy)),
  ];
}

// ---------- 스타일 복사 · 붙여넣기 ----------
// 캔바의 "스타일 복사", 파워포인트의 "서식 복사"처럼 꾸밈 값만 옮긴다(글·자리·크기·사진은 그대로).
// 종류마다 옮길 수 있는 값이 다르다. 둘 다 가진 값만 옮긴다(예: 글 → 도형이면 색과 투명도만).
const STYLE_KEYS = {
  text: ['color', 'font', 'typeface', 'size', 'bold', 'italic', 'under', 'align', 'valign', 'lh', 'bgc', 'stroke', 'shadow', 'op'],
  shape: ['color', 'line', 'lc', 'hollow', 'r', 'op'],
  art: ['color', 'op'],
  emoji: ['op'],
  image: ['mask', 'op'],
  yt: ['op'],
  link: ['color', 'line', 'head', 'startShape', 'endShape', 'dash', 'curve', 'elbow', 'avoid', 'labelSize', 'labelStyle', 'labelFont', 'op'],
};
/** 요소의 꾸밈 값 { t, values } (스타일을 옮길 수 없는 것이면 null). */
export function styleOf(item) {
  const keys = STYLE_KEYS[item?.t];
  if (!keys) return null;
  const values = {};
  for (const k of keys) if (item[k] !== undefined) values[k] = item[k];
  return { t: item.t, values };
}
/** styleOf 로 담아 둔 꾸밈 값을 요소에 입힌다. 담아 둔 쪽에 없던 값은 지운다(굵게가 아니었으면 굵게를 푼다). 잠긴 것·옮길 값이 없는 것은 그대로 돌려준다. */
export function applyStyle(item, style) {
  const mine = STYLE_KEYS[item?.t], theirs = STYLE_KEYS[style?.t];
  if (!mine || !theirs || item.lock) return item;
  let keys = mine.filter((k) => theirs.includes(k));
  if (item.t === 'art' && !artColorable(item.art)) keys = keys.filter((k) => k !== 'color');
  const next = { ...item };
  for (const k of keys) { if (style.values[k] === undefined) delete next[k]; else next[k] = style.values[k]; }
  return next;
}

/** 사진을 카드에 꽉 차게 키워 가운데에 놓는다(배경처럼 깔 때). 기울기와 뒤집기는 그대로 둔다. */
export function coverItem(item) {
  if (item.t !== 'image') return item;
  const k = Math.max(100 / item.w, 100 / item.h);
  return { ...scaleItem(item, k), x: 50, y: 50, rot: 0 };
}

/**
 * 카드의 모양(가로 ÷ 세로)이 from 에서 to 로 바뀌었을 때 요소들을 새 모양에 맞춘다. 두 가지 방법이 있다(파워포인트의 "맞춤 확인 · 최대화"처럼).
 *
 * fit: false(크기는 그대로) — 요소의 크기는 그대로 두고, 자리는 새 카드에서 같은 비율의 자리로 옮긴다.
 *   - 도형·사진: 높이(h)는 카드 "세로"에 대한 백분율이라, 카드의 세로가 달라진 만큼 고쳐야 같은 모양으로 보인다(h × to ÷ from).
 *   - 글·그래픽: 크기가 카드 "너비"를 따르므로 그대로 둔다. 자리(x·y)도 그대로 둔다. 템플릿을 넣을 때와 같은 규칙이다.
 * fit: true(통째로 맞추기) — 지금 그림을 한 장의 사진처럼 보고, 새 카드 안에 다 들어가게 줄여서 가운데에 놓는다.
 *   - 새 카드가 더 납작하면 모든 요소가 같은 비율로 작아지고(양옆이 남는다), 더 길쭉하면 크기는 그대로이고 위아래가 남는다.
 *   - 요소끼리의 자리와 크기의 관계가 그대로라서, 겹치거나 잘리지 않는다.
 * 어느 쪽이든 카드에 꽉 차게 깔아 둔 사진은 새 모양에서도 꽉 차게 다시 깐다.
 * configure({ aspect: to }) 를 한 뒤에 부른다(크기의 한도가 지금 설정의 모양을 따르기 때문이다).
 */
export function reshapeItems(items, from, to, { fit = false } = {}) {
  const a = Number(from);
  const b = Number(to);
  const list = Array.isArray(items) ? items : [];
  if (!(a > 0) || !(b > 0) || a === b) return list;
  const k = b / a;
  // 통째로 맞추기: 카드의 너비를 1 로 보면 옛 카드는 1 × (1 ÷ a), 새 카드는 1 × (1 ÷ b). 옛 카드가 새 카드 안에 들어가는 가장 큰 배율 s.
  const s = fit ? Math.min(1, a / b) : 1;
  const left = (1 - s) / 2;                 // 새 카드의 너비를 1 로 본 왼쪽 여백
  const top = (1 / b - s / a) / 2;          // 위쪽 여백(같은 단위)
  return list.map((it) => {
    if (!it) return it;
    const covered = it.t === 'image' && !it.rot && it.w >= 99.5 && it.h >= 99.5 && Math.abs(it.x - 50) < 0.5 && Math.abs(it.y - 50) < 0.5;
    let next = it;
    if (fit) {
      next = { ...it, x: (left + s * (it.x / 100)) * 100, y: (top + s * (it.y / 100) / a) * b * 100, w: it.w * s };
      if (it.t === 'text') next.size = it.size * s;
      if (it.t === 'shape' || it.t === 'image' || it.t === 'art' || it.t === 'yt' || it.t==='text'&&given(it.h)) next.h = it.h * k * s;
      if (it.line) next.line = it.line * s;      // 테두리도 같은 비율로 가늘어진다(둥글기는 % 라 그대로)
    } else if (it.t === 'shape' || it.t === 'image' || it.t === 'art' || it.t === 'yt' || it.t==='text'&&given(it.h)) {
      next = { ...it, h: it.h * k };
    }
    if (next === it) return it;
    const clean = cleanItem(next, { keepSpaces: true }) || it;
    return covered ? coverItem(clean) : clean;
  });
}

/** 사진을 카드 안에 다 보이게 맞춰 가운데에 놓는다. img 는 { url, path?, ratio(세로 ÷ 가로) }. */
export function fitPhoto(img) {
  return photoIn(img, 100);
}

// ---------- 텍스트 종류(제목 · 소제목 · 본문) ----------

export const TEXT_PRESETS = [
  { id: 'title', name: '큰 제목', text: '제목을 써요', size: 11, bold: true },
  { id: 'sub', name: '작은 제목', text: '작은 제목을 써요', size: 7.5, bold: true },
  { id: 'body', name: '이야기 글', text: '하고 싶은 이야기를 써요', size: 5, bold: false },
];
export function newPresetText(id, extra = {}) {
  const p = TEXT_PRESETS.find((k) => k.id === id) || TEXT_PRESETS[2];
  return newText(p.text, { size: p.size, bold: p.bold, ...extra });
}

// ---------- 틀(눌러서 시작하는 짜임) ----------
// 글은 모두 안내 글이다. 그대로 두고 올리면 점검에서 알려 준다(PLACEHOLDER_TEXTS).

const T = (text, extra) => ({ t: 'text', text, ...extra });
export const LAYOUTS = [
  {
    id: 'cover', name: '표지', bg: 'navy',
    items: [
      { t: 'emoji', ch: '📢', x: 50, y: 24, w: 22 },
      T('제목을 써요', { x: 50, y: 50, w: 86, size: 11, bold: true, color: '#ffffff' }),
      { t: 'shape', shape: 'line', x: 50, y: 63, w: 24, h: 1.4, color: '#ffd43b' },
      T('한 줄로 소개해요', { x: 50, y: 74, w: 80, size: 5, color: '#ffd43b' }),
    ],
  },
  {
    id: 'band', name: '띠 제목', bg: 'paper',
    items: [
      { t: 'shape', shape: 'rect', x: 50, y: 22, w: 100, h: 26, color: '#26318f' },
      T('제목을 써요', { x: 50, y: 22, w: 88, size: 9, bold: true, color: '#ffffff' }),
      T('알리고 싶은 내용을 써요', { x: 50, y: 60, w: 84, size: 5.5, color: '#1d2433' }),
    ],
  },
  {
    id: 'list', name: '세 가지', bg: 'sky',
    items: [
      T('세 가지 방법', { x: 50, y: 14, w: 88, size: 8.5, bold: true, color: '#12305a' }),
      { t: 'shape', shape: 'circle', x: 14, y: 36, w: 11, h: 11, color: '#1c7ed6' },
      T('1', { x: 14, y: 36, w: 10, size: 6, bold: true, color: '#ffffff' }),
      T('첫째 방법을 써요', { x: 58, y: 36, w: 70, size: 5, align: 'l', color: '#12305a' }),
      { t: 'shape', shape: 'circle', x: 14, y: 56, w: 11, h: 11, color: '#1c7ed6' },
      T('2', { x: 14, y: 56, w: 10, size: 6, bold: true, color: '#ffffff' }),
      T('둘째 방법을 써요', { x: 58, y: 56, w: 70, size: 5, align: 'l', color: '#12305a' }),
      { t: 'shape', shape: 'circle', x: 14, y: 76, w: 11, h: 11, color: '#1c7ed6' },
      T('3', { x: 14, y: 76, w: 10, size: 6, bold: true, color: '#ffffff' }),
      T('셋째 방법을 써요', { x: 58, y: 76, w: 70, size: 5, align: 'l', color: '#12305a' }),
    ],
  },
  {
    id: 'bubble', name: '말풍선', bg: 'mint',
    items: [
      { t: 'shape', shape: 'bubble', x: 50, y: 40, w: 84, h: 56, color: '#ffffff' },
      T('하고 싶은 말을 써요', { x: 50, y: 34, w: 70, size: 6.5, bold: true, color: '#123d1c' }),
      { t: 'emoji', ch: '🙂', x: 24, y: 82, w: 20 },
    ],
  },
  {
    id: 'question', name: '물음', bg: 'sun',
    items: [
      T('?', { x: 50, y: 28, w: 40, size: 28, bold: true, color: '#8a4b00' }),
      T('궁금한 것을 물어봐요', { x: 50, y: 60, w: 86, size: 7.5, bold: true, color: '#3b2f00' }),
      T('답은 다음 카드에서 알려 줘요', { x: 50, y: 80, w: 84, size: 4.5, color: '#3b2f00' }),
    ],
  },
  {
    id: 'end', name: '마무리', bg: 'rose',
    items: [
      { t: 'shape', shape: 'heart', x: 50, y: 30, w: 30, h: 28, color: '#e64980' },
      T('꼭 기억할 한 문장을 써요', { x: 50, y: 62, w: 86, size: 7.5, bold: true, color: '#5c1a1a' }),
      T('읽는 사람에게 부탁하는 말을 써요', { x: 50, y: 82, w: 84, size: 4.5, color: '#5c1a1a' }),
    ],
  },
];
/** 지금 쓰는 템플릿 목록(configure({ layouts }) 로 바꿨으면 그것). */
export function layoutList() {
  return config.layouts || LAYOUTS;
}
// 템플릿에 적힌 요소들. items 가 함수면 지금 카드의 모양(가로 ÷ 세로)을 넘겨 그 모양에 맞는 배치를 받는다.
const layoutRaw = (layout) => {
  const raw = typeof layout?.items === 'function' ? layout.items(config.aspect) : layout?.items;
  return Array.isArray(raw) ? raw : [];
};
/** 템플릿의 요소들(정리된 새 목록). 모르는 id 면 빈 목록. 도형의 높이는 너비 단위로 적혀 있어 카드 비율에 맞춘다. */
export function layoutItems(id) {
  const layout = layoutList().find((l) => l.id === id);
  if (!layout) return [];
  return layoutRaw(layout).map((it) => cleanItem(it && it.t === 'shape' ? { ...it, h: tall(it.h) } : it, { keepSpaces: true })).filter(Boolean);
}
/** 넣을 때 놓이는 안내 글들(템플릿·텍스트 종류·새 글상자). 숫자 한 글자 같은 것은 뺀다. "그대로 두었어요" 하고 알려 줄 때 쓴다. */
export function placeholderTexts() {
  return [...new Set([
    '글을 써요',
    ...TEXT_PRESETS.map((p) => p.text),
    ...layoutList().flatMap((l) => layoutRaw(l).filter((it) => it && it.t === 'text' && String(it.text || '').length > 3).map((it) => it.text)),
  ])];
}
/** 기본 템플릿을 쓸 때의 안내 글들. */
export const PLACEHOLDER_TEXTS = placeholderTexts();
