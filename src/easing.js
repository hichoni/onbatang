const EASES = { linear: null, ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
const easeCache = new Map();
/** CSS 의 빠르기(이름 · cubic-bezier(…) · steps(n, end))를 0~1 → 0~1 함수로 바꾼다. 모르는 것은 한결같은 빠르기(linear)다. */
export function easeFn(css) {
  if (easeCache.has(css)) return easeCache.get(css);
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(String(css ?? '').trim());
  const p = m ? m[1].split(',').map(Number) : EASES[css];
  let fn = (x) => Math.min(1, Math.max(0, x));
  // 계단(steps(n, end)): n 칸으로 나눠 칸이 끝날 때마다 한 칸씩 뛴다(타자 치듯).
  const st = /^steps\(\s*(\d+)\s*(?:,\s*(?:end|jump-end)\s*)?\)$/.exec(String(css ?? '').trim());
  if (st && Number(st[1]) > 0) {
    const n = Number(st[1]);
    fn = (x) => (x >= 1 ? 1 : x <= 0 ? 0 : Math.floor(x * n) / n);
    easeCache.set(css, fn);
    return fn;
  }
  if (p && p.length === 4 && p.every(Number.isFinite)) {
    const [x1, y1, x2, y2] = p;
    const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    fn = (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      // 가로(시간) 값이 x 가 되는 곡선 위의 자리를 반씩 좁혀 찾는다(곡선의 가로는 늘 커지기만 한다).
      let lo = 0;
      let hi = 1;
      for (let n = 0; n < 32; n++) {
        const mid = (lo + hi) / 2;
        if (at(x1, x2, mid) < x) lo = mid; else hi = mid;
      }
      return at(y1, y2, (lo + hi) / 2);
    };
  }
  easeCache.set(css, fn);
  return fn;
}
