// 미니캔 모듈(src/)을 앱에 맞게 정한다: 글꼴은 미니캔을 들여 쓰는 곳이 넘긴 목록, 사진은 디자인 안에 넣은 것(data 주소)만.
// 사진을 디자인 안에 글자로 넣어 두기 때문에, 그림으로 내려받기·배경 제거가 파일 저장소 없이 된다.
import { configure, registerFonts, shrinkImage } from '../src/index.js';
import { ratioOf, aspectOf, PHOTO_MAX_CHARS, MAX_CARD_PHOTOS, MAX_UPLOADS } from './designs.js';
import { SHARED_LAYOUTS, MAX_CARD_ITEMS, BASIC_GROUP } from './layouts.js';
import { setTitleFont } from './templates.js';
import { loadVideo } from './videos.js';
import { loadVoice } from './voices.js';

export { BASIC_GROUP };

// 이 기기에 저장하는 그림이라 사진은 디자인 안에 글자로(data 주소) 들어 있다. 다른 주소의 그림은 받지 않는다.
const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const cleanImage = (img) => (typeof img?.url === 'string' && img.url.length <= 3000000 && DATA_IMAGE.test(img.url) ? { url: img.url } : null);

let fonts = [];
let done = false;
/**
 * 글꼴을 정한다(setupApp 를 처음 부르기 전에 한 번). fonts: [{ id, name, desc?, url }] · titleFont: 템플릿의 큰 제목에 쓸 글꼴의 id.
 * 글꼴 파일은 들여 쓰는 곳이 가진 것만 쓴다(미니캔은 글꼴 파일을 싣지 않는다).
 */
export function useFonts(list = [], titleFont = '') {
  if (done) throw new Error('fonts are fixed once the editor starts');
  fonts = Array.isArray(list) ? list : [];
  setTitleFont(fonts.some((f) => f.id === titleFont) ? titleFont : '');
}

/** 한 번만 정한다. ratio 를 주면 그 비율로 맞춘다(그림을 열 때마다 부른다). */
export function setupApp(ratio = null) {
  if (!done) {
    done = true;
    // 사진은 긴 쪽 1280px 로 넣는다(크게 내려받아도 덜 흐리게).
    // 사진은 한 장에 10장까지 놓고, 그림 한 편에 20개까지 올려 둔다(업로드 칸의 "올린 파일". 더 올리려면 안 쓰는 것을 지운다).
    // 템플릿은 기본 짜임 6종과 주제 테마 9종(layouts.js).
    // 움직임(애니메이션)을 고르는 칸을 켠다: 발표 화면(app.js 의 present)이 그것을 튼다.
    configure({ fonts, cleanImage, maxItems: MAX_CARD_ITEMS, maxPhotos: MAX_CARD_PHOTOS, maxUploads: MAX_UPLOADS, photoEdge: 1280, layouts: SHARED_LAYOUTS, motion: true });
    // 움직임은 발표 화면과, 영상으로 내려받은 파일에 담긴다(움직임 칸 아래의 안내 글).
    configure({ motionNote: '움직임은 "발표"를 누르거나 영상으로 내려받으면 보여요. 그림으로 내려받으면 다 나온 모습이에요.' });
    // 영상 장면의 파일은 이 기기에 따로 둔다(videos.js). 그리거나 트는 곳이 열쇠로 꺼내 쓴다.
    configure({ loadVideo, loadVoice });
    registerFonts(fonts);
  }
  if (ratio) configure({ aspect: typeof ratio === 'object' ? aspectOf(ratio) : ratioOf(ratio).aspect });
}

const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
// 사진 한 장이 너무 크면(기기의 저장 공간을 많이 쓴다) 더 작게 다시 만든다.
// 투명한 곳이 있는 그림(배경을 지운 사진)은 투명함을 살리려고 PNG 인 채로 줄여 본다. 그래도 크면 흰 바탕의 JPG 가 된다.
const fits = (url) => url.length <= PHOTO_MAX_CHARS;
async function fitBlob(blob) {
  let url = await toDataUrl(blob);
  if (fits(url)) return url;
  let last = null;
  for (const max of [700, 600, 500, 420, 350]) {
    const made = await shrinkImage(blob, { max, alpha: true });
    last = made.blob;
    if (made.type === 'image/png' || !/png|webp/.test(blob.type)) break;
  }
  url = await toDataUrl(last);
  if (!fits(url)) throw new Error('photo-too-big');
  return url;
}
/** 편집기의 uploadImage 로 넘긴다: 사진을 디자인 안에 넣을 수 있게 data 주소로 바꾼다(너무 크면 줄인다). */
export async function photoToData({ blob }) {
  return { url: await fitBlob(blob) };
}
