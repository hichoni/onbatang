// 발표 도구: 검은·흰 화면 · 펜 · 레이저 · 전체 보기 · 번호로 가기 · 도움말 · 손가락으로 넘기기 · 발표자 화면(두 번째 창).
// 온바탕 안의 발표와 내려받은 HTML 수업이 같은 도구를 쓴다. 쪽을 그리고 넘기는 일은 쓰는 쪽이 하고, 이 모듈은 그 위에 얹힌다.
// 모양(CSS)은 이 모듈이 들고 다닌다: 내려받은 HTML 과 발표자 화면 창에도 같은 모양이 따라가게(바깥 파일을 부르지 않는다).
import { el } from '../src/dom.js';
import { showAction, pageIndex, swipeStep, showClock, SHOW_KEYS } from './show-keys.js';

const STYLE_ID = 'onbatang-show-tools-style';
const STYLE = `
.ost-layer{position:absolute;inset:0;pointer-events:none;z-index:5}
.ost-curtain{position:absolute;inset:0;z-index:7;display:none}
.ost-curtain.black{display:block;background:#000}.ost-curtain.white{display:block;background:#fff}
.ost-ink{position:absolute;inset:0;width:100%;height:100%;z-index:6;pointer-events:none;touch-action:none}
.ost-ink.on{pointer-events:auto;cursor:crosshair}.ost-ink.laser{pointer-events:auto;cursor:none}
.ost-dot{position:absolute;z-index:8;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:radial-gradient(circle,#ff3b3b 0 35%,rgba(255,59,59,.45) 36% 60%,rgba(255,59,59,0) 61%);pointer-events:none;display:none}
.ost-digits{position:absolute;right:24px;top:20px;z-index:9;min-width:56px;padding:8px 14px;border-radius:12px;background:rgba(20,24,40,.82);color:#fff;font:700 28px/1.2 system-ui,sans-serif;text-align:center;display:none}
.ost-panel{position:absolute;inset:0;z-index:9;display:none;overflow:auto;padding:28px;background:rgba(14,18,32,.94);color:#fff;font-family:system-ui,sans-serif;pointer-events:auto}
.ost-panel.open{display:block}
.ost-panel h2{margin:0 0 16px;font-size:20px}
.ost-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}
.ost-tile{position:relative;display:block;padding:0;border:3px solid transparent;border-radius:10px;background:#20263c;color:#fff;cursor:pointer;overflow:hidden;font:inherit;text-align:left}
.ost-tile.on{border-color:#ffd43b}.ost-tile:focus-visible{outline:3px solid #74c0fc;outline-offset:2px}
.ost-tile-view{display:block;aspect-ratio:var(--ost-ratio,1.7778);pointer-events:none;overflow:hidden;background:#fff}
.ost-tile-view>*{width:100%;height:100%;object-fit:contain}
.ost-tile-view .fe-card{--fe-card-radius:0}
.ost-tile-no{position:absolute;left:6px;top:6px;padding:0 6px;border-radius:6px;background:rgba(20,24,40,.85);font:700 13px/20px system-ui,sans-serif}
.ost-help-list{display:grid;grid-template-columns:max-content 1fr;gap:10px 22px;margin:0;font-size:17px}
.ost-help-list dt{font-weight:800;color:#ffd43b}.ost-help-list dd{margin:0}
.ost-help-note{margin-top:18px;color:#c5cbe0;font-size:14px}
.ost-key.on{background:#ffd43b!important;color:#1d2433!important}
@media (max-width:680px){.ost-key.ost-wide{display:none!important}}
.ost-presenter{margin:0;height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#11151f;color:#f1f3f9;font-family:system-ui,sans-serif}
.ost-p-head{display:flex;align-items:center;gap:14px;padding:10px 16px;background:#1b2130;flex-wrap:wrap}
.ost-p-title{font-weight:800;font-size:16px;flex:1;min-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ost-p-clock{font:800 30px/1 ui-monospace,monospace;letter-spacing:.02em}
.ost-p-count{font-weight:800;font-size:18px;color:#ffd43b}
.ost-p-btn{padding:8px 14px;border:1px solid #39425c;border-radius:10px;background:#252c40;color:#fff;font:700 15px system-ui,sans-serif;cursor:pointer}
.ost-p-btn:hover{background:#30395a}.ost-p-btn:focus-visible{outline:3px solid #74c0fc;outline-offset:2px}
.ost-p-main{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr);gap:16px;padding:16px;min-height:0}
.ost-p-now,.ost-p-side{display:grid;gap:10px;min-height:0;align-content:start}
.ost-p-side{grid-template-rows:auto auto minmax(0,1fr)}
.ost-p-label{font-size:13px;font-weight:700;color:#9aa3bd}
.ost-p-view{aspect-ratio:var(--ost-ratio,1.7778);max-height:62vh;background:#fff;border-radius:6px;overflow:hidden;display:grid;place-items:center}
.ost-p-view>*{width:100%;height:100%;object-fit:contain}.ost-p-view .fe-card{--fe-card-radius:0}
.ost-p-next{max-height:26vh}.ost-p-end{color:#5a6376;font-weight:700}
.ost-p-notes{overflow:auto;padding:12px 14px;border-radius:10px;background:#1b2130;white-space:pre-wrap;line-height:1.55;font-size:var(--ost-notes,22px)}
.ost-p-notes.empty{color:#7c86a3;font-size:16px}
.ost-p-foot{display:flex;gap:10px;align-items:center;padding:10px 16px;background:#1b2130;flex-wrap:wrap}
.ost-p-gap{flex:1}
@media (max-width:760px){.ost-p-main{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.ost-dot{transition:none}}
`;
export function ensureShowStyle(doc = document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  doc.head.append(style);
}

/**
 * root(발표 화면 전체를 덮는 요소, position 이 있는 것) 위에 발표 도구를 얹는다.
 * opts:
 *   total() · index()                 — 쪽 수, 지금 쪽(0부터)
 *   next() · prev() · go(i) · close() — 넘기기(쓰는 쪽의 움직임·영상 차례를 따른다) · 그 쪽으로 · 끝내기
 *   thumb(i) · preview(i)             — 전체 보기의 작은 그림 · 발표자 화면의 그림(새 요소를 돌려준다)
 *   notes(i) · label(i)               — 그 쪽의 발표자 노트(글) · 종류 이름표(활동 · 결과 등, 없으면 '')
 *   ratio(i)                          — 그 쪽의 가로÷세로
 *   video()                           — K: 영상 멈추기·틀기(없으면 K 를 듣지 않는다)
 *   title · notify(message) · keyClass(발표 막대 단추에 붙일 class)
 * 돌려주는 것: { handle(event) 처리했으면 true · claimClick(event) 도구가 그 누르기를 썼으면 true · changed() 쪽이 바뀐 뒤 부른다 ·
 *   buttons(발표 막대에 넣을 단추들) · openPresenter() · destroy() }
 */
export function createShowTools(root, opts) {
  const doc = root.ownerDocument;
  ensureShowStyle(doc);
  const state = { digits: '' };
  const started = Date.now();
  let curtain = '', tool = '', panel = '', swallow = false, digitTimer = 0, presenter = null, strokes = [], stroke = null, swipe = null;
  const curtainEl = el('div', { class: 'ost-curtain', 'aria-hidden': 'true' });
  const ink = el('canvas', { class: 'ost-ink', 'aria-hidden': 'true' });
  const dot = el('div', { class: 'ost-dot', 'aria-hidden': 'true' });
  const digits = el('div', { class: 'ost-digits', role: 'status', 'aria-live': 'polite' });
  const panelEl = el('div', { class: 'ost-panel', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
  root.append(ink, dot, curtainEl, digits, panelEl);

  const key = (label, title, onClick, more = '') => el('button', { class: `${opts.keyClass || ''} ost-key${more}`, type: 'button', title, 'aria-label': title, onClick: (e) => { e.stopPropagation(); onClick(); } }, label);
  const penBtn = key('펜', '펜으로 쓰기 (P)', () => setTool('pen'));
  // 레이저와 발표자 화면은 마우스와 두 번째 화면이 있을 때 쓴다: 좁은 화면(휴대폰)에서는 단추를 감춘다(글쇠는 그대로 듣는다).
  const laserBtn = key('레이저', '레이저 포인터 (L)', () => setTool('laser'), ' ost-wide');
  const gridBtn = key('전체', '전체 보기 (G)', () => togglePanel('overview'));
  const presenterBtn = key('발표자', '발표자 화면 열기: 노트 · 다음 쪽 · 시간 (S)', () => openPresenter(), ' ost-wide');
  const helpBtn = key('?', '단축키 보기 (?)', () => togglePanel('help'));
  const buttons = [penBtn, laserBtn, gridBtn, presenterBtn, helpBtn];

  // ---------- 검은·흰 화면 ----------
  function setCurtain(kind) {
    curtain = curtain === kind ? '' : kind;
    curtainEl.className = `ost-curtain${curtain ? ` ${curtain}` : ''}`;
    renderPresenter();
  }

  // ---------- 펜 · 레이저 ----------
  function sizeInk() {
    const ratio = doc.defaultView.devicePixelRatio || 1, w = Math.round(root.clientWidth * ratio), h = Math.round(root.clientHeight * ratio);
    if (ink.width !== w || ink.height !== h) { ink.width = w; ink.height = h; paint(); }
  }
  function paint() {
    const c = ink.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, ink.width, ink.height);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#e03131'; c.lineWidth = Math.max(3, ink.width / 320);
    for (const line of strokes) {
      c.beginPath();
      line.forEach(([x, y], n) => (n ? c.lineTo(x * ink.width, y * ink.height) : c.moveTo(x * ink.width, y * ink.height)));
      if (line.length === 1) c.lineTo(line[0][0] * ink.width + .1, line[0][1] * ink.height);
      c.stroke();
    }
  }
  const at = (e) => { const r = ink.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  function setTool(next) {
    tool = tool === next ? '' : next;
    ink.className = `ost-ink${tool === 'pen' ? ' on' : tool === 'laser' ? ' laser' : ''}`;
    dot.style.display = 'none';
    penBtn.classList.toggle('on', tool === 'pen');
    laserBtn.classList.toggle('on', tool === 'laser');
    penBtn.setAttribute('aria-pressed', String(tool === 'pen'));
    laserBtn.setAttribute('aria-pressed', String(tool === 'laser'));
    if (tool) sizeInk();
  }
  function erase() { strokes = []; stroke = null; paint(); }
  ink.addEventListener('pointerdown', (e) => {
    if (tool !== 'pen') return;
    e.preventDefault(); e.stopPropagation();
    ink.setPointerCapture?.(e.pointerId);
    stroke = [at(e)]; strokes.push(stroke); paint();
  });
  ink.addEventListener('pointermove', (e) => {
    if (tool === 'laser') {
      const r = root.getBoundingClientRect();
      dot.style.display = 'block'; dot.style.left = `${e.clientX - r.left}px`; dot.style.top = `${e.clientY - r.top}px`;
      return;
    }
    if (tool !== 'pen' || !stroke) return;
    stroke.push(at(e)); paint();
  });
  const endStroke = () => { stroke = null; };
  ink.addEventListener('pointerup', endStroke);
  ink.addEventListener('pointercancel', endStroke);
  ink.addEventListener('pointerleave', () => { dot.style.display = 'none'; });
  ink.addEventListener('click', (e) => e.stopPropagation());
  const onResize = () => { if (tool || strokes.length) sizeInk(); };
  doc.defaultView.addEventListener('resize', onResize);

  // ---------- 전체 보기 · 도움말 ----------
  function togglePanel(kind) {
    if (panel === kind) { closePanel(); return; }
    panel = kind;
    gridBtn.classList.toggle('on', kind === 'overview');
    helpBtn.classList.toggle('on', kind === 'help');
    if (kind === 'overview') {
      const now = opts.index();
      const tiles = Array.from({ length: opts.total() }, (_, i) => {
        const view = el('span', { class: 'ost-tile-view' }, opts.thumb(i));
        view.style.setProperty('--ost-ratio', String(opts.ratio(i)));
        const label = opts.label(i);
        return el('button', { class: `ost-tile${i === now ? ' on' : ''}`, type: 'button', title: `${i + 1}쪽${label ? ` · ${label}` : ''}`, 'aria-label': `${i + 1}쪽${label ? ` ${label}` : ''}`, onClick: (e) => { e.stopPropagation(); closePanel(); if (i !== opts.index()) opts.go(i); } },
          view, el('span', { class: 'ost-tile-no', text: `${i + 1}${label ? ` · ${label}` : ''}` }));
      });
      panelEl.setAttribute('aria-label', '전체 보기');
      panelEl.replaceChildren(el('h2', { text: `전체 보기 · ${opts.total()}쪽 (번호를 누르거나 Esc)` }), el('div', { class: 'ost-grid' }, tiles));
      panelEl.classList.add('open');
      tiles[now]?.focus({ preventScroll: true });
      tiles[now]?.scrollIntoView({ block: 'nearest' });
    } else {
      panelEl.setAttribute('aria-label', '발표 단축키');
      panelEl.replaceChildren(el('h2', { text: '발표 단축키' }),
        el('dl', { class: 'ost-help-list' }, SHOW_KEYS.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
        el('p', { class: 'ost-help-note', text: '프레젠터(리모컨)의 넘기기 단추는 앱 쪽에서도 들어요. 아무 곳이나 누르거나 Esc 를 누르면 닫혀요.' }));
      panelEl.classList.add('open');
      panelEl.focus({ preventScroll: true });
    }
  }
  function closePanel() {
    panel = '';
    panelEl.classList.remove('open');
    panelEl.replaceChildren();
    gridBtn.classList.remove('on');
    helpBtn.classList.remove('on');
    root.focus?.({ preventScroll: true });
  }
  panelEl.addEventListener('click', (e) => { e.stopPropagation(); if (panel === 'help' || e.target === panelEl) closePanel(); });
  function moveTile(step) {
    const tiles = [...panelEl.querySelectorAll('.ost-tile')], from = tiles.indexOf(doc.activeElement);
    tiles[Math.max(0, Math.min(tiles.length - 1, (from < 0 ? opts.index() : from) + step))]?.focus();
  }

  // ---------- 번호 ----------
  function showDigits(value) {
    clearTimeout(digitTimer);
    digits.textContent = value;
    digits.style.display = value ? 'block' : 'none';
    if (value) digitTimer = setTimeout(() => { state.digits = ''; digits.style.display = 'none'; }, 2500);
  }

  // ---------- 손가락으로 넘기기 ----------
  root.addEventListener('pointerdown', (e) => { swipe = e.pointerType === 'touch' && !tool && !panel ? [e.clientX, e.clientY] : null; });
  root.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const step = swipeStep(e.clientX - swipe[0], e.clientY - swipe[1]);
    swipe = null;
    if (!step) return;
    swallow = true;
    setTimeout(() => { swallow = false; }, 400);
    if (step > 0) opts.next(); else opts.prev();
  });

  // ---------- 글쇠 ----------
  function handle(e) {
    if (panel === 'overview' && e.target?.closest?.('.ost-tile') && (e.key === 'Enter' || e.key === ' ')) return false;
    if (panel === 'overview' && ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) { moveTile(['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1); return true; }
    const action = showAction(e, state);
    if (!action) return false;
    if (action.type === 'digits') { showDigits(action.value); return true; }
    showDigits('');
    if (panel) { if (action.type === 'close' || action.type === 'help' || action.type === 'overview' || panel === 'help') { closePanel(); return true; } }
    if (curtain && !['black', 'white', 'presenter'].includes(action.type)) { setCurtain(curtain); return true; }
    switch (action.type) {
      case 'close': if (tool) setTool(tool); else opts.close(); return true;
      case 'next': opts.next(); return true;
      case 'prev': opts.prev(); return true;
      case 'first': opts.go(0); return true;
      case 'last': opts.go(opts.total() - 1); return true;
      case 'goto': opts.go(pageIndex(action.page, opts.total())); return true;
      case 'black': case 'white': setCurtain(action.type); return true;
      case 'overview': case 'help': togglePanel(action.type); return true;
      case 'pen': case 'laser': setTool(action.type); return true;
      case 'erase': erase(); return true;
      case 'presenter': openPresenter(); return true;
      case 'video': if (!opts.video) return false; opts.video(); return true;
      default: return false;
    }
  }
  /** 발표 화면을 누른 것을 도구가 썼는지(그러면 다음 쪽으로 넘기지 않는다). */
  function claimClick() {
    if (swallow) { swallow = false; return true; }
    if (panel) { closePanel(); return true; }
    if (curtain) { setCurtain(curtain); return true; }
    return !!tool;
  }

  // ---------- 발표자 화면(두 번째 창) ----------
  function openPresenter() {
    if (presenter && !presenter.win.closed) { presenter.win.focus(); return; }
    let win = null;
    try { win = doc.defaultView.open('', 'onbatang-presenter', 'popup=yes,width=1180,height=760'); } catch { win = null; }
    if (!win) { opts.notify?.('발표자 화면 창이 막혔어요. 주소창의 팝업 허용을 누른 뒤 S 를 다시 눌러주세요.'); return; }
    const d = win.document;
    d.open();
    d.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>발표자 화면 · 온바탕</title></head><body class="ost-presenter"></body></html>');
    d.close();
    // 그림을 그리는 모양(편집기·앱의 CSS)을 글로 옮겨 간다. 새 창에서 파일을 다시 받지 않는다(빈 창에 붙인 link 는 늦거나 안 읽힌다).
    // 글꼴 같은 상대 주소는 원래 CSS 파일의 주소로 풀어 둔다.
    const rules = [];
    for (const sheet of doc.styleSheets) {
      try {
        const base = sheet.href || doc.baseURI;
        rules.push([...sheet.cssRules].map((rule) => rule.cssText.replace(/url\("([^"]+)"\)/g, (all, url) => { try { return `url("${new URL(url, base).href}")`; } catch { return all; } })).join('\n'));
      } catch {
        if (sheet.href) d.head.append(Object.assign(d.createElement('link'), { rel: 'stylesheet', href: sheet.href }));
      }
    }
    const copied = d.createElement('style');
    copied.textContent = rules.join('\n');
    d.head.append(copied);
    ensureShowStyle(d);
    const clock = el('span', { class: 'ost-p-clock', role: 'timer', 'aria-label': '발표 시간' });
    const count = el('span', { class: 'ost-p-count' });
    const now = el('div', { class: 'ost-p-view' }), next = el('div', { class: 'ost-p-view ost-p-next' });
    const notes = el('div', { class: 'ost-p-notes', tabindex: '0', 'aria-label': '발표자 노트' });
    const status = el('span', { class: 'ost-p-label', role: 'status' });
    let size = 22, from = started;
    const resize = (step) => { size = Math.max(14, Math.min(44, size + step)); notes.style.setProperty('--ost-notes', `${size}px`); };
    const pbtn = (label, title, onClick) => el('button', { class: 'ost-p-btn', type: 'button', title, onClick }, label);
    d.body.append(
      el('header', { class: 'ost-p-head' }, el('span', { class: 'ost-p-title', text: opts.title || '발표' }), count, clock,
        pbtn('시간 다시', '발표 시간을 0부터 다시 재요', () => { from = Date.now(); tick(); })),
      el('main', { class: 'ost-p-main' },
        el('section', { class: 'ost-p-now' }, el('span', { class: 'ost-p-label', text: '지금 화면' }), now, status),
        el('section', { class: 'ost-p-side' }, el('span', { class: 'ost-p-label', text: '다음 쪽' }), next,
          el('div', { style: 'display:grid;gap:8px;min-height:0;grid-template-rows:auto minmax(0,1fr)' },
            el('div', { style: 'display:flex;align-items:center;gap:8px' }, el('span', { class: 'ost-p-label', text: '발표자 노트' }), el('span', { class: 'ost-p-gap' }),
              pbtn('가−', '노트 글씨 작게', () => resize(-2)), pbtn('가+', '노트 글씨 크게', () => resize(2))),
            notes))),
      el('footer', { class: 'ost-p-foot' },
        pbtn('◀ 앞', '앞 쪽 (←)', () => opts.prev()), pbtn('다음 ▶', '다음 쪽 (→)', () => opts.next()),
        pbtn('검은 화면', '청중 화면을 잠깐 검게 (B)', () => setCurtain('black')),
        el('span', { class: 'ost-p-gap' }),
        pbtn('발표 끝내기', '발표를 끝내요 (Esc)', () => opts.close())));
    resize(0);
    const tick = () => { clock.textContent = showClock(Date.now() - from); };
    tick();
    const timer = win.setInterval(tick, 1000);
    d.addEventListener('keydown', (e) => { if (e.target?.closest?.('button') && (e.key === 'Enter' || e.key === ' ')) return; if (handle(e)) { e.preventDefault(); e.stopPropagation(); } });
    win.addEventListener('pagehide', () => { win.clearInterval(timer); if (presenter?.win === win) presenter = null; });
    presenter = { win, now, next, notes, count, status };
    renderPresenter();
    win.focus();
  }
  function renderPresenter() {
    if (!presenter || presenter.win.closed) { presenter = null; return; }
    const i = opts.index(), n = opts.total(), label = opts.label(i), text = opts.notes(i);
    presenter.count.textContent = `${i + 1} / ${n}`;
    presenter.status.textContent = [label, curtain === 'black' ? '청중 화면: 검은 화면' : curtain === 'white' ? '청중 화면: 흰 화면' : ''].filter(Boolean).join(' · ');
    presenter.now.style.setProperty('--ost-ratio', String(opts.ratio(i)));
    presenter.now.replaceChildren(opts.preview(i));
    if (i + 1 < n) { presenter.next.style.setProperty('--ost-ratio', String(opts.ratio(i + 1))); presenter.next.replaceChildren(opts.preview(i + 1)); }
    else presenter.next.replaceChildren(el('span', { class: 'ost-p-end', text: '마지막 쪽이에요' }));
    presenter.notes.textContent = text || '이 쪽에는 발표자 노트가 없어요. 편집 화면의 그림 아래 「발표자 노트」에 적을 수 있어요.';
    presenter.notes.classList.toggle('empty', !text);
  }

  return {
    handle, claimClick, buttons, openPresenter,
    /** 쪽이 바뀐 뒤: 그린 것을 지우고, 열린 칸을 닫고, 발표자 화면을 맞춘다. */
    changed() { erase(); if (panel) closePanel(); renderPresenter(); },
    destroy() {
      clearTimeout(digitTimer);
      doc.defaultView.removeEventListener('resize', onResize);
      if (presenter && !presenter.win.closed) presenter.win.close();
      presenter = null;
      for (const node of [ink, dot, curtainEl, digits, panelEl]) node.remove();
    },
  };
}
