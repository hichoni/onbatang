// 미니캔의 템플릿 목록: 기본 짜임 6종, 주제 테마 9종의 표지·내용, 행사·연수용 30종.
// DOM 을 쓰지 않는 자료만 둔다(node 에서 그대로 읽힌다).
import { BASIC_LAYOUTS } from './templates.js';
import { THEME_LAYOUTS } from './themes.js';
import { OCCASION_LAYOUTS } from './occasion-layouts.js';

/** 템플릿 칸의 묶음 이름: 기본 템플릿 6종. 주제 테마는 테마마다 묶음 하나다(themes.js). */
export const BASIC_GROUP = '기본 짜임';
/** 편집기의 configure({ layouts }) 에 넘기는 목록. */
export const SHARED_LAYOUTS = [...BASIC_LAYOUTS.map((l) => ({ ...l, group: BASIC_GROUP })), ...THEME_LAYOUTS, ...OCCASION_LAYOUTS];
/** 한 장에 놓는 요소 수. 주제 테마의 표지는 그림 묶음까지 서른 개쯤이라, 그 위에 더 놓을 수 있게 넉넉히 둔다. */
export const MAX_CARD_ITEMS = 40;
