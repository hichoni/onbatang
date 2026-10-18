// 온바탕에 들어 있는 무료 글꼴. 모두 SIL Open Font License 1.1 이라 웹에 넣어 쓰고 함께 나눠도 된다(글꼴만 따로 파는 것은 안 된다).
// 파일은 Google Fonts 의 원본(github.com/google/fonts/ofl)을 글자를 빼거나 바꾸지 않고 웹 글꼴로만 바꾼 것이다(woff2 · 나눔은 woff).
// 사용 조건은 같은 폴더의 <id>-OFL.txt 에 있다. 글꼴은 그 글꼴로 쓴 글이 화면에 나올 때에만 받는다(fonts.js).
// 예전에 저장한 그림의 글꼴 이름(do-hyeon · jua · single-day)은 그대로 이어진다.
const FONTS = [
  ['gowun-batang', '고운바탕', '단정한 바탕체', 'woff2'],
  ['gowun-dodum', '고운돋움', '부드러운 고딕', 'woff2'],
  ['do-hyeon', '도현', '굵고 반듯한 제목', 'woff2'],
  ['jua', '주아', '둥글고 귀여운 제목', 'woff2'],
  ['bagel-fat-one', '베이글', '통통한 제목', 'woff2'],
  ['gugi', '구기', '개성 있는 제목', 'woff2'],
  ['dongle', '동글', '동글동글 귀여운', 'woff2'],
  ['yeon-sung', '연성', '붓으로 쓴 듯한', 'woff2'],
  ['single-day', '싱글데이', '손글씨 느낌', 'woff2'],
  ['poor-story', '서툰이야기', '삐뚤빼뚤 손글씨', 'woff2'],
  ['gamja-flower', '감자꽃', '동글한 손글씨', 'woff2'],
  ['hi-melody', '하이멜로디', '가는 손글씨', 'woff2'],
  ['nanum-pen', '나눔손글씨 펜', '펜으로 쓴 손글씨', 'woff'],
  ['nanum-brush', '나눔손글씨 붓', '붓글씨', 'woff'],
  ['east-sea-dokdo', '동해독도', '거친 붓글씨', 'woff2'],
];

/** startMinican({ fonts }) 에 그대로 주는 글꼴 목록: { id, name, desc, url } */
const EXPORT_FAMILIES = ['Gowun Batang', 'Gowun Dodum', 'Do Hyeon', 'Jua', 'Bagel Fat One', 'Gugi', 'Dongle', 'Yeon Sung', 'Single Day', 'Poor Story', 'Gamja Flower', 'Hi Melody', 'Nanum Pen Script', 'Nanum Brush Script', 'East Sea Dokdo'];
export const ONBATANG_FONTS = FONTS.map(([id, name, desc, ext], index) => ({ id, name, desc, exportFamily: EXPORT_FAMILIES[index], url: new URL(`./fonts/${id}.${ext}`, import.meta.url).href }));
/** 큰 제목에 쓰는 글꼴(템플릿) */
export const ONBATANG_TITLE_FONT = 'do-hyeon';
