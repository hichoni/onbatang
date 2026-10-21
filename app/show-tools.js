// 발표 도구: 검은·흰 화면 · 펜 · 레이저 · 전체 보기 · 번호로 가기 · 도움말 · 손가락으로 넘기기 · 발표자 화면(두 번째 창) · 카메라 창.
// 온바탕 안의 발표와 내려받은 HTML 수업이 같은 도구를 쓴다. 쪽을 그리고 넘기는 일은 쓰는 쪽이 하고, 이 모듈은 그 위에 얹힌다.
// 모양(CSS)은 이 모듈이 들고 다닌다: 내려받은 HTML 과 발표자 화면 창에도 같은 모양이 따라가게(바깥 파일을 부르지 않는다).
import { el } from '../src/dom.js';
import { showAction, pageIndex, swipeStep, showClock, autoDelay, SHOW_KEYS } from './show-keys.js';
import { topicGroups } from '../src/document.js';

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
.ost-topic{margin:0 0 22px}
.ost-topic-head{display:flex;align-items:baseline;gap:10px;margin:0 0 10px;padding:6px 12px;border:0;border-radius:10px;background:#2b3354;color:#fff;font:800 17px/1.3 system-ui,sans-serif;cursor:pointer;text-align:left}
.ost-topic-head span{font-size:13px;font-weight:700;color:#c5cbe0}
.ost-topic-head:hover{background:#3a4470}.ost-topic-head:focus-visible{outline:3px solid #74c0fc;outline-offset:2px}
.ost-panel{transition:background-color .3s}
.ost-panel h2,.ost-topic-head,.ost-tile{transition:opacity .25s}
.ost-tile.ost-zoom{z-index:3}
.ost-panel.ost-zooming{background:transparent;overflow:hidden}
.ost-panel.ost-zooming h2,.ost-panel.ost-zooming .ost-topic-head,.ost-panel.ost-zooming .ost-tile:not(.ost-zoom){opacity:0}
.ost-help-list{display:grid;grid-template-columns:max-content 1fr;gap:10px 22px;margin:0;font-size:17px}
.ost-help-list dt{font-weight:800;color:#ffd43b}.ost-help-list dd{margin:0}
.ost-help-note{margin-top:18px;color:#c5cbe0;font-size:14px}
.ost-key.on{background:#ffd43b!important;color:#1d2433!important}
.ost-cam{position:absolute;z-index:6;width:var(--ost-cam,20%);aspect-ratio:1;border-radius:50%;overflow:hidden;border:4px solid #fff;box-shadow:0 6px 24px rgba(0,0,0,.35);background:#20263c;pointer-events:auto;cursor:grab;touch-action:none;display:none}
.ost-cam.on{display:block}.ost-cam.big{--ost-cam:34%}.ost-cam:active{cursor:grabbing}
.ost-cam video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);pointer-events:none}
.ost-rehearse{position:absolute;left:20px;top:18px;z-index:9;padding:6px 12px;border-radius:10px;background:rgba(201,42,42,.9);color:#fff;font:700 15px/1.3 system-ui,sans-serif;pointer-events:none;display:none}
.ost-rehearse.on{display:block}
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
@media (prefers-reduced-motion:reduce){.ost-dot,.ost-panel,.ost-panel h2,.ost-topic-head,.ost-tile{transition:none}}
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
 *   topic(i)                          — 그 쪽에서 시작하는 주제 이름(없으면 ''. 프레지처럼 전체 보기를 주제로 묶는다)
 *   dwell(i) · steps(i)               — 자동 넘기기: 그 쪽에 머무는 시간(초, 없으면 기본) · 누를 때 나오는 걸음 수
 *   saveTimes(seconds[])              — 리허설로 잰 쪽마다의 시간(초, 들르지 않은 쪽은 null)을 받는다. 없으면 리허설을 쓰지 않는다
 *   video()                           — K: 영상 멈추기·틀기(없으면 K 를 듣지 않는다)
 *   title · notify(message) · keyClass(발표 막대 단추에 붙일 class)
 * 돌려주는 것: { handle(event) 처리했으면 true · claimClick(event) 도구가 그 누르기를 썼으면 true · changed() 쪽이 바뀐 뒤 부른다 ·
 *   buttons(발표 막대에 넣을 단추들) · openPresenter() · presenting() 발표자 화면이 열려 있는지 · camera() 카메라 창이 켜져 있는지 · destroy() }
 * 전체 화면: F 와 단추로 root 를 전체 화면으로 켜고 끈다. 새 창(발표자 화면)을 열면 브라우저가 전체 화면을 풀 수 있다:
 *   쓰는 쪽은 presenting() 이 참일 때 전체 화면이 풀려도 발표를 끝내지 않는다(창 안에서 이어 가고, F 로 다시 켠다).
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
  // 카메라 창: 발표하는 사람의 얼굴을 슬라이드 위 동그란 창으로 보여 준다(키노트·프레지 비디오처럼). 녹화하지 않고, 마이크는 켜지 않는다.
  // 끌어서 옮기고, 두 번 누르면 크게·작게. 검은·흰 화면이면 함께 가려진다. 발표자 화면 창에는 나오지 않는다.
  const camVideo = el('video', { muted: true, playsinline: true, autoplay: true, 'aria-hidden': 'true' });
  camVideo.muted = true;
  const camEl = el('div', { class: 'ost-cam', role: 'img', 'aria-label': '발표자 카메라 창 (C 로 끄기)', title: '끌어서 옮기기 · 두 번 눌러 크기 바꾸기 · C 로 끄기' }, camVideo);
  let camStream = null, camTurn = 0, camDrag = null;
  // 자동 넘기기 · 리허설
  let autoOn = false, autoTimer = 0, autoDone = 0, rehearsing = false, times = [], here = -1, since = 0, rehearseTick = 0;
  const rehearseEl = el('div', { class: 'ost-rehearse', role: 'status', 'aria-live': 'off' });
  root.append(ink, dot, camEl, curtainEl, digits, panelEl, rehearseEl);

  const key = (label, title, onClick, more = '') => el('button', { class: `${opts.keyClass || ''} ost-key${more}`, type: 'button', title, 'aria-label': title, onClick: (e) => { e.stopPropagation(); onClick(); } }, label);
  const penBtn = key('펜', '펜으로 쓰기 (P)', () => setTool('pen'));
  // 레이저와 발표자 화면은 마우스와 두 번째 화면이 있을 때 쓴다: 좁은 화면(휴대폰)에서는 단추를 감춘다(글쇠는 그대로 듣는다).
  const laserBtn = key('레이저', '레이저 포인터 (L)', () => setTool('laser'), ' ost-wide');
  const gridBtn = key('전체', '전체 보기 (G)', () => togglePanel('overview'));
  const presenterBtn = key('발표자', '발표자 화면 열기: 노트 · 다음 쪽 · 시간 (S)', () => openPresenter(), ' ost-wide');
  const helpBtn = key('?', '단축키 보기 (?)', () => togglePanel('help'));
  const fullBtn = key('전체 화면', '전체 화면 켜기 · 끄기 (F)', () => toggleFullscreen(), ' ost-wide');
  const camBtn = key('카메라', '내 얼굴 카메라 창 (C)', () => toggleCamera());
  const autoBtn = key('자동', '자동 넘기기: 끝나면 처음부터 다시 (A)', () => toggleAuto(), ' ost-wide');
  const rehearseBtn = opts.saveTimes ? key('리허설', '리허설: 장마다 걸린 시간 재기 (R)', () => toggleRehearse(), ' ost-wide') : null;
  const buttons = [penBtn, laserBtn, gridBtn, camBtn, autoBtn, ...(rehearseBtn ? [rehearseBtn] : []), presenterBtn, fullBtn, helpBtn];
  function toggleFullscreen() {
    if (doc.fullscreenElement) doc.exitFullscreen?.().catch(() => {});
    else root.requestFullscreen?.().catch(() => opts.notify?.('이 화면에서는 전체 화면을 켤 수 없어요.'));
  }

  // ---------- 자동 넘기기(키노트의 자동 재생 · 반복) ----------
  // 그 쪽의 머무는 시간을 누를 때 나오는 걸음과 다음 쪽 사이에 나눠 하나씩 넘긴다. 마지막 쪽 다음은 처음 쪽이다(교실 앞 화면에 틀어 두기).
  // 전체 보기·검은 화면이 열려 있으면 기다렸다가 다시 잰다. 손으로 넘기면 그 쪽부터 다시 잰다.
  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (!autoOn) return;
    const i = opts.index(), steps = Math.max(0, opts.steps?.(i) || 0);
    autoTimer = setTimeout(() => {
      if (!autoOn) return;
      if (panel || curtain) { scheduleAuto(); return; }
      if (autoDone < steps) { autoDone += 1; opts.next(); scheduleAuto(); return; }
      if (opts.index() >= opts.total() - 1) { if (opts.total() > 1) opts.go(0); else scheduleAuto(); return; }
      opts.next();
    }, autoDelay(opts.dwell?.(i), steps));
  }
  function toggleAuto() {
    autoOn = !autoOn;
    autoBtn.classList.toggle('on', autoOn);
    autoBtn.setAttribute('aria-pressed', String(autoOn));
    autoDone = 0;
    scheduleAuto();
    opts.notify?.(autoOn ? '자동 넘기기를 켰어요. 리허설로 잰 시간이 있는 장은 그 시간만큼, 없으면 8초씩 머물고 끝나면 처음부터 다시 해요. A 로 꺼요.' : '자동 넘기기를 껐어요.');
    renderPresenter();
  }

  // ---------- 리허설(키노트의 발표 연습) ----------
  // 켜 둔 동안 쪽마다 머문 시간을 더해 간다. 끄거나 발표를 끝내면 잰 시간을 쓰는 쪽에 넘긴다(저장할지는 그쪽이 묻는다).
  function noteTime() {
    if (!rehearsing || here < 0) return;
    times[here] = (times[here] || 0) + (Date.now() - since) / 1000;
    since = Date.now();
  }
  function paintRehearse() {
    if (!rehearsing) return;
    const i = opts.index(), now = (times[i] || 0) + (here === i ? (Date.now() - since) / 1000 : 0);
    const all = times.reduce((sum, v) => sum + (v || 0), 0) + (Date.now() - since) / 1000;
    rehearseEl.textContent = `리허설 · 이 쪽 ${showClock(now * 1000)} · 전체 ${showClock(all * 1000)}`;
  }
  function toggleRehearse(finish = false) {
    if (!opts.saveTimes) return;
    if (!rehearsing) {
      if (finish) return;
      rehearsing = true; times = Array.from({ length: opts.total() }, () => null); here = opts.index(); since = Date.now();
      rehearseEl.classList.add('on');
      rehearseBtn.classList.add('on'); rehearseBtn.setAttribute('aria-pressed', 'true');
      paintRehearse();
      rehearseTick = setInterval(paintRehearse, 500);
      opts.notify?.('리허설을 시작했어요. 평소처럼 발표하면 장마다 걸린 시간을 재요. R 로 그만 재요.');
    } else {
      noteTime();
      rehearsing = false; clearInterval(rehearseTick);
      rehearseEl.classList.remove('on');
      rehearseBtn.classList.remove('on'); rehearseBtn.setAttribute('aria-pressed', 'false');
      const got = times.map((v) => (v == null ? null : Math.max(1, Math.round(v))));
      if (got.some((v) => v != null)) opts.saveTimes(got);
    }
    renderPresenter();
  }

  // ---------- 카메라 창 ----------
  function placeCam(x, y) {
    const R = root.getBoundingClientRect(), w = camEl.offsetWidth || R.width * .2;
    camEl.style.left = `${Math.max(0, Math.min(R.width - w, x))}px`;
    camEl.style.top = `${Math.max(0, Math.min(R.height - w, y))}px`;
  }
  async function toggleCamera() {
    if (camStream || camEl.classList.contains('on')) { stopCamera(); return; }
    const media = doc.defaultView.navigator.mediaDevices;
    if (!media?.getUserMedia) { opts.notify?.('이 브라우저에서는 카메라를 쓸 수 없어요.'); return; }
    const mine = ++camTurn;
    camEl.classList.add('on');
    camBtn.classList.add('on');
    camBtn.setAttribute('aria-pressed', 'true');
    // 처음에는 오른쪽 아래에 둔다.
    if (!camEl.style.left) { const R = root.getBoundingClientRect(), w = camEl.offsetWidth; placeCam(R.width - w - R.width * .03, R.height - w - R.height * .05); }
    try {
      const stream = await media.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: 'user' }, audio: false });
      if (mine !== camTurn) { stream.getTracks().forEach((t) => t.stop()); return; }
      camStream = stream;
      camVideo.srcObject = stream;
      camVideo.play?.().catch(() => {});
    } catch (error) {
      if (mine !== camTurn) return;
      stopCamera();
      opts.notify?.(error?.name === 'NotAllowedError' ? '카메라가 막혀 있어요. 주소창의 카메라 허용을 누른 뒤 C 를 다시 눌러주세요.' : '카메라를 켜지 못했어요. 다른 프로그램이 카메라를 쓰고 있는지 확인해주세요.');
    }
  }
  function stopCamera() {
    camTurn += 1;
    camStream?.getTracks().forEach((t) => t.stop());
    camStream = null;
    camVideo.srcObject = null;
    camEl.classList.remove('on');
    camBtn.classList.remove('on');
    camBtn.setAttribute('aria-pressed', 'false');
  }
  camEl.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    camEl.setPointerCapture?.(e.pointerId);
    camDrag = [e.clientX - camEl.offsetLeft, e.clientY - camEl.offsetTop];
  });
  camEl.addEventListener('pointermove', (e) => { if (camDrag) placeCam(e.clientX - camDrag[0], e.clientY - camDrag[1]); });
  const endCamDrag = (e) => { camDrag = null; e.stopPropagation(); };
  camEl.addEventListener('pointerup', endCamDrag);
  camEl.addEventListener('pointercancel', endCamDrag);
  camEl.addEventListener('click', (e) => e.stopPropagation());
  camEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    camEl.classList.toggle('big');
    placeCam(camEl.offsetLeft, camEl.offsetTop);
  });

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
      const now = opts.index(), total = opts.total();
      const tiles = Array.from({ length: total }, (_, i) => {
        const view = el('span', { class: 'ost-tile-view' }, opts.thumb(i));
        view.style.setProperty('--ost-ratio', String(opts.ratio(i)));
        const label = opts.label(i);
        return el('button', { class: `ost-tile${i === now ? ' on' : ''}`, type: 'button', title: `${i + 1}쪽${label ? ` · ${label}` : ''}`, 'aria-label': `${i + 1}쪽${label ? ` ${label}` : ''}`, onClick: (e) => { e.stopPropagation(); pick(i); } },
          view, el('span', { class: 'ost-tile-no', text: `${i + 1}${label ? ` · ${label}` : ''}` }));
      });
      // 주제가 있으면 주제마다 묶어 보여 준다. 주제 이름을 누르면 그 주제의 첫 쪽으로 간다(프레지의 주제 이동).
      const groups = topicGroups(Array.from({ length: total }, (_, i) => opts.topic?.(i) || ''));
      const named = groups.some((g) => g.name);
      const body = named
        ? groups.map((g) => el('section', { class: 'ost-topic', 'aria-label': g.name || '처음' },
          el('button', { class: 'ost-topic-head', type: 'button', title: `${g.name || '처음'} 주제의 첫 쪽으로`, onClick: (e) => { e.stopPropagation(); pick(g.start); } },
            el('b', { text: g.name || '처음' }), el('span', { text: g.start === g.end ? `${g.start + 1}쪽` : `${g.start + 1}–${g.end + 1}쪽` })),
          el('div', { class: 'ost-grid' }, tiles.slice(g.start, g.end + 1))))
        : [el('div', { class: 'ost-grid' }, tiles)];
      panelEl.setAttribute('aria-label', '전체 보기');
      panelEl.replaceChildren(el('h2', { text: `전체 보기 · ${total}쪽${named ? ` · 주제 ${groups.filter((g) => g.name).length}개` : ''} (번호를 누르거나 Esc)` }), ...body);
      panelEl.classList.add('open');
      tiles[now]?.focus({ preventScroll: true });
      tiles[now]?.scrollIntoView({ block: 'nearest' });
      // 지금 쪽이 작아지며 전체 보기 속 제자리로 물러난다(프레지처럼 멀리서 보기).
      if (tiles[now]) zoom(tiles[now], false);
    } else {
      panelEl.setAttribute('aria-label', '발표 단축키');
      panelEl.replaceChildren(el('h2', { text: '발표 단축키' }),
        el('dl', { class: 'ost-help-list' }, SHOW_KEYS.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
        el('p', { class: 'ost-help-note', text: '프레젠터(리모컨)의 넘기기 단추는 앱 쪽에서도 들어요. 아무 곳이나 누르거나 Esc 를 누르면 닫혀요.' }));
      panelEl.classList.add('open');
      panelEl.focus({ preventScroll: true });
    }
  }
  // 전체 보기의 작은 그림 하나를 발표 화면만큼 키우거나(inward: 그 쪽으로 들어가기), 발표 화면만큼에서 제자리로 줄인다.
  // 움직임을 줄여 달라고 한 기기에서는 바로 끝난다.
  let zooming = null;
  function zoom(tile, inward) {
    const win = doc.defaultView;
    if (!tile.animate || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    const r = tile.getBoundingClientRect(), R = root.getBoundingClientRect();
    if (!r.width || !r.height) return Promise.resolve();
    const k = Math.min(R.width / r.width, R.height / r.height);
    const dx = R.left + R.width / 2 - (r.left + r.width / 2), dy = R.top + R.height / 2 - (r.top + r.height / 2);
    const big = { transform: `translate(${dx}px, ${dy}px) scale(${k})` }, small = { transform: 'none' };
    stopZoom();
    panelEl.classList.add('ost-zooming');
    tile.classList.add('ost-zoom');
    const run = zooming = tile.animate(inward ? [small, big] : [big, small], { duration: 420, easing: 'cubic-bezier(.4, 0, .2, 1)' });
    run.inward = inward;
    // 더 새로운 확대가 시작됐으면(stopZoom) 그쪽이 마무리한다.
    const end = () => { if (zooming !== run) return; zooming = null; tile.classList.remove('ost-zoom'); if (!inward) panelEl.classList.remove('ost-zooming'); };
    return run.finished.then(end, end);
  }
  function stopZoom() {
    const run = zooming;
    zooming = null;
    run?.cancel();
    panelEl.querySelector('.ost-zoom')?.classList.remove('ost-zoom');
  }
  // 전체 보기에서 쪽을 고른다: 그 그림이 커지며 그 쪽으로 들어간다(열 때 물러나는 중이면 그것을 멈추고 바로 들어간다).
  function pick(i) {
    if (zooming?.inward) return;
    const tile = panelEl.querySelectorAll('.ost-tile')[i];
    const go = () => { closePanel(); if (i !== opts.index()) opts.go(i); };
    if (!tile) { go(); return; }
    zoom(tile, true).then(go);
  }
  function closePanel() {
    stopZoom();
    panelEl.classList.remove('ost-zooming');
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
    if (curtain && !['black', 'white', 'presenter', 'fullscreen', 'camera', 'auto', 'rehearse'].includes(action.type)) { setCurtain(curtain); return true; }
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
      case 'fullscreen': toggleFullscreen(); return true;
      case 'video': if (!opts.video) return false; opts.video(); return true;
      case 'camera': toggleCamera(); return true;
      case 'auto': toggleAuto(); return true;
      case 'rehearse': if (!opts.saveTimes) return false; toggleRehearse(); return true;
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
        el('span', { class: 'ost-p-label', text: '청중 화면이 작아졌으면 그 창을 누르고 F 를 눌러 전체 화면으로 돌려요.' }),
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
    // 지금 쪽이 든 주제(앞쪽으로 가며 가장 가까운 주제 이름)
    let topic = '';
    for (let k = i; k >= 0 && !topic; k--) topic = opts.topic?.(k) || '';
    presenter.count.textContent = `${i + 1} / ${n}`;
    presenter.status.textContent = [topic ? `주제: ${topic}` : '', autoOn ? '자동 넘기기 중' : '', rehearsing ? '리허설 중' : '', label, curtain === 'black' ? '청중 화면: 검은 화면' : curtain === 'white' ? '청중 화면: 흰 화면' : ''].filter(Boolean).join(' · ');
    presenter.now.style.setProperty('--ost-ratio', String(opts.ratio(i)));
    presenter.now.replaceChildren(opts.preview(i));
    if (i + 1 < n) { presenter.next.style.setProperty('--ost-ratio', String(opts.ratio(i + 1))); presenter.next.replaceChildren(opts.preview(i + 1)); }
    else presenter.next.replaceChildren(el('span', { class: 'ost-p-end', text: '마지막 쪽이에요' }));
    presenter.notes.textContent = text || '이 쪽에는 발표자 노트가 없어요. 편집 화면의 그림 아래 「발표자 노트」에 적을 수 있어요.';
    presenter.notes.classList.toggle('empty', !text);
  }

  return {
    handle, claimClick, buttons, openPresenter,
    presenting: () => !!presenter && !presenter.win.closed,
    camera: () => camEl.classList.contains('on'),
    /** 쪽이 바뀐 뒤: 그린 것을 지우고, 열린 칸을 닫고, 발표자 화면을 맞춘다. */
    changed() {
      erase(); if (panel) closePanel();
      // 리허설: 떠난 쪽의 시간을 적고 새 쪽에서 다시 잰다. 자동 넘기기: 새 쪽에서 다시 잰다.
      if (rehearsing) { noteTime(); here = opts.index(); since = Date.now(); paintRehearse(); }
      autoDone = 0; scheduleAuto();
      renderPresenter();
    },
    destroy() {
      clearTimeout(digitTimer);
      stopCamera();
      autoOn = false; clearTimeout(autoTimer);
      toggleRehearse(true);
      doc.defaultView.removeEventListener('resize', onResize);
      if (presenter && !presenter.win.closed) presenter.win.close();
      presenter = null;
      for (const node of [ink, dot, camEl, curtainEl, digits, panelEl, rehearseEl]) node.remove();
    },
  };
}
