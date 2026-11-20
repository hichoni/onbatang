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

/**
 * 올린 HTML 장(발표 화면 · 보기 링크 · 공유 링크 재생기): 온바탕 장처럼 HTML_EDGE(1920) 너비 화면으로 그리고 자리에 맞게 통째로 줄인다.
 * 자리가 1920 이상이면 그대로 채운다. HTML 작업 칸처럼 dataset.fit 이 'native' 이면 줄이지 않는다.
 * - 1920×1080 으로 짠 발표(SVG viewBox 안의 canvas 등)는 자기 화면이 1920 이라 스스로 줄일 일이 없다. 아이폰 사파리는 SVG 안의 canvas 를
 *   줄이지 못해 작은 화면에서 장면이 크게 확대돼 보였다(K-EDU27 발표, 2026-11-21).
 * - 줄인 만큼 load(dpr) 로 실제 선명도(화면 비율 × 줄인 비율)를 알려 준다: 컴퓨터 너비로 그려도 그림 해상도가 커지지 않는다
 *   (그렇지 않으면 1024 너비에서도 2.6배 큰 그림을 만들어 아이폰이 탭을 껐다).
 * load(dpr?) 는 한 번만, 자리 크기를 안 다음에 부른다(자리가 없으면 바로 줄이지 않고).
 */
export const HTML_EDGE = 1920;
export function fitHtmlFrame(frame, load) {
  const host = frame?.parentElement;
  if (!host || frame.dataset.fit === 'native') { load(); return; }
  frame.dataset.fit = 'html';
  let loaded = false;
  const apply = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const k = w / HTML_EDGE;
    if (k >= 1) {
      for (const p of ['width', 'height', 'transform', 'transform-origin']) frame.style.removeProperty(p);
      delete frame.dataset.scaled;
    } else {
      Object.assign(frame.style, { width: `${HTML_EDGE}px`, height: `${Math.round(h / k)}px`, transform: `scale(${k})`, transformOrigin: '0 0' });
      frame.dataset.scaled = '';
    }
    if (!loaded) { loaded = true; load(k < 1 ? (globalThis.devicePixelRatio || 1) * k : undefined); }
  };
  apply();
  if (typeof ResizeObserver === 'function') new ResizeObserver(apply).observe(host);
  else if (!loaded) { loaded = true; load(); }
}
