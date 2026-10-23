// 온바탕 편집기의 움직임(애니메이션): 발표할 때 요소가 나타나는 효과 · 한 장의 요소들이 어울려 움직이는 조합 효과 · 장이 넘어가는 전환 효과.
// 규칙(목록 · 키프레임 · 차례)은 DOM 을 쓰지 않는 순수 함수라 node 에서 그대로 테스트한다. 맨 아래의 재생 함수들만 브라우저에서 쓴다.
//
// 디자인에 적는 값(정했을 때만 적는다. 그래서 예전 디자인은 그대로다)
//   - 요소  an: 나타나는 효과(ENTERS 의 id). 'none' 이면 조합 효과가 있어도 가만히 있는다.
//           aw: true 면 "누를 때" 나타난다(발표하다가 한 번 누를 때마다 하나씩).
//           em: 강조 효과(EMPHASES 의 id). 이미 보이는 요소가 누를 때 한 번 움직이고 제자리로 돌아온다(키노트의 동작 강조).
//           lp: 계속 움직이기(IDLES 의 id). 다 나온 요소가 그 장에 머무는 동안 숨 쉬듯 되풀이해 움직인다(모션그래픽의 '살아 있는' 느낌).
//           ex: 사라지는 효과(EXITS 의 id). 발표하다가 누를 때 사라진다(나타나기 · 강조 다음 차례).
//           sp: 빠르기('fast' · 'slow'). 그 요소의 모든 움직임 길이에 곱한다(빠르게 0.6 · 느리게 1.6).
//           dl: 늦추기(초, 0.1~10). 장이 열릴 때 나오는 요소가 제 차례보다 이만큼 늦게 나온다.
//   - 디자인 pa: 조합 효과(COMBOS 의 id) · tr: 이 장이 넘어올 때의 전환 효과(TRANSITIONS 의 id).
//
// 움직임은 Web Animations(element.animate)로 틀고, 끝나면 흔적이 남지 않는다(요소의 스타일을 건드리지 않는다).
// 그래서 그림으로 내려받기 · 작은 그림 · 저장된 모양은 움직임과 상관없이 늘 "다 나온" 모습이다.
//
// 영상으로 만들 때는 브라우저가 틀어 주지 않으므로, 같은 규칙에서 "그 순간의 모습"을 직접 계산한다(enterPose · transitionPose).
// 키프레임(화면용)과 모습(영상용)이 같은 표(ENTER_DEFS · TRANSITION_DEFS)에서 나오므로 둘이 어긋나지 않는다.

const SOFT = 'cubic-bezier(.2, .8, .2, 1)';
const SNAP = 'cubic-bezier(.16, 1, .3, 1)';      // 확 다가와 부드럽게 서는 빠르기(모션그래픽의 '스냅')

// 효과 하나: ms(길이) · ease · frames(차례대로의 모습) · side(가리개가 가리는 쪽) · perItem(요소에 따라 길이 · 빠르기를 바꾸는 것).
// frame: x · y(카드 너비를 100 으로 본 거리만큼 옮긴 자리) · k(크기 배율) · kx · ky(가로 · 세로만 늘이는 배율. 찌그러졌다 펴지는 '탄력')
//        r(더 돌린 각도) · o(투명도 0~1. 요소의 투명도에 곱한다) · b(흐림. 카드 너비의 %) · clip(가린 정도 0~100)
//        at(0~1 사이의 때) · ease(다음 frame 까지의 빠르기)
// side: 가리개가 가리는 쪽. 'r'(기본: 오른쪽을 가려 왼쪽부터 드러난다) · 'l' · 't'(위를 가려 아래부터) · 'b'(아래를 가려 위부터) · 'x'(가운데에서 좌우로) · 'y'(가운데에서 위아래로)

// 빠르기 · 늦추기(요소마다): 모든 움직임의 길이에 곱하는 배율과, 장이 열릴 때 늦게 나오는 시간.
export const SPEEDS = Object.freeze([{ id: 'fast', name: '빠르게', f: 0.6 }, { id: '', name: '보통', f: 1 }, { id: 'slow', name: '느리게', f: 1.6 }]);
export const SPEED_IDS = ['fast', 'slow'];
export const speedOf = (item) => SPEEDS.find((s) => s.id && s.id === item?.sp)?.f || 1;
/** 늦추기의 가장 긴 값(초)과 고르는 칸의 값들. */
export const DELAY_MAX = 10;
export const DELAYS = Object.freeze([0, 0.3, 0.6, 1, 2]);
export const delayOf = (item) => (Number.isFinite(item?.dl) && item.dl > 0 ? Math.round(Math.min(DELAY_MAX, item.dl) * 1000) : 0);
// 타자 치듯: 한 글자씩 드러난다. 화면에서는 글자마다 놓인 자리(오른쪽 끝 · 그 줄의 위아래)를 재어(measureType) 그 자리까지 열고,
// 잴 수 없을 때(시험 · 그리기 전)는 어림한다(한 줄 글은 글자 너비로, 여러 줄 글은 한 줄씩).
// 칸마다 frame 을 두고 frame 사이를 계단(steps(1, end))으로 넘긴다. 가리개는 "앞의 줄은 다 · 지금 줄은 그 글자까지"인 여섯 점짜리 다각형이다.
// 길이는 글자 수로만 정한다(잰 값과 상관없이 화면 · 영상 · 시간표가 같은 길이를 쓴다).
const STEP = 'steps(1, end)';
const TYPE_MAX = 60;
const typeChars = (item) => Array.from(item?.t === 'text' ? String(item.text || '') : '').filter((ch) => !/\s/.test(ch)).length;
const typeMs = (item) => { const n = Math.min(TYPE_MAX, typeChars(item)); return n ? Math.min(2700, Math.max(300, n * 55)) : 800; };
const glyphEm = (ch) => (/\s/.test(ch) ? 0.28 : /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 0.92
  : /[.,:;'"!|ilI·()[\]]/.test(ch) ? 0.3 : /[A-Z0-9mwMW#@%&]/.test(ch) ? 0.62 : /[\x20-\x7e]/.test(ch) ? 0.5 : 1.1);
// 글자 칸의 자리 { x(그 글자의 오른쪽 끝) · top · bottom(그 줄의 위아래) } (요소 칸의 %) 를 어림한다.
function guessStops(item) {
  const raw = item?.t === 'text' ? String(item.text || '') : '';
  const lines = raw.split('\n');
  const size = Number(item?.size) || 5;
  const w = Number(item?.w) || 50;
  const room = w * 0.98;
  const widths = lines.map((l) => Array.from(l).reduce((s, ch) => s + glyphEm(ch), 0) * size);
  if (!raw.trim() || lines.length > 1 || widths[0] > room) {
    const rows = raw.trim() ? Math.min(20, widths.reduce((n, x) => n + Math.max(1, Math.ceil(x / room)), 0)) : 8;
    return Array.from({ length: rows }, (_, r) => ({ x: 125, top: (r / rows) * 100, bottom: ((r + 1) / rows) * 100 }));
  }
  const from = ((item.align === 'l' ? 0 : item.align === 'r' ? w - widths[0] : (w - widths[0]) / 2) / w) * 100;
  let cum = 0;
  const stops = [];
  for (const ch of Array.from(lines[0])) { cum += glyphEm(ch) * size; if (!/\s/.test(ch)) stops.push({ x: round(from + ((cum + size * 0.06) / w) * 100), top: -25, bottom: 125 }); }
  return stops;
}
// 너무 많으면 고르게 덜어 TYPE_MAX 칸으로.
const thinStops = (stops) => (stops.length > TYPE_MAX ? Array.from({ length: TYPE_MAX }, (_, k) => stops[Math.round(((k + 1) * stops.length) / TYPE_MAX) - 1]) : stops);
function typeOf(item, measured) {
  const stops = thinStops(Array.isArray(measured) && measured.length ? measured : guessStops(item));
  const n = stops.length;
  return { ms: typeMs(item), stops, frames: [{ at: 0, tk: 0, ease: STEP }, ...stops.slice(0, -1).map((_, k) => ({ at: (k + 1) / n, tk: k + 1, ease: STEP })), { tk: n }] };
}
/** 타자 치듯의 가리개(다각형)의 여섯 점 [[x, y], …](요소 칸의 %). k: 드러난 글자 수(0 이면 아무것도, stops.length 면 다). */
export function typePoints(stops, k) {
  const n = stops?.length || 0;
  if (k >= n) return [[-25, -25], [125, -25], [125, 125], [125, 125], [125, 125], [-25, 125]];
  if (k <= 0) return Array.from({ length: 6 }, () => [-25, -25]);
  const s = stops[k - 1];
  return [[-25, -25], [125, -25], [125, s.top], [s.x, s.top], [s.x, s.bottom], [-25, s.bottom]];
}
const polygonOf = (stops, k) => `polygon(${typePoints(stops, k).map(([x, y]) => `${round(x)}% ${round(y)}%`).join(', ')})`;
/**
 * 글 요소(node)의 글자마다 놓인 자리를 잰다(타자 치듯). 돌려주는 것: [{ x, top, bottom }](요소 칸의 %. 빈칸은 빼고 읽는 차례) 또는 잴 수 없으면 null.
 * 요소의 기울기 · 뒤집기를 걷은 복사본을 같은 자리에 잠깐 놓고 잰다(가리개는 요소의 제 방향에서 놓이고, 틀고 있는 움직임이 있어도 잰 값이 같게).
 * 카드가 통째로 줄어 있어도 비율이라 같다.
 */
export function measureType(node) {
  if (!node?.ownerDocument?.createRange || !node.isConnected || !node.parentNode) return null;
  const copy = node.cloneNode(true);
  copy.removeAttribute('id');
  copy.setAttribute('aria-hidden', 'true');
  Object.assign(copy.style, { transform: 'translate(-50%, -50%)', visibility: 'hidden', pointerEvents: 'none', animation: 'none', transition: 'none' });
  node.after(copy);
  try {
    const box = copy.getBoundingClientRect();
    if (!(box.width > 0) || !(box.height > 0)) return null;
    const range = copy.ownerDocument.createRange();
    const walk = copy.ownerDocument.createTreeWalker(copy, 4);
    const stops = [];
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      let at = 0;
      for (const ch of Array.from(t.data)) {
        const len = ch.length;
        if (!/\s/.test(ch)) {
          range.setStart(t, at);
          range.setEnd(t, at + len);
          const r = [...range.getClientRects()].pop();
          if (r && r.width >= 0) stops.push({ x: round(((r.right - box.left) / box.width) * 100), top: round(((r.top - box.top) / box.height) * 100), bottom: round(((r.bottom - box.top) / box.height) * 100) });
        }
        at += len;
      }
    }
    return stops.length ? stops : null;
  } finally {
    copy.remove();
  }
}
// 효과의 표에 요소의 빠르기 · 글자 수(와 잰 글자 자리)를 입힌 것(화면 · 영상 · 시간표가 모두 이것을 쓴다).
function defFor(def, item, measured) {
  if (!def) return null;
  const own = def.perItem ? { ...def, ...def.perItem(item, measured) } : def;
  const f = speedOf(item);
  return f === 1 ? own : { ...own, ms: Math.round(own.ms * f) };
}
const ENTER_DEFS = {
  fade: { name: '나타나기', ms: 500, ease: 'ease-out', frames: [{ o: 0 }, {}] },
  rise: { name: '떠오르기', ms: 600, frames: [{ o: 0, y: 7 }, {}] },
  drop: { name: '내려오기', ms: 600, frames: [{ o: 0, y: -7 }, {}] },
  left: { name: '왼쪽에서', ms: 650, frames: [{ o: 0, x: -12 }, {}] },
  right: { name: '오른쪽에서', ms: 650, frames: [{ o: 0, x: 12 }, {}] },
  zoom: { name: '커지며', ms: 550, frames: [{ o: 0, k: 0.55 }, {}] },
  pop: { name: '튀어나오기', ms: 560, ease: 'ease-out', frames: [{ o: 0, k: 0.3 }, { at: 0.55, k: 1.12, o: 1 }, { at: 0.78, k: 0.96 }, {}] },
  wipe: { name: '닦아내기', ms: 650, ease: 'ease-in-out', frames: [{ clip: 100 }, { clip: 0 }] },
  spin: { name: '돌며', ms: 700, frames: [{ o: 0, k: 0.4, r: -200 }, {}] },
  bounce: {
    name: '통통', ms: 900, ease: 'linear',
    frames: [{ o: 0, y: -16, ease: 'ease-in' }, { at: 0.38, y: 0, o: 1, ease: 'ease-out' }, { at: 0.58, y: -5, ease: 'ease-in' }, { at: 0.76, y: 0, ease: 'ease-out' }, { at: 0.88, y: -1.6, ease: 'ease-in' }, {}],
  },
  tumble: { name: '굴러오기', ms: 750, frames: [{ o: 0, x: -8, y: -10, r: -50 }, {}] },
  stomp: { name: '쿵 찍기', ms: 520, ease: 'linear', frames: [{ o: 0, k: 1.8, ease: 'ease-in' }, { at: 0.55, k: 1, o: 1, ease: 'ease-out' }, { at: 0.75, k: 0.94, ease: 'ease-in-out' }, {}] },
  drift: { name: '둥실', ms: 1100, ease: 'ease-out', frames: [{ o: 0, x: -5 }, { at: 0.5, o: 1 }, {}] },
  flicker: { name: '깜빡이며', ms: 800, ease: 'linear', frames: [{ o: 0 }, { at: 0.12, o: 1 }, { at: 0.24, o: 0.15 }, { at: 0.4, o: 1 }, { at: 0.54, o: 0.3 }, { at: 0.7, o: 1 }, { at: 0.82, o: 0.6 }, {}] },
  // 모션그래픽처럼: 멀리서 휙 날아와 살짝 지나쳤다가 제자리에 선다(튀는 빠르기가 한 번에 느껴지도록 거리와 각도를 함께 준다).
  swoop: { name: '휙 날아오기', ms: 700, ease: 'linear', frames: [{ o: 0, x: -22, y: 4, r: -10, k: 0.85, ease: 'cubic-bezier(.2, .7, .3, 1)' }, { at: 0.72, x: 1.2, y: -0.3, r: 0.8, k: 1.03, o: 1, ease: 'ease-in-out' }, {}] },
  // ---- 모션그래픽 ----
  // 솟아오르기: 보이지 않는 줄 아래에서 글이 솟는다(아래를 가린 채 올라오며 위부터 드러난다). 키네틱 타이포의 기본.
  mask: { name: '줄 아래서 솟기', ms: 720, ease: SNAP, side: 'b', frames: [{ clip: 100, y: 3.5 }, {}] },
  // 흐릿하게 다가오기: 초점이 맞듯 또렷해진다.
  blur: { name: '초점 맞추기', ms: 800, ease: SOFT, frames: [{ o: 0, b: 1.2, k: 1.08 }, {}] },
  // 멀리서 다가오기: 크고 흐린 데서 제자리로 내려앉는다(바탕 · 큰 사진).
  blurzoom: { name: '크게서 내려앉기', ms: 1100, ease: SNAP, frames: [{ o: 0, k: 1.6, b: 1.4 }, { at: 0.35, o: 1 }, {}] },
  // 쭉 늘어나기: 가로로 납작했다가 세로로 늘어나며 튀어나와 출렁 선다(찌그러졌다 펴지기).
  stretch: { name: '쭉 늘어나기', ms: 720, ease: 'linear', frames: [{ o: 0, kx: 0.2, ky: 1.5, ease: 'ease-out' }, { at: 0.45, o: 1, kx: 1.14, ky: 0.88, ease: 'ease-in-out' }, { at: 0.72, kx: 0.96, ky: 1.04, ease: 'ease-in-out' }, {}] },
  // 쾅 내려앉기: 위에서 떨어져 바닥에 닿는 순간 납작해졌다가 선다.
  slam: { name: '쾅 내려앉기', ms: 760, ease: 'linear', frames: [{ o: 0, y: -14, kx: 0.85, ky: 1.25, ease: 'ease-in' }, { at: 0.45, y: 0, o: 1, kx: 1.25, ky: 0.78, ease: 'ease-out' }, { at: 0.68, kx: 0.95, ky: 1.06, ease: 'ease-in-out' }, {}] },
  // 뒤집히며: 카드를 뒤집듯 가로가 0 에서 펼쳐진다.
  flip: { name: '뒤집히며', ms: 700, ease: 'linear', frames: [{ o: 0, kx: 0, ease: 'ease-out' }, { at: 0.6, o: 1, kx: 1.1, ease: 'ease-in-out' }, {}] },
  // 펼치기: 세로로 접혀 있다가 펼쳐진다.
  unfold: { name: '펼치기', ms: 650, ease: SNAP, frames: [{ o: 0, ky: 0 }, { at: 0.4, o: 1 }, {}] },
  // 휙 스치며: 흐릿하게 빠르게 지나와 살짝 넘었다가 선다(움직임 흐림).
  whip: { name: '휙 스치며', ms: 650, ease: 'linear', frames: [{ o: 0, x: -30, b: 0.8, kx: 1.4, ease: 'cubic-bezier(.2, .9, .3, 1)' }, { at: 0.6, o: 1, x: 1, b: 0, kx: 0.97, ease: 'ease-in-out' }, {}] },
  // 고무줄: 0 에서 튀어 커졌다 작아졌다 하며 선다.
  elastic: { name: '고무줄', ms: 1000, ease: 'linear', frames: [{ o: 0, k: 0, ease: 'ease-out' }, { at: 0.3, o: 1, k: 1.22, ease: 'ease-in-out' }, { at: 0.5, k: 0.88, ease: 'ease-in-out' }, { at: 0.68, k: 1.06, ease: 'ease-in-out' }, { at: 0.84, k: 0.98 }, {}] },
  // 흩어졌다 모이기: 멀리 흩어진 데서 돌며 모여든다(조합 효과가 방향을 엇갈려 준다).
  scatter: { name: '흩어졌다 모이기', ms: 1100, ease: SNAP, frames: [{ o: 0, x: -26, y: -16, r: -70, k: 0.6, b: 0.6 }, { at: 0.3, o: 1 }, {}] },
  scatterup: { name: '아래서 모이기', ms: 1100, ease: SNAP, frames: [{ o: 0, x: -20, y: 18, r: 55, k: 0.5, b: 0.6 }, { at: 0.3, o: 1 }, {}] },
  // 방향을 고른 닦아내기 · 가운데서 열기
  wipeup: { name: '아래에서 닦기', ms: 650, ease: 'ease-in-out', side: 't', frames: [{ clip: 100 }, { clip: 0 }] },
  wipedown: { name: '위에서 닦기', ms: 650, ease: 'ease-in-out', side: 'b', frames: [{ clip: 100 }, { clip: 0 }] },
  split: { name: '가운데서 열기', ms: 650, ease: SNAP, side: 'x', frames: [{ clip: 100 }, { clip: 0 }] },
  // 타자 치듯: 글자 수만큼 한 칸씩(글이 아니면 여덟 칸).
  type: { name: '타자 치듯', ms: 800, ease: 'linear', perItem: typeOf, frames: [{ tk: 0 }, { tk: 1 }] },
  // 지지직: 화면이 튀듯 흔들리며 켜진다(디지털 느낌).
  glitch: { name: '지지직', ms: 700, ease: 'linear', frames: [{ o: 0 }, { at: 0.1, o: 1, x: -1.5, kx: 1.08 }, { at: 0.2, x: 1.2, o: 0.4 }, { at: 0.3, x: -0.6, o: 1, kx: 0.96 }, { at: 0.45, x: 0.8, kx: 1.06 }, { at: 0.6, x: 0, kx: 1 }, {}] },
};
// 사라지는 효과: 누를 때 그 요소가 사라진다. 처음이 제 모습이고 끝이 사라진 모습이다(frames 의 꼴은 ENTER_DEFS 와 같다).
const EXIT_DEFS = {
  fade: { name: '사라지기', ms: 450, ease: 'ease-in', frames: [{}, { o: 0 }] },
  sink: { name: '아래로', ms: 550, ease: 'cubic-bezier(.5, 0, .75, 0)', frames: [{}, { o: 0, y: 7 }] },
  up: { name: '위로', ms: 550, ease: 'cubic-bezier(.5, 0, .75, 0)', frames: [{}, { o: 0, y: -7 }] },
  shrink: { name: '작아지며', ms: 500, ease: 'ease-in', frames: [{}, { o: 0, k: 0.3 }] },
  away: { name: '휙 날아가기', ms: 600, ease: 'cubic-bezier(.6, 0, .8, .2)', frames: [{}, { o: 0, x: 26, r: 12, k: 0.85, b: 0.6 }] },
  wipe: { name: '닦아 지우기', ms: 600, ease: 'ease-in-out', side: 'l', frames: [{ clip: 0 }, { clip: 100 }] },
  blur: { name: '흐려지며', ms: 650, ease: 'ease-in', frames: [{}, { o: 0, b: 1.2, k: 1.06 }] },
  pop: { name: '톡 터지기', ms: 450, ease: 'linear', frames: [{ ease: 'ease-out' }, { at: 0.35, k: 1.15, ease: 'ease-in' }, { o: 0, k: 0 }] },
  drop: { name: '떨어지기', ms: 700, ease: 'cubic-bezier(.55, 0, 1, .45)', frames: [{}, { o: 0, y: 30, r: 18 }] },
};
/** 사라지는 효과들 [{ id, name }]. */
export const EXITS = Object.entries(EXIT_DEFS).map(([id, d]) => ({ id, name: d.name }));
export const EXIT_IDS = EXITS.map((e) => e.id);
// 계속 움직이기: 다 나온 요소가 장에 머무는 동안 되풀이해 움직인다(모션그래픽의 '살아 있는' 느낌). 처음과 끝이 제 모습이라 이어 틀어도 끊기지 않는다.
// 요소마다 시작하는 때를 조금씩 다르게 두어(idlePhase) 함께 박자를 맞추지 않게 한다. 세기는 작게: 글을 읽는 데 거슬리지 않을 만큼.
const IDLE_DEFS = {
  float: { name: '둥실둥실', ms: 3400, ease: 'ease-in-out', frames: [{}, { at: 0.5, y: -1.4 }, {}] },
  breathe: { name: '숨쉬기', ms: 3000, ease: 'ease-in-out', frames: [{}, { at: 0.5, k: 1.045 }, {}] },
  sway: { name: '살랑살랑', ms: 3200, ease: 'ease-in-out', frames: [{}, { at: 0.25, r: -2.5 }, { at: 0.75, r: 2.5 }, {}] },
  bob: { name: '콩콩', ms: 1300, ease: 'linear', frames: [{ ease: 'ease-out' }, { at: 0.3, y: -1.6, ease: 'ease-in' }, { at: 0.6, y: 0, ease: 'ease-out' }, { at: 0.75, y: -0.5, ease: 'ease-in' }, { at: 0.9, y: 0 }, {}] },
  beat: { name: '두근두근', ms: 1800, ease: 'linear', frames: [{ ease: 'ease-out' }, { at: 0.15, k: 1.08, ease: 'ease-in' }, { at: 0.3, k: 1, ease: 'ease-out' }, { at: 0.45, k: 1.08, ease: 'ease-in' }, { at: 0.6, k: 1 }, {}] },
  spin: { name: '빙글빙글', ms: 6000, ease: 'linear', frames: [{}, { r: 360 }] },
  blink: { name: '반짝반짝', ms: 2400, ease: 'ease-in-out', frames: [{}, { at: 0.5, o: 0.45 }, {}] },
  drift: { name: '떠다니기', ms: 5200, ease: 'ease-in-out', frames: [{}, { at: 0.25, x: 1.6, y: -1 }, { at: 0.5, x: 0, y: -1.8 }, { at: 0.75, x: -1.6, y: -1 }, {}] },
  // 천천히 다가가기: 사진 · 바탕이 아주 천천히 커졌다 돌아온다(다큐멘터리의 켄 번스).
  zoomin: { name: '천천히 다가가기', ms: 12000, ease: 'ease-in-out', frames: [{}, { at: 0.5, k: 1.07 }, {}] },
  wave: { name: '물결', ms: 4000, ease: 'ease-in-out', frames: [{}, { at: 0.25, y: -1, r: -2 }, { at: 0.75, y: 1, r: 2 }, {}] },
  jelly: { name: '말랑말랑', ms: 2200, ease: 'ease-in-out', frames: [{}, { at: 0.25, kx: 1.05, ky: 0.95 }, { at: 0.5 }, { at: 0.75, kx: 0.96, ky: 1.04 }, {}] },
  pendulum: { name: '시계추', ms: 2600, ease: 'ease-in-out', frames: [{}, { at: 0.25, r: -8 }, { at: 0.75, r: 8 }, {}] },
};
/** 계속 움직이기 효과들 [{ id, name }]. */
export const IDLES = Object.entries(IDLE_DEFS).map(([id, d]) => ({ id, name: d.name }));
export const IDLE_IDS = IDLES.map((e) => e.id);
// 강조 효과: 나타난 뒤에 누르면 한 번 움직이고 제 모습으로 돌아온다. 처음과 끝이 늘 제 모습이다(frames 의 꼴은 ENTER_DEFS 와 같다).
const EMPH_DEFS = {
  pulse: { name: '두근두근', ms: 760, ease: 'ease-in-out', frames: [{}, { at: 0.25, k: 1.12 }, { at: 0.5, k: 1 }, { at: 0.75, k: 1.12 }, {}] },
  shake: { name: '흔들기', ms: 620, ease: 'linear', frames: [{}, { at: 0.14, x: -2 }, { at: 0.3, x: 2 }, { at: 0.46, x: -2 }, { at: 0.62, x: 2 }, { at: 0.8, x: -1 }, {}] },
  grow: { name: '커졌다 돌아오기', ms: 820, ease: 'ease-in-out', frames: [{}, { at: 0.45, k: 1.3 }, {}] },
  spin: { name: '한 바퀴', ms: 900, ease: 'ease-in-out', frames: [{}, { r: 360 }] },
  flash: { name: '반짝반짝', ms: 900, ease: 'linear', frames: [{}, { at: 0.2, o: 0.15 }, { at: 0.4, o: 1 }, { at: 0.6, o: 0.15 }, { at: 0.8, o: 1 }, {}] },
  jump: { name: '폴짝', ms: 680, ease: 'linear', frames: [{ ease: 'ease-out' }, { at: 0.35, y: -6, ease: 'ease-in' }, { at: 0.6, y: 0, ease: 'ease-out' }, { at: 0.78, y: -1.8, ease: 'ease-in' }, {}] },
  squash: { name: '찌그러졌다 펴기', ms: 700, ease: 'ease-in-out', frames: [{}, { at: 0.3, kx: 1.25, ky: 0.8 }, { at: 0.55, kx: 0.9, ky: 1.12 }, { at: 0.8, kx: 1.04, ky: 0.97 }, {}] },
  tada: { name: '짜잔', ms: 900, ease: 'linear', frames: [{}, { at: 0.1, k: 0.92, r: -3 }, { at: 0.3, k: 1.12, r: 3 }, { at: 0.45, r: -3 }, { at: 0.6, r: 3 }, { at: 0.75, r: -2 }, { at: 0.9, k: 1.04, r: 0 }, {}] },
  focus: { name: '초점 흔들기', ms: 800, ease: 'ease-in-out', frames: [{}, { at: 0.4, b: 0.5, k: 1.06 }, {}] },
};
/** 강조 효과들 [{ id, name }]. */
export const EMPHASES = Object.entries(EMPH_DEFS).map(([id, d]) => ({ id, name: d.name }));
export const EMPHASIS_IDS = EMPHASES.map((e) => e.id);
/** 요소가 나타나는 효과들 [{ id, name }] (고르는 칸에 이 차례로 나온다). */
export const ENTERS = Object.entries(ENTER_DEFS).map(([id, d]) => ({ id, name: d.name }));
export const ENTER_IDS = ENTERS.map((e) => e.id);
/** 요소에 적는 값: 효과의 id, 또는 'none'(조합 효과가 있어도 가만히). */
export const STILL = 'none';

// 조합 효과: 요소의 구실(바탕 · 글 · 그림)에 따라 다른 효과를 주고, 정한 차례대로 조금씩 늦춰 튼다.
//   pick(role, item, { lead }): 그 요소의 효과(lead: 그 장에서 가장 큰 글인지) · gap: 요소 사이의 간격(ms) · swing: 참이면 하나 걸러 하나씩 반대쪽에서 온다
//   order: 나오는 차례. 없으면 읽는 차례, 'center' 가운데에서 바깥으로, 'x' 왼쪽에서 오른쪽으로, 'shuffle' 뒤섞어(늘 같은 차례로)
//   chain: 참이면 앞의 것이 거의 다 나온 뒤에 다음 것이 나온다(타자기처럼 한 줄씩) · idle · backIdle: 머무는 동안의 되풀이(작은 조각 · 바탕 사진)
const BACK = 'back';
const quiet = (enter) => (role) => (role === BACK ? 'fade' : enter);
const COMBO_DEFS = {
  mix: { name: '어울림', hint: '글은 떠오르고 그림은 튀어나와요', gap: 100, pick: (role, it) => (role === BACK ? 'fade' : it.t === 'text' ? 'rise' : it.t === 'image' ? 'zoom' : 'pop') },
  fade: { name: '차례로 나타나기', hint: '하나씩 조용히 나타나요', gap: 90, pick: () => 'fade' },
  rise: { name: '차례로 떠오르기', hint: '아래에서 가볍게 올라와요', gap: 90, pick: quiet('rise') },
  pan: { name: '옆에서 들어오기', hint: '왼쪽에서 미끄러져 와요', gap: 80, pick: quiet('left') },
  pop: { name: '팡팡 튀어나오기', hint: '통 하고 튀어나와요', gap: 110, pick: quiet('pop') },
  wipe: { name: '쓱 닦아내기', hint: '닦아 내듯 드러나요', gap: 110, pick: quiet('wipe') },
  tumble: { name: '굴러오기', hint: '그림이 굴러 들어와요', gap: 90, pick: (role, it) => (role === BACK ? 'fade' : it.t === 'text' ? 'rise' : 'tumble') },
  stomp: { name: '쿵쿵 찍기', hint: '도장처럼 쿵 찍혀요', gap: 150, pick: quiet('stomp') },
  drift: { name: '둥실 떠오기', hint: '양쪽에서 천천히 와요', gap: 120, swing: true, pick: quiet('drift') },
  neon: { name: '깜빡깜빡', hint: '글이 전등처럼 켜져요', gap: 100, pick: (role, it) => (it.t === 'text' ? 'flicker' : 'fade') },
  // 모션그래픽: 바탕은 조용히, 글은 휙 날아와 서고, 그림·스티커는 통 튀어나온다. 간격을 바짝 붙여 한 번에 짜 맞춰지는 느낌을 낸다.
  // 머무는 동안에도 살아 있게: 계속 움직이기를 정하지 않은 작은 그림·스티커·도형에 잔잔한 되풀이를 차례로 붙인다(idle).
  motion: { name: '모션그래픽', hint: '휙 날아와 짜 맞춰지고, 머무는 동안 살랑살랑 움직여요', gap: 70, idle: ['float', 'breathe', 'sway', 'drift'], pick: (role, it) => (role === BACK ? 'fade' : it.t === 'text' ? 'swoop' : 'pop') },
  // ---- 안무(모션그래픽 짜임) ----
  kinetic: { name: '키네틱 타이포', hint: '제목은 쾅 내려앉고, 글은 줄 아래서 솟아요', gap: 90, idle: ['breathe', 'float'], pick: (role, it, { lead }) => (role === BACK ? 'blurzoom' : it.t === 'text' ? (lead ? 'slam' : 'mask') : 'elastic') },
  assemble: { name: '흩어졌다 모이기', hint: '사방에 흩어진 조각이 돌며 모여요', gap: 55, swing: true, order: 'shuffle', pick: (role, it) => (role === BACK ? 'fade' : it.t === 'link' ? 'wipe' : 'scatter') },
  ripple: { name: '가운데서 퍼지기', hint: '가운데에서 바깥으로 물결처럼 퍼져요', gap: 80, order: 'center', pick: (role, it) => (role === BACK ? 'blurzoom' : it.t === 'text' ? 'blur' : 'pop') },
  cascade: { name: '왼쪽부터 촤르르', hint: '왼쪽에서 오른쪽으로 촤르르 펼쳐져요', gap: 60, order: 'x', pick: (role, it) => (role === BACK ? 'fade' : it.t === 'text' ? 'wipeup' : 'unfold') },
  cinema: { name: '영화처럼', hint: '흐릿하게 다가와 초점이 맞고, 바탕 사진이 천천히 다가가요', gap: 260, backIdle: 'zoomin', pick: (role, it) => (role === BACK ? 'blurzoom' : it.t === 'text' ? 'blur' : 'fade') },
  spring: { name: '탱탱', hint: '고무줄처럼 늘어났다 출렁 서고, 말랑말랑 움직여요', gap: 110, idle: ['jelly', 'breathe'], pick: (role, it) => (role === BACK ? 'fade' : it.t === 'text' ? 'stretch' : 'elastic') },
  typing: { name: '타자기', hint: '글이 한 줄씩 타자 치듯 써져요', gap: 0, chain: true, pick: (role, it) => (it.t === 'text' ? 'type' : 'fade') },
  glitch: { name: '디지털', hint: '화면이 지지직 튀듯 켜져요', gap: 90, order: 'shuffle', pick: (role, it) => (role === BACK ? 'fade' : it.t === 'text' ? 'glitch' : 'split') },
  slam: { name: '쾅쾅', hint: '위에서 떨어져 쾅 내려앉아요', gap: 140, pick: (role, it) => (role === BACK ? 'fade' : it.t === 'link' ? 'wipe' : 'slam') },
};
// 조합 효과가 저절로 계속 움직이게 하는 조각: 글 · 바탕 · 영상은 읽고 보기 편하게 가만히 두고, 연결선이 붙은 조각은 선이 떨어져 보이지 않게 가만히 둔다.
const AUTO_IDLE_TYPES = ['shape', 'emoji', 'art', 'image'];
const AUTO_IDLE_MAX = 8;
/** 조합 효과들 [{ id, name, hint }]. */
export const COMBOS = Object.entries(COMBO_DEFS).map(([id, d]) => ({ id, name: d.name, hint: d.hint, loops: !!d.idle }));
export const COMBO_IDS = COMBOS.map((c) => c.id);

// 전환 효과: ms(길이) · ease(전체의 빠르기) · next(d) · old(d): 들어오는 장 · 나가는 장의 모습들(d 는 방향. 다음 장으로 1, 앞 장으로 -1).
// old 가 없으면 나가는 장은 가만히 있는다. 들어오는 장이 늘 위에 그려진다.
// 장의 모습(frame): x(옆으로 옮긴 거리. 카드 너비의 %) · y(위아래로 옮긴 거리. 카드 높이의 %) · k(크기 배율) · o(투명도) · turn(세로축으로 돌린 각도)
//                  b(흐림. 카드 너비의 %. 빠르게 지나가는 느낌)
//                  inset([위, 오른쪽, 아래, 왼쪽] 에서 가린 %) · circle(가운데에서 연 동그라미의 반지름 %) · at(0~1 사이의 때) · ease(다음 frame 까지의 빠르기)
const TURN_EASE = 'cubic-bezier(.4, 0, .2, 1)';
const TRANSITION_DEFS = {
  fade: { name: '서서히', ms: 450, ease: 'ease', next: () => [{ o: 0 }, { o: 1 }] },
  slide: { name: '밀어내기', ms: 560, next: (d) => [{ x: 100 * d }, { x: 0 }], old: (d) => [{ x: 0 }, { x: -100 * d }] },
  cover: { name: '덮기', ms: 560, next: (d) => [{ x: 100 * d }, { x: 0 }], old: () => [{ k: 1, o: 1 }, { k: 0.94, o: 0.5 }] },
  zoom: { name: '확대', ms: 560, next: () => [{ k: 0.7, o: 0 }, { k: 1, o: 1 }], old: () => [{ k: 1, o: 1 }, { k: 1.2, o: 0 }] },
  wipe: { name: '닦아내기', ms: 620, next: (d) => [{ inset: d > 0 ? [0, 100, 0, 0] : [0, 0, 0, 100] }, { inset: [0, 0, 0, 0] }] },
  circle: { name: '동그랗게', ms: 680, next: () => [{ circle: 0 }, { circle: 75 }] },
  // 뒤집기: 나가는 장이 옆으로 돌아 사라진 뒤에, 들어오는 장이 돌아 나온다
  flip: {
    name: '뒤집기', ms: 720, ease: 'linear',
    next: (d) => [{ turn: 90 * d, o: 0 }, { at: 0.5, turn: 90 * d, o: 1, ease: 'ease-out' }, { turn: 0, o: 1 }],
    old: (d) => [{ turn: 0, o: 1, ease: 'ease-in' }, { at: 0.5, turn: -90 * d, o: 1 }, { at: 0.5, turn: -90 * d, o: 0 }, { turn: -90 * d, o: 0 }],
  },
  // 이어 움직이기(키노트의 매직 무브): 앞 장과 이 장에 같은 요소가 있으면 그 요소가 제자리로 옮겨 가고(자리·크기·각도·색),
  // 나머지는 서서히 바뀐다. 짝은 matchItems 가 정한다. 두 장을 다 아는 곳(발표 화면)에서만 옮겨 가고,
  // 한 장만 아는 곳(미리 보기 · 영상 만들기)에서는 아래 frames 대로 서서히 바뀐다.
  move: { name: '이어 움직이기', ms: 1000, ease: 'cubic-bezier(.65, 0, .35, 1)', morph: true, next: () => [{ o: 0 }, { o: 1 }], old: () => [{ o: 1 }, { o: 0 }] },
  // ---- 모션그래픽 전환 ----
  // 휙 넘기기: 두 장이 흐릿하게 빠르게 스쳐 지나간다(움직임 흐림).
  whip: { name: '휙 넘기기', ms: 560, ease: 'cubic-bezier(.75, 0, .2, 1)', next: (d) => [{ x: 100 * d, b: 2.5 }, { x: 0, b: 0 }], old: (d) => [{ x: 0, b: 0 }, { x: -100 * d, b: 2.5 }] },
  // 줌 블러: 앞 장이 확 다가오며 흐려지고, 다음 장이 흐릿한 데서 또렷해진다.
  zoomblur: { name: '줌 블러', ms: 700, ease: 'cubic-bezier(.6, 0, .2, 1)', next: () => [{ k: 1.35, b: 3, o: 0 }, { k: 1, b: 0, o: 1 }], old: () => [{ k: 1, b: 0, o: 1 }, { k: 1.6, b: 3, o: 0 }] },
  pushup: { name: '위로 밀기', ms: 600, next: (d) => [{ y: 100 * d }, { y: 0 }], old: (d) => [{ y: 0 }, { y: -100 * d }] },
  coverdown: { name: '위에서 덮기', ms: 600, next: (d) => [{ y: -100 * d }, { y: 0 }], old: () => [{ k: 1, o: 1 }, { k: 0.94, o: 0.5 }] },
  split: { name: '가운데서 열기', ms: 650, next: () => [{ inset: [0, 50, 0, 50] }, { inset: [0, 0, 0, 0] }] },
  // 블라인드: 위에서 아래로 쓸어내리며 열린다(조금 흐릿하게 내려앉는다).
  reveal: { name: '쓸어내리기', ms: 700, next: (d) => [{ inset: d > 0 ? [0, 0, 100, 0] : [100, 0, 0, 0], k: 1.06 }, { inset: [0, 0, 0, 0], k: 1 }] },
};
/** 뒤집기 효과의 원근(화면에서의 px). 화면용 키프레임과 영상이 같은 값을 쓴다. */
export const TURN_DEPTH = 1600;
/** 장이 넘어가는 전환 효과들 [{ id, name }]. */
export const TRANSITIONS = Object.entries(TRANSITION_DEFS).map(([id, d]) => ({ id, name: d.name }));
export const TRANSITION_IDS = TRANSITIONS.map((t) => t.id);

const round = (v) => Math.round(v * 1000) / 1000;

/**
 * 요소의 모습(transform). 가운데 점에 맞추고 → 돌리고 → 뒤집는 차례는 render.js 의 placeItem 과 같다.
 * 움직이는 동안의 모습은 x · y(옮긴 거리. 카드 너비를 100 으로 본 값) · k(배율) · r(더 돌린 각도)로 정한다.
 * 키프레임끼리 부드럽게 이어지도록 늘 같은 꼴(옮기기 · 돌리기 · 크기)로 적는다.
 */
export function motionTransform(item, { x = 0, y = 0, k = 1, r = 0, kx = 1, ky = 1 } = {}) {
  // kx · ky(가로 · 세로만 늘이기)는 요소의 제 방향을 따른다(돌린 요소는 돌린 쪽으로 늘어난다. 영상도 같다).
  const sx = (item?.fx ? -1 : 1) * k * kx;
  const sy = (item?.fy ? -1 : 1) * k * ky;
  return `translate(calc(-50% + ${round(x)}cqw), calc(-50% + ${round(y)}cqw)) rotate(${round((Number(item?.rot) || 0) + r)}deg) scale(${round(sx)}, ${round(sy)})`;
}

// 가리개: side 쪽에서 clip% 만큼 가린다(기본은 오른쪽. 왼쪽부터 드러난다). 테두리처럼 요소 칸 밖으로 조금 나온 것도 보이게 칸보다 넉넉히 잡는다.
// 가리개는 요소의 제 방향을 따라가므로, 좌우(위아래)로 뒤집은 요소는 반대쪽을 가려야 화면에서 같은 쪽부터 드러난다.
// 'x' · 'y' 는 가운데에서 양쪽으로 열린다(양쪽을 반씩 가린다).
const SIDES = { r: 1, l: 3, t: 0, b: 2 };
const OPPOSITE = { r: 'l', l: 'r', t: 'b', b: 't' };
/** 가리개의 네 쪽 [위, 오른쪽, 아래, 왼쪽](요소 칸의 %. 음수는 칸 밖으로 넉넉히). clip: 가린 정도 0~100 · side: 가리는 쪽 · flipped · flippedY: 요소를 뒤집었는지. */
export function clipInsets(clip, flipped, side = 'r', flippedY = false) {
  const out = [-25, -25, -25, -25];
  if (side === 'x' || side === 'y') {
    const half = round(clip * 0.75 - 25);
    if (side === 'x') { out[1] = half; out[3] = half; } else { out[0] = half; out[2] = half; }
    return out;
  }
  let s = SIDES[side] != null ? side : 'r';
  if ((flipped && (s === 'r' || s === 'l')) || (flippedY && (s === 't' || s === 'b'))) s = OPPOSITE[s];
  out[SIDES[s]] = round(clip * 1.5 - 25);
  return out;
}
const clipOf = (clip, item, side) => `inset(${clipInsets(clip, !!item?.fx, side, !!item?.fy).map((v) => `${v}%`).join(' ')})`;
// 흐림: 카드 너비의 b% 만큼(화면은 cqw, 영상은 그 너비의 px 로 바꿔 그린다).
const blurOf = (b) => `blur(${round(Math.max(0, b))}cqw)`;

/**
 * 그 요소가 그 효과로 나타날 때의 키프레임. 모르는 효과면 null.
 *   scale: 거리의 배율(고르는 칸의 작은 본보기는 칸이 작아서 크게 준다) · mirror: 좌우를 뒤집어(오른쪽에서) 온다
 * 돌려주는 것: { keyframes, ms, easing }
 */
export function enterKeyframes(item, id, opts = {}) {
  return keyframesOf(defFor(ENTER_DEFS[id], item, opts.stops), item, opts);
}
/** 강조 효과의 키프레임(enterKeyframes 와 같은 꼴). 모르는 효과면 null. */
export function emphasisKeyframes(item, id, opts = {}) {
  return keyframesOf(defFor(EMPH_DEFS[id], item), item, opts);
}
/** 사라지는 효과의 키프레임(enterKeyframes 와 같은 꼴. 끝 모습이 사라진 모습이다). 모르는 효과면 null. */
export function exitKeyframes(item, id, opts = {}) {
  return keyframesOf(defFor(EXIT_DEFS[id], item), item, opts);
}
/** 계속 움직이기 한 바퀴의 키프레임(enterKeyframes 와 같은 꼴. 되풀이해 튼다). 모르는 효과면 null. */
export function idleKeyframes(item, id, opts = {}) {
  return keyframesOf(defFor(IDLE_DEFS[id], item), item, opts);
}
/** 계속 움직이기 한 바퀴의 길이(ms). item 을 주면 그 요소의 빠르기를 입힌다. 모르는 효과면 0. */
export function idleTime(id, item) {
  return defFor(IDLE_DEFS[id], item)?.ms || 0;
}
/**
 * 요소 번호 i 의 요소가 계속 움직이기를 시작할 때 한 바퀴의 어디에서 시작할지(ms). 요소마다 다르게 흩어 놓아 모두 같은 박자로 움직이지 않게 한다.
 * 화면(playDesign)과 영상(film.js)이 같은 값을 쓴다. 나타난 직후에 바로 이어 트는 것은 0 에서 시작한다(제 모습에서 끊김 없이).
 */
export function idlePhase(i, id, item) {
  const ms = idleTime(id, item);
  return ms ? Math.round(ms * (((Math.max(0, i | 0) * 0.618034) % 1) + 0)) : 0;
}
// 좌우로 뒤집어 올 때 가리개의 쪽도 뒤집는다(왼쪽부터 드러나던 것이 오른쪽부터).
const sideOf = (def, mirror) => { const s = def.side || 'r'; return mirror && (s === 'r' || s === 'l') ? OPPOSITE[s] : s; };
function keyframesOf(def, item, { scale = 1, mirror = false } = {}) {
  if (!def) return null;
  const full = (Number.isFinite(item?.op) ? item.op : 100) / 100;
  const last = def.frames.length - 1;
  const clipped = def.frames.some((f) => f.clip != null);
  const blurred = def.frames.some((f) => f.b != null);
  const side = sideOf(def, mirror);
  const keyframes = def.frames.map((f, i) => {
    const out = { transform: motionTransform(item, { x: (f.x || 0) * scale * (mirror ? -1 : 1), y: (f.y || 0) * scale, k: f.k ?? 1, r: (f.r || 0) * (mirror ? -1 : 1), kx: f.kx ?? 1, ky: f.ky ?? 1 }) };
    // 투명도는 적힌 때에만(사이의 것은 이어진다). 마지막은 늘 요소의 제 투명도다.
    if (f.o != null || i === last) out.opacity = round((f.o ?? 1) * full);
    if (clipped) out.clipPath = clipOf(f.clip || 0, item, side);
    if (def.stops) out.clipPath = polygonOf(def.stops, f.tk ?? 0);
    if (blurred) out.filter = blurOf(f.b || 0);
    if (f.at != null) out.offset = f.at;
    if (f.ease) out.easing = f.ease;
    return out;
  });
  return { keyframes, ms: def.ms, easing: def.ease || SOFT };
}

/** 요소의 구실: 카드의 넓은 부분을 덮는 도형·사진은 바탕('back'), 글은 'text', 나머지는 'pic'. */
export function roleOf(item) {
  if (!item) return 'pic';
  if (item.t === 'text') return 'text';
  if ((item.t === 'shape' || item.t === 'image' || item.t === 'art' || item.t === 'yt' || item.t === 'web') && (item.w / 100) * (item.h / 100) >= 0.4) return BACK;
  return 'pic';
}

// 읽는 차례: 위에서 아래로(카드 세로의 9% 를 한 줄로 본다), 같은 줄에서는 왼쪽에서 오른쪽으로. 자리가 같으면 놓은 차례대로.
const readingOrder = (a, b) => Math.round(a.it.y / 9) - Math.round(b.it.y / 9) || a.it.x - b.it.x || a.i - b.i;
// 조합 효과가 정하는 차례: 가운데에서 바깥으로 · 왼쪽에서 오른쪽으로 · 뒤섞어(요소 번호로 늘 같게 섞는다. 화면과 영상이 같다).
const centerDist = (r) => Math.hypot((r.it.x ?? 50) + (r.it.w || 0) / 2 - 50, (r.it.y ?? 50) + (r.it.h || 0) / 2 - 50);
const ORDERS = {
  center: (a, b) => Math.round(centerDist(a) / 6) - Math.round(centerDist(b) / 6) || readingOrder(a, b),
  x: (a, b) => Math.round(a.it.x / 6) - Math.round(b.it.x / 6) || readingOrder(a, b),
  shuffle: (a, b) => ((a.i * 0.618034 + 0.3) % 1) - ((b.i * 0.618034 + 0.3) % 1) || a.i - b.i,
};

/**
 * 한 장의 움직임 차례를 정한다.
 * 돌려주는 것: {
 *   auto:   장이 열리면 저절로 나오는 것들 [{ i(요소 번호), enter, delay(ms), mirror }]
 *   clicks: 누를 때마다 하나씩 하는 것들. 나타나기 [{ i, enter, mirror }] · 강조 [{ i, emphasis }] · 사라지기 [{ i, exit }] (읽는 차례대로)
 *   loops:  머무는 동안 되풀이하는 것들 [{ i, loop, after }]
 *   ms:     저절로 나오는 것이 모두 끝나는 때
 * }
 * 규칙: 요소에 효과(an)가 적혀 있으면 그것을, 아니면 조합 효과(pa)가 정해 준 것을 쓴다. an 이 'none' 이면 가만히 있는다.
 *       계속 움직이기(lp)도 같다: 적혀 있으면 그것, 'none' 이면 가만히, 아니면 조합 효과의 idle 이 작은 조각에 차례로 붙여 준다.
 *       바탕은 맨 먼저 함께 나오고, 나머지는 정한 차례대로 조금씩 늦게 나온다. 요소가 많으면 간격을 줄여 2초 안에 다 나온다.
 *       늦추기(dl)는 그 요소만 제 차례보다 늦게 나오게 하고, 빠르기(sp)는 그 요소의 모든 움직임의 길이를 바꾼다.
 *       사라지기(ex)는 누를 때 한다: 그 요소의 나타나기 · 강조 다음 차례다.
 */
export function planMotion(design) {
  const items = Array.isArray(design?.items) ? design.items : [];
  const combo = COMBO_DEFS[design?.pa] || null;
  const rows = items.map((it, i) => ({ i, it, role: roleOf(it) })).filter((r) => r.it);
  // 그 장에서 가장 큰 글(제목): 조합 효과가 따로 움직이게 할 때 쓴다. 글자 크기가 같으면 위의 것.
  const texts = rows.filter((r) => r.it.t === 'text');
  const lead = texts.length ? texts.reduce((m, r) => ((Number(r.it.size) || 0) > (Number(m.it.size) || 0) ? r : m)).i : -1;
  // 연결선은 조합 효과에서 늘 닦아내듯(그려지듯) 나온다.
  const enterOf = (r) => (r.it.an === STILL ? null : ENTER_DEFS[r.it.an] ? r.it.an : combo ? (r.it.t === 'link' ? 'wipe' : combo.pick(r.role, r.it, { lead: r.i === lead })) : null);
  const moving = rows.map((r) => ({ ...r, enter: enterOf(r) }));
  const order = ORDERS[combo?.order] || readingOrder;
  // 누를 때: 읽는 차례대로. "누를 때 나타나는" 요소는 나타나는 차례가 먼저, 강조 효과가 있으면 그다음, 사라지는 효과가 있으면 맨 뒤에 한다.
  // (강조 · 사라지기 단계에는 enter 가 없다. 숨겨 두는 것은 enter 가 있는 단계뿐이다.)
  const clicks = moving.filter((r) => r.it.aw === true || EMPH_DEFS[r.it.em] || EXIT_DEFS[r.it.ex]).sort(readingOrder)
    .flatMap((r, n) => [
      ...(r.it.aw === true ? [{ i: r.i, enter: r.enter || 'fade', mirror: !!combo?.swing && n % 2 === 1 }] : []),
      ...(EMPH_DEFS[r.it.em] ? [{ i: r.i, emphasis: r.it.em }] : []),
      ...(EXIT_DEFS[r.it.ex] ? [{ i: r.i, exit: r.it.ex }] : []),
    ]);
  const shown = moving.filter((r) => r.it.aw !== true && r.enter);
  const backs = shown.filter((r) => r.role === BACK);
  const rest = shown.filter((r) => r.role !== BACK).sort(order);
  const gap = Math.min(combo?.gap ?? 120, rest.length > 1 ? 1500 / (rest.length - 1) : Infinity);
  const start = backs.length && rest.length ? 150 : 0;
  // 이어 나오기(chain): 앞의 것이 85% 나왔을 때 다음 것. 다 합쳐 6초를 넘으면 고르게 줄인다.
  let starts = rest.map((r, n) => start + n * (Number.isFinite(gap) ? gap : 0));
  if (combo?.chain && rest.length) {
    let t = start;
    starts = rest.map((r) => { const at = t; t += Math.round(enterTime(r.enter, r.it) * 0.85) + 60; return at; });
    const last = starts[starts.length - 1];
    if (last > 6000) starts = starts.map((v) => start + (v - start) * (6000 - start) / (last - start));
  }
  const auto = [
    ...backs.map((r) => ({ i: r.i, enter: r.enter, delay: delayOf(r.it), mirror: false })),
    ...rest.map((r, n) => ({ i: r.i, enter: r.enter, delay: Math.round(starts[n] + delayOf(r.it)), mirror: !!combo?.swing && n % 2 === 1 })),
  ];
  const timeOf = (a) => a.delay + enterTime(a.enter, items[a.i]);
  const ms = auto.reduce((m, a) => Math.max(m, timeOf(a)), 0);
  // 계속 움직이기: 나타나는 효과가 있으면 그것이 끝난 때(after)부터, 없으면 장이 열리자마자 시작한다. 누를 때 나오는 것은 나타난 뒤에(after 는 null).
  const linked = new Set(rows.filter((r) => r.it.t === 'link').flatMap((r) => [r.it.from, r.it.to]));
  const given = new Map((combo?.idle ? rows.filter((r) => !r.it.lp && r.role !== BACK && AUTO_IDLE_TYPES.includes(r.it.t) && !(r.it.id && linked.has(r.it.id))) : [])
    .sort(readingOrder).slice(0, AUTO_IDLE_MAX).map((r, n) => [r.i, combo.idle[n % combo.idle.length]]));
  // 바탕 사진은 조합 효과가 천천히 다가가게 할 수 있다(영화처럼).
  if (combo?.backIdle) for (const r of rows) if (!r.it.lp && r.role === BACK && r.it.t === 'image') given.set(r.i, combo.backIdle);
  const idleOf = (r) => (r.it.lp === STILL ? null : IDLE_DEFS[r.it.lp] ? r.it.lp : given.get(r.i) || null);
  const loops = rows.filter((r) => idleOf(r)).map((r) => {
    const a = auto.find((v) => v.i === r.i);
    return { i: r.i, loop: idleOf(r), after: r.it.aw === true ? null : a ? timeOf(a) : 0 };
  });
  return { auto, clicks, loops, ms };
}
/** 그 디자인에 움직임이 하나라도 있는지(슬라이드 띠에 표시할 때 쓴다). */
export function hasMotion(design) {
  if (!design) return false;
  if (TRANSITION_DEFS[design.tr] || COMBO_DEFS[design.pa]) return true;
  return (Array.isArray(design.items) ? design.items : []).some((it) => it && (ENTER_DEFS[it.an] || it.aw === true || EMPH_DEFS[it.em] || EXIT_DEFS[it.ex] || IDLE_DEFS[it.lp]));
}

// 장의 모습 하나를 화면용 키프레임으로 적는다. w: 카드 너비(px. 흐림의 크기를 정한다).
function turnKeyframe(f, w = 1000) {
  const out = {};
  const parts = [];
  if (f.y != null) parts.push(`translate(${f.x || 0}%, ${f.y}%)`);
  else if (f.x != null) parts.push(`translateX(${f.x}%)`);
  if (f.k != null) parts.push(`scale(${f.k})`);
  if (!parts.length && f.turn != null) parts.push(`perspective(${TURN_DEPTH}px) rotateY(${f.turn}deg)`);
  if (parts.length) out.transform = parts.join(' ');
  if (f.b != null) out.filter = `blur(${round((f.b / 100) * w)}px)`;
  if (f.o != null) out.opacity = f.o;
  if (f.inset) out.clipPath = `inset(${f.inset.map((v) => `${v}%`).join(' ')})`;
  if (f.circle != null) out.clipPath = `circle(${f.circle}% at 50% 50%)`;
  if (f.at != null) out.offset = f.at;
  if (f.ease) out.easing = f.ease;
  return out;
}

/**
 * 전환 효과의 키프레임. dir 이 1 이면 다음 장으로, -1 이면 앞 장으로 간다(밀어내기·덮기·닦아내기는 방향이 뒤집힌다).
 * 돌려주는 것: { ms, easing, next(들어오는 장의 키프레임), old(나가는 장의 키프레임. 가만히 있으면 null) }. 모르는 효과면 null.
 * 들어오는 장이 늘 위에 그려진다.
 */
export function transitionFrames(id, dir = 1, { w = 1000 } = {}) {
  const def = TRANSITION_DEFS[id];
  if (!def) return null;
  const d = dir < 0 ? -1 : 1;
  const write = (f) => turnKeyframe(f, w);
  return { ms: def.ms, easing: def.ease || TURN_EASE, next: def.next(d).map(write), old: def.old ? def.old(d).map(write) : null };
}

// ---------- 이어 움직이기: 두 장의 같은 요소 짝짓기 ----------

// 요소의 내용(같은 글 · 같은 그림 · 같은 스티커 …). 이름표가 이어지지 않는 요소는 이것이 양쪽에 하나씩만 있을 때 짝이 된다.
const contentOf = (it) => {
  const v = it?.t === 'text' ? it.text : it?.t === 'image' ? it.url : it?.t === 'emoji' ? it.ch : it?.t === 'shape' ? `${it.shape}|${it.color}` : it?.t === 'art' ? it.art : it?.t === 'yt' ? it.yt : '';
  return typeof v === 'string' && v ? `${it.t}|${v}` : '';
};
// 요소의 이름표와, 복제했을 때 적어 둔 원본의 이름표(designs.js 의 copySlide 가 origin.elementId 로 남긴다).
const linksOf = (it) => [it?.id, it?.origin?.elementId].filter((v) => typeof v === 'string' && v);

/**
 * 앞 장(before)과 다음 장(after)의 요소 목록에서 "같은 요소"를 짝짓는다(DOM 을 모르는 순수 함수).
 *   1) 종류가 같고 이름표가 같거나, 한쪽이 다른 쪽을 복제한 것이거나, 같은 원본에서 복제한 것
 *   2) 남은 것끼리 종류와 내용(글 · 그림 주소 · 스티커 · 도형 모양과 색 …)이 같고, 그런 것이 양쪽에 하나씩만 있는 것
 * 돌려주는 것: [[앞 장의 요소 번호, 다음 장의 요소 번호], …] (다음 장의 차례대로)
 */
export function matchItems(before, after) {
  const a = Array.isArray(before) ? before : [];
  const b = Array.isArray(after) ? after : [];
  const pairs = [];
  const usedA = new Set();
  const usedB = new Set();
  b.forEach((nb, j) => {
    const keys = linksOf(nb);
    if (!keys.length) return;
    const i = a.findIndex((na, k) => !usedA.has(k) && na?.t === nb?.t && linksOf(na).some((v) => keys.includes(v)));
    if (i >= 0) { pairs.push([i, j]); usedA.add(i); usedB.add(j); }
  });
  const count = (list, used) => {
    const m = new Map();
    list.forEach((it, k) => { const c = !used.has(k) && contentOf(it); if (c) m.set(c, [...(m.get(c) || []), k]); });
    return m;
  };
  const left = count(a, usedA);
  const right = count(b, usedB);
  for (const [c, js] of right) {
    const is = left.get(c);
    if (is?.length === 1 && js.length === 1) pairs.push([is[0], js[0]]);
  }
  return pairs.sort((p, q) => p[1] - q[1]);
}
// 짝이 된 두 요소의 내용이나 꾸밈이 다른지(글 · 그림 · 색 …). 다르면 옮겨 가는 동안 앞 것은 사라지고 새것이 나타난다(겹쳐 보이지 않게).
const LOOK_KEYS = ['text', 'url', 'ch', 'art', 'yt', 'shape', 'color', 'bgc', 'mask', 'crop', 'font', 'typeface', 'bold', 'italic', 'under', 'align', 'stroke', 'shadow', 'line', 'lc', 'hollow', 'head', 'dash', 'op'];
export const looksChanged = (a, b) => LOOK_KEYS.some((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
// 내용(무엇을 그렸는지)만 견준다: 이것이 다르면 영상에서 앞 것과 새것 두 갈래로 그려 녹듯이 바꾼다. 꾸밈(색 · 크기 · 둥글기 …)은 이어 간다.
const CONTENT_KEYS = ['text', 'url', 'ch', 'art', 'yt', 'shape', 'mask', 'crop'];
export const contentChanged = (a, b) => CONTENT_KEYS.some((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
const NUM_KEYS = ['x', 'y', 'w', 'h', 'size', 'op', 'r', 'lh'];
const COLOR_KEYS = ['color', 'lc', 'bgc', 'stroke'];
const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) : null);
const mixColor = (a, b, t) => { const [p, q] = [hex(a), hex(b)]; if (!p || !q) return t < 0.5 ? a : b; return `#${p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join('')}`; };
/**
 * 이어 움직이기의 중간 모습: 앞 장의 요소 a 에서 이 장의 요소 b 로 t(0~1)만큼 간 요소(영상이 이것을 그려 옮겨 간다).
 * 수(자리 · 크기 · 글자 크기 · 둥글기 · 투명도 · 테두리 굵기)와 색은 사이 값으로, 각도는 가까운 쪽으로 돈다. 켜고 끄는 값(굵게 · 속 비움 …)은 가운데에서 바뀐다.
 * 한쪽에만 테두리가 있으면 굵기 0 에서 자라난다. content: 'a' 면 내용(글 · 그림)은 a 의 것, 아니면 b 의 것(내용이 다를 때 두 갈래로 그린다).
 */
export function tweenItem(a, b, t, { content = 'b' } = {}) {
  const q = Math.min(1, Math.max(0, t));
  const out = { ...(q < 0.5 ? a : b) };
  const own = content === 'a' ? a : b;
  for (const k of CONTENT_KEYS) { if (own[k] === undefined) delete out[k]; else out[k] = own[k]; }
  out.t = own.t;
  for (const k of NUM_KEYS) if (Number.isFinite(a[k]) && Number.isFinite(b[k])) out[k] = a[k] + (b[k] - a[k]) * q;
  const turn = ((((Number(b.rot) || 0) - (Number(a.rot) || 0)) % 360) + 540) % 360 - 180;
  out.rot = ((((Number(a.rot) || 0) + turn * q + 180) % 360) + 360) % 360 - 180;
  const la = Number(a.line) || 0, lb = Number(b.line) || 0;
  if (la || lb) {
    out.line = la + (lb - la) * q;
    out.lc = mixColor(a.lc || b.lc, b.lc || a.lc, q);
    if (!out.line) delete out.line;
  }
  for (const k of COLOR_KEYS) if (k !== 'lc' && (a[k] || b[k])) out[k] = a[k] && b[k] ? mixColor(a[k], b[k], q) : q < 0.5 ? a[k] : b[k];
  if (a.t === 'link' && b.t === 'link' && a.pts?.length === b.pts?.length) for (const k of ['vh']) out[k] = a[k] + (b[k] - a[k]) * q;
  if (a.t === 'link' && b.t === 'link' && a.pts?.length === b.pts?.length) out.pts = a.pts.map((v, i) => v + (b.pts[i] - v) * q);
  for (const k of ['id', 'origin', 'an', 'aw', 'em', 'lp', 'ex', 'sp', 'dl', 'g']) delete out[k];
  return out;
}
/** 그 전환이 두 장을 이어 움직이는 것인지. */
export const morphs = (id) => !!TRANSITION_DEFS[id]?.morph;

// ---------- 그 순간의 모습(영상으로 만들 때): 브라우저의 키프레임 계산을 그대로 따라 한다 ----------

const EASES = { linear: null, ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
const easeCache = new Map();
/** CSS 의 빠르기(이름 · cubic-bezier(…) · steps(n, end))를 0~1 → 0~1 함수로 바꾼다. 모르는 것은 한결같은 빠르기(linear)다. */
export function easeFn(css) {
  if (easeCache.has(css)) return easeCache.get(css);
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(String(css ?? '').trim());
  const p = m ? m[1].split(',').map(Number) : EASES[css];
  let fn = (x) => Math.min(1, Math.max(0, x));
  // 계단(steps(n, end)): n 칸으로 나눠 칸이 끝날 때마다 한 칸씩 뛴다(타자 치듯).
  const st = /^steps\(\s*(\d+)\s*(?:,\s*(?:end|jump-end)\s*)?\)$/.exec(String(css ?? '').trim());
  if (st && Number(st[1]) > 0) {
    const n = Number(st[1]);
    fn = (x) => (x >= 1 ? 1 : x <= 0 ? 0 : Math.floor(x * n) / n);
    easeCache.set(css, fn);
    return fn;
  }
  if (p && p.length === 4 && p.every(Number.isFinite)) {
    const [x1, y1, x2, y2] = p;
    const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    fn = (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      // 가로(시간) 값이 x 가 되는 곡선 위의 자리를 반씩 좁혀 찾는다(곡선의 가로는 늘 커지기만 한다).
      let lo = 0;
      let hi = 1;
      for (let n = 0; n < 32; n++) {
        const mid = (lo + hi) / 2;
        if (at(x1, x2, mid) < x) lo = mid; else hi = mid;
      }
      return at(y1, y2, (lo + hi) / 2);
    };
  }
  easeCache.set(css, fn);
  return fn;
}

// frame 들의 때(0~1): 적힌 것은 그대로, 처음은 0 · 마지막은 1, 나머지는 앞뒤 사이에 고르게 놓는다.
function offsetsOf(frames) {
  const at = frames.map((f, i) => (f.at != null ? f.at : i === 0 ? 0 : i === frames.length - 1 ? 1 : null));
  for (let i = 1; i < at.length; i++) {
    if (at[i] != null) continue;
    let j = i;
    while (at[j] == null) j += 1;
    const step = (at[j] - at[i - 1]) / (j - i + 1);
    for (let k = i; k < j; k++) at[k] = at[i - 1] + step * (k - i + 1);
    i = j;
  }
  return at;
}
const mixNumber = (a, b, q) => a + (b - a) * q;
const mixList = (a, b, q) => a.map((v, i) => mixNumber(v, b[i], q));
// 한 값의 흐름 points [{ at, v, ease }] 에서 때 p 의 값. 같은 때가 겹치면 뒤의 것에서 이어 간다(딱 그때 바뀐다).
function sample(points, p, mix = mixNumber) {
  let i = 0;
  for (let n = 1; n < points.length; n++) if (points[n].at <= p) i = n;
  const a = points[i];
  const b = points[i + 1];
  if (!b || p <= a.at) return a.v;
  return mix(a.v, b.v, easeFn(a.ease)((p - a.at) / (b.at - a.at)));
}
const unit = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** 그 효과의 길이(ms). item 을 주면 그 요소의 빠르기 · 글자 수를 입힌다. 모르는 효과면 0. */
export function enterTime(id, item) {
  return defFor(ENTER_DEFS[id], item)?.ms || 0;
}
/** 사라지는 효과의 길이(ms). 모르는 효과면 0. */
export function exitTime(id, item) {
  return defFor(EXIT_DEFS[id], item)?.ms || 0;
}

/**
 * 요소가 그 효과로 나타나기 시작한 지 ms 가 지났을 때의 모습. 모르는 효과면 null.
 *   mirror: 좌우를 뒤집어(오른쪽에서) 온다 · scale: 거리의 배율
 *   item: 그 요소(빠르기 · 타자 치듯의 글자 수를 입힌다) · stops: 타자 치듯에서 잰 글자 자리(measureType. 없으면 어림한다)
 * 돌려주는 것: { x · y(옮긴 거리. 카드 너비를 100 으로 본 값) · k(크기 배율) · kx · ky(가로 · 세로 배율) · r(더 돌린 각도) · o(투명도 배율 0~1)
 *               b(흐림. 카드 너비의 %) · clip(가린 정도 0~100) · side(가리는 쪽) · done(다 나왔는지)
 *               타자 치듯이면 + stops(글자 자리) · tk(드러난 글자 수. typePoints 로 가리개를 만든다) }
 * ms 가 0 보다 작으면(아직 차례가 아니면) 처음 모습, 길이를 넘으면 다 나온 모습이다. enterKeyframes 를 브라우저가 틀었을 때와 같은 값이다.
 */
export function enterPose(id, ms, opts = {}) {
  return poseOf(defFor(ENTER_DEFS[id], opts.item, opts.stops), ms, opts);
}
/** 강조 효과가 시작한 지 ms 가 지났을 때의 모습(enterPose 와 같은 꼴. 시작 전과 끝난 뒤는 제 모습). 모르는 효과면 null. */
export function emphasisPose(id, ms, opts = {}) {
  return poseOf(defFor(EMPH_DEFS[id], opts.item), Math.max(0, ms), opts);
}
/** 사라지는 효과가 시작한 지 ms 가 지났을 때의 모습(enterPose 와 같은 꼴. 시작 전은 제 모습, 끝난 뒤는 사라진 모습). 모르는 효과면 null. */
export function exitPose(id, ms, opts = {}) {
  return poseOf(defFor(EXIT_DEFS[id], opts.item), Math.max(0, ms), opts);
}
/** 강조 효과의 길이(ms). 모르는 효과면 0. */
export function emphasisTime(id, item) {
  return defFor(EMPH_DEFS[id], item)?.ms || 0;
}
/**
 * 계속 움직이기를 시작한 지 ms 가 지났을 때의 모습(emphasisPose 와 같은 꼴. 한 바퀴가 끝나면 다시 처음부터). 모르는 효과면 null.
 * 브라우저가 iterations: Infinity 로 틀었을 때와 같은 값이다(한 바퀴마다 빠르기가 처음부터 다시 간다).
 */
export function idlePose(id, ms, item) {
  const def = defFor(IDLE_DEFS[id], item);
  if (!def) return null;
  const t = Number.isFinite(ms) ? ((ms % def.ms) + def.ms) % def.ms : 0;
  return { ...poseOf(def, t), done: false };
}
function poseOf(def, ms, { mirror = false, scale = 1 } = {}) {
  if (!def) return null;
  const p = easeFn(def.ease || SOFT)(unit(ms / def.ms));
  const at = offsetsOf(def.frames);
  const flip = mirror ? -1 : 1;
  const last = def.frames.length - 1;
  // 자리 · 크기 · 각도는 모든 frame 에 있다(적지 않은 것은 제자리). 투명도는 적힌 frame 과 마지막에만 있다.
  const every = (pick) => def.frames.map((f, i) => ({ at: at[i], v: pick(f), ease: f.ease }));
  const seen = def.frames.map((f, i) => ({ at: at[i], v: f.o ?? 1, ease: f.ease, on: f.o != null || i === last })).filter((x) => x.on);
  if (seen[0].at > 0) seen.unshift({ at: 0, v: 1 });
  return {
    x: sample(every((f) => (f.x || 0) * scale * flip), p) + 0,      // (+ 0: 좌우를 뒤집은 0 이 -0 으로 남지 않게)
    y: sample(every((f) => (f.y || 0) * scale), p),
    k: sample(every((f) => f.k ?? 1), p),
    kx: sample(every((f) => f.kx ?? 1), p),
    ky: sample(every((f) => f.ky ?? 1), p),
    r: sample(every((f) => (f.r || 0) * flip), p) + 0,
    o: sample(seen, p),
    b: def.frames.some((f) => f.b != null) ? Math.max(0, sample(every((f) => f.b || 0), p)) : 0,
    clip: def.frames.some((f) => f.clip != null) ? sample(every((f) => f.clip || 0), p) : 0,
    side: sideOf(def, mirror),
    ...(def.stops ? { stops: def.stops, tk: Math.round(sample(every((f) => f.tk ?? 0), p)) } : {}),
    done: ms >= def.ms,
  };
}

/**
 * 전환 효과가 시작한 지 ms 가 지났을 때 두 장의 모습. 모르는 효과면 null.
 * 돌려주는 것: { ms(길이), done, next(들어오는 장), old(나가는 장. 가만히 있으면 null) }
 *   장의 모습: { x(옆으로 옮긴 거리. 카드 너비의 %) · y(위아래. 카드 높이의 %) · k · o · turn(도) · b(흐림. 카드 너비의 %)
 *               inset([위, 오른쪽, 아래, 왼쪽] % 또는 null) · circle(% 또는 null) }
 */
export function transitionPose(id, dir = 1, ms = 0) {
  const def = TRANSITION_DEFS[id];
  if (!def) return null;
  const p = easeFn(def.ease || TURN_EASE)(unit(ms / def.ms));
  const pose = (frames) => {
    const at = offsetsOf(frames);
    const flow = (key) => frames.map((f, i) => ({ at: at[i], v: f[key], ease: f.ease })).filter((x) => x.v != null);
    const value = (key, rest, mix) => { const points = flow(key); return points.length ? sample(points, p, mix) : rest; };
    return { x: value('x', 0), y: value('y', 0), k: value('k', 1), o: value('o', 1), turn: value('turn', 0), b: Math.max(0, value('b', 0)), inset: value('inset', null, mixList), circle: value('circle', null) };
  };
  const d = dir < 0 ? -1 : 1;
  return { ms: def.ms, done: ms >= def.ms, next: pose(def.next(d)), old: def.old ? pose(def.old(d)) : null };
}

// ---------- 재생(브라우저) ----------

/** 움직임을 줄여 달라고 해 둔 기기인지(그러면 아무것도 틀지 않는다). */
export function calm() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 요소 하나를 그 효과로 나타나게 한다. node 는 그 요소를 그린 것(render.js 의 itemView), item 은 그 요소의 값.
 * delay 동안에는 처음 모습(아직 안 나온 모습)으로 기다린다. 틀지 못했으면 null, 틀었으면 Animation.
 */
export function playEnter(node, item, id, { delay = 0, scale = 1, mirror = false } = {}) {
  // 타자 치듯: 글자가 실제로 놓인 자리를 재어 그 자리까지 연다.
  const k = enterKeyframes(item, id, { scale, mirror, stops: id === 'type' && !calm() ? measureType(node) : null });
  if (!k || !node || typeof node.animate !== 'function' || calm()) return null;
  return node.animate(k.keyframes, { duration: k.ms, delay, easing: k.easing, fill: 'backwards' });
}

/**
 * 요소 하나를 사라지는 효과로 사라지게 한다. 끝나면(또는 움직임을 줄인 기기면 바로) 숨긴다(visibility: hidden).
 * 돌려주는 것: Animation(틀었으면) 또는 null.
 */
export function playExit(node, item, id) {
  if (!node) return null;
  const k = exitKeyframes(item, id);
  const hide = () => { node.style.visibility = 'hidden'; };
  if (!k || typeof node.animate !== 'function' || calm()) { hide(); return null; }
  const a = node.animate(k.keyframes, { duration: k.ms, easing: k.easing, fill: 'forwards' });
  // 끝나면 숨기고 움직임을 걷는다(붙들어 둔 모습이 남지 않게).
  a.finished.then(() => { hide(); try { a.cancel(); } catch { /* 이미 걷혔다 */ } }, () => {});
  return a;
}

/** 요소 하나를 강조 효과로 한 번 움직인다(끝나면 흔적이 없다). 틀지 못했으면 null. */
export function playEmphasis(node, item, id) {
  const k = emphasisKeyframes(item, id);
  if (!k || !node || typeof node.animate !== 'function' || calm()) return null;
  return node.animate(k.keyframes, { duration: k.ms, easing: k.easing });
}

/**
 * 요소 하나를 계속 움직이기로 되풀이해 움직인다(멈추려면 돌려받은 Animation 을 cancel 한다. 그러면 흔적이 없다).
 *   delay: 시작을 늦춘다 · phase: 한 바퀴의 이만큼 지난 데서 시작한다(idlePhase. 요소마다 박자를 흩어 놓을 때)
 * 틀지 못했으면 null.
 */
export function playIdle(node, item, id, { delay = 0, phase = 0, scale = 1 } = {}) {
  // (빠르기는 idleKeyframes 가 요소의 sp 로 입힌다.)
  const k = idleKeyframes(item, id, { scale });
  if (!k || !node || typeof node.animate !== 'function' || calm()) return null;
  return node.animate(k.keyframes, { duration: k.ms, delay: delay - phase, easing: k.easing, iterations: Infinity });
}

/**
 * 한 장의 움직임을 튼다. card 는 그 디자인을 그린 카드(designView), design 은 그 디자인(정리된 것: 카드의 요소와 차례가 같아야 한다).
 *   delay: 시작을 늦춘다(전환 효과가 끝난 뒤에 시작할 때) · still: 참이면 나타나는 움직임 없이 다 나온 모습으로 둔다(앞 장으로 돌아갈 때. 계속 움직이기는 튼다)
 * 돌려주는 것(조종기): {
 *   left():   아직 누르지 않아 숨어 있는 것의 수
 *   next():   숨어 있는 것을 하나 나타나게 한다. 나타나게 했으면 true, 더 없으면 false
 *   finish(): 틀고 있는 나타나기·강조를 끝까지 넘긴다(숨어 있는 것과 계속 움직이기는 그대로)
 *   stop():   계속 움직이기를 멈춘다(장을 떠날 때. 흔적이 없다)
 *   reveal(): 누를 차례를 모두 한 모습으로 두고 움직임을 모두 끝낸다(숨은 것은 보이고, 사라질 것은 사라진다. 계속 움직이기도 멈춘다)
 *   restore(): 움직임을 모두 걷고 모든 요소를 제 모습으로 되돌린다(꾸미기 판에서 미리 보기를 끝낼 때)
 * }
 */
export function playDesign(card, design, { delay = 0, still = false } = {}) {
  const nodes = card ? [...card.children].filter((n) => n.classList.contains('fi')) : [];
  const items = Array.isArray(design?.items) ? design.items : [];
  const plan = planMotion(design);
  if (still) { plan.auto = []; plan.clicks = []; for (const l of plan.loops) l.after = 0; }
  const running = [];
  const loops = [];
  const keep = (a) => { if (a) { running.push(a); a.finished.catch(() => {}); } return a; };
  // 계속 움직이기: 나타난 뒤에 이어서(제 모습에서 끊김 없이 0 에서), 나타나지 않는 요소는 장이 열릴 때 제 박자(idlePhase)에서 시작한다.
  let stopped = false;
  const gone = new Set();   // 사라지게 한 요소(다시 움직이지 않는다)
  const idleOf = (i) => plan.loops.find((l) => l.i === i) || null;
  const loop = (i, { delay: wait = 0, phase = 0 } = {}) => {
    const l = idleOf(i);
    if (!l || stopped || gone.has(i)) return;
    const a = playIdle(nodes[i], items[i], l.loop, { delay: wait, phase });
    if (a) { loops.push(a); a.finished.catch(() => {}); }
  };
  const chain = (anim, i) => { if (anim) anim.finished.then(() => loop(i), () => {}); else loop(i); };
  // 이어 움직이기로 앞 장에서 옮겨 온 요소는 이미 화면에 있으므로 다시 나타나지 않는다(누를 때 나오는 것은 그대로 기다린다).
  const entered = new Set();
  for (const a of plan.auto) {
    if (nodes[a.i]?.dataset.moved) continue;
    entered.add(a.i);
    chain(keep(playEnter(nodes[a.i], items[a.i], a.enter, { delay: delay + a.delay, mirror: a.mirror })), a.i);
  }
  const waiting = plan.clicks.filter((c) => nodes[c.i]);
  for (const c of waiting) if (c.enter) nodes[c.i].style.visibility = 'hidden';
  const clicked = new Set(waiting.filter((c) => c.enter).map((c) => c.i));
  for (const l of plan.loops) if (nodes[l.i] && !entered.has(l.i) && !clicked.has(l.i)) loop(l.i, { delay, phase: idlePhase(l.i, l.loop, items[l.i]) });
  // 앞 장으로 돌아왔을 때(still): 사라지는 효과까지 다 한 모습이므로 사라질 요소는 숨겨 둔다.
  if (still) for (const r of planMotion(design).clicks) if (r.exit && nodes[r.i]) nodes[r.i].style.visibility = 'hidden';
  const show = (c, animate) => {
    if (c.exit) {
      // 사라질 때는 계속 움직이기를 멈추고(그 요소의 것만) 사라지게 한다.
      gone.add(c.i);
      for (const a of loops.filter((a) => a.effect?.target === nodes[c.i])) { try { a.cancel(); } catch { /* 이미 걷혔다 */ } }
      if (animate) keep(playExit(nodes[c.i], items[c.i], c.exit)); else nodes[c.i].style.visibility = 'hidden';
      return;
    }
    if (c.emphasis) { if (animate) keep(playEmphasis(nodes[c.i], items[c.i], c.emphasis)); return; }
    nodes[c.i].style.visibility = '';
    chain(animate ? keep(playEnter(nodes[c.i], items[c.i], c.enter, { mirror: c.mirror })) : null, c.i);
  };
  const finish = () => { for (const a of running.splice(0)) { try { a.finish(); } catch { /* 이미 끝났다 */ } } };
  const stop = () => { stopped = true; for (const a of loops.splice(0)) { try { a.cancel(); } catch { /* 이미 걷혔다 */ } } };
  return {
    left: () => waiting.length,
    next() {
      const c = waiting.shift();
      if (!c) return false;
      show(c, true);
      return true;
    },
    finish,
    stop,
    reveal() {
      stop();
      for (const c of waiting.splice(0)) show(c, false);
      finish();
    },
    restore() {
      stop();
      waiting.splice(0);
      for (const a of running.splice(0)) { try { a.cancel(); } catch { /* 이미 걷혔다 */ } }
      for (const n of nodes) n.style.visibility = '';
    },
  };
}

/**
 * 전환 효과를 튼다: next(들어오는 장)가 old(나가는 장) 위로 들어온다. 두 장은 같은 자리에 겹쳐 놓여 있어야 한다.
 * 돌려주는 것: { ms(걸리는 시간. 틀지 않았으면 0), finish(): 바로 끝낸다(여러 번 불러도 된다), done: 끝나면 풀리는 약속 }
 * 끝난 뒤에는 두 장 모두 움직임이 걸리지 않은 제 모습이다(나가는 장을 떼는 일은 부른 쪽이 한다).
 */
export function playTransition(old, next, id, dir = 1, { from = null, to = null } = {}) {
  if (morphs(id) && old && next && from && to && typeof next.animate === 'function' && !calm()) return playMorph(old, next, from, to);
  const f = transitionFrames(id, dir, { w: next?.getBoundingClientRect?.().width || 1000 });
  if (!f || !next || typeof next.animate !== 'function' || calm()) return { ms: 0, finish() {}, done: Promise.resolve() };
  const opts = { duration: f.ms, easing: f.easing, fill: 'both' };
  const drop = lift([next, f.old ? old : null]);
  const anims = [next.animate(f.next, opts)];
  if (old && f.old) anims.push(old.animate(f.old, opts));
  // 끝나면(또는 바로 끝내면) 움직임을 걷어 낸다: 들어온 장은 아무것도 걸리지 않은 제 모습으로 남는다.
  // (끝난 모습으로 붙들어 두면 글자가 흐릿하게 그려지고, 다시 끝내라고 하면 걷어 낸 것이 되살아난다. 그래서 한 번만 걷는다.)
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    for (const a of anims) { try { a.cancel(); } catch { /* 이미 걷혔다 */ } }
    drop();
  };
  const done = Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(end);
  return { ms: f.ms, finish: end, done };
}

// 옮겨 가는 요소: 자리와 각도는 transform 으로(앞 장의 가운데 → 제자리), 모습은 하나하나 실제 값으로 이어 간다.
// 크기를 transform 의 확대로 바꾸면 둥근 모서리 · 테두리 굵기 · 글자 모양이 늘어나 보이다가 끝에서 뚝 바뀌므로,
// 너비 · 높이 · 모서리 둥글기 · 테두리(굵기 · 색) · 채우기 · 글자 크기 · 글 테두리와 그림자 · 투명도를 앞 장의 값에서 이 장의 값으로 함께 바꾼다.
// 두 장은 같은 크기로 겹쳐 있으므로 화면에서 잰 값(px)을 그대로 이어 붙일 수 있다(돌린 요소도 가운데 점은 그대로다).
// SVG 도형의 테두리는 CSS 변수(--fe-edge · --fe-edge-color)로 그리므로 editor.css 에서 그 변수를 @property 로 알려 두어 이어지게 한다.
const MORPH_PROPS = [
  'width', 'height', 'fontSize', 'lineHeight', 'letterSpacing',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'color', 'backgroundColor', 'boxShadow', 'textShadow', 'opacity',
];
const MORPH_VARS = ['--fe-edge', '--fe-edge-color'];
const centerOf = (node) => { const r = node.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const morphTransform = (dx, dy, item) => `translate(${round(dx)}px, ${round(dy)}px) translate(-50%, -50%) rotate(${round(Number(item?.rot) || 0)}deg) scale(${item?.fx ? -1 : 1}, ${item?.fy ? -1 : 1})`;
/** 앞 장의 요소(oldNode)에서 이 장의 요소(newNode)로 이어 가는 키프레임 [처음, 끝](newNode 에 건다). */
export function morphFrames(oldNode, newNode, oldItem, newItem) {
  const [ox, oy] = centerOf(oldNode), [nx, ny] = centerOf(newNode);
  const a = getComputedStyle(oldNode), b = getComputedStyle(newNode);
  const start = { transform: morphTransform(ox - nx, oy - ny, oldItem) }, end = { transform: morphTransform(0, 0, newItem) };
  for (const k of MORPH_PROPS) if (a[k] !== b[k]) { start[k] = a[k]; end[k] = b[k]; }
  for (const k of MORPH_VARS) {
    const [va, vb] = [a.getPropertyValue(k).trim(), b.getPropertyValue(k).trim()];
    if (va !== vb && va && vb) { start[k] = va; end[k] = vb; }
  }
  // 한쪽에만 테두리가 있으면 테두리 모양은 처음부터 끝까지 있는 쪽의 것으로 둔다(굵기가 0 에서 자라나게).
  const style = a.borderTopStyle !== 'none' ? a.borderTopStyle : b.borderTopStyle;
  if (style !== 'none' && a.borderTopStyle !== b.borderTopStyle) { start.borderStyle = style; end.borderStyle = style; }
  return [start, end];
}
// 움직이는 동안만 그래픽 장치에 미리 올려 둔다(첫 프레임이 늦지 않게). 끝나면 걷는다.
const lift = (nodes) => { for (const n of nodes) if (n?.style) n.style.willChange = 'transform, opacity'; return () => { for (const n of nodes) if (n?.style) n.style.willChange = ''; }; };

/**
 * 이어 움직이기를 튼다. from · to 는 두 장의 디자인(카드의 요소와 차례가 같아야 한다).
 *   짝이 된 요소: 앞 장의 모습에서 이 장의 모습으로 옮겨 간다(앞 장의 것은 바로 감춘다).
 *   짝이 없는 요소: 앞 장의 것은 사라지고, 이 장의 것은 조금 늦게 나타난다. 바탕도 서서히 바뀐다.
 * 옮겨 온 요소에는 data-moved 를 달아 playDesign 이 다시 나타나게 하지 않는다.
 * 돌려주는 것은 playTransition 과 같다(+ moved: 옮겨 온 요소의 수).
 */
function playMorph(old, next, from, to) {
  const def = TRANSITION_DEFS.move;
  const nodesOf = (card) => [...card.children].filter((n) => n.classList.contains('fi'));
  const was = nodesOf(old);
  const now = nodesOf(next);
  // 누를 때 나타나는 요소는 짝짓지 않는다(그 차례에 나타난다. 영상도 같다).
  const pairs = matchItems(from.items, to.items).filter(([i, j]) => was[i] && now[j] && to.items[j]?.aw !== true);
  const opts = { duration: def.ms, easing: def.ease, fill: 'both' };
  const anims = [];
  const hidden = [];
  // 이 장의 바탕은 따로 깐 판으로 서서히 나타난다(그동안 카드 자체는 비쳐 보여 앞 장의 바탕이 보인다).
  const back = next.ownerDocument.createElement('div');
  back.className = 'fe-morph-back';
  back.setAttribute('aria-hidden', 'true');
  next.prepend(back);
  next.classList.add('fe-morphing');
  anims.push(back.animate([{ opacity: 0 }, { opacity: 1 }], opts));
  const moved = new Set(pairs.map(([, j]) => j));
  const gone = new Set(pairs.map(([i]) => i));
  const frames = pairs.map(([i, j]) => morphFrames(was[i], now[j], from.items[i], to.items[j]));
  const drop = lift([back, ...pairs.map(([, j]) => now[j])]);
  pairs.forEach(([i, j], k) => {
    now[j].dataset.moved = '1';
    if (looksChanged(from.items[i], to.items[j])) {
      // 글이나 그림이 달라졌으면: 앞 것도 새 자리로 함께 옮겨 가며 사라지고, 새것은 앞 자리에서 나타나며 온다(서로 겹쳐 녹듯이).
      const back = morphFrames(now[j], was[i], to.items[j], from.items[i]).reverse();
      anims.push(was[i].animate([{ ...back[0], opacity: getComputedStyle(was[i]).opacity }, { ...back[1], opacity: 0 }], opts));
      anims.push(now[j].animate([{ ...frames[k][0], opacity: 0 }, frames[k][1]], opts));
      lift([was[i]]);
      return;
    }
    was[i].style.visibility = 'hidden';
    hidden.push(was[i]);
    anims.push(now[j].animate(frames[k], opts));
  });
  was.forEach((n, i) => { if (!gone.has(i)) anims.push(n.animate([{ opacity: getComputedStyle(n).opacity }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], opts)); });
  // 이 장에만 있는 것(영상 장면 판 · 안내 글 포함)은 앞 장의 것이 거의 사라진 뒤에 나타난다.
  [...next.children].forEach((n, k) => {
    if (n === back || (n.classList.contains('fi') && moved.has(now.indexOf(n)))) return;
    anims.push(n.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: getComputedStyle(n).opacity }], opts));
  });
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    for (const a of anims) { try { a.cancel(); } catch { /* 이미 걷혔다 */ } }
    back.remove();
    drop();
    next.classList.remove('fe-morphing');
    for (const n of hidden) n.style.visibility = '';
  };
  const done = Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(end);
  return { ms: def.ms, finish: end, done, moved: pairs.length };
}
