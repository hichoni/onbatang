// 유튜브 영상: 카드에 { t: 'yt', yt: '영상 이름표(11자)', start?: 시작 초, end?: 끝 초, cc?: 자막, full?: 틀 때 화면 가득, loop?: 되풀이 } 로 놓는다. 주소 · 제목 · 썸네일은 저장하지 않는다.
// 꾸미는 화면과 그림 파일에는 썸네일과 재생 단추가 보이고, 발표 화면에서 누르면 그 자리에서 틀어진다(스페이스 바로 틀고 멈춘다).
// 틀 때는 youtube-nocookie.com(개인 정보 보호 모드)을 쓴다. DOM 을 쓰지 않는다(node 에서도 읽힌다).

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)$/i;
/** 시작 시각의 가장 큰 값(초): 12시간 */
export const YT_MAX_START = 43200;

/** 유튜브 영상의 이름표인가(11자: 영문 · 숫자 · - · _). */
export const isYouTubeId = (id) => typeof id === 'string' && ID.test(id);

/** 시작 시각을 초로: 90 · "90" · "90s" · "1m30s" · "1h2m3s". 모르는 값이면 0. */
export function ytStart(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(0, Math.min(YT_MAX_START, Math.floor(raw))) : 0;
  const s = String(raw ?? '').trim().toLowerCase();
  if (/^\d{1,6}s?$/.test(s)) return ytStart(Number.parseInt(s, 10));
  const clock = s.match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{1,2})$/);          // 1:30 · 1:02:03
  if (clock) return ytStart(Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]));
  const m = s.match(/^(?:(\d{1,2})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/);
  if (!m || !s) return 0;
  return ytStart(Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0));
}

/**
 * 붙여 넣은 글에서 유튜브 영상을 찾는다. { id, start } 또는 null.
 * youtu.be/ID · youtube.com/watch?v=ID · /shorts/ID · /embed/ID · /live/ID · m.·music.youtube.com · youtube-nocookie.com 을 받는다.
 * 시작 시각은 t= 나 start= 에서 읽는다(1m30s · 90 · 90s).
 */
export function parseYouTube(text) {
  const raw = String(text ?? '').trim().split(/\s+/).find((w) => /youtu\.?be|youtube/i.test(w)) || '';
  if (!raw || raw.length > 2000) return null;
  let url;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let id = '';
  if (host === 'youtu.be' || host === 'www.youtu.be') id = parts[0] || '';
  else if (HOSTS.test(host)) {
    if (parts[0] === 'watch') id = url.searchParams.get('v') || '';
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1] || '';
  }
  if (!isYouTubeId(id)) return null;
  const start = ytStart(url.searchParams.get('t') || url.searchParams.get('start') || (url.hash.match(/t=([^&]+)/)?.[1] ?? ''));
  return start ? { id, start } : { id };
}

/** 썸네일 그림의 주소(유튜브가 주는 480×360 그림). */
export const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
/** 유튜브에서 여는 주소. */
export const ytWatch = (id, start = 0) => `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`;
/** 영상을 트는 곳(개인 정보 보호 모드)의 주소 앞부분. 조종 신호는 이곳에만 보낸다. */
export const YT_ORIGIN = 'https://www.youtube-nocookie.com';
/** 자막: 'ko' 한국어 · 'en' 영어 · 'on' 영상에 있는 자막(언어는 유튜브가 고른다). 없으면 유튜브 설정대로(보통 꺼짐). */
export const YT_CC = Object.freeze(['ko', 'en', 'on']);
/**
 * 카드 안에서 트는 주소. api: 바깥에서 틀기·멈추기 신호를 받는다(origin 은 신호를 보내는 쪽 주소).
 * 영상이 끝나도 다른 영상을 권하지 않게(rel=0) 하고, 휴대폰에서도 카드 안에서 튼다(playsinline).
 * end: 그 초에서 멈춘다. cc: 자막을 켜고(cc_load_policy) 그 말의 자막 · 화면 글을 고른다(cc_lang_pref · hl).
 */
export const ytEmbed = (id, { start = 0, end = 0, cc = '', api = false, origin = '' } = {}) =>
  `${YT_ORIGIN}/embed/${id}?rel=0&playsinline=1${start ? `&start=${start}` : ''}${end > start ? `&end=${end}` : ''}`
  + `${YT_CC.includes(cc) ? `&cc_load_policy=1${cc === 'on' ? '' : `&cc_lang_pref=${cc}&hl=${cc}`}` : ''}`
  + `${api ? `&enablejsapi=1${origin ? `&origin=${encodeURIComponent(origin)}` : ''}` : ''}`;
/** 시작 시각을 읽기 쉬운 글로: 90 → "1:30". */
export const ytTime = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
