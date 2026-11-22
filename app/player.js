// 발표처럼 트는 작은 재생기: 공유 링크(GBE-AI Lab) 같은 들여 쓰는 곳에서 그림을 발표 화면과 같은 움직임으로 보여 준다.
// 전환 효과(이어 움직이기 포함) · 나타나기(조합 효과) · 누를 때 나오기 · 강조 · 머무는 동안 계속 움직이기 · 영상 장면(파일을 받을 수 있을 때) · 유튜브.
// 편집기 · 저장소에 기대지 않는다. 넘기기는 next() · prev() · go(n): 누를 때 나오는 것이 남아 있으면 next() 가 그것부터 하나씩 나타나게 한다.
// 모양은 player.css(.ob-player). 움직임을 줄여 달라고 해 둔 기기에서는 motion.js 가 움직이지 않고 바로 보여 준다.
import { designView, youTubePlayers, webFrame, liveWebBoxes } from '../src/render.js';
import { liveBackdrops, leaveLooks } from '../src/live.js';
import { playDesign, playTransition, morphs } from '../src/motion.js';
import { scenePlayer } from '../src/scene.js';
import { cleanDesign } from '../src/model.js';
import { stepOpenQuestion } from '../src/effect-player.js';
import { connectHtmlPresentation } from '../src/html-presentation.js';

/**
 * stage: 장을 그릴 자리(비워 두고 넘긴다) · slides: 장들(그림 기록의 slides, 보일 것만) · aspect: 가로 ÷ 세로.
 * onChange({ at, total, left, cue }): 장이 바뀌거나 누를 때 나오는 것이 나올 때마다(left: 이 장에 남은 누를 것).
 *   cue: HTML 발표면 { index, total, title, notes, nextTitle }, 아니면 null.
 * onKey({ key, code }): HTML 발표 안에서 누른 넘기기 키(연결된 뒤에는 HTML 이 아니라 여기로 온다). 없으면 next · prev 로 넘긴다.
 * 돌려주는 것: { at, total, next(), prev(), go(n), destroy() } · next() · prev() 는 움직였으면 true.
 * HTML 발표 장에서는 next() · prev() 가 장면부터 넘기고, 첫 · 끝 장면에서 장을 넘긴다. 불러오는 동안(최대 15초)은 장을 넘기지 않는다.
 */
export function mountPlayer(stage, { slides = [], aspect = 16 / 9, onChange = () => {}, onKey = null, edge = 1920 } = {}) {
  const pages = slides.map((s) => cleanDesign(s, { keepSpaces: true }));
  let at = 0, parts = null, turning = null, leaving = null, film = null, waiting = null, tube = [], timers = [], alive = true, outro = 0;
  const shown = new WeakMap(), films = new WeakMap(), tubes = new WeakMap(), decks = new WeakMap();
  stage.classList.add('ob-player');
  stage.style.setProperty('--ob-player-ratio', String(aspect));
  const cards = () => [...stage.querySelectorAll(':scope > .fe-card')];
  const view = (design) => {
    const card = designView(design, { sceneEdge: edge });
    // 웹사이트 장: 표지 위에 실제 사이트를 연다(보는 사람이 직접 누르고 쓸 수 있다. 넘기기는 재생기 밖의 단추로).
    if (design.web) card.append(webFrame(design.web));
    // 올린 HTML: 장면 단위로 넘기는 발표면 이어 받는다(연결이 되기 전 · 안 되는 HTML 은 예전처럼 장 하나).
    const frame = typeof design.web?.html === 'string' ? card.querySelector(':scope > .fe-web-frame') : null;
    if (frame) {
      try {
        const deck = connectHtmlPresentation(frame, {
          onState: () => { if (cards().at(-1) === card) tell(); },
          onKey: (key) => { if (cards().at(-1) !== card) return; if (onKey) onKey(key); else deckKey(key); },
        });
        deck.since = Date.now();
        decks.set(card, deck);
      } catch (error) { console.warn(error); } // 이어 받지 못해도 장은 그대로 보인다(예: 보안 연결이 아닌 주소)
    }
    liveWebBoxes(card);
    card.style.setProperty('--fe-ratio', String(aspect));
    queueMicrotask(() => liveBackdrops(card));     // 움직이는 바탕: 장이 붙으면 그때부터 움직인다(떼면 저절로 멈춘다)
    card.style.setProperty('--fe-card-radius', '0');
    card.style.aspectRatio = String(aspect);
    return card;
  };
  // 장을 뗀다(그 장의 영상 · 유튜브도 함께 치운다).
  const drop = (card) => {
    decks.get(card)?.destroy(); decks.delete(card);
    films.get(card)?.destroy(); films.delete(card);
    tubes.get(card)?.forEach((p) => p.destroy()); tubes.delete(card);
    card.remove();
  };
  const settle = () => { turning?.finish(); turning = null; if (leaving) drop(leaving); leaving = null; };
  // left: 이 장에 남은 누를 것(누를 때 나오는 요소 + 기다리는 바탕 영상).
  const tell = () => {
    const s = decks.get(cards().at(-1))?.state, cue = s ? { index: s.index, total: s.total, title: s.title, notes: s.notes || s.cues[s.index]?.notes || '', nextTitle: s.cues[s.index + 1]?.title || '' } : null;
    try { onChange({ at, total: pages.length, left: (parts?.left?.() || 0) + (waiting ? 1 : 0), cue }); } catch (error) { console.warn(error); }
  };
  // 지금 장의 HTML 발표 장면을 넘긴다. 넘겼거나(불러오는 중이면 기다리며) 장을 넘기지 말아야 하면 true.
  const stepDeck = (delta) => {
    const deck = decks.get(cards().at(-1));
    if (!deck || (!deck.ready && Date.now() - deck.since > 15000)) return false;
    return deck.step(delta);
  };
  const deckKey = ({ key }) => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(key)) api.next();
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(key)) api.prev();
    else if (key === 'Home' || key === 'End') { const deck = decks.get(cards().at(-1)); if (deck?.state) { deck.go(key === 'Home' ? 0 : deck.state.total - 1); tell(); } }
  };
  // 들어오는 장의 영상 장면 · 유튜브: 나가는 장의 것은 멈추고, delay 뒤에 튼다("장이 열리면 바로 틀기"로 정한 유튜브만 저절로).
  const startMedia = (card, design, delay) => {
    for (const t of timers) clearTimeout(t);
    timers = [];
    film?.pause(); film = null; waiting = null;
    const layer = design.video ? card.querySelector(':scope > .fe-scene') : null;
    if (layer) {
      const mine = film = scenePlayer(layer, design.video);
      films.set(card, mine);
      // 장이 열리면 바로 트는 영상만 저절로. 아니면 첫 모습으로 기다리다가 next() 에서 튼다(발표 화면과 같다).
      if (design.video.auto) timers.push(setTimeout(() => { if (film === mine) mine.play({ from: design.video.in }); }, delay));
      else {
        waiting = { player: mine, layer, from: design.video.in };
        layer.classList.add('fe-standby');
        mine.ready.then((ok) => { if (!ok && waiting?.player === mine) { waiting = null; layer.classList.remove('fe-standby'); tell(); } });
      }
    }
    for (const p of tube) if (p.started) p.pause();
    tube = youTubePlayers(card);
    tubes.set(card, tube);
    const autos = tube.filter((p) => p.auto);
    if (autos.length) timers.push(setTimeout(() => { for (const p of autos) if (!p.started) p.play(); }, delay + 400));
  };
  function draw(dir) {
    settle();
    parts?.stop({ freeze: true }); // 실제 보이던 자세를 다음 장으로 잇는다
    const design = pages[at], card = view(design), old = cards().at(-1) || null;
    shown.set(card, design);
    stage.append(card);
    if (!dir || !old) {
      for (const n of cards()) if (n !== card) drop(n);
      parts = playDesign(card, design, { delay: 250 });
      startMedia(card, design, 250);
    } else {
      // 다음 장으로: 그 장의 전환 효과. 앞 장으로: 방금 보던 장이 들어올 때의 전환을 거꾸로(발표 화면과 같다).
      const turn = playTransition(old, card, dir > 0 ? design.tr : pages[at + 1]?.tr, dir, { from: shown.get(old), to: design, enters: dir > 0 });
      startMedia(card, design, turn.ms);
      if (turn.ms) { turning = turn; leaving = old; turn.done.then(() => { if (turning === turn) settle(); }); }
      else drop(old);
      parts = playDesign(card, design, { delay: turn.ms, still: dir < 0 });
    }
    tell();
  }
  const api = {
    get at() { return at; },
    get total() { return pages.length; },
    /** 지금 장의 HTML 발표 장면으로 바로 간다(첫 장면 0). 장면 발표가 아니면 false. */
    cue(n) { const deck = decks.get(cards().at(-1)); if (!deck?.state) return false; deck.go(n); tell(); return true; },
    next() {
      if (!alive || !pages.length) return false;
      if(stepOpenQuestion(stage,1))return true;
      if (stepDeck(1)) { tell(); return true; }
      settle();
      parts?.finish();
      if (waiting) { const w = waiting; waiting = null; w.layer.classList.remove('fe-standby'); w.player.play({ from: w.from }); tell(); return true; }
      if (parts?.next()) { tell(); return true; }
      const tubeWaiting = tube.find((p) => !p.started);
      if (tubeWaiting) { tubeWaiting.play(); return true; }
      if (at >= pages.length - 1) return false;
      // 글자 효과의 사라지는 움직임: 효과 글이 한 번 사라진 뒤에 넘긴다(이어 움직이기 전환이면 건너뛴다). 그사이 또 넘기면 바로.
      if (outro) { clearTimeout(outro); outro = 0; }
      else if (!morphs(pages[at + 1]?.tr)) {
        const ms = leaveLooks(stage);
        if (ms) { const from = at; outro = setTimeout(() => { outro = 0; if (alive && at === from) { at++; draw(1); } }, ms); return true; }
      }
      at++; draw(1); return true;
    },
    prev() {
      if (!alive) return false;
      if(stepOpenQuestion(stage,-1))return true;
      if (stepDeck(-1)) { tell(); return true; }
      if(at<=0)return false;
      clearTimeout(outro); outro = 0;
      at--; draw(-1); return true;
    },
    go(n) {
      if (!alive || !pages.length) return false;
      const to = Math.max(0, Math.min(pages.length - 1, Math.trunc(Number(n)) || 0));
      if (to === at) return false;
      clearTimeout(outro); outro = 0;
      const dir = to > at ? 1 : -1;
      at = to; draw(dir); return true;
    },
    destroy() {
      alive = false;
      clearTimeout(outro);
      for (const t of timers) clearTimeout(t);
      settle(); parts?.stop(); parts = null;
      for (const n of cards()) drop(n);
      stage.classList.remove('ob-player');
    },
  };
  if (pages.length) draw(0);
  return api;
}
