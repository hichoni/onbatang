// 온바탕 사용법 안내: 화면의 한 부분을 밝게 비추고(나머지는 어둡게), 옆의 안내 카드가 하나씩 설명한다.
// 한 단계는 5초 뒤에 저절로 넘어가고(모래시계), 화면을 직접 만지면 잠시 멈춘다. 비춘 부분은 그대로 눌러 볼 수 있다.
// 안내는 화면만 보여 준다. 그림을 저장하거나 바꾸지 않는다.
import { el } from './ui.js';
import { onbatangAsset } from './brand.js';

const STEP_MS = 5000;
const SEEN = 'onbatang-tour-seen-v1:';

/** 첫 화면의 안내 */
export const HOME_STEPS = [
  { target: '.cv-cta', title: '새 디자인을 시작해요', text: '빈 장에서 시작해요. 카드·포스터·발표 자료를 만들 수 있고, 모양(정사각형·세로·가로·길게)은 꾸미면서 바꿔요.', tip: '만든 그림은 이 기기에 저절로 저장되고, 새로 고쳐도 그대로예요' },
  { target: '.cv-starts', title: '틀로 빠르게', text: '마음에 드는 표지를 누르면 바로 꾸미는 화면이 열려요. 주제 틀과 기본 짜임 중에서 골라요.', tip: '꾸미는 중에도 틀 칸에서 장을 더할 수 있어요' },
  { target: '.cv-mine', title: '내 그림', text: '만든 그림이 여기에 모여요. 눌러서 이어 꾸미고, 필요 없는 그림은 지워요.', tip: '그림은 최근에 고친 차례로 보여요' },
];

// 꾸미는 화면의 안내와 새 기능 안내가 함께 쓰는 단계들
const LINK_STEP = { target: '.fe-stage', title: '연결선으로 잇기', text: '두 조각을 Shift로 함께 고르고 위 막대의 "연결선"을 누르면 화살표로 이어요. 선을 누르면 곧게·둥글게·꺾어서와 붙는 곳(↑→↓←)을 골라요.', tip: '선 가운데의 동그란 손잡이를 끌면 휘는 정도·꺾이는 자리가 바뀌어요' };
const SHOW_STEP = { target: '.cv-show-btn', title: '발표하기', text: '화면 가득 한 장씩 보여 줘요. 스페이스 바나 → 로 넘기고 Esc 로 끝내요. G 전체 보기 · C 내 얼굴 카메라 · A 자동 넘기기 · R 리허설(장마다 시간 재기).', tip: '발표 중 ? 를 누르면 글쇠 목록이 나와요' };
const DOWN_STEP = { target: '.cv-down-btn', title: '내려받기', text: 'PNG·JPG 그림, PDF(노트·유인물), PPTX, 영상, GIF, HTML 수업으로 내려받아요. 저장할 장과 옵션을 확인한 뒤 내려받기를 눌러요.', tip: '영상과 GIF에도 이어 움직이기가 그대로 나와요' };
const SAVE_STEP = { target: '.cv-status', title: '저절로 저장돼요', text: '고칠 때마다 이 기기(이 브라우저)에 저장되고, 새로 고쳐도 꾸미던 그림·장이 다시 열려요. 다른 기기에는 없으니 다 만든 그림은 내려받아 두세요.', tip: '사용법은 ? 단추로 언제든 다시 볼 수 있어요' };

/** 꾸미는 화면의 안내. view: 그 단계에서 옆 칸에 펼칠 도구(편집기의 칸 이름) */
export const EDITOR_STEPS = [
  { target: '.fe-tabs', view: 'layout', title: '왼쪽 도구 줄', text: '틀 · 글 · 꾸미기 · 내 자료 · 바탕색 · 겹 순서 · 움직임을 여기서 골라요. 고른 도구를 한 번 더 누르면 옆 칸이 접혀서 그림이 넓어져요.' },
  { target: '.cv-side', view: 'text', title: '글 넣기', text: '큰 제목 · 작은 제목 · 이야기 글 중에서 눌러 넣어요. 카드의 글을 두 번 누르면 바로 고칠 수 있어요.', tip: '글꼴·크기·색은 위쪽 도구 막대에서' },
  { target: '.cv-side', view: 'element', title: '꾸미기: 도형과 그림 1,000개', text: '도형, 선, 컬러 그림, 선 아이콘, 픽셀 그림, 사람 그림을 넣어요. "동물", "날씨"처럼 낱말로 찾을 수 있어요.', tip: '선 아이콘과 픽셀은 색도 바꿀 수 있어요' },
  { target: '.cv-side', view: 'upload', title: '내 자료: 사진과 유튜브', text: '내 사진을 올리고, 유튜브 주소를 붙여 넣으면 영상이 카드에 들어가요. 영상은 발표할 때 스페이스 바로 틀고 멈춰요.', tip: '꾸미기 판에서 Ctrl+V 로 유튜브 주소를 붙여 넣어도 돼요' },
  { target: '.fe-stage', title: '카드에서 바로 꾸며요', text: '모서리를 끌면 반대편은 그대로 두고 크기를 바꿔요. Shift는 비율 유지, Ctrl은 중심 기준이에요. 방향키로 1px, Shift+방향키로 10px 옮겨요.', tip: 'Shift 누르기로 여럿 고르기 · Ctrl+D 복제 · Ctrl+Z 실행 취소' },
  LINK_STEP,
  { target: '.cv-side', view: 'motion', optional: true, title: '움직임', text: '조각이 나타나는 효과, 장이 넘어가는 효과, 누를 때 강조(두근두근·흔들기 등)를 골라요. "이어 움직이기"는 같은 조각을 새 자리로 부드럽게 옮겨요.', tip: '"모든 장에 똑같이"로 한 번에 맞추기' },
  { target: '.cv-strip', title: '여러 장 만들기', text: '"새 장"으로 장을 더하고, 끌어서 순서를 바꿔요. 장을 오른쪽 클릭(길게 누르기)하면 복제 · 발표에서 숨기기 · 여기서 주제 시작이 있어요.', tip: '빈 곳을 오른쪽 클릭하면 찾아 바꾸기도 있어요' },
  { target: '.cv-shapes', title: '모양 바꾸기', text: '정사각형·세로·가로·길게 중에서 골라요. 놓아 둔 것들은 찌그러지지 않게 맞춰 줘요.' },
  SHOW_STEP,
  DOWN_STEP,
  SAVE_STEP,
];

/**
 * 새로 생긴 기능의 안내. 꾸미는 화면의 안내를 이미 본 기기에서, 새 기능이 들어온 뒤 처음 꾸미는 화면을 열 때 한 번 보여 준다
 * (처음 온 기기는 위의 안내에 같은 내용이 들어 있으니 이것을 따로 보여 주지 않는다). 새 기능을 더하면 NEWS_KEY 를 바꾼다.
 */
export const NEWS_KEY = 'news-0.44';
export const NEWS_STEPS = [
  LINK_STEP,
  { target: '.cv-side', view: 'motion', optional: true, title: '이어 움직이기 · 강조', text: '장 넘기기 효과에서 "이어 움직이기"를 고르면 앞 장과 같은 조각이 자리·크기·색을 이어 부드럽게 옮겨 가요. 누를 때 강조로 조각을 한 번 움직여요.', tip: '앞 장을 복제한 뒤 조각을 옮기면 쉬워요' },
  { target: '.cv-strip', title: '장 숨기기 · 주제', text: '장을 오른쪽 클릭(길게 누르기)해서 발표에서 숨기거나, 여기서 주제를 시작해요. 주제는 발표 중 전체 보기(G)에서 묶여 확대돼요.', tip: '빈 곳 오른쪽 클릭: 찾아 바꾸기' },
  SHOW_STEP,
  DOWN_STEP,
  SAVE_STEP,
];

const hourglass = '<svg class="onba-tour-glass" viewBox="0 0 24 28" aria-hidden="true"><path class="sand-top" d="M5 5h14l-7 8z"/><path class="sand-bottom" d="m12 17 7 6H5z"/><path class="sand-stream" d="M12 12v7"/><path class="frame" d="M3 2h18M3 26h18M5 2v5c0 3 7 5 7 7S5 18 5 21v5M19 2v5c0 3-7 5-7 7s7 4 7 7v5"/></svg>';

let running = null;
/** 열린 안내를 닫는다. */
export function stopTour() { running?.(); running = null; }

/**
 * 안내를 연다. steps: 단계들 · show(view): 그 단계의 도구 칸을 펼친다 · title: 안내 카드 위쪽의 이름.
 * 돌려주는 것: 닫는 함수.
 */
export function startTour({ steps, show = () => {}, title = '온바탕 둘러보기' }) {
  stopTour();
  if (!steps?.length) return () => {};
  let index = 0, auto = true, remaining = STEP_MS, deadline = 0, timer = 0, target = null, closed = false, revision = 0, direction = 1;
  const reduced = () => matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const before = document.activeElement;
  const ctl = new AbortController();
  const { signal } = ctl;
  // 어둡게 덮는 네 조각 + 밝게 비춘 틀. 비춘 자리는 덮지 않아서 그대로 눌러 볼 수 있다.
  const shade = el('div', { class: 'onba-tour-shade', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'), el('i'), el('b'));
  const card = el('section', { class: 'onba-tour', role: 'dialog', 'aria-label': title, tabindex: '-1' });
  document.body.append(shade, card);
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    ctl.abort();
    shade.remove();
    card.remove();
    if (before?.isConnected) before.focus?.({ preventScroll: true });
    if (running === close) running = null;
  };
  running = close;

  const place = () => {
    if (closed || !target) return;
    const r = target.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, pad = 6;
    const x = Math.min(vw - 6, Math.max(6, r.left - pad)), y = Math.min(vh - 6, Math.max(6, r.top - pad));
    const right = Math.max(x, Math.min(vw - 6, r.right + pad)), bottom = Math.max(y, Math.min(vh - 6, r.bottom + pad));
    const parts = [[0, 0, vw, y], [0, y, x, bottom - y], [right, y, vw - right, bottom - y], [0, bottom, vw, vh - bottom]];
    [...shade.querySelectorAll(':scope > i')].forEach((n, i) => {
      const [l, t, w, h] = parts[i];
      Object.assign(n.style, { left: `${l}px`, top: `${t}px`, width: `${Math.max(0, w)}px`, height: `${Math.max(0, h)}px` });
    });
    Object.assign(shade.querySelector('b').style, { left: `${x}px`, top: `${y}px`, width: `${right - x}px`, height: `${bottom - y}px` });
    const w = Math.min(380, vw - 24);
    card.style.width = `${w}px`;
    const h = card.offsetHeight;
    // 비춘 자리의 오른쪽 → 왼쪽 → 아래 → 위 차례로 들어갈 자리를 찾는다. 없으면(휴대폰) 화면 아래에 둔다.
    const spots = [[right + 14, y], [x - w - 14, y], [Math.min(x, vw - w - 12), bottom + 14], [Math.min(x, vw - w - 12), y - h - 14]];
    const spot = spots.find(([l, t]) => l >= 12 && t >= 12 && l + w <= vw - 12 && t + h <= vh - 12) || [vw - w - 12, vh - h - 12];
    Object.assign(card.style, { left: `${Math.max(12, spot[0])}px`, top: `${Math.max(12, spot[1])}px` });
  };
  const paintTimer = () => {
    const left = auto ? Math.max(0, deadline - performance.now()) : remaining;
    card.style.setProperty('--onba-tour-left', String(left / STEP_MS));
    card.classList.toggle('playing', auto);
    const label = card.querySelector('[data-timer]');
    if (label) label.textContent = auto ? `${Math.ceil(left / 1000)}초 뒤 ${index === steps.length - 1 ? '마침' : '다음'}` : '잠시 멈춤';
    const btn = card.querySelector('[data-auto]');
    if (btn) { btn.textContent = auto ? 'Ⅱ 멈추기' : '▶ 이어 보기'; btn.setAttribute('aria-pressed', String(auto)); }
  };
  const pause = () => {
    if (auto) { remaining = Math.max(0, deadline - performance.now()); auto = false; }
    clearInterval(timer);
    paintTimer();
  };
  const play = () => {
    clearInterval(timer);
    auto = true;
    deadline = performance.now() + remaining;
    paintTimer();
    timer = setInterval(() => {
      if (document.hidden) { pause(); return; }
      paintTimer();
      if (performance.now() >= deadline) next();
    }, 100);
  };
  const button = (text, attrs, onClick) => el('button', { type: 'button', ...attrs, onClick }, text);
  async function paint() {
    clearInterval(timer);
    const rev = ++revision;
    const step = steps[index];
    if (step.view) show(step.view);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (closed || rev !== revision) return;
    target = document.querySelector(step.target);
    // 없는 것(지금 화면에 보이지 않는 것)은 건너뛴다. 꼭 있어야 하는 것이 없으면 화면 전체를 비춘다.
    if (!target || !target.getClientRects().length) {
      const to = index + direction;
      if (to >= 0 && to < steps.length) { index = to; paint(); return; }
      if (step.optional) { close(); return; }
      target = document.querySelector('#app') || document.body;
    }
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'instant' : 'smooth' });
    const last = index === steps.length - 1;
    card.replaceChildren(
      el('div', { class: 'onba-tour-top' }, el('span', { text: `${title} · ${index + 1} / ${steps.length}` }), button('×', { 'aria-label': '안내 닫기', class: 'onba-tour-x' }, close)),
      el('div', { class: 'onba-tour-msg' },
        el('img', { src: onbatangAsset('symbol-primary.svg'), alt: '', width: 56, height: 56 }),
        el('div', { 'aria-live': 'polite' }, el('h3', { text: step.title }), el('p', { text: step.text }), step.tip ? el('small', { class: 'onba-tour-tip', text: step.tip }) : null)),
      el('div', { class: 'onba-tour-steps', 'aria-hidden': 'true' }, ...steps.map((_, i) => el('i', { class: i === index ? 'now' : i < index ? 'done' : '' }))),
      el('div', { class: 'onba-tour-play' },
        el('span', { class: 'onba-tour-glasswrap', html: hourglass }),
        el('span', { 'data-timer': '' }),
        button('', { 'data-auto': '' }, () => (auto ? pause() : play())),
        button('↺ 처음부터', { 'aria-label': '처음부터 다시 보기' }, () => { direction = 1; index = 0; auto = true; remaining = STEP_MS; paint(); })),
      el('div', { class: 'onba-tour-nav' },
        el('small', { text: '한 단계에 5초 · 화면을 만지면 잠시 멈춰요' }),
        button('이전', { disabled: index === 0 }, () => { direction = -1; index--; remaining = STEP_MS; paint(); }),
        button(last ? '마치기' : '다음 →', { class: 'primary' }, next)));
    remaining = STEP_MS;
    place();
    if (auto) play(); else paintTimer();
  }
  function next() {
    direction = 1;
    if (index === steps.length - 1) { close(); return; }
    index++;
    remaining = STEP_MS;
    paint();
  }
  addEventListener('resize', place, { signal });
  document.addEventListener('scroll', place, { signal, capture: true });
  document.addEventListener('pointerdown', (e) => { if (!card.contains(e.target)) pause(); }, { signal, capture: true });
  document.addEventListener('input', pause, { signal, capture: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, { signal });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (card.contains(e.target) && e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (card.contains(e.target) && e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); direction = -1; index--; paint(); }
    else if (!card.contains(e.target)) pause();
  }, { signal, capture: true });
  paint().then(() => card.focus({ preventScroll: true }));
  return close;
}

/** 이 안내를 본 적이 있는가 · 봤다고 적는다(이 기기에만). */
export function tourSeen(name) { try { return localStorage.getItem(SEEN + name) === '1'; } catch { return true; } }
export function markTourSeen(name) { try { localStorage.setItem(SEEN + name, '1'); } catch { /* 적지 못해도 괜찮다 */ } }
