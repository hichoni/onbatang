// Each asset draws its own transparent SVG at rest. The small set of animation
// primitives is shared by the picker, the presentation and the offline lesson.
const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attributes) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function prism({ part, ink }) {
  const facets = [
    ['-94,38 -24,1 28,-2 -46,26', ink[0]],
    ['-65,39 12,-3 64,-17 -15,23', ink[1]],
    ['-18,14 53,-25 97,-34 28,2', ink[2]],
    ['-74,48 -8,15 25,8 -41,36', ink[2]],
    ['20,0 62,-29 86,-33 49,-11', ink[0]],
  ];
  facets.forEach(([points, fill], i) => part('polygon', { points, fill }, [
    { transform: 'translate(-44px,22px) scaleX(.25)', opacity: 0 },
    { transform: 'translate(0,0) scaleX(1)', opacity: .92, offset: .48 },
    { transform: 'translate(38px,-20px) scaleX(.6)', opacity: 0 },
  ], 75 * i, 850));
}

function orbit({ part, ink }) {
  for (let i = 0; i < 3; i++) {
    const radius = 40 + i * 11;
    part('circle', { r: radius, fill: 'none', stroke: ink[i], 'stroke-width': 3 - i * .65,
      pathLength: 100, 'stroke-dasharray': i === 1 ? '1 4' : '23 4 9 14', 'stroke-linecap': 'round' }, [
      { transform: 'scale(1.4) rotate(-85deg)', opacity: 0 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: .48 },
      { transform: 'scale(.85) rotate(64deg)', opacity: 0 },
    ], i * 90, 1120);
  }
  for (const [cx, cy] of [[-48, -36], [48, 36]]) {
    part('circle', { cx, cy, r: 3.4, fill: ink[1] });
  }
}

function signal({ part, ink }) {
  const routes = [
    ['M-93 27 H-57 L-37 7 H-8 L9 -10 H57 L74 -27 H92', 92, -27],
    ['M-82 43 H-52 L-29 20 H12 L30 2 H73', 73, 2],
    ['M-78 3 H-49 L-31 -15 H-7 L13 -35 H49', 49, -35],
  ];
  routes.forEach(([d, cx, cy], i) => {
    part('path', { d, fill: 'none', stroke: ink[i], 'stroke-width': i ? 2 : 3.6,
      pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
      { strokeDashoffset: 1, opacity: 0 }, { strokeDashoffset: 0, opacity: 1, offset: .64 },
      { strokeDashoffset: 0, opacity: 0 },
    ], i * 105, 1080);
    part('circle', { cx, cy, r: 3.5, fill: ink[i] }, [
      { opacity: 0 }, { opacity: 1, offset: .36 }, { opacity: 0 },
    ], 510 + i * 105, 440);
  });
}

function confetti({ part, ink }) {
  for (let i = 0; i < 18; i++) {
    const angle = i * 2.39996, radius = 36 + (i % 5) * 8;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * .72;
    const mark = i % 3 === 0 ? ['circle', { cx: x, cy: y, r: 2.9 }]
      : ['path', { d: i % 3 === 1 ? 'M0 -5 Q2 -1 5 0 Q2 1 0 5 Q-1 1 -5 0 Q-1 -1 0 -5Z' : 'M-2 -5 L2 -4 L1 5 L-2 4Z',
          transform: `translate(${x} ${y}) rotate(${i * 23})` }];
    // Animate a parent group so the confetti's own orientation stays intact.
    part(mark[0], { ...mark[1], fill: ink[i % 3] }, [
      { transform: 'scale(.12)', opacity: 0 },
      { transform: 'scale(.82)', opacity: 1, offset: .35 },
      { transform: 'translateY(12px) scale(1.2)', opacity: 0 },
    ], (i % 4) * 46, 880 + i % 3 * 110);
  }
}

export const EFFECT_ASSETS = Object.freeze([
  { id: 'prism', name: '프리즘 리본', hint: '빛 띠가 대각선으로 스쳐 가요', ink: ['#9071ff', '#53e6ff', '#ff86bc'], draw: prism },
  { id: 'orbit', name: '포커스 링', hint: '세 겹의 렌즈가 한 곳에 초점을 맞춰요', ink: ['#ffac45', '#fcea97', '#ff685a'], draw: orbit },
  { id: 'signal', name: '회로 신호', hint: '선을 따라 빛이 차례로 도착해요', ink: ['#35e3b8', '#73bdff', '#ab9bff'], draw: signal },
  { id: 'confetti', name: '별빛 파티클', hint: '별과 색종이가 피어올라 흩어져요', ink: ['#ffd44f', '#ff6197', '#54d9db'], draw: confetti },
]);
const registry = new Map(EFFECT_ASSETS.map(asset => [asset.id, asset]));
export const effectable = item => ['text','shape','image','art','emoji','chart','math'].includes(item?.t);
export function cleanEffect(raw) {
  if (!registry.has(raw?.id)) return null;
  const note = typeof raw.note === 'string' ? Array.from(raw.note.trim()).slice(0, 120).join('') : '';
  return { id: raw.id, when: raw.when === 'open' ? 'open' : 'press', ...(note ? { note } : {}) };
}

export function effectArt(id, animate = false) {
  const asset = registry.get(id);
  if (!asset) return null;
  const art = svg('svg', { viewBox: '-100 -70 200 140', 'aria-hidden': 'true', focusable: 'false' });
  art.style.cssText = 'width:100%;height:100%;display:block;overflow:visible;pointer-events:none';
  const running = animate && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function part(tag, attrs, frames, delay = 0, duration = 1050) {
    const group = svg('g', {});
    group.append(svg(tag, attrs)); art.append(group);
    if (running && group.animate) group.animate(frames || [{ opacity: 0 }, { opacity: 1, offset: .45 }, { opacity: 0 }], {
      duration, delay, fill: 'both', easing: 'cubic-bezier(.22,.68,.32,1)',
    });
  }
  asset.draw({ part, ink: asset.ink });
  return art;
}

// Keep the final gallery tile legible, including after rapid repeated clicks.
export function previewEffect(container, id, animate = true) {
  const art = effectArt(id, animate);
  if (!art) return;
  container.replaceChildren(art);
  if (animate) Promise.allSettled(art.getAnimations({ subtree:true }).map(animation => animation.finished))
    .then(() => { if (container.firstChild === art) container.replaceChildren(effectArt(id)); });
}
