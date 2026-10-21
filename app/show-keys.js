// 발표 화면의 글쇠 약속. 온바탕 안의 발표와 내려받은 HTML 수업이 똑같이 쓴다(화면을 모르는 순수한 함수).
// 글자 글쇠는 자리(e.code)로 견준다: 한글 입력 상태에서도 듣게.
//   다음: → ↓ PageDown Space Enter N   앞: ← ↑ PageUp Backspace
//   처음·끝: Home End   번호 + Enter: 그 쪽으로   B 검은 화면 · W 흰 화면(PowerPoint 처럼 . , 도)
//   G 전체 보기   P 펜   L 레이저   E 그린 것 지우기   S 발표자 화면   K 영상 멈추기·틀기   ? H 도움말   Esc 끝내기
export const SHOW_KEYS = Object.freeze([
  ['→ · Space · PageDown', '다음'],
  ['← · PageUp', '앞'],
  ['Home · End', '처음 · 마지막 쪽'],
  ['번호 + Enter', '그 쪽으로 가기'],
  ['G', '전체 보기'],
  ['B · W', '검은 화면 · 흰 화면'],
  ['P · L · E', '펜 · 레이저 · 지우기'],
  ['S', '발표자 화면(노트 · 다음 쪽 · 시간)'],
  ['K', '영상 멈추기 · 틀기'],
  ['Esc', '도구 끄기 · 발표 끝내기'],
]);
const LETTERS = { KeyB: 'black', Period: 'black', KeyW: 'white', Comma: 'white', KeyG: 'overview', KeyP: 'pen', KeyL: 'laser', KeyE: 'erase', KeyS: 'presenter', KeyK: 'video', KeyH: 'help', Slash: 'help' };
const NEXT = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'];
const PREV = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];
const digitOf = (e) => /^Digit[0-9]$/.test(e.code) ? e.code.slice(5) : /^Numpad[0-9]$/.test(e.code) ? e.code.slice(6) : /^[0-9]$/.test(e.key) ? e.key : '';

/**
 * 글쇠 하나를 발표의 할 일로 바꾼다. state 는 치고 있는 번호({ digits })를 들고 다니는 상자(이 함수가 고친다).
 * 돌려주는 것: { type } — next · prev · first · last · goto(page: 1부터) · digits(value) · black · white · overview · pen · laser · erase · presenter · video · help · close
 * 발표와 상관없는 글쇠(Ctrl·Alt·Cmd 를 함께 누른 것 포함)는 null.
 */
export function showAction(e, state = {}) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
  const digit = digitOf(e);
  if (digit && !e.shiftKey) {
    state.digits = `${state.digits || ''}${digit}`.slice(-3);
    return { type: 'digits', value: state.digits };
  }
  const typed = state.digits || '';
  state.digits = '';
  if (e.key === 'Enter' && typed) return Number(typed) > 0 ? { type: 'goto', page: Number(typed) } : { type: 'digits', value: '' };
  if (e.key === 'Escape') return typed ? { type: 'digits', value: '' } : { type: 'close' };
  if (e.key === 'Home') return { type: 'first' };
  if (e.key === 'End') return { type: 'last' };
  if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) return { type: 'help' };
  if (NEXT.includes(e.key) || e.code === 'KeyN') return { type: 'next' };
  if (PREV.includes(e.key)) return { type: 'prev' };
  const letter = LETTERS[e.code];
  return letter && !e.shiftKey ? { type: letter } : null;
}

/** 번호로 간 쪽을 목록 안의 자리(0부터)로. 넘치면 처음·마지막으로 붙인다. */
export const pageIndex = (page, total) => Math.max(0, Math.min(total - 1, Math.round(page) - 1));

/** 누른 곳에서 뗀 곳까지 움직인 만큼이 넘기는 손짓인지: 1 다음 · -1 앞 · 0 아니다(누르기·세로로 민 것). */
export function swipeStep(dx, dy, min = 48) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

/** 발표 시간(ms)을 0:00 · 1:02:03 꼴로. */
export function showClock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000)), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
