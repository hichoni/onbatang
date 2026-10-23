// 발표처럼 트는 작은 재생기: 공유 링크(가이랩) 같은 들여 쓰는 곳에서 그림을 발표 화면과 같은 움직임으로 보여 준다.
// 전환 효과(이어 움직이기 포함) · 나타나기(조합 효과) · 누를 때 나오기 · 강조 · 머무는 동안 계속 움직이기 · 영상 장면(파일을 받을 수 있을 때) · 유튜브.
// 편집기 · 저장소에 기대지 않는다. 넘기기는 next() · prev() · go(n): 누를 때 나오는 것이 남아 있으면 next() 가 그것부터 하나씩 나타나게 한다.
// 모양은 player.css(.ob-player). 움직임을 줄여 달라고 해 둔 기기에서는 motion.js 가 움직이지 않고 바로 보여 준다.
import { designView, youTubePlayers } from '../src/render.js';
import { playDesign, playTransition } from '../src/motion.js';
import { scenePlayer } from '../src/scene.js';
import { cleanDesign } from '../src/model.js';

/**
 * stage: 장을 그릴 자리(비워 두고 넘긴다) · slides: 장들(그림 기록의 slides, 보일 것만) · aspect: 가로 ÷ 세로.
 * onChange({ at, total, left }): 장이 바뀌거나 누를 때 나오는 것이 나올 때마다(left: 이 장에 남은 누를 것).
 * 돌려주는 것: { at, total, next(), prev(), go(n), destroy() } · next() · prev() 는 움직였으면 true.
 */
export function mountPlayer(stage, { slides = [], aspect = 16 / 9, onChange = () => {}, edge = 1920 } = {}) {
  const pages = slides.map((s) => cleanDesign(s, { keepSpaces: true }));
  let at = 0, parts = null, turning = null, leaving = null, film = null, waiting = null, tube = [], timers = [], alive = true;
  const shown = new WeakMap(), films = new WeakMap(), tubes = new WeakMap();
  stage.classList.add('ob-player');
  stage.style.setProperty('--ob-player-ratio', String(aspect));
  const cards = () => [...stage.querySelectorAll(':scope > .fe-card')];
  const view = (design) => {
    const card = designView(design, { sceneEdge: edge });
    card.style.setProperty('--fe-ratio', String(aspect));
    card.style.setProperty('--fe-card-radius', '0');
    card.style.aspectRatio = String(aspect);
    return card;
  };
  // 장을 뗀다(그 장의 영상 · 유튜브도 함께 치운다).
  const drop = (card) => {
    films.get(card)?.destroy(); films.delete(card);
    tubes.get(card)?.forEach((p) => p.destroy()); tubes.delete(card);
    card.remove();
  };
  const settle = () => { turning?.finish(); turning = null; if (leaving) drop(leaving); leaving = null; };
  const tell = () => { try { onChange({ at, total: pages.length, left: parts?.left?.() || 0 }); } catch (error) { console.warn(error); } };
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
        mine.ready.then((ok) => { if (!ok && waiting?.player === mine) { waiting = null; layer.classList.remove('fe-standby'); } });
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
    parts?.stop();             // 떠나는 장의 "계속 움직이기"를 멈춘다
    const design = pages[at], card = view(design), old = cards().at(-1) || null;
    shown.set(card, design);
    stage.append(card);
    if (!dir || !old) {
      for (const n of cards()) if (n !== card) drop(n);
      parts = playDesign(card, design, { delay: 250 });
      startMedia(card, design, 250);
    } else {
      // 다음 장으로: 그 장의 전환 효과. 앞 장으로: 방금 보던 장이 들어올 때의 전환을 거꾸로(발표 화면과 같다).
      const turn = playTransition(old, card, dir > 0 ? design.tr : pages[at + 1]?.tr, dir, { from: shown.get(old), to: design });
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
    next() {
      if (!alive || !pages.length) return false;
      settle();
      parts?.finish();
      if (waiting) { const w = waiting; waiting = null; w.layer.classList.remove('fe-standby'); w.player.play({ from: w.from }); return true; }
      if (parts?.next()) { tell(); return true; }
      const waiting = tube.find((p) => !p.started);
      if (waiting) { waiting.play(); return true; }
      if (at >= pages.length - 1) return false;
      at++; draw(1); return true;
    },
    prev() {
      if (!alive || at <= 0) return false;
      at--; draw(-1); return true;
    },
    go(n) {
      if (!alive || !pages.length) return false;
      const to = Math.max(0, Math.min(pages.length - 1, Math.trunc(Number(n)) || 0));
      if (to === at) return false;
      const dir = to > at ? 1 : -1;
      at = to; draw(dir); return true;
    },
    destroy() {
      alive = false;
      for (const t of timers) clearTimeout(t);
      settle(); parts?.stop(); parts = null;
      for (const n of cards()) drop(n);
      stage.classList.remove('ob-player');
    },
  };
  if (pages.length) draw(0);
  return api;
}
