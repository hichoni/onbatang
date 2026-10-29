// 한 장의 효과가 아니라, 전체 → 집중 → 다음 주제 → 전체를 잇는 움직임 묶음.
// 기존 움직임 계약(tr/pa, an/lp/sp)만 사용한다. 발표·HTML 수업·영상은 같은 런타임으로 재생한다.
// 원본 자료에 적용할 때 내용/배치/이름표/출처는 건드리지 않고 새 값을 돌려준다.
import { newId } from '../src/document.js';

const STAGES = Object.freeze(['전체 보기', '첫 번째 주제', '두 번째 주제', '세 번째 주제', '다시 한눈에']);
export const MOTION_SETS = Object.freeze([
  { id: 'atlas', name: '이야기 지도', hint: '세 주제를 한눈에 보고, 하나씩 크게 들어갔다 다시 모여요.', combo: 'fade', idle: 'breathe', colors: ['#eaf4ef', '#246e61', '#d5e9df', '#f1be69'], stages: STAGES },
  { id: 'orbit', name: '생각의 궤도', hint: '작은 생각들이 모여 중심으로 오고 다음 생각에 자리를 넘겨요.', combo: 'ripple', idle: 'float', colors: ['#151f3c', '#aebdff', '#34436f', '#f5cd82'], stages: STAGES },
  { id: 'ribbon', name: '한 줄의 여정', hint: '과정의 위치를 계속 보며 다음 단계로 이어 가요.', combo: 'cascade', idle: 'none', colors: ['#fff6e8', '#9a5038', '#f3d5bb', '#e6a149'], stages: STAGES },
  { id: 'focus', name: '관찰의 렌즈', hint: '비교하던 세 장면 중 하나를 확대해 살피고 다시 비교해요.', combo: 'cinema', idle: 'breathe', colors: ['#edf2f8', '#30516f', '#cddce9', '#bd664e'], stages: STAGES },
  { id: 'stage', name: '주인공의 무대', hint: '세 이야기의 주인공을 한 명씩 앞으로 데려와요.', combo: 'kinetic', idle: 'breathe', colors: ['#2c2035', '#ffe6c2', '#5a395e', '#f4ba72'], stages: STAGES },
  { id: 'breath', name: '숨 쉬는 연결', hint: '내용은 차분하게, 작은 상징만 숨 쉬며 다음 장으로 이어져요.', combo: 'fade', idle: 'breathe', colors: ['#f5f3ee', '#355a55', '#dce8df', '#d8ac64'], stages: STAGES },
].map(set => Object.freeze({ ...set, colors: Object.freeze(set.colors) })));

const motionKeys = ['an', 'aw', 'em', 'ex', 'lp', 'sp', 'dl'];
const optionValues = (raw = {}) => ({
  speed: ['slow', 'fast'].includes(raw.speed) ? raw.speed : '',
  breathing: raw.breathing !== false,
  calm: raw.calm === true,
});
const findSet = id => {
  const set = MOTION_SETS.find(value => value.id === id);
  if (!set) throw new RangeError('움직임 묶음을 골라 주세요.');
  return set;
};

/** 기존 자료에 적용. 배열/각 장/요소는 새 객체이며, 모션 이외의 값과 순서·식별자는 그대로다. */
export function applyMotionSet(slides, id, options = {}) {
  const set = findSet(id), opts = optionValues(options);
  if (!Array.isArray(slides)) throw new TypeError('슬라이드 목록이 필요해요.');
  return slides.map(slide => {
    if (!slide || !Array.isArray(slide.items)) throw new TypeError('슬라이드 내용을 확인해 주세요.');
    let ornament = 0;
    const items = slide.items.map(item => {
      // 앱·연결선·영상·수식의 동작은 이 묶음으로 바꾸지 않는다.
      if (!item || !['text', 'shape', 'art', 'emoji', 'image'].includes(item.t)) return { ...item };
      const next = { ...item };
      motionKeys.forEach(key => delete next[key]);
      if (opts.calm) next.an = 'fade';
      next.lp = 'none';
      if (opts.speed) next.sp = opts.speed;
      // 읽어야 할 본문/사진 전체를 흔들지 않고 작은 그림 조각 최대 세 개만 살아 있게 한다.
      if (!opts.calm && opts.breathing && set.idle !== 'none'
        && !item.lock && ['shape', 'art', 'emoji'].includes(item.t) && Number(item.w) <= 36 && ornament++ < 3) next.lp = set.idle;
      return next;
    });
    return { ...slide, pa: opts.calm ? 'fade' : set.combo, tr: opts.calm ? 'fade' : 'move', items };
  });
}

// 좌표는 장에 대한 백분율. 원·글의 크기는 원본 비율을 바꾸지 않고 정한다.
function positions(kind, active, aspect) {
  const overview = active < 0;
  const initial = {
    atlas: [[20, 55, 25, 36], [50, 55, 25, 36], [80, 55, 25, 36]],
    orbit: [[22, 55, Math.min(20, 34 / aspect), Math.min(20 * aspect, 34)], [50, 48, Math.min(20, 34 / aspect), Math.min(20 * aspect, 34)], [78, 60, Math.min(20, 34 / aspect), Math.min(20 * aspect, 34)]],
    ribbon: [[18, 40, Math.min(12, 20 / aspect), Math.min(12 * aspect, 20)], [18, 58, Math.min(12, 20 / aspect), Math.min(12 * aspect, 20)], [18, 76, Math.min(12, 20 / aspect), Math.min(12 * aspect, 20)]],
    focus: [[21, 56, 24, 34], [50, 56, 24, 34], [79, 56, 24, 34]],
    stage: [[23, 58, 23, 37], [50, 52, 23, 37], [77, 58, 23, 37]],
    breath: [[22, 56, Math.min(20, 36 / aspect), Math.min(36, 20 * aspect)], [50, 56, Math.min(20, 36 / aspect), Math.min(36, 20 * aspect)], [78, 56, Math.min(20, 36 / aspect), Math.min(36, 20 * aspect)]],
  }[kind];
  if (overview) return initial;
  let others = 0;
  return initial.map((_, index) => {
    const isActive = index === active;
    if (kind === 'focus') return isActive ? [50, 53, 72, 46] : [[20, 83, 15, 10], [80, 83, 15, 10]][others++];
    if (kind === 'stage') return isActive ? [50, 57, 72, 44] : [[19, 27, 13, 13], [81, 27, 13, 13]][others++];
    if (kind === 'orbit') return isActive ? [58, 57, Math.min(40, 48 / aspect), Math.min(40 * aspect, 48)] : [[14, 41, Math.min(12, 22 / aspect), Math.min(12 * aspect, 22)], [14, 76, Math.min(12, 22 / aspect), Math.min(12 * aspect, 22)]][others++];
    if (kind === 'breath') return isActive ? [57, 55, Math.min(42, 48 / aspect), Math.min(42 * aspect, 48)] : [[13, 42, Math.min(11, 20 / aspect), Math.min(11 * aspect, 20)], [13, 75, Math.min(11, 20 / aspect), Math.min(11 * aspect, 20)]][others++];
    if (kind === 'ribbon') return isActive ? [59, 57, 62, 40] : [[12, 39, 10, 12], [12, 75, 10, 12]][others++];
    return isActive ? [59, 56, 58, 43] : [[14, 39, 17, 15], [14, 75, 17, 15]][others++];
  });
}

/**
 * 완성된 5장 예제. 각 장의 요소 ID는 모두 다르고, origin.elementId로 같은 상징을 계속 잇는다.
 * topics는 교사가 바꿀 세 주제의 예시 글. 순서를 바꾸려면 topics의 차례를 정하면 된다.
 * 원본 데이터/외부 그림/계정/새 스키마를 쓰지 않는다. 넣은 후 모두 개별 편집 가능하다.
 */
export function createMotionSequence(id, options = {}) {
  const set = findSet(id), opts = optionValues(options);
  const aspect = Number(options.aspect) >= 0.25 && Number(options.aspect) <= 4 ? Number(options.aspect) : 16 / 9;
  const labels = [0, 1, 2].map(index => {
    const raw = options.topics?.[index];
    return typeof raw === 'string' && raw.trim() ? Array.from(raw.trim()).slice(0, 14).join('') : ['질문을 열어요', '함께 살펴봐요', '생각을 나눠요'][index];
  });
  const dark = ['orbit', 'stage'].includes(id), ink = set.colors[1], accent = set.colors[3];
  const seeds = new Map();
  const identify = (role, raw, page) => {
    const key = newId('e');
    if (!seeds.has(role)) seeds.set(role, key);
    return { ...raw, id: key, ...(page > 0 ? { origin: { elementId: seeds.get(role) } } : {}) };
  };
  // 작은 비율에서도 제목/본문이 서로 겹치지 않게 읽을 크기와 폭을 함께 조정한다.
  const textSize = value => Math.min(value, value / Math.max(1, aspect / (16 / 9)));
  const text = (value, x, y, w, size, more = {}) => ({ t: 'text', text: value, x, y, w, size: textSize(size), color: ink, align: 'c', ...more });
  const stages = [-1, 0, 1, 2, -1];
  return stages.map((active, page) => {
    const final = page === stages.length - 1, whole = active < 0;
    const places = positions(id, active, aspect);
    const nodes = [];
    const add = (role, raw) => nodes.push(identify(role, raw, page));
    add('heading', text(set.name, 50, 11, 80, 3.2, { bold: true }));
    add('title', text(whole ? final ? '다시 연결해 보세요' : '오늘의 이야기를 한눈에' : labels[active], 50, 23, 82, whole ? 5.4 : 5.1, { bold: true }));
    if (id === 'ribbon') add('path', { t: 'shape', shape: 'rect', x: 18, y: 57, w: 0.8, h: 48, color: set.colors[2], lock: true });
    places.forEach(([x, y, w, h], index) => {
      const selected = !whole && index === active;
      const circle = ['orbit', 'breath'].includes(id) || (id === 'ribbon' && whole);
      add(`node-${index}`, { t: 'shape', shape: circle ? 'circle' : 'round', x, y, w, h, color: selected ? accent : set.colors[2], r: 18,
        ...(opts.breathing && !opts.calm && set.idle !== 'none' ? { lp: set.idle } : { lp: 'none' }), an: 'none', ...(opts.speed ? { sp: opts.speed } : {}) });
      const sideCaption = id === 'ribbon' && whole;
      const labelX = sideCaption ? 55 : x;
      const labelW = sideCaption ? 56 : Math.max(9, w - (selected ? 7 : 3));
      const labelSize = selected ? 4.2 : whole ? 3.25 : 2.6;
      add(`label-${index}`, text(whole || selected ? labels[index] : String(index + 1), labelX, y, labelW, labelSize,
        { color: dark ? '#ffffff' : ink, bold: true, an: 'none', lp: 'none' }));
    });
    // 설명의 역할만 공유하므로 앞뒤 문장은 겹치지 않고 자연스럽게 바뀐다.
    add('caption', text(whole ? final ? '세 주제의 연결을 내 말로 정리해 보세요.' : '앞으로 넘기면 같은 조각이 커지며 이어져요.' : '글·도형을 눌러 내 이야기로 바꿔 보세요.', 50, whole ? 84 : 92, 82, 2.6, { color: dark ? '#d7d9e6' : '#65716d', an: 'fade', lp: 'none' }));
    for (let dot = 0; dot < 5; dot++) add(`progress-${dot}`, { t: 'shape', shape: 'circle', x: 44 + dot * 3, y: 97, w: 0.9, h: 0.9 * aspect, color: dot === page ? accent : set.colors[2], an: 'none', lp: 'none' });
    return { id: newId('p'), bg: set.colors[0], tr: opts.calm ? 'fade' : 'move', pa: opts.calm ? 'fade' : set.combo, topic: page === 0 ? set.name : '',
      notes: `${set.stages[page]} · ${set.hint}\n이 장의 글과 도형은 직접 고칠 수 있어요. 다음 장으로 넘길 때 같은 조각이 이어져요.`, items: nodes };
  });
}
