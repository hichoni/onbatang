// 개요로 장 만들기: 줄글 개요를 읽어 장(슬라이드) 여러 장을 만든다(화면을 모르는 자료 · 바깥에 보내지 않는다).
// 개요 쓰는 법: 들여 쓰지 않은 줄(또는 # 으로 시작하는 줄)은 새 장의 제목, 그 아래의 들여 쓴 줄 · "- · • · 1." 로 시작하는 줄은 그 장의 내용,
// 더 들여 쓴 줄은 한 단계 아래 내용, ">" 로 시작하는 줄은 그 장의 발표자 노트. 빈 줄은 건너뛴다.
import { BACKGROUNDS, cleanItem, newShape, settings, textLimit } from '../src/model.js';
import { newId, cleanNotes } from '../src/document.js';
import { slideMotion } from './designs.js';

const BULLET = /^([-*+•·◦▪‣])\s+/;
const NUMBERED = /^\d{1,2}[.)]\s+/;
const HEADING = /^#{1,6}\s+/;
/** 한 장에 놓는 내용 줄 수(넘치면 "제목 (이어서)" 장으로 넘긴다) */
export const OUTLINE_LINES = 6;

/** 개요 글 → [{ title, lines: [{ text, level: 1 | 2 }], notes }] */
export function parseOutline(text) {
  const out = [];
  let cur = null;
  const open = (title) => { cur = { title, lines: [], notes: [], indents: [] }; out.push(cur); return cur; };
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const indent = raw.match(/^[ \t　]*/)[0].replace(/\t/g, '    ').replace(/　/g, '  ').length;
    if (line.startsWith('>')) { (cur || open('')).notes.push(line.replace(/^>+\s*/, '')); continue; }
    if (HEADING.test(line) || (indent === 0 && !BULLET.test(line) && !NUMBERED.test(line))) { open(line.replace(HEADING, '')); continue; }
    const slide = cur || open('');
    slide.lines.push(line.replace(BULLET, ''));
    slide.indents.push(indent);
  }
  // 단계: 그 장에서 가장 얕은 내용 줄이 1 단계, 그보다 깊으면 2 단계.
  return out.map(({ title, lines, notes, indents }) => {
    const base = Math.min(...indents);
    return { title, lines: lines.map((t, k) => ({ text: t, level: indents[k] > base ? 2 : 1 })), notes: notes.join('\n') };
  });
}

// 바탕(목록의 이름표 또는 색)에 어울리는 글자색 · 강조색
function inkOf(bg) {
  const known = BACKGROUNDS.find((b) => b.id === bg || b.bg === String(bg).toLowerCase());
  if (known) return { ink: known.ink, accent: known.accent };
  const hex = /^#([0-9a-f]{6})$/i.exec(String(bg))?.[1];
  const [r, g, b] = hex ? [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255) : [1, 1, 1];
  const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
  return dark ? { ink: '#ffffff', accent: '#ffd43b' } : { ink: '#1d2433', accent: '#d9480f' };
}
// 글상자 하나가 차지하는 높이(카드 높이의 %): 한 줄에 들어가는 글자 수로 줄 수를 어림한다(한글 한 자 ≈ 글자 크기, 그 밖은 0.6 자).
function heightOf(text, size, w, aspect, lh = 1.3) {
  const wide = Array.from(text).reduce((n, ch) => n + (/[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 1 : 0.6), 0);
  const lines = Math.max(1, Math.ceil(wide * size / w));
  return lines * size * lh * aspect;
}

/**
 * 읽은 개요 → 새 장들. bg: 바탕, font: 글꼴(없으면 기본), like: 움직임(조합 · 전환 효과)을 이어받을 장, room: 만들 수 있는 장 수.
 * 돌려주는 것: { slides, cut(못 만든 장 수) }. 내용이 많은 장은 OUTLINE_LINES 줄씩 나눠 "제목 (이어서)" 장을 더 만든다.
 */
export function outlineSlides(sections, { bg, font, like = null, room = Infinity } = {}) {
  const aspect = settings().aspect || 16 / 9;
  const { ink, accent } = inkOf(bg);
  const text = (t, extra) => cleanItem({ t: 'text', id: newId(), text: t, color: ink, ...(font ? { font } : {}), ...extra }, { keepSpaces: true });
  const limit = (t) => Array.from(t).slice(0, textLimit({ t: 'text' })).join('');
  // 한 장을 그린다. 내용이 남은 높이에 들어가지 않으면 가장 작은 글자로 들어가는 만큼만 놓고 나머지 줄을 돌려준다(그 줄들은 다음 "(이어서)" 장으로).
  const page = ({ title, lines, notes }) => {
    const items = [];
    let rest = [];
    if (!lines.length) {
      // 내용이 없는 장: 가운데 큰 제목과 그 아래 짧은 띠(표지 · 나누는 장).
      const size = Array.from(title).length > 14 ? 6.5 : 8.5, h = heightOf(title, size, 86, aspect, 1.25);
      if (title) items.push(text(limit(title), { x: 50, y: 46, w: 86, size, bold: true, align: 'c', lh: 1.25 }));
      items.push(newShape('line', { id: newId(), x: 50, y: Math.min(90, 46 + h / 2 + 6), w: 20, h: 1.4 * aspect, color: accent }));
    } else {
      let y = 7;
      if (title) {
        const size = Array.from(title).length > 22 ? 5.5 : 6.5, h = heightOf(title, size, 88, aspect, 1.25);
        items.push(text(limit(title), { x: 50, y: y + h / 2, w: 88, size, bold: true, align: 'l', lh: 1.25 }));
        y += h + 2.5;
        items.push(newShape('line', { id: newId(), x: 6 + 7, y, w: 14, h: 1.2 * aspect, color: accent }));
        y += 5;
      }
      // 내용: 남은 높이에 들어가도록 글자 크기를 줄여 본다(5 → 3.4). 그래도 넘치면 뒤의 줄부터 다음 장으로 넘긴다.
      let rows = lines.map(({ text: t, level }) => ({ t: limit(/^\d{1,2}[.)]\s/.test(t) ? t : `${level === 2 ? '◦' : '•'} ${t}`), level, line: { text: t, level } }));
      const sub = (size, r) => (r.level === 2 ? Math.round(size * 0.88 * 10) / 10 : size);
      const width = (r) => (r.level === 2 ? 80 : 86);
      const tall = (size) => rows.reduce((n, r) => n + heightOf(r.t, sub(size, r), width(r), aspect) + size * 0.4 * aspect, 0);
      let size = 5;
      while (size > 3.4 && y + tall(size) > 95) size = Math.round((size - 0.2) * 10) / 10;
      while (rows.length > 1 && y + tall(size) > 95) rest = [rows.pop().line, ...rest];
      for (const r of rows) {
        const s = sub(size, r), h = heightOf(r.t, s, width(r), aspect);
        items.push(text(r.t, { x: r.level === 2 ? 56 : 50, y: y + h / 2, w: width(r), size: s, align: 'l' }));
        y += h + size * 0.4 * aspect;
      }
    }
    const note = cleanNotes(notes);
    return { slide: { id: newId('p'), ...(bg === undefined ? {} : { bg }), items: items.filter(Boolean), ...(note ? { notes: note } : {}), ...slideMotion(like) }, rest };
  };
  // 장들: 개요의 한 덩이를 OUTLINE_LINES 줄씩 나누고, 그래도 넘치는 줄은 그다음 장으로 미룬다.
  const queue = [];
  for (const s of sections) {
    for (let k = 0; k < Math.max(1, s.lines.length); k += OUTLINE_LINES) {
      queue.push({ title: k && s.title ? `${s.title} (이어서)` : s.title, base: s.title, lines: s.lines.slice(k, k + OUTLINE_LINES), notes: k ? '' : s.notes });
    }
  }
  const made = [];
  let cut = 0;
  for (let k = 0; k < queue.length; k++) {
    if (made.length >= room) { cut++; continue; }
    const { slide, rest } = page(queue[k]);
    made.push(slide);
    if (rest.length) {
      const next = queue[k + 1];
      // 다음 덩이가 같은 장의 "(이어서)" 이면 그 앞에 붙이고, 아니면 "(이어서)" 장을 하나 끼운다.
      if (next && next.base === queue[k].base && next.title !== next.base) next.lines = [...rest, ...next.lines];
      else queue.splice(k + 1, 0, { title: queue[k].base ? `${queue[k].base} (이어서)` : '', base: queue[k].base, lines: rest, notes: '' });
    }
  }
  return { slides: made, cut };
}

/**
 * 가이X 가 써 준 답 → 개요 글. 코드 블록(```)이 있으면 그 안만 쓰고, 굵게 · 기울임 표시를 떼고,
 * 들여 쓰지 않은 줄 앞의 "1.", "1장:", "슬라이드 1:" 같은 장 번호는 떼어 제목으로 읽히게 한다. 200줄까지.
 */
export function outlineFromAnswer(answer) {
  const text = String(answer ?? '').replace(/\r\n?/g, '\n');
  const fenced = /```[^\n]*\n([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).split('\n')
    .map((line) => line.replace(/\*\*|__|`/g, '').replace(/\s+$/, ''))
    .map((line) => (/^\S/.test(line) ? line.replace(/^(?:#{1,6}\s+)?(?:(?:\d{1,2}\s*장\s*[:.)]?|슬라이드\s*\d{1,2}\s*[:.)]?|\d{1,2}[.)])\s*)?/, '') : line))
    .filter((line, k, all) => line.trim() || (k && all[k - 1].trim()))
    .slice(0, 200).join('\n').trim();
}
