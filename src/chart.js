// 차트 조각(t:'chart'): 표(항목 × 계열)로 막대 · 가로 막대 · 꺾은선 · 원 · 도넛을 그린다.
// 저장하는 것은 표와 꾸밈뿐이고(cleanChart), 그림은 그릴 때마다 만든다(chartView: HTML + SVG).
// 그림은 조각의 상자에 맞춰 늘고 준다: 막대 · 선은 SVG(viewBox 0~100, 비율 무시)로, 글자는 HTML 로 같은 % 자리에 둔다.
// 글자 크기는 차트 상자의 짧은 변을 따른다(.fi-chart 가 container-type: size, cqmin). 그래서 그림 · PDF · 영상 · 공유 재생기에서도 같다.
import { el } from './dom.js';

export const CHART_KINDS = Object.freeze([
  ['bar', '막대'], ['hbar', '가로 막대'], ['line', '꺾은선'], ['pie', '원'], ['donut', '도넛'],
]);
export const CHART_LIMITS = Object.freeze({ labels: 12, series: 3, label: 20, title: 40, unit: 6, value: 1e12 });
export const CHART_PALETTES = Object.freeze({
  basic: ['#3e63dd', '#e5484d', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#e54666', '#6e56cf', '#ad7f58', '#0090ff', '#e93d82', '#7d9a2c'],
  warm: ['#e5484d', '#f76b15', '#f5a524', '#e93d82', '#ad7f58', '#d6409f', '#ffc53d', '#dc3e42', '#ec9455', '#a35829', '#cc4e00', '#9e6c00'],
  cool: ['#0090ff', '#12a594', '#3e63dd', '#30a46c', '#00a2c7', '#6e56cf', '#46a758', '#5b5bd6', '#29a383', '#0d74ce', '#1c8a5f', '#3a5bc7'],
  mono: ['#273f3a', '#4d6b62', '#6f8c83', '#93ada5', '#b4c9c2', '#3d5a50', '#5e7c72', '#829f96', '#a5bdb5', '#c6d8d2', '#1f332e', '#556f67'],
});
export const CHART_PALETTE_NAMES = Object.freeze([['basic', '또렷하게'], ['warm', '따뜻하게'], ['cool', '시원하게'], ['mono', '차분하게']]);
const TEXT = '#273f3a';

const plain = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const value = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,\s]/g, '').replace(/%$/, ''));
  return Number.isFinite(n) ? Math.max(-CHART_LIMITS.value, Math.min(CHART_LIMITS.value, Math.round(n * 1000) / 1000)) : 0;
};
const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

/** 차트 내용 정리: { kind, title?, unit?, labels[1~12], series[1~3]{ name, values[] }, palette, vals?(값 보이기 끔이면 false), color? }. 쓸 수 없으면 null. */
export function cleanChart(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const kind = CHART_KINDS.some(([id]) => id === r.kind) ? r.kind : 'bar';
  const labels = (Array.isArray(r.labels) ? r.labels : []).slice(0, CHART_LIMITS.labels).map((l, i) => plain(l, CHART_LIMITS.label) || `항목 ${i + 1}`);
  if (!labels.length) return null;
  const series = (Array.isArray(r.series) ? r.series : []).filter((s) => s && typeof s === 'object' && !Array.isArray(s)).slice(0, CHART_LIMITS.series)
    .map((s, i) => ({ name: plain(s.name, CHART_LIMITS.label) || `계열 ${i + 1}`, values: labels.map((_, k) => value(Array.isArray(s.values) ? s.values[k] : 0)) }));
  if (!series.length) return null;
  const out = { kind, labels, series, palette: CHART_PALETTES[r.palette] ? r.palette : 'basic' };
  const title = plain(r.title, CHART_LIMITS.title), unit = plain(r.unit, CHART_LIMITS.unit);
  if (title) out.title = title;
  if (unit) out.unit = unit;
  if (r.vals === false) out.vals = false;
  if (hex(r.color) && hex(r.color) !== TEXT) out.color = hex(r.color);
  return out;
}
/** 처음 넣는 차트의 보기 표(바로 고쳐 쓰라고). */
export function sampleChart(kind = 'bar') {
  const pie = kind === 'pie' || kind === 'donut';
  return cleanChart(pie
    ? { kind, title: '우리 반이 좋아하는 계절', unit: '명', labels: ['봄', '여름', '가을', '겨울'], series: [{ name: '학생 수', values: [7, 9, 5, 4] }] }
    : kind === 'line'
      ? { kind, title: '강낭콩 키 재기', unit: 'cm', labels: ['1일', '3일', '5일', '7일', '9일'], series: [{ name: '1모둠', values: [0, 2, 5, 9, 14] }, { name: '2모둠', values: [0, 1, 4, 8, 11] }] }
      : { kind, title: '우리 반이 좋아하는 과일', unit: '명', labels: ['사과', '바나나', '딸기', '포도'], series: [{ name: '학생 수', values: [8, 5, 11, 4] }] });
}
/**
 * 엑셀 · 구글 시트 · 한글 표에서 복사한 칸(탭 · 쉼표로 나뉜 줄들) → { labels, series }. 첫 줄이 계열 이름이면 쓴다.
 * 줄마다 [항목, 값, 값…]. 읽을 줄이 없으면 null.
 */
export function chartFromText(text) {
  const rows = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.split(line.includes('\t') ? '\t' : ',').map((c) => c.trim())).filter((r) => r.some(Boolean));
  if (!rows.length) return null;
  const numeric = (c) => c !== '' && Number.isFinite(Number(c.replace(/[,\s]/g, '').replace(/%$/, '')));
  let names = null;
  if (rows.length > 1 && rows[0].slice(1).some((c) => c && !numeric(c))) names = rows.shift().slice(1);
  const width = Math.min(CHART_LIMITS.series, Math.max(1, ...rows.map((r) => r.length - 1)));
  const body = rows.slice(0, CHART_LIMITS.labels);
  if (!body.length) return null;
  return {
    labels: body.map((r, i) => r[0] || `항목 ${i + 1}`),
    series: Array.from({ length: width }, (_, s) => ({ name: names?.[s] || `계열 ${s + 1}`, values: body.map((r) => value(r[s + 1])) })),
  };
}
/** 눈금: 0 을 품고, 1 · 2 · 5 × 10ⁿ 간격으로 4~6칸. { lo, hi, step, ticks } */
export function chartScale(values) {
  const nums = values.filter(Number.isFinite);
  let lo = Math.min(0, ...nums), hi = Math.max(0, ...nums);
  if (lo === hi) hi = lo + 1;
  // 모두 정수(사람 수 · 개수)면 2.5 같은 칸은 쓰지 않고, 칸이 1 보다 작아지지 않게 한다.
  const whole = nums.every(Number.isInteger), raw = (hi - lo) / 5, mag = 10 ** Math.floor(Math.log10(raw));
  let step = (whole ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]).map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  if (whole) step = Math.max(1, step);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, step, ticks: ticks.map((t) => Math.round(t * 1e6) / 1e6) };
}
/** 숫자 글: 천 단위 쉼표, 소수는 세 자리까지. */
export const chartNumber = (n) => (Math.round(n * 1000) / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 3 });
/** 화면 읽기 · 조각 목록에 쓸 설명: "막대 차트 '제목': 사과 8명, 바나나 5명 …" */
export function chartSummary(c) {
  const kind = CHART_KINDS.find(([id]) => id === c.kind)?.[1] || '막대';
  const unit = c.unit || '';
  const parts = c.series.length === 1 || c.kind === 'pie' || c.kind === 'donut'
    ? c.labels.map((l, i) => `${l} ${chartNumber(c.series[0].values[i])}${unit}`)
    : c.series.map((s) => `${s.name}: ${c.labels.map((l, i) => `${l} ${chartNumber(s.values[i])}${unit}`).join(', ')}`);
  return `${kind} 차트${c.title ? ` '${c.title}'` : ''}: ${parts.join(c.series.length > 1 && c.kind !== 'pie' && c.kind !== 'donut' ? ' / ' : ', ')}`;
}

// ---------- 그리기 ----------
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
const at = (node, style) => { Object.assign(node.style, style); return node; };
/** 차트 조각의 그림(자리 · 크기는 render.js 의 placeItem 이 정한다). */
export function chartView(item) {
  const c = cleanChart(item) || sampleChart('bar');
  const colors = CHART_PALETTES[c.palette], round = c.kind === 'pie' || c.kind === 'donut';
  // 바깥 상자(.fi-chart)는 크기를 재는 그릇(container-type: size)이고, 글자 크기(cqmin)는 그 안의 .fc-in 에서 잰다.
  const inner = el('div', { class: 'fc-in' });
  const node = el('div', { class: `fi fi-chart fc-${c.kind}`, role: 'img', 'aria-label': chartSummary(c) }, inner);
  node.style.color = c.color || TEXT;
  if (c.title) inner.append(el('div', { class: 'fc-title', text: c.title }));
  inner.append(round ? roundBody(c, colors) : axisBody(c, colors));
  if (!round && c.series.length > 1) inner.append(legendView(c.series.map((s, i) => [s.name, colors[i % colors.length], ''])));
  return node;
}
function legendView(rows, extra = '') {
  return el('div', { class: `fc-legend${extra}` }, ...rows.map(([name, color, note]) => el('span', { class: 'fc-key' },
    at(el('i', { 'aria-hidden': 'true' }), { background: color }), el('span', { text: name }), note ? el('b', { text: note }) : null)));
}
function axisBody(c, colors) {
  const flat = c.series.flatMap((s) => s.values), scale = chartScale(flat), span = scale.hi - scale.lo;
  const pos = (v) => ((v - scale.lo) / span) * 100;          // 0(아래 · 왼쪽) ~ 100(위 · 오른쪽)
  const across = c.kind === 'hbar', n = c.labels.length, m = c.series.length, unit = c.unit || '';
  const plot = el('div', { class: 'fc-plot' }), pic = svg('svg', { class: 'fc-svg', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  // 눈금 줄
  for (const t of scale.ticks) {
    const p = pos(t);
    pic.append(svg('line', { class: t === 0 ? 'fc-zero' : 'fc-grid', ...(across ? { x1: p, x2: p, y1: 0, y2: 100 } : { x1: 0, x2: 100, y1: 100 - p, y2: 100 - p }) }));
  }
  const values = el('div', { class: 'fc-values' });
  const zero = pos(0);
  if (c.kind === 'line') {
    c.series.forEach((s, k) => {
      const pts = s.values.map((v, i) => [((i + 0.5) / n) * 100, 100 - pos(v)]);
      pic.append(svg('polyline', { class: 'fc-line', points: pts.map((p) => p.join(',')).join(' '), stroke: colors[k % colors.length] }));
      pts.forEach(([x, y], i) => {
        plot.append(at(el('i', { class: 'fc-dot' }), { left: `${x}%`, top: `${y}%`, background: colors[k % colors.length] }));
        if (c.vals !== false) values.append(at(el('span', { class: 'fc-val fc-val-up', text: `${chartNumber(s.values[i])}${unit}` }), { left: `${x}%`, top: `${y}%` }));
      });
    });
  } else {
    const group = 100 / n, inner = group * 0.72, bar = inner / m;
    c.series.forEach((s, k) => s.values.forEach((v, i) => {
      const from = Math.min(pos(v), zero), to = Math.max(pos(v), zero), start = i * group + (group - inner) / 2 + k * bar;
      pic.append(svg('rect', across
        ? { x: from, y: start + bar * 0.06, width: Math.max(to - from, 0.001), height: bar * 0.88, fill: colors[(m > 1 ? k : 0) % colors.length], class: 'fc-bar' }
        : { x: start + bar * 0.06, y: 100 - to, width: bar * 0.88, height: Math.max(to - from, 0.001), fill: colors[(m > 1 ? k : 0) % colors.length], class: 'fc-bar' }));
      if (c.vals === false) return;
      const mid = start + bar / 2, tip = v >= 0 ? to : from, label = `${chartNumber(v)}${unit}`;
      values.append(at(el('span', { class: `fc-val ${across ? (v >= 0 ? 'fc-val-right' : 'fc-val-left') : v >= 0 ? 'fc-val-up' : 'fc-val-down'}`, text: label }),
        across ? { left: `${tip}%`, top: `${mid}%` } : { left: `${mid}%`, top: `${100 - tip}%` }));
    }));
  }
  plot.prepend(pic); plot.append(values);
  // 눈금 글(값 축) · 항목 글
  const ticks = el('div', { class: 'fc-ticks' }, ...scale.ticks.map((t) => at(el('span', { text: chartNumber(t) }), across ? { left: `${pos(t)}%` } : { top: `${100 - pos(t)}%` })));
  const widest = Math.max(...scale.ticks.map((t) => chartNumber(t).length));
  if (!across) ticks.style.width = `${widest * 0.62 + 0.4}em`;
  const names = el('div', { class: 'fc-names' }, ...c.labels.map((l) => el('span', { text: l })));
  if (across) names.style.width = `${Math.min(8, Math.max(...c.labels.map((l) => l.length))) * 1.05 + 0.4}em`;
  return el('div', { class: `fc-body ${across ? 'fc-across' : 'fc-up'}` }, across ? names : ticks, plot, el('span', { class: 'fc-corner' }), across ? ticks : names);
}
function roundBody(c, colors) {
  const values = c.series[0].values.map((v) => Math.max(0, v)), total = values.reduce((a, b) => a + b, 0);
  // 반지름 100(글자가 아주 작은 값이면 글자 사이가 벌어져 그려진다)
  const R = 100, pic = svg('svg', { class: 'fc-pie', viewBox: '-105 -105 210 210', 'aria-hidden': 'true' });
  const hole = c.kind === 'donut' ? 0.56 : 0;
  let angle = -Math.PI / 2;
  if (!total) pic.append(svg('circle', { r: R, fill: '#e3e8e6' }));
  values.forEach((v, i) => {
    if (!total || !v) return;
    const share = v / total, end = angle + share * Math.PI * 2, color = colors[i % colors.length];
    if (share > 0.9999) pic.append(svg('circle', { r: R, fill: color }));
    else {
      const big = share > 0.5 ? 1 : 0, [x1, y1, x2, y2] = [Math.cos(angle), Math.sin(angle), Math.cos(end), Math.sin(end)].map((v) => (v * R).toFixed(3));
      pic.append(svg('path', { d: `M0 0L${x1} ${y1}A${R} ${R} 0 ${big} 1 ${x2} ${y2}Z`, fill: color, stroke: '#fff', 'stroke-width': 2 }));
    }
    // 비율 글: 조각의 가운데(도넛은 고리 가운데). 너무 작은 조각은 범례로만
    if (c.vals !== false && share >= 0.06) {
      const mid = (angle + end) / 2, r = (hole ? (1 + hole) / 2 : 0.62) * R, label = svg('text', { x: (Math.cos(mid) * r).toFixed(2), y: (Math.sin(mid) * r).toFixed(2), class: 'fc-pie-val' });
      label.textContent = `${Math.round(share * 100)}%`;
      pic.append(label);
    }
    angle = end;
  });
  if (hole) pic.append(svg('circle', { r: hole * R, fill: '#fff' }));
  const legend = c.labels.map((l, i) => [l, colors[i % colors.length], c.vals === false ? '' : `${chartNumber(values[i])}${c.unit || ''}`]);
  return el('div', { class: 'fc-body fc-round' }, el('div', { class: 'fc-pie-box' }, pic), legendView(legend, ' fc-side'));
}
