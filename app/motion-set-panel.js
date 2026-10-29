// 움직임 묶음의 실제 재생 미리보기. 저장/새 그림 만들기는 소유 앱이 맡는다.
import { el, openModal, closeModal } from './ui.js';
import { designView } from '../src/render.js';
import { mountPlayer } from './player.js';
import { MOTION_SETS, createMotionSequence } from './motion-sets.js';

const CSS = `
.modal-panel.motion-cinema{width:min(1440px,calc(100vw - 36px));max-width:1440px;max-height:calc(100dvh - 36px);padding:0;overflow:auto;border-radius:18px;background:#f8f8f5}
.motion-cinema>.modal-close{z-index:4;top:17px;right:18px}
.ms-panel{--ms-green:#183a33;display:grid;gap:22px;padding:26px 30px;color:#1b2724;min-width:0;text-align:left}
.ms-panel h2{margin:0;font-size:1.65rem;letter-spacing:-.04em}.ms-panel p{margin:0;line-height:1.65}.ms-eyebrow{display:block;margin-bottom:7px;color:#63716b;font-size:.68rem;letter-spacing:.2em;font-weight:800}.ms-header{padding-right:40px}.ms-panel .ms-lead{color:#68766f;font-size:.9rem;margin-top:6px}
.ms-workspace{display:grid;grid-template-columns:242px minmax(0,1fr);gap:28px;align-items:start}.ms-grid{display:grid;gap:8px;align-content:start}
.ms-tile{display:grid;grid-template-columns:108px minmax(0,1fr);gap:12px;align-items:center;min-width:0;padding:7px;border:1px solid transparent;border-radius:8px;background:transparent;text-align:left;font:inherit;color:inherit;cursor:pointer}.ms-tile:hover{background:#eeefea}.ms-tile[aria-pressed=true]{border-color:#52695f;background:#e9eee8}.ms-tile:focus-visible,.ms-panel button:focus-visible,.ms-panel input:focus-visible,.ms-panel select:focus-visible{outline:3px solid #7497c4;outline-offset:2px}
.ms-tile-preview{display:grid;place-items:center;aspect-ratio:16/9;overflow:hidden;background:#dfe2dc;pointer-events:none}.ms-tile-preview>.fe-card{width:100%;border-radius:0!important}.ms-tile b{font-size:.9rem;line-height:1.4;font-weight:750;letter-spacing:-.04em}.ms-tile-info{display:grid;gap:5px}.ms-tile-info small{font-size:.62rem;letter-spacing:.09em;color:#647269}.ms-tile-hint{display:none}
.ms-preview{display:grid;gap:12px;min-width:0}.ms-preview-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.ms-preview-head strong{font-size:1.05rem;letter-spacing:-.03em}.ms-position{font-variant-numeric:tabular-nums;font-size:.78rem;color:#6c786f}
.ms-stage-wrap{display:grid;place-items:center;min-height:140px;overflow:hidden;background:#e3e4dd;box-shadow:0 12px 35px #14231a12}.ms-panel .ms-stage{--ob-player-height:62dvh;display:grid;position:relative;overflow:hidden;width:min(100%,calc(62dvh * var(--ob-player-ratio,1.7778)))}.ms-stage>.fe-card{grid-area:1/1;width:100%;border-radius:0!important}
.ms-chapters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.ms-chapter{padding:0;border:2px solid transparent;background:none;cursor:pointer;color:#6f7c72;text-align:left;font:inherit;min-width:0}.ms-chapter[aria-current=true]{border-color:#31584a;color:#1c4538}.ms-chapter-art{display:block;aspect-ratio:16/9;overflow:hidden;background:#e3e4dd;pointer-events:none}.ms-chapter-art>.fe-card{width:100%;border-radius:0!important}.ms-chapter small{display:block;padding:5px 4px;font-size:.66rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ms-controls{display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap}.ms-panel button.ms-key{font:inherit;font-size:.83rem;min-height:40px;padding:8px 16px;border:1px solid #d7dcd3;border-radius:6px;background:transparent;color:#344f40;cursor:pointer}.ms-panel button.ms-key:nth-child(2){background:#233d31;color:#fff;border-color:#233d31}.ms-panel button:disabled{opacity:.4;cursor:default}
.ms-lower{display:grid;grid-template-columns:242px minmax(0,1fr);gap:28px;padding-top:16px;border-top:1px solid #dce0d7}.ms-options{display:flex;align-items:center;gap:12px 18px;flex-wrap:wrap;border:0;padding:0;margin:0;min-width:0}.ms-options label{display:flex;align-items:center;gap:7px;font-size:.8rem}.ms-options input[type=checkbox]{width:17px;height:17px;accent-color:var(--ms-green)}.ms-options select{min-height:36px;padding:5px 7px;border:1px solid #d1d8cd;border-radius:5px;background:#fff;color:inherit;font:inherit}
.ms-topics summary{cursor:pointer;font-size:.83rem;font-weight:700}.ms-topic-fields{display:grid;gap:8px;margin-top:12px}.ms-topic-fields label{font-size:.75rem;color:#68756b}.ms-topic-fields input{display:block;width:100%;box-sizing:border-box;font:inherit;padding:9px;margin-top:4px;border:1px solid #d2d9ce;border-radius:5px;min-width:0}
.ms-action-note{font-size:.77rem;color:#6a776d;margin-top:12px!important}.ms-actions{display:flex;gap:10px;margin-top:15px}.ms-actions button{flex:1;min-width:0;font:inherit;font-size:.86rem;font-weight:750;min-height:46px;border:1px solid var(--ms-green);border-radius:6px;padding:11px 14px;cursor:pointer}.ms-apply{background:transparent;color:var(--ms-green)}.ms-create{background:var(--ms-green);color:#fff}.ms-status{min-height:1.4em;color:#9a4929;font-size:.86rem}
@media(max-width:960px){.ms-workspace,.ms-lower{grid-template-columns:1fr;gap:18px}.ms-grid{grid-template-columns:repeat(3,minmax(0,1fr));order:2}.ms-tile{grid-template-columns:1fr;gap:6px}.ms-tile-info small{display:none}.ms-preview{order:1}.ms-topic-fields{grid-template-columns:repeat(3,minmax(0,1fr))}.ms-panel{padding:22px;gap:18px}.ms-panel .ms-stage{--ob-player-height:54dvh;width:min(100%,calc(54dvh * var(--ob-player-ratio,1.7778)))}}
@media(max-width:520px){.modal-panel.motion-cinema{width:calc(100vw - 16px);max-height:calc(100dvh - 16px);border-radius:11px}.ms-panel{padding:20px 14px;gap:17px}.ms-panel h2{font-size:1.3rem}.ms-panel .ms-lead{font-size:.79rem}.ms-tile b{font-size:.76rem}.ms-grid{gap:5px}.ms-tile{padding:5px}.ms-topic-fields{grid-template-columns:1fr}.ms-options{gap:10px}.ms-chapters{gap:4px}.ms-chapter small{font-size:.55rem;padding:4px 1px}.ms-actions{flex-direction:column}.ms-panel button.ms-key{padding:8px 12px}}
@media(min-width:961px){.modal-panel.motion-cinema{overflow:hidden}.ms-panel{height:calc(100dvh - 36px);box-sizing:border-box;grid-template-rows:auto minmax(0,1fr) auto auto;gap:16px}.ms-status:empty{display:none}.ms-workspace{min-height:0;overflow:hidden;align-items:stretch}.ms-grid{overflow:auto;min-height:0}.ms-preview{min-height:0;height:100%;grid-template-rows:auto minmax(0,1fr) auto auto;gap:9px}.ms-stage-wrap{container-type:size;min-height:0}.ms-panel .ms-stage{width:min(100cqw,calc(100cqh * var(--ob-player-ratio,1.7778)))}.ms-chapters{max-width:600px;width:100%;justify-self:center}.ms-lower{padding-top:12px;max-height:200px;overflow:auto}}
`;

/**
 * 저장소를 모르는 표준 모달. callbacks는 성공 시 void, 저장을 거절/보류할 때 false, 실패할 때 throw.
 * 반환값의 close는 다른 표준 모달을 이미 연 뒤에는 그 창을 닫지 않는다.
 */
export function openMotionSetPanel({ aspect = 16 / 9, onApply = null, onCreate = null, scopeLabel = '현재 자료' } = {}) {
  const a = Number(aspect) >= 0.25 && Number(aspect) <= 4 ? Number(aspect) : 16 / 9;
  let selected = MOTION_SETS[0], player = null, alive = true, timer = null, playing = false, busy = false, close;
  const tiles = new Map();
  const defaultTopics = () => selected.topics || ['질문을 열어요', '함께 살펴봐요', '생각을 나눠요'];
  const topicEdited = [false, false, false];
  const options = () => ({ speed: speed.value, breathing: breathing.checked, calm: calm.checked,
    topics: topics.map((input, index) => input.value.trim() || defaultTopics()[index]) });
  const speed = el('select', { 'aria-label': '요소 움직임 빠르기' },
    el('option', { value: 'slow', text: '느리게' }), el('option', { value: '', text: '보통' }), el('option', { value: 'fast', text: '빠르게' }));
  speed.value = '';
  const breathing = el('input', { type: 'checkbox', checked: true });
  const calm = el('input', { type: 'checkbox' });
  const topics = defaultTopics().map((value, index) => el('input', { value, maxLength: 14, 'aria-label': `예제 ${index + 1}번째 주제`, onInput: () => { topicEdited[index] = true; } }));
  const stage = el('div', { class: 'ms-stage' });
  const chapters = el('nav', { class: 'ms-chapters', 'aria-label': '이야기 단계' });
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
    chapters.replaceChildren(...slides.map((slide, index) => {
      const art = designView(slide); art.style.setProperty('--fe-ratio', String(a)); art.style.aspectRatio = String(a);
      return el('button', { class: 'ms-chapter', type: 'button', 'aria-label': `${index + 1}장 · ${selected.stages[index]}`, onClick: () => { stop(); player?.go(index); } },
        el('span', { class: 'ms-chapter-art', 'aria-hidden': 'true' }, art), el('small', { text: `${String(index + 1).padStart(2, '0')}  ${selected.stages[index]}` }));
    }));
    setName.textContent = selected.name;
    for (const [id, button] of tiles) button.setAttribute('aria-pressed', String(id === selected.id));
    player = mountPlayer(stage, { slides, aspect: a, edge: 960, onChange: state => {
      position.textContent = `${state.at + 1} / ${state.total} · ${selected.stages[state.at]}`;
      [...chapters.children].forEach((button, index) => button.setAttribute('aria-current', String(index === state.at)));
      previous.disabled = state.at === 0; next.disabled = state.at === state.total - 1;
    } });
  }
  async function run(callback) {
    if (busy || !alive || typeof callback !== 'function') return;
    stop(); busy = true; status.textContent = '움직임을 담고 있어요…'; controls.disabled = true; apply.disabled = true; create.disabled = true;
    for (const button of tiles.values()) button.disabled = true;
    for (const control of [...topics, previous, next, play, ...chapters.children]) control.disabled = true;
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
        for (const control of [...topics, play, ...tiles.values(), ...chapters.children]) control.disabled = false;
        previous.disabled = !player || player.at === 0; next.disabled = !player || player.at === player.total - 1;
      }
    }
  }
  const apply = el('button', { class: 'ms-apply', type: 'button', text: `${scopeLabel}에 움직임 적용`, disabled: !onApply, onClick: () => run(onApply) });
  const create = el('button', { class: 'ms-create', type: 'button', text: '5장 예제로 새 그림', disabled: !onCreate, onClick: () => run(onCreate) });
  const grid = el('div', { class: 'ms-grid', 'aria-label': '움직임 묶음 고르기' });
  for (const set of MOTION_SETS) {
    const card = designView(createMotionSequence(set.id, { aspect: a, breathing: false })[0]);
    card.style.setProperty('--fe-ratio', String(a)); card.style.aspectRatio = String(a); card.style.width = '100%';
    const tile = el('button', { type: 'button', class: 'ms-tile', 'aria-label': set.name, 'aria-pressed': String(set.id === selected.id), title: set.hint, onClick: () => {
      selected = set;
      topics.forEach((input, index) => { if (!topicEdited[index]) input.value = defaultTopics()[index]; });
      render();
    } }, el('span', { class: 'ms-tile-preview', 'aria-hidden': 'true' }, card),
      el('span', { class: 'ms-tile-info' }, el('small', { text: set.kicker || 'MOTION STORY' }), el('b', { text: set.name })), el('span', { class: 'ms-tile-hint', text: set.hint }));
    grid.append(tile); tiles.set(set.id, tile);
  }
  const controls = el('fieldset', { class: 'ms-options' },
    el('label', {}, '요소 빠르기', speed), el('label', {}, breathing, '작은 조각 숨쉬기'), el('label', {}, calm, '차분하게'));
  const shell = el('section', { class: 'ms-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '움직임 묶음' },
    el('style', { text: CSS }), el('header', { class: 'ms-header' }, el('span', { class: 'ms-eyebrow', text: 'ONBATANG · MOTION STORIES' }), el('h2', { text: '움직임 묶음' }), el('p', { class: 'ms-lead', text: '한 공간을 따라 이야기를 펼치세요. 큰 화면에서 직접 넘겨보며 고릅니다.' })),
    el('div', { class: 'ms-workspace' }, grid,
      el('div', { class: 'ms-preview' }, el('div', { class: 'ms-preview-head' }, setName, position), el('div', { class: 'ms-stage-wrap' }, stage), chapters, el('div', { class: 'ms-controls' }, previous, play, next))),
    el('div', { class: 'ms-lower' },
    el('details', { class: 'ms-topics' }, el('summary', { text: '새 예제의 주제·순서 정하기' }), el('div', { class: 'ms-topic-fields' }, ...topics.map((input, index) => el('label', {}, `${index + 1}번째`, input)))),
      el('div', {}, controls, el('p', { class: 'ms-action-note', text: `${scopeLabel}에 적용하면 내용·배치는 그대로 두고 움직임을 바꿉니다. 새 예제는 별도 그림으로 저장합니다. 빠르기는 미세 움직임에 적용됩니다.` }), el('div', { class: 'ms-actions' }, apply, create))), status);
  for (const control of [speed, breathing, calm, ...topics]) control.addEventListener('change', render);
  close = () => { if (alive) closeModal(); };
  shell.addEventListener('keydown', event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); event.stopPropagation(); close(); } });
  openModal(shell, { wide: true, onClose: () => { alive = false; stop(); player?.destroy(); player = null; } });
  shell.closest('.modal-panel')?.classList.add('motion-cinema');
  render();
  return { close };
}
