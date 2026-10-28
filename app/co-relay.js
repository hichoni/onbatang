// 같이 고치기의 통로(공용 온바탕): GBE-AI Lab의 다리(onbatang-co-relay.html)를 보이지 않는 작은 창으로 띄우고, 그 창이 연 실시간 통로로 주고받는다.
// 로그인은 없다. 다리는 처음 정한 주소(이 창의 origin)와 그 창에서 온 신호만 받는다. 오가는 것은 같이 고치는 그림의 바뀐 것과 사람들의 자리뿐이다.
// 신호(postMessage, type: 'onbatang-co-relay'): 다리 → 이 창 loaded · ready · error · msg(payload) · qr(id, svg), 이 창 → 다리 open · send(payload) · qr(id, url) · close.
import { el } from './ui.js';

/** startMinican({ coEdit }) 의 open 과 같은 것을 돌려준다: { send(message), on(fn) → 끊기, close(), qr(url) → svg(약속) } */
// 다리 창은 쪽 · 스크립트 · 실시간 연결을 차례로 받는다. 학교의 보안 장비를 거치는 느린 망에서도 기다리도록 넉넉히 둔다(timeoutMs).
export async function openCoRelay(code, { url = 'https://gbe.ai.kr/onbatang-co-relay.html', host = globalThis.window, timeoutMs = 45000 } = {}) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw Error('같이 고치기 다리 주소를 확인해 주세요.');
  if (!/^[0-9a-f]{40}$/.test(code)) throw Error('같이 고치기 링크를 확인해 주세요.');
  const channel = crypto.randomUUID();
  endpoint.hash = new URLSearchParams({ origin: host.location.origin, channel, code }).toString();
  const frame = el('iframe', { class: 'cv-co-relay', title: '같이 고치기 연결', src: endpoint.href, referrerpolicy: 'no-referrer', tabindex: '-1', 'aria-hidden': 'true' });
  const listeners = new Set();
  const asks = new Map();
  let done = null;
  let closed = false;
  let loaded = false;               // 다리 쪽이 다 열렸는지(그 전에는 창이 아직 이 주소의 빈 쪽이라 보내지 않는다)
  const post = (action, payload = {}) => { if (!closed && loaded) frame.contentWindow?.postMessage({ type: 'onbatang-co-relay', channel, action, ...payload }, endpoint.origin); };
  const onMessage = (e) => {
    const data = e.data;
    if (e.origin !== endpoint.origin || e.source !== frame.contentWindow || data?.type !== 'onbatang-co-relay' || data.channel !== channel) return;
    if (data.event === 'loaded') { loaded = true; post('open'); }
    else if (data.event === 'ready') { done?.resolve(); done = null; }
    else if (data.event === 'error') { done?.reject(Error(String(data.message || '같이 고치기 통로를 열지 못했어요.').slice(0, 200))); done = null; }
    else if (data.event === 'msg') { for (const fn of listeners) { try { fn(data.payload); } catch (error) { console.warn(error); } } }
    else if (data.event === 'qr' && asks.has(data.id)) { asks.get(data.id)(typeof data.svg === 'string' ? data.svg : ''); asks.delete(data.id); }
  };
  const ready = new Promise((resolve, reject) => { done = { resolve, reject }; });
  host.addEventListener('message', onMessage);
  host.document.body.append(frame);
  const close = () => {
    if (closed) return;
    try { post('close'); } catch { /* 이미 닫혔다 */ }
    closed = true;
    host.removeEventListener('message', onMessage);
    listeners.clear();
    setTimeout(() => frame.remove(), 300);     // 마지막 신호가 나갈 틈
  };
  const timer = setTimeout(() => { done?.reject(Error('같이 고치기 연결 시간이 지났어요. 인터넷을 확인하고 다시 해 주세요.')); done = null; }, timeoutMs);
  try { await ready; } catch (error) { close(); throw error; } finally { clearTimeout(timer); }
  let n = 0;
  return {
    send: (payload) => post('send', { payload }),
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    qr: (link) => new Promise((resolve) => { const id = ++n; asks.set(id, resolve); post('qr', { id, url: String(link) }); setTimeout(() => { if (asks.delete(id)) resolve(''); }, 8000); }),
    close,
  };
}
