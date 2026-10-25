// 복사 링크(공용 온바탕): 내보내기의 "링크 공유"로 만든 링크(…/app/?copy=코드)를 열면
// 그 자료(PPT 파트 여러 개 포함)를 이 브라우저에 사본으로 내려받아 바로 고친다. 로그인은 없다. 보낸 사람의 자료는 바뀌지 않는다.
// 링크는 둘이다: 가이랩 선생님의 링크(가이랩이 만든다)와, 누구나 공용 온바탕에서 만드는 7일 링크(createGuestLinks: 만든 때부터 7일만 열리고 그 뒤에는 서버에서 지워진다).
// 서버: 가이랩의 공개 함수 onbatang_copy_info · onbatang_copy_part · onbatang_guest_copy_*(로그인 없이 부르는 열쇠로), 바탕 영상은 onbatang-copy-videos/<코드>/<sha>.
import { cleanRecord, isDesignId, newDesignId } from './designs.js';

export const COPY_PARAM = 'copy';
const GAILAB = { url: 'https://wiaciazdsnhzgwplwjpu.supabase.co', key: 'sb_publishable_uYeQYITkob0HiEHUCaUZPA_w_1GXN_Q' };
const VIDEO_REF = /^([a-f0-9]{32})-d[a-z0-9]{6,24}$/;
/** 링크의 코드(12자리 16진수)만 받는다. */
export const copyCode = (value) => { const code = String(value || '').trim().toLowerCase(); return /^[0-9a-f]{12}$/.test(code) ? code : ''; };

const MESSAGES = {
  onbatang_copy_not_found: '열 수 없는 링크예요. 보낸 사람이 링크를 껐거나 지웠어요.',
  onbatang_copy_expired: '7일이 지나 사라진 링크예요. 보낸 사람에게 새 링크나 온바탕 파일을 달라고 해 주세요.',
  onbatang_copy_not_ready: '보낸 사람이 아직 자료를 올리는 중이에요. 잠시 뒤 링크를 다시 열어 주세요.',
  onbatang_copy_changed: '보낸 사람이 그사이 자료를 새로 올렸어요. 링크를 다시 열어 주세요.',
};
export function copyMessage(error) {
  const text = String(error?.message || error || '');
  for (const [code, message] of Object.entries(MESSAGES)) if (text.includes(code)) return message;
  if (/function .* does not exist|Could not find the function|PGRST202/i.test(text)) return '링크 서버가 아직 준비되지 않았어요. 보낸 사람에게 알려 주세요.';
  if (/fetch|network|Failed|timeout|abort/i.test(text)) return '인터넷 연결이 원활하지 않아요. 잠시 뒤 링크를 다시 열어 주세요.';
  return '링크의 자료를 받지 못했어요. 잠시 뒤 다시 열어 주세요.';
}

/** 링크의 자료 받기: { title, records(서버에 올라간 그대로), videos: Map(영상 열쇠 → Blob) }. onProgress({ completed, total, phase }) */
// 가이랩의 공개 함수 부르기(로그인 없이 부르는 열쇠만 싣는다. 쿠키 · 인증 정보는 싣지 않는다).
function publicRpc({ url, key, get, timeoutMs }) {
  const base = String(url).replace(/\/+$/, '');
  return async function rpc(name, args) {
    const response = await get(`${base}/rest/v1/rpc/${name}`, { method: 'POST', credentials: 'omit', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(timeoutMs) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(Error(data?.message || `copy_http_${response.status}`), { code: data?.code });
    return data;
  };
}
export function createCopyIntake({ url = GAILAB.url, key = GAILAB.key, fetch: get = globalThis.fetch.bind(globalThis), timeoutMs = 60000 } = {}) {
  const base = String(url).replace(/\/+$/, ''), rpc = publicRpc({ url, key, get, timeoutMs });
  async function video(code, sha) {
    try {
      const response = await get(`${base}/storage/v1/object/onbatang-copy-videos/${code}/${sha}`, { credentials: 'omit', headers: { apikey: key }, signal: AbortSignal.timeout(timeoutMs * 3) });
      return response.ok ? await response.blob() : null;
    } catch (error) { console.warn(error); return null; }
  }
  return {
    async take(code, { onProgress = () => {} } = {}) {
      const info = await rpc('onbatang_copy_info', { p_code: code });
      if (info?.expired) throw Error('onbatang_copy_expired');      // 7일이 지난 7일 링크
      const total = Number(info?.parts) || 0, records = [];
      onProgress({ phase: 'part', completed: 0, total });
      for (let n = 0; n < total; n++) {
        records.push(await rpc('onbatang_copy_part', { p_code: code, p_n: n, p_version: info.version }));
        onProgress({ phase: 'part', completed: n + 1, total });
      }
      const refs = [...new Set(records.flatMap((r) => (r?.slides || []).map((s) => s?.video?.src)).filter((src) => VIDEO_REF.test(src || '')))];
      const videos = new Map();
      for (const [i, src] of refs.entries()) {
        onProgress({ phase: 'video', completed: i, total: refs.length });
        const blob = await video(code, VIDEO_REF.exec(src)[1]);
        if (blob?.size) videos.set(src, blob);
      }
      return { title: String(info?.title || ''), records, videos };
    },
  };
}

// ---------- 7일 링크: 누구나(가이랩 회원이 아니어도) 공용 온바탕에서 만드는 복사 링크 ----------
// 만든 때부터 7일만 열리고, 그 뒤에는 자료가 서버에서 지워진다. 한 링크 파트 20개 · 사진 포함 20MB(파트 하나 5MB)까지, 바탕 영상은 싣지 않는다.
// 한 곳(접속 주소)에서 하루 5개까지(서버가 센다). 다시 올리기 · 지우기는 만들 때 받은 비밀 열쇠(token)로만 하고, 열쇠는 이 브라우저에만 둔다.
// 링크 주소는 가이랩의 복사 링크 페이지다: 카카오톡 · 메신저에 붙이면 그 자료의 제목 · 첫 장이 보이고, 열면 곧바로 공용 온바탕(?copy=코드)으로 간다.
export const GUEST_DAYS = 7, GUEST_PER_DAY = 5, GUEST_MAX_PARTS = 20, GUEST_PART_MAX_BYTES = 5000000, GUEST_MAX_BYTES = 20000000;
export const GUEST_PAGE = 'https://gai-lab.netlify.app/onbatang-copy.html';
export const guestUrl = (code, page = GUEST_PAGE) => `${page}?c=${copyCode(code)}`;
const bytesOf = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
/** 7일 링크에 실을 파트: 올려 두기만 한 사진 목록(uploads)과 바탕 영상은 뺀다. { records, bytes, videos(영상을 뺀 장 수), big(파트 하나가 너무 큰가) } */
export function guestRecords(records) {
  let videos = 0;
  const out = (Array.isArray(records) ? records : []).map((record) => {
    const { uploads, ...rest } = record || {};
    return { ...rest, slides: (rest.slides || []).map((slide) => { if (!slide?.video) return slide; videos++; const { video, ...plain } = slide; return plain; }) };
  });
  const sizes = out.map(bytesOf);
  return { records: out, bytes: sizes.reduce((a, b) => a + b, 0), videos, big: sizes.some((n) => n > GUEST_PART_MAX_BYTES) };
}
const GUEST_MESSAGES = {
  onbatang_guest_limit: `링크는 하루에 ${GUEST_PER_DAY}개까지 만들 수 있어요. 내일 다시 하거나, 내려받기의 "온바탕 파일"로 보내 주세요.`,
  onbatang_guest_busy: '지금은 7일 링크가 너무 많아 새로 만들 수 없어요. 내려받기의 "온바탕 파일"로 보내 주세요.',
  onbatang_guest_too_large: '사진이 많아 7일 링크로 보내기에 커요(사진 포함 20MB · 파트 하나 5MB까지). 내려받기의 "온바탕 파일"로 보내 주세요.',
  onbatang_copy_invalid: '자료를 확인해 주세요(파트는 20개, 한 파트는 1~20장, 이름은 60자까지).',
  onbatang_copy_not_found: '이 링크는 지워졌거나 7일이 지났어요. 새 링크를 만들어 주세요.',
};
/** 7일 링크를 만들거나 고칠 때의 알림 글. */
export function guestMessage(error) {
  const text = String(error?.message || error || '');
  for (const [code, message] of Object.entries(GUEST_MESSAGES)) if (text.includes(code)) return message;
  if (/function .* does not exist|Could not find the function|PGRST202/i.test(text)) return '링크 서버가 아직 준비되지 않았어요. 잠시 뒤 다시 해 주세요. 그동안은 "온바탕 파일"로 보낼 수 있어요.';
  if (/fetch|network|Failed|timeout|abort/i.test(text)) return '인터넷 연결이 원활하지 않아요. 잠시 뒤 다시 해 주세요.';
  return '링크를 만들지 못했어요. 잠시 뒤 다시 해 주세요.';
}
/**
 * 7일 링크 만들기 · 다시 올리기 · 지우기. link: 이 브라우저가 만든 링크({ code, token }) — 있으면 같은 링크에 다시 올린다(기간은 그대로).
 * publish({ title, records, link?, onProgress?, card? }) → { code, token, title, parts, version, expiresAt, … }. card(): 미리보기 그림(base64 JPEG)을 주는 함수(없거나 실패하면 넘어간다).
 */
export function createGuestLinks({ url = GAILAB.url, key = GAILAB.key, fetch: get = globalThis.fetch.bind(globalThis), timeoutMs = 60000 } = {}) {
  const rpc = publicRpc({ url, key, get, timeoutMs });
  return {
    async publish({ title, records, link = null, onProgress = () => {}, card = null }) {
      const plain = guestRecords(records);
      if (!plain.records.length || plain.records.length > GUEST_MAX_PARTS) throw Error('onbatang_copy_invalid');
      if (plain.big || plain.bytes > GUEST_MAX_BYTES) throw Error('onbatang_guest_too_large');
      const started = await rpc('onbatang_guest_copy_publish', { p_title: title, p_parts: plain.records.length, ...(link ? { p_code: link.code, p_token: link.token } : {}) });
      const token = link?.token || started.token, code = started.code;
      let last = started;
      for (const [n, record] of plain.records.entries()) {
        onProgress({ phase: 'part', completed: n, total: plain.records.length });
        last = await rpc('onbatang_guest_copy_put', { p_code: code, p_token: token, p_n: n, p_record: record });
      }
      if (card) {
        onProgress({ phase: 'card' });
        try { const picture = await card(); if (picture) await rpc('onbatang_guest_copy_card', { p_code: code, p_token: token, p_card: picture }); }
        catch (error) { console.warn(error); }
      }
      return { ...last, token, videos: plain.videos };
    },
    get: (link) => rpc('onbatang_guest_copy_get', { p_code: link.code, p_token: link.token }),
    remove: (link) => rpc('onbatang_guest_copy_remove', { p_code: link.code, p_token: link.token }),
  };
}
// 이 브라우저가 만든 7일 링크(자료 이름표 → { code, token, expiresAt, title }). 기간이 지난 것은 읽을 때 버린다.
const GUEST_KEY = 'onbatang.guest-links';
export function guestLink(designId, now = Date.now()) {
  try {
    const link = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}')[designId];
    return link && copyCode(link.code) && /^[0-9a-f]{64}$/.test(link.token || '') && Date.parse(link.expiresAt) > now ? link : null;
  } catch { return null; }
}
export function keepGuestLink(designId, link, now = Date.now()) {
  try {
    const all = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}');
    for (const [id, value] of Object.entries(all)) if (!(Date.parse(value?.expiresAt) > now)) delete all[id];
    if (link) all[designId] = { code: link.code, token: link.token, expiresAt: link.expiresAt, title: link.title }; else delete all[designId];
    localStorage.setItem(GUEST_KEY, JSON.stringify(all));
  } catch { /* 기억하지 못하면 다음에는 새 링크를 만든다(지난 링크는 7일 뒤 저절로 지워진다) */ }
}

/**
 * 받은 기록을 이 기기의 새 그림으로: 새 이름표(받은 사람 것이라 보낸 사람의 그림과 섞이지 않는다),
 * 같은 PPT 의 파트끼리만 한 칸으로 묶이게 새 원본 번호. 영상 열쇠는 그대로 두고 placeVideos 가 바꾼다.
 */
export function copyRecords(raw, { now = Date.now(), rand = Math.random } = {}) {
  const sources = new Map();
  const sourceId = (old) => { if (!sources.has(old)) sources.set(old, `c${now.toString(36)}${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}`.slice(0, 32)); return sources.get(old); };
  const records = [];
  for (const [i, input] of (Array.isArray(raw) ? raw : []).entries()) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.slides)) continue;
    const { uploads, ...rest } = input;
    const old = rest.source?.sourceDocumentId, fresh = old ? sourceId(old) : null;
    const slides = rest.slides.map((slide) => fresh && slide?.source?.sourceDocumentId === old ? { ...slide, source: { ...slide.source, sourceDocumentId: fresh } } : slide);
    let id = newDesignId(now + i, rand());
    while (!isDesignId(id) || records.some((r) => r.id === id)) id = newDesignId(now + i, rand());
    let record = null;
    try { record = cleanRecord({ ...rest, id, slides, updatedAt: now, ...(fresh ? { source: { ...rest.source, sourceDocumentId: fresh } } : {}) }); }
    catch (error) { console.warn(error); }
    if (record) records.push(record);
  }
  return records;
}
/** 받은 영상을 이 기기에 저장하고(save({ blob, design }) → 열쇠) 그림의 영상 열쇠를 바꾼다. 받지 못한 영상은 그 장에서 뺀다. { records, dropped } */
export async function placeVideos(records, videos, save) {
  let dropped = 0;
  const out = [];
  for (const record of records) {
    const keys = new Map();
    const slides = [];
    for (const slide of record.slides) {
      if (!slide?.video) { slides.push(slide); continue; }
      const src = slide.video.src, blob = videos.get(src);
      if (blob && !keys.has(src)) { try { keys.set(src, await save({ blob, design: record.id })); } catch (error) { console.warn(error); keys.set(src, null); } }
      const local = keys.get(src);
      if (local) slides.push({ ...slide, video: { ...slide.video, src: local } });
      else { const { video, ...plain } = slide; slides.push(plain); dropped++; }
    }
    out.push({ ...record, slides });
  }
  return { records: out, dropped };
}

// 같은 링크를 이 브라우저에서 다시 열면 새로 받지 않고 받아 둔 사본을 연다(코드 → 그림 이름표).
const TAKEN_KEY = 'onbatang.copies';
export function takenCopy(code) {
  try { const ids = JSON.parse(localStorage.getItem(TAKEN_KEY) || '{}')[code]; return Array.isArray(ids) ? ids.filter(isDesignId) : []; } catch { return []; }
}
export function rememberCopy(code, ids) {
  try { const all = JSON.parse(localStorage.getItem(TAKEN_KEY) || '{}'); all[code] = ids; localStorage.setItem(TAKEN_KEY, JSON.stringify(all)); } catch { /* 기억하지 못해도 받은 사본은 그대로다 */ }
}
