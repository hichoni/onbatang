// AI-G 도우미의 '편집 지시': AI(또는 움직임 자동 다듬기)는 장을 직접 그리지 않고 지시 목록만 낸다.
// 여기서는 ① AI에게 보낼 것(글 · 배치 · 지금 움직임. 사진 · 영상은 보내지 않는다)을 만들고 ② 받은 지시를 검사하고 ③ 장 목록에 적용한다.
// 화면을 모르는 순수 함수들이다(DOM 없음). 설계: docs/ai-helper-2026-11-11.md
//
// 지시(op):
//   { op: 'text',  item, text }                              글상자의 글을 바꾼다
//   { op: 'mark',  item, words: [...] }                      글 안의 낱말을 강조색으로
//   { op: 'move',  item, an?, aw?, dl?, sp?, em?, lp?, ex? } 조각의 움직임(정한 것만. null 은 지움, 'none' 은 가만히)
//   { op: 'move',  items: [...], step?, … }                  여러 조각을 같은 움직임으로, 차례대로 step 초씩 늦춰서(한 줄의 카드 · 사진)
//   { op: 'slide', slide, tr?, pa?, topic?, notes? }         장의 전환 · 조합 효과 · 주제 · 발표자 노트
// item · slide 는 요청마다 새로 붙이는 짧은 이름표(p1, p1.3)다. 저장된 이름표가 없는 그림에서도 쓸 수 있다.
import { cleanItem, itemLabel, textLimit } from '../src/model.js';
import { ENTERS, IDLES, EMPHASES, EXITS, TRANSITIONS, COMBOS, SPEEDS, STILL, DELAY_MAX } from '../src/motion.js';
import { cleanNotes, cleanTopic } from '../src/document.js';
import { cleanRuns } from '../src/runs.js';

/** 한 번의 부탁이 감당하는 크기. slides(한 번에 다듬는 장 수)는 질문권 1회(중앙 제작 서버의 작업 1건)의 한계를 재서 정한 값이다(docs/ai-helper-2026-11-11.md §3).
 * ops 는 여러 조각을 묶은 지시를 조각마다로 편 뒤의 수다(24장에 550개쯤 나온다). */
export const EDIT_LIMITS = Object.freeze({ slides: 24, items: 60, text: 400, notes: 400, prompt: 600, bytes: 140000, ops: 1600, say: 300, why: 60, words: 8, idles: 8 });
/** AI 부탁 한 번의 값(질문권 몇 회인지). 장 수에 따라 달라지게 할 수 있도록 한곳에 둔다. */
export const editCost = () => 1;
/** 자동 다듬기처럼 기기 안에서만 도는 일은 크기를 가리지 않는다. */
export const LOCAL_LIMITS = Object.freeze({ ...EDIT_LIMITS, slides: Infinity, items: Infinity, text: Infinity, notes: Infinity, bytes: Infinity, ops: Infinity });

const ids = (list) => new Set(list.map((e) => e.id));
const ENTER = ids(ENTERS), IDLE = ids(IDLES), EMPH = ids(EMPHASES), EXIT = ids(EXITS), TRANS = ids(TRANSITIONS), COMBO = ids(COMBOS);
const SPEED = new Set(SPEEDS.map((s) => s.id).filter(Boolean));
const nameIn = (list) => new Map(list.map((e) => [e.id, e.name]));
const NAMES = { an: nameIn(ENTERS), lp: nameIn(IDLES), em: nameIn(EMPHASES), ex: nameIn(EXITS), tr: nameIn(TRANSITIONS), pa: nameIn(COMBOS) };

/** AI에게 알려 줄 효과의 이름표와 우리말 이름(온바탕에 효과가 늘면 서버를 고치지 않아도 따라간다). */
export function motionCatalog() {
  const pair = ({ id, name }) => [id, name];
  return { enter: ENTERS.map(pair), idle: IDLES.map(pair), emphasis: EMPHASES.map(pair), exit: EXITS.map(pair), transition: TRANSITIONS.map(pair), combo: COMBOS.map(({ id, name, hint }) => [id, name, hint]) };
}

// ---------- 조각의 구실 ----------
const PLAIN = new Set(['rect', 'round', 'circle', 'arrow', 'arrow2', 'both', 'line', 'dash', 'pill', 'ring', 'underline', 'highlight', 'tri', 'elbow', 'curve']);
const ARROWS = new Set(['arrow', 'arrow2', 'both']);
const THIN = new Set(['line', 'dash', 'underline']);
const NUMBERISH = /^[+\-−]?\d[\d.,]*(?:\s*[~\-–]\s*\d[\d.,]*)?\s*(?:%|％|\p{Script=Hangul}{1,2})?$/u;
const SECTION_NO = /^0?\d$/;
const said = (it) => String(it?.text ?? '').trim();
const inside = (box, it) => Math.abs(it.x - box.x) <= box.w / 2 && Math.abs(it.y - box.y) <= box.h / 2;
const flat = (it) => THIN.has(it.shape) || (it.h <= 2.6 && it.w >= it.h * 2);   // 제목 밑 띠 · 긴 선(가로로 납작한 도형)

/**
 * 장의 조각마다 구실을 가린다(자리 순서대로의 배열).
 * 글: title(제목) · kicker(제목 위의 작은 글) · section-number(구역 표지의 큰 번호) · number(큰 숫자) · chip(배경색 글) · closing(맨 아래 한 줄) · caption(아주 작은 글) · body
 * 도형: arrow · bar(제목 밑 띠 · 선) · back(바탕) · frame(사진 틀) · card(다른 조각이 올라앉은 판) · icon(작은 그림 도형) · picture(큰 그림 도형) · deco
 * 그 밖: photo · back-photo · link · emoji · art · chart · math · video · web
 */
export function rolesOf(slide) {
  const items = Array.isArray(slide?.items) ? slide.items : [];
  const texts = items.map((it, i) => ({ it, i })).filter((v) => v.it.t === 'text' && said(v.it));
  // 제목이 될 수 있는 글: 칩 · 구역 번호 · 큰 숫자는 뺀다
  const plain = texts.filter((v) => !v.it.bgc && !(SECTION_NO.test(said(v.it)) && v.it.size >= 20) && !(NUMBERISH.test(said(v.it)) && v.it.size >= 5));
  const upper = plain.filter((v) => v.it.y <= 42);
  const lead = (upper.length ? upper : plain).reduce((best, v) => (!best || v.it.size > best.it.size + 0.05 ? v : best), null);
  // 제목: 위쪽의 가장 큰 글. 작은 글뿐인 장에서는 그 장에서 가장 큰 글일 때만 제목으로 본다
  const title = lead && (lead.it.size >= 3.4 || texts.every((v) => v.it.size <= lead.it.size)) ? lead.i : -1;
  const head = title >= 0 ? items[title] : null;
  const photos = items.filter((it) => it.t === 'image');
  return items.map((it, i) => {
    if (it.t === 'text') {
      const s = said(it);
      if (i === title) return 'title';
      if (SECTION_NO.test(s) && it.size >= 20) return 'section-number';
      if (it.bgc) return 'chip';
      if (NUMBERISH.test(s) && it.size >= 5) return 'number';
      if (head && it.y < head.y && it.size <= Math.max(2.5, head.size * 0.62)) return 'kicker';
      if (it.y >= 84 && it.align === 'c' && it.w >= 50 && it.size >= 1.9) return 'closing';
      if (it.size <= 1.4) return 'caption';
      return 'body';
    }
    if (it.t === 'image') return it.w >= 95 && it.h >= 95 ? 'back-photo' : 'photo';
    if (it.t === 'shape') {
      if (ARROWS.has(it.shape)) return 'arrow';
      if (it.w >= 96 && it.h >= 96) return 'back';
      if (photos.some((p) => Math.abs(p.x - it.x) < 0.6 && Math.abs(p.y - it.y) < 0.6 && it.w >= p.w)) return 'frame';
      if (flat(it)) return 'bar';
      if (!PLAIN.has(it.shape)) return it.w <= 6 ? 'icon' : 'picture';
      // 뒤에 오는(위에 그려지는) 조각이 그 안에 놓였으면 카드(판)
      if (it.w >= 8 && items.some((o, k) => k > i && o !== it && o.t !== 'link' && (o.t !== 'shape' || o.w < it.w * 0.9) && inside(it, o))) return 'card';
      return 'deco';
    }
    if (it.t === 'yt') return 'video';
    return it.t;
  });
}
/** 그 장의 제목 글(없으면 첫 글, 그것도 없으면 빈 글). */
export function titleOf(slide) {
  const items = Array.isArray(slide?.items) ? slide.items : [];
  const at = rolesOf(slide).indexOf('title');
  const text = at >= 0 ? items[at] : items.find((it) => it.t === 'text' && said(it));
  return text ? said(text).replace(/\s+/g, ' ').slice(0, 60) : '';
}
/** 바탕이 어두운 장인지(글자색을 고를 때와 같은 밝기 기준). 바탕색을 모르면 글자색으로 어림한다. */
export function isDark(slide) {
  const hex = /^#([0-9a-f]{6})$/i.exec(String(slide?.bg ?? ''))?.[1];
  const named = { navy: true, grape: true, night: true, paper: false, sky: false, sun: false, mint: false, rose: false }[slide?.bg];
  if (named !== undefined) return named;
  if (hex) { const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16)); return (r * 299 + g * 587 + b * 114) / 1000 < 150; }
  return false;
}
const slideKind = (slide) => (slide?.activity?.kind ? String(slide.activity.kind) : slide?.video ? 'video' : slide?.web ? 'web' : '');

// ---------- 보낼 것 ----------
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const clipText = (text, max) => { const all = Array.from(String(text ?? '')); return all.length > max ? { text: `${all.slice(0, max).join('')}…`, cut: true } : { text: all.join(''), cut: false }; };
const MOTION_KEYS = ['an', 'lp', 'em', 'ex', 'sp'];

function itemEntry(it, role, key, limits) {
  const out = { key, t: it.t, role, x: r1(it.x), y: r1(it.y), w: r1(it.w) };
  let cut = false;
  if (it.t === 'text') {
    const c = clipText(it.text, limits.text);
    cut = c.cut;
    Object.assign(out, { text: c.text, size: r1(it.size), ...(it.bold ? { bold: true } : {}), ...(it.align && it.align !== 'c' ? { align: it.align } : {}) });
  } else {
    if (Number.isFinite(it.h)) out.h = r1(it.h);
    if (it.t === 'shape') out.shape = it.shape;
    if (it.t === 'image' && it.alt) out.alt = clipText(it.alt, 80).text;
    if (it.t === 'emoji') out.ch = it.ch;
    if (it.t === 'art') out.art = it.art;
    if (it.t === 'link' && it.label) out.text = it.label;
  }
  for (const k of MOTION_KEYS) if (it[k] !== undefined) out[k] = it[k];
  if (it.aw === true) out.aw = true;
  if (it.dl) out.dl = it.dl;
  if (it.lock) out.lock = true;
  return { entry: out, cut };
}
// 한 장에서 먼저 덜어 낼 조각(글이 없는 꾸밈부터): 숫자가 작을수록 먼저 보낸다
const WEIGHT = { title: 0, kicker: 0, number: 0, 'section-number': 0, closing: 0, body: 1, chip: 1, caption: 2, photo: 1, 'back-photo': 3, card: 2, arrow: 2, icon: 2, picture: 2, link: 2, frame: 3, bar: 3, deco: 4, back: 5 };

/**
 * 고른 장들(picks: 장 번호들)을 AI에게 보낼 모양으로 만든다.
 * 돌려주는 것: { request: { deck, slides, around }, picks(실제로 담긴 장 번호), find(key) → { slide, item? }, keyOf(slide, item?) → key,
 *               stale(slides) → 그 사이 바뀐 장 번호들, locked(key) → 글을 못 바꾸는 조각인지, cut: { slides, items } }
 */
export function editContext(slides, picks, { title = '', aspect = 16 / 9, limits = EDIT_LIMITS } = {}) {
  const list = Array.isArray(slides) ? slides : [];
  let chosen = [...new Set((Array.isArray(picks) ? picks : [picks]).filter((i) => Number.isInteger(i) && list[i]))].sort((a, b) => a - b);
  const cut = { slides: Math.max(0, chosen.length - limits.slides), items: 0 };
  chosen = chosen.slice(0, limits.slides);
  const build = (indexes) => {
    const map = new Map(), keys = new Map(), stamps = new Map(), frozen = new Set(), out = [];
    let dropped = 0;
    indexes.forEach((index, n) => {
      const slide = list[index], key = `p${n + 1}`, items = Array.isArray(slide.items) ? slide.items : [];
      stamps.set(index, JSON.stringify(slide));
      map.set(key, { slide: index });
      const itemKeys = new Array(items.length).fill('');
      keys.set(index, { key, items: itemKeys });
      const roles = rolesOf(slide);
      // 조각이 너무 많으면 꾸밈부터 덜어 낸다(자리 순서는 그대로 둔다)
      let keep = items.map((_, i) => i);
      if (keep.length > limits.items) {
        const order = keep.slice().sort((a, b) => (WEIGHT[roles[a]] ?? 2) - (WEIGHT[roles[b]] ?? 2) || a - b).slice(0, limits.items);
        dropped += keep.length - order.length;
        keep = order.sort((a, b) => a - b);
      }
      const entries = keep.map((i) => {
        const k = `${key}.${i + 1}`;
        const { entry, cut: clipped } = itemEntry(items[i], roles[i], k, limits);
        itemKeys[i] = k;
        map.set(k, { slide: index, item: i });
        if (clipped || items[i].lock) frozen.add(k);
        return entry;
      });
      const kind = slideKind(slide), notes = cleanNotes(slide.notes).replace(/\s+/g, ' ').trim();
      out.push({ key, no: index + 1, ...(cleanTopic(slide.topic) ? { topic: cleanTopic(slide.topic) } : {}), dark: isDark(slide),
        ...(slide.tr ? { tr: slide.tr } : {}), ...(slide.pa ? { pa: slide.pa } : {}), ...(kind ? { kind } : {}), ...(slide.hidden ? { hidden: true } : {}),
        ...(notes ? { notes: clipText(notes, limits.notes).text } : {}), items: entries });
    });
    const inSet = new Set(indexes);
    const around = [...new Set(indexes.flatMap((i) => [i - 1, i + 1]))].filter((i) => list[i] && !inSet.has(i)).sort((a, b) => a - b)
      .map((i) => ({ no: i + 1, title: titleOf(list[i]) })).filter((v) => v.title);
    return { request: { deck: { ...(String(title || '').trim() ? { title: String(title).trim().slice(0, 60) } : {}), count: list.length, aspect: Math.round(aspect * 100) / 100 }, slides: out, around }, map, keys, stamps, frozen, dropped };
  };
  let made = build(chosen);
  // 요청이 너무 크면 뒤의 장부터 뺀다(한 장은 늘 남긴다)
  while (chosen.length > 1 && JSON.stringify(made.request).length > limits.bytes) { chosen = chosen.slice(0, -1); cut.slides++; made = build(chosen); }
  cut.items = made.dropped;
  const { request, map, keys, stamps, frozen } = made;
  return {
    request, picks: chosen, cut,
    find: (key) => map.get(key) || null,
    keyOf: (slide, item) => (item === undefined ? keys.get(slide)?.key : keys.get(slide)?.items[item]) || '',
    locked: (key) => frozen.has(key),
    stale: (now) => chosen.filter((i) => JSON.stringify(now?.[i]) !== stamps.get(i)),
  };
}

// ---------- 지시 검사 ----------
const line = (v, max) => Array.from(String(v ?? '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
const pickId = (v, set) => (typeof v === 'string' && set.has(v) ? v : undefined);
const NO_ITEMS = new Set(['quiz', 'gai-app', 'pixel-art']);   // 활동 장의 조각(표지)은 활동이 그린다: 건드리지 않는다
const NO_WORDS = new Set(['wall']);                           // 한바탕 장의 표지(주소 · 코드)는 글을 바꾸지 않는다(움직임만)

/**
 * 받은 답({ say, ops })을 검사해 쓸 수 있는 지시만 남긴다. 모르는 지시 · 이번에 보내지 않은 이름표 · 모르는 효과 이름은 버린다.
 * 돌려주는 것: { say, ops, dropped: [까닭 …] }
 */
export function checkEdits(answer, ctx, { limits = EDIT_LIMITS, slides = [] } = {}) {
  // 여러 조각을 한 번에 움직이는 지시({ op:'move', items:[…], step })는 조각마다의 지시로 편다: 차례대로 step 초씩 늦춘다
  const spread = (o) => {
    if (!o || typeof o !== 'object' || o.op !== 'move' || !Array.isArray(o.items)) return [o];
    const { items, step, item, ...rest } = o;
    const gap = Number.isFinite(step) && step > 0 ? Math.min(3, step) : 0, base = Number.isFinite(o.dl) && o.dl > 0 ? o.dl : 0;
    return items.slice(0, limits.items).map((key, k) => ({ ...rest, item: key, ...(gap || base ? { dl: base + k * gap } : {}) }));
  };
  const raw = (Array.isArray(answer?.ops) ? answer.ops : []).flatMap(spread);
  const dropped = [], ops = [];
  const drop = (why) => { dropped.push(why); };
  const kindOf = (index) => slideKind(slides[index]);
  for (const o of raw.slice(0, limits.ops)) {
    if (!o || typeof o !== 'object') { drop('모양이 다른 지시'); continue; }
    const why = line(o.why, limits.why);
    if (o.op === 'slide') {
      const at = ctx.find(o.slide);
      if (!at || at.item !== undefined) { drop('보내지 않은 장'); continue; }
      const out = { op: 'slide', slide: o.slide };
      if (o.tr === null || pickId(o.tr, TRANS)) out.tr = o.tr;
      if (o.pa === null || pickId(o.pa, COMBO)) out.pa = o.pa;
      if (typeof o.topic === 'string') out.topic = cleanTopic(o.topic);
      if (typeof o.notes === 'string') out.notes = cleanNotes(o.notes);
      if (Object.keys(out).length === 2) { drop(o.tr || o.pa ? '온바탕이 모르는 효과' : '바꿀 것이 없는 지시'); continue; }
      ops.push(why ? { ...out, why } : out);
      continue;
    }
    if (!['text', 'mark', 'move'].includes(o.op)) { drop('온바탕이 모르는 지시'); continue; }
    const at = ctx.find(o.item);
    if (!at || at.item === undefined) { drop('보내지 않은 조각'); continue; }
    if (NO_ITEMS.has(kindOf(at.slide)) || (o.op !== 'move' && NO_WORDS.has(kindOf(at.slide)))) { drop('활동 장의 조각'); continue; }
    if (o.op === 'text') {
      if (typeof o.text !== 'string' || !o.text.trim()) { drop('빈 글'); continue; }
      if (ctx.locked(o.item)) { drop('잠겼거나 잘려 보낸 글'); continue; }
      ops.push({ op: 'text', item: o.item, text: o.text.replace(/\r\n?/g, '\n'), ...(why ? { why } : {}) });
    } else if (o.op === 'mark') {
      const words = [...new Set((Array.isArray(o.words) ? o.words : []).filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim()))].slice(0, limits.words);
      if (!words.length) { drop('강조할 낱말이 없는 지시'); continue; }
      ops.push({ op: 'mark', item: o.item, words, ...(why ? { why } : {}) });
    } else {
      const out = { op: 'move', item: o.item };
      let unknown = false;
      const take = (key, set) => {
        if (!Object.hasOwn(o, key)) return;
        if (o[key] === null) out[key] = null;
        else if (pickId(o[key], set)) out[key] = o[key];
        else unknown = true;
      };
      take('an', new Set([...ENTER, STILL]));
      take('lp', new Set([...IDLE, STILL]));
      take('em', EMPH);
      take('ex', EXIT);
      take('sp', SPEED);
      if (typeof o.aw === 'boolean') out.aw = o.aw;
      if (o.dl === null || (Number.isFinite(o.dl) && o.dl >= 0)) out.dl = o.dl === null ? null : Math.round(Math.min(DELAY_MAX, o.dl) * 10) / 10;
      if (Object.keys(out).length === 2) { drop(unknown ? '온바탕이 모르는 효과' : '바꿀 것이 없는 지시'); continue; }
      ops.push(why ? { ...out, why } : out);
    }
  }
  if (raw.length > limits.ops) drop(`지시가 너무 많아 ${limits.ops}개까지만 봤어요`);
  return { say: line(answer?.say, limits.say), ops, dropped };
}

// ---------- 적용 ----------
const quote = (text, max = 28) => { const s = String(text ?? '').replace(/\s+/g, ' ').trim(); const all = Array.from(s); return `"${all.length > max ? `${all.slice(0, max).join('')}…` : s}"`; };
const light = (hex) => { const m = /^#([0-9a-f]{6})$/i.exec(String(hex ?? '')); if (!m) return false; const [r, g, b] = [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)); return (r * 299 + g * 587 + b * 114) / 1000 >= 150; };
// 강조색: 그 장에서 이미 쓴 강조색(부분 서식의 색)을 따르고, 없으면 글자색의 밝기에 맞춘 기본 강조색
function accentFor(slide, item) {
  const used = new Map();
  for (const it of slide.items || []) if (it.t === 'text' && Array.isArray(it.runs)) for (const r of it.runs) if (r?.c && r.c !== item.color) used.set(r.c, (used.get(r.c) || 0) + 1);
  const best = [...used].sort((a, b) => b[1] - a[1])[0]?.[0];
  return best || (light(item.color) ? '#ffd43b' : '#d9480f');
}
// 글이 바뀌면 옛 부분 서식 가운데 그 낱말이 남아 있는 것만 옮겨 적는다
function carryRuns(item, text) {
  if (!Array.isArray(item.runs) || !item.runs.length) return [];
  const old = String(item.text ?? ''), out = [];
  for (const r of item.runs) {
    const word = old.slice(r.s, r.e), at = word ? text.indexOf(word) : -1;
    if (at >= 0) out.push({ ...r, s: at, e: at + word.length });
  }
  return out;
}
const MOVE_WORDS = { an: (v) => (v === STILL ? '가만히 나타나기' : v === 'fade' ? '서서히 나타나기' : `나타나기 ‘${NAMES.an.get(v)}’`), lp: (v) => (v === STILL ? '계속 움직이지 않기' : `계속 ‘${NAMES.lp.get(v)}’`),
  em: (v) => `누르면 ‘${NAMES.em.get(v)}’`, ex: (v) => `사라지기 ‘${NAMES.ex.get(v)}’`, sp: (v) => (v === 'fast' ? '빠르게' : '느리게') };
const CLEAR_WORDS = { an: '나타나기 없앰', lp: '계속 움직이기 없앰', em: '강조 없앰', ex: '사라지기 없앰', sp: '보통 빠르기', dl: '늦추기 없앰' };

/**
 * 검사한 지시들을 장 목록에 적용한 새 목록을 만든다(받은 목록은 그대로 둔다).
 * skip: 적용하지 않을 지시의 번호들(미리 보기에서 체크를 푼 것).
 * 돌려주는 것: { slides, changes: [{ index, lines: [{ op(지시 번호), text, why }] }], stale: [그 사이 바뀌어 건너뛴 장 번호], dropped: [까닭], count }
 */
export function applyEdits(slides, ops, ctx, { limits = EDIT_LIMITS, skip = null } = {}) {
  const list = Array.isArray(slides) ? slides : [];
  const stale = new Set(ctx.stale(list)), dropped = [];
  const next = new Map(), lines = new Map(), fresh = new Map();   // fresh: 이번에 계속 움직이기를 새로 단 조각(한도를 넘으면 뒤부터 뗀다)
  const open = (index) => {
    if (!next.has(index)) { next.set(index, { ...list[index], items: (list[index].items || []).map((it) => ({ ...it })) }); lines.set(index, []); fresh.set(index, []); }
    return next.get(index);
  };
  const say = (index, n, label, parts, why) => lines.get(index).push({ op: n, label, parts, ...(why ? { why } : {}) });
  (Array.isArray(ops) ? ops : []).forEach((o, n) => {
    if (skip?.has?.(n)) return;
    const at = ctx.find(o.op === 'slide' ? o.slide : o.item);
    if (!at) { dropped.push('보내지 않은 이름표'); return; }
    if (stale.has(at.slide)) return;
    if (o.op === 'slide') {
      const before = list[at.slide], parts = [];
      const patch = {};
      for (const key of ['tr', 'pa']) {
        if (!Object.hasOwn(o, key) || (o[key] ?? undefined) === (before[key] ?? undefined)) continue;
        patch[key] = o[key];
        parts.push(o[key] === null ? (key === 'tr' ? '전환 없앰' : '조합 효과 없앰') : `${key === 'tr' ? '전환' : '조합 효과'}: ${NAMES[key].get(o[key])}`);
      }
      if (Object.hasOwn(o, 'topic') && o.topic !== cleanTopic(before.topic)) { patch.topic = o.topic; parts.push(o.topic ? `주제: ${o.topic}` : '주제 없앰'); }
      if (Object.hasOwn(o, 'notes') && o.notes !== cleanNotes(before.notes)) { patch.notes = o.notes; parts.push(o.notes ? `발표자 노트: ${quote(o.notes, 44)}` : '발표자 노트 비움'); }
      if (!parts.length) return;
      const slide = open(at.slide);
      for (const [key, value] of Object.entries(patch)) { if (value === null || value === '') delete slide[key]; else slide[key] = value; }
      say(at.slide, n, '', parts, o.why);
      return;
    }
    const origin = list[at.slide].items?.[at.item];
    if (!origin) { dropped.push('없는 조각'); return; }
    const slide = open(at.slide), item = slide.items[at.item];
    if (o.op === 'text') {
      if (item.t !== 'text' || item.lock) { dropped.push('글상자가 아니거나 잠긴 조각'); return; }
      const text = Array.from(o.text).slice(0, textLimit(item)).join('');
      if (text === item.text) return;
      const runs = carryRuns(item, text), was = item.text;
      item.text = text;
      if (runs.length) item.runs = runs; else delete item.runs;
      const clean = cleanItem(item, { keepSpaces: true });
      if (!clean) { slide.items[at.item] = { ...origin }; dropped.push('저장할 수 없는 글'); return; }
      slide.items[at.item] = clean;
      say(at.slide, n, '글', [`${quote(was)} → ${quote(clean.text)}`], o.why);
    } else if (o.op === 'mark') {
      if (item.t !== 'text') { dropped.push('글상자가 아닌 조각'); return; }
      const color = accentFor(slide, item), found = [], add = [];
      for (const w of o.words) {
        let from = item.text.indexOf(w), hit = false;
        while (from >= 0) { add.push({ s: from, e: from + w.length, c: color }); hit = true; from = item.text.indexOf(w, from + w.length); }
        if (hit) found.push(w);
      }
      if (!found.length) { dropped.push('글에 없는 낱말'); return; }
      const runs = cleanRuns(item.text, [...(Array.isArray(item.runs) ? item.runs : []), ...add], item);
      if (JSON.stringify(runs) === JSON.stringify(item.runs || [])) return;
      item.runs = runs;
      say(at.slide, n, '강조', [found.map((w) => quote(w, 16)).join(', ')], o.why);
    } else {
      const parts = [];
      for (const key of ['an', 'lp', 'em', 'ex', 'sp']) {
        if (!Object.hasOwn(o, key) || (o[key] ?? undefined) === (item[key] ?? undefined)) continue;
        if (o[key] === null) { delete item[key]; parts.push(CLEAR_WORDS[key]); continue; }
        item[key] = o[key];
        parts.push(MOVE_WORDS[key](o[key]));
        if (key === 'lp' && o[key] !== STILL) fresh.get(at.slide).push({ at: at.item, n, part: parts[parts.length - 1] });
      }
      if (Object.hasOwn(o, 'dl') && (o.dl || 0) !== (item.dl || 0)) { if (o.dl) { item.dl = o.dl; parts.push(`${o.dl}초 늦게`); } else { delete item.dl; parts.push(CLEAR_WORDS.dl); } }
      if (Object.hasOwn(o, 'aw') && o.aw !== (item.aw === true)) { if (o.aw) { item.aw = true; parts.push('누를 때 나타나기'); } else { delete item.aw; parts.push('장이 열릴 때 나타나기'); } }
      if (!parts.length) return;
      const clean = cleanItem(item, { keepSpaces: true });
      if (!clean) { slide.items[at.item] = { ...origin }; dropped.push('저장할 수 없는 조각'); return; }
      slide.items[at.item] = clean;
      say(at.slide, n, itemName(clean), parts, o.why);
    }
  });
  // 한 장에서 계속 움직이는 조각은 limits.idles 개까지: 이번에 새로 단 것을 뒤에서부터 뗀다
  for (const [index, slide] of next) {
    let moving = slide.items.filter((it) => it.lp && it.lp !== STILL).length;
    const added = fresh.get(index), rows = lines.get(index);
    while (moving > limits.idles && added.length) {
      const { at, n, part } = added.pop(), item = slide.items[at];
      if (!item.lp || item.lp === STILL) continue;
      const before = list[index].items[at].lp;
      if (before === undefined) delete item.lp; else item.lp = before;
      moving--;
      const row = rows.find((l) => l.op === n);
      if (row) { row.parts = row.parts.filter((p) => p !== part); if (!row.parts.length) rows.splice(rows.indexOf(row), 1); }
      if (!dropped.includes(TOO_MANY_IDLES)) dropped.push(TOO_MANY_IDLES);
    }
  }
  const out = list.slice(), changes = [];
  for (const [index, slide] of [...next].sort((a, b) => a[0] - b[0])) {
    const rows = lines.get(index);
    if (!rows.length || JSON.stringify(slide) === JSON.stringify(list[index])) continue;
    out[index] = slide;
    changes.push({ index, lines: rows.map(({ op, label, parts, why }) => ({ op, text: label ? `${label}: ${parts.join(' · ')}` : parts.join(' · '), ...(why ? { why } : {}) })) });
  }
  return { slides: out, changes, stale: [...stale].sort((a, b) => a - b), dropped, count: changes.reduce((n, c) => n + c.lines.length, 0) };
}
const TOO_MANY_IDLES = '계속 움직이는 조각이 너무 많아 덜어 냈어요';
/** 조각을 부르는 짧은 이름(미리 보기 목록에 쓴다). */
export function itemName(it) {
  if (it?.t === 'text') return quote(it.text, 18);
  const label = String(itemLabel(it) || '조각');
  return label.length > 20 ? `${label.slice(0, 20)}…` : label;
}
