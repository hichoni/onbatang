// 퀴즈 장: 문제 하나 · 보기 2~4개 · 정답 · 제한 시간. 스크립트 · 주소 · 계정 없이 그림 안에 자료로만 산다.
// 표지(cover)는 보통 요소(글 · 도형)라서 그림 · PDF · PPTX 로 내보내도 문제와 보기가 그대로 보인다(정답은 보이지 않는다).
// 발표에서는 app/quiz.js 가 문제를 띄우고 시간을 재고 정답을 보여 준다. GBE-AI Lab 발표에서는 학생 휴대폰의 답을 받아 점수를 낸다.
import { DocumentError, isId, isObject, newId } from './document.js';

export const QUIZ_LIMITS = Object.freeze({ question: 120, choice: 40, choicesMin: 2, choicesMax: 4, explain: 200 });
export const QUIZ_SECONDS = Object.freeze([0, 10, 20, 30, 60]);   // 0: 시간 제한 없음
// 보기마다 색과 모양(색을 구별하기 어려운 학생도 모양으로 찾는다)
export const QUIZ_CHOICES = Object.freeze([
  { color: '#e5484d', mark: '▲', name: '빨강 세모' },
  { color: '#3e63dd', mark: '◆', name: '파랑 마름모' },
  { color: '#e9a23b', mark: '●', name: '노랑 동그라미' },
  { color: '#30a46c', mark: '■', name: '초록 네모' },
]);
export const QUIZ_POINTS = 1000;

const invalid = (raw, key) => { throw new DocumentError('INVALID_ACTIVITY', `activity.${key}`, raw); };
const plain = (value, max) => Array.from(String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').trim()).slice(0, max).join('');
const oneLine = (value, max) => plain(String(value ?? '').replace(/\s+/g, ' '), max);

export function cleanQuizActivity(raw) {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) invalid(raw, 'value');
  if (raw.version !== 1 || raw.kind !== 'quiz') invalid(raw, 'kind');
  if (!isId(raw.id)) invalid(raw, 'id');
  const question = typeof raw.question === 'string' ? plain(raw.question, QUIZ_LIMITS.question) : '';
  if (!question) invalid(raw, 'question');
  if (!Array.isArray(raw.choices) || raw.choices.length < QUIZ_LIMITS.choicesMin || raw.choices.length > QUIZ_LIMITS.choicesMax) invalid(raw, 'choices');
  const choices = raw.choices.map((c) => (typeof c === 'string' ? oneLine(c, QUIZ_LIMITS.choice) : ''));
  if (choices.some((c) => !c)) invalid(raw, 'choices');
  if (!Number.isInteger(raw.answer) || raw.answer < 0 || raw.answer >= choices.length) invalid(raw, 'answer');
  if (!QUIZ_SECONDS.includes(raw.seconds)) invalid(raw, 'seconds');
  if (raw.explain !== undefined && typeof raw.explain !== 'string') invalid(raw, 'explain');
  const explain = plain(raw.explain, QUIZ_LIMITS.explain);
  return { version: 1, kind: 'quiz', id: raw.id, question, choices, answer: raw.answer, seconds: raw.seconds, ...(explain ? { explain } : {}) };
}

export function newQuizActivity(options = {}) {
  return cleanQuizActivity({ version: 1, kind: 'quiz', id: newId('a'), question: '문제를 적어 주세요', choices: ['보기 1', '보기 2', '보기 3', '보기 4'], answer: 0, seconds: 20, ...options });
}

const ratio = (value) => (typeof value === 'number' && value >= 0.25 && value <= 4 ? value : 16 / 9);
const text = (value, x, y, w, size, extra = {}) => ({ id: newId('e'), t: 'text', layout: 'slide', text: value, x, y, w, size, color: '#273f3a', align: 'c', font: 'gothic', ...extra });
const box = (x, y, w, h, color, shape = 'round') => ({ id: newId('e'), t: 'shape', layout: 'slide', shape, x, y, w, h, color });

/** 보기 칸의 자리(가운데 x · y, 너비 · 높이, 그림 너비에 대한 %). 넓은 그림은 2×2, 좁은(세로) 그림은 한 줄에 하나. */
export function quizTiles(count, aspect = 16 / 9) {
  const ar = ratio(aspect), wide = ar >= 1.1, rows = wide ? Math.ceil(count / 2) : count, cols = wide ? Math.min(2, count) : 1;
  const top = wide ? 44 : 38, bottom = 92, gap = 2.4, w = cols === 2 ? 44 : 84;
  const h = Math.min(wide ? 20 : 12, (bottom - top - gap * (rows - 1)) / rows);
  return Array.from({ length: count }, (_, k) => {
    const r = cols === 2 ? Math.floor(k / 2) : k, c = cols === 2 ? k % 2 : 0;
    const alone = cols === 2 && count % 2 === 1 && k === count - 1;   // 보기가 셋이면 마지막 칸은 가운데
    return { x: cols === 2 && !alone ? 50 + (c ? 1 : -1) * (w / 2 + gap / 2) : 50, y: top + h / 2 + r * (h + gap), w, h };
  });
}

/** 표지: 위에 "퀴즈", 가운데 문제, 아래에 보기 칸(색 · 모양 · 글). 보통 요소라 그대로 고칠 수도 있다. */
export function quizCover(raw, aspect) {
  const quiz = cleanQuizActivity(raw), ar = ratio(aspect), wide = ar >= 1.1;
  const items = [
    box(50, wide ? 8 : 6, wide ? 14 : 26, wide ? 6 : 4, '#273f3a', 'pill'),
    text(quiz.seconds ? `퀴즈 · ${quiz.seconds}초` : '퀴즈', 50, wide ? 8 : 6, wide ? 14 : 26, wide ? 2.2 : 3, { color: '#ffffff', bold: true }),
    text(quiz.question, 50, wide ? 25 : 21, 90, quiz.question.length > 60 ? (wide ? 3.6 : 4.2) : (wide ? 4.6 : 5.4), { bold: true }),
  ];
  quizTiles(quiz.choices.length, ar).forEach((t, k) => {
    const look = QUIZ_CHOICES[k];
    items.push(box(t.x, t.y, t.w, t.h, look.color));
    items.push(text(`${look.mark}  ${quiz.choices[k]}`, t.x, t.y, t.w - 4, quiz.choices[k].length > 20 ? (wide ? 2.4 : 3) : (wide ? 3 : 3.8), { color: '#ffffff', bold: true }));
  });
  return { bg: '#f6f8fb', items };
}

/**
 * 맞힌 학생의 점수: 빨리 낼수록 크다(시간 제한이 있을 때 1000점에서 시간이 다 가면 500점까지). 시간 제한이 없으면 1000점. 틀리면 0점.
 * ms: 문제를 연 뒤 답을 낸 데까지(밀리초).
 */
export function quizPoints(correct, ms, seconds) {
  if (!correct) return 0;
  if (!seconds) return QUIZ_POINTS;
  const used = Math.min(1, Math.max(0, (Number(ms) || 0) / (seconds * 1000)));
  return Math.round(QUIZ_POINTS * (1 - used / 2));
}

/** 한 문제의 답 모으기: answers [{from, name, choice, ms}] → { counts, total, correct, rate(%) } */
export function quizTally(quiz, answers) {
  const q = cleanQuizActivity(quiz), counts = q.choices.map(() => 0);
  for (const a of answers || []) if (Number.isInteger(a?.choice) && a.choice >= 0 && a.choice < counts.length) counts[a.choice]++;
  const total = counts.reduce((x, y) => x + y, 0), correct = counts[q.answer];
  return { counts, total, correct, rate: total ? Math.round((correct * 100) / total) : 0 };
}

/**
 * 발표 한 번 동안의 점수판. 문제마다 학생(기기 표 from)이 낸 첫 답만 센다. 이름은 마지막에 쓴 것.
 * score(quiz, answers) 는 그 문제의 결과 { from: {correct, points, total, rank} } 를 돌려준다(같은 문제를 다시 매기면 덮어쓴다).
 */
export function createQuizBoard() {
  const players = new Map(), rounds = new Map();
  const totals = () => {
    const sum = new Map([...players.keys()].map((from) => [from, 0]));
    for (const round of rounds.values()) for (const [from, r] of round) sum.set(from, (sum.get(from) || 0) + r.points);
    return sum;
  };
  const ranking = () => {
    const sum = totals();
    const list = [...players.entries()].map(([from, p]) => ({ from, name: p.name, score: sum.get(from) || 0, correct: [...rounds.values()].filter((r) => r.get(from)?.correct).length }))
      .sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name, 'ko'));
    let rank = 0, last = null;
    return list.map((row, k) => { if (row.score !== last) { rank = k + 1; last = row.score; } return { ...row, rank }; });
  };
  return {
    score(quiz, answers) {
      const q = cleanQuizActivity(quiz), round = new Map();
      for (const a of answers || []) {
        if (typeof a?.from !== 'string' || round.has(a.from) || !Number.isInteger(a.choice) || a.choice < 0 || a.choice >= q.choices.length) continue;
        players.set(a.from, { name: oneLine(a.name, 12) || players.get(a.from)?.name || '익명' });
        const correct = a.choice === q.answer;
        round.set(a.from, { correct, points: quizPoints(correct, a.ms, q.seconds) });
      }
      rounds.set(q.id, round);
      const ranks = new Map(ranking().map((r) => [r.from, r])), out = {};
      for (const [from, r] of round) out[from] = { correct: r.correct, points: r.points, total: ranks.get(from)?.score || 0, rank: ranks.get(from)?.rank || 0 };
      return out;
    },
    ranking,
    get size() { return players.size; },
  };
}

/** 결과 장: 문제 · 보기마다 막대(정답은 초록 ✓) · 맞힌 비율, 오른쪽에 지금까지 순위(5등까지). */
export function quizResultPage(quiz, answers, aspect = 16 / 9, { ranking = [], at = Date.now() } = {}) {
  const q = cleanQuizActivity(quiz), { counts, total, rate } = quizTally(q, answers), ar = ratio(aspect), wide = ar >= 1.1;
  const items = [
    text('퀴즈 결과', 50, 8, 90, wide ? 2.2 : 3, { color: '#286f62', bold: true }),
    text(q.question, 50, 18, 90, q.question.length > 60 ? (wide ? 3 : 3.6) : (wide ? 3.8 : 4.6), { bold: true }),
  ];
  // 순위는 넓은 그림이면 오른쪽, 정사각 · 세로 그림이면 막대 아래
  const rows = ranking.slice(0, 5), side = wide && rows.length > 0, under = !wide && rows.length > 0;
  const left = 4, width = side ? 58 : 92, label = side ? 22 : 30, track = width - label - 14;
  const top = 32, bottom = under ? 52 : 84, step = (bottom - top) / q.choices.length, h = Math.min(step * 0.55, wide ? 9 : 6);
  q.choices.forEach((name, k) => {
    const y = top + step * (k + 0.5), n = counts[k], pct = total ? Math.round((n * 100) / total) : 0, right = k === q.answer, fill = (track * pct) / 100;
    items.push(text(`${QUIZ_CHOICES[k].mark} ${name}${right ? ' ✓' : ''}`, left + label / 2, y, label - 1, wide ? 2.2 : 2.8, { bold: right, color: right ? '#1f7a44' : '#273f3a' }));
    items.push(box(left + label + track / 2, y, track, h, '#e6ece9'));
    if (fill >= 0.5) items.push(box(left + label + fill / 2, y, fill, h, right ? '#30a46c' : '#a7b8b2'));
    items.push(text(`${n}명 · ${pct}%`, left + label + track + 7, y, 13, wide ? 2 : 2.6, { bold: right }));
  });
  const line = (r) => `${r.rank}. ${r.name} · ${r.score.toLocaleString('ko-KR')}점`;
  if (side) {
    items.push(box(81, 58, 34, 56, '#ffffff'));
    items.push(text('지금까지 순위', 81, 35, 30, 2.2, { bold: true, color: '#286f62' }));
    rows.forEach((r, k) => items.push(text(line(r), 81, 44 + k * 8, 30, 2.1, { bold: k === 0 })));
  }
  if (under) {
    const end = 61.5 + rows.length * 4;   // 칸 55 ~ end(해설 88 · 참여 93 줄과 겹치지 않는다)
    items.push(box(50, (55 + end) / 2, 92, end - 55, '#ffffff'));
    items.push(text('지금까지 순위', 50, 58, 88, 2.8, { bold: true, color: '#286f62' }));
    rows.forEach((r, k) => items.push(text(line(r), 50, 62.5 + k * 4, 88, 2.6, { bold: k === 0 })));
  }
  const day = new Date(at), date = Number.isNaN(day.getTime()) ? '' : ` · ${day.getFullYear()}. ${day.getMonth() + 1}. ${day.getDate()}.`;
  items.push(text(`${total}명 참여 · 맞힌 비율 ${rate}%${date}`, 50, 93, 90, wide ? 1.8 : 2.4, { color: '#5d6b66' }));
  if (q.explain) items.push(text(`해설: ${q.explain}`, 50, 88, 90, wide ? 1.8 : 2.4, { color: '#3c4b46' }));
  return { id: newId('p'), source: { kind: 'result' }, bg: '#fffdf5', items };
}

/**
 * 가이X 가 써 준 답 → 문제 목록. ```quiz 블록(없으면 답 전체)에서 "Q:" 로 시작하는 문제마다
 * "- 보기" 줄 2~4개(정답 끝에 " *"), 있으면 "해설:" 한 줄. 모양이 틀린 문제는 버린다. 10문제까지.
 */
export function quizzesFromAnswer(answer, { seconds = 20 } = {}) {
  const textAll = String(answer ?? '').replace(/\r\n?/g, '\n'), fenced = /```[^\n]*\n([\s\S]*?)```/.exec(textAll);
  const lines = (fenced ? fenced[1] : textAll).split('\n').map((l) => l.replace(/\*\*|__|`/g, '').trim());
  const out = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    const answers = cur.choices.map((c, k) => (c.right ? k : -1)).filter((k) => k >= 0);
    if (cur.question && cur.choices.length >= 2 && cur.choices.length <= 4 && answers.length === 1) {
      try { out.push(cleanQuizActivity({ version: 1, kind: 'quiz', id: newId('a'), question: cur.question, choices: cur.choices.map((c) => c.text), answer: answers[0], seconds, ...(cur.explain ? { explain: cur.explain } : {}) })); } catch { /* 버린다 */ }
    }
    cur = null;
  };
  for (const line of lines) {
    // "Q:" · "문제 3." 은 늘 새 문제. "3." 처럼 번호만 있으면 보기가 두 개 넘게 모인 뒤(또는 맨 처음)에만 새 문제로 본다("1) 네모" 같은 보기와 헷갈리지 않게).
    const q = /^(?:Q|문제)\s*\d*\s*[:.)]\s*(.+)$/i.exec(line) || ((!cur || cur.choices.length >= 2) && /^\d{1,2}\s*[.)]\s*(.+)$/.exec(line));
    if (q) { close(); cur = { question: q[1].trim(), choices: [], explain: '' }; continue; }
    if (!cur) continue;
    const c = /^(?:[-•]|[①②③④]|[A-Da-d1-4][.)])\s*(.+)$/.exec(line);
    if (c) {
      let body = c[1].trim(), right = false;
      if (/\s*(?:\*|\(정답\)|✓|✔)\s*$/.test(body)) { right = true; body = body.replace(/\s*(?:\*|\(정답\)|✓|✔)\s*$/, '').trim(); }
      if (body) cur.choices.push({ text: body, right });
      continue;
    }
    const e = /^(?:해설|설명)\s*[:：]\s*(.+)$/.exec(line);
    if (e) cur.explain = e[1].trim();
  }
  close();
  return out.slice(0, 10);
}
