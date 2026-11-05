// 웹사이트 장 · 상자의 실제 사이트(iframe)를 자리 크기에 맞춘다(render.js 의 webFrame 이 쓴다). 화면을 모르는 함수라 시험에서 그대로 부른다.
/**
 * 좁은 자리(휴대폰 세로 화면의 장 · 작은 웹사이트 상자)에서는 사이트가 휴대폰 화면으로 그려져 장 안에 갇힌 듯 보인다.
 * 자리가 WEB_NARROW(휴대폰 크기)보다 좁으면 사이트를 컴퓨터 화면 너비(WEB_DESKTOP)로 그리고, 자리에 맞게 통째로 줄여 보인다(누르기도 그대로 된다).
 * 넓은 자리에서는 원래대로 자리를 꽉 채운다. 자리 크기가 바뀌면(화면 돌리기 · 창 크기) 다시 맞춘다.
 */
export const WEB_DESKTOP = 1024, WEB_NARROW = 600;
export function fitWebFrame(frame) {
  const host = frame?.parentElement;
  if (!host || frame.dataset.fit) return;
  frame.dataset.fit = '';
  const apply = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    if (w >= WEB_NARROW) {
      for (const k of ['width', 'height', 'transform', 'transform-origin']) frame.style.removeProperty(k);
      delete frame.dataset.scaled;
      return;
    }
    const k = w / WEB_DESKTOP;
    Object.assign(frame.style, { width: `${WEB_DESKTOP}px`, height: `${Math.round(h / k)}px`, transform: `scale(${k})`, transformOrigin: '0 0' });
    frame.dataset.scaled = '';
  };
  apply();
  if (typeof ResizeObserver === 'function') new ResizeObserver(apply).observe(host);
}
