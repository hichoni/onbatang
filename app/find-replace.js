// 찾아 바꾸기: 모든 장의 글상자 · 연결선 위의 글(과 고르면 발표자 노트)에서 글을 찾고 바꾼다(화면을 모르는 순수한 함수).
// 잠긴 요소는 건너뛴다(캔바와 같다). 바꾼 글이 그 요소의 글자 한도를 넘으면 그 요소는 바꾸지 않고 센다.
import { cleanNotes } from '../src/document.js';
import { LINK_LABEL_MAX } from '../src/links.js';
import { shiftRuns } from '../src/runs.js';

// 요소에서 찾을 글이 든 칸: 글상자는 text, 연결선은 선 위의 글(label)
const fieldOf = (it) => (it?.lock ? null : it?.t === 'text' ? 'text' : it?.t === 'link' && typeof it.label === 'string' ? 'label' : null);

const pattern = (find, caseSensitive) => new RegExp(String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
const countIn = (text, re) => (typeof text === 'string' && text ? (text.match(re) || []).length : 0);

/** 찾은 곳: { total, slides: [{ index, count }] } (찾을 글이 비면 0). */
export function findText(slides, { find = '', caseSensitive = false, notes = true } = {}) {
  if (!find) return { total: 0, slides: [] };
  const re = pattern(find, caseSensitive), out = [];
  (Array.isArray(slides) ? slides : []).forEach((slide, index) => {
    let count = 0;
    for (const it of slide?.items || []) { const key = fieldOf(it); if (key) count += countIn(it[key], re); }
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
      const key = fieldOf(it);
      if (!key) return it;
      const hits = countIn(it[key], re);
      if (!hits) return it;
      const text = it[key].replace(re, () => replace);
      // 선 위의 글은 한 줄 · LINK_LABEL_MAX 자. 비면 글을 뗀다.
      if (key === 'label') {
        const label = text.replace(/\s+/g, ' ').trim();
        if (Array.from(label).length > LINK_LABEL_MAX) { skipped++; return it; }
        count += hits; changed = true;
        const { label: _, ...rest } = it;
        return label ? { ...it, label } : rest;
      }
      if (text.length > limit(it)) { skipped++; return it; }
      count += hits; changed = true;
      if (!it.runs?.length) return { ...it, text };
      // 부분 서식: 찾은 곳을 뒤에서부터 하나씩 바꾸며 구간을 맞춘다(바꾼 글은 찾은 글의 첫 글자 서식을 따른다).
      let now = it[key], runs = it.runs;
      for (const m of [...it[key].matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].reverse()) {
        const after = now.slice(0, m.index) + replace + now.slice(m.index + m[0].length);
        runs = shiftRuns(now, after, runs, { ...it, text: now });
        now = after;
      }
      return { ...it, text, runs };
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
