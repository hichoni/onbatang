// Account credentials stay in the GBE-AI Lab window. Only explicit generation
// requests and bounded app results cross this channel.
export function createGaiPopupProvider({ url = 'https://gbe.ai.kr/onbatang-gai-connect.html', host = globalThis.window } = {}) {
  const endpoint = new URL(url), pending = new Map();
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw Error('가이X 연결 주소를 확인해주세요.');
  let popup, channel, ready = false, connection, resolveConnection, rejectConnection, connectionTimer, poll;
  const fail = message => {
    ready = false; clearTimeout(connectionTimer); clearInterval(poll);
    rejectConnection?.(Error(message)); resolveConnection = rejectConnection = null; connection = null;
    for (const item of pending.values()) item.reject(Error(message)); pending.clear();
  };
  host.addEventListener('message', event => {
    const data = event.data;
    if (event.origin !== endpoint.origin || event.source !== popup || data?.type !== 'onbatang-gai' || data.channel !== channel) return;
    if (data.event === 'ready') { ready = true; clearTimeout(connectionTimer); resolveConnection?.({ label: '가이X 연결됨' }); resolveConnection = rejectConnection = null; return; }
    const item = pending.get(data.request); if (!item) return;
    if (data.event === 'progress') { item.onProgress?.(data.result || data.message); return; }
    if (!['result', 'error'].includes(data.event)) return;
    pending.delete(data.request);
    if (data.event === 'error') item.reject(Error(String(data.message || '가이X 요청을 마치지 못했어요.').slice(0, 500)));
    else item.resolve(data.result);
  });
  function connect() {
    if (ready && popup && !popup.closed) return Promise.resolve({ label: '가이X 연결됨' });
    if (connection && popup && !popup.closed) { popup.focus(); return connection; }
    if (popup?.closed) fail('가이X 연결 창이 닫혔어요. 다시 연결해주세요.');
    channel = crypto.randomUUID(); ready = false;
    endpoint.hash = new URLSearchParams({ origin: host.location.origin, channel }).toString();
    // Called directly from the teacher's click, before any await.
    popup = host.open(endpoint.href, `onbatang-gai-${channel}`, 'popup,width=520,height=700');
    if (!popup) return Promise.reject(Error('가이X 연결 창이 차단됐어요. 이 사이트의 팝업을 허용하고 연결을 눌러주세요.'));
    connection = new Promise((resolve, reject) => { resolveConnection = resolve; rejectConnection = reject; });
    connectionTimer = setTimeout(() => fail('가이X 연결 시간이 지났어요. 연결을 다시 눌러주세요.'), 300000);
    clearInterval(poll); poll = setInterval(() => { if (popup.closed) fail('가이X 연결 창이 닫혔어요. 대화 내용은 남아 있어요. 다시 연결해주세요.'); }, 500);
    return connection;
  }
  async function generate(input, { signal, onProgress } = {}) {
    if (!ready || !popup || popup.closed) throw Error('가이X를 먼저 연결해주세요.');
    if (signal?.aborted) throw new DOMException('요청을 취소했어요.', 'AbortError');
    const request = crypto.randomUUID();
    let timer, abort;
    try {
      return await new Promise((resolve, reject) => {
        abort = () => { popup?.postMessage({ type: 'onbatang-gai', channel, request, action: 'cancel' }, endpoint.origin); pending.delete(request); reject(new DOMException('요청을 취소했어요. 이미 시작된 AI 요청의 사용량은 반영될 수 있어요.', 'AbortError')); };
        pending.set(request, { resolve, reject, onProgress });
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => { abort(); }, 300000);
        popup.postMessage({ type: 'onbatang-gai', channel, request, action: 'generate', input }, endpoint.origin);
      });
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); pending.delete(request); }
  }
  return { connect, generate };
}
