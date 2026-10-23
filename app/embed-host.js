// 들여쓰기(embed.html): 다른 앱이 iframe 으로 부른 온바탕. 부른 쪽과 신호 넷으로 주고받는다(embed.js 가 부르는 쪽).
//   온바탕 → 부른 쪽  onba:ready  준비됨
//   부른 쪽 → 온바탕  onba:init   { ratio, template, record, title, tools, png: { width, pages } }   pages: 'first'(기본) | 'all'
//   온바탕 → 부른 쪽  onba:save   { record, png(Blob, 첫 장), pngs(Blob[], pages 가 'all' 이면 모든 장 — 풍풍 꿈마당 공모전처럼 발표 자료 전체를 받는 호스트용) }
//   온바탕 → 부른 쪽  onba:close  저장 없이 닫음
// 신호는 부모 창(window.parent)의 것만 받고, 첫 onba:init 을 보낸 주소에만 결과를 보낸다. 바깥에 저장하지 않는다:
// 꾸미는 동안의 초안은 부른 주소마다 따로인 이 기기의 저장소(embed-<주소의 짧은 이름>)에 두고, "다 했어요" 뒤에 지운다.
import { startMinican, openSavedDesign, flushSavedDesign } from './app.js';
import { ONBATANG_FONTS, ONBATANG_TITLE_FONT } from './fonts.js';
import { listDesigns, putDesign, removeDesign } from './store.js';
import { RATIOS, MAX_NAME, newRecord, migrateRecord, aspectOf } from './designs.js';
import { configure, layoutItems, layoutList } from '../src/model.js';
import { designToBlob } from '../src/export.js';

/** 부를 수 있는 주소(비우면 어디서나). 저장하지 않으므로 기본은 열어 둔다. */
export const EMBED_ALLOW = [];
/** pages: 'all' 일 때 돌려주는 장 수의 상한(큰 자료를 통째로 보내다 멈추지 않게) */
export const EMBED_MAX_PAGES = 40;
const parent = window.parent;
let caller = null;              // 첫 onba:init 을 보낸 주소

const send = (type, data = {}) => { if (caller && parent !== window) parent.postMessage({ type, ...data }, caller); };
// 부른 주소의 짧은 이름(저장소 이름에 쓴다): 같은 앱이면 늘 같은 초안을 다시 연다.
async function shortName(origin) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(origin)));
  return Array.from(bytes.slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('');
}
/** onba:init 의 설정을 정리한다(모르는 값은 버린다). */
export function cleanInit(raw = {}) {
  const ratio = RATIOS.some((r) => r.id === raw.ratio) ? raw.ratio : '9:16';
  const title = typeof raw.title === 'string' && raw.title.trim() ? Array.from(raw.title.trim()).slice(0, MAX_NAME).join('') : '';
  const width = Number.isFinite(raw.png?.width) ? Math.round(Math.min(4096, Math.max(64, raw.png.width))) : 1080;
  const pages = raw.png?.pages === 'all' ? 'all' : 'first';
  return { ratio, title, tools: raw.tools === 'full' ? 'full' : 'simple', width, pages, template: typeof raw.template === 'string' ? raw.template : '', record: raw.record && typeof raw.record === 'object' ? raw.record : null };
}

async function begin(init) {
  const storage = `embed-${await shortName(caller)}`;
  let id = null;
  await startMinican({
    fonts: ONBATANG_FONTS, titleFont: ONBATANG_TITLE_FONT, storage,
    embed: {
      // 다 했어요: 마지막 편집까지 저장하고, 첫 장을 PNG 로 만들어 원본과 함께 넘긴 뒤 초안을 지운다.
      async done(openId) {
        const record = await flushSavedDesign(openId);
        const aspect = aspectOf(record);
        const { blob } = await designToBlob(record.slides[0], { width: init.width, aspect });
        const extra = {};
        if (init.pages === 'all') {                                 // 모든 장(숨긴 장은 빼고, 많아도 EMBED_MAX_PAGES 장까지)
          const pngs = [blob];
          for (const slide of record.slides.slice(1, EMBED_MAX_PAGES).filter((s) => !s.hidden)) pngs.push((await designToBlob(slide, { width: init.width, aspect })).blob);
          extra.pngs = pngs;
        }
        send('onba:save', { record, png: blob, ...extra });
        try { await removeDesign(openId); } catch { /* 지우지 못해도 다음에 열면 이어서 고칠 뿐이다 */ }
      },
      // 닫기: 보내지 않는다. 초안은 남겨 두어 다시 부르면 이어서 고친다.
      close(openId) { flushSavedDesign(openId).catch(() => {}).finally(() => send('onba:close')); },
    },
  });
  if (init.tools === 'simple') configure({ motion: false });     // 간단 도구: 움직임 칸을 숨긴다(바탕 영상 · 카메라는 들여쓰기에서 늘 없다)
  // 열 그림: 부른 쪽이 준 원본 > 이 기기에 남은 초안 > 새 그림(비율 · 이름 · 시작 틀)
  let record = null;
  if (init.record) {
    try { record = migrateRecord({ ...init.record, updatedAt: Date.now() }); } catch { record = null; }
  }
  if (!record) record = (await listDesigns())[0] || null;
  if (!record) {
    record = newRecord(init.ratio);
    if (init.title) record.name = init.title;
    const layout = layoutList().find((l) => l.id === init.template);
    if (layout) {
      const before = configure({}).aspect;
      configure({ aspect: aspectOf(record) });
      record.slides[0] = { ...record.slides[0], ...(layout.bg ? { bg: layout.bg } : {}), items: layoutItems(layout.id) };
      configure({ aspect: before });
    }
  }
  await putDesign(record);
  id = record.id;
  await openSavedDesign(id);
  document.body.classList.add('embed-ready');
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (event.source !== parent || data?.type !== 'onba:init') return;
  if (caller) return;                                             // 처음 부른 곳 하나와만 주고받는다
  if (EMBED_ALLOW.length && !EMBED_ALLOW.includes(event.origin)) return;
  caller = event.origin;
  begin(cleanInit(data)).catch((error) => {
    console.error(error);
    send('onba:error', { message: '온바탕을 열지 못했어요. 다시 열어 주세요.' });
  });
});
if (parent !== window) parent.postMessage({ type: 'onba:ready' }, '*');   // 준비됨(아직 아무 내용도 보내지 않는다)
else document.body.classList.add('embed-alone');
