// 글상자 안의 부분 서식(runs): 글의 한 구간만 굵게 · 기울임 · 밑줄 · 다른 색. 화면을 모르는 순수한 함수들이다.
// 글(text)은 그대로 한 줄 글로 두고, 구간은 글자 자리(UTF-16 위치)로 적는다: [{ s, e, b?, i?, u?, c? }] (s 부터 e 앞까지).
// 글상자 전체의 서식(bold · italic · under · color)과 같은 값은 적지 않는다(전체를 바꾸면 그대로 따라간다).
// 구간은 겹치지 않고, 차례대로이며, 바로 붙은 같은 서식은 하나로 합친다.

const HEX = /^#[0-9a-f]{6}$/;
export const RUN_LIMIT = 400;                 // 한 글상자에 둘 수 있는 구간 수(넘는 것은 버린다)
const FLAGS = [['b', 'bold'], ['i', 'italic'], ['u', 'under']];

const baseOf = (item) => ({ b: item?.bold === true, i: item?.italic === true, u: item?.under === true, c: String(item?.color || '').toLowerCase() });
const same = (a, b) => (!a && !b) || (!!a && !!b && a.b === b.b && a.i === b.i && a.u === b.u && a.c === b.c);

// 글자마다의 서식 차이(전체 서식과 다른 것만). 없으면 null.
function marksOf(text, runs, item) {
  const n = String(text || '').length;
  const marks = new Array(n).fill(null);
  if (!n || !Array.isArray(runs)) return marks;
  for (const r of runs.slice(0, RUN_LIMIT)) {
    if (!r || typeof r !== 'object') continue;
    const s = Math.max(0, Math.min(n, Math.floor(Number(r.s))));
    const e = Math.max(0, Math.min(n, Math.floor(Number(r.e))));
    if (!(e > s)) continue;
    const p = {};
    for (const [k] of FLAGS) if (typeof r[k] === 'boolean') p[k] = r[k];
    if (typeof r.c === 'string' && HEX.test(r.c.toLowerCase())) p.c = r.c.toLowerCase();
    if (!Object.keys(p).length) continue;
    for (let k = s; k < e; k++) marks[k] = { ...(marks[k] || {}), ...p };
  }
  const base = baseOf(item);
  return marks.map((m) => {
    if (!m) return null;
    const out = {};
    for (const [k] of FLAGS) if (k in m && m[k] !== base[k]) out[k] = m[k];
    if (m.c && m.c !== base.c) out.c = m.c;
    return Object.keys(out).length ? out : null;
  });
}
function compress(marks) {
  const out = [];
  marks.forEach((m, k) => {
    if (!m) return;
    const last = out[out.length - 1];
    if (last && last.e === k && same({ ...pick(last) }, { ...pick(m) })) last.e = k + 1;
    else out.push({ s: k, e: k + 1, ...m });
  });
  return out.slice(0, RUN_LIMIT);
}
const pick = (m) => ({ b: m.b, i: m.i, u: m.u, c: m.c });

/** 구간들을 정리한다(글 길이 안으로 자르고, 전체 서식과 같은 값은 빼고, 붙은 같은 서식은 합친다). item: 글상자(전체 서식). */
export function cleanRuns(text, runs, item = {}) {
  return compress(marksOf(text, runs, item));
}

/** s ~ e 구간에 서식(patch: { b?, i?, u?, c? })을 입힌 새 구간들. */
export function styleRuns(item, s, e, patch) {
  const list = Array.isArray(item?.runs) ? item.runs : [];
  return cleanRuns(item?.text || '', [...list, { s, e, ...patch }], item);
}

/** 그 자리 글자의 실제 서식(전체 서식 + 구간). */
export function styleAt(item, at) {
  const base = baseOf(item);
  const run = (Array.isArray(item?.runs) ? item.runs : []).find((r) => r.s <= at && at < r.e);
  return run ? { b: run.b ?? base.b, i: run.i ?? base.i, u: run.u ?? base.u, c: run.c ?? base.c } : base;
}

/** s ~ e 구간의 (빈칸이 아닌) 글자가 모두 그 서식(k: 'b' · 'i' · 'u')인가. 글자가 없으면 false. */
export function runsAll(item, s, e, k) {
  const text = String(item?.text || '');
  let seen = false;
  for (let at = Math.max(0, s); at < Math.min(text.length, e); at++) {
    if (/\s/.test(text[at])) continue;
    seen = true;
    if (!styleAt(item, at)[k]) return false;
  }
  return seen;
}

/** 서식이 없는 구간은 다른 서식을 지우는 데 쓴다: 그 키(k)를 전체 서식으로 되돌린 구간들. */
export function dropRunKey(item, k) {
  const list = (Array.isArray(item?.runs) ? item.runs : []).map((r) => { const { [k]: _, ...rest } = r; return rest; });
  return cleanRuns(item?.text || '', list, item);
}

/** 그리기용 조각: [{ text, run }] (run 은 서식이 다른 구간이면 { b?, i?, u?, c? }, 아니면 null). 글을 빠짐없이 차례대로 덮는다. */
export function runPieces(text, runs) {
  text = String(text || '');
  const out = [];
  let at = 0;
  for (const r of Array.isArray(runs) ? runs : []) {
    if (r.s > at) out.push({ text: text.slice(at, r.s), run: null });
    out.push({ text: text.slice(r.s, r.e), run: r });
    at = r.e;
  }
  if (at < text.length) out.push({ text: text.slice(at), run: null });
  return out.filter((p) => p.text);
}

/**
 * 글을 고친 뒤 구간을 맞춘다: 바뀐 곳(앞뒤에서 같은 부분을 뺀 가운데)만 늘이고 줄인다.
 * 바뀐 곳 안에 새로 친 글은 지운 첫 글자의 서식을, 지운 것이 없으면 바로 앞 글자의 서식을 따른다(앞 글자가 없으면 뒤 글자).
 */
export function shiftRuns(before, after, runs, item = {}) {
  before = String(before || ''); after = String(after || '');
  if (!Array.isArray(runs) || !runs.length || before === after) return cleanRuns(after, runs, { ...item, text: after });
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  const old = marksOf(before, runs, item);
  const added = after.length - head - tail;
  // 지운 글자가 있으면(고른 글을 바꿔 친 것) 그 첫 글자의 서식을, 아니면 바로 앞 글자의 서식을 따른다.
  const fill = before.length - tail > head ? old[head] : head > 0 ? old[head - 1] : (old[before.length - tail] ?? null);
  const marks = [...old.slice(0, head), ...new Array(Math.max(0, added)).fill(fill), ...old.slice(before.length - tail)];
  return compress(marks);
}
