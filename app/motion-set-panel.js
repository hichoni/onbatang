// 움직임 묶음의 실제 재생 미리보기. 저장/새 그림 만들기는 소유 앱이 맡는다.
import { el, openModal, closeModal } from './ui.js';
import { designView } from '../src/render.js';
import { mountPlayer } from './player.js';
import { MOTION_SETS, createMotionSequence } from './motion-sets.js';

const CSS = `
.ms-panel{--ms-green:#246e61;display:grid;gap:16px;color:var(--fe-ink,#263630);min-width:0}
.ms-panel h2{margin:0;padding-right:32px;font-size:1.35rem}.ms-panel p{margin:0;line-height:1.6}
.ms-panel .ms-lead{color:#66746f;font-size:.94rem}.ms-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.ms-tile{display:grid;gap:7px;min-width:0;padding:8px;border:2px solid #dbe5df;border-radius:14px;background:#fff;text-align:left;font:inherit;color:inherit;cursor:pointer}
.ms-tile[aria-pressed=true]{border-color:var(--ms-green);background:#eef6f2}.ms-tile:focus-visible,.ms-panel button:focus-visible,.ms-panel input:focus-visible,.ms-panel select:focus-visible{outline:3px solid #729bd8;outline-offset:2px}
.ms-tile-preview{display:grid;place-items:center;height:79px;overflow:hidden;border-radius:8px;background:#e4e9e5;pointer-events:none}.ms-tile-preview>.fe-card{width:100%;border-radius:0!important}
.ms-tile b{font-size:.9rem}.ms-tile>span:last-child{color:#66746f;font-size:.76rem;line-height:1.45}
.ms-preview{display:grid;gap:10px;border:1px solid #dce6df;border-radius:16px;padding:12px;background:#f6f8f5;min-width:0}
.ms-preview-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.ms-position{font-variant-numeric:tabular-nums;font-size:.88rem;color:#62706a}
.ms-stage-wrap{display:grid;place-items:center;min-height:140px;overflow:hidden;background:#e0e5df;border-radius:9px}.ms-panel .ms-stage{--ob-player-height:300px;display:grid;position:relative;overflow:hidden;width:min(100%,calc(300px * var(--ob-player-ratio,1.7778)))}.ms-stage>.fe-card{grid-area:1/1;width:100%;border-radius:0!important}
.ms-controls{display:flex;justify-content:center;align-items:center;gap:7px;flex-wrap:wrap}.ms-panel button.ms-key{font:inherit;min-height:42px;padding:9px 16px;border:1px solid #d5e0d9;border-radius:10px;background:#fff;color:#31574d;cursor:pointer}.ms-panel button:disabled{opacity:.48;cursor:default}
.ms-options{display:flex;align-items:center;gap:12px 18px;flex-wrap:wrap;border:0;padding:0;margin:0;min-width:0}.ms-options label{display:flex;align-items:center;gap:7px;font-size:.91rem}.ms-options input[type=checkbox]{width:19px;height:19px;accent-color:var(--ms-green)}.ms-options select{min-height:40px;padding:6px 8px;border:1px solid #d5e0d9;border-radius:8px;background:#fff;color:inherit;font:inherit}
.ms-topics{border:1px solid #dce6df;padding:10px 12px;border-radius:11px}.ms-topics summary{cursor:pointer;font-size:.9rem;font-weight:700}.ms-topic-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.ms-topic-fields label{font-size:.85rem;color:#5e6e66}.ms-topic-fields input{display:block;width:100%;box-sizing:border-box;font:inherit;padding:9px;margin-top:5px;border:1px solid #d5e0d9;border-radius:8px;min-width:0}
.ms-action-note{font-size:.86rem;color:#62726a}.ms-actions{display:flex;gap:9px;flex-wrap:wrap}.ms-actions button{flex:1;min-width:160px;font:inherit;font-weight:700;min-height:46px;border:1px solid var(--ms-green);border-radius:11px;padding:11px 14px;cursor:pointer}.ms-apply{background:var(--ms-green);color:#fff}.ms-create{background:#fff;color:var(--ms-green)}.ms-status{min-height:1.4em;color:#9a4929;font-size:.9rem}
@media(max-width:600px){.ms-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ms-tile>span:last-child{display:none}.ms-tile-preview{height:68px}.ms-topic-fields{grid-template-columns:1fr}.ms-panel{gap:13px}.ms-options{gap:10px 13px}.ms-actions{flex-direction:column}.ms-actions button{min-width:0}.ms-preview{padding:8px}.ms-panel h2{font-size:1.2rem}.ms-panel button.ms-key{padding:9px 12px}}
`;

/**
 * 저장소를 모르는 표준 모달. callbacks는 성공 시 void, 저장을 거절/보류할 때 false, 실패할 때 throw.
 * 반환값의 close는 다른 표준 모달을 이미 연 뒤에는 그 창을 닫지 않는다.
 */
export function openMotionSetPanel({ aspect = 16 / 9, onApply = null, onCreate = null, scopeLabel = '현재 자료' } = {}) {
  const a = Number(aspect) >= 0.25 && Number(aspect) <= 4 ? Number(aspect) : 16 / 9;
  let selected = MOTION_SETS[0], player = null, alive = true, timer = null, playing = false, busy = false, close;
  const tiles = new Map();
  const options = () => ({ speed: speed.value, breathing: breathing.checked, calm: calm.checked,
    topics: topics.map((input, index) => input.value.trim() || ['질문을 열어요', '함께 살펴봐요', '생각을 나눠요'][index]) });
  const speed = el('select', { 'aria-label': '요소 움직임 빠르기' },
    el('option', { value: 'slow', text: '느리게' }), el('option', { value: '', text: '보통' }), el('option', { value: 'fast', text: '빠르게' }));
  speed.value = '';
  const breathing = el('input', { type: 'checkbox', checked: true });
  const calm = el('input', { type: 'checkbox' });
  const topics = ['질문을 열어요', '함께 살펴봐요', '생각을 나눠요'].map((value, index) => el('input', { value, maxLength: 14, 'aria-label': `예제 ${index + 1}번째 주제` }));
  const stage = el('div', { class: 'ms-stage' });
  const position = el('span', { class: 'ms-position', 'aria-live': 'polite' });
  const setName = el('strong');
  const status = el('p', { class: 'ms-status', role: 'status' });
  const previous = el('button', { type: 'button', class: 'ms-key', text: '← 앞 장', onClick: () => { stop(); player?.prev(); } });
  const next = el('button', { type: 'button', class: 'ms-key', text: '다음 장 →', onClick: () => { stop(); player?.next(); } });
  const play = el('button', { type: 'button', class: 'ms-key', text: '▶ 흐름 재생', onClick: () => playing ? stop() : start() });
  function stop() { clearTimeout(timer); timer = null; playing = false; play.textContent = '▶ 흐름 재생'; }
  function tick() {
    if (!alive || !playing || !player) return;
    if (player.at >= player.total - 1) { stop(); return; }
    player.next();
    timer = setTimeout(tick, 2800);
  }
  function start() {
    stop();
    if (!player) return;
    if (player.at >= player.total - 1) player.go(0);
    playing = true; play.textContent = 'Ⅱ 재생 멈추기';
    timer = setTimeout(tick, 1800);
  }
  function render() {
    if (!alive || busy) return;
    stop(); player?.destroy();
    const slides = createMotionSequence(selected.id, { aspect: a, ...options() });
    setName.textContent = selected.name;
    for (const [id, button] of tiles) button.setAttribute('aria-pressed', String(id === selected.id));
    player = mountPlayer(stage, { slides, aspect: a, edge: 960, onChange: state => {
      position.textContent = `${state.at + 1} / ${state.total} · ${selected.stages[state.at]}`;
      previous.disabled = state.at === 0; next.disabled = state.at === state.total - 1;
    } });
  }
  async function run(callback) {
    if (busy || !alive || typeof callback !== 'function') return;
    stop(); busy = true; status.textContent = '움직임을 담고 있어요…'; controls.disabled = true; apply.disabled = true; create.disabled = true;
    for (const button of tiles.values()) button.disabled = true;
    for (const control of [...topics, previous, next, play]) control.disabled = true;
    const id = selected.id, opts = options();
    try {
      const result = await callback(id, opts);
      if (alive && result !== false) close();
      else if (alive) status.textContent = '자료 안내를 확인한 뒤 다시 시도해 주세요.';
    } catch (error) {
      if (alive) status.textContent = error instanceof Error && error.message ? error.message : '움직임을 저장하지 못했어요. 다시 시도해 주세요.';
    } finally {
      busy = false;
      if (alive) {
        controls.disabled = false; apply.disabled = !onApply; create.disabled = !onCreate;
        for (const control of [...topics, play, ...tiles.values()]) control.disabled = false;
        previous.disabled = !player || player.at === 0; next.disabled = !player || player.at === player.total - 1;
      }
    }
  }
  const apply = el('button', { class: 'ms-apply', type: 'button', text: `${scopeLabel}에 움직임 적용`, disabled: !onApply, onClick: () => run(onApply) });
  const create = el('button', { class: 'ms-create', type: 'button', text: '5장 예제로 새 그림', disabled: !onCreate, onClick: () => run(onCreate) });
  const grid = el('div', { class: 'ms-grid', 'aria-label': '움직임 묶음 고르기' });
  for (const set of MOTION_SETS) {
    const card = designView(createMotionSequence(set.id, { aspect: a, breathing: false })[0]);
    card.style.setProperty('--fe-ratio', String(a)); card.style.aspectRatio = String(a); card.style.width = `min(100%, ${79 * a}px)`;
    const tile = el('button', { type: 'button', class: 'ms-tile', 'aria-label': set.name, 'aria-pressed': String(set.id === selected.id), onClick: () => { selected = set; render(); } },
      el('span', { class: 'ms-tile-preview', 'aria-hidden': 'true' }, card), el('b', { text: set.name }), el('span', { text: set.hint }));
    grid.append(tile); tiles.set(set.id, tile);
  }
  const controls = el('fieldset', { class: 'ms-options' },
    el('label', {}, '요소 빠르기', speed), el('label', {}, breathing, '작은 조각 숨쉬기'), el('label', {}, calm, '차분하게'));
  const shell = el('section', { class: 'ms-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '움직임 묶음' },
    el('style', { text: CSS }), el('h2', { text: '움직임 묶음' }), el('p', { class: 'ms-lead', text: '전체에서 한 주제로, 다음 이야기로. 같은 조각이 이어지는 5장 흐름을 골라요.' }),
    grid,
    el('div', { class: 'ms-preview' }, el('div', { class: 'ms-preview-head' }, setName, position), el('div', { class: 'ms-stage-wrap' }, stage), el('div', { class: 'ms-controls' }, previous, play, next)),
    controls,
    el('details', { class: 'ms-topics' }, el('summary', { text: '새 예제의 주제·순서 정하기' }), el('div', { class: 'ms-topic-fields' }, ...topics.map((input, index) => el('label', {}, `${index + 1}번째`, input)))),
    el('p', { class: 'ms-action-note', text: `${scopeLabel}에 적용하면 글·사진·배치·쪽 순서는 유지하고 움직임을 바꿔요. 예제는 새 그림으로 만들어요. 빠르기는 요소에 적용되고 이어 움직이기는 1초예요.` }),
    el('div', { class: 'ms-actions' }, apply, create), status);
  for (const control of [speed, breathing, calm, ...topics]) control.addEventListener('change', render);
  close = () => { if (alive) closeModal(); };
  shell.addEventListener('keydown', event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); event.stopPropagation(); close(); } });
  openModal(shell, { wide: true, onClose: () => { alive = false; stop(); player?.destroy(); player = null; } });
  render();
  return { close };
}
