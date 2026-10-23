// PPT 를 온바탕에 담는 동안 화면 전체를 덮는 판. 담는 일이 실제로 나아가는 것이 보이게:
//   지금 담는 장의 큰 미리보기(훑는 빛이 지나간다) · 몇 쪽째인지 · 굵은 진행 막대 · 고른 장들의 띠(담긴 장은 ✓, 담는 중인 장은 빛나고, 남은 장은 흐리다).
// 저장은 쪽 묶음 단위로 끝나므로, 지금 묶음의 장들이 함께 "담는 중"이 된다. 멈추기를 누르면 이미 담은 것은 남는다.
import {onbatangLoading} from '../loading.js';

/**
 * pages: 고른 쪽 번호들(차례대로) · thumbOf(n): 그 쪽의 작은 미리보기 노드(없으면 null) · onCancel: 멈추기
 * 돌려주는 것: { node, update({ completed, total, current, phase, detail }) }
 */
export function savingCover({doc = document, pages = [], thumbOf = () => null, onCancel = null} = {}) {
  const make = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const total = pages.length;
  const node = make('div', 'oi-cover');
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.setAttribute('aria-label', 'PPT 를 온바탕에 담는 중');
  node.dataset.importCover = '';
  const panel = make('div', 'oi-cover-panel');
  const loading = onbatangLoading({title: '슬라이드를 온바탕에 담고 있어요', detail: `${total}쪽을 순서대로 저장해요. 원본 PPT는 그대로 보관돼요.`, tips: true});
  const now = make('figure', 'oi-cover-now');
  const nowView = make('div', 'oi-cover-now-view');
  const nowCaption = make('figcaption', 'oi-cover-now-caption', '첫 장을 준비하고 있어요');
  now.append(nowView, nowCaption);
  const count = make('p', 'oi-cover-count');
  const done = make('strong', '', '0'), all = make('span', '', ` / ${total}쪽`);
  count.append(done, all);
  const bar = make('div', 'oi-cover-bar'), fill = make('span', 'oi-cover-fill');
  bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(total)); bar.setAttribute('aria-valuenow', '0');
  bar.append(fill);
  const strip = make('ol', 'oi-cover-strip');
  strip.setAttribute('aria-hidden', 'true');
  const cells = new Map(pages.map((n) => {
    const li = make('li', 'oi-cover-cell');
    li.dataset.state = 'wait';
    const view = thumbOf(n);
    if (view) li.append(view); else li.append(make('span', 'oi-cover-number', String(n)));
    li.append(make('span', 'oi-cover-mark', '✓'));
    strip.append(li);
    return [n, li];
  }));
  const foot = make('p', 'oi-cover-foot', '이 창을 닫지 말고 잠시만 기다려 주세요. 사진이 큰 PPT는 몇 분 걸릴 수 있어요.');
  const actions = make('div', 'oi-cover-actions');
  if (onCancel) {
    const stop = make('button', 'oi-cover-stop', '멈추기');
    stop.type = 'button';
    stop.dataset.importCancel = '';
    stop.addEventListener('click', () => { stop.disabled = true; stop.textContent = '멈추는 중…'; onCancel(); });
    actions.append(stop);
  }
  panel.append(loading.node, now, count, bar, strip, foot, actions);
  node.append(panel);
  let shown = 0;
  let showing = null;
  let working = [];
  // 한 묶음에 여러 장이 있으면 큰 미리보기가 그 장들을 차례로 넘겨 보여 준다(판이 걷히면 멈춘다).
  // 화면에 붙어 있지 않으면 멈춘다(걷혔거나, 세 번 볼 동안 끝내 붙지 않았으면). 이 타이머 하나로 프로그램이 끝나지 않는 일이 없게 한다(unref).
  let idle = 0;
  const turner = setInterval(() => {
    if (!node.isConnected) { if (node.dataset.seen || ++idle >= 3) clearInterval(turner); return; }
    node.dataset.seen = '1';
    if (working.length > 1) show(working[(working.indexOf(showing) + 1) % working.length]);
  }, 1300);
  turner?.unref?.();
  const show = (n) => {
    if (n === showing || !cells.has(n)) return;
    showing = n;
    const view = thumbOf(n);
    const next = make('div', 'oi-cover-now-frame');
    if (view) next.append(view); else next.append(make('span', 'oi-cover-number big', `${n}쪽`));
    nowView.replaceChildren(next, make('span', 'oi-cover-scan'));
    nowCaption.textContent = `${n}쪽을 담는 중`;
  };
  return {
    node,
    update({completed, total: whole, current, phase, detail} = {}) {
      if (detail !== undefined) loading.update({detail});
      if (Number.isFinite(completed)) {
        shown = Math.max(0, Math.min(total, completed));
        done.textContent = String(shown);
        fill.style.width = `${total ? (shown / total) * 100 : 0}%`;
        bar.setAttribute('aria-valuenow', String(shown));
        if (Number.isFinite(whole) && whole !== total) all.textContent = ` / ${whole}쪽`;
      }
      if (Array.isArray(current) || phase === 'saved' || phase === 'complete') working = Array.isArray(current) && phase !== 'saved' && phase !== 'complete' ? current.filter((n) => cells.has(n)) : [];
      // 앞에서부터 shown 쪽은 담겼다(쪽 묶음은 고른 차례대로 저장된다).
      pages.forEach((n, k) => { const li = cells.get(n); li.dataset.state = k < shown ? 'done' : working.includes(n) ? 'now' : 'wait'; });
      if (working.length && !working.includes(showing)) show(working[0]);
      else if (phase === 'complete') { nowCaption.textContent = '다 담았어요'; nowView.querySelector('.oi-cover-scan')?.remove(); }
      // 지금 담는 장이 띠에서 보이게
      const live = strip.querySelector('[data-state="now"]');
      if (live && typeof live.scrollIntoView === 'function') live.scrollIntoView({block: 'nearest', inline: 'center', behavior: 'smooth'});
    },
  };
}
