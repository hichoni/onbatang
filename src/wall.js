// 한바탕 장: 참여자(노트북 · 휴대폰)가 로그인 없이 주소 + 숫자 6자리 코드로 들어와 붙인 조각(글 · 링크 · 사진)이 발표 화면에 실시간으로 쌓이는 판. 모두의 조각이 한 바탕에 모인다.
// 판 자체(글 · 참여자 · 사진)는 GBE-AI Lab 서버에 있고, 이 장에는 어느 한바탕인지(id) · 제목 · 참여 코드만 자료로 둔다(서버 주소 · 계정 · 토큰 없음).
// 표지(cover)는 보통 요소(글 · 도형)라 편집기 · 그림 · PDF · PPTX · 공유 링크에서는 '참여 주소 + 코드'가 그대로 보인다.
// GBE-AI Lab 발표에서는 호스트의 wallAction.mount 가 그 자리에 실시간 판을 그린다(app/wall.js).
import { DocumentError, isId, isObject, newId } from './document.js';

export const WALL_ADDRESS = 'gbe.ai.kr/w';
export const WALL_TITLE_MAX = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const invalid = (raw, key) => { throw new DocumentError('INVALID_ACTIVITY', `activity.${key}`, raw); };
const oneLine = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/** 숫자 6자리(첫 자리는 1~9). 띄어쓰기는 빼고 읽는다. 아니면 '' */
export const wallCode = (raw) => { const c = String(raw ?? '').replace(/\s/g, ''); return /^[1-9][0-9]{5}$/.test(c) ? c : ''; };
/** '415 468' */
export const formatWallCode = (raw) => { const c = wallCode(raw); return c ? `${c.slice(0, 3)} ${c.slice(3)}` : ''; };

export function cleanWallActivity(raw) {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) invalid(raw, 'value');
  if (raw.version !== 1 || raw.kind !== 'wall') invalid(raw, 'kind');
  if (!isId(raw.id)) invalid(raw, 'id');
  if (typeof raw.wall !== 'string' || !UUID.test(raw.wall)) invalid(raw, 'wall');
  const title = typeof raw.title === 'string' ? oneLine(raw.title) : '';
  if (!title || Array.from(title).length > WALL_TITLE_MAX) invalid(raw, 'title');
  const code = wallCode(raw.code);
  if (!code) invalid(raw, 'code');
  return { version: 1, kind: 'wall', id: raw.id, wall: raw.wall, title, code };
}

/** 호스트가 만든 한바탕 { id, title, code } 로 장의 자료를 만든다. */
export function newWallActivity({ id: wall, title, code } = {}) {
  return cleanWallActivity({ version: 1, kind: 'wall', id: newId('a'), wall, title, code });
}

const ratio = (value) => (typeof value === 'number' && value >= 0.25 && value <= 4 ? value : 16 / 9);
const text = (value, x, y, w, size, extra = {}) => ({ id: newId('e'), t: 'text', layout: 'slide', text: value, x, y, w, size, color: '#24322d', align: 'c', font: 'gothic', ...extra });
const box = (x, y, w, h, color, shape = 'round') => ({ id: newId('e'), t: 'shape', layout: 'slide', shape, x, y, w, h, color });

/**
 * 표지: 위에 "한바탕", 가운데 제목, 아래에 참여 주소와 큰 코드(노트북은 QR 을 못 찍으니 이것을 친다).
 * 보통 요소라 그대로 고칠 수도 있다(고쳐도 발표의 실시간 판은 장의 자료 wall 을 따른다).
 */
export function wallCover(raw, aspect) {
  const wall = cleanWallActivity(raw), ar = ratio(aspect), wide = ar >= 1.1;
  return {
    bg: '#f5f2e9',
    items: [
      box(50, wide ? 9 : 7, wide ? 16 : 30, wide ? 6 : 4, '#286f62', 'pill'),
      text('한바탕', 50, wide ? 9 : 7, wide ? 16 : 30, wide ? 2.2 : 3, { color: '#ffffff', bold: true }),
      text(wall.title, 50, wide ? 25 : 20, 88, wall.title.length > 30 ? (wide ? 3.6 : 4.4) : (wide ? 4.6 : 5.6), { bold: true }),
      box(50, wide ? 58 : 52, wide ? 70 : 88, wide ? 34 : 26, '#24322d'),
      text(`노트북 · 휴대폰으로 ${WALL_ADDRESS} 에 들어가 코드를 넣어요`, 50, wide ? 47 : 44, wide ? 66 : 84, wide ? 2.3 : 2.8, { color: '#ffffff' }),
      text(formatWallCode(wall.code), 50, wide ? 62 : 55, wide ? 66 : 84, wide ? 9 : 10, { color: '#f2c28a', bold: true }),
      text('GBE-AI Lab 온바탕에서 발표하면 모두의 조각이 이 자리에 실시간으로 모여요', 50, wide ? 86 : 80, 88, wide ? 2 : 2.6, { color: '#5d6b66' }),
    ],
  };
}
