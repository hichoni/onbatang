// 온바탕 편집기의 영상 시간표: 발표할 때의 움직임(motion.js)을 "몇 초에 무엇이 어떤 모습인지"로 바꾼다. DOM 을 쓰지 않는 순수 함수다.
// 실제로 그림을 그리고 녹화하는 일은 video.js 가 한다.
//
// 발표는 사람이 눌러서 넘기지만 영상은 저절로 흘러가야 한다. 그래서 이렇게 정한다.
//   - 한 장은 머무는 시간(stay. 초)만큼 보인다. 리허설로 잰 시간(design.dur)이 있는 장은 그 시간이다. 전환 효과가 있으면 그 효과가 끝난 때부터 센다.
//   - 저절로 나오는 요소는 발표할 때와 같은 차례 · 같은 간격으로 나온다.
//   - "누를 때" 나오는 요소는 읽는 차례대로 하나씩 저절로 나온다. 남은 시간에 고르게 나누되, 너무 급하거나 느리지 않게 한다.
//   - 요소가 다 나온 뒤에도 읽을 틈(TAIL)은 남긴다. 그래서 요소가 많은 장은 머무는 시간보다 조금 길어진다.
//   - 영상 장면(그 장의 바탕에 깐 영상)은 "장이 열리면 바로"(video.auto)면 그 장이 열리면(전환 효과가 끝나면), 아니면(누를 때) 저절로 나오는 요소가
//     다 나온 뒤 잠깐 있다가 틀기 시작해서, 쓰는 구간이 끝날 때까지 튼다.
//     그래서 영상 장면이 있는 장은 적어도 그 영상의 길이만큼 이어진다. 끝난 뒤에는 마지막 모습에 잠깐 머문다.
import { slideLook, lookReach } from './live.js';
import { planMotion, enterPose, enterTime, emphasisPose, emphasisTime, exitPose, exitTime, idlePose, idlePhase, transitionPose, matchItems, morphs, looksChanged } from './motion.js';

/** 고를 수 있는 머무는 시간(초)과 기본값. */
export const STAYS = [3, 5, 8];
export const DEFAULT_STAY = 5;

const FIRST_LEAD = 300;      // 첫 장은 영상이 시작되고 이만큼 뒤에 요소가 나오기 시작한다(발표 화면과 같다)
const TAIL = 1500;           // 마지막 요소가 다 나온 뒤에 적어도 이만큼은 더 보여 준다
const STEP_MIN = 1200;       // "누를 때" 나오는 요소 사이의 간격: 가장 짧게
const STEP_MAX = 2500;       //                                    가장 길게
const CLICKS_MAX = 20000;    // 한 장에서 "누를 때" 요소들에 쓰는 시간의 한도(아주 많으면 간격을 줄인다)
const STEP_LEAST = 400;
const SCENE_TAIL = 500;      // 영상 장면이 끝난 뒤에 마지막 모습으로 이만큼 더 보여 준다
const SCENE_WAIT = 800;      // 누를 때 트는 영상 장면: 저절로 나오는 요소가 다 나온 뒤 이만큼 기다렸다가 튼다(발표에서 누른 것처럼)
/** 만들 수 있는 영상의 가장 긴 길이(초). 영상은 다 만들 때까지 메모리에 쌓이므로 한도를 둔다. */
export const MAX_FILM_SECONDS = 600;

// 읽기 시간: 장이 화면 글을 다 읽을 만큼 머무는지. 한글 · 한자 · 가나는 1초에 4.5자, 나머지 글자는 15자로 세고 1.5초를 더한다(빈칸은 세지 않는다).
export const READ = Object.freeze({ cjk: 4.5, other: 15, pad: 1.5 });
const CJK = /[\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/u;
/** 장의 글(글상자 · 연결선 위 글)을 다 읽는 데 드는 시간(초). 글이 없으면 0. */
export function readSeconds(design) {
  let cjk = 0, other = 0;
  for (const it of Array.isArray(design?.items) ? design.items : []) {
    const text = it?.t === 'text' ? it.text : it?.t === 'link' ? it.label : '';
    for (const ch of String(text || '').replace(/\s+/gu, '')) { if (CJK.test(ch)) cjk++; else other++; }
  }
  return cjk + other ? cjk / READ.cjk + other / READ.other + READ.pad : 0;
}
/**
 * 영상에서 읽기 시간이 모자란 장을 찾는다. 장이 열린 뒤(전환이 끝난 뒤) 다음 장으로 넘어갈 때까지를 그 장의 시간으로 본다.
 * 돌려주는 것: { short: [{ index, need, have }](초, 소수 한 자리), fit: 모자란 장에만 읽을 만큼의 머무는 시간(dur)을 준 디자인들(나머지는 그대로) }.
 */
export function readCheck(designs, { stay = DEFAULT_STAY, scenes = true } = {}) {
  const list = Array.isArray(designs) ? designs : [];
  const plan = filmPlan(list, { stay, scenes }), short = [];
  const fit = list.map((d, index) => {
    const need = readSeconds(d), slide = plan.slides[index], have = (slide.ms - slide.lead) / 1000;
    if (!need || need <= have + 0.05) return d;
    short.push({ index, need: Math.round(need * 10) / 10, have: Math.round(have * 10) / 10 });
    return { ...d, dur: Math.min(600, Math.ceil(need)) };
  });
  return { short, fit };
}
const staySeconds = (stay) => (Number.isFinite(stay) ? Math.min(30, Math.max(1, stay)) : DEFAULT_STAY);

/**
 * 영상의 시간표를 짠다. designs: 정리된 디자인들(cleanDesign 을 거친 것. 장의 차례대로).
 * 돌려주는 것: {
 *   slides: [{
 *     turn:   이 장이 들어올 때의 전환 효과 { id, ms }. 없으면 null(첫 장은 늘 없다)
 *     lead:   요소가 나오기 시작하는 때(ms. 이 장이 시작된 때부터)
 *     moves:  움직이는 요소들 [{ i(요소 번호), enter, mirror, start(시작하는 때), ms(길이), click(누를 때 나오던 것인지) }]
 *             강조 효과는 enter 대신 emphasis 가 있다(누를 때의 차례대로 저절로 한 번 움직인다)
 *             사라지는 효과는 enter 대신 exit 이 있다(그 차례에 사라지고, 그 뒤로는 그 장이 끝날 때까지 보이지 않는다)
 *             길이 · 모습에는 요소의 빠르기(sp) · 글자 수(타자 치듯)가 들어간다(slide.items 로 그 요소를 안다. JSON 에는 남지 않는다)
 *     loops:  (계속 움직이는 요소가 있을 때만) [{ i, loop, start(되풀이를 시작하는 때), phase(한 바퀴의 어디에서 시작하는지) }]
 *             나타난 요소는 그 직후부터 0 에서, 처음부터 보이는 요소는 장이 열릴 때 제 박자에서 시작한다(발표 화면과 같다)
 *     settle: 모든 요소가 다 나온 때(계속 움직이기는 그 뒤에도 이어진다)
 *     ms:     이 장의 길이(다음 장이 시작되는 때)
 *     scene:  (영상 장면이 있는 장만) 바탕 영상을 트는 때 { start(트기 시작하는 때), ms(쓰는 구간의 길이) }
 *     split:  (이어 움직이기가 있을 때만) 따로 칸을 나눠 그려 둘 요소 번호들(옮겨 가는 요소)
 *     turn.pairs: 이어 움직이기로 앞 장에서 옮겨 오는 요소의 짝 [[앞 장 번호, 이 장 번호]]
 *     turn.changed: 그 가운데 내용·꾸밈이 달라진 것(이 장 번호). 옮기며 앞 것이 사라지고 새것이 나타난다
 *   }],
 *   ms: 영상 전체의 길이
 * }
 * scenes: 거짓이면 영상 장면을 틀지 않는 것으로 짠다(멈춘 그림으로 담을 때: 그 장도 다른 장처럼 머무는 시간만큼만 이어진다).
 *         파일이 이 기기에 없는 영상 장면은 부르는 쪽이 디자인에서 미리 떼고 준다.
 */
export function filmPlan(designs, { stay = DEFAULT_STAY, scenes = true } = {}) {
  const stayAll = staySeconds(stay) * 1000;
  const slides = (Array.isArray(designs) ? designs : []).map((design, n) => {
    const plan = planMotion(design);
    // 리허설로 잰 시간이 있는 장은 그 시간만큼 머문다(고른 머무는 시간 대신).
    const stayMs = Number.isInteger(design?.dur) && design.dur >= 1 ? Math.min(design.dur, 600) * 1000 : stayAll;
    const pose = n > 0 ? transitionPose(design?.tr) : null;
    // 이어 움직이기: 앞 장과 짝이 된 요소는 전환 동안 옮겨 가고, 장이 열린 뒤에 다시 나타나지 않는다(발표 화면과 같다).
    // 누를 때 나타나는 요소는 짝짓지 않는다(그 차례에 나타난다).
    const pairs = pose && morphs(design.tr) ? morphPairs(designs[n - 1], design) : null;
    const changed = (pairs || []).filter(([i, j]) => looksChanged(designs[n - 1].items[i], design.items[j])).map(([, j]) => j);
    const turn = pose ? { id: design.tr, ms: pose.ms, ...(pairs?.length ? { pairs } : {}), ...(changed.length ? { changed } : {}) } : null;
    const lead = turn ? turn.ms : n === 0 && plan.auto.length + plan.clicks.length ? FIRST_LEAD : 0;
    const arrived = new Set((pairs || []).map(([, j]) => j));
    const items = Array.isArray(design?.items) ? design.items : [];
    const moves = plan.auto.filter((a) => !arrived.has(a.i)).map((a) => ({ i: a.i, enter: a.enter, mirror: a.mirror, start: lead + a.delay, ms: enterTime(a.enter, items[a.i]), click: false }));
    const count = plan.clicks.length;
    if (count) {
      const least = Math.max(STEP_LEAST, Math.min(STEP_MIN, CLICKS_MAX / count));
      const step = Math.round(Math.max(least, Math.min(STEP_MAX, (stayMs - plan.ms - TAIL) / count)));
      plan.clicks.forEach((c, k) => {
        const start = lead + plan.ms + step * (k + 1);
        const it = items[c.i];
        moves.push(c.emphasis ? { i: c.i, emphasis: c.emphasis, start, ms: emphasisTime(c.emphasis, it), click: true }
          : c.exit ? { i: c.i, exit: c.exit, start, ms: exitTime(c.exit, it), click: true }
            : { i: c.i, enter: c.enter, mirror: c.mirror, start, ms: enterTime(c.enter, it), click: true });
      });
    }
    const settle = moves.reduce((m, v) => Math.max(m, v.start + v.ms), lead);
    // 계속 움직이기: 나타나는 움직임(누를 때 것 포함)이 있으면 그것이 끝난 때부터 0 에서, 없으면(처음부터 보이거나 옮겨 온 요소) 장이 열릴 때 제 박자에서.
    const loops = plan.loops.map((l) => {
      const m = moves.find((v) => v.i === l.i && v.enter);
      return m ? { i: l.i, loop: l.loop, start: m.start + m.ms, phase: 0 } : { i: l.i, loop: l.loop, start: lead, phase: idlePhase(l.i, l.loop, items[l.i]) };
    });
    const video = scenes && design?.video && design.video.out > design.video.in ? design.video : null;
    const opened = turn ? turn.ms : n === 0 ? FIRST_LEAD : 0;
    const scene = video ? { start: video.auto ? opened : Math.max(opened, lead + plan.ms) + SCENE_WAIT, ms: Math.round((video.out - video.in) * 1000) } : null;
    const ms = Math.round(Math.max(lead + Math.max(stayMs, settle - lead + (moves.length ? TAIL : 0)), scene ? scene.start + scene.ms + SCENE_TAIL : 0));
    const slide = { turn, lead, moves, settle, ms, ...(loops.length ? { loops } : {}), ...(scene ? { scene } : {}) };
    Object.defineProperty(slide, 'items', { value: items, enumerable: false });
    return slide;
  });
  // 짝이 된 요소는 두 장 모두에서 제 칸(따로 그린 그림)이 있어야 옮겨 그릴 수 있다: split 에 적는다.
  slides.forEach((s, n) => {
    for (const [i, j] of s.turn?.pairs || []) {
      (s.split ||= []).push(j);
      (slides[n - 1].split ||= []).push(i);
    }
  });
  return { slides, ms: slides.reduce((sum, s) => sum + s.ms, 0) };
}
/** 이어 움직이기의 짝 [[앞 장 번호, 이 장 번호]] (누를 때 나타나는 요소는 빼고). */
export function morphPairs(before, after) {
  return matchItems(before?.items, after?.items).filter(([, j]) => after.items[j]?.aw !== true);
}

/**
 * 그 장이 시작된 지 local(ms) 이 지났을 때, 아직 제 모습이 아닌 요소들의 모습. measured: 타자 치듯에서 잰 글자 자리 Map(요소 번호 → stops. 없으면 어림한다).
 * 돌려주는 것: Map(요소 번호 → enterPose 의 모습). 여기에 없는 요소는 제자리에 다 나와 있다.
 * 계속 움직이는 요소는 그 순간의 되풀이 모습이다(나타나기·강조가 도는 동안은 그쪽이 앞선다: 화면에서 나중에 튼 움직임이 위에 보이는 것과 같다).
 * local 이 Infinity 면(다 나온 모습을 그릴 때) 계속 움직이기도 제 모습이다.
 */
export function slidePoses(slide, local, measured = null) {
  const poses = new Map();
  const items = slide?.items || [];
  for (const m of slide?.moves || []) {
    const at = local - m.start;
    const item = items[m.i];
    // 사라지는 효과: 차례가 오기 전에는 그대로, 끝난 뒤에는 사라진 모습으로 남는다.
    if (m.exit) {
      if (at >= 0) { const pose = exitPose(m.exit, Math.min(at, m.ms), { item }); if (pose) poses.set(m.i, pose); }
      continue;
    }
    if (at >= m.ms) continue;
    // 강조는 차례가 오기 전에는 제 모습이다(나타나기처럼 숨어 기다리지 않는다).
    if (m.emphasis && at < 0) continue;
    const pose = m.emphasis ? emphasisPose(m.emphasis, at, { item }) : enterPose(m.enter, at, { mirror: m.mirror, item, stops: measured?.get(m.i) });
    if (pose) poses.set(m.i, pose);
  }
  if (Number.isFinite(local)) {
    for (const l of slide?.loops || []) {
      if (poses.has(l.i) || local < l.start) continue;
      const pose = idlePose(l.loop, local - l.start + l.phase, items[l.i]);
      if (pose) poses.set(l.i, pose);
    }
  }
  return poses;
}
/** 그 장에 계속 움직이는 요소가 있는지(있으면 다 나온 뒤에도 프레임마다 새로 그려야 한다). */
export const slideLoops = (slide) => !!slide?.loops?.length;

/** 요소 그림들을 늘어놓는 큰 그림(sheet)의 한 변의 한도(px). */
export const SHEET_MAX = 4096;
const GUTTER = 2;                // 칸 사이의 틈(늘리거나 돌려 그릴 때 옆 칸이 묻어나지 않게)
const HALF = SHEET_MAX / 2 - 8;  // 움직이는 요소의 칸은 그 요소의 가운데에서 이만큼까지만 담는다(한 칸이 큰 그림 한 장을 넘지 않게)

/**
 * 한 장의 요소들을 칸(cell)으로 나눈다(아래에 깔리는 것부터). 영상으로 만들 때 칸마다 따로 그려 두고 프레임마다 옮겨 붙인다.
 *   - 움직이는 요소는 하나가 한 칸이다. 그 사이의 가만히 있는 요소들은 한 칸으로 묶는다(겹치는 차례가 그대로 남는다).
 *   - 맨 아래 칸에는 카드의 바탕도 함께 그린다(bg). 움직이는 것이 없으면 통째로 한 칸이다.
 *   - 영상 장면이 있는 디자인(design.video)은 맨 아래 칸에 바탕만 그린다: 그 위에 영상의 프레임을 그리고, 요소들은 그 위에 얹어야 하기 때문이다.
 *     (그때는 가만히 있는 요소들도 제 칸에 그리므로, 움직이는 것이 없어도 boxes 가 있어야 한다.)
 * - design: 정리된 디자인 · slide: 그 장의 시간표(filmPlan 의 slides[n]) · W · H: 카드의 크기(px)
 * - boxes: 요소마다 화면에서 잰 자리 { x, y, w, h }(돌리고 뒤집은 뒤의 바깥 네모. px). 움직이는 것이 없으면 없어도 된다.
 * 돌려주는 것: [{ items: [요소 번호…], bg, i(움직이는 요소의 번호. 묶음이면 -1), box: { x, y, w, h }(카드 위에서 잘라 낼 자리. 정수 px) }]
 * 잴 수 없었던(크기가 0 인) 요소만 든 칸은 빠진다.
 */
export function filmCells(design, slide, boxes, W, H) {
  const items = Array.isArray(design?.items) ? design.items : [];
  // 글자 효과(빛 · 그늘 · 둥실): 글마다 제 칸에 그려 두고 프레임마다 효과를 입힌다(video.js). 글 둘레로 퍼지는 빛 · 그늘만큼 칸을 넓힌다.
  const look = slideLook(design), reach = lookReach(look);
  const moving = new Set([...(slide?.moves || []).map((m) => m.i), ...(slide?.loops || []).map((l) => l.i), ...(slide?.split || []),
    ...(look ? items.flatMap((it, i) => (it?.t === 'text' ? [i] : [])) : [])]);
  const card = { x: 0, y: 0, w: W, h: H };
  const split = !!design?.video || !!design?.live;     // 바탕 영상 · 움직이는 바탕: 바탕과 요소를 따로 그린다(그 사이에 장면이 들어간다)
  if (!moving.size && !split) return [{ items: items.map((_, i) => i), bg: true, i: -1, box: card }];
  const cells = [];
  let run = { items: [], bg: true, i: -1 };
  const close = () => { if (run) cells.push(run); run = null; };
  if (split) close();
  items.forEach((it, i) => {
    if (!moving.has(i)) {
      run ||= { items: [], bg: false, i: -1 };
      run.items.push(i);
      return;
    }
    close();
    cells.push({ items: [i], bg: false, i });
  });
  close();
  const base = Math.ceil(Math.max(8, W * 0.02));
  for (const c of cells) {
    if (c.bg) { c.box = card; continue; }
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const i of c.items) {
      const b = boxes?.[i];
      if (!b || !(b.w > 0) || !(b.h > 0)) continue;
      // 글자의 삐침 · 테두리처럼 칸 밖으로 조금 나온 것까지 담는다. 큰 글자는 삐침도 크다.
      const it = items[i];
      const pad = it?.t === 'text' ? Math.max(base, Math.ceil((it.size / 100) * W * Math.max(0.25, reach))) : base;
      x0 = Math.min(x0, b.x - pad); y0 = Math.min(y0, b.y - pad); x1 = Math.max(x1, b.x + b.w + pad); y1 = Math.max(y1, b.y + b.h + pad);
    }
    // 가만히 있는 묶음은 카드 안쪽만 담는다. 움직이는 요소는 카드 밖에 걸친 부분도 움직이다 보면 들어올 수 있어 통째로 담되,
    // 가운데 점에서 너무 먼 곳은 뺀다(가운데를 붙들고 돌고 커지므로, 가운데를 기준으로 잘라야 한쪽만 잘리지 않는다).
    const it = c.i >= 0 ? items[c.i] : null;
    const cx = it ? (it.x / 100) * W : 0;
    const cy = it ? (it.y / 100) * H : 0;
    const lim = it ? { x0: cx - HALF, y0: cy - HALF, x1: cx + HALF, y1: cy + HALF } : { x0: 0, y0: 0, x1: W, y1: H };
    x0 = Math.floor(Math.max(lim.x0, x0)); y0 = Math.floor(Math.max(lim.y0, y0));
    x1 = Math.ceil(Math.min(lim.x1, x1)); y1 = Math.ceil(Math.min(lim.y1, y1));
    c.box = x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  return cells.filter((c) => c.box);
}

/**
 * 칸들을 큰 그림(들)에 줄지어 놓는다. 한 장이 꽉 차면 다음 장을 연다.
 * 칸마다 at({ x, y }: 큰 그림 위의 자리)과 sheet(몇 번째 큰 그림인지)를 적어 넣고, [{ width, height, cells }] 를 돌려준다.
 */
export function packCells(cells) {
  const width = Math.min(SHEET_MAX, Math.max(2048, ...cells.map((c) => c.box.w)));
  const sheets = [];
  let cur = null; let x = 0; let y = 0; let row = 0;
  const open = () => { cur = { width, height: 0, cells: [] }; sheets.push(cur); x = 0; y = 0; row = 0; };
  open();
  for (const c of cells) {
    if (x > 0 && x + c.box.w > width) { x = 0; y += row + GUTTER; row = 0; }
    if (y > 0 && y + c.box.h > SHEET_MAX) open();
    c.at = { x, y };
    c.sheet = sheets.length - 1;
    cur.cells.push(c);
    cur.height = Math.max(cur.height, y + c.box.h);
    x += c.box.w + GUTTER;
    row = Math.max(row, c.box.h);
  }
  return sheets;
}

/**
 * 영상의 크기(px). aspect: 가로 ÷ 세로, short: 짧은 쪽의 길이.
 * 영상은 가로·세로가 짝수여야 어디서나 잘 틀어지므로 짝수로 맞춘다.
 */
export function videoSize(aspect, short = 1080) {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  const s = even(short);
  return a >= 1 ? { width: even(s * a), height: s } : { width: s, height: even(s / a) };
}
