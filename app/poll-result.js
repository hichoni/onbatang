// 발표 중 투표(GBE-AI Lab 실시간 투표)의 결과를 장 하나로 만든다: 질문 · 칸마다 막대와 몇 명 · 몇 % · 참여한 사람 수와 날짜.
// 발표 화면이 호스트에게 주는 savePoll(result) 이 이 장을 지금 장 다음에 넣는다(활동 결과 장과 같은 "결과" 장).
import { newId } from '../src/document.js';

export const POLL_RESULT_LIMITS = Object.freeze({ options: 4, question: 60, option: 20 });
const plain = (value, max) => Array.from(String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
const text = (value, x, y, w, size, extra = {}) => ({ id: newId('e'), t: 'text', layout: 'slide', text: value, x, y, w, size, font: 'gothic', color: '#273f3a', align: 'c', ...extra });
const bar = (x, y, w, h, color) => ({ id: newId('e'), t: 'shape', layout: 'slide', shape: 'round', x, y, w, h, color });

/** 호스트가 준 결과: { question(60자까지, 없어도 된다), options(2~4개, 20자까지), counts(칸마다 0 이상 정수) } · 안 되면 null */
export function cleanPollResult(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.options) || !Array.isArray(raw.counts)) return null;
  const options = raw.options.map((o) => (typeof o === 'string' ? plain(o, POLL_RESULT_LIMITS.option) : ''));
  if (options.length < 2 || options.length > POLL_RESULT_LIMITS.options || options.some((o) => !o) || new Set(options).size !== options.length) return null;
  if (raw.counts.length !== options.length || !raw.counts.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e6)) return null;
  return { question: typeof raw.question === 'string' ? plain(raw.question, POLL_RESULT_LIMITS.question) : '', options, counts: [...raw.counts] };
}

/**
 * 결과 장(디자인 하나). aspect: 그림의 가로 ÷ 세로. at: 투표한 때(ms, 날짜 글에 쓴다).
 * 칸은 위에서부터 하나씩, 왼쪽에 칸 이름, 가운데 막대(가장 많은 칸은 진한 초록), 오른쪽에 몇 명 · 몇 %.
 */
export function pollResultPage(raw, aspect = 16 / 9, at = Date.now()) {
  const r = cleanPollResult(raw);
  if (!r) return null;
  const wide = aspect >= 1, total = r.counts.reduce((a, b) => a + b, 0), most = Math.max(...r.counts);
  const pct = (n) => (total ? Math.round((n * 100) / total) : 0);
  const items = [
    text('투표 결과', 50, 9, 90, wide ? 2.2 : 3, { color: '#286f62', bold: true }),
    text(r.question || '투표', 50, 21, 90, wide ? 4.4 : 5.6, { bold: true }),
  ];
  const top = 34, bottom = 86, step = (bottom - top) / r.options.length, h = Math.min(step * 0.5, wide ? 10 : 6);
  const left = wide ? 30 : 34, track = wide ? 52 : 44;
  r.options.forEach((name, k) => {
    const y = top + step * (k + 0.5), n = r.counts[k], best = total > 0 && n === most, fill = (track * pct(n)) / 100;
    items.push(text(name, left / 2 + 1, y, left - 4, wide ? 3 : 3.6, { bold: best, valign: 'middle' }));
    items.push(bar(left + track / 2, y, track, h, '#e6ece9'));
    if (fill >= 0.5) items.push(bar(left + fill / 2, y, fill, h, best ? '#2f9e44' : '#74b9a8'));
    items.push(text(`${n}명 · ${pct(n)}%`, left + track + (100 - left - track) / 2, y, 100 - left - track - 2, wide ? 2.2 : 2.8, { bold: best, valign: 'middle' }));
  });
  const day = new Date(at), date = Number.isNaN(day.getTime()) ? '' : ` · ${day.getFullYear()}. ${day.getMonth() + 1}. ${day.getDate()}.`;
  items.push(text(`${total}명 참여${date}`, 50, 94, 90, wide ? 1.8 : 2.4, { color: '#5d6b66' }));
  return { id: newId('p'), source: { kind: 'result' }, bg: '#fffdf5', items };
}
