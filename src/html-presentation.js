// 올린 HTML 발표와 장면 단위로 주고받는 연결(규약 onbatang:html-presentation:1). HTML 이 window.onbatangPresentation =
// {getState:()=>({index,total,title,notes,cues}), go:index=>...} 를 두고 장면이 바뀔 때 window 에 'onbatang:change' 를 보내면,
// 온바탕이 다음 · 이전 · 리모컨으로 그 장면들을 넘기고 장면 번호를 보여 준다. 없는 HTML 은 예전처럼 장 하나로 다룬다.
// (Codex 의 html-native-stage 작업에서 가져왔다. sandbox 는 그대로 다른 출처이고 HTML 바이트는 바꾸지 않는다.)
// This transport runs inside the uploaded document's opaque-origin iframe.
// It exposes only presentation commands. It never grants access to host DOM/storage.
export function installHtmlPresentation() {
  if (window.parent === window) return;
  const protocol = 'onbatang:html-presentation:1';
  let channel = '', sequence = 0;
  const adapter = () => window.onbatangPresentation;
  const send = (type, extra = {}) => {
    if (channel) parent.postMessage({protocol, channel, type, sequence, ...extra}, '*');
  };
  const changed = () => {
    if (channel && adapter()?.getState) document.documentElement.dataset.onbatangPresentation = 'connected';
    try { send('state', {state: adapter()?.getState?.() || null}); }
    catch { send('state', {state: null}); }
  };
  window.addEventListener('message', event => {
    const m = event.data;
    if (event.source !== parent || !m || m.protocol !== protocol) return;
    if (m.type === 'connect' && typeof m.channel === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(m.channel)) {
      channel = m.channel; sequence = 0; changed(); return;
    }
    if (!channel || m.channel !== channel || m.type !== 'go' || !Number.isSafeInteger(m.sequence) || m.sequence <= sequence) return;
    if (!Number.isSafeInteger(m.index) || m.index < 0 || m.index >= 500) return;
    sequence = m.sequence;
    try { adapter()?.go?.(m.index); } finally { changed(); }
  });
  window.addEventListener('onbatang:change', changed);
  // Capture remote keys before the HTML's own listener so one press runs once.
  // Text fields, modified shortcuts and the HTML's other keys retain their behavior.
  window.addEventListener('keydown', event => {
    if (!channel || !adapter()?.getState || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    const key = event.key, code = event.code;
    if (!['ArrowRight','ArrowDown','PageDown',' ','Enter','ArrowLeft','ArrowUp','PageUp','Backspace','Home','End','Escape','b','B','.','w','W',',','f','F','s','S'].includes(key) && !/^[0-9]$/.test(key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat) send('key', {key, code});
  }, true);
}

const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
export function cleanPresentationState(raw) {
  if (!raw || !Number.isSafeInteger(raw.total) || raw.total < 1 || raw.total > 500 || !Number.isSafeInteger(raw.index) || raw.index < 0 || raw.index >= raw.total) return null;
  return {index: raw.index, total: raw.total, title: text(raw.title, 160), notes: text(raw.notes, 4000),
    cues: Array.isArray(raw.cues) && raw.cues.length === raw.total ? raw.cues.map(cue => ({title: text(cue?.title, 160), notes: text(cue?.notes, 4000)})) : []};
}

/** One frame survives every internal cue. Target indices advance synchronously;
 * stale acknowledgements cannot undo rapid next/previous presses. */
export function connectHtmlPresentation(frame, {onState = () => {}, onKey = () => {}, window: hostWindow = window} = {}) {
  const protocol = 'onbatang:html-presentation:1', channel = hostWindow.crypto.randomUUID();
  let state = null, sequence = 0, ready = false, destroyed = false;
  const post = message => frame.contentWindow?.postMessage({protocol, channel, ...message}, '*');
  const connect = () => { if (destroyed) return; sequence = 0; ready = false; state = null; post({type: 'connect'}); };
  const receive = event => {
    const m = event.data;
    if (destroyed || event.source !== frame.contentWindow || !m || m.protocol !== protocol || m.channel !== channel) return;
    if (m.type === 'state' && Number.isSafeInteger(m.sequence) && m.sequence === sequence) {
      state = cleanPresentationState(m.state); ready = true; onState(state);
    } else if (m.type === 'key' && state && typeof m.key === 'string' && typeof m.code === 'string' && m.code.length <= 20 && (['ArrowRight','ArrowDown','PageDown',' ','Enter','ArrowLeft','ArrowUp','PageUp','Backspace','Home','End','Escape','b','B','.','w','W',',','f','F','s','S'].includes(m.key) || /^[0-9]$/.test(m.key))) {
      onKey({key: m.key, code: m.code});
    }
  };
  hostWindow.addEventListener('message', receive);
  frame.addEventListener('load', connect);
  const go = index => {
    if (!state || !Number.isSafeInteger(index)) return false;
    index = Math.max(0, Math.min(state.total - 1, index));
    const cue = state.cues[index];
    state = {...state, index, ...(cue ? {title: cue.title, notes: cue.notes} : {})};
    post({type: 'go', index, sequence: ++sequence}); onState(state); return true;
  };
  return {
    get state() { return state; }, get ready() { return ready; }, go,
    step(delta, holdBoundary = false) {
      if (!ready) return true;
      if (!state) return false;
      const index = state.index + delta;
      if (index < 0 || index >= state.total) return holdBoundary;
      return go(index);
    },
    destroy() { destroyed = true; frame.removeEventListener('load', connect); hostWindow.removeEventListener('message', receive); state = null; },
  };
}
