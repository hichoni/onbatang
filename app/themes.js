// 미니캔의 주제 테마 9종: 주제마다 표지 한 장과 내용 한 장. DOM 을 쓰지 않는 자료와 순수 함수만 둔다(node 에서 그대로 읽힌다).
//
// 한 세트로 보이게 하는 규칙
//   - 표지: 분류(캡슐 라벨) → 두 줄 제목(둘째 줄은 강조색) → 짧은 밑줄 → 발표하는 사람. 그 옆(가로로 긴 그림)이나 아래에 그림 묶음.
//   - 내용: 표지와 같은 배경·같은 꾸밈에, 소제목과 세 가지 내용. 오른쪽 아래에 그 주제의 그림 하나.
//   - 그림 묶음은 편집기의 요소(shapes.js 의 도형과 그림 요소)만으로 짠다. 통짜 그림이 아니라서, 넣은 뒤에 하나하나 고르고 옮기고 색을 바꿀 수 있다.
//   - 글은 예시 문구다. 눌러서 내 글로 바꾼다.
//
// 그림의 모양(가로 ÷ 세로)에 따라 배치가 달라진다(templates.js 의 템플릿과 같은 방식): 가로로 긴 그림은 글이 왼쪽 · 그림이 오른쪽,
// 정사각형과 세로로 긴 그림은 글이 위 · 그림이 아래다. 첫 화면에서 테마로 시작하면 발표 화면(16:9)으로 열린다.
import { shapeAsset } from '../src/shapes.js';
import { board, fs, LINE, TITLE_FONT } from './templates.js';

const INK = '#14215a';
const SUN = '#ffc93c';
const WHITE = '#ffffff';

// 글 한 줄의 너비를 글자 크기의 몇 배인지로 어림한다(한글은 1, 빈칸과 쉼표는 좁게, 영문·숫자는 조금 좁게).
const emLen = (line) => [...String(line)].reduce((n, ch) => n + (ch === ' ' ? 0.3 : /[,.!?:]/.test(ch) ? 0.35 : /[A-Za-z0-9]/.test(ch) ? 0.7 : 1), 0);
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * 카드에 붙여 놓는 꾸밈(귀퉁이의 동그라미 · 반짝임 · 바닥의 언덕). 자리는 요소의 가운데 점으로 적는다.
 * y 가 0 보다 작으면 아래에서 잰 거리다(-5 는 아래 끝에서 5 위). 정사각형·세로 그림에서는 꾸밈이 조금 커진다(g).
 */
export function decor(b) {
  const g = b.wide ? 1 : 1.5;
  const put = (id, cx, y, w, color, more = {}) => {
    const a = shapeAsset(id);
    const { h = (w * a.h) / a.w, ...rest } = more;
    const cy = y < 0 ? b.H + y * g : y * g;
    b.shape(id, { left: cx - (w * g) / 2, top: cy - (h * g) / 2, w: w * g, h: h * g, color, ...rest });
  };
  return {
    put,
    /** 가로로 긴 그림에만 놓는다(다른 모양에서는 그 자리에 그림 묶음이 와서 가려진다). */
    wide: (...args) => { if (b.wide) put(...args); },
    /** 바닥의 언덕: 오른쪽 아래에 깔린다(그림 묶음이 그 위에 선다). */
    ground(color) {
      const h = 10 * g;
      b.shape('hill', { left: 30, top: b.H - h * 0.8, w: 86, h, color });
    },
  };
}

// 그림 묶음은 가로 100 · 세로 92 인 칸에 그려 두고, 카드의 자리(region)에 비율을 지켜 넣는다(오른쪽 아래에 붙인다).
const ART = { w: 100, h: 92 };
function easel(b, region) {
  const s = Math.min(region.w / ART.w, region.h / ART.h);
  const ox = region.left + region.w - ART.w * s;
  const oy = region.top + region.h - ART.h * s;
  return {
    /** 요소 하나: 가운데 점(cx, cy)과 너비(w). 높이는 그 요소의 비율을 따른다(more.h 로 따로 정할 수 있다). */
    put(id, cx, cy, w, color, more = {}) {
      const a = shapeAsset(id);
      const { h = (w * a.h) / a.w, ...rest } = more;
      const k = Math.max(s, 2.2 / w);                   // 아주 작은 것도 편집기가 받는 크기보다 작아지지 않게
      b.shape(id, { left: ox + cx * s - (w * k) / 2, top: oy + cy * s - (h * k) / 2, w: w * k, h: h * k, color, ...rest });
    },
    /** 글: 가운데 점과 너비 · 글자 크기. */
    say(text, cx, cy, w, size, color, more = {}) {
      const real = fs(size, s);
      const lines = String(text).split('\n').length;
      const width = Math.max(10, w * s);
      b.text(text, { left: ox + cx * s - width / 2, top: oy + cy * s - (lines * real * LINE) / 2, w: width, size: real, color, align: 'c', ...more });
    },
  };
}

// 표지의 글 묶음이 놓일 자리를 잰다(그림 묶음을 먼저 깔고 그 위에 글을 올리므로, 자리부터 정한다).
function planTitle(t, { left, top, tag, gap, base, colW, bar, who, whoW }) {
  // 분류(캡슐 라벨): 글자 수에 맞춰 길어진다
  const pill = { w: round1(Math.max(tag * 4.4, emLen(t.tag) * tag + tag * 2.6)), h: round1(tag * 1.85) };
  // 제목 두 줄: 긴 줄이 글 칸(colW)을 넘지 않게 글자 크기를 정한다
  const size = Math.floor(Math.min(base, colW / Math.max(...t.title.map(emLen))) * 10) / 10;
  const pitch = size * 1.17;
  const titleTop = top + pill.h + gap;
  const end = titleTop + (t.title.length - 1) * pitch + size * LINE;
  return { left, top, tag, pill, size, pitch, titleTop, colW, bar, barTop: end + bar.h * 0.9, who, whoW, whoTop: end + bar.h * 3.6 };
}
function drawTitle(b, t, p) {
  const { left } = p;
  const tagW = Math.max(10, p.pill.w);                  // 글상자는 너비 10 보다 좁아질 수 없다
  b.shape('pill', { left, top: p.top, w: p.pill.w, h: p.pill.h, color: t.pill });
  b.text(t.tag, { left: left + p.pill.w / 2 - tagW / 2, top: p.top + p.pill.h / 2 - (p.tag * LINE) / 2, w: tagW, size: p.tag, bold: true, color: t.pillInk || INK, align: 'c' });
  // 줄마다 따로 놓아서 색을 달리한다. 글상자는 글 칸만큼 넓다: 내 제목으로 바꿔 써도 예시 글만큼의 길이까지는 줄이 바뀌지 않는다
  // (더 길면 줄이 바뀌어 위아래 글과 겹치니, 그때는 글자 크기를 줄인다).
  t.title.forEach((line, i) => {
    b.text(line, { left, top: p.titleTop + i * p.pitch, w: p.colW + 2, size: p.size, color: i ? t.accent : INK, font: TITLE_FONT });
  });
  b.shape('pill', { left, top: p.barTop, w: p.bar.w, h: p.bar.h, color: t.bar });
  b.text('발표하는 사람: 이름을 써요', { left, top: p.whoTop, w: p.whoW, size: p.who, color: INK });
}

// ---------- 표지 ----------
function cover(t, a) {
  const b = board(a);
  const { H, wide } = b;
  const d = decor(b);
  t.back(d);
  if (wide) {
    // 가로: 글은 왼쪽 절반, 그림은 오른쪽 절반(카드의 세로를 거의 다 쓴다)
    t.art(easel(b, { left: 45, top: 1.5, w: 55, h: H - 1.5 }), d);
    drawTitle(b, t, planTitle(t, { left: 6.8, top: 6.4, tag: 3.1, gap: 3, base: 9.4, colW: 50, bar: { w: 11, h: 1.4 }, who: 2.8, whoW: 50 }));
    return b.items;
  }
  // 정사각형 · 세로: 글이 위, 그림은 그 아래 남는 곳에 오른쪽으로 붙인다
  const k = a < 0.7 ? 1.08 : 1;
  const p = planTitle(t, { left: 8, top: a < 0.7 ? 15 : 9, tag: fs(3.9, k), gap: 4.5 * k, base: 12.6 * k, colW: 84, bar: { w: 16 * k, h: 1.9 * k }, who: fs(3.9, k), whoW: a < 0.9 ? 84 : 66 });
  // 그림 자리: 세로로 긴 그림은 "발표하는 사람" 줄 아래부터. 정사각형은 남는 곳이 좁아서 그 줄의 높이부터 쓴다
  // (그 줄의 글상자는 조금 좁게 두고, 작아진 그림 묶음은 오른쪽에 붙어서 글과 닿지 않는다).
  const artTop = a < 0.9 ? p.whoTop + p.who * LINE + 1.5 : p.whoTop - 2;
  t.art(easel(b, { left: 8, top: artTop, w: 90, h: H - artTop - 0.5 }), d);
  drawTitle(b, t, p);
  return b.items;
}

// ---------- 내용: 소제목 + 세 가지 내용. 오른쪽 아래에 그 주제의 그림 하나 ----------
const ROWS = ['첫째 내용을 써요', '둘째 내용을 써요', '셋째 내용을 써요'];
function page(t, a) {
  const b = board(a);
  const { H, wide } = b;
  const d = decor(b);
  t.back(d);
  // 옅은 동그라미 위에 그림 하나(그 요소의 비율을 지켜 동그라미 안에 넣는다)
  const halo = wide ? 27 : a < 0.7 ? 46 : a < 0.9 ? 38 : 31;
  const cx = wide ? 82 : a < 0.9 ? 74 : 79;
  const cy = H - halo * (wide ? 0.62 : 0.6);
  b.shape('circle', { left: cx - halo / 2, top: cy - halo / 2, w: halo, h: halo, color: t.soft });
  const [id, color] = t.icon;
  const asset = shapeAsset(id);
  const iw = halo * 0.58 * Math.min(1, asset.w / asset.h);
  const ih = (iw * asset.h) / asset.w;
  b.shape(id, { left: cx - iw / 2, top: cy - ih / 2, w: iw, h: ih, color });
  // 소제목과 밑줄
  const left = wide ? 6.8 : 8;
  const k = wide ? 1 : a < 0.7 ? 1.08 : 1;
  const size = wide ? 5.8 : 8.8 * k;
  const end = b.text('소제목을 써요', { left, top: wide ? 6.5 : a < 0.7 ? 15 : 10, w: wide ? 76 : 80, size, color: INK, font: TITLE_FONT });
  const bar = wide ? { w: 11, h: 1.4 } : { w: 16 * k, h: 1.9 * k };
  b.shape('pill', { left, top: end + bar.h * 0.7, w: bar.w, h: bar.h, color: t.bar });
  // 세 가지 내용: 번호 동그라미 + 한 줄
  const dot = wide ? 5.6 : 9.6 * k;
  const first = end + bar.h * 1.7 + (wide ? 4.6 : 8 * k);
  const pitch = wide ? Math.min(10, (H - first - 6) / 3) : Math.min(24, Math.max(dot + 5, (H - first - halo * 0.9) / 3));
  const num = fs(wide ? 3 : 5.2, k);
  const body = fs(wide ? 3.6 : 4.9, k);
  ROWS.forEach((row, i) => {
    const top = first + i * pitch;
    b.shape('circle', { left, top, w: dot, h: dot, color: t.accent });
    b.text(String(i + 1), { left: left + dot / 2 - 5, top: top + dot / 2 - (num * LINE) / 2, w: 10, size: num, bold: true, color: WHITE, align: 'c' });
    b.text(row, { left: left + dot + (wide ? 2.6 : 4), top: top + dot / 2 - (body * LINE) / 2, w: wide ? 50 : 100 - left * 2 - dot - 4, size: body, bold: true, color: INK });
  });
  return b.items;
}

// ---------- 주제마다: 색 · 예시 글 · 뒤에 깔리는 꾸밈(back) · 그림 묶음(art) ----------
// back(d): d.put(요소, 가운데 x, y, 너비, 색). art(e, d): e.put(요소, 가운데 x, 가운데 y, 너비, 색) — 가로 100 · 세로 92 인 칸의 자리.
// 가로로 긴 그림에서는 제목이 그림 칸의 왼쪽 위 귀퉁이까지 닿으므로, 그 귀퉁이(x 22 · y 55 안쪽)는 비워 둔다.
const THEMES = [
  {
    id: 'tnet', name: '인터넷 예절', tag: '정보통신윤리', title: ['바르게 쓰는', '인터넷'],
    bg: '#f1f7ff', accent: '#1c64f2', pill: SUN, bar: SUN, soft: '#d3e6fd', icon: ['shield', '#1c64f2'],
    back(d) {
      d.put('circle', 1, -1, 21, '#bfdcff');
      d.put('ring', 20, -5, 6.5, '#cfe3ff');
      d.put('spark', 94, 7, 5, SUN);
      d.wide('spark', 44, -9, 4.4, SUN);
    },
    art(e, d) {
      e.put('circle', 57, 46, 84, '#d3e6fd');
      e.put('cloud', 13, 64, 26, '#b9d7fb');
      e.put('cloud', 94, 40, 17, '#b9d7fb');
      e.put('circle', 15, 84, 17, '#2f9e6e');
      e.put('circle', 93, 74, 19, '#2f9e6e');
      d.ground('#5b9df9');
      e.put('laptop', 59, 63, 62, '#1e3a8a');
      e.put('globe', 59, 59, 23, '#3b82f6');
      e.put('rays', 73, 49, 6, SUN);
      e.put('cursor', 73, 68, 9, INK);
      e.put('shield', 28, 68, 31, '#1c64f2');
      e.put('chat', 35, 32, 18, '#60a5fa', { rot: -6 });
      e.put('idcard', 62, 21, 34, '#2f9e6e');
      e.put('wifi', 89, 13, 14, '#60a5fa', { rot: 25 });
      e.put('bubble2', 93, 52, 17, WHITE);
      e.put('heart', 93, 50.5, 7, '#2f9e6e');
      e.put('checkcard', 84, 82, 30, '#ffb300');
    },
  },
  {
    id: 'tdetox', name: '디지털 디톡스', tag: '정보', title: ['디지털 디톡스,', '나를 지키는 시간'],
    bg: '#f6fbf1', accent: '#2f9e44', pill: '#b2e59a', bar: SUN, soft: '#dcefd0', icon: ['phone', '#1f2a44'],
    back(d) {
      d.put('plant', 5, -6, 21, '#3aa655', { rot: -14 });
      d.put('circle', 93, 5, 9, '#ffd966');
      d.put('ring', 20, -5, 6, '#cdeac0');
    },
    art(e, d) {
      e.put('circle', 58, 45, 82, '#d5ebf7');
      e.put('cloud', 32, 20, 20, WHITE);
      e.put('tree', 87, 45, 17, '#3aa655');
      e.put('tree', 97, 56, 12, '#2f8f4a');
      d.ground('#a5d98a');
      e.put('phone', 55, 47, 31, '#1f2a44', { rot: 8 });
      e.put('pause', 56.5, 38, 16, '#f0624d', { rot: 8 });
      e.put('sprout', 53.5, 61, 12, '#3aa655', { rot: 8 });
      e.put('sign', 86, 72, 23, '#b9895a');
      e.put('heart', 86, 67.5, 9, '#f0624d');
      e.put('books', 27, 83, 31, '#f2a33a');
      e.put('plant', 9, 76, 18, '#2f9e44');
      e.put('heart', 79, 15, 6, '#3aa655');
      e.put('rays', 37, 39, 7, SUN, { fx: true });
    },
  },
  {
    id: 'tai', name: 'AI와 정보', tag: '정보', title: ['AI와 함께', '배우는 정보'],
    bg: '#f3f8ff', accent: '#1c64f2', pill: '#4cc9f0', bar: '#2ec4b6', soft: '#d8e7fd', icon: ['robot', '#3b82f6'],
    back(d) {
      d.put('circle', 1, -1, 21, '#3b82f6');
      d.put('ring', 20, -5, 6.5, '#bcd4ff');
      d.put('circle', 97, 5, 7, '#a9c9ff');
      d.wide('spark', 44, -9, 4.4, SUN);
    },
    art(e) {
      e.put('circle', 58, 46, 82, '#d8e7fd');
      e.put('codewin', 31, 22, 30, '#2f6fed', { rot: -6 });
      e.put('nodes', 88, 17, 18, '#2ec4b6');
      e.put('wifi', 60, 8, 12, '#60a5fa', { rot: -18 });
      e.put('plant', 94, 66, 22, '#2f9e6e');
      e.put('books', 85, 77, 27, '#2f6fed');
      e.put('robot', 60, 46, 38, '#3b82f6');
      e.put('rays', 84, 37, 7, SUN);
      e.put('block', 14, 66, 18, '#ffb300');
      e.put('block', 17, 74, 18, '#7c5cff');
      e.put('round', 58, 88.5, 84, '#2f55d4', { h: 6 });
      e.put('laptop', 44, 71, 40, '#8ea2c8');
      e.put('cursor', 27, 81, 8, INK);
    },
  },
  {
    id: 'tdream', name: '나의 꿈', tag: '창체', title: ['나의 꿈', '프로젝트'],
    bg: '#fffaf0', accent: '#17a673', pill: SUN, bar: SUN, soft: '#d9f0e1', icon: ['flag', '#ffb300'],
    back(d) {
      d.put('circle', 1, -1, 21, '#ffd966');
      d.put('ring', 20, -5, 7, '#b9e6cf');
      d.put('spark', 94, 6, 5, SUN);
    },
    art(e) {
      e.put('circle', 60, 36, 68, '#d7ecf7');
      e.put('cloud', 91, 27, 18, WHITE);
      e.put('hill', 58, 64, 104, '#63b85f', { h: 62 });
      e.put('trail', 62, 63, 15, '#fff1b8', { h: 46 });
      e.put('flag', 70, 27, 22, '#ffb300');
      e.put('rays', 87, 12, 7, SUN);
      e.put('frame', 27, 34, 18, '#60a5fa', { rot: -10 });
      e.put('bulb', 27, 32.5, 9, '#ffb300', { rot: -10 });
      e.put('frame', 47, 17, 16, '#3f9e4d', { rot: 6 });
      e.put('sprout', 47, 15.6, 8, '#3f9e4d', { rot: 6 });
      e.put('frame', 91, 51, 17, '#ff8a3d', { rot: 8 });
      e.put('star', 91, 49.6, 8, '#ffb300', { rot: 8 });
      e.put('hill', 34, 87, 92, '#3f9e4d', { h: 16, fx: true });
      e.put('plant', 96, 80, 16, '#2f9e44');
      e.put('person', 22, 80, 24, '#ff8a3d');
      e.put('person2', 45, 81, 22, '#e8508a');
      e.put('person', 79, 81, 22, '#f2b33a');
    },
  },
  {
    id: 'tbook', name: '책과 생각', tag: '6학년 국어', title: ['책과 함께 떠나는', '생각 여행'],
    bg: '#faf8ff', accent: '#3d4be0', pill: SUN, bar: SUN, soft: '#e3e6fc', icon: ['openbook', '#2a3aa8'],
    back(d) {
      d.put('circle', 1, -1, 21, '#aab4f6');
      d.put('ring', 20, -5, 6.5, '#c9cef9');
      d.put('spark', 94, 6, 5, SUN);
    },
    art(e, d) {
      e.put('circle', 58, 44, 80, '#e3e6fc');
      d.ground('#939df2');
      e.put('chat', 86, 11, 18, '#939df2');
      e.put('circle', 43, 28, 23, WHITE);
      e.put('bulb', 43, 28, 13, SUN);
      e.put('circle', 51, 45, 5, WHITE);
      e.put('notepad', 76, 35, 22, '#6d7cf2', { rot: 14 });
      e.put('pencil', 91, 47, 15, '#ffb300');
      e.put('books', 88, 84, 26, '#3d4be0');
      e.put('openbook', 50, 70, 64, '#2a3aa8');
      e.put('circle', 18, 60, 14, '#b4bcf8');
      e.put('quote', 18, 60, 7, '#3d4be0');
      e.put('spark', 29, 45, 6, SUN);
      e.put('spark', 63, 49, 5, SUN);
    },
  },
  {
    id: 'tart', name: '미술 작품', tag: '6학년 미술', title: ['색으로 말하는', '나의 작품'],
    bg: '#fff9ef', accent: '#f2542d', pill: SUN, bar: SUN, soft: '#ffe7c2', icon: ['palette', '#e9a23b'],
    back(d) {
      d.put('blob', 94, 2, 32, '#ffd35c', { rot: 20 });
      d.put('blob', 98, -2, 28, '#ff9c7a');
      d.put('blob', 2, -1, 25, '#a8dfc2', { rot: -15 });
      d.put('ring', 20, -5, 6.5, '#9db8ff');
      d.wide('dots', 42, -6, 8, '#ffb86b');
    },
    art(e) {
      e.put('curl', 33, 9, 22, '#7aa2ff', { rot: -8 });
      e.put('round', 60, 44, 44, WHITE, { h: 56, rot: 8, r: 8, line: 0.4, lc: '#ecdcc0' });
      e.put('badge', 52, 30, 17, '#ff7a45', { rot: 8 });
      e.put('circle', 70, 27, 9, SUN);
      e.put('tri', 65, 52, 15, '#2f6fed', { rot: -10 });
      e.put('leaf', 49, 53, 10, '#33b07a', { rot: -24 });
      e.put('round', 93, 38, 8, '#2f6fed', { h: 6.4, rot: 6 });
      e.put('round', 92.3, 45, 8, SUN, { h: 6.4, rot: 6 });
      e.put('round', 91.6, 52, 8, '#f2542d', { h: 6.4, rot: 6 });
      e.put('round', 90.9, 59, 8, '#33b07a', { h: 6.4, rot: 6 });
      e.put('palette', 30, 72, 46, '#f3dfc1');
      e.put('circle', 17.7, 69.7, 6.9, '#2f6fed');
      e.put('circle', 26.2, 63.2, 6.9, SUN);
      e.put('circle', 36.5, 62.8, 6.9, '#f2542d');
      e.put('circle', 44.6, 68.2, 6.1, '#33b07a');
      e.put('circle', 18.1, 78.9, 6.1, '#8b5cf6');
      e.put('brush', 68, 76, 30, '#2f6fed');
      e.put('rays', 88, 21, 7, '#ffb300');
    },
  },
  {
    id: 'tclass', name: '따뜻한 교실', tag: '5학년 도덕', title: ['함께 만드는', '따뜻한 교실'],
    bg: '#fff6f3', accent: '#e8443a', pill: '#f25c54', pillInk: WHITE, bar: '#f25c54', soft: '#ffd9d2', icon: ['heart', '#f25c54'],
    back(d) {
      d.put('circle', 1, -1, 21, '#ffb9ad');
      d.put('spark', 94, 6, 5, SUN);
      d.put('rays', 24, -8, 6, '#ffb9ad', { fx: true });
    },
    art(e) {
      e.put('heart', 60, 35, 68, '#f8aaa0', { h: 62 });
      e.say('함께라서\n더 좋은 우리', 60, 26, 50, 6, WHITE, { bold: true });
      e.put('rays', 93, 13, 7, '#f25c54');
      e.put('bubble2', 14, 63, 14, WHITE);
      e.put('heart', 14, 61.6, 6, '#e8443a');
      e.put('bubble2', 93, 34, 13, WHITE);
      e.put('sprout', 93, 32.6, 6, '#2f9e44');
      e.put('person', 26, 73, 27, '#f08a3c');
      e.put('person2', 46, 75, 27, '#f2b33a');
      e.put('person', 66, 75, 27, '#e86a5a');
      e.put('person2', 86, 73, 27, '#d9739a');
      e.put('round', 56, 88.5, 88, '#c98a5a', { h: 7 });
    },
  },
  {
    id: 'tearth', name: '지구 지키기', tag: '5학년 과학', title: ['지구를 지키는', '작은 실천'],
    bg: '#f7fbf2', accent: '#17a34a', pill: '#17a34a', pillInk: WHITE, bar: SUN, soft: '#dff0d3', icon: ['earth', '#2f80ed'],
    back(d) {
      d.put('plant', 5, -6, 21, '#3aa655', { rot: -14 });
      d.put('circle', 98, 2, 14, '#cfe6fb');
      d.put('ring', 20, -5, 6, '#cdeac0');
    },
    art(e, d) {
      e.put('circle', 56, 48, 80, '#e2f1d8');
      e.put('cloud', 34, 11, 15, '#bcdcf7');
      e.put('sun', 65, 9, 13, SUN);
      d.ground('#93d37d');
      e.put('plant', 20, 77, 28, '#2f9e44');
      e.put('earth', 55, 50, 54, '#2f80ed');
      e.put('recycle', 37, 17, 17, '#17a34a');
      e.put('circle', 88, 27, 16, '#fff0b3');
      e.put('sprout', 88, 27, 9, '#17a34a');
      e.put('circle', 93, 51, 13, WHITE);
      e.put('drop', 93, 51, 6, '#4dabf7');
      e.put('plant', 77, 78, 18, '#3aa655');
      e.put('books', 86, 84, 26, '#2f80ed');
      e.put('rays', 16, 52, 6, '#17a34a', { fx: true });
    },
  },
  {
    id: 'ttown', name: '우리 고장', tag: '5학년 사회', title: ['우리 고장의', '자랑거리'],
    bg: '#fff8ea', accent: '#1c64f2', pill: SUN, bar: SUN, soft: '#d3e3fb', icon: ['pin', '#e8443a'],
    back(d) {
      d.put('circle', 1, -1, 21, '#ffd966');
      d.put('ring', 20, -5, 6.5, '#bcd3ff');
      d.put('circle', 97, 4, 6, '#a9c9ff');
      d.put('spark', 89, 10, 4.5, SUN);
    },
    art(e, d) {
      e.put('circle', 56, 40, 76, '#d3e3fb');
      e.put('cloud', 90, 24, 16, WHITE);
      e.put('map', 55, 41, 56, '#7fc77d', { rot: -4 });
      e.put('tree', 38, 39, 7, '#2f9e44');
      e.put('tree', 74, 46, 7, '#2f9e44');
      e.put('pin', 55, 27, 17, '#e8443a');
      e.put('rays', 71, 14, 7, SUN);
      e.put('hill', 82, 83, 72, '#63b85f', { h: 20, fx: true });
      d.ground('#3f9e4d');
      e.put('tree', 13, 77, 12, '#2f9e44');
      e.put('tree', 62, 81, 11, '#3aa655');
      e.put('tree', 78, 77, 12, '#2f9e44');
      e.put('tree', 92, 81, 10, '#3aa655');
      e.put('school', 37, 78, 32, '#f08a3c');
    },
  },
];

/** 테마로 시작한 그림의 모양(발표 화면). */
export const THEME_RATIO = '16:9';

/**
 * 테마의 템플릿들(편집기의 configure({ layouts }) 에 기본 템플릿과 함께 넘긴다). 테마 하나가 묶음 하나다(group = 테마 이름).
 * cover 가 참인 것이 첫 화면의 "주제 테마"에 나온다. ratio 는 첫 화면에서 그것으로 시작할 때의 그림 모양.
 */
export const THEME_LAYOUTS = THEMES.flatMap((t) => [
  { id: t.id, name: '표지', group: t.name, cover: true, ratio: THEME_RATIO, bg: t.bg, items: (a) => cover(t, a) },
  { id: `${t.id}-page`, name: '내용', group: t.name, ratio: THEME_RATIO, bg: t.bg, items: (a) => page(t, a) },
]);

/**
 * 개요로 만드는 장(outline-deck.js)이 쓰는 테마의 색 묶음과 뒤에 깔리는 꾸밈. 그림 묶음(art)은 주제마다의 그림이라 빼고 넘긴다.
 * swatch: 고르는 칩에 쓰는 짧은 색 이름.
 */
const SWATCH = { tnet: '파랑', tdetox: '연두', tai: '하늘', tdream: '노랑', tbook: '보라', tart: '주황', tclass: '분홍', tearth: '초록', ttown: '살구' };
export const THEME_STYLES = Object.freeze(THEMES.map(({ id, name, bg, accent, pill, pillInk, bar, soft, icon, back }) => Object.freeze({
  id, name, swatch: SWATCH[id] || name, bg, ink: INK, accent, pill, pillInk: pillInk || INK, bar, soft, icon, back,
})));
