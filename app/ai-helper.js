// AI-G 도우미: 편집 화면 옆 칸. 장을 다듬어 달라고 부탁하면 '편집 지시'를 받아 미리 보여 주고, 눌러야 적용한다.
// AI 없이 도는 '움직임 자동 다듬기'도 같은 칸 · 같은 미리 보기 · 같은 되돌리기를 쓴다. 설계: docs/ai-helper-2026-11-11.md
//
// host(편집 화면이 넘겨 주는 것):
//   provider        AI 연결({ connect(), generate(input, { signal, onProgress }) }) 또는 null(공용 온바탕: 자동 다듬기만)
//   slides()        지금 장 목록(꾸미는 중인 장은 편집기에서 꺼낸 것) · at() 지금 장 번호 · title() 그림 이름 · aspect() 가로 ÷ 세로
//   view(slide)     그 장의 작은 그림(DOM) · play(view, slide) 그 그림에서 움직임을 한 번 튼다 → 멈추는 함수
//   blocked()       지금 쓸 수 없으면 그 까닭(글), 쓸 수 있으면 ''
//   apply(slides)   새 장 목록을 적용한다(되돌리기 기록 하나). 적용했으면 그 기록(표), 못 했으면 null
//   undo(token)     그 적용이 맨 뒤의 일이면 되돌린다 → 되돌렸으면 true · canUndo(token)
//   cost(count)     AI 부탁의 값(단추에 적는 글. 예: '질문권 1회')
import { el } from './ui.js';
import { gaiOwl } from './brand.js';
import { cleanTopic } from '../src/document.js';
import { editContext, checkEdits, applyEdits, motionCatalog, titleOf, EDIT_LIMITS, LOCAL_LIMITS } from './ai-edits.js';
import { polishMotion } from './motion-polish.js';

const WANTS = [['text', '글'], ['motion', '움직임'], ['notes', '발표자 노트']];
const clip = (text, max) => { const all = Array.from(String(text ?? '')); return all.length > max ? `${all.slice(0, max).join('')}…` : all.join(''); };
const message = (error, fallback) => (/\p{Script=Hangul}/u.test(error?.message || '') ? String(error.message).slice(0, 300) : fallback);

export function createAiHelper(host) {
  const provider = host.provider && typeof host.provider.connect === 'function' && typeof host.provider.generate === 'function' ? host.provider : null;
  const limit = EDIT_LIMITS.slides;
  let scope = 'here', picked = new Set(), want = new Set(WANTS.map(([id]) => id)), asking = null, disposed = false, count = -1;
  const stops = new Set();

  // ---------- 범위 ----------
  const hereLabel = el('span');
  const pickList = el('div', { class: 'cv-assist-picks', role: 'group', 'aria-label': '다듬을 장 고르기' });
  const pickCount = el('span', { class: 'cv-assist-pick-count' });
  const topicButton = el('button', { class: 'btn chip', type: 'button', dataset: { assistTopic: '' }, onClick: () => {
    const slides = host.slides(), at = host.at();
    let running = '';
    const topics = slides.map((s) => { const t = cleanTopic(s?.topic); if (t) running = t; return running; });
    picked = new Set(slides.map((_, i) => i).filter((i) => topics[i] === topics[at]).slice(0, limit));
    if (!picked.size) picked.add(at);
    drawPicks();
  } }, '이 주제의 장');
  const picker = el('div', { class: 'cv-assist-picker', hidden: true }, el('div', { class: 'cv-assist-pick-head' }, pickCount, topicButton), pickList);
  const radio = (value, label) => el('label', { class: 'cv-assist-scope' }, el('input', { type: 'radio', name: 'cv-assist-scope', value, checked: scope === value, onChange: () => { scope = value; picker.hidden = scope !== 'pick'; if (scope === 'pick' && !picked.size) picked.add(host.at()); drawPicks(); update(); } }), label);
  function drawPicks() {
    const slides = host.slides(), at = host.at();
    picked = new Set([...picked].filter((i) => slides[i]));
    pickList.replaceChildren(...slides.map((slide, i) => el('label', { class: 'cv-assist-pick' },
      el('input', { type: 'checkbox', checked: picked.has(i), disabled: !picked.has(i) && picked.size >= limit, dataset: { assistPick: String(i) }, onChange: (e) => { if (e.target.checked) picked.add(i); else picked.delete(i); drawPicks(); update(); } }),
      el('span', { text: `${i + 1}장${i === at ? ' (지금)' : ''}` }), el('small', { text: clip(titleOf(slide) || '제목 없음', 18) }))));
    pickCount.textContent = `${picked.size}장 고름 · 한 번에 ${limit}장까지`;
    pickCount.title = `AI-G에게는 한 번(질문권 1회)에 ${limit}장까지 부탁할 수 있어요`;
    update();
  }
  const chosen = () => (scope === 'pick' ? [...picked].sort((a, b) => a - b) : [host.at()]);

  // ---------- AI 부탁 ----------
  const chips = el('div', { class: 'cv-assist-wants', role: 'group', 'aria-label': '다듬을 것' }, ...WANTS.map(([id, name]) => el('button', { class: 'btn chip', type: 'button', 'aria-pressed': 'true', dataset: { assistWant: id },
    onClick: (e) => { if (want.has(id) && want.size > 1) want.delete(id); else want.add(id); for (const b of chips.children) b.setAttribute('aria-pressed', String(want.has(b.dataset.assistWant))); e.currentTarget.blur(); update(); } }, name)));
  const wish = el('textarea', { class: 'cv-assist-wish', rows: '2', maxlength: String(EDIT_LIMITS.prompt), 'aria-label': 'AI-G에게 덧붙일 말(쓰지 않아도 돼요)', placeholder: '덧붙일 말(쓰지 않아도 돼요). 예) 6학년이 읽기 쉽게, 움직임은 차분하게' });
  const shown = el('pre', { class: 'cv-assist-sent' });
  const sent = () => editContext(host.slides(), chosen(), { title: host.title(), aspect: host.aspect() });
  const peekText = () => { const ctx = sent(); return JSON.stringify({ want: [...want], prompt: wish.value.trim(), ...ctx.request }, null, 1); };
  const peek = el('details', { class: 'cv-assist-peek', onToggle: () => { if (peek.open) shown.textContent = peekText(); } }, el('summary', { text: '보낼 내용 보기(글과 배치만, 사진은 보내지 않아요)' }), shown);
  const askLabel = el('span'), askCost = el('small', { class: 'cv-assist-cost' });
  const askButton = el('button', { class: 'btn btn-primary cv-assist-ask', type: 'button', dataset: { assistAsk: '' }, onClick: () => ask() }, gaiOwl(), askLabel, askCost);
  const status = el('p', { class: 'cv-down-note cv-assist-status', role: 'status', 'aria-live': 'polite' });
  const aiPart = provider
    ? el('div', { class: 'cv-assist-ai' }, chips, wish, peek, askButton, status)
    : el('p', { class: 'cv-down-note cv-assist-status', dataset: { assistNoAi: '' }, text: 'AI-G에게 부탁하기는 GBE-AI Lab(gbe.ai.kr)의 온바탕에서 쓸 수 있어요. 아래 "움직임 자동 다듬기"는 여기서도 바로 쓸 수 있어요.' });

  // ---------- 움직임 자동 다듬기 ----------
  const polishScope = el('select', { class: 'cv-assist-select', 'aria-label': '자동으로 다듬을 범위' }, el('option', { value: 'scope', text: '위에서 고른 장' }), el('option', { value: 'all', text: '자료 전체' }));
  const keep = el('input', { type: 'checkbox', checked: true, dataset: { assistKeep: '' } });
  const polishButton = el('button', { class: 'btn cv-assist-polish', type: 'button', dataset: { assistPolish: '' }, onClick: () => polish() }, '움직임 자동 다듬기');
  const polishPart = el('div', { class: 'cv-assist-auto' },
    el('b', { text: '움직임 자동 다듬기' }),
    el('p', { class: 'cv-down-note', text: '장의 모양을 보고 입혀요(카드 줄은 차례로, 숫자는 쿵). AI를 쓰지 않아 질문권이 들지 않아요.' }),
    el('div', { class: 'cv-assist-row' }, polishScope, polishButton),
    el('label', { class: 'cv-assist-keep' }, keep, ' 이미 정한 움직임은 그대로 두기'));

  const log = el('div', { class: 'cv-assist-log', role: 'log', 'aria-label': 'AI-G 도우미와 나눈 일' });
  const body = el('div', { class: 'cv-assist-body' },
    el('div', { class: 'cv-assist-form' },
      el('b', { text: '무엇을 다듬을까요?' }),
      el('div', { class: 'cv-assist-scopes', role: 'radiogroup', 'aria-label': '다듬을 범위' }, radio('here', hereLabel), radio('pick', el('span', { text: '장 고르기' }))),
      picker, aiPart, polishPart),
    log);
  const close = el('button', { class: 'cv-assist-close', type: 'button', 'aria-label': 'AI-G 도우미 닫기', onClick: () => host.close?.() }, '×');
  const node = el('div', { class: 'cv-assist-box' }, el('header', { class: 'cv-assist-head' }, gaiOwl(), el('h2', { text: 'AI-G 도우미' }), close), body);

  function update() {
    if (disposed) return;
    const n = chosen().length;
    hereLabel.textContent = `지금 장(${host.at() + 1}장)`;
    askLabel.textContent = asking ? '그만두기' : 'AI-G에게 부탁하기';
    askCost.textContent = asking ? '' : host.cost?.(n) || '';
    askButton.disabled = !asking && !n;
    polishButton.disabled = polishScope.value === 'scope' && !n;
    if (peek.open) shown.textContent = peekText();
  }
  const say = (text) => { status.textContent = text; };
  const bubble = (who, text) => { const p = el('p', { class: `cv-assist-bubble ${who}`, text }); log.append(p); return p; };
  const scrollTo = (card) => requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  const rangeText = (picks) => {
    const first = picks[0] + 1, last = picks[picks.length - 1] + 1;
    if (picks.length === 1) return `${first}장`;
    if (last - first + 1 === picks.length) return `${first} ~ ${last}장`;                       // 이어진 장들
    return picks.length <= 4 ? `${picks.map((i) => i + 1).join(' · ')}장` : `${first} ~ ${last}장 가운데 ${picks.length}장`;
  };

  // ---------- 결과 카드(미리 보기 → 적용) ----------
  function card({ ctx, base, checked, limits, note = [], tail = '' }) {
    const skip = new Set();
    let state = 'ready', token = null;
    const box = el('article', { class: 'cv-assist-card', dataset: { assistCard: '', state } });
    const sayLine = checked.say ? el('p', { class: 'cv-assist-bubble ai', text: checked.say }) : null;
    const summary = el('p', { class: 'cv-assist-count' });
    const list = el('div', { class: 'cv-assist-changes' });
    const notes = el('p', { class: 'cv-down-note cv-assist-note' });
    const actions = el('div', { class: 'cv-assist-actions' });
    const stopPlays = () => { for (const stop of box._stops || []) { stop(); stops.delete(stop); } box._stops = []; };
    const preview = () => applyEdits(base, checked.ops, ctx, { limits, skip });
    const full = applyEdits(base, checked.ops, ctx, { limits });
    const extra = [...note];
    if (checked.dropped.length) extra.push(`지시 ${checked.dropped.length}개는 온바탕이 쓸 수 없는 것이라 뺐어요.`);
    for (const why of full.dropped) if (!extra.includes(why)) extra.push(why);
    const draw = () => {
      stopPlays();
      const now = preview();
      summary.textContent = state === 'applied' ? '적용했어요. Ctrl+Z 한 번으로 통째로 되돌릴 수 있어요.' : state === 'undone' ? '되돌렸어요.' : state === 'dropped' ? '버렸어요. 아무것도 바뀌지 않았어요.'
        : now.count ? `바꿀 것 ${now.count}가지 · ${now.changes.length}장` : '고른 것이 없어요.';
      box.dataset.state = state;
      if (state !== 'ready') { list.querySelectorAll('input').forEach((input) => { input.disabled = true; }); }
      else {
        list.replaceChildren(...full.changes.map((change, k) => {
          const open = full.changes.length <= 3 || k === 0;
          const pair = el('div', { class: 'cv-assist-pair' });
          const fill = () => {
            if (pair.childElementCount || disposed) return;
            const after = preview().slides[change.index];
            const afterView = host.view(after);
            pair.append(el('figure', {}, host.view(base[change.index]), el('figcaption', { text: '지금' })), el('span', { class: 'cv-assist-arrow', 'aria-hidden': 'true', text: '→' }),
              el('figure', { dataset: { assistAfter: '' } }, afterView, el('figcaption', { text: '바꾼 뒤' })));
            pair._after = { view: afterView, slide: after };
          };
          const rows = el('ul', { class: 'cv-assist-lines' }, ...change.lines.map((line) => el('li', {}, el('label', {},
            el('input', { type: 'checkbox', checked: !skip.has(line.op), dataset: { assistLine: String(line.op) }, onChange: (e) => { if (e.target.checked) skip.delete(line.op); else skip.add(line.op); refresh(); } }),
            el('span', { text: line.text }), line.why ? el('small', { text: line.why }) : null))));
          const detail = el('details', { class: 'cv-assist-change', open, dataset: { assistChange: String(change.index) }, onToggle: () => { if (detail.open) fill(); } },
            el('summary', {}, el('b', { text: `${change.index + 1}장` }), el('span', { text: clip(titleOf(base[change.index]) || '제목 없음', 16) }), el('small', { text: `${change.lines.length}가지` })), pair, rows);
          detail._pair = pair; detail._fill = fill;
          if (open) fill();
          return detail;
        }));
      }
      notes.textContent = extra.join(' ');
      notes.hidden = !extra.length;
      const btn = (label, attrs, onClick) => el('button', { class: 'btn', type: 'button', ...attrs, onClick }, label);
      actions.replaceChildren(...(state === 'ready' ? [
        full.changes.some((c) => c.lines.some((l) => /나타나기|계속|전환|조합/.test(l.text))) ? btn('움직임 보기', { dataset: { assistPlay: '' }, disabled: !now.count }, play) : null,
        btn('적용', { class: 'btn btn-primary', dataset: { assistApply: '' }, disabled: !now.count }, apply),
        btn('버리기', { class: 'btn btn-ghost', dataset: { assistDrop: '' } }, () => { state = 'dropped'; draw(); }),
      ] : state === 'applied' ? [btn('되돌리기', { dataset: { assistUndo: '' }, disabled: !host.canUndo(token) }, async () => { if (await host.undo(token)) { state = 'undone'; draw(); } else draw(); })] : []).filter(Boolean),
      tail && state !== 'dropped' ? el('small', { class: 'cv-assist-tail', text: tail }) : null);
    };
    // 체크를 바꾸면 뒤 그림만 다시 그린다
    const refresh = () => {
      stopPlays();
      const now = preview();
      for (const detail of list.children) {
        const pair = detail._pair;
        if (!pair?.childElementCount) continue;
        const index = Number(detail.dataset.assistChange), slide = now.slides[index], view = host.view(slide);
        pair.querySelector('[data-assist-after]').firstChild.replaceWith(view);
        pair._after = { view, slide };
      }
      summary.textContent = now.count ? `바꿀 것 ${now.count}가지 · ${now.changes.length}장` : '고른 것이 없어요.';
      for (const b of actions.querySelectorAll('[data-assist-apply],[data-assist-play]')) b.disabled = !now.count;
    };
    const play = () => {
      stopPlays();
      for (const detail of list.children) {
        if (!detail.open) continue;
        detail._fill();
        const { view, slide } = detail._pair._after;
        const stop = host.play(view, slide);
        if (typeof stop === 'function') { box._stops.push(stop); stops.add(stop); }
      }
    };
    const apply = () => {
      const blocked = host.blocked();
      if (blocked) { notes.hidden = false; notes.textContent = blocked; return; }
      const current = host.slides();
      const done = applyEdits(current, checked.ops, ctx, { limits, skip });
      if (!done.count) {
        notes.hidden = false;
        notes.textContent = done.stale.length ? '부탁한 뒤에 그 장을 고치셔서 적용하지 않았어요. 다시 부탁해 주세요.' : '바꿀 것이 없어요.';
        return;
      }
      token = host.apply(done.slides);
      if (!token) { notes.hidden = false; notes.textContent = '지금은 적용할 수 없어요. 편집 화면을 확인한 뒤 다시 눌러 주세요.'; return; }
      if (done.stale.length) extra.push(`부탁한 뒤에 고친 ${done.stale.map((i) => `${i + 1}장`).join(' · ')}은 그대로 두었어요.`);
      state = 'applied';
      draw();
    };
    box._stops = [];
    box.append(...[sayLine, summary, list, notes, actions].filter(Boolean));
    box._sync = () => { if (state === 'applied') draw(); };
    draw();
    log.append(box);
    scrollTo(box);
    return box;
  }

  // ---------- 부탁하기 ----------
  async function ask() {
    if (asking) { asking.abort(); return; }
    if (!provider) return;
    const blocked = host.blocked();
    if (blocked) { say(blocked); return; }
    const picks = chosen();
    if (!picks.length) { say('다듬을 장을 골라 주세요.'); return; }
    const base = host.slides();
    const ctx = editContext(base, picks, { title: host.title(), aspect: host.aspect() });
    // 연결 창은 누른 그 순간에 열어야 막히지 않는다: 기다리기 전에 connect 를 부른다.
    let task; try { task = provider.connect(); } catch (error) { task = Promise.reject(error); }
    const controller = asking = new AbortController();
    const wants = WANTS.filter(([id]) => want.has(id)), prompt = wish.value.trim();
    bubble('me', `${rangeText(ctx.picks)} · ${wants.map(([, name]) => name).join(' · ')}${prompt ? `\n${prompt}` : ''}`);
    wish.disabled = true;
    update();
    say('AI-G 연결을 확인하고 있어요…');
    try {
      await task;
      if (controller.signal.aborted) throw new DOMException('', 'AbortError');
      const n = ctx.picks.length;
      say(`AI-G가 ${n === 1 ? '장을' : `${n}장을`} 읽고 있어요… ${n === 1 ? '20초쯤' : n <= 6 ? '1분쯤' : n <= 12 ? '1 ~ 2분' : '3분쯤'} 걸려요(차례를 기다리면 더 걸릴 수 있어요).`);
      const answer = await provider.generate({ kind: 'slides', task: 'polish', want: wants.map(([id]) => id), prompt, ...ctx.request, catalog: motionCatalog() },
        { signal: controller.signal, onProgress: (progress) => { const text = typeof progress === 'string' ? progress : progress?.message; if (text && asking === controller) say(clip(text, 120)); } });
      if (controller.signal.aborted) throw new DOMException('', 'AbortError');
      if (answer?.kind !== 'slides' || !Array.isArray(answer.ops)) throw Error('AI-G의 답을 읽지 못했어요. 다시 부탁해 주세요.');
      const checked = checkEdits(answer, ctx, { slides: base });
      const note = [];
      if (ctx.cut.slides) note.push(`한 번에 ${limit}장까지라 ${ctx.cut.slides}장은 빼고 부탁했어요.`);
      if (ctx.cut.items) note.push(`조각이 많은 장은 꾸밈 ${ctx.cut.items}개를 빼고 보냈어요.`);
      const tail = typeof answer.receipt === 'string' ? clip(answer.receipt, 80) : '';
      if (!checked.ops.length || !applyEdits(base, checked.ops, ctx).count) {
        bubble('ai', checked.say || '지금 그대로가 좋아 보여요. 바꿀 것이 없어요.');
        if (checked.dropped.length) bubble('note', `받은 지시 ${checked.dropped.length}개는 온바탕이 쓸 수 없는 것이라 뺐어요.`);
        say(tail);
      } else { card({ ctx, base, checked, limits: EDIT_LIMITS, note, tail }); say('미리 보고 "적용"을 눌러요. 누르기 전에는 아무것도 바뀌지 않아요.'); wish.value = ''; }
    } catch (error) {
      const text = error?.name === 'AbortError' ? '부탁을 그만뒀어요. 이미 시작된 요청은 질문권이 쓰일 수 있어요.' : message(error, 'AI-G가 답하지 못했어요. 잠시 뒤 다시 부탁해 주세요. 움직임 자동 다듬기는 지금도 쓸 수 있어요.');
      bubble('note', text);
      say(text);
    } finally {
      if (asking === controller) asking = null;
      wish.disabled = false;
      update();
    }
  }
  function polish() {
    const blocked = host.blocked();
    if (blocked) { bubble('note', blocked); return; }
    const base = host.slides();
    const picks = polishScope.value === 'all' ? base.map((_, i) => i) : chosen();
    if (!picks.length) return;
    const ctx = editContext(base, picks, { title: host.title(), aspect: host.aspect(), limits: LOCAL_LIMITS });
    const plan = polishMotion(base, ctx, { keep: keep.checked });
    const checked = checkEdits(plan, ctx, { limits: LOCAL_LIMITS, slides: base });
    bubble('me', `${polishScope.value === 'all' ? '자료 전체' : rangeText(ctx.picks)} · 움직임 자동 다듬기${keep.checked ? '' : '(이미 정한 것도 바꾸기)'}`);
    if (!checked.ops.length || !applyEdits(base, checked.ops, ctx, { limits: LOCAL_LIMITS }).count) { scrollTo(bubble('ai', keep.checked ? '더 입힐 움직임이 없어요. 이미 정한 움직임도 바꾸려면 "이미 정한 움직임은 그대로 두기"를 꺼 보세요.' : '더 입힐 움직임이 없어요.')); return; }
    card({ ctx, base, checked, limits: LOCAL_LIMITS });
  }
  polishScope.addEventListener('change', update);
  wish.addEventListener('input', () => { if (peek.open) shown.textContent = peekText(); });
  drawPicks();
  update();

  return {
    node,
    /** 장 목록이 바뀌었을 때(장을 옮기고 더하고 지웠을 때) 범위 표시를 맞춘다. */
    refresh() {
      if (disposed) return;
      const n = host.slides().length;
      if (n !== count) { count = n; if (scope === 'pick') picked = new Set([...picked].filter((i) => i < n)); }
      drawPicks();
      for (const box of log.querySelectorAll('[data-assist-card]')) box._sync?.();
    },
    focus() { (provider ? wish : polishButton).focus({ preventScroll: true }); },
    busy: () => !!asking,
    destroy() { disposed = true; asking?.abort(); for (const stop of stops) stop(); stops.clear(); node.remove(); },
  };
}
