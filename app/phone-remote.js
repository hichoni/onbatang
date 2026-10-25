// 휴대폰 리모컨(공용 온바탕): 발표 막대의 "휴대폰 리모컨"을 누르면 가이랩의 리모컨 판(QR · 링크)을 발표 화면 오른쪽 위에 작은 창으로 띄운다.
// 로그인은 없다. 판(onbatang-remote-relay.html)이 가이랩의 실시간 통로를 열고, 휴대폰이 보낸 넘기기를 이 창으로 건네준다.
// 신호(postMessage, type: 'onbatang-remote-relay'): 판 → 발표 loaded · ready · error · cmd · size · hidden, 발표 → 판 open(state) · state · show · close.
// 판은 처음 정한 주소(gai-lab.netlify.app)와 그 창에서 온 신호만 받는다. 오가는 것은 지금 장 · 다음 장 글 · 발표자 노트와 넘기기뿐이다.
import { el } from './ui.js';

const ACTIONS = new Set(['next', 'prev', 'go', 'black']);
/** 판이 건넨 넘기기 가운데 쓸 수 있는 것만 남긴다. */
export function cleanRemoteCommand(raw, total) {
  if (!raw || typeof raw !== 'object' || !ACTIONS.has(raw.action)) return null;
  if (raw.action === 'go') return Number.isSafeInteger(raw.at) && raw.at >= 0 && raw.at < total ? { action: 'go', at: raw.at } : null;
  return { action: raw.action };
}

/** startMinican({ showRemote }) 에 넘길 것(공용 온바탕). url: 가이랩의 리모컨 판. */
export function createPhoneRemote({ url = 'https://gai-lab.netlify.app/onbatang-remote-relay.html', host = globalThis.window, timeoutMs = 20000 } = {}) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw Error('리모컨 판 주소를 확인해 주세요.');
  return {
    async open({ state, command, root }) {
      const channel = crypto.randomUUID();
      endpoint.hash = new URLSearchParams({ origin: host.location.origin, channel }).toString();
      const frame = el('iframe', { class: 'cv-phone-remote', title: '휴대폰 리모컨', src: endpoint.href, referrerpolicy: 'no-referrer' });
      let total = state().total, done = null, onMessage = null;
      const post = (action, payload = {}) => frame.contentWindow?.postMessage({ type: 'onbatang-remote-relay', channel, action, ...payload }, endpoint.origin);
      const ready = new Promise((resolve, reject) => {
        done = { resolve, reject };
        onMessage = (e) => {
          const data = e.data;
          if (e.origin !== endpoint.origin || e.source !== frame.contentWindow || data?.type !== 'onbatang-remote-relay' || data.channel !== channel) return;
          if (data.event === 'loaded') post('open', { state: state() });
          else if (data.event === 'ready') { done?.resolve(); done = null; }
          else if (data.event === 'error') { done?.reject(Error(String(data.message || '휴대폰 리모컨을 열지 못했어요.').slice(0, 200))); done = null; }
          else if (data.event === 'size' && Number.isFinite(data.height) && data.height > 0) frame.style.height = `${Math.min(900, Math.ceil(data.height))}px`;
          else if (data.event === 'hidden') frame.hidden = true;
          else if (data.event === 'cmd') { const cmd = cleanRemoteCommand(data.cmd, total); if (cmd) command(cmd); }
        };
        host.addEventListener('message', onMessage);
      });
      root.append(frame);
      const close = () => { host.removeEventListener('message', onMessage); try { post('close'); } catch { /* 이미 닫혔다 */ } frame.remove(); };
      const timer = setTimeout(() => { done?.reject(Error('휴대폰 리모컨 연결 시간이 지났어요. 인터넷을 확인하고 다시 눌러 주세요.')); done = null; }, timeoutMs);
      try { await ready; } catch (error) { close(); throw error; } finally { clearTimeout(timer); }
      return {
        update(s) { total = s.total; post('state', { state: s }); },
        show() { frame.hidden = false; post('show'); },
        close,
      };
    },
  };
}
