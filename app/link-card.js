// 링크 미리보기 그림: 카카오톡 · 메신저 · SNS 에 공유 링크 · 복사 링크를 붙이면 보이는 그 자료의 첫 장(발표에서 숨긴 장은 건너뛴다).
// 1200×630(미리보기 칸의 크기) JPEG 로 만든다. 장의 비율이 달라도 잘리지 않게 장의 바탕색으로 칸을 채우고 가운데에 맞춰 놓는다.
// 오른쪽 아래에는 온바탕 표(흰 바탕 위 로고)를 작게 넣는다(온바탕으로 만든 자료인 줄 알게).
// 링크를 만들거나 다시 올릴 때 서버에 적는다(가이랩 SQL: 202610260001_onbatang_link_cards.sql · 미리보기: 가이랩 netlify/edge-functions/onbatang-card.js).
// 공용 온바탕의 7일 링크(copy-link.js)와 가이랩의 공유 · 복사 링크(가이랩이 이 파일을 그대로 쓴다)가 함께 쓴다. DOM(canvas)이 있는 곳에서만 그린다.
// 서버가 아직 준비되지 않았거나 그리지 못하면 조용히 넘어간다(링크는 그대로 쓰인다. 미리보기만 기본 "온바탕"으로 보인다).
export const CARD_WIDTH = 1200, CARD_HEIGHT = 630;
const MAX_BASE64 = 400000;

/** 미리보기에 쓸 장: 첫 그림의, 발표에서 숨기지 않은 첫 장(모두 숨겼으면 첫 장). { slide, aspect } 또는 null */
export function cardSlide(records) {
  for (const record of records || []) {
    const slides = Array.isArray(record?.slides) ? record.slides : [];
    const slide = slides.find((s) => s && !s.hidden) || slides[0];
    if (!slide) continue;
    const w = Number(record.size?.width), h = Number(record.size?.height);
    return { slide, aspect: w > 0 && h > 0 ? w / h : 16 / 9 };
  }
  return null;
}
/** 같은 그림인지 견줄 때 쓰는 값(첫 장이 바뀌지 않았으면 다시 그리지 않는다). */
export const cardKey = (records) => { const pick = cardSlide(records); return pick ? JSON.stringify([pick.aspect, pick.slide]) : ''; };

const base64 = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};
// 그린 장의 가장자리 빛깔(왼쪽 위 · 오른쪽 아래 모서리의 평균): 장의 비율이 칸과 다를 때 남는 자리를 그 빛깔로 채운다(장의 기본 바탕색은 장에 적혀 있지 않다).
function edgeColor(canvas) {
  try {
    const g = canvas.getContext('2d'), a = g.getImageData(1, 1, 1, 1).data, b = g.getImageData(canvas.width - 2, canvas.height - 2, 1, 1).data;
    return `rgb(${(a[0] + b[0]) >> 1},${(a[1] + b[1]) >> 1},${(a[2] + b[2]) >> 1})`;
  } catch { return ''; }
}
// 온바탕 표: 오른쪽 아래 구석에 흰 알약 모양 위 로고(심볼 + 이름). 로고를 읽지 못하면 넣지 않는다.
const LOGO = new URL('./brand/logo-primary.svg', import.meta.url).href;
export const BADGE = Object.freeze({ height: 34, padX: 16, padY: 11, right: 24, bottom: 22 });
async function drawBadge(g) {
  const img = new Image();
  img.src = LOGO;
  try { await img.decode(); } catch { return false; }
  const h = BADGE.height, w = Math.round(h * 520 / 112), bw = w + BADGE.padX * 2, bh = h + BADGE.padY * 2;
  const x = CARD_WIDTH - BADGE.right - bw, y = CARD_HEIGHT - BADGE.bottom - bh, r = bh / 2;
  g.save();
  g.shadowColor = 'rgba(24, 51, 44, 0.22)'; g.shadowBlur = 14; g.shadowOffsetY = 3;
  g.fillStyle = 'rgba(255, 255, 255, 0.94)';
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + bw, y, x + bw, y + bh, r); g.arcTo(x + bw, y + bh, x, y + bh, r); g.arcTo(x, y + bh, x, y, r); g.arcTo(x, y, x + bw, y, r); g.closePath(); g.fill();
  g.restore();
  try { g.drawImage(img, x + BADGE.padX, y + BADGE.padY, w, h); } catch { return false; }
  return true;
}
/** 미리보기 그림(base64 JPEG). render: 온바탕의 designToCanvas. 그릴 장이 없거나 그리지 못하면 null. */
export async function linkCard(records, { render } = {}) {
  const pick = cardSlide(records);
  if (!pick) return null;
  const draw = render || (await import('../src/index.js')).designToCanvas;
  const width = Math.min(CARD_WIDTH, Math.round(CARD_HEIGHT * pick.aspect)), made = await draw(pick.slide, { width, aspect: pick.aspect });
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH; canvas.height = CARD_HEIGHT;
  const g = canvas.getContext('2d');
  g.fillStyle = edgeColor(made.canvas) || (typeof pick.slide.bg === 'string' && /^#[0-9a-f]{3,8}$/i.test(pick.slide.bg) ? pick.slide.bg : '#ffffff');
  g.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const scale = Math.min(CARD_WIDTH / made.width, CARD_HEIGHT / made.height), w = made.width * scale, h = made.height * scale;
  g.drawImage(made.canvas, (CARD_WIDTH - w) / 2, (CARD_HEIGHT - h) / 2, w, h);
  await drawBadge(g);
  for (const quality of [0.86, 0.72, 0.58, 0.45]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return null;
    const text = await base64(blob);
    if (text.length <= MAX_BASE64) return text;
  }
  return null;
}
/**
 * 링크의 미리보기 그림을 서버에 적는다. kind: 'share' · 'copy'. 첫 장이 지난번과 같으면 다시 보내지 않는다(sent: 자료 이름표 → cardKey).
 * 무엇이 잘못되어도 링크 일에는 영향을 주지 않는다(false).
 */
export async function sendLinkCard(rpc, { kind, designId, records, render, sent = null }) {
  try {
    const key = cardKey(records);
    if (!key || (sent && sent.get(`${kind}:${designId}`) === key)) return false;
    const card = await linkCard(records, { render });
    if (!card) return false;
    await rpc('onbatang_link_card_put', { p_kind: kind, p_design: designId, p_card: card });
    sent?.set(`${kind}:${designId}`, key);
    return true;
  } catch (error) { console.warn(error); return false; }
}
