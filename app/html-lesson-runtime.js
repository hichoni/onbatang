import { cleanPixelActivity } from '../src/pixel-art.js';
import { isId, newId } from '../src/document.js';
import { mountPixelArt } from './pixel-art.js';
import { el } from '../src/dom.js';

const png = value => typeof value === 'string' && /^data:image\/png;base64,[A-Za-z\d+/=]+$/.test(value) && value.length <= 4_000_000;
export const safeLessonJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export function cleanHtmlLesson(raw) {
  if (!raw || raw.version !== 1 || !isId(raw.id) || typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 160 || !Array.isArray(raw.pages) || !raw.pages.length || raw.pages.length > 500) throw new Error('수업 파일의 형식을 확인해 주세요.');
  const seen = new Set(); let bytes = 0;
  const pages = raw.pages.map(page => {
    if (!page || !isId(page.id) || seen.has(page.id) || !png(page.image) || !Number.isFinite(page.aspect) || page.aspect < .25 || page.aspect > 4) throw new Error('수업 슬라이드를 확인해 주세요.');
    seen.add(page.id); bytes += page.image.length;
    if (bytes > 200_000_000) throw new Error('수업 파일이 너무 커요. 그림 크기를 줄여 다시 내려받아 주세요.');
    const out = { id: page.id, image: page.image, aspect: page.aspect };
    if (page.activity !== undefined) out.activity = cleanPixelActivity(page.activity);
    if (page.result === true) out.result = true;
    return out;
  });
  return { version: 1, id: raw.id, title: raw.title, updatedAt: Number.isSafeInteger(raw.updatedAt) && raw.updatedAt >= 0 ? raw.updatedAt : 0, pages };
}

export function mountHtmlLesson(raw, host = document.getElementById('onbatang-lesson')) {
  const seed = cleanHtmlLesson(raw), storageKey = `onbatang-html-lesson-v1:${seed.id}`;
  let pages = seed.pages, current = 0, app = null, executing = false, persistent = true, storageNotice = '', update = seed.updatedAt;
  const savedResults = new Map();
  const originalIds = seed.pages.filter(p => !p.result).map(p => p.id).join(',');
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (stored?.version === 1 && stored.originalIds === originalIds && Number.isSafeInteger(stored.updatedAt) && stored.updatedAt >= seed.updatedAt && Array.isArray(stored.order) && Array.isArray(stored.results)) {
      const originals = new Map(seed.pages.filter(p => !p.result).map(p => [p.id, p]));
      for (const result of cleanHtmlLesson({ ...seed, pages: stored.results.length ? stored.results : seed.pages.slice(0, 1) }).pages) if (result.result && !originals.has(result.id)) originals.set(result.id, result);
      if (stored.order.length !== originals.size || new Set(stored.order).size !== originals.size || stored.order.some(id => !originals.has(id))) throw new Error('저장된 순서가 달라요.');
      pages = stored.order.map(id => {
        const page = originals.get(id), cells = stored.cells?.[id];
        return page.activity && cells !== undefined ? { ...page, activity: cleanPixelActivity({ ...page.activity, cells }) } : page;
      });
      current = Math.max(0, pages.findIndex(p => p.id === stored.currentId)); update = stored.updatedAt;
      storageNotice = '이 브라우저에 저장한 활동과 결과를 다시 열었어요.';
    }
  } catch { persistent = false; storageNotice = '브라우저 저장을 사용할 수 없거나 이전 저장을 읽지 못했어요. 작업은 계속할 수 있어요. 결과는 현재 수업 내려받기로 보관해 주세요.'; }
  const title = el('h1', { text: seed.title }), count = el('span', { class: 'lesson-count' });
  const status = el('p', { class: 'lesson-status', role: 'status', text: storageNotice || '인터넷 없이 이 파일에서 수업할 수 있어요.' });
  const stage = el('main', { class: 'lesson-stage', tabindex: '-1' });
  const previous = el('button', { type: 'button', text: '이전', onclick: () => navigate(-1) });
  const next = el('button', { type: 'button', text: '다음', onclick: () => navigate(1) });
  const returnToCover = el('button', { type: 'button', text: '활동 화면 닫기', hidden: true, onclick: () => { app?.destroy(); app = null; executing = false; render(); } });
  const download = el('button', { type: 'button', text: '현재 수업 내려받기', class: 'lesson-download', onclick: () => {
    try {
      persist();
      const clone = document.documentElement.cloneNode(true);
      clone.querySelector('#onbatang-lesson').replaceChildren();
      clone.querySelector('#onbatang-lesson-data').textContent = safeLessonJson(cleanHtmlLesson({ ...seed, pages, updatedAt: update }));
      const blob = new Blob(['<!doctype html>\n', clone.outerHTML], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob), anchor = el('a', { href: url, download: `${seed.title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 100)}-수업.html` });
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
      status.textContent = '활동과 결과가 담긴 새 수업 파일을 내려받았어요. 처음 연 파일은 그대로예요.';
    } catch { status.textContent = '수업 파일을 만들지 못했어요. 작업은 이 화면에 남아 있어요. 다시 시도해 주세요.'; }
  } });
  host.replaceChildren(el('header', { class: 'lesson-header' }, el('div', {}, el('span', { class: 'lesson-brand', text: '온바탕 수업' }), title), download),
    el('nav', { class: 'lesson-navigation', 'aria-label': '슬라이드 이동' }, previous, count, next, returnToCover), stage, status,
    el('footer', { class: 'lesson-footer', text: '활동과 결과는 이 브라우저에 저장돼요. 다른 기기에서는 현재 수업을 내려받아 여세요.' }));
  function persist() {
    update = Date.now();
    const cells = Object.fromEntries(pages.filter(p => p.activity).map(p => [p.id, p.activity.cells]));
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, originalIds, updatedAt: update, currentId: pages[current].id, order: pages.map(p => p.id), cells, results: pages.filter(p => p.result) }));
      if (!persistent) status.textContent = '이 브라우저에 활동과 결과를 저장했어요.';
      persistent = true;
    } catch { persistent = false; status.textContent = '브라우저에 저장하지 못했어요. 지금 작업은 그대로 있어요. 현재 수업 내려받기로 결과를 보관해 주세요.'; }
  }
  function navigate(step) {
    const to = current + step;
    if (to < 0 || to >= pages.length) return;
    app?.destroy(); app = null; executing = false; current = to; persist(); render();
  }
  function render() {
    previous.disabled = current === 0; next.disabled = current === pages.length - 1;
    const page = pages[current]; count.textContent = `${current + 1} / ${pages.length}쪽${page.activity ? ' · 활동' : page.result ? ' · 결과' : ''}`;
    returnToCover.hidden = !executing;
    if (executing) return;
    const scene = el('section', { class: 'lesson-scene' });
    scene.append(el('img', { class: 'lesson-slide', src: page.image, alt: `${current + 1}쪽${page.activity ? ` ${page.activity.title}` : page.result ? ' 활동 결과' : ''}` }));
    if (page.activity) scene.append(el('button', { type: 'button', class: 'lesson-start', text: '활동 시작', onclick: () => {
      executing = true; returnToCover.hidden = false;
      const target = el('section', { class: 'lesson-scene lesson-activity' }); stage.replaceChildren(target);
      app = mountPixelArt(target, { activity: page.activity, onChange: cells => { page.activity = cleanPixelActivity({ ...page.activity, cells }); persist(); }, onSave: async cells => {
        page.activity = cleanPixelActivity({ ...page.activity, cells });
        const signature = JSON.stringify([page.id, page.activity.title, page.activity.palette, cells]);
        const existing = pages.findIndex(p => p.id === savedResults.get(signature));
        if (existing >= 0) {
          app?.destroy(); app = null; executing = false; current = existing; persist(); render();
          if (persistent) status.textContent = '같은 그림을 저장한 결과 슬라이드를 다시 열었어요.';
          return;
        }
        if (pages.length >= 500) throw new Error('이 수업은 최대 500쪽까지 저장할 수 있어요. 지금 그림은 그대로 있어요.');
        const result = { id: newId('p'), result: true, image: resultImage(page.activity, page.aspect), aspect: page.aspect };
        savedResults.set(signature, result.id);
        pages.splice(current + 1, 0, result); app?.destroy(); app = null; executing = false; current++; persist(); render();
        if (persistent) status.textContent = '결과를 다음 슬라이드에 저장했어요. 현재 수업 내려받기로 다른 기기에 옮길 수 있어요.';
      } });
      target.querySelector('button')?.focus({ preventScroll: true });
    } }));
    stage.replaceChildren(scene);
  }
  const keys = event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('button,input,textarea,select,[contenteditable=true],.pixel-app')) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); navigate(1); }
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); navigate(-1); }
  };
  document.addEventListener('keydown', keys); render();
  return { getPages: () => pages, destroy() { app?.destroy(); document.removeEventListener('keydown', keys); host.replaceChildren(); } };
}

function resultImage(activity, aspect) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(aspect >= 1 ? 1280 : 1280 * aspect); canvas.height = Math.round(canvas.width / aspect);
  const c = canvas.getContext('2d'); if (!c) throw new Error('결과 그림을 만들 수 없어요.');
  c.fillStyle = '#fffdf5'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = '#273f3a'; c.textAlign = 'center'; c.font = `bold ${Math.max(15, Math.min(38, canvas.width / 20))}px sans-serif`;
  c.fillText(`${activity.title} · 결과`, canvas.width / 2, canvas.height * .1, canvas.width * .9);
  const side = Math.min(canvas.width * .82, canvas.height * .68), left = (canvas.width - side) / 2, top = canvas.height * .53 - side / 2;
  c.fillStyle = '#ffffff'; c.fillRect(left, top, side, side);
  activity.cells.forEach((color, i) => { if (color < 0) return; c.fillStyle = activity.palette[color]; c.fillRect(left + i % activity.size * side / activity.size, top + Math.floor(i / activity.size) * side / activity.size, side / activity.size + .1, side / activity.size + .1); });
  c.font = `${Math.max(12, Math.min(22, canvas.width / 40))}px sans-serif`; c.fillStyle = '#526b60'; c.fillText('온바탕에서 만든 픽셀아트', canvas.width / 2, canvas.height * .95, canvas.width * .9);
  return canvas.toDataURL('image/png');
}

if (typeof document !== 'undefined' && document.getElementById('onbatang-lesson-data')) {
  try { mountHtmlLesson(JSON.parse(document.getElementById('onbatang-lesson-data').textContent)); }
  catch { document.getElementById('onbatang-lesson').textContent = '수업 파일을 열지 못했어요. 온바탕에서 다시 내려받아 주세요.'; }
}
