// 온바탕 편집기의 움직임(애니메이션): 발표할 때 요소가 나타나는 효과 · 한 장의 요소들이 어울려 움직이는 조합 효과 · 장이 넘어가는 전환 효과.
// 규칙(목록 · 키프레임 · 차례)은 DOM 을 쓰지 않는 순수 함수라 node 에서 그대로 테스트한다. 맨 아래의 재생 함수들만 브라우저에서 쓴다.
//
// 디자인에 적는 값(정했을 때만 적는다. 그래서 예전 디자인은 그대로다)
//   - 요소  an: 나타나는 효과(ENTERS 의 id). 'none' 이면 조합 효과가 있어도 가만히 있는다.
//           aw: true 면 "누를 때" 나타난다(발표하다가 한 번 누를 때마다 하나씩).
//           em: 강조 효과(EMPHASES 의 id). 이미 보이는 요소가 누를 때 한 번 움직이고 제자리로 돌아온다(키노트의 동작 강조).
//   - 디자인 pa: 조합 효과(COMBOS 의 id) · tr: 이 장이 넘어올 때의 전환 효과(TRANSITIONS 의 id).
//
// 움직임은 Web Animations(element.animate)로 틀고, 끝나면 흔적이 남지 않는다(요소의 스타일을 건드리지 않는다).
// 그래서 그림으로 내려받기 · 작은 그림 · 저장된 모양은 움직임과 상관없이 늘 "다 나온" 모습이다.
//
// 영상으로 만들 때는 브라우저가 틀어 주지 않으므로, 같은 규칙에서 "그 순간의 모습"을 직접 계산한다(enterPose · transitionPose).
// 키프레임(화면용)과 모습(영상용)이 같은 표(ENTER_DEFS · TRANSITION_DEFS)에서 나오므로 둘이 어긋나지 않는다.

const SOFT = 'cubic-bezier(.2, .8, .2, 1)';

// 효과 하나: ms(길이) · ease · frames(차례대로의 모습).
// frame: x · y(카드 너비를 100 으로 본 거리만큼 옮긴 자리) · k(크기 배율) · r(더 돌린 각도) · o(투명도 0~1. 요소의 투명도에 곱한다)
//        clip(오른쪽에서 가린 정도 0~100) · at(0~1 사이의 때) · ease(다음 frame 까지의 빠르기)
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
};
// 강조 효과: 나타난 뒤에 누르면 한 번 움직이고 제 모습으로 돌아온다. 처음과 끝이 늘 제 모습이다(frames 의 꼴은 ENTER_DEFS 와 같다).
const EMPH_DEFS = {
  pulse: { name: '두근두근', ms: 760, ease: 'ease-in-out', frames: [{}, { at: 0.25, k: 1.12 }, { at: 0.5, k: 1 }, { at: 0.75, k: 1.12 }, {}] },
  shake: { name: '흔들기', ms: 620, ease: 'linear', frames: [{}, { at: 0.14, x: -2 }, { at: 0.3, x: 2 }, { at: 0.46, x: -2 }, { at: 0.62, x: 2 }, { at: 0.8, x: -1 }, {}] },
  grow: { name: '커졌다 돌아오기', ms: 820, ease: 'ease-in-out', frames: [{}, { at: 0.45, k: 1.3 }, {}] },
  spin: { name: '한 바퀴', ms: 900, ease: 'ease-in-out', frames: [{}, { r: 360 }] },
  flash: { name: '반짝반짝', ms: 900, ease: 'linear', frames: [{}, { at: 0.2, o: 0.15 }, { at: 0.4, o: 1 }, { at: 0.6, o: 0.15 }, { at: 0.8, o: 1 }, {}] },
  jump: { name: '폴짝', ms: 680, ease: 'linear', frames: [{ ease: 'ease-out' }, { at: 0.35, y: -6, ease: 'ease-in' }, { at: 0.6, y: 0, ease: 'ease-out' }, { at: 0.78, y: -1.8, ease: 'ease-in' }, {}] },
};
/** 강조 효과들 [{ id, name }]. */
export const EMPHASES = Object.entries(EMPH_DEFS).map(([id, d]) => ({ id, name: d.name }));
export const EMPHASIS_IDS = EMPHASES.map((e) => e.id);
/** 요소가 나타나는 효과들 [{ id, name }] (고르는 칸에 이 차례로 나온다). */
export const ENTERS = Object.entries(ENTER_DEFS).map(([id, d]) => ({ id, name: d.name }));
export const ENTER_IDS = ENTERS.map((e) => e.id);
/** 요소에 적는 값: 효과의 id, 또는 'none'(조합 효과가 있어도 가만히). */
export const STILL = 'none';

// 조합 효과: 요소의 구실(바탕 · 글 · 그림)에 따라 다른 효과를 주고, 읽는 차례대로 조금씩 늦춰 튼다.
//   pick(role, item): 그 요소의 효과 · gap: 요소 사이의 간격(ms) · swing: 참이면 하나 걸러 하나씩 반대쪽에서 온다
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
};
/** 조합 효과들 [{ id, name, hint }]. */
export const COMBOS = Object.entries(COMBO_DEFS).map(([id, d]) => ({ id, name: d.name, hint: d.hint }));
export const COMBO_IDS = COMBOS.map((c) => c.id);

// 전환 효과: ms(길이) · ease(전체의 빠르기) · next(d) · old(d): 들어오는 장 · 나가는 장의 모습들(d 는 방향. 다음 장으로 1, 앞 장으로 -1).
// old 가 없으면 나가는 장은 가만히 있는다. 들어오는 장이 늘 위에 그려진다.
// 장의 모습(frame): x(옆으로 옮긴 거리. 카드 너비의 %) · k(크기 배율) · o(투명도) · turn(세로축으로 돌린 각도)
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
export function motionTransform(item, { x = 0, y = 0, k = 1, r = 0 } = {}) {
  const sx = (item?.fx ? -1 : 1) * k;
  const sy = (item?.fy ? -1 : 1) * k;
  return `translate(calc(-50% + ${round(x)}cqw), calc(-50% + ${round(y)}cqw)) rotate(${round((Number(item?.rot) || 0) + r)}deg) scale(${round(sx)}, ${round(sy)})`;
}

// 가리개: 오른쪽에서 clip% 만큼 가린다(왼쪽부터 드러난다). 테두리처럼 요소 칸 밖으로 조금 나온 것도 보이게 칸보다 넉넉히 잡는다.
// 가리개는 요소의 제 방향을 따라가므로, 좌우로 뒤집은 요소는 반대쪽(요소로 보면 왼쪽)을 가려야 화면에서 같은 쪽부터 드러난다.
/** 가리개의 네 쪽 [위, 오른쪽, 아래, 왼쪽](요소 칸의 %. 음수는 칸 밖으로 넉넉히). clip: 가린 정도 0~100. */
export function clipInsets(clip, flipped) {
  const cut = round(clip * 1.5 - 25);
  return flipped ? [-25, -25, -25, cut] : [-25, cut, -25, -25];
}
const clipOf = (clip, flipped) => `inset(${clipInsets(clip, flipped).map((v) => `${v}%`).join(' ')})`;

/**
 * 그 요소가 그 효과로 나타날 때의 키프레임. 모르는 효과면 null.
 *   scale: 거리의 배율(고르는 칸의 작은 본보기는 칸이 작아서 크게 준다) · mirror: 좌우를 뒤집어(오른쪽에서) 온다
 * 돌려주는 것: { keyframes, ms, easing }
 */
export function enterKeyframes(item, id, opts = {}) {
  return keyframesOf(ENTER_DEFS[id], item, opts);
}
/** 강조 효과의 키프레임(enterKeyframes 와 같은 꼴). 모르는 효과면 null. */
export function emphasisKeyframes(item, id, opts = {}) {
  return keyframesOf(EMPH_DEFS[id], item, opts);
}
function keyframesOf(def, item, { scale = 1, mirror = false } = {}) {
  if (!def) return null;
  const full = (Number.isFinite(item?.op) ? item.op : 100) / 100;
  const last = def.frames.length - 1;
  const clipped = def.frames.some((f) => f.clip != null);
  const keyframes = def.frames.map((f, i) => {
    const out = { transform: motionTransform(item, { x: (f.x || 0) * scale * (mirror ? -1 : 1), y: (f.y || 0) * scale, k: f.k ?? 1, r: (f.r || 0) * (mirror ? -1 : 1) }) };
    // 투명도는 적힌 때에만(사이의 것은 이어진다). 마지막은 늘 요소의 제 투명도다.
    if (f.o != null || i === last) out.opacity = round((f.o ?? 1) * full);
    if (clipped) out.clipPath = clipOf(f.clip || 0, !!item?.fx);
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
  if ((item.t === 'shape' || item.t === 'image' || item.t === 'art' || item.t === 'yt') && (item.w / 100) * (item.h / 100) >= 0.4) return BACK;
  return 'pic';
}

// 읽는 차례: 위에서 아래로(카드 세로의 9% 를 한 줄로 본다), 같은 줄에서는 왼쪽에서 오른쪽으로. 자리가 같으면 놓은 차례대로.
const readingOrder = (a, b) => Math.round(a.it.y / 9) - Math.round(b.it.y / 9) || a.it.x - b.it.x || a.i - b.i;

/**
 * 한 장의 움직임 차례를 정한다.
 * 돌려주는 것: {
 *   auto:   장이 열리면 저절로 나오는 것들 [{ i(요소 번호), enter, delay(ms), mirror }]
 *   clicks: 누를 때마다 하나씩 나오는 것들 [{ i, enter, mirror }] (읽는 차례대로)
 *   ms:     저절로 나오는 것이 모두 끝나는 때
 * }
 * 규칙: 요소에 효과(an)가 적혀 있으면 그것을, 아니면 조합 효과(pa)가 정해 준 것을 쓴다. an 이 'none' 이면 가만히 있는다.
 *       바탕은 맨 먼저 함께 나오고, 나머지는 읽는 차례대로 조금씩 늦게 나온다. 요소가 많으면 간격을 줄여 2초 안에 다 나온다.
 */
export function planMotion(design) {
  const items = Array.isArray(design?.items) ? design.items : [];
  const combo = COMBO_DEFS[design?.pa] || null;
  const rows = items.map((it, i) => ({ i, it, role: roleOf(it) })).filter((r) => r.it);
  // 연결선은 조합 효과에서 늘 닦아내듯(그려지듯) 나온다.
  const enterOf = (r) => (r.it.an === STILL ? null : ENTER_DEFS[r.it.an] ? r.it.an : combo ? (r.it.t === 'link' ? 'wipe' : combo.pick(r.role, r.it)) : null);
  const moving = rows.map((r) => ({ ...r, enter: enterOf(r) }));
  // 누를 때: 읽는 차례대로. "누를 때 나타나는" 요소는 나타나는 차례가 먼저, 강조 효과가 있으면 그다음 누를 때 강조한다.
  // (강조 단계에는 emphasis 가 있고 enter 는 없다. 숨겨 두는 것은 enter 가 있는 단계뿐이다.)
  const clicks = moving.filter((r) => r.it.aw === true || EMPH_DEFS[r.it.em]).sort(readingOrder)
    .flatMap((r, n) => [
      ...(r.it.aw === true ? [{ i: r.i, enter: r.enter || 'fade', mirror: !!combo?.swing && n % 2 === 1 }] : []),
      ...(EMPH_DEFS[r.it.em] ? [{ i: r.i, emphasis: r.it.em }] : []),
    ]);
  const shown = moving.filter((r) => r.it.aw !== true && r.enter);
  const backs = shown.filter((r) => r.role === BACK);
  const rest = shown.filter((r) => r.role !== BACK).sort(readingOrder);
  const gap = Math.min(combo?.gap ?? 120, rest.length > 1 ? 1500 / (rest.length - 1) : Infinity);
  const start = backs.length && rest.length ? 150 : 0;
  const auto = [
    ...backs.map((r) => ({ i: r.i, enter: r.enter, delay: 0, mirror: false })),
    ...rest.map((r, n) => ({ i: r.i, enter: r.enter, delay: Math.round(start + n * (Number.isFinite(gap) ? gap : 0)), mirror: !!combo?.swing && n % 2 === 1 })),
  ];
  const ms = auto.reduce((m, a) => Math.max(m, a.delay + ENTER_DEFS[a.enter].ms), 0);
  return { auto, clicks, ms };
}
/** 그 디자인에 움직임이 하나라도 있는지(슬라이드 띠에 표시할 때 쓴다). */
export function hasMotion(design) {
  if (!design) return false;
  if (TRANSITION_DEFS[design.tr] || COMBO_DEFS[design.pa]) return true;
  return (Array.isArray(design.items) ? design.items : []).some((it) => it && (ENTER_DEFS[it.an] || it.aw === true || EMPH_DEFS[it.em]));
}

// 장의 모습 하나를 화면용 키프레임으로 적는다.
function turnKeyframe(f) {
  const out = {};
  if (f.x != null) out.transform = `translateX(${f.x}%)`;
  else if (f.k != null) out.transform = `scale(${f.k})`;
  else if (f.turn != null) out.transform = `perspective(${TURN_DEPTH}px) rotateY(${f.turn}deg)`;
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
export function transitionFrames(id, dir = 1) {
  const def = TRANSITION_DEFS[id];
  if (!def) return null;
  const d = dir < 0 ? -1 : 1;
  return { ms: def.ms, easing: def.ease || TURN_EASE, next: def.next(d).map(turnKeyframe), old: def.old ? def.old(d).map(turnKeyframe) : null };
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
/** 그 전환이 두 장을 이어 움직이는 것인지. */
export const morphs = (id) => !!TRANSITION_DEFS[id]?.morph;

// ---------- 그 순간의 모습(영상으로 만들 때): 브라우저의 키프레임 계산을 그대로 따라 한다 ----------

const EASES = { linear: null, ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
const easeCache = new Map();
/** CSS 의 빠르기(이름 또는 cubic-bezier(…))를 0~1 → 0~1 함수로 바꾼다. 모르는 것은 한결같은 빠르기(linear)다. */
export function easeFn(css) {
  if (easeCache.has(css)) return easeCache.get(css);
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(String(css ?? '').trim());
  const p = m ? m[1].split(',').map(Number) : EASES[css];
  let fn = (x) => Math.min(1, Math.max(0, x));
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

/** 그 효과의 길이(ms). 모르는 효과면 0. */
export function enterTime(id) {
  return ENTER_DEFS[id]?.ms || 0;
}

/**
 * 요소가 그 효과로 나타나기 시작한 지 ms 가 지났을 때의 모습. 모르는 효과면 null.
 *   mirror: 좌우를 뒤집어(오른쪽에서) 온다 · scale: 거리의 배율
 * 돌려주는 것: { x · y(옮긴 거리. 카드 너비를 100 으로 본 값) · k(크기 배율) · r(더 돌린 각도) · o(투명도 배율 0~1) · clip(가린 정도 0~100) · done(다 나왔는지) }
 * ms 가 0 보다 작으면(아직 차례가 아니면) 처음 모습, 길이를 넘으면 다 나온 모습이다. enterKeyframes 를 브라우저가 틀었을 때와 같은 값이다.
 */
export function enterPose(id, ms, opts = {}) {
  return poseOf(ENTER_DEFS[id], ms, opts);
}
/** 강조 효과가 시작한 지 ms 가 지났을 때의 모습(enterPose 와 같은 꼴. 시작 전과 끝난 뒤는 제 모습). 모르는 효과면 null. */
export function emphasisPose(id, ms, opts = {}) {
  return poseOf(EMPH_DEFS[id], Math.max(0, ms), opts);
}
/** 강조 효과의 길이(ms). 모르는 효과면 0. */
export function emphasisTime(id) {
  return EMPH_DEFS[id]?.ms || 0;
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
    r: sample(every((f) => (f.r || 0) * flip), p) + 0,
    o: sample(seen, p),
    clip: def.frames.some((f) => f.clip != null) ? sample(every((f) => f.clip || 0), p) : 0,
    done: ms >= def.ms,
  };
}

/**
 * 전환 효과가 시작한 지 ms 가 지났을 때 두 장의 모습. 모르는 효과면 null.
 * 돌려주는 것: { ms(길이), done, next(들어오는 장), old(나가는 장. 가만히 있으면 null) }
 *   장의 모습: { x(옆으로 옮긴 거리. 카드 너비의 %) · k · o · turn(도) · inset([위, 오른쪽, 아래, 왼쪽] % 또는 null) · circle(% 또는 null) }
 */
export function transitionPose(id, dir = 1, ms = 0) {
  const def = TRANSITION_DEFS[id];
  if (!def) return null;
  const p = easeFn(def.ease || TURN_EASE)(unit(ms / def.ms));
  const pose = (frames) => {
    const at = offsetsOf(frames);
    const flow = (key) => frames.map((f, i) => ({ at: at[i], v: f[key], ease: f.ease })).filter((x) => x.v != null);
    const value = (key, rest, mix) => { const points = flow(key); return points.length ? sample(points, p, mix) : rest; };
    return { x: value('x', 0), k: value('k', 1), o: value('o', 1), turn: value('turn', 0), inset: value('inset', null, mixList), circle: value('circle', null) };
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
  const k = enterKeyframes(item, id, { scale, mirror });
  if (!k || !node || typeof node.animate !== 'function' || calm()) return null;
  return node.animate(k.keyframes, { duration: k.ms, delay, easing: k.easing, fill: 'backwards' });
}

/** 요소 하나를 강조 효과로 한 번 움직인다(끝나면 흔적이 없다). 틀지 못했으면 null. */
export function playEmphasis(node, item, id) {
  const k = emphasisKeyframes(item, id);
  if (!k || !node || typeof node.animate !== 'function' || calm()) return null;
  return node.animate(k.keyframes, { duration: k.ms, easing: k.easing });
}

/**
 * 한 장의 움직임을 튼다. card 는 그 디자인을 그린 카드(designView), design 은 그 디자인(정리된 것: 카드의 요소와 차례가 같아야 한다).
 *   delay: 시작을 늦춘다(전환 효과가 끝난 뒤에 시작할 때) · still: 참이면 움직이지 않고 다 나온 모습으로 둔다(앞 장으로 돌아갈 때)
 * 돌려주는 것(조종기): {
 *   left():   아직 누르지 않아 숨어 있는 것의 수
 *   next():   숨어 있는 것을 하나 나타나게 한다. 나타나게 했으면 true, 더 없으면 false
 *   finish(): 틀고 있는 움직임을 끝까지 넘긴다(숨어 있는 것은 그대로)
 *   reveal(): 숨어 있는 것을 모두 보이게 하고 움직임도 끝낸다
 * }
 */
export function playDesign(card, design, { delay = 0, still = false } = {}) {
  const nodes = card ? [...card.children].filter((n) => n.classList.contains('fi')) : [];
  const items = Array.isArray(design?.items) ? design.items : [];
  const plan = still ? { auto: [], clicks: [] } : planMotion(design);
  const running = [];
  const keep = (a) => { if (a) { running.push(a); a.finished.catch(() => {}); } };
  // 이어 움직이기로 앞 장에서 옮겨 온 요소는 이미 화면에 있으므로 다시 나타나지 않는다(누를 때 나오는 것은 그대로 기다린다).
  for (const a of plan.auto) if (!nodes[a.i]?.dataset.moved) keep(playEnter(nodes[a.i], items[a.i], a.enter, { delay: delay + a.delay, mirror: a.mirror }));
  const waiting = plan.clicks.filter((c) => nodes[c.i]);
  for (const c of waiting) if (c.enter) nodes[c.i].style.visibility = 'hidden';
  const show = (c, animate) => {
    if (c.emphasis) { if (animate) keep(playEmphasis(nodes[c.i], items[c.i], c.emphasis)); return; }
    nodes[c.i].style.visibility = '';
    if (animate) keep(playEnter(nodes[c.i], items[c.i], c.enter, { mirror: c.mirror }));
  };
  const finish = () => { for (const a of running.splice(0)) { try { a.finish(); } catch { /* 이미 끝났다 */ } } };
  return {
    left: () => waiting.length,
    next() {
      const c = waiting.shift();
      if (!c) return false;
      show(c, true);
      return true;
    },
    finish,
    reveal() {
      for (const c of waiting.splice(0)) show(c, false);
      finish();
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
  const f = transitionFrames(id, dir);
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

// 옮겨 가는 요소는 transform 하나로만 움직인다(FLIP: 앞 장의 자리·크기·각도에서 제자리로). 자리·크기를 left·width 로 바꾸면
// 프레임마다 화면을 다시 짜야 해서 끊기지만, transform·opacity 는 그래픽 장치가 맡아 매끄럽다. 글은 옮기는 동안만 크기가 늘고 줄며, 끝나면 제 글자로 또렷하다.
// 두 장은 같은 크기로 겹쳐 있으므로 화면에서 잰 가운데 점의 차이를 그대로 옮긴 거리로 쓴다(돌린 요소도 가운데 점은 그대로다).
const centerOf = (node) => { const r = node.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const morphTransform = (dx, dy, item, sx, sy) => `translate(${round(dx)}px, ${round(dy)}px) translate(-50%, -50%) rotate(${round(Number(item?.rot) || 0)}deg) scale(${round((item?.fx ? -1 : 1) * sx)}, ${round((item?.fy ? -1 : 1) * sy)})`;
function morphFrames(oldNode, newNode, oldItem, newItem) {
  const [ox, oy] = centerOf(oldNode), [nx, ny] = centerOf(newNode);
  const sx = newNode.offsetWidth ? oldNode.offsetWidth / newNode.offsetWidth : 1;
  const sy = newNode.offsetHeight ? oldNode.offsetHeight / newNode.offsetHeight : 1;
  const a = getComputedStyle(oldNode), b = getComputedStyle(newNode);
  const start = { transform: morphTransform(ox - nx, oy - ny, oldItem, sx, sy), opacity: a.opacity };
  const end = { transform: morphTransform(0, 0, newItem, 1, 1), opacity: b.opacity };
  if (a.color !== b.color) { start.color = a.color; end.color = b.color; }
  if (a.backgroundColor !== b.backgroundColor) { start.backgroundColor = a.backgroundColor; end.backgroundColor = b.backgroundColor; }
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
  const pairs = matchItems(from.items, to.items).filter(([i, j]) => was[i] && now[j]);
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
