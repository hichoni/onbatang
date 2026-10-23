// 웹사이트 장: 장 하나를 다른 사이트의 실제 화면으로 채운다(발표할 때 그 사이트를 직접 누르고 쓸 수 있다). 화면을 모르는 순수한 함수들.
// 디자인에는 { web: { url } } 만 적는다. 꾸미기 판 · 그림 · PDF 에는 그 사이트의 표지 카드가 그려지고, 발표 화면이 실제 사이트를 연다.
// 사이트가 "다른 화면 안에 넣지 마"라고 막아 두면(X-Frame-Options · frame-ancestors) 어떤 도구로도 넣을 수 없다:
// 잘 알려진 곳은 넣을 때 미리 알리고(blockedSite), 발표 화면에는 늘 "새 창으로 열기"를 둔다.

export const WEB_URL_MAX = 2000;

// 잘 알려진, 다른 화면 안에 넣는 것을 막아 둔 곳(주소의 이름 끝으로 견준다). 막지 않는 하위 주소는 embedOf 가 먼저 바꾼다.
const BLOCKED = [
  ['naver.com', '네이버'], ['daum.net', '다음'], ['kakao.com', '카카오'], ['google.com', '구글 검색'], ['google.co.kr', '구글 검색'],
  ['instagram.com', '인스타그램'], ['facebook.com', '페이스북'], ['x.com', 'X(트위터)'], ['twitter.com', 'X(트위터)'], ['tiktok.com', '틱톡'],
  ['github.com', '깃허브'], ['chatgpt.com', 'ChatGPT'], ['openai.com', 'OpenAI'], ['claude.ai', 'Claude'], ['notion.so', '노션 편집 화면'],
];
// 넣어도 되는 구글 주소(문서 · 시트 · 프레젠테이션 · 설문 · 사이트 · 지도 퍼가기 등).
const GOOGLE_OK = /^(docs|sites|drive|maps|calendar|earth|jamboard)\.google\.com$/;

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } };
const ends = (host, name) => host === name || host.endsWith('.' + name);

/** 주소를 정리한다: https 주소만(앞에 https:// 가 없으면 붙인다), 너무 길면 받지 않는다. 아니면 ''. */
export function cleanWebUrl(raw) {
  let s = String(raw ?? '').trim();
  if (!s || s.length > WEB_URL_MAX || /[\s<>"]/.test(s)) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return '';
    return u.href.length <= WEB_URL_MAX ? u.href : '';
  } catch { return ''; }
}

/** 디자인의 웹사이트 장: { web: { url } } 또는 빈 객체. */
export function designWeb(design) {
  const url = cleanWebUrl(design?.web?.url);
  return url ? { web: { url } } : {};
}

/**
 * 넣을 주소를 그 사이트가 허락하는 "퍼가기" 주소로 바꾼다(알려진 곳만). 그 밖의 주소는 그대로.
 * 구글 프레젠테이션 → /embed · 구글 문서 · 시트 · 드라이브 파일 → /preview · 캔바 디자인 → /view?embed.
 */
export function embedOf(raw) {
  const url = cleanWebUrl(raw);
  if (!url) return '';
  const u = new URL(url), host = u.hostname.toLowerCase();
  if (host === 'docs.google.com') {
    const m = /^\/(presentation|document|spreadsheets|forms)\/(?:u\/\d+\/)?d\/(e\/)?([A-Za-z0-9_-]+)/.exec(u.pathname);
    if (m) {
      const [, kind, published, id] = m, base = `https://docs.google.com/${kind}/d/${published || ''}${id}`;
      if (kind === 'presentation') return `${base}/embed?start=false&loop=false`;
      if (kind === 'forms') return `${base}/viewform?embedded=true`;
      return published ? `${base}/pubhtml?widget=true` : `${base}/preview`;
    }
  }
  if (host === 'drive.google.com') {
    const m = /^\/file\/d\/([A-Za-z0-9_-]+)/.exec(u.pathname);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  }
  if (ends(host, 'canva.com')) {
    const m = /^\/design\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/(?:view|edit|watch)/.exec(u.pathname);
    if (m) return `https://www.canva.com/design/${m[1]}/${m[2]}/view?embed`;
  }
  return url;
}

/** 잘 알려진, 다른 화면 안에 넣는 것을 막아 둔 사이트이면 그 이름. 아니면 ''. (유튜브는 따로 isYouTubePage 로 본다) */
export function blockedSite(url) {
  const host = hostOf(url);
  if (!host) return '';
  if (host.endsWith('google.com') && GOOGLE_OK.test(host)) return '';
  const hit = BLOCKED.find(([name]) => ends(host, name));
  return hit ? hit[1] : '';
}

/** 유튜브의 영상 페이지 주소인가(이것은 웹사이트 장이 아니라 "유튜브 영상"으로 넣는다). */
export function isYouTubePage(url) {
  const host = hostOf(url);
  return ends(host, 'youtube.com') || host === 'youtu.be';
}

/** 화면에 보일 사이트 이름(www. 를 뗀 주소 이름). */
export function webHost(url) {
  return hostOf(url).replace(/^www\./, '');
}
