// 연결선: 두 조각을 잇는 선(화살표). 선은 어디에 놓였는지를 따로 갖지 않고, 잇는 두 조각의 자리에서 늘 다시 계산한다.
// 그래서 한쪽 조각을 옮기거나 키우면 선이 따라온다. DOM 을 모르는 순수 함수라, 저장(model) · 편집기 · 그리기 · PPTX 가 모두 같은 값을 쓴다.
//
// 요소에 적는 값: t 'link' · from · to(잇는 두 조각의 이름표) · head('end' 끝에 화살표 · 'both' 양쪽 · 'none' 없음) ·
//                 color · line(굵기, 카드 너비의 %) · dash(true 긴 점선 · 'dot' 동글 점 · 'dashdot' 긴 점과 점) · head('start' 처음에만도 된다) ·
//                 startShape · endShape(머리 모양: LINK_SHAPES, 없으면 뾰족 화살표) · label(선 위의 짧은 글, LINK_LABEL_MAX 자까지) ·
//                 labelAt(그 글이 길을 따라 놓이는 곳 0.05~0.95, 없으면 한가운데) · labelSize · labelStyle · labelFont(그 글의 크기 · 모양 · 글꼴) ·
//                 avoid(꺾인 선이 다른 조각을 피해 간다) · fromPos · toPos(고른 옆 위의 자리 0.1~0.9, 없으면 가운데) · curve(곡선: 1 은 가는 쪽에서 보아 왼쪽으로, -1 은 오른쪽으로 휜다. 없으면 직선) ·
//                 elbow(꺾인 선: 1 은 가로 → 세로 → 가로, -1 은 세로 → 가로 → 세로로 직각으로 꺾어 잇는다. curve 와 함께 쓰지 않는다) ·
//                 fromSide · toSide(선이 붙는 곳: 'top' · 'right' · 'bottom' · 'left' 면 그 조각의 그 옆 가운데에 붙는다. 없으면 알아서) ·
//                 bend(곡선이 휘는 깊이: 두 끝 사이 거리에 대한 비율 0.05~0.9, 없으면 CURVE_BEND) ·
//                 turn(꺾인 선이 가운데 마디에서 꺾이는 자리: 시작 0 ~ 끝 1, 없으면 한가운데 0.5)
// 계산해서 붙이는 값: x · y · w · h(선을 감싸는 네모. 다른 요소와 같은 단위: x·w 는 카드 너비의 %, y·h 는 카드 높이의 %) ·
//                    pts([x1, y1, x2, y2]: 네모 안에서 선의 두 끝. 곡선이면 [.., cx, cy] 로 휘는 점(2차 베지어의 조절점)까지,
//                        꺾인 선이면 [.., ax, ay, bx, by] 로 꺾이는 두 점까지. 카드 너비의 % 단위) ·
//                    vh(네모의 높이를 카드 너비의 % 로 잰 값)
// 거리는 모두 "카드 너비의 %" 한 가지로 잰다(세로는 카드 비율로 바꿔서). 그래서 가로세로가 다른 카드에서도 각도와 굵기가 그대로다.

export const LINK_HEADS = ['end', 'both', 'none', 'start'];
/** 화살표 머리의 모양: 뾰족 · 열린(V) · 동그라미 · 빈 동그라미 · 마름모 · 막대. 'arrow' 가 처음 모양(적지 않는다). */
export const LINK_SHAPES = ['arrow', 'open', 'dot', 'ring', 'diamond', 'bar'];
/** 선의 모양: 실선(없음) · true(긴 점선) · 'dot'(동글동글 점) · 'dashdot'(긴 점과 점) */
export const LINK_DASHES = [true, 'dot', 'dashdot'];
/** 선 위의 글: 가장 긴 글자 수, 글자 크기(카드 너비의 %) */
export const LINK_LABEL_MAX = 30;
/** 선 위 글의 크기(labelSize: 'small' · 'large', 없으면 보통)와 모양(labelStyle: 'fill' 선 색 바탕에 흰 글 · 'none' 바탕 없이, 없으면 흰 바탕) */
export const LINK_LABEL_SIZES = Object.freeze({ small: 0.8, large: 1.35 });
export const LINK_LABEL_STYLES = ['fill', 'none'];
export const linkLabelSize = (link) => r3(Math.max(2.4, Math.min(4, 2.2 + (Number(link?.line) || 0) * 0.8)) * (LINK_LABEL_SIZES[link?.labelSize] || 1));
const xmlText = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// 그려진 길을 꺾은선으로(선 상자 안의 좌표): 곧은 선은 두 끝, 꺾인 선은 꺾이는 점까지, 곡선은 32 마디로 나눠서.
function routeOf(p) {
  if (p.length === 6) return Array.from({ length: 33 }, (_, i) => { const t = i / 32, u = 1 - t; return [u * u * p[0] + 2 * u * t * p[4] + t * t * p[2], u * u * p[1] + 2 * u * t * p[5] + t * t * p[3]]; });
  return p.length === 8 ? [[p[0], p[1]], [p[4], p[5]], [p[6], p[7]], [p[2], p[3]]] : [[p[0], p[1]], [p[2], p[3]]];
}
// 길을 따라 t(0 처음 ~ 1 끝)만큼 간 자리. 선 위의 글은 labelAt(없으면 한가운데 0.5)에 놓는다.
function pointOnLine(p, t = 0.5) {
  const pts = routeOf(p);
  const lens = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  let left = lens.reduce((a, b) => a + b, 0) * t;
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, left / lens[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    left -= lens[i];
  }
  return pts[0];
}
/** 선 위 글의 자리(labelAt)를 정할 수 있는 범위: 머리에 가리지 않게 양 끝은 조금 비운다. */
export const LINK_LABEL_AT = Object.freeze({ min: 0.05, max: 0.95 });
const labelT = (link) => (Number.isFinite(link?.labelAt) ? Math.min(LINK_LABEL_AT.max, Math.max(LINK_LABEL_AT.min, link.labelAt)) : 0.5);
/** 카드 위의 자리 point 에서 가장 가까운 선 위의 곳이 길을 따라 얼마쯤인지(labelAt 으로 쓸 값). 선 위 글을 끌 때 쓴다. */
export function linkLabelT(link, point, aspect = 1) {
  const left = link.x - link.w / 2, top = link.y / aspect - link.vh / 2;
  const px = point[0] - left, py = point[1] / aspect - top, pts = routeOf(link.pts);
  let walked = 0, best = Infinity, bestAt = 0.5, total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    const k = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len))) : 0;
    const d = Math.hypot(ax + dx * k - px, ay + dy * k - py);
    if (d < best) { best = d; bestAt = total ? (walked + len * k) / total : 0.5; }
    walked += len;
  }
  return Math.round(Math.min(LINK_LABEL_AT.max, Math.max(LINK_LABEL_AT.min, bestAt)) * 1000) / 1000;
}
/** 선 위의 글이 놓이는 자리(카드 위: x 는 카드 너비의 %, y 는 카드 높이의 %). PPTX 가 쓴다. */
export function linkLabelAt(link, aspect = 1) {
  const [x, y] = pointOnLine(link.pts, labelT(link));
  return [link.x - link.w / 2 + x, (link.y / aspect - link.vh / 2 + y) * aspect];
}
export const LINK_SIDES = ['top', 'right', 'bottom', 'left'];
// 옆마다 바깥을 향하는 방향과 그 옆이 놓인 축(0 = 가로로 나간다, 1 = 세로로 나간다)
const NORMAL = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
const axisOf = (side) => (side === 'left' || side === 'right' ? 0 : 1);
const halfOf = (box, axis) => (axis === 0 ? box.hw : box.hh);
// 조각의 그 옆 가운데에서 바깥으로 gap 만큼 떨어진 점
// box.at: { 옆: 자리 } 이면 그 옆의 가운데 대신 그 자리(0 처음 ~ 1 끝: 위 · 아래 옆은 왼쪽에서, 왼쪽 · 오른쪽 옆은 위에서 잰다)에 붙는다.
// 동그란 조각은 그 자리의 테두리가 타원을 따라 안쪽으로 들어오므로 그만큼 당겨 붙인다.
const sidePoint = (box, side, gap) => {
  const along = ((box.at?.[side] ?? 0.5) - 0.5) * 2, depth = box.round ? Math.sqrt(Math.max(0, 1 - along * along)) : 1;
  return axisOf(side) === 1
    ? [box.cx + along * box.hw, box.cy + NORMAL[side][1] * (box.hh * depth + gap)]
    : [box.cx + NORMAL[side][0] * (box.hw * depth + gap), box.cy + along * box.hh];
};
/** 한 옆 위의 자리(fromPos · toPos)로 고를 수 있는 범위 */
export const LINK_POS = Object.freeze({ min: 0.1, max: 0.9 });
const posOf = (v) => (Number.isFinite(v) ? Math.min(LINK_POS.max, Math.max(LINK_POS.min, v)) : null);
export const LINK_LINE = Object.freeze({ min: 0.2, max: 3, base: 0.5, step: 0.1 });
const GAP = 0.8;               // 조각의 테두리에서 선 끝까지 띄우는 거리
const r3 = (v) => Math.round(v * 1000) / 1000;

// 조각이 차지하는 네모(가운데 x·y 와 반너비·반높이, 모두 카드 너비의 % 단위). 글은 높이를 적지 않았으면 글자 수로 어림한다.
export function boxOfItem(it, aspect = 1) {
  const cx = it.x, cy = it.y / aspect;
  if (it.t === 'emoji') return { cx, cy, hw: it.w / 2, hh: it.w / 2 };
  if (it.t === 'text') {
    let hh;
    if (Number.isFinite(it.h) && it.h > 0) hh = it.h / aspect / 2;
    else {
      const per = Math.max(1, it.w / Math.max(0.1, it.size * 0.9));        // 한 줄에 들어가는 글자 수(한글 한 자 ≈ 글자 크기)
      const lines = String(it.text || ' ').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(Array.from(line).length / per)), 0);
      hh = (lines * it.size * (it.lh || 1.3)) / 2;
    }
    return { cx, cy, hw: it.w / 2, hh };
  }
  // 동그란 도형 · 동그랗게 자른 사진은 테두리가 타원이다(선 끝이 네모 모서리만큼 떨어져 보이지 않게).
  const round = (it.t === 'shape' && it.shape === 'circle') || (it.t === 'image' && it.mask === 'circle');
  return { cx, cy, hw: (Number(it.w) || 0) / 2, hh: (Number(it.h) || 0) / aspect / 2, round };
}

// 가운데에서 다른 점으로 가는 반직선이 네모의 테두리와 만나는 곳까지의 비율(0~1).
const exitOf = (box, dx, dy) => (box.round && box.hw > 0 && box.hh > 0
  ? 1 / Math.hypot(dx / box.hw, dy / box.hh)
  : Math.min(dx ? box.hw / Math.abs(dx) : Infinity, dy ? box.hh / Math.abs(dy) : Infinity));

/**
 * 두 조각 사이의 선. 돌려주는 것: { x, y, w, h, pts, vh } (위의 "계산해서 붙이는 값"). 두 조각이 겹치면 가운데끼리 잇는다.
 * 화살표 머리가 들어갈 자리를 남기도록 네모를 넉넉하게 잡는다.
 */
/** 곡선이 휘는 깊이: 두 조각 가운데 사이 거리에 대한 비율(조절점이 이만큼 옆으로 간다). */
export const CURVE_BEND = 0.3;
export const LINK_BEND = Object.freeze({ min: 0.05, max: 0.9 });
const bendOf = (v) => (Number.isFinite(v) ? Math.min(LINK_BEND.max, Math.max(LINK_BEND.min, v)) : CURVE_BEND);
const turnOf = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
// 2차 베지어 곡선(p1 · c · p2)이 지나는 가장 바깥의 x · y(네모를 곡선에 꼭 맞게 잡는다).
function curveBounds(p1, c, p2) {
  const xs = [p1[0], p2[0]], ys = [p1[1], p2[1]];
  for (const k of [0, 1]) {
    const d = p1[k] - 2 * c[k] + p2[k];
    if (Math.abs(d) < 1e-9) continue;
    const t = (p1[k] - c[k]) / d;
    if (t > 0 && t < 1) (k ? ys : xs).push((1 - t) ** 2 * p1[k] + 2 * (1 - t) * t * c[k] + t * t * p2[k]);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
// 꺾인 선: 가로 먼저(1)면 두 조각의 마주 보는 옆(왼쪽·오른쪽 가운데)에서 나와 가운데 세로줄에서 꺾고, 세로 먼저(-1)면 위·아래에서 나와 가운데 가로줄에서 꺾는다.
function elbowGeometry(A, B, line, elbow, swapped = false, turn = 0.5) {
  const across = elbow > 0 ? 0 : 1, along = 1 - across;                 // across: 먼저 가는 축(0 = 가로, 1 = 세로)
  const ca = [A.cx, A.cy], cb = [B.cx, B.cy], half = (box) => (across === 0 ? box.hw : box.hh);
  const dir = Math.sign(cb[across] - ca[across]) || 1, gap = GAP + line;
  const p1 = [...ca], p2 = [...cb];
  p1[across] = ca[across] + dir * (half(A) + gap);
  p2[across] = cb[across] - dir * (half(B) + gap);
  const mid = p1[across] + (p2[across] - p1[across]) * turn;
  const m1 = [0, 0], m2 = [0, 0];
  m1[across] = mid; m1[along] = p1[along];
  m2[across] = mid; m2[along] = p2[along];
  const zigzag = { p1, p2, m1, m2 };
  if ((p2[across] - p1[across]) * dir >= gap * 2) return zigzag;
  // 먼저 가는 축으로 두 조각이 겹쳐서 가운데에서 꺾을 틈이 없으면, 한 번만 꺾는 ㄱ자로 잇는다:
  // 먼저 가는 축으로 B 의 가운데 줄까지 가서 꺾고, B 의 옆으로 들어간다(꺾이는 두 점이 한 점이 된다).
  const dirB = Math.sign(cb[along] - ca[along]) || 1, halfB = along === 0 ? B.hw : B.hh;
  const corner = [0, 0];
  corner[across] = cb[across]; corner[along] = ca[along];
  const enter = [...cb];
  enter[along] = cb[along] - dirB * (halfB + gap);
  if (Math.abs(cb[across] - ca[across]) > half(A) + gap * 2 && (enter[along] - corner[along]) * dirB > gap) {
    return { p1, p2: enter, m1: corner, m2: [...corner] };
  }
  // ㄱ자도 안 되면(나란히 놓인 두 조각) 다른 축 먼저 꺾는다. 그것도 안 되면(서로 겹친 조각) 처음 모양 그대로.
  return swapped ? null : elbowGeometry(A, B, line, -elbow, true, turn) || zigzag;
}
// 붙는 곳을 고른 꺾인 선: 고른 옆은 그 옆의 바깥 방향으로 나가고(고르지 않은 끝은 상대 쪽을 향해 elbow 의 축으로), 두 끝의 축이
// 같으면 ㄹ자(마주 볼 때) · ㄷ자(같은 쪽을 볼 때, 둘보다 바깥에서 돌아온다), 다르면 ㄱ자로 한 번 꺾는다.
function sidedElbow(A, B, line, elbow, fromSide, toSide, turn = 0.5) {
  const gap = GAP + line, ca = [A.cx, A.cy], cb = [B.cx, B.cy];
  const a1 = fromSide ? axisOf(fromSide) : elbow > 0 ? 0 : 1;
  const a2 = toSide ? axisOf(toSide) : fromSide ? a1 : elbow > 0 ? 0 : 1;
  const towardB = toSide ? sidePoint(B, toSide, gap) : cb;
  let n1, p1;
  if (fromSide) { p1 = sidePoint(A, fromSide, gap); n1 = NORMAL[fromSide][a1]; }
  else { n1 = Math.sign(towardB[a1] - ca[a1]) || 1; p1 = [...ca]; p1[a1] = ca[a1] + n1 * (halfOf(A, a1) + gap); }
  let n2, p2;
  if (toSide) { p2 = sidePoint(B, toSide, gap); n2 = NORMAL[toSide][a2]; }
  else { n2 = Math.sign(p1[a2] - cb[a2]) || 1; p2 = [...cb]; p2[a2] = cb[a2] + n2 * (halfOf(B, a2) + gap); }
  if (a1 !== a2) {
    const corner = [0, 0];
    corner[a1] = p2[a1]; corner[a2] = p1[a2];
    return { p1, p2, m1: corner, m2: [...corner] };
  }
  const other = 1 - a1;
  const mid = n1 === n2 ? (n1 > 0 ? Math.max(p1[a1], p2[a1]) : Math.min(p1[a1], p2[a1])) : p1[a1] + (p2[a1] - p1[a1]) * turn;
  const m1 = [0, 0], m2 = [0, 0];
  m1[a1] = mid; m1[other] = p1[other];
  m2[a1] = mid; m2[other] = p2[other];
  return { p1, p2, m1, m2 };
}
// ---------- 피해 가기: 꺾인 선이 다른 조각을 뚫지 않는 길 ----------
// 늘 쓰는 길이 다른 조각(obstacles: 네모 [왼, 위, 오른, 아래], 카드 너비의 % 단위)을 지나면, 몇 가지 길을 더 그려 보고
// 아무것도 지나지 않는(없으면 가장 적게 지나는) 가장 짧은 길을 고른다. 길은 늘 꺾이는 점 둘까지(pts 8개)라 그리기 · PPTX 는 그대로다.
const TURNS = [0.5, 0.3, 0.7, 0.15, 0.85, 0.02, 0.98];
// 가로 · 세로 마디 하나가 네모의 속을 지나는가(테두리에 닿기만 하면 지나지 않은 것으로 본다)
function crosses([x1, y1], [x2, y2], [l, t, r, b]) {
  const e = 1e-6;
  if (Math.abs(y1 - y2) < e) return y1 > t + e && y1 < b - e && Math.max(x1, x2) > l + e && Math.min(x1, x2) < r - e;
  if (Math.abs(x1 - x2) < e) return x1 > l + e && x1 < r - e && Math.max(y1, y2) > t + e && Math.min(y1, y2) < b - e;
  return Math.max(x1, x2) > l && Math.min(x1, x2) < r && Math.max(y1, y2) > t && Math.min(y1, y2) < b;
}
function routeCost({ p1, p2, m1, m2 }, rects, t) {
  const pts = [p1, m1, m2, p2], segs = [[p1, m1], [m1, m2], [m2, p2]];
  const hits = rects.filter((rect) => segs.some(([u, v]) => crosses(u, v, rect))).length;
  const length = segs.reduce((n, [u, v]) => n + Math.hypot(v[0] - u[0], v[1] - u[1]), 0);
  const corners = Math.hypot(m1[0] - m2[0], m1[1] - m2[1]) < 1e-6 ? 1 : 2;
  return { hits, score: hits * 1e4 + length + corners * 2 + Math.abs(t - 0.5) * 4, pts };
}
function avoidingElbow(A, B, line, elbow, fromSide, toSide, turn, obstacles) {
  const gap = GAP + line, grow = gap * 0.6;
  // 피할 것: 다른 조각들(선과 떨어지게 조금 넓혀서)과, 잇는 두 조각 자신(선이 되돌아와 뚫지 않게)
  const rects = [...obstacles.map(([l, t, r, b]) => [l - grow, t - grow, r + grow, b + grow]),
    ...[A, B].map((box) => [box.cx - box.hw, box.cy - box.hh, box.cx + box.hw, box.cy + box.hh])];
  const usual = fromSide || toSide ? sidedElbow(A, B, line, elbow, fromSide, toSide, turn) : elbowGeometry(A, B, line, elbow, false, turn);
  if (!routeCost(usual, rects, 0.5).hits) return usual;
  const tries = [];
  for (const t of TURNS) {
    if (fromSide || toSide) tries.push([sidedElbow(A, B, line, elbow, fromSide, toSide, t), t]);
    else {
      for (const e of [elbow, -elbow]) tries.push([elbowGeometry(A, B, line, e, false, t), t]);
      for (const s1 of LINK_SIDES) for (const s2 of LINK_SIDES) tries.push([sidedElbow(A, B, line, elbow, s1, s2, t), t]);
    }
  }
  // 두 조각 바깥으로 돌아가는 길(ㄷ자): 같은 옆에서 나와, 그 사이에 걸친 조각들보다 더 바깥 줄에서 돌아온다.
  const sides = fromSide && toSide ? (fromSide === toSide ? [fromSide] : []) : fromSide || toSide ? [fromSide || toSide] : LINK_SIDES;
  for (const side of sides) {
    const axis = axisOf(side), other = 1 - axis, n = NORMAL[side][axis];
    const p1 = sidePoint(A, side, gap), p2 = sidePoint(B, side, gap);
    const lo = Math.min(p1[other], p2[other]), hi = Math.max(p1[other], p2[other]);
    const span = rects.filter((rect) => rect[other + 2] > lo && rect[other] < hi);
    const edge = n < 0 ? Math.min(p1[axis], p2[axis], ...span.map((rect) => rect[axis] - gap)) : Math.max(p1[axis], p2[axis], ...span.map((rect) => rect[axis + 2] + gap));
    const m1 = [0, 0], m2 = [0, 0];
    m1[axis] = edge; m1[other] = p1[other];
    m2[axis] = edge; m2[other] = p2[other];
    tries.push([{ p1, p2, m1, m2 }, 0.5]);
  }
  let best = usual, bestScore = routeCost(usual, rects, 0.5).score;
  for (const [route, t] of tries) {
    const { score } = routeCost(route, rects, t);
    if (score < bestScore - 1e-9) { best = route; bestScore = score; }
  }
  return best;
}
export function linkGeometry(a, b, { line = LINK_LINE.base, aspect = 1, curve = 0, elbow = 0, fromSide, toSide, fromPos, toPos, bend, turn, obstacles = null } = {}) {
  const A = boxOfItem(a, aspect), B = boxOfItem(b, aspect);
  fromSide = LINK_SIDES.includes(fromSide) ? fromSide : null;
  toSide = LINK_SIDES.includes(toSide) ? toSide : null;
  // 고른 옆 위의 자리(없으면 가운데)
  if (fromSide && posOf(fromPos) != null) A.at = { [fromSide]: posOf(fromPos) };
  if (toSide && posOf(toPos) != null) B.at = { [toSide]: posOf(toPos) };
  if (elbow) {
    const t = turnOf(turn);
    const { p1, p2, m1, m2 } = obstacles ? avoidingElbow(A, B, line, elbow, fromSide, toSide, t, obstacles)
      : fromSide || toSide ? sidedElbow(A, B, line, elbow, fromSide, toSide, t) : elbowGeometry(A, B, line, elbow, false, t);
    const pad = Math.max(1.5, line * 3 + 1);
    const xs = [p1[0], p2[0], m1[0], m2[0]], ys = [p1[1], p2[1], m1[1], m2[1]];
    const left = Math.min(...xs) - pad, top = Math.min(...ys) - pad, bw = Math.max(...xs) - Math.min(...xs) + pad * 2, bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
    const rel = ([x, y]) => [r3(x - left), r3(y - top)];
    return { x: r3(left + bw / 2), y: r3((top + bh / 2) * aspect), w: r3(bw), h: r3(bh * aspect), vh: r3(bh), pts: [...rel(p1), ...rel(p2), ...rel(m1), ...rel(m2)] };
  }
  // 붙는 곳을 고른 끝은 그 옆 가운데에 붙는다. 곡선의 조절점과 다른 끝이 향하는 곳도 그 점을 기준으로 잡는다.
  const gap = GAP + line;
  const PA = fromSide ? sidePoint(A, fromSide, gap) : null, PB = toSide ? sidePoint(B, toSide, gap) : null;
  const ca = PA || [A.cx, A.cy], cb = PB || [B.cx, B.cy];
  const dx = cb[0] - ca[0], dy = cb[1] - ca[1], len = Math.hypot(dx, dy);
  const side = curve > 0 ? 1 : curve < 0 ? -1 : 0;
  // 곡선: 두 가운데(붙인 끝은 그 점)의 한가운데에서 옆(가는 쪽의 왼쪽이 +)으로 비킨 점을 조절점으로 삼는다. 선은 그 점을 향해 조각을 떠나고 들어온다.
  const depth = bendOf(bend) * side;
  const c0 = side && len > 0.01 ? [(ca[0] + cb[0]) / 2 + dy * depth, (ca[1] + cb[1]) / 2 - dx * depth] : null;
  let p1 = [...ca], p2 = [...cb];
  if (len > 0.01 && (PA || PB)) {
    // 한쪽만 붙였으면 다른 쪽은 붙인 점(곡선이면 조절점)을 향해 테두리를 떠난다.
    const exit = (box, [tx, ty]) => {
      const vx = tx - box.cx, vy = ty - box.cy, l = Math.hypot(vx, vy);
      if (l < 0.01) return [box.cx, box.cy];
      const t = exitOf(box, vx, vy) + gap / l;
      return [box.cx + vx * t, box.cy + vy * t];
    };
    if (!PA) p1 = exit(A, c0 || cb);
    if (!PB) p2 = exit(B, c0 || ca);
  } else if (len > 0.01) {
    // 떠나는 방향(곡선이면 조절점 쪽) — 테두리에서 그 방향으로 조금 떨어진 곳에서 시작하고 끝난다.
    const [ax, ay] = c0 ? [c0[0] - A.cx, c0[1] - A.cy] : [dx, dy];
    const [bx, by] = c0 ? [c0[0] - B.cx, c0[1] - B.cy] : [-dx, -dy];
    const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    const ta = exitOf(A, ax, ay), tb = exitOf(B, bx, by), ga = (GAP + line) / la, gb = (GAP + line) / lb;
    // 두 조각이 너무 가까우면(남는 길이가 없으면) 가운데끼리 잇는다.
    if ((ta + ga) * la + (tb + gb) * lb < len * 0.95) {
      p1 = [A.cx + ax * (ta + ga), A.cy + ay * (ta + ga)];
      p2 = [B.cx + bx * (tb + gb), B.cy + by * (tb + gb)];
    }
  }
  const c = c0 ? [c0[0], c0[1]] : null;
  const pad = Math.max(1.5, line * 3 + 1);
  const [x0, y0, x1, y1] = c ? curveBounds(p1, c, p2) : [Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])];
  const left = x0 - pad, top = y0 - pad, bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
  return {
    x: r3(left + bw / 2), y: r3((top + bh / 2) * aspect), w: r3(bw), h: r3(bh * aspect), vh: r3(bh),
    pts: [r3(p1[0] - left), r3(p1[1] - top), r3(p2[0] - left), r3(p2[1] - top), ...(c ? [r3(c[0] - left), r3(c[1] - top)] : [])],
  };
}

/**
 * 요소 목록의 연결선을 모두 다시 계산한다. 잇는 조각이 없어졌거나(지웠거나 다른 장으로 갔거나) 자기 자신·다른 연결선을 잇는 선은 뺀다.
 * 연결선이 아닌 요소는 그대로(같은 객체) 둔다. 돌려주는 것: 새 목록.
 */
export function layoutLinks(items, aspect = 1) {
  const list = Array.isArray(items) ? items : [];
  if (!list.some((it) => it?.t === 'link')) return list;
  const byId = new Map(list.filter((it) => it && it.t !== 'link' && it.id).map((it) => [it.id, it]));
  // 피해 갈 조각들: 잠그지 않은 것(배경으로 깐 사진은 잠겨 있다) 가운데 카드를 거의 덮지 않는 것
  let pieces = null;
  const obstaclesFor = (a, b) => {
    pieces ||= list.filter((it) => it && it.t !== 'link' && !it.lock && !(Number(it.w) >= 90 && Number(it.h) >= 90))
      .map((it) => [it, boxOfItem(it, aspect)]).map(([it, box]) => [it, [box.cx - box.hw, box.cy - box.hh, box.cx + box.hw, box.cy + box.hh]]);
    return pieces.filter(([it]) => it !== a && it !== b).map(([, rect]) => rect);
  };
  return list.flatMap((it) => {
    if (it?.t !== 'link') return [it];
    const a = byId.get(it.from), b = byId.get(it.to);
    if (!a || !b || a === b) return [];
    const opts = linkOptions(it, aspect);
    if (it.avoid && it.elbow) opts.obstacles = obstaclesFor(a, b);
    return [{ ...it, rot: 0, ...linkGeometry(a, b, opts) }];
  });
}

/** 선의 두 끝을 카드 위의 자리로(x 는 카드 너비의 %, y 는 카드 높이의 %). PPTX 와 영상이 쓴다. */
export function linkEnds(link, aspect = 1) {
  const left = link.x - link.w / 2, top = link.y / aspect - link.vh / 2;
  const [x1, y1, x2, y2] = link.pts;
  return [[left + x1, (top + y1) * aspect], [left + x2, (top + y2) * aspect]];
}
/** 꺾인 선의 꺾이는 두 점(카드 위의 자리, linkEnds 와 같은 단위). 꺾인 선이 아니면 null. */
export function linkCorners(link, aspect = 1) {
  if (link.pts?.length !== 8) return null;
  const left = link.x - link.w / 2, top = link.y / aspect - link.vh / 2, p = link.pts;
  return [[left + p[4], (top + p[5]) * aspect], [left + p[6], (top + p[7]) * aspect]];
}
/** 곡선의 조절점(카드 위의 자리, linkEnds 와 같은 단위). 직선이면 null. */
export function linkControl(link, aspect = 1) {
  if (link.pts?.length !== 6) return null;
  return [link.x - link.w / 2 + link.pts[4], (link.y / aspect - link.vh / 2 + link.pts[5]) * aspect];
}

const linkOptions = (it, aspect) => ({ line: it.line, aspect, curve: it.curve, elbow: it.elbow, fromSide: it.fromSide, toSide: it.toSide, fromPos: it.fromPos, toPos: it.toPos, bend: it.bend, turn: it.turn });
// 선의 상자 안 좌표 → 카드 위의 자리(x 는 카드 너비의 %, y 는 카드 높이의 %)
const onCard = (link, aspect, x, y) => [link.x - link.w / 2 + x, (link.y / aspect - link.vh / 2 + y) * aspect];

/**
 * 고른 선의 손잡이: 곡선은 곡선의 한가운데(끌면 휘는 깊이와 쪽이 바뀐다), 꺾인 선은 가운데 마디의 한가운데(끌면 꺾이는 자리가 옮겨 간다).
 * 돌려주는 것: { kind: 'bend' | 'turn', at: [x, y] }(카드 위의 자리) · 손잡이가 없는 선(곧은 선 · 한 번만 꺾는 선 · 바깥으로 돌아오는 선)은 null.
 */
export function linkHandle(link, aspect = 1) {
  const p = link?.pts;
  if (p?.length === 6) {
    const x = 0.25 * p[0] + 0.5 * p[4] + 0.25 * p[2], y = 0.25 * p[1] + 0.5 * p[5] + 0.25 * p[3];
    return { kind: 'bend', at: onCard(link, aspect, x, y) };
  }
  if (p?.length !== 8 || Math.hypot(p[4] - p[6], p[5] - p[7]) < 1e-6) return null;
  // 같은 쪽을 보는 두 옆을 고른 선(ㄷ자)은 꺾이는 자리가 두 조각의 바깥으로 정해진다. 피해 가는 선은 길을 스스로 찾는다.
  if (LINK_SIDES.includes(link.fromSide) && link.fromSide === link.toSide) return null;
  if (link.avoid) return null;
  return { kind: 'turn', at: onCard(link, aspect, (p[4] + p[6]) / 2, (p[5] + p[7]) / 2) };
}

/**
 * 손잡이를 카드 위의 자리 point 로 끌었을 때 그 선에 적을 값. a · b: 잇는 두 조각.
 * 곡선: 곡선의 한가운데가 그 자리를 지나도록 휘는 쪽(curve)과 깊이(bend)를 찾는다. 꺾인 선: 꺾이는 자리(turn)를 두 끝 사이의 비율로.
 * 돌려주는 것: 바꿀 값들(그 선에 손잡이가 없으면 null).
 */
export function dragLinkHandle(link, a, b, point, aspect = 1) {
  const handle = linkHandle(link, aspect);
  if (!handle || !a || !b) return null;
  const px = point[0], py = point[1] / aspect;
  if (handle.kind === 'turn') {
    const p = link.pts;
    const axis = Math.abs(p[4] - p[6]) < 1e-6 ? 0 : 1;          // 가운데 마디가 세로면 꺾이는 자리는 가로로 옮겨 간다
    const [s, e] = [onCard(link, aspect, p[0], p[1]), onCard(link, aspect, p[2], p[3])].map(([x, y]) => [x, y / aspect]);
    const span = e[axis] - s[axis];
    if (Math.abs(span) < 1e-6) return null;
    return { turn: r3(turnOf(((axis ? py : px) - s[axis]) / span)) };
  }
  // 곡선: 두 끝(붙인 끝은 그 점)을 잇는 줄에서 옆으로 얼마나 비켰는지(가는 쪽의 왼쪽이 +)를 재고, 곡선의 한가운데가 그만큼 비키는 깊이를 반으로 나눠 찾는다.
  const offsetOf = (geo) => {
    const h = linkHandle(geo, aspect).at, at = [h[0], h[1] / aspect];
    return (at[0] - mid[0]) * nx + (at[1] - mid[1]) * ny;
  };
  const opts = linkOptions(link, aspect);
  const straight = linkGeometry(a, b, { ...opts, curve: 0, elbow: 0 });
  const [[sx, sy], [ex, ey]] = linkEnds(straight, aspect).map(([x, y]) => [x, y / aspect]);
  const len = Math.hypot(ex - sx, ey - sy);
  if (len < 0.01) return null;
  const nx = (ey - sy) / len, ny = -(ex - sx) / len, mid = [(sx + ex) / 2, (sy + ey) / 2];
  const want = (px - mid[0]) * nx + (py - mid[1]) * ny;
  const curve = want >= 0 ? 1 : -1;
  const reach = (depth) => curve * offsetOf(linkGeometry(a, b, { ...opts, elbow: 0, curve, bend: depth }));
  let lo = LINK_BEND.min, hi = LINK_BEND.max;
  const goal = Math.abs(want);
  if (reach(lo) >= goal) return { curve, bend: lo };
  if (reach(hi) <= goal) return { curve, bend: hi };
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (reach(m) < goal) lo = m; else hi = m; }
  return { curve, bend: r3((lo + hi) / 2) };
}

/**
 * 선의 끝을 조각 위의 point(카드 위의 자리, linkEnds 와 같은 단위)에 놓았을 때 붙는 곳: { side, pos }.
 * 가운데 언저리(반너비 · 반높이의 40% 안)면 {}(알아서). 아니면 가장 가까운 테두리의 옆과, 그 옆을 따라 잰 자리(0.05 마디, 가운데 가까우면 0.5).
 */
export function endSpot(item, point, aspect = 1) {
  const box = boxOfItem(item, aspect), px = point[0], py = point[1] / aspect;
  if (!(box.hw > 0 && box.hh > 0)) return {};
  const dx = px - box.cx, dy = py - box.cy;
  if (Math.abs(dx) < box.hw * 0.4 && Math.abs(dy) < box.hh * 0.4) return {};
  const across = box.hh - Math.abs(dy) < box.hw - Math.abs(dx);      // 위 · 아래 테두리가 더 가깝다
  const side = across ? (dy > 0 ? 'bottom' : 'top') : (dx > 0 ? 'right' : 'left');
  const t = across ? (dx + box.hw) / (2 * box.hw) : (dy + box.hh) / (2 * box.hh);
  let pos = Math.min(LINK_POS.max, Math.max(LINK_POS.min, Math.round(t * 20) / 20));
  if (Math.abs(pos - 0.5) < 0.075) pos = 0.5;
  return { side, pos: r3(pos) };
}
/** 끝을 point 에 놓을 조각을 고른다: 그 점을 품은 것(위에 있는 것 먼저), 없으면 테두리에서 near 안쪽으로 가까운 것. 연결선 · 잠근 것은 빼고 번호(없으면 -1). */
export function pieceNear(items, point, aspect = 1, near = 2) {
  const px = point[0], py = point[1] / aspect;
  let best = -1, gap = near;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!it || it.t === 'link' || it.lock) continue;
    const b = boxOfItem(it, aspect);
    const out = Math.max(Math.abs(px - b.cx) - b.hw, Math.abs(py - b.cy) - b.hh);   // 네모 바깥으로 떨어진 거리(안이면 0 이하)
    if (out <= 0) return i;
    if (out < gap) { gap = out; best = i; }
  }
  return best;
}

/** 다른 조각을 복제·붙여넣기했을 때: 원래 이름표 → 새 이름표 로 잇는 곳을 바꾼다(둘 다 함께 옮긴 선만). */
export function relink(copies, idMap) {
  return copies.map((it) => (it?.t === 'link' && idMap.has(it.from) && idMap.has(it.to) ? { ...it, from: idMap.get(it.from), to: idMap.get(it.to) } : it));
}

/** 연결선 하나의 SVG(네모 안의 좌표). 선(직선 또는 곡선) · 화살표 머리 · 누르기 쉬운 넓은 투명 선. */
export function linkSvg(link) {
  const [x1, y1, x2, y2, qx, qy, rx, ry] = link.pts, line = link.line, curved = link.pts.length === 6, bent = link.pts.length === 8;
  // 화살표 머리의 방향: 직선은 선의 방향, 곡선은 그 끝에서의 접선(조절점 → 끝).
  const unit = (fx, fy, tx, ty) => { const dx = tx - fx, dy = ty - fy, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  // 꺾인 선은 마지막 마디(둘째 꺾이는 점 → 끝)와 첫 마디(첫 꺾이는 점 → 처음)의 방향. 마디가 0 이면(곧게 맞선 조각) 두 끝의 방향.
  const [ex, ey] = curved ? unit(qx, qy, x2, y2) : bent && Math.hypot(x2 - rx, y2 - ry) > 1e-6 ? unit(rx, ry, x2, y2) : unit(x1, y1, x2, y2);
  const [sx, sy] = curved ? unit(qx, qy, x1, y1) : bent && Math.hypot(x1 - qx, y1 - qy) > 1e-6 ? unit(qx, qy, x1, y1) : unit(x2, y2, x1, y1);
  const size = Math.max(1.4, line * 3.2), half = size * 0.55;
  // 머리: 끝점(tx, ty)에서 선이 들어오는 방향(ux, uy)으로. 모양마다 선을 얼마나 덜 그릴지(cut)도 정한다(머리 안으로 선이 비치지 않게).
  const pt = (x, y) => `${r3(x)},${r3(y)}`;
  const head = (shape, tx, ty, ux, uy) => {
    const px = -uy, py = ux, back = (k) => [tx - ux * size * k, ty - uy * size * k];
    if (shape === 'open') {
      const [bx, by] = back(0.9);
      return `<polyline class="fi-link-head" points="${pt(bx + px * half, by + py * half)} ${pt(tx, ty)} ${pt(bx - px * half, by - py * half)}" fill="none" stroke="${link.color}" stroke-width="${r3(line)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (shape === 'dot' || shape === 'ring') {
      const r = shape === 'ring' ? Math.max(1.1, size * 0.42, line * 1.6) : Math.max(0.7, size * 0.36), [cx, cy] = [tx - ux * r, ty - uy * r];
      return shape === 'dot'
        ? `<circle class="fi-link-head" cx="${r3(cx)}" cy="${r3(cy)}" r="${r3(r)}" fill="${link.color}"/>`
        : `<circle class="fi-link-head" cx="${r3(cx)}" cy="${r3(cy)}" r="${r3(Math.max(0.3, r - line / 2))}" fill="none" stroke="${link.color}" stroke-width="${r3(line)}"/>`;
    }
    if (shape === 'diamond') {
      const [mx, my] = back(0.6), [bx, by] = back(1.2), w = half * 0.8;
      return `<polygon class="fi-link-head" points="${pt(tx, ty)} ${pt(mx + px * w, my + py * w)} ${pt(bx, by)} ${pt(mx - px * w, my - py * w)}" fill="${link.color}"/>`;
    }
    if (shape === 'bar') {
      const [bx, by] = back(0.05);
      return `<line class="fi-link-head" x1="${r3(bx + px * half * 1.1)}" y1="${r3(by + py * half * 1.1)}" x2="${r3(bx - px * half * 1.1)}" y2="${r3(by - py * half * 1.1)}" stroke="${link.color}" stroke-width="${r3(line * 1.2)}" stroke-linecap="round"/>`;
    }
    const [bx, by] = back(1);
    return `<polygon class="fi-link-head" points="${pt(tx, ty)} ${pt(bx - uy * half, by + ux * half)} ${pt(bx + uy * half, by - ux * half)}" fill="${link.color}"/>`;
  };
  const cutOf = (shape) => (shape === 'ring' ? 2 * Math.max(1.1, size * 0.42, line * 1.6) : size * ({ arrow: 0.8, open: 0.1, dot: 0.6, diamond: 1.15, bar: 0 }[shape] ?? 0.8));
  const shapeOf = (v) => (LINK_SHAPES.includes(v) ? v : 'arrow');
  const startShape = shapeOf(link.startShape), endShape = shapeOf(link.endShape);
  const end = link.head === 'end' || link.head === 'both' || link.head === undefined, start = link.head === 'both' || link.head === 'start';
  // 머리가 있는 끝은 선을 머리의 밑변까지만 그린다(뾰족한 끝이 굵은 선에 묻히지 않게).
  const a = start ? [x1 + sx * cutOf(startShape), y1 + sy * cutOf(startShape)] : [x1, y1];
  const b = end ? [x2 - ex * cutOf(endShape), y2 - ey * cutOf(endShape)] : [x2, y2];
  // 점선: 긴 점선은 끝을 자르고, 동글 점은 길이 없는 점을 둥근 끝으로 찍고, 긴 점과 점은 둘을 번갈아.
  const dashes = link.dash === 'dot' ? [0.01, line * 2.2] : link.dash === 'dashdot' ? [line * 4, line * 2, 0.01, line * 2] : link.dash ? [line * 3, line * 2] : null;
  const dash = dashes ? ` stroke-dasharray="${dashes.map(r3).join(' ')}"` : '';
  const paint = `stroke="${link.color}" stroke-width="${r3(line)}" stroke-linecap="${link.dash === true ? 'butt' : 'round'}"${dash}`;
  const hit = r3(Math.max(3, line * 3));
  // 꺾인 선: 꺾이는 곳을 조금 둥글게(굵기에 맞춰, 마디의 절반을 넘지 않게) 돌린다.
  // 꺾이는 두 점이 한 점이면(ㄱ자) 한 번만 꺾는다.
  const elbowPath = (s, e) => {
    const pts = [s, [qx, qy], ...(Math.hypot(rx - qx, ry - qy) > 1e-6 ? [[rx, ry]] : []), e];
    const round = Math.max(1, line * 2.5);
    let d = `M${r3(s[0])} ${r3(s[1])}`;
    for (let k = 1; k < pts.length - 1; k++) {
      const [p, c, n] = [pts[k - 1], pts[k], pts[k + 1]];
      const inLen = Math.hypot(c[0] - p[0], c[1] - p[1]), outLen = Math.hypot(n[0] - c[0], n[1] - c[1]);
      const r = Math.min(round, inLen / 2, outLen / 2);
      if (r < 1e-3) { d += `L${r3(c[0])} ${r3(c[1])}`; continue; }
      const a = [c[0] + ((p[0] - c[0]) / inLen) * r, c[1] + ((p[1] - c[1]) / inLen) * r], b = [c[0] + ((n[0] - c[0]) / outLen) * r, c[1] + ((n[1] - c[1]) / outLen) * r];
      d += `L${r3(a[0])} ${r3(a[1])}Q${r3(c[0])} ${r3(c[1])} ${r3(b[0])} ${r3(b[1])}`;
    }
    return `${d}L${r3(e[0])} ${r3(e[1])}`;
  };
  const body = bent
    ? `<path class="fi-link-hit" d="${elbowPath([x1, y1], [x2, y2])}" stroke-width="${hit}" fill="none"/>`
      + `<path class="fi-link-line" d="${elbowPath(a, b)}" fill="none" stroke-linejoin="round" ${paint}/>`
    : curved
    ? `<path class="fi-link-hit" d="M${r3(x1)} ${r3(y1)}Q${r3(qx)} ${r3(qy)} ${r3(x2)} ${r3(y2)}" stroke-width="${hit}"/>`
      + `<path class="fi-link-line" d="M${r3(a[0])} ${r3(a[1])}Q${r3(qx)} ${r3(qy)} ${r3(b[0])} ${r3(b[1])}" fill="none" ${paint}/>`
    : `<line class="fi-link-hit" x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}" stroke-width="${hit}"/>`
      + `<line class="fi-link-line" x1="${r3(a[0])}" y1="${r3(a[1])}" x2="${r3(b[0])}" y2="${r3(b[1])}" ${paint}/>`;
  // 선 위의 글: 선의 한가운데에 선 색으로, 둘레에 흰 테를 둘러 선 위에서도 읽히게.
  let label = '';
  if (typeof link.label === 'string' && link.label) {
    const [lx, ly] = pointOnLine(link.pts, labelT(link)), size = linkLabelSize(link);
    // 글 뒤에 흰 알약을 깔아 선이 글 사이(띄어쓰기)로 비치지 않게 한다. 폭은 글자 수로 어림한다(한글 · 한자는 한 자, 그 밖은 0.6 자).
    const wide = Array.from(link.label).reduce((n, ch) => n + (/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 1 : 0.6), 0) * size;
    const pw = wide + size * 0.9, ph = size * 1.5;
    const style = link.labelStyle;
    const bg = style === 'none' ? '' : `<rect class="fi-link-label-bg" x="${r3(lx - pw / 2)}" y="${r3(ly - ph / 2)}" width="${r3(pw)}" height="${r3(ph)}" rx="${r3(ph / 2)}" fill="${style === 'fill' ? link.color : '#fff'}"${style === 'fill' ? '' : ' fill-opacity="0.94"'}/>`;
    // 바탕이 없으면 글자 둘레에 흰 테를 둘러 선 위에서도 읽히게 한다.
    const halo = style === 'none' ? ` stroke="#fff" stroke-width="${r3(size * 0.32)}" stroke-linejoin="round" paint-order="stroke"` : '';
    label = bg + `<text class="fi-link-label" x="${r3(lx)}" y="${r3(ly)}" font-size="${size}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${style === 'fill' ? '#fff' : link.color}"${halo}>${xmlText(link.label)}</text>`;
  }
  return `<svg viewBox="0 0 ${link.w} ${link.vh}" preserveAspectRatio="none" aria-hidden="true">${body}`
    + `${end ? head(endShape, x2, y2, ex, ey) : ''}${start ? head(startShape, x1, y1, sx, sy) : ''}${label}</svg>`;
}
