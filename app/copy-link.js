// 복사 링크(공용 온바탕): 가이랩 선생님이 내보내기의 "링크 공유"로 만든 링크(…/app/?copy=코드)를 열면
// 그 자료(PPT 파트 여러 개 포함)를 이 브라우저에 사본으로 내려받아 바로 고친다. 로그인은 없다. 보낸 사람의 자료는 바뀌지 않는다.
// 서버: 가이랩의 공개 함수 onbatang_copy_info · onbatang_copy_part(로그인 없이 부르는 열쇠로), 바탕 영상은 onbatang-copy-videos/<코드>/<sha>.
import { cleanRecord, isDesignId, newDesignId } from './designs.js';

export const COPY_PARAM = 'copy';
const GAILAB = { url: 'https://wiaciazdsnhzgwplwjpu.supabase.co', key: 'sb_publishable_uYeQYITkob0HiEHUCaUZPA_w_1GXN_Q' };
const VIDEO_REF = /^([a-f0-9]{32})-d[a-z0-9]{6,24}$/;
/** 링크의 코드(12자리 16진수)만 받는다. */
export const copyCode = (value) => { const code = String(value || '').trim().toLowerCase(); return /^[0-9a-f]{12}$/.test(code) ? code : ''; };

const MESSAGES = {
  onbatang_copy_not_found: '열 수 없는 링크예요. 보낸 선생님이 링크를 껐거나 지웠어요.',
  onbatang_copy_not_ready: '보낸 선생님이 아직 자료를 올리는 중이에요. 잠시 뒤 링크를 다시 열어 주세요.',
  onbatang_copy_changed: '보낸 선생님이 그사이 자료를 새로 올렸어요. 링크를 다시 열어 주세요.',
};
export function copyMessage(error) {
  const text = String(error?.message || error || '');
  for (const [code, message] of Object.entries(MESSAGES)) if (text.includes(code)) return message;
  if (/function .* does not exist|Could not find the function|PGRST202/i.test(text)) return '링크 서버가 아직 준비되지 않았어요. 보낸 선생님께 알려 주세요.';
  if (/fetch|network|Failed|timeout|abort/i.test(text)) return '인터넷 연결이 원활하지 않아요. 잠시 뒤 링크를 다시 열어 주세요.';
  return '링크의 자료를 받지 못했어요. 잠시 뒤 다시 열어 주세요.';
}

/** 링크의 자료 받기: { title, records(서버에 올라간 그대로), videos: Map(영상 열쇠 → Blob) }. onProgress({ completed, total, phase }) */
export function createCopyIntake({ url = GAILAB.url, key = GAILAB.key, fetch: get = globalThis.fetch.bind(globalThis), timeoutMs = 60000 } = {}) {
  const base = String(url).replace(/\/+$/, '');
  async function rpc(name, args) {
    const response = await get(`${base}/rest/v1/rpc/${name}`, { method: 'POST', credentials: 'omit', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(timeoutMs) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(Error(data?.message || `copy_http_${response.status}`), { code: data?.code });
    return data;
  }
  async function video(code, sha) {
    try {
      const response = await get(`${base}/storage/v1/object/onbatang-copy-videos/${code}/${sha}`, { credentials: 'omit', headers: { apikey: key }, signal: AbortSignal.timeout(timeoutMs * 3) });
      return response.ok ? await response.blob() : null;
    } catch (error) { console.warn(error); return null; }
  }
  return {
    async take(code, { onProgress = () => {} } = {}) {
      const info = await rpc('onbatang_copy_info', { p_code: code });
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
