// 연결선: 두 조각을 잇는 선(화살표). 선은 어디에 놓였는지를 따로 갖지 않고, 잇는 두 조각의 자리에서 늘 다시 계산한다.
// 그래서 한쪽 조각을 옮기거나 키우면 선이 따라온다. DOM 을 모르는 순수 함수라, 저장(model) · 편집기 · 그리기 · PPTX 가 모두 같은 값을 쓴다.
//
// 요소에 적는 값: t 'link' · from · to(잇는 두 조각의 이름표) · head('end' 끝에 화살표 · 'both' 양쪽 · 'none' 없음) ·
//                 color · line(굵기, 카드 너비의 %) · dash(점선)
// 계산해서 붙이는 값: x · y · w · h(선을 감싸는 네모. 다른 요소와 같은 단위: x·w 는 카드 너비의 %, y·h 는 카드 높이의 %) ·
//                    pts([x1, y1, x2, y2]: 네모 안에서 선의 두 끝. 카드 너비의 % 단위) · vh(네모의 높이를 카드 너비의 % 로 잰 값)
// 거리는 모두 "카드 너비의 %" 한 가지로 잰다(세로는 카드 비율로 바꿔서). 그래서 가로세로가 다른 카드에서도 각도와 굵기가 그대로다.

export const LINK_HEADS = ['end', 'both', 'none'];
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
export function linkGeometry(a, b, { line = LINK_LINE.base, aspect = 1 } = {}) {
  const A = boxOfItem(a, aspect), B = boxOfItem(b, aspect);
  const dx = B.cx - A.cx, dy = B.cy - A.cy, len = Math.hypot(dx, dy);
  let p1 = [A.cx, A.cy], p2 = [B.cx, B.cy];
  if (len > 0.01) {
    const ta = exitOf(A, dx, dy), tb = exitOf(B, -dx, -dy), gap = (GAP + line) / len;
    // 테두리 밖에서 시작하고 끝난다. 두 조각이 너무 가까우면(남는 길이가 없으면) 가운데끼리 잇는다.
    if (ta + tb + 2 * gap < 0.95) {
      p1 = [A.cx + dx * (ta + gap), A.cy + dy * (ta + gap)];
      p2 = [B.cx - dx * (tb + gap), B.cy - dy * (tb + gap)];
    }
  }
  const pad = Math.max(1.5, line * 3 + 1);
  const left = Math.min(p1[0], p2[0]) - pad, top = Math.min(p1[1], p2[1]) - pad;
  const bw = Math.abs(p2[0] - p1[0]) + pad * 2, bh = Math.abs(p2[1] - p1[1]) + pad * 2;
  return {
    x: r3(left + bw / 2), y: r3((top + bh / 2) * aspect), w: r3(bw), h: r3(bh * aspect), vh: r3(bh),
    pts: [r3(p1[0] - left), r3(p1[1] - top), r3(p2[0] - left), r3(p2[1] - top)],
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
  return list.flatMap((it) => {
    if (it?.t !== 'link') return [it];
    const a = byId.get(it.from), b = byId.get(it.to);
    if (!a || !b || a === b) return [];
    return [{ ...it, rot: 0, ...linkGeometry(a, b, { line: it.line, aspect }) }];
  });
}

/** 선의 두 끝을 카드 위의 자리로(x 는 카드 너비의 %, y 는 카드 높이의 %). PPTX 와 영상이 쓴다. */
export function linkEnds(link, aspect = 1) {
  const left = link.x - link.w / 2, top = link.y / aspect - link.vh / 2;
  const [x1, y1, x2, y2] = link.pts;
  return [[left + x1, (top + y1) * aspect], [left + x2, (top + y2) * aspect]];
}

/** 다른 조각을 복제·붙여넣기했을 때: 원래 이름표 → 새 이름표 로 잇는 곳을 바꾼다(둘 다 함께 옮긴 선만). */
export function relink(copies, idMap) {
  return copies.map((it) => (it?.t === 'link' && idMap.has(it.from) && idMap.has(it.to) ? { ...it, from: idMap.get(it.from), to: idMap.get(it.to) } : it));
}

/** 연결선 하나의 SVG(네모 안의 좌표). 선 · 화살표 머리 · 누르기 쉬운 넓은 투명 선. */
export function linkSvg(link) {
  const [x1, y1, x2, y2] = link.pts, line = link.line;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const size = Math.max(1.4, line * 3.2), half = size * 0.55;
  const head = (tx, ty, sx, sy) => {
    const bx = tx - sx * size, by = ty - sy * size;
    return `<polygon class="fi-link-head" points="${r3(tx)},${r3(ty)} ${r3(bx - sy * half)},${r3(by + sx * half)} ${r3(bx + sy * half)},${r3(by - sx * half)}" fill="${link.color}"/>`;
  };
  const end = link.head !== 'none', start = link.head === 'both';
  // 머리가 있는 끝은 선을 머리의 밑변까지만 그린다(뾰족한 끝이 굵은 선에 묻히지 않게).
  const a = start ? [x1 + ux * size * 0.8, y1 + uy * size * 0.8] : [x1, y1];
  const b = end ? [x2 - ux * size * 0.8, y2 - uy * size * 0.8] : [x2, y2];
  const dash = link.dash ? ` stroke-dasharray="${r3(line * 3)} ${r3(line * 2)}"` : '';
  return `<svg viewBox="0 0 ${link.w} ${link.vh}" preserveAspectRatio="none" aria-hidden="true">`
    + `<line class="fi-link-hit" x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}" stroke-width="${r3(Math.max(3, line * 3))}"/>`
    + `<line class="fi-link-line" x1="${r3(a[0])}" y1="${r3(a[1])}" x2="${r3(b[0])}" y2="${r3(b[1])}" stroke="${link.color}" stroke-width="${r3(line)}" stroke-linecap="${link.dash ? 'butt' : 'round'}"${dash}/>`
    + `${end ? head(x2, y2, ux, uy) : ''}${start ? head(x1, y1, -ux, -uy) : ''}</svg>`;
}
