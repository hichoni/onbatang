// 개요로 만드는 장을 테마 색으로 꾸며 그린다(outline.js 가 쓴다). DOM 을 쓰지 않는 자료와 순수 함수만 둔다.
//
// 장마다 내용을 보고 배치를 고른다(deckKind):
//   표지(첫 장, 내용 한 줄까지) · 나누는 장(내용 없음) · 물음(제목이 ? 로 끝남) · 카드(짧은 줄 3~4개) ·
//   차례(번호 동그라미, 2~5줄) · 점 목록(그 밖, 두 단계) · 마무리(마지막 장, 내용 두 줄까지).
// 테마(themes.js 의 THEME_STYLES)의 바탕 · 강조색 · 밑줄 · 옅은 색 · 뒤에 깔리는 꾸밈을 쓰고, 장마다 낱말에 맞는 그림(도형 그림) 하나를 놓는다.
// 길이는 templates.js 와 같이 카드 너비를 100 으로 본 값이다(세로도 같은 단위, H = 100 ÷ 비율).
import { shapeAsset } from '../src/shapes.js';
import { board, LINE, TITLE_FONT } from './templates.js';
import { decor } from './themes.js';

// 글 한 줄의 너비를 글자 크기의 몇 배인지로 어림한다(한글 1, 빈칸 · 쉼표는 좁게, 영문 · 숫자는 조금 좁게).
const emLen = (line) => [...String(line)].reduce((n, ch) => n + (ch === ' ' ? 0.3 : /[,.!?:·]/.test(ch) ? 0.35 : /[A-Za-z0-9]/.test(ch) ? 0.62 : 1), 0);
const r1 = (v) => Math.round(v * 10) / 10;
/** 너비 w 에 글자 크기 size 로 썼을 때의 줄 수(어림) */
const linesOf = (text, size, w) => Math.max(1, Math.ceil((emLen(text) * size) / (w * 0.97)));

// 낱말 → 그림(src/shapes.js 의 도형 그림). 앞의 것이 먼저다. 맞는 것이 없으면 테마의 그림.
// 한 글자 낱말(해 · 물 · 비 …)은 낱말 그대로일 때만 맞춘다("실험해"의 해, "정리해"의 해는 아니다): 앞은 글의 처음이나 빈칸, 뒤는 끝 · 빈칸 · 조사.
const WORDS = [
  ['sprout', '씨앗 새싹 싹 자라 성장'], ['tree', '나무 숲'], ['leaf', '나뭇잎 가을 단풍 잎'], ['plant', '식물 꽃 풀'],
  ['drop', '물 비 순환 바다 강 빗물 눈물'], ['recycle', '재활용 쓰레기 분리배출'], ['earth', '지구 환경 기후 생태 오염'],
  ['sun', '해 태양 햇빛 햇볕 날씨 여름 온도'], ['cloud', '구름 하늘 바람'], ['map', '지도 고장 마을 동네 지역'], ['pin', '장소 위치 여행'],
  ['school', '학교 교실 수업 선생님'], ['openbook', '책 독서 읽기 이야기 동화'], ['pencil', '글쓰기 일기 연필 기록'],
  ['magnifier', '관찰 조사 탐구 실험 살펴'], ['bulb', '생각 아이디어 발견 원리 까닭 이유'], ['flag', '목표 꿈 도전 계획 다짐'],
  ['trophy', '상장 우승 성공 칭찬 최고'], ['robot', '인공지능 AI 로봇'], ['codewin', '코딩 프로그램 알고리즘'], ['laptop', '인터넷 컴퓨터 정보 디지털'],
  ['phone', '휴대폰 스마트폰 전화 문자'], ['shield', '안전 보호 지키 규칙 예절'], ['globe', '세계 나라 지구본'],
  ['chat', '대화 말하기 토론 소통 발표 의견'], ['person', '친구 사람 가족 이웃'], ['heart', '마음 사랑 배려 감사 따뜻 고마'],
  ['palette', '미술 그림 색칠 작품 색깔 색'], ['checkcard', '확인 정리 점검 체크 약속'], ['thought', '질문 궁금'], ['star', '별 빛나'],
];
const JOSA = '이가은는을를와과도의에로만';
const PICTURES = WORDS.map(([id, list]) => [new RegExp(list.split(' ').map((w) => (Array.from(w).length > 1 ? w
  : `(?:^|\\s)${w}(?=$|\\s|[${JOSA}][^\\uac00-\\ud7a3]|[${JOSA}]$)`)).join('|'), 'i'), id]);
/** 그 글에 어울리는 그림의 이름(없으면 null) */
export function pictureFor(text) {
  const s = String(text || '');
  return PICTURES.find(([re]) => re.test(s))?.[1] || null;
}

/** 장의 배치 이름. at: 몇째 장, count: 모두 몇 장 */
export function deckKind({ title, lines }, at, count) {
  const plain = lines.every((l) => l.level === 1);
  if (at === 0 && lines.length <= 1) return 'cover';
  if (count > 1 && at === count - 1 && lines.length <= 2 && !/\?$/.test(title)) return 'closing';
  if (!lines.length) return 'section';
  if (/\?\s*$/.test(title)) return 'question';
  if (plain && lines.length >= 3 && lines.length <= 4 && lines.every((l) => emLen(l.text) <= 16)) return 'cards';
  if (plain && lines.length >= 2 && lines.length <= 5) return 'steps';
  return 'bullets';
}

/**
 * 한 장의 요소들(cleanItem 전의 날 것). style: THEME_STYLES 의 하나, a: 가로 ÷ 세로, page: { title, lines },
 * kind: deckKind, n: 나누는 장의 번호. font: 본문 글꼴. 돌려주는 것: { items, rest }(들어가지 않은 내용 줄은 rest 로).
 */
export function deckPage(style, a, page, kind, { n = 1, font } = {}) {
  const b = board(a), { H, wide } = b, d = decor(b);
  const k = wide ? 1 : a < 0.7 ? 1.55 : 1.4;                         // 정사각형 · 세로는 글을 크게
  const L = wide ? 6.8 : 8, ink = style.ink;
  const body = font ? { font } : {};
  const text = (t, { left, top, w, size, color = ink, bold = false, align = 'l', title = false, lh = LINE }) => {
    const rows = linesOf(t, size, w);
    b.items.push({ t: 'text', text: t, x: left + w / 2, y: r1(((top + (rows * size * lh) / 2) / H) * 100), w, size: r1(size), color, bold, align, lh,
      ...(title && TITLE_FONT ? { font: TITLE_FONT } : body) });
    return top + rows * size * lh;
  };
  const pic = (id, cx, cy, size, color) => {
    const asset = shapeAsset(id) || shapeAsset(style.icon[0]);
    const w = size * Math.min(1, asset.w / asset.h), h = (w * asset.h) / asset.w;
    b.shape(asset.id, { left: cx - w / 2, top: cy - h / 2, w, h, color });
  };
  const words = [page.title, ...page.lines.map((l) => l.text)].join(' ');
  const picture = pictureFor(page.title) || pictureFor(words) || style.icon[0];
  const picColor = picture === style.icon[0] ? style.icon[1] : style.accent;
  // 제목(소제목)과 그 아래 짧은 밑줄. 두 줄까지 들어가게 글자를 줄인다.
  const heading = (t, { top, w, base }) => {
    const size = Math.max(3.4 * k, Math.min(base, (w * 2) / Math.max(1, emLen(t))));
    const end = text(t, { left: L, top, w, size, bold: true, title: true, lh: 1.2 });
    const bar = wide ? { w: 11, h: 1.4 } : { w: 16, h: 1.9 };
    b.shape('pill', { left: L, top: end + bar.h * 0.8, w: bar.w, h: bar.h, color: style.bar });
    return end + bar.h * 1.8 + (wide ? 3.6 : 6);
  };
  // 오른쪽 아래의 옅은 동그라미와 그림(내용 장)
  const halo = (size = wide ? 24 : 30) => {
    const cx = wide ? 84 : 78, cy = H - size * 0.62;
    b.shape('circle', { left: cx - size / 2, top: cy - size / 2, w: size, h: size, color: style.soft });
    pic(picture, cx, cy, size * 0.58, picColor);
    return { left: cx - size / 2, top: cy - size / 2 };
  };
  let rest = [];
  // 아래 끝에서 이만큼은 비운다(테마의 꾸밈이 왼쪽 아래 귀퉁이에 깔린다).
  const foot = wide ? 9 : 14;
  style.back(d);
  if (kind === 'cover') {
    // 왼쪽(정사각형 · 세로는 위)에 두 줄 제목(둘째 줄 강조색) · 밑줄 · 소개 한 줄, 오른쪽(아래)에 큰 그림
    const colW = wide ? 54 : 84;
    const cut = splitTitle(page.title);
    const size = Math.max(5.2 * k, Math.min(wide ? 8.6 : 11, colW / Math.max(1, ...cut.map(emLen))));
    const block = cut.length * size * 1.15 + 14;
    // 그림: 가로는 오른쪽 가운데, 정사각형 · 세로는 제목 묶음 바로 아래(아래 끝을 넘지 않게)
    const big = wide ? 40 : 56, cx = wide ? 76 : 64, cy = wide ? H * 0.54 : Math.min(H - big * 0.55, 12 + block + big * 0.62);
    b.shape('circle', { left: cx - big / 2, top: cy - big / 2, w: big, h: big, color: style.soft });
    b.shape('ring', { left: cx + big * 0.28, top: cy - big * 0.52, w: big * 0.22, h: big * 0.22, color: style.accent, op: 35 });
    pic(picture, cx, cy, big * 0.56, picColor);
    let top = wide ? Math.max(6, H * 0.5 - block / 2) : 12;
    cut.forEach((line, i) => { top = text(line, { left: L, top, w: colW + 2, size, color: i ? style.accent : ink, bold: true, title: true, lh: 1.15 }); });
    b.shape('pill', { left: L, top: top + 2, w: wide ? 12 : 18, h: wide ? 1.5 : 2, color: style.bar });
    if (page.lines[0]) text(page.lines[0].text, { left: L, top: top + (wide ? 6 : 8), w: colW, size: 3 * k, color: ink });
  } else if (kind === 'section') {
    // 큰 번호와 제목, 오른쪽에 그림
    if (wide) {
      b.shape('circle', { left: 62, top: H * 0.5 - 20, w: 40, h: 40, color: style.soft });
      pic(picture, 82, H * 0.5, 20, picColor);
    }
    const top = wide ? H * 0.5 - 14 : H * 0.18;
    const end = text(String(n).padStart(2, '0'), { left: L, top, w: 30, size: 11 * k, color: style.accent, bold: true, title: true, lh: 1 });
    b.shape('pill', { left: L, top: end + 1.5, w: wide ? 11 : 16, h: wide ? 1.4 : 1.9, color: style.bar });
    const after = text(page.title, { left: L, top: end + 5, w: wide ? 52 : 84, size: Math.min(7 * k, ((wide ? 52 : 84) * 2) / Math.max(1, emLen(page.title))), bold: true, title: true, lh: 1.2 });
    if (!wide) {
      const size = Math.min(40, H - after - 10), cy = Math.min(H - size / 2 - 4, after + 8 + size / 2);
      b.shape('circle', { left: 92 - size, top: cy - size / 2, w: size, h: size, color: style.soft });
      pic(picture, 92 - size / 2, cy, size * 0.5, picColor);
    }
  } else if (kind === 'question') {
    // 큰 물음표 · 물음 · 생각해 볼 줄들
    b.shape('circle', { left: L - 2, top: wide ? 6 : 10, w: wide ? 18 : 26, h: wide ? 18 : 26, color: style.soft });
    text('?', { left: L - 2, top: wide ? 6.5 : 10.5, w: wide ? 18 : 26, size: wide ? 13 : 19, color: style.accent, bold: true, align: 'c', title: true, lh: 1.25 });
    const left = wide ? L + 22 : L, w = wide ? 64 : 84;
    let top = wide ? 8 : 42;
    const size = Math.max(4 * k, Math.min(6.4 * k, (w * 2) / Math.max(1, emLen(page.title))));
    top = text(page.title, { left, top, w, size, bold: true, title: true, lh: 1.2 }) + (wide ? 4 : 6);
    for (const l of page.lines) {
      if (top > H - 5 * k) { rest.push(l); continue; }
      b.shape('spark', { left, top: top + 0.4 * k, w: 2.6 * k, h: 2.6 * k, color: style.bar });
      top = text(l.text, { left: left + 4 * k, top, w: w - 4 * k, size: 3.2 * k }) + 1.6 * k;
    }
  } else if (kind === 'closing') {
    // 가운데 큰 글과 그 위의 그림, 둘레의 반짝임
    b.shape('circle', { left: 50 - 9 * k, top: wide ? 6 : 14, w: 18 * k, h: 18 * k, color: style.soft });
    pic(picture === style.icon[0] ? 'heart' : picture, 50, (wide ? 6 : 14) + 9 * k, 10 * k, picture === style.icon[0] ? style.accent : picColor);
    b.shape('spark', { left: 50 + 12 * k, top: wide ? 7 : 15, w: 3.6 * k, h: 3.6 * k, color: style.bar });
    const w = 84, size = Math.max(5 * k, Math.min(8 * k, (w * 2) / Math.max(1, emLen(page.title))));
    let top = text(page.title, { left: 8, top: (wide ? 6 : 14) + 21 * k, w, size, bold: true, align: 'c', title: true, lh: 1.2 }) + 3;
    for (const l of page.lines) top = text(l.text, { left: 12, top, w: 76, size: 3.4 * k, align: 'c' }) + 1;
  } else if (kind === 'cards') {
    // 소제목 아래로 카드 3~4장(카드마다 그림 하나와 짧은 글)
    const top = heading(page.title, { top: wide ? 6.5 : 10, w: 84, base: 5.8 * k });
    const n2 = page.lines.length;
    if (a < 0.7) {
      // 세로로 긴 그림: 카드를 위아래로 쌓는다(그림은 왼쪽, 글은 오른쪽)
      const gap = 4, ch = Math.min(30, (H - top - foot - gap * (n2 - 1)) / n2);
      page.lines.forEach((l, i) => {
        const y = top + i * (ch + gap), dot = ch * 0.7;
        b.shape('round', { left: L, top: y, w: 100 - L * 2, h: ch, color: '#ffffff', r: 18 });
        b.shape('circle', { left: L + ch * 0.15, top: y + ch * 0.15, w: dot, h: dot, color: style.soft });
        pic(pictureFor(l.text) || [style.icon[0], 'star', 'bulb', 'check'][i % 4], L + ch * 0.15 + dot / 2, y + ch / 2, dot * 0.56, i % 2 ? style.accent : style.icon[1]);
        const w = 100 - L * 2 - ch - 4, size = Math.min(5.2, (w * 2) / Math.max(1, emLen(l.text)));
        text(l.text, { left: L + ch + 2, top: y + ch / 2 - (linesOf(l.text, size, w) * size * LINE) / 2, w, size, bold: true });
      });
      return { items: b.items, rest };
    }
    const across = wide || n2 === 3 ? n2 : 2;
    const gap = wide ? 3 : 4, cw = (100 - L * 2 - gap * (across - 1)) / across;
    const rows = Math.ceil(n2 / across), ch = Math.min(wide ? 30 : 46, (H - top - 5 - gap * (rows - 1)) / rows);
    page.lines.forEach((l, i) => {
      const left = L + (i % across) * (cw + gap), y = top + Math.floor(i / across) * (ch + gap);
      b.shape('round', { left, top: y, w: cw, h: ch, color: '#ffffff', r: 18 });
      const id = pictureFor(l.text) || [style.icon[0], 'star', 'bulb', 'check'][i % 4];
      b.shape('circle', { left: left + cw / 2 - ch * 0.2, top: y + ch * 0.1, w: ch * 0.4, h: ch * 0.4, color: style.soft });
      pic(id, left + cw / 2, y + ch * 0.3, ch * 0.24, i % 2 ? style.accent : style.icon[1]);
      const size = Math.min(3.6 * k, (cw * 0.9 * 2) / Math.max(1, emLen(l.text)));
      text(l.text, { left: left + cw * 0.06, top: y + ch * 0.6, w: cw * 0.88, size, bold: true, align: 'c' });
    });
  } else if (kind === 'steps') {
    // 번호 동그라미와 한 줄씩. 오른쪽 아래에 그림
    const top0 = heading(page.title, { top: wide ? 6.5 : 10, w: wide ? 76 : 84, base: 5.8 * k });
    const h = halo();
    const dot = 5.2 * k, w = (wide ? h.left - 3 : 84) - L - dot - 2.6 * k;
    let size = 3.5 * k;
    const tall = (sz) => page.lines.reduce((sum, l) => sum + Math.max(dot, linesOf(l.text, sz, w) * sz * LINE) + 2.2 * k, 0);
    while (size > 2.8 * k && top0 + tall(size) > H - foot) size -= 0.1 * k;
    let top = top0;
    page.lines.forEach((l, i) => {
      if (top + dot > H - foot + 1) { rest.push(l); return; }
      const rowH = Math.max(dot, linesOf(l.text, size, w) * size * LINE);
      b.shape('circle', { left: L, top: top + (rowH - dot) / 2, w: dot, h: dot, color: style.accent });
      text(String(i + 1), { left: L + dot / 2 - 5, top: top + rowH / 2 - (3 * k * LINE) / 2, w: 10, size: 3 * k, color: '#ffffff', bold: true, align: 'c' });
      text(l.text, { left: L + dot + 2.6 * k, top: top + (rowH - linesOf(l.text, size, w) * size * LINE) / 2, w, size, bold: true });
      top += rowH + 2.2 * k;
    });
  } else {
    // 점 목록: 1 단계는 강조색 점, 2 단계는 옅은 점과 조금 들여서
    const top0 = heading(page.title, { top: wide ? 6.5 : 10, w: wide ? 76 : 84, base: 5.8 * k });
    const h = halo(wide ? 20 : 26);
    const right = wide ? h.left - 2 : 92;
    const width = (l) => right - L - (l.level === 2 ? 9 : 4.5) * k;
    const sub = (sz, l) => (l.level === 2 ? sz * 0.88 : sz);
    let size = 3.4 * k;
    const tall = (sz) => page.lines.reduce((sum, l) => sum + linesOf(l.text, sub(sz, l), width(l)) * sub(sz, l) * LINE + 1.5 * k, 0);
    while (size > 2.7 * k && top0 + tall(size) > H - foot) size -= 0.1 * k;
    let top = top0;
    for (const l of page.lines) {
      const s = sub(size, l), rowH = linesOf(l.text, s, width(l)) * s * LINE;
      if (top + rowH > H - foot + 1) { rest.push(l); continue; }
      const dx = l.level === 2 ? 4.5 * k : 0, dot = l.level === 2 ? 1.3 * k : 1.7 * k;
      b.shape('circle', { left: L + dx, top: top + (s * LINE) / 2 - dot / 2, w: dot, h: dot, color: l.level === 2 ? style.bar : style.accent });
      text(l.text, { left: L + dx + 3.6 * k, top, w: width(l), size: s, bold: l.level === 1 && size > 3 * k });
      top += rowH + 1.5 * k;
    }
  }
  return { items: b.items, rest };
}

// 표지 제목을 두 줄로(둘째 줄은 강조색): 띄어쓰기가 있으면 가운데에 가까운 곳에서 나눈다.
function splitTitle(title) {
  const t = String(title || '').trim();
  const spaces = [...t.matchAll(/ /g)].map((m) => m.index);
  if (!spaces.length || emLen(t) < 7) return [t];
  const mid = emLen(t) / 2;
  const at = spaces.reduce((best, i) => (Math.abs(emLen(t.slice(0, i)) - mid) < Math.abs(emLen(t.slice(0, best)) - mid) ? i : best), spaces[0]);
  return [t.slice(0, at), t.slice(at + 1)];
}
