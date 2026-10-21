// 찾아 바꾸기: 모든 장의 글상자(와 고르면 발표자 노트)에서 글을 찾고 바꾼다(화면을 모르는 순수한 함수).
// 잠긴 요소는 건너뛴다(캔바와 같다). 바꾼 글이 그 글상자의 글자 한도를 넘으면 그 글상자는 바꾸지 않고 센다.
import { cleanNotes } from '../src/document.js';

const pattern = (find, caseSensitive) => new RegExp(String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
const countIn = (text, re) => (typeof text === 'string' && text ? (text.match(re) || []).length : 0);

/** 찾은 곳: { total, slides: [{ index, count }] } (찾을 글이 비면 0). */
export function findText(slides, { find = '', caseSensitive = false, notes = true } = {}) {
  if (!find) return { total: 0, slides: [] };
  const re = pattern(find, caseSensitive), out = [];
  (Array.isArray(slides) ? slides : []).forEach((slide, index) => {
    let count = 0;
    for (const it of slide?.items || []) if (it?.t === 'text' && !it.lock) count += countIn(it.text, re);
    if (notes) count += countIn(slide?.notes, re);
    if (count) out.push({ index, count });
  });
  return { total: out.reduce((n, v) => n + v.count, 0), slides: out };
}

/**
 * 모두 바꾼다. limit(item) 은 그 글상자에 넣을 수 있는 글자 수.
 * 돌려주는 것: { slides(새 목록, 바뀌지 않은 장은 같은 객체), count(바꾼 곳), skipped(한도를 넘어 바꾸지 않은 글상자 수) }
 */
export function replaceText(slides, { find = '', replace = '', caseSensitive = false, notes = true, limit = () => Infinity } = {}) {
  const list = Array.isArray(slides) ? slides : [];
  if (!find) return { slides: list, count: 0, skipped: 0 };
  const re = pattern(find, caseSensitive);
  let count = 0, skipped = 0;
  const next = list.map((slide) => {
    let changed = false;
    const items = (slide?.items || []).map((it) => {
      if (it?.t !== 'text' || it.lock) return it;
      const hits = countIn(it.text, re);
      if (!hits) return it;
      const text = it.text.replace(re, () => replace);
      if (text.length > limit(it)) { skipped++; return it; }
      count += hits; changed = true;
      return { ...it, text };
    });
    let out = changed ? { ...slide, items } : slide;
    const hits = notes ? countIn(slide?.notes, re) : 0;
    if (hits) {
      const text = cleanNotes(slide.notes.replace(re, () => replace));
      count += hits;
      out = { ...out };
      if (text) out.notes = text; else delete out.notes;
    }
    return out;
  });
  return { slides: next, count, skipped };
}
