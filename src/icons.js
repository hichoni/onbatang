// 온바탕 편집기의 UI 아이콘(단추·도구 줄에 쓰는 작은 그림). 카드에 놓는 요소(shapes.js)와는 따로 관리한다.
//
// 한 가지 규칙으로 직접 그렸다(바깥 아이콘 묶음을 쓰지 않는다. 그래서 받을 파일도, 따를 사용 조건도 없다):
//   - 24 × 24 칸, 선 굵기 2, 끝과 모서리는 둥글게, 속은 비운다(선 그림).
//   - 색은 글자색(currentColor)을 따른다. 그래서 기본·올려놓음·고름·못 누름 상태를 단추의 글자색만으로 바꿀 수 있다.
//   - 그림은 가운데 20 × 20 칸 안에 그려서, 어느 아이콘이든 보이는 크기와 가운데가 맞는다.
// 크기는 CSS 가 정한다(.fe-ic: 글자 크기의 1.25배. 도구 줄처럼 크게 쓸 곳은 그 자리의 CSS 가 font-size 로 키운다).

const dot = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="1.1" fill="currentColor" stroke="none"/>`;

/** 이름 → SVG 안에 넣을 도형들. */
export const ICONS = {
  eyedropper: '<path d="M14 5l5 5m-7-3l5 5-8 8H4v-5zM14 5l2-2a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3l-2 2"/>',
  // ---- 도구 줄(옆 메뉴) ----
  template: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9.5h17M9.5 9.5v11"/>',
  text: '<path d="M5 7.5V5h14v2.5M12 5v14M9 19h6"/>',
  shapes: '<circle cx="7.5" cy="16.5" r="4"/><rect x="13.5" y="12.5" width="7.5" height="7.5" rx="1.5"/><path d="M12 3.5l4 6.5H8z"/>',
  upload: '<path d="M12 15.5V4.5m0 0L7.5 9M12 4.5L16.5 9M4 15.5v2.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5"/>',
  palette: `<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.9-.9 1.9-1.9 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .9-1.9 1.9-1.9h2.1a3.6 3.6 0 0 0 3.6-3.6c0-3.9-3.8-7-8.5-7z"/>${dot(7.6, 11.2)}${dot(10.4, 7.6)}${dot(15, 7.9)}`,
  layers: '<path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z"/><path d="M3.5 12.2l8.5 4.5 8.5-4.5"/><path d="M3.5 16.3l8.5 4.5 8.5-4.5"/>',
  motion: '<circle cx="15" cy="12" r="5.5"/><path d="M3.5 7.5h5M2.5 12h5M3.5 16.5h5"/>',
  video: '<rect x="3.5" y="6.5" width="12" height="11" rx="2.5"/><path d="M15.5 10.6l4.3-2.6a.5.5 0 0 1 .7.4v7.2a.5.5 0 0 1-.7.4l-4.3-2.6"/>',
  // ---- 도구 막대 ----
  undo: '<path d="M8.5 13.5L4 9l4.5-4.5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15.5 13.5L20 9l-4.5-4.5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  alignL: '<path d="M4.5 6h15M4.5 12h9M4.5 18h12"/>',
  alignC: '<path d="M4.5 6h15M7.5 12h9M6 18h12"/>',
  alignR: '<path d="M4.5 6h15M10.5 12h9M7.5 18h12"/>',
  pencil: '<path d="M4.5 19.5l1-4.4L16.6 4a2 2 0 0 1 2.9 2.9L8.4 18z"/><path d="M14.6 6l3 3"/>',
  eraser: '<path d="M8.5 19.5L3.9 14.9a1.6 1.6 0 0 1 0-2.3L13 3.5a1.6 1.6 0 0 1 2.3 0l4.2 4.2a1.6 1.6 0 0 1 0 2.3L10 19.5z"/><path d="M8.4 8.1l6.5 6.5M8.5 19.5H20"/>',
  cut: '<circle cx="6.5" cy="6.5" r="2.6"/><circle cx="6.5" cy="17.5" r="2.6"/><path d="M8.6 8.1L20 18M8.6 15.9L20 6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 11.6a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7M10 11v5.5M14 11v5.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5"/>',
  flipH: '<path d="M12 3.5v17"/><path d="M8.5 7.5L4 12l4.5 4.5z"/><path d="M15.5 7.5L20 12l-4.5 4.5z"/>',
  flipV: '<path d="M3.5 12h17"/><path d="M7.5 8.5L12 4l4.5 4.5z"/><path d="M7.5 15.5L12 20l4.5-4.5z"/>',
  upright: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  // 끌어서 옮기는 손잡이(레이어 목록)
  grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>',
  // ---- 오른쪽 누르기 메뉴 · 위치 칸 ----
  paste: '<rect x="5" y="5" width="14" height="15.5" rx="2.2"/><path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8V6.5z"/>',
  duplicate: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5M14.5 12v5M12 14.5h5"/>',
  // 순서: 화살표가 위(앞)·아래(뒤)로, 가로 막대는 "맨 끝"을 뜻한다
  toFront: '<path d="M5 4.5h14M12 20V9m0 0l-4.5 4.5M12 9l4.5 4.5"/>',
  forward: '<path d="M12 19.5V5m0 0l-5 5m5-5l5 5"/>',
  backward: '<path d="M12 4.5V19m0 0l-5-5m5 5l5-5"/>',
  toBack: '<path d="M5 19.5h14M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5"/>',
  // 페이지에 맞춰 정렬: 긴 선이 기준(페이지의 왼쪽·가운데·오른쪽·위·중간·아래), 두 막대가 요소
  pageL: '<path d="M4.5 4v16"/><rect x="8" y="6.5" width="11" height="4" rx="1"/><rect x="8" y="13.5" width="6.5" height="4" rx="1"/>',
  pageC: '<path d="M12 4v16"/><rect x="6" y="6.5" width="12" height="4" rx="1"/><rect x="8.5" y="13.5" width="7" height="4" rx="1"/>',
  pageR: '<path d="M19.5 4v16"/><rect x="5" y="6.5" width="11" height="4" rx="1"/><rect x="9.5" y="13.5" width="6.5" height="4" rx="1"/>',
  pageT: '<path d="M4 4.5h16"/><rect x="6.5" y="8" width="4" height="11" rx="1"/><rect x="13.5" y="8" width="4" height="6.5" rx="1"/>',
  pageM: '<path d="M4 12h16"/><rect x="6.5" y="6" width="4" height="12" rx="1"/><rect x="13.5" y="8.5" width="4" height="7" rx="1"/>',
  pageB: '<path d="M4 19.5h16"/><rect x="6.5" y="5" width="4" height="11" rx="1"/><rect x="13.5" y="9.5" width="4" height="6.5" rx="1"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="8.8" cy="9.6" r="1.6"/><path d="M20.5 15.2l-4.3-4.3a1.5 1.5 0 0 0-2.1 0L6.5 18.5"/>',
  // ---- 화면을 다니는 단추(미니캔의 위 막대·슬라이드 띠 등 프로젝트가 쓴다) ----
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  left: '<path d="M19 12H5m0 0l5.5-5.5M5 12l5.5 5.5"/>',
  right: '<path d="M5 12h14m0 0l-5.5-5.5M19 12l-5.5 5.5"/>',
  play: '<path d="M8 5.8v12.4a.6.6 0 0 0 .9.5l10-6.2a.6.6 0 0 0 0-1L8.9 5.3a.6.6 0 0 0-.9.5z" fill="currentColor"/>',
  // 영상 장면: 멈춤 · 그만(찍기 멈추기) · 찍기 · 카메라 바꾸기 · 소리
  pause: '<rect x="6.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.2" fill="currentColor" stroke="none"/>',
  record: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>',
  swap: '<path d="M4.5 9.5A8 8 0 0 1 18.2 7L20 9"/><path d="M20 4.5V9h-4.5"/><path d="M19.5 14.5A8 8 0 0 1 5.8 17L4 15"/><path d="M4 19.5V15h4.5"/>',
  sound: '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11"/>',
  download: '<path d="M12 4.5v10.5m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/>',
  cloud: '<path d="M7.2 18.5a4 4 0 0 1-.6-7.9 5.8 5.8 0 0 1 11.2-1.2 4.6 4.6 0 0 1-.3 9.1z"/>',
  screen: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M12 16v3.5M8.5 19.5h7"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.6 2.6 4.9-5.3"/>',
  move: '<path d="M12 3.5v17M3.5 12h17M9.5 6L12 3.5 14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5L3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5"/>',
  // 함께하는 사람들(틴커랩 미니캔의 "함께 만드는 그림")
  people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="16.6" cy="9.4" r="2.6"/><path d="M15.4 14.3a4.6 4.6 0 0 1 5.1 5.2"/>',
  // ---- 도구 막대: 펼치는 칸 · 여럿 고르기 ----
  opacity: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" fill-opacity=".35" stroke="none"/><path d="M12 3.5v17"/>',
  resize: '<path d="M4.5 10V4.5H10M14 19.5h5.5V14M4.5 4.5l6.5 6.5M19.5 19.5L13 13"/>',
  mask: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="12" cy="12" r="4.8"/>',
  cover: '<rect x="7.5" y="7.5" width="9" height="9" rx="1.5"/><path d="M3.5 8V3.5H8M16 3.5h4.5V8M20.5 16v4.5H16M8 20.5H3.5V16"/>',
  corner: '<path d="M4.5 19.5V12a7.5 7.5 0 0 1 7.5-7.5h7.5"/>',
  thick: '<path d="M4 6h16" stroke-width="1.2"/><path d="M4 11.5h16" stroke-width="2.4"/><path d="M4 17.5h16" stroke-width="4"/>',
  highlight: '<rect x="4" y="4.5" width="16" height="11" rx="2"/><path d="M9 12.5l3-5.5 3 5.5M10.1 10.6h3.8M4 19.5h16"/>',
  fill: '<path d="M5 12.5L11.5 6l6.5 6.5-6.5 6.5z"/><path d="M8.3 3.5l3.2 2.5M5 12.5h13"/><path d="M20 15.5s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z"/>',
  border: '<rect x="4" y="4" width="16" height="16" rx="2.5" stroke-dasharray="3.2 2.6"/>',
  chev: '<path d="M8 10l4 4 4-4"/>',
  align: '<path d="M12 3.5v17"/><rect x="5" y="6" width="14" height="4.5" rx="1"/><rect x="8" y="13.5" width="8" height="4.5" rx="1"/>',
  distH: '<path d="M4 4v16M20 4v16"/><rect x="9.5" y="8" width="5" height="8" rx="1"/>',
  distV: '<path d="M4 4h16M4 20h16"/><rect x="8" y="9.5" width="8" height="5" rx="1"/>',
  group: '<rect x="3.5" y="3.5" width="17" height="17" rx="2" stroke-dasharray="3 2.6"/><rect x="7" y="7" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/>',
  ungroup: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"/><path d="M15 5h4v4M9 19H5v-4" stroke-dasharray="2 2"/>',
  selectAll: '<rect x="3.5" y="3.5" width="17" height="17" rx="2" stroke-dasharray="3 3"/><path d="M8 12l2.8 2.8L16 9.5"/>',
};

/** 아이콘의 SVG 글(직접 넣을 때). 모르는 이름이면 빈 글. */
export function iconSvg(name) {
  const body = Object.hasOwn(ICONS, name) ? ICONS[name] : '';
  return body ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>` : '';
}

/**
 * 아이콘 요소(<span class="fe-ic">). 꾸밈이라 화면 읽기 프로그램에는 숨긴다: 아이콘만 있는 단추에는 꼭 aria-label 과 title 을 준다.
 * cls: 더 붙일 클래스.
 */
export function icon(name, cls = '') {
  const node = document.createElement('span');
  node.className = `fe-ic${cls ? ` ${cls}` : ''}`;
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = iconSvg(name);
  return node;
}
