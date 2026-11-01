let query;
function motionQuery() {
  return query ||= globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
}

export function reducedMotion(node) {
  return !!motionQuery()?.matches && !node?.closest?.('[data-ob-allow-motion]');
}

// Opt-in belongs to one gallery or presentation. Never write it to a document
// or to storage, and return to the system default if its setting changes.
export function bindMotionSwitch(root, button, onChange) {
  const media = motionQuery();
  function update(enabled) {
    root.toggleAttribute('data-ob-allow-motion', enabled);
    button.hidden = !media?.matches;
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? '움직임 끄기' : '움직임 켜기';
    button.title = enabled ? '이 화면에서 기기의 동작 줄이기로 돌아가기' : '기기에서 동작 줄이기가 켜져 있어요. 이 화면에서 효과와 다음 장의 움직임을 재생해요.';
    button.setAttribute('aria-label',button.textContent+' · '+button.title);
    onChange?.(enabled, !!media?.matches);
    if (!enabled && media?.matches) {
      // Finish finite entrances in their visible state. Stop idle loops.
      for (const node of root.querySelectorAll('.fe-card, .fe-card *, [data-effect-playing] g, [data-asset] g')) {
        for (const animation of node.getAnimations?.() || []) {
          if (animation.effect?.getTiming().iterations === Infinity || !animation.playbackRate) animation.cancel();
          else animation.finish();
        }
      }
    }
  }
  const toggle = event => { event.stopPropagation();update(media?.matches && !root.hasAttribute('data-ob-allow-motion')); };
  const reset = () => update(false);
  button.addEventListener('click',toggle);
  if (media?.addEventListener) media.addEventListener('change',reset);
  else media?.addListener(reset);
  reset();
  return () => {
    if (media?.removeEventListener) media.removeEventListener('change',reset);
    else media?.removeListener(reset);
    button.removeEventListener('click',toggle);
    root.removeAttribute('data-ob-allow-motion');
  };
}
