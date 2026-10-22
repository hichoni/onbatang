// 미니캔 앱: 내 그림들 → 새 그림 → 꾸미기(그림의 모양은 꾸미는 화면에서 언제든 바꾼다) → 그림·영상 파일로 내려받기.
// 편집기는 모듈(src/)의 것을 쓴다. 그림은 기기에 저장하며, 선택적 계정/가이X 연결은 호스트가 제공한다.
// 들여 쓰는 곳은 startMinican({ fonts, titleFont, storage, onView, brand, sync })로 시작한다(index.html 이 그 예다).
// 화면의 짜임: 첫 화면(소개·새로 만들기 + 템플릿 + 내 그림)과 꾸미는 화면(위 막대 · 왼쪽 도구 줄과 옆 칸 · 가운데 그림 · 아래 슬라이드 띠).
//             꾸미는 화면은 넓은 화면에서 창을 꽉 채우고(스크롤 없음), 좁은 화면에서는 위에서 아래로 쌓인다(app.css).
import { el, toast, openModal, closeModal } from './ui.js';
import { onbatangLogo,gaiOwl } from './brand.js';
import { onbatangLoading,deferredOnbatangLoading } from './loading.js';
import {bindFilmstrip,bindSlideTray} from './filmstrip.js';
import {orderPages,movePage} from './page-order.js';
import {createLocalPalettes} from './palettes.js';
import {newId,slideNotes,slideDur,shownTopics,cleanTopic,TOPIC_LIMIT,DUR_LIMIT} from '../src/document.js';
import {newPixelActivity,pixelArtCover,pixelArtResult} from '../src/pixel-art.js';
import {mountPixelArt,createPixelArtSetup,pixelArtImage} from './pixel-art.js';
import {createHtmlLesson} from './html-lesson.js';
import {activityDefinitionHash} from './lesson-results.js';
import {openLessonResults} from './lesson-results-ui.js';
import {cleanGaiActivity,gaiAppCover,gaiAppResult} from '../src/gai-app.js';
import {mountGaiApp} from './gai-app.js';
import {createShowTools} from './show-tools.js';
import {PRINT_LAYOUTS,printHtml} from './print.js';
import {encodeGif,GIF_LIMITS} from './gif.js';
import {findText,replaceText} from './find-replace.js';
import {parseOutline,outlineSlides,outlineFromAnswer,OUTLINE_STYLES} from './outline.js';
import {ONBATANG_VERSION} from './version.js';
import {createGaiMaker,gaiLessonContext} from './gai-maker.js';
import {
  createEditor, designView, designToBlob, designToCanvas, configure, settings, reshapeItems, layoutList, layoutItems, icon, cleanDesign, hasMotion, playDesign, playTransition,
  COMBOS, TRANSITIONS, designsToVideo, canMakeVideo, canFilmScenes, filmPlan, MAX_FILM_SECONDS, videoSize, STAYS, DEFAULT_STAY, scenePlayer, dropScene, sceneUrl, youTubePlayers,
  fontFamilyOf, fontList, textLimit, planMotion,
} from '../src/index.js';
import { HERO_ART, HERO_VIEW } from './hero-art.js';
import { startTour, stopTour, tourSeen, markTourSeen, HOME_STEPS, EDITOR_STEPS, NEWS_STEPS, NEWS_KEY } from './tour.js';
import { WHATS_NEW, latestFeature, hasUnseenFeatures, markFeaturesSeen } from './whats-new.js';
// 브라우저가 녹화한 WebM 에는 길이가 적혀 있지 않다. 영상 내려받기에 "길이 적어 넣기"를 쓴다.
import { fixWebmBlob } from './webm.js';
// 영상 장면을 카메라로 찍을 때 쓰는 카메라(찍기 · 멈추기 · 앞뒤 카메라 바꾸기).
import { createCamera, canRecord } from './camera.js';
import {
  RATIOS, RATIO_KEY, NOTES_OPEN_KEY, MAX_DESIGNS, MAX_SLIDES, MAX_NAME, EXPORT_SIZES, DEFAULT_EXPORT, EXPORT_KEY, VIDEO_SIZES, DEFAULT_VIDEO, exportSize, ratioOf, newRecord, nextNumber,
  isBlank, fileName, whenText, sortRecords, addSlide, copySlide, removeSlide, moveSlide,
  libraryOf, dropPhoto, slideMotion, slideVideo, slideExtra, hasVideo, deckVideos, unusedVideos, cleanBrand,
  migrateRecord, aspectOf, canvasRatioOf, copyRecord, withSlideMotion,
} from './designs.js';
import { saveVideo, listVideos, removeVideos } from './videos.js';
import { zipStore } from './zip.js';
import { createPptx } from './pptx.js';
import { listDesigns, getDesign, putDesign, replaceDesignIfUnchanged, removeDesign, setStorageName, storageName, listDesignIssues, getOriginalDesign } from './store.js';
import { setupApp, useFonts, photoToData, BASIC_GROUP } from './setup.js';
import { mergeAccount, createPusher, syncsRecord } from './sync.js';

let app = null;
let onView = () => {};
let resumeOpen = false;       // 새로 고침한 뒤 꾸미던 그림을 다시 열지(startMinican 의 resume)
let onBrandClick = null;
let importAction = null;
let materialAction = null;
let lessonAction = null;
let accountAction = null;
let shareAction = null;
let accountHome = null;
let materialNavigation = null;
let appMaker = null;
// 들여쓰기(embed.html): 다른 앱이 부른 온바탕. { done(id), close() } — 위 막대가 "닫기" · "다 했어요"가 되고, 첫 화면 · 모양 바꾸기 · 발표 · 내려받기 · 영상 · 카메라가 없다.
let embedMode = null;
let activityAuthoring = false; // Host opt-in; playback/result saving never depends on this.
let colorPalettes=null;
let brand = null;                // 들여 쓰는 곳의 표시 { name, logo } (없으면 표시하지 않는다)
let sync = null;                 // 들여 쓰는 곳의 계정 저장(sync.js). 없으면 이 기기에만 저장한다
let pusher = null;
const accountFor = record => !!pusher && syncsRecord(sync, record);
const SAVE_DELAY = 500;       // 마지막으로 고친 뒤 이만큼 지나면 이 기기에 저장한다(ms)
const S = {
  phase: 'boot',              // 'boot'(그림을 읽는 중) · 'home'
  list: null,                 // 내 그림들(null 이면 불러오는 중)
  open: null,
  error: '',                  // 이 창에서는 기기에 저장할 수 없다
  account: '',                // 계정과 맞추기: '' · 'syncing' · 'ok' · 'bad'
};
let homeRail = null;
/** 지금 무슨 화면인지 적어 둔다(app.css 가 이것을 보고 짜임을 바꾼다): 'home' · 'edit'. 들여 쓰는 곳에도 알린다(onView). */
function setView(view) {
  stopTour();
  if (view !== 'home' && homeRail) {
    startScroll = homeRail.track.scrollLeft;
    homeRail.dispose();
    homeRail = null;
  }
  app.dataset.view = view;
  document.body.classList.toggle('cv-editing', view === 'edit');
  document.documentElement.classList.toggle('cv-editing', view === 'edit');      // 꾸미는 동안에는 당겨서 새로 고침이 되지 않게(app.css)
  try { onView(view); } catch (ex) { console.warn(ex); }
}
// 꾸미는 화면이 창을 꽉 채우는 앱 짜임인지(app.css 의 넓은 화면 조건과 같다). 아니면 위에서 아래로 쌓인다.
const WIDE = window.matchMedia('(min-width: 900px) and (min-height: 520px)');

// ---------- 움직임: 화면이 바뀔 때 뚝 끊기지 않게 ----------
// 움직임을 줄이도록 설정한 기기에서는 아무것도 움직이지 않는다(바로 바뀐다).
const CALM = window.matchMedia('(prefers-reduced-motion: reduce)');
let moving = false;           // 화면을 넘기는 중(그동안은 또 넘기지 않는다)
let moveNo = 0;
/**
 * 화면을 통째로 바꾼다(첫 화면 ↔ 꾸미는 화면). 브라우저가 할 수 있으면 앞 화면에서 뒤 화면으로 부드럽게 넘긴다(View Transitions).
 * kind: 'open'(그림을 연다) · 'close'(목록으로 돌아간다) · 'page'(그 밖). 어떻게 움직이는지는 app.css 에 있다.
 * from: 앞 화면에서 뒤 화면의 그림으로 이어질 작은 그림(목록의 그 그림이 커지면서 꾸미는 화면의 그림이 된다).
 */
function transit(update, kind = 'page', from = null) {
  if (!document.startViewTransition || CALM.matches || document.visibilityState !== 'visible') { update(); return; }
  const root = document.documentElement;
  const no = ++moveNo;
  const done = () => {
    if (no !== moveNo) return;             // 그 사이 다른 화면으로 또 넘어갔다: 그쪽이 치운다
    delete root.dataset.cvMove;
    for (const n of document.querySelectorAll('.cv-moving')) n.classList.remove('cv-moving');
  };
  moving = true;
  root.dataset.cvMove = kind;
  if (from) from.classList.add('cv-moving');
  let move = null;
  try {
    move = document.startViewTransition(() => {
      try { update(); } catch (ex) { console.error(ex); throw ex; } finally { moving = false; }
    });
  } catch (ex) {
    console.warn(ex);                      // 넘기기를 시작하지 못했으면 그냥 바꾼다
    moving = false;
    done();
    update();
    return;
  }
  move.ready.catch(() => {});              // 넘기기를 건너뛰어도(창이 가려지는 등) 화면은 바뀐다
  move.finished.then(done, done);
}
/** 화면의 한 조각이 바뀌었을 때 살짝 움직여 보여 준다(끝나면 흔적이 남지 않는다). */
function ease(node, frames, ms = 220) {
  if (!node || !node.animate || CALM.matches) return;
  node.animate(frames, { duration: ms, easing: 'cubic-bezier(.2, .7, .2, 1)' });
}
/** 그림이 바뀌었다: dir 1 이면 오른쪽에서, -1 이면 왼쪽에서 들어오고, 0 이면 제자리에서 나타난다. */
const slideIn = (node, dir = 0) => ease(node, [
  { opacity: dir ? 0 : 0.3, transform: dir ? `translateX(${dir * 24}px)` : 'scale(.985)' },
  { opacity: 1, transform: 'none' },
]);
const stageCard = (O) => O.editor.stage.querySelector('.fe-card');
// 단추에 쓰는 작은 그림: 편집기 모듈의 아이콘 한 세트를 화면 전체가 함께 쓴다(src/icons.js. 선 그림, 글자 색을 따라간다).
const ic = (name) => icon(name, 'cv-ic');
/** 단추의 속: 작은 그림 + 글. 글만 바꿀 때는 relabel 을 쓴다(작은 그림은 그대로 둔다). */
const face = (icon, text) => [ic(icon), el('span', { class: 'cv-lbl', text })];
const labelOf = (btn) => (btn.querySelector('.cv-lbl') || btn).textContent;
const relabel = (btn, text) => { (btn.querySelector('.cv-lbl') || btn).textContent = text; };

/** 첫 화면의 저장 안내(계정이 있으면 계정 상태). */
function accountNote() {
  if (!sync) return [el('b', { text: '이 기기에 저장돼요.' }), ' 완성한 그림은 내려받아 두세요.'];
  if (S.account === 'bad') return [el('b', { text: '계정에 연결하지 못했어요.' }), ' 이 기기에는 저장돼요. 새로 고침하면 다시 맞춰요.'];
  if (S.account === 'syncing') return [el('b', { text: '계정과 맞추는 중이에요…' })];
  return [el('b', { text: '내 계정에 저장돼요.' }), ' 다른 기기에서도 열려요. 바탕에 깐 영상은 이 기기에만 있어요.'];
}
// ---------- 시작 ----------
/** 내 그림들을 이 기기에서 다시 모은다. */
async function refresh() {
  const resume = S.phase === 'boot' && resumeOpen ? readOpen() : null;
  S.list = null;
  render();
  if (S.phase === 'boot') await recoverDrafts();
  try {
    S.list = await listDesigns();
    S.error = '';
  } catch (ex) {
    console.error(ex);
    S.list = [];
    S.error = '이 창에서는 기기에 저장할 수 없어요. 그림을 만들 수는 있지만 새로 고침하면 사라져요. 다 만들면 바로 내려받아요.';
  }
  S.phase = 'home';
  // 새로 고침하기 전에 꾸미던 그림이 있으면 첫 화면을 거치지 않고 그 그림 · 그 장을 다시 연다.
  const again = resume && S.list.find((r) => r.id === resume.id);
  if (again && !S.open) {
    try {
      openDesign(again, false);
      if (Number.isSafeInteger(resume.at) && resume.at > 0 && resume.at < S.open.slides.length) goSlide(S.open, resume.at);
      syncAccount();
      return;
    } catch (ex) {
      console.warn(ex);
      forgetOpen();
    }
  }
  render();
  syncAccount();
}
/** 계정이 있으면 이 기기의 그림과 계정의 그림을 맞춘다(sync.js). 첫 화면에 있을 때만 목록을 다시 그린다. */
async function syncAccount() {
  if (!sync || S.error) return;
  S.account = 'syncing';
  if (!S.open) render();
  try {
    await mergeAccount(sync, { list: listDesigns, put: putDesign, remove: removeDesign });
    S.account = 'ok';
    if (!S.open) S.list = await listDesigns();
  } catch (ex) {
    console.warn(ex);
    S.account = 'bad';
  }
  if (!S.open) render();
}
/** 계정에 다 올렸을 때 꾸미는 화면의 저장 상태를 알린다. */
function pushed(id, ok) {
  const O = S.open;
  if (!O || O.record.id !== id || !accountFor(O.record)) return;
  O.accountOk = ok;
  if (O.dirty) return;
  setStatus(O, ok ? '계정에 저장했어요' : '계정에 올리지 못했어요 · 이 기기에는 저장됐어요', ok ? 'ok' : '');
}
/** 목록의 그 그림을 새 기록으로 바꿔 끼운다(없으면 맨 앞에 더한다). */
function upsert(record) {
  if (!S.list) return;
  const at = S.list.findIndex((r) => r.id === record.id);
  if (at >= 0) S.list[at] = record; else S.list.unshift(record);
  S.list = sortRecords(S.list);
}

// 지난번에 고른 그림 모양(새 그림은 그 모양으로 시작한다). 기억하지 못하는 창에서는 정사각형.
function lastRatio() {
  try { return ratioOf(localStorage.getItem(RATIO_KEY)).id; } catch { return RATIOS[0].id; }
}
function keepRatio(id) {
  try { localStorage.setItem(RATIO_KEY, id); } catch { /* 기억하지 못해도 괜찮다 */ }
}

// ---------- 첫 화면: 소개 + 새로 만들기(빈 그림 · 템플릿) 띠 · 내 그림 ----------
// 대문의 "만들 수 있는 것": [작은 그림, 이름, 색]
const FEATS = [
  ['copy', '카드', 'mint'],
  ['image', '포스터', 'sky'],
  ['screen', '발표 자료', 'lilac'],
  ['template', '다양한 틀', 'sun'],
];
// 첫 화면의 "템플릿으로 시작하기"는 두 칸이다: 주제 테마(표지 9종, 발표 화면 모양) · 기본 짜임(6종).
const STARTS = [['theme', '주제 테마'], ['basic', '기본 짜임']];
let startTab = 'theme';
let startScroll = 0;
/** 한 줄 템플릿: 터치·트랙패드·키보드는 브라우저의 가로 스크롤을 그대로 쓴다. */
function mountStartRail(track, previous, next) {
  let frame = 0;
  const update = () => {
    frame = 0;
    if (!track.isConnected) return;
    const edge = Math.max(0, track.scrollWidth - track.clientWidth);
    previous.disabled = track.scrollLeft <= 1;
    next.disabled = track.scrollLeft >= edge - 1;
    startScroll = track.scrollLeft;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const scroll = (direction) => {
    track.scrollBy({ left: direction * Math.max(150, track.clientWidth * .8), behavior: CALM.matches ? 'auto' : 'smooth' });
  };
  previous.addEventListener('click', () => scroll(-1));
  next.addEventListener('click', () => scroll(1));
  track.addEventListener('scroll', schedule, { passive: true });
  track.addEventListener('focusin', (event) => {
    const card = event.target.closest('.cv-start');
    if (!card) return;
    const bounds = track.getBoundingClientRect();
    const item = card.getBoundingClientRect();
    const shift = item.left < bounds.left + 4 ? item.left - bounds.left - 4
      : item.right > bounds.right - 4 ? item.right - bounds.right + 4 : 0;
    // 초점을 옮길 때는 즉시 노출한다. 위아래 페이지 위치는 바꾸지 않는다.
    if (shift) track.scrollBy({ left: shift, behavior: 'auto' });
    schedule();
  });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  if (observer) observer.observe(track);
  else window.addEventListener('resize', schedule);
  track.scrollLeft = startScroll;
  update();
  return { track, dispose() {
    observer?.disconnect();
    window.removeEventListener('resize', schedule);
    if (frame) cancelAnimationFrame(frame);
  } };
}
// 템플릿의 작은 그림의 모양: 테마는 그것으로 시작할 때의 모양(16:9), 기본 짜임은 정사각형.
const thumbAspect = (layout) => (layout?.ratio ? ratioOf(layout.ratio).aspect : 1);
function layoutThumb(layout) {
  const aspect = thumbAspect(layout);
  configure({ aspect });
  return fitView(designView({ bg: layout.bg, items: layoutItems(layout.id) }), aspect);
}
/**
 * 새 그림을 연다. layoutId 를 주면 그 템플릿을 깔고 시작한다. 모양은 템플릿에 적힌 것(테마는 16:9), 없으면 지난번에 고른 것.
 * tile 은 누른 템플릿 단추(그 작은 그림이 커지면서 열린다).
 */
function startNew(layoutId = '', tile = null) {
  if (S.open || !S.list || moving) return;
  const layout = layoutId ? layoutList().find((l) => l.id === layoutId) : null;
  const record = newRecord(layout?.ratio || lastRatio(), nextNumber(S.list || []));
  if (layout) {
    setupApp(record.ratio);          // 템플릿의 도형 높이는 그림의 모양에 맞춰 만들어진다
    record.slides = [{ bg: layout.bg, items: layoutItems(layout.id) }];
  }
  // 작은 그림과 새 그림의 모양이 같을 때에만 그 그림을 키워서 연다(모양이 다르면 찌그러져 보인다).
  const from = Math.abs(aspectOf(record) - thumbAspect(layout)) < 0.01 ? tile?.querySelector('.fe-card') : null;
  transit(() => { if (!S.open) openDesign(record, true); }, 'open', from);
}

// 대문 오른쪽의 그림: 꾸미는 화면을 본뜬 창(가운데는 주제 테마의 표지, 오른쪽은 다른 표지들)과 둘레에 떠 있는 카드들.
// 장식이라 화면 읽기 프로그램에는 감춘다. 그림 묶음(art.js)의 그림은 불러온 뒤에 채운다.
const HAND = /손글씨|손 글씨|편안한/;
// ---------- 사용법 안내(tour.js) ----------
// 첫 화면: "사용법 보기" 단추(처음 온 기기에서는 살짝 반짝인다). 꾸미는 화면: 위 막대의 ? 단추.
function tourButton(where, O = null) {
  const home = where === 'home';
  const btn = el('button', {
    class: `btn ${home ? 'btn-ghost cv-tour-btn' : 'btn-ghost cv-tour-btn icon'}${home && !tourSeen('home') ? ' invite' : ''}`, type: 'button',
    title: '사용법 보기', 'aria-label': '사용법 보기', dataset: { onbaTour: where },
    onClick: () => {
      markTourSeen(where);
      btn.classList.remove('invite');
      if (home) startTour({ steps: HOME_STEPS }); else editorTour(O);
    },
  }, el('span', { class: 'cv-tour-q', 'aria-hidden': 'true', text: '?' }), home ? el('span', { text: '사용법 보기' }) : null);
  return btn;
}
// "새 기능" 단추(첫 화면): 이 기기에서 아직 보지 않은 새 기능이 있으면 점을 찍는다.
function newsButton() {
  const btn = el('button', {
    class: `btn btn-ghost cv-news-btn${hasUnseenFeatures() ? ' unseen' : ''}`, type: 'button', dataset: { whatsNew: '' }, title: '온바탕에 새로 생긴 기능 보기',
    onClick: () => { btn.classList.remove('unseen'); openWhatsNew(); },
  }, el('span', { class: 'cv-news-dot', 'aria-hidden': 'true' }), el('span', { text: '새 기능' }));
  return btn;
}
// 새로 생긴 기능: 기능마다 무엇인지 · 언제 쓰는지 · 어떻게 하는지(whats-new.js).
function openWhatsNew() {
  markFeaturesSeen();
  const newest = latestFeature();
  const box = el('section', { class: 'cv-news-box', tabindex: '-1', 'aria-labelledby': 'cv-news-title', onKeydown: escCloses },
    el('h2', { id: 'cv-news-title', text: '온바탕에 새로 생긴 기능' }),
    el('p', { class: 'cv-down-note', text: '무엇인지 · 언제 쓰는지 · 어떻게 하는지 차례로 적었어요. 꾸미는 화면의 ? 단추로 사용법 안내도 볼 수 있어요.' }),
    el('div', { class: 'cv-news-list' }, ...WHATS_NEW.map((f) => el('article', { class: 'cv-news-item', dataset: { feature: f.id } },
      el('h3', {}, el('span', { text: f.name }), f.since === newest ? el('small', { class: 'cv-news-new', text: '새로' }) : null),
      el('p', { class: 'cv-news-what', text: f.what }),
      el('p', { class: 'cv-news-when' }, el('b', { text: '이럴 때 · ' }), f.when),
      el('ol', { class: 'cv-news-how' }, ...f.how.map((t) => el('li', { text: t })))))),
    el('div', { class: 'row cv-news-foot' }, el('button', { class: 'btn btn-primary', type: 'button', onClick: closeModal }, '닫기')));
  openModal(box, { wide: true });
  requestAnimationFrame(() => box.focus({ preventScroll: true }));
}
// 꾸미는 화면의 안내: 단계마다 옆 칸에 그 도구를 펼친다(접혀 있으면 편다).
function editorTour(O, { news = false } = {}) {
  startTour({
    steps: news ? NEWS_STEPS : EDITOR_STEPS,
    ...(news ? { title: '온바탕 새 기능' } : {}),
    show: (view) => {
      if (O.closed) return;
      const tab = O.editor.panel.querySelector(`.fe-tab[data-tab="${view}"]`);
      if (!tab) return;
      if (!tab.classList.contains('on')) tab.click();
      else if (O.shell?.classList.contains('folded')) O.shell.querySelector('.cv-fold')?.click();
    },
  });
}

function heroShowcase() {
  const covers = layoutList().filter((l) => l.cover);
  if (!covers.length) return null;
  const [main, ...more] = covers;
  const art = (name, cls) => el('span', { class: `cv-demo-art ${cls}`,
    html: `<svg viewBox="${HERO_VIEW}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${HERO_ART[name]}</svg>` });
  const hand = fontList().find((f) => HAND.test(`${f.name} ${f.desc || ''}`));
  const handFont = hand ? `"${fontFamilyOf(hand.id)}", cursive` : '';
  const note = (cls, lines) => {
    const node = el('p', { class: `cv-demo-note ${cls}` }, ...lines.flatMap((t, i) => (i ? [el('br'), ...[t].flat()] : [t].flat())));
    if (handFont) node.style.fontFamily = handFont;
    return node;
  };
  const cursor = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v16l4.5-4.2 2.9 6.4 2.8-1.3-2.9-6.2H18z" fill="#141933" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const win = el('div', { class: 'cv-demo-win' },
    el('div', { class: 'cv-demo-top' },
      el('b', { class: 'cv-demo-brand' }, onbatangLogo()),
      el('span', { class: 'cv-demo-undo' }, ic('undo'), ic('redo')),
      el('span', { class: 'cv-demo-down' }, ic('download'), '내려받기')),
    el('div', { class: 'cv-demo-body' },
      el('ul', { class: 'cv-demo-rail' }, ...[['template', '틀'], ['text', '글'], ['shapes', '꾸미기'], ['upload', '내 자료'], ['motion', '움직임']]
        .map(([pic, text]) => el('li', {}, ic(pic), el('span', { text })))),
      el('div', { class: 'cv-demo-canvas' }, el('span', { class: 'cv-demo-card' }, layoutThumb(main)),
        el('span', { class: 'cv-demo-pick' }, el('i'), el('i'), el('i'), el('i')), el('span', { class: 'cv-demo-cursor', html: cursor })),
      el('div', { class: 'cv-demo-side' }, ...more.slice(0, 3).map((l) => el('span', { class: 'cv-demo-thumb' }, layoutThumb(l))))));
  return el('div', { class: 'cv-demo', 'aria-hidden': 'true' },
    el('span', { class: 'cv-demo-blob one' }), el('span', { class: 'cv-demo-blob two' }),
    win,
    el('span', { class: 'cv-demo-float cv-demo-photo' }, el('i')),
    el('span', { class: 'cv-demo-float cv-demo-t', text: 'T' }),
    el('span', { class: 'cv-demo-float cv-demo-shapes' }, el('i'), el('i'), el('i')),
    el('span', { class: 'cv-demo-float cv-demo-chart' }, el('i'), el('i'), el('i'), el('i')),
    art('smiling-face-with-smiling-eyes', 'cv-demo-smile'),
    art('sparkles', 'cv-demo-spark'),
    art('seedling', 'cv-demo-plant'),
    note('cv-demo-say', ['아이디어를', '멋진 결과물로!']),
    note('cv-demo-card-note', ['만드는 즐거움이', ['더 넓은 가능성으로 ', el('span', { class: 'cv-demo-heart', text: '♡' })]]));
}

// 처음 불러온 그림들은 살짝 떠오르며 나타난다(그 뒤에 다시 그릴 때는 움직이지 않는다).
let wasLoading = true;
function render() {
  if (S.open || accountHome) return;
  const oldRail = app.querySelector('.cv-start-list');
  if (oldRail?.dataset.starts === startTab) startScroll = oldRail.scrollLeft;
  const focused = document.activeElement?.closest('.cv-start');
  const focusedLayout = oldRail?.contains(focused) ? focused.dataset.layout : '';
  const focusedControl = document.activeElement?.closest('.cv-start-arrow, .cv-seg-btn');
  const focusedSelector = app.contains(focusedControl) ? focusedControl.classList.contains('cv-start-prev') ? '.cv-start-prev'
    : focusedControl.classList.contains('cv-start-next') ? '.cv-start-next'
      : `.cv-seg-btn[data-starts="${CSS.escape(focusedControl.dataset.starts)}"]` : '';
  homeRail?.dispose();
  homeRail = null;
  setView('home');
  const loading = S.list === null;
  const list = S.list || [];
  const full = list.length >= MAX_DESIGNS;
  // 주제 테마는 표지만 보여 준다(내용 장은 꾸미는 화면의 템플릿 칸에서 넣는다). 이름은 테마의 이름.
  const starts = startTab === 'theme'
    ? layoutList().filter((l) => l.cover).map((l) => [l, l.group])
    : layoutList().filter((l) => l.group === BASIC_GROUP).map((l) => [l, l.name]);
  const newBtn = (cls) => el('button', { class: `btn ${cls}`, type: 'button', disabled: loading || full, onClick: () => startNew() }, ic('plus'), el('span', { text: '새 그림 만들기' }));

  // ① 대문: 왼쪽은 이름 · 한 줄 소개 · 만들 수 있는 것 · 시작 단추, 오른쪽은 꾸미는 화면을 본뜬 그림(실제 템플릿과 그림 묶음으로 그린다).
  const title = el('h1', { id: 'onba-title', class: 'cv-home-title' }, onbatangLogo());
  const start = el('button', { class: 'btn cv-cta cv-new-btn', type: 'button', disabled: loading || full, onClick: () => startNew() },
    el('span', { text: '내 생각 펼치기' }), ic('right'));
  const hero = el('section', { class: 'cv-hero', 'aria-labelledby': 'onba-title' }, el('div', { class: 'cv-hero-in' },
    el('div', { class: 'cv-hero-text' },
      el('div', { class: 'cv-home-heading' }, title),
      el('p', { class: 'cv-hero-kicker' }, '생각을 펼치는', el('br'), el('span', { class: 'cv-kick-color', text: '따뜻한 디자인 공간.' })),
      el('p', { class: 'cv-hero-lead' }, '글·도형·사진으로 나답게 만들어요.', el('br'), '작은 카드부터 포스터, 발표 자료까지.'),
      el('ul', { class: 'cv-feats', 'aria-label': '만들 수 있는 것' }, ...FEATS.map(([pic, text, tone]) => el('li', { class: `cv-feat ${tone}` },
        el('span', { class: 'cv-feat-icon', 'aria-hidden': 'true' }, ic(pic)), el('span', { text })))),
      el('div', { class: 'cv-hero-go' }, start, tourButton('home'), newsButton(),
        importAction && !importAction.hideHome ? el('button', { class: 'btn cv-import-btn', type: 'button', disabled: loading, onClick: async (event) => {
          const button = event.currentTarget; button.disabled = true;
          try { await importAction.open(); } catch (error) { console.warn(error); toast('가져오기 화면을 열지 못했어요. 다시 시도해주세요.'); }
          finally { button.disabled = false; }
        } }, importAction.label) : null,
        accountAction ? el('button',{class:'btn cv-account-btn',type:'button',disabled:loading,dataset:{accountAction:''},onClick:()=>openAccountFromHome()},accountAction.label) : null,
        full ? el('p', { class: 'cv-hero-full', text: `그림은 ${MAX_DESIGNS}장까지 저장돼요. 안 쓰는 그림을 지워 주세요.` }) : null),
      el('p', { class: 'cv-hero-tag', text: `작은 생각도 멋진 작품이 되도록 · ${sync ? '내 계정에 자동 저장' : '이 기기에 자동 저장'}` })),
    heroShowcase()));

  // 템플릿은 소개 카드 아래의 같은 본문 폭에서 골라 바로 시작한다.
  const track = el('div', { id: 'onba-template-list', class: `cv-start-list ${startTab}`, dataset: { starts: startTab }, role: 'group', 'aria-label': `${STARTS.find(([id]) => id === startTab)[1]} 틀` }, ...starts.map(([l, name]) => el('button', {
    class: 'cv-start', type: 'button', disabled: loading || full, dataset: { layout: l.id }, onClick: (e) => startNew(l.id, e.currentTarget),
  }, el('span', { class: 'cv-start-view', 'aria-hidden': 'true' }, layoutThumb(l)), el('b', { text: name }))));
  const previous = el('button', { class: 'cv-start-arrow cv-start-prev', type: 'button', disabled: true, 'aria-label': '이전 틀 보기', 'aria-controls': 'onba-template-list', title: '이전 틀 보기' }, ic('left'));
  const next = el('button', { class: 'cv-start-arrow cv-start-next', type: 'button', 'aria-label': '다음 틀 보기', 'aria-controls': 'onba-template-list', title: '다음 틀 보기' }, ic('right'));
  const templates = el('section', { class: 'cv-starts', 'aria-labelledby': 'onba-templates' },
      el('div', { class: 'cv-starts-head' }, el('h2', { id: 'onba-templates', text: '틀로 시작하기' }),
        el('div', { class: 'cv-starts-tools' },
        el('div', { class: 'cv-seg', role: 'group', 'aria-label': '틀 종류' }, ...STARTS.map(([id, name]) => el('button', {
          class: `cv-seg-btn${startTab === id ? ' on' : ''}`, type: 'button', 'aria-pressed': String(startTab === id), dataset: { starts: id },
          onClick: () => {
            if (startTab === id) return;
            startTab = id;
            startScroll = 0;
            render();
            document.querySelector('.cv-seg-btn.on')?.focus({ preventScroll: true });   // 다시 그리면서 사라진 초점을 고른 단추에 돌려놓는다
          },
        }, name))),
          el('div', { class: 'cv-start-arrows', role: 'group', 'aria-label': '틀 좌우 이동' }, previous, next))),
      track);

  // ② 내 그림: 불러온다 → 없으면 없다고 알리고 새로 만들게 한다. 그림은 이 기기에만 저장된다.
  const arrive = wasLoading && !loading;
  wasLoading = loading;
  const mine = el('section', { class: `cv-mine${arrive ? ' cv-arrive' : ''}` },
    el('div', { class: 'cv-sec-head' },
      el('h2', { text: loading || !list.length ? '내 그림' : `내 그림 ${list.length}장` }),
      loading ? null : el('div', { class: 'cv-account solo' },
        el('span', { class: 'cv-account-icon', 'aria-hidden': 'true' }, ic(sync ? 'cloud' : 'screen')),
        el('span', { class: 'cv-account-text' }, ...accountNote()))));
  if (loading) {
    mine.append(onbatangLoading({title:'내 그림을 불러오고 있어요',detail:sync?'이 기기와 계정의 저장 자료를 확인해요.':'이 기기에 저장된 그림을 확인해요.'}).node);
  } else if (!list.length) {
    mine.append(el('div', { class: 'cv-state cv-empty', role: 'status' },
      el('span', { class: 'cv-state-icon', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')),
      el('b', { text: sync ? (S.account === 'syncing' ? '계정의 그림을 맞추는 중이에요…' : '저장된 그림이 없어요') : '이 기기에 저장된 그림이 없어요' }),
      el('span', { class: 'muted', text: '새 그림을 만들면 여기에 저절로 저장돼요. 위의 틀로 시작해도 좋아요.' }),
      newBtn('btn-primary cv-empty-btn')));
  } else {
    mine.append(el('div', { class: 'cv-list' }, ...list.map((r) => itemCard(r))));
  }
  if (S.error) mine.append(el('p', { class: 'warn-box', text: S.error }));
  for (const issue of listDesignIssues()) mine.append(el('div', { class: 'warn-box', role: 'status' },
    el('p', { text: `${issue.name || '그림'}: 지금 열 수 없는 자료예요 (${issue.code}). 원본은 그대로 남아 있어요.` }),
    el('button', { class: 'btn', type: 'button', onClick: async () => {
      try { saveBlob(new Blob([JSON.stringify(await getOriginalDesign(issue.id), null, 2)], { type: 'application/json' }), 'onbatang-original.json'); }
      catch { toast('원본을 읽지 못했어요. 다시 시도해 주세요.'); }
    } }, '원본 내려받기')));

  app.replaceChildren(hero, el('div', { class: 'cv-home' }, templates, mine,
    el('p', { class: 'cv-note', text: `${sync ? '그림은 이 기기에 먼저 저장한 뒤 내 계정에도 저장돼요. 바탕에 깐 영상만 이 기기에 남아요.' : '그림은 이 기기(이 브라우저)에만 저장돼요(서버로 올라가지 않아요). 다른 기기에서는 보이지 않으니, 다 만든 그림은 내려받아 두세요.'} 그림의 모양(정사각형·세로·가로·길게)은 꾸미는 화면에서 언제든 바꿀 수 있어요.` }),
    // 지금 쓰는 온바탕의 버전: 맨 아래에 작고 옅게(새 배포가 들어왔는지 알 수 있게).
    el('p', { class: 'cv-version', dataset: { onbatangVersion: ONBATANG_VERSION }, text: `온바탕 v${ONBATANG_VERSION}` })));
  homeRail = mountStartRail(track, previous, next);
  if (focusedLayout) track.querySelector(`[data-layout="${CSS.escape(focusedLayout)}"]`)?.focus({ preventScroll: true });
  else if (focusedSelector) templates.querySelector(focusedSelector)?.focus({ preventScroll: true });
}

// 작은 그림을 4:3 칸 안에 찌그러지지 않게 넣는다: 칸보다 납작한 그림은 너비에, 아니면 높이에 맞춘다(app.css 의 .is-wide).
const THUMB_BOX = 4 / 3;
function fitView(view, aspect) {
  view.style.setProperty('--fe-ratio', String(aspect));
  view.style.aspectRatio = String(aspect);
  view.classList.toggle('is-wide', aspect >= THUMB_BOX);
  return view;
}
function thumb(record) {
  setupApp();
  return fitView(designView(record.slides[0], { empty: '빈 그림' }), aspectOf(record));
}
function itemCard(record) {
  const del = el('button', {
    class: 'cv-item-del', type: 'button', title: '이 그림 지우기',
    onClick: async () => {
      if (del.dataset.armed !== '1') {
        del.dataset.armed = '1';
        relabel(del, '한 번 더 누르면 지워져요');
        del.classList.add('armed');
        card.classList.add('arming');        // 그동안 다른 단추를 감춘다(같은 자리를 한 번 더 눌렀을 때 "꾸미기"가 눌리지 않게)
        setTimeout(() => { if (del.isConnected) { del.dataset.armed = ''; relabel(del, '지우기'); del.classList.remove('armed'); card.classList.remove('arming'); } }, 4000);
        return;
      }
      busy(true);
      try {
        await removeDesign(record.id);
        if (pusher) pusher.cancel(record.id);
        if (sync && syncsRecord(sync, record)) sync.drop(record.id).catch((ex) => { console.warn(ex); toast('계정에서는 지우지 못했어요. 새로 고침하면 다시 나타날 수 있어요.', 5000); });
      } catch (ex) {
        console.error(ex);
        toast('지우지 못했어요. 새로 고침하고 다시 해 봐요.', 4000);
        busy(false);
        return;
      }
      if (S.list) S.list = S.list.filter((r) => r.id !== record.id);
      tidyVideos(record.id, [], deckVideos(record.slides));      // 그 그림에 딸린 영상 파일도 이 기기에서 지운다
      toast('그림을 지웠어요.');
      render();
    },
  }, ...face('trash', '지우기'));
  const open = (btn) => openEntry(record, btn);
  const edit = el('button', { class: 'btn btn-primary small cv-item-open', type: 'button', onClick: () => open(edit) }, '꾸미기');
  const copy = el('button', { class: 'btn small', type: 'button', disabled: (S.list || []).length >= MAX_DESIGNS, onClick: async () => {
    copy.disabled = true;
    try {
      const made = await putDesign({ ...copyRecord(await getDesign(record.id) || record), updatedAt: Date.now() });
      upsert(made); if (accountFor(made)) pusher.queue(made); render();
    } catch (ex) { toast(`복사하지 못했어요 (${ex.code || '저장소 오류'}).`); copy.disabled = false; }
  } }, '복사');
  const busy = (on) => { for (const b of [edit, del, card.querySelector('.cv-thumb')]) if (b) b.disabled = on; };
  const pages = record.slides.length;
  const card = el('article', { class: 'cv-item', dataset: { id: record.id } },
    el('button', { class: 'cv-thumb', type: 'button', 'aria-label': `${record.name} 열기`, onClick: () => open(edit) }, thumb(record),
      pages > 1 ? el('span', { class: 'cv-pages', text: `${pages}장` }) : null),
    el('div', { class: 'cv-item-body' },
      el('span', { class: 'cv-item-name', text: record.name }),
      el('span', { class: 'cv-item-when' }, el('span', { text: ratioOf(record.ratio).name }), el('span', { text: whenText(record.updatedAt) })),
      el('div', { class: 'cv-item-row' }, edit, copy, del)));
  return card;
}
// 목록의 그림을 연다. 이 기기에 저장된 가장 새것을 읽는다(읽지 못하면 목록이 기억하는 것).
async function openEntry(entry, btn) {
  if (S.open || moving) return;
  btn.disabled = true;
  let record = entry;
  try { record = (await getDesign(entry.id)) || entry; } catch (ex) { console.warn(ex); toast(`열지 못했어요 (${ex.code || '저장소 오류'}). 원본은 그대로 남아 있어요.`); btn.disabled = false; return; }
  const ready = () => !S.open && S.phase === 'home';
  if (!ready()) return;
  upsert(record);
  // 목록의 그 작은 그림이 커지면서 꾸미는 화면의 그림이 된다.
  transit(() => { if (ready()) openDesign(record, false); }, 'open', btn.closest('.cv-item')?.querySelector('.cv-thumb .fe-card'));
}

// ---------- 꾸미기 ----------
function openDesign(record, isNew) {
  record = migrateRecord(record);
  setupApp(record);
  const O = {
    record: { ...record }, persistedRecord:structuredClone(record), timer: 0, dirty: false, saved: !isNew, closed: false, editor: null, status: null, nameInput: null,
    // 슬라이드: slides 는 모든 장, at 은 지금 꾸미는 장의 번호. 편집기는 한 번에 한 장만 꾸민다(장을 바꿀 때 바꿔 끼운다).
    slides: record.slides.map((d) => ({ bg: d.bg, items: d.items, ...slideExtra(d) })), at: 0, strip: null, thumbTimer: 0, shapes: null, shell: null, alert: null,
  };
  delete O.record.slides;                // 슬라이드는 O.slides 가 맡는다(저장할 때 다시 넣는다)
  S.open = O;
  rememberOpen(O);
  const first = isNew ? '꾸미기 시작하면 저절로 저장돼요' : accountFor(record) ? '저장돼 있어요' : '이 기기에 저장돼 있어요';
  O.status = el('span', { class: 'cv-status', role: 'status', text: first, title: first });
  // 저장하지 못했을 때는 위 막대 아래에 띠로 한 번 더 알린다(위 막대의 글은 자리가 좁아 잘릴 수 있다).
  O.alert = el('p', { class: 'cv-alert', 'aria-hidden': 'true', hidden: true });
  const name = O.nameInput = el('input', {
    class: 'cv-name', type: 'text', value: record.name, maxlength: String(MAX_NAME), 'aria-label': '그림 이름', title: '그림 이름(눌러서 바꿔요)',
    onInput: () => { O.record.name = name.value; touched(O); },
    onKeydown: (e) => { if (e.key === 'Enter') name.blur(); },
  });
  O.editor = createEditor({
    colorPalettes,
    design: O.slides[0],
    onChange: () => touched(O),
    uploadImage: photoToData,
    documentImport: importAction?.editorLabel ? {
      label: importAction.editorLabel,
      description: importAction.editorDescription || '지금 그림을 저장한 뒤 PPT 자료를 가져와요.',
      open: () => importFromEditor(O),
    } : null,
    notify: toast,
    canPaste: item => [...(item.assetRefs || []), ...(item.source?.assetId ? [item.source.assetId] : [])]
      .every(id => O.record.assets.some(asset => asset.id === id)),
    // 올린 파일 목록: 이 그림에 올린 사진들(슬라이드가 여러 장이어도 목록은 하나다). 저장할 때 편집기에서 꺼내 기록에 넣는다.
    uploads: libraryOf(record.uploads, record.slides),
    // 지금 꾸미는 장 말고 다른 장에서 그 사진을 쓴 곳의 수("쓰는 중" 표시와, 지우기 전에 알려 줄 때 쓴다).
    usedElsewhere: (url) => O.slides.reduce((n, d, i) => n + (i === O.at ? 0 : d.items.filter((it) => it && it.t === 'image' && it.url === url).length), 0),
    // 올린 파일을 지웠다: 다른 장에서 쓴 것도 지운다(지금 장은 편집기가 지운다). 띠의 작은 그림을 다시 그린다.
    // 움직임 칸의 "모든 장에 똑같이"
    onMotionAll: (motion) => applyMotionAll(O, motion),
    // 카드의 빈 곳(과 그 둘레)을 우클릭하면 나오는 장(슬라이드) 메뉴
    slideMenu: () => slideMenuGroups(O),
    outline: { open: () => openOutline(O) },
    // 영상 장면(그 장의 바탕에 까는 영상): 파일은 이 기기에 두고(videos.js), 어느 그림에 딸린 것인지 함께 적는다.
    // 저장하지 못하면 오류가 나고, 편집기가 영상을 넣지 않은 채 알린다(저장되지 않은 영상을 그림에 적어 두지 않는다).
    saveVideo: embedMode ? null : (made) => saveVideo({ blob: made.blob, design: O.record.id, seconds: made.seconds }),
    createCamera: !embedMode && canRecord() ? createCamera : null,
    videoNote: '영상 파일은 이 기기에만 저장돼요. 다른 기기에서 이 그림을 열면 영상 자리가 비어 보여요.',
    videoHint: canFilmScenes() ? '영상은 "발표"할 때와 영상으로 내려받을 때 소리와 함께 틀어져요. 그림으로 내려받으면 첫 모습이 나와요.' : '',
    onRemoveUpload: (img) => {
      const next = dropPhoto(O.slides, img.url);
      if (next === O.slides) return;
      O.slides = next;
      renderStrip(O);
    },
    // 실행 취소·다시 실행으로 그림의 모양이 되돌아갔을 때: 고른 모양 표시와 기록을 맞춘다.
    onAspect: (aspect) => {
      O.record.size = { width: aspect * O.record.size.height, height: O.record.size.height, unit: O.record.size.unit };
      O.record.ratio = `${O.record.size.width}:${O.record.size.height}`;
      keepRatio(O.record.ratio);
      markRatio(O, shapes);
    },
  });
  const down = el('button', { class: 'btn btn-primary cv-down-btn', type: 'button', title: '그림·영상·PPTX로 내려받아요', onClick: () => askDownload(O, down) }, ...face('download', '내려받기'));
  let acceptsMaterial = false;
  try { acceptsMaterial = !!materialAction && (!materialAction.accepts || materialAction.accepts(record)); } catch { /* An optional host action must fail closed. */ }
  const material = acceptsMaterial ? el('button', {class: 'btn cv-material-btn', type: 'button', dataset: {materialAction: ''}, onClick: () => saveMaterialFromEditor(O)}, materialAction.label) : null;
  let acceptsLesson=false;try{acceptsLesson=!!lessonAction&&(!lessonAction.accepts||lessonAction.accepts(record));}catch{}
  const lesson=acceptsLesson?el('button',{class:'btn cv-lesson-btn',type:'button',dataset:{lessonAction:''},onClick:()=>openLessonFromEditor(O)},lessonAction.label):null;
  const accountLibrary=accountAction?el('button',{class:'btn cv-account-btn',type:'button',dataset:{accountAction:''},onClick:()=>openLessonFromEditor(O,accountAction)},accountAction.label):null;
  const share = shareAction ? el('button', { class: 'btn cv-share-btn', type: 'button', dataset: { shareAction: '' }, title: shareAction.title || '보기 전용 링크로 나눠요', onClick: () => openShareFromEditor(O) }, ...face('link', shareAction.label)) : null;
  const show = el('button', { class: 'btn cv-show-btn', type: 'button', title: '화면 가득 보여 줘요', onClick: () => present(O) }, ...face('play', '발표'));
  // 그림의 모양: 꾸미는 화면 안에서 바로 바꾼다. 놓아 둔 도형과 사진은 찌그러지지 않게 편집기가 맞춰 준다.
  const shapes = el('div', { class: 'cv-shapes', role: 'group', 'aria-label': '그림의 모양' }, ...RATIOS.map((r) => {
    const icon = el('span', { class: 'cv-shape-icon', 'aria-hidden': 'true' });
    icon.style.aspectRatio = String(r.aspect);
    return el('button', {
      class: 'cv-shape', type: 'button', title: `${r.name} (${r.id}) · ${r.desc}`, 'aria-label': r.name, dataset: { ratio: r.id },
      onClick: () => setRatio(O, r.id, shapes),
    }, icon, el('span', { class: 'cv-shape-name', text: r.name }));
  }));
  O.shapes = shapes;
  const canvasRatio = O.ratioLabel = el('span', { class: 'cv-ratio-current', role: 'status', 'aria-live': 'polite', dataset: { canvasRatio: '' } });
  shapes.prepend(canvasRatio);
  // 위 막대: 나가기 · 이름 · 저장 상태 | 모양 · 발표 · 내려받기
  const mark = brand ? el(onBrandClick ? 'button' : 'span', onBrandClick ? {
    class: 'cv-brand cv-brand-link', type: 'button', title: `저장하고 ${brand.name} 홈으로`,
    'aria-label': `${brand.name} 홈으로`, onClick: (e) => closeToHost(O, e.currentTarget),
  } : { class: 'cv-brand', title: brand.name }, el('img', { src: brand.logo, alt: brand.name })) : null;
  // 들여쓰기: 닫기(초안은 이 기기에 남는다) · 다 했어요(저장을 마친 뒤 부른 앱에 그림과 원본을 넘긴다).
  // 단추 글은 부른 곳이 바꿀 수 있다(doneLabel · closeLabel, 받은함의 "선생님께 보내기" 등). close 를 주지 않으면 닫기 단추가 없다.
  const embedBar = embedMode ? (() => {
    const doneText = embedMode.doneLabel || '다 했어요';
    const done = el('button', { class: 'btn btn-primary cv-embed-done', type: 'button', dataset: { embedDone: '' }, title: embedMode.doneTitle || '다 만든 그림을 보내요', onClick: async () => {
      if (done.disabled) return;
      done.disabled = true; relabel(done, '보내는 중…');
      try { await embedMode.done(O.record.id); } catch (error) { toast(String(error?.message || '그림을 보내지 못했어요. 다시 눌러 주세요.').slice(0, 200), 4500); }
      finally { if (done.isConnected) { done.disabled = false; relabel(done, doneText); } }
    } }, ...face('check', doneText));
    const close = typeof embedMode.close === 'function' ? el('button', { class: 'btn btn-ghost cv-embed-close', type: 'button', dataset: { embedClose: '' }, title: embedMode.closeTitle || '보내지 않고 닫아요(꾸미던 것은 이 기기에 남아요)', onClick: () => embedMode.close(O.record.id) }, ...face('back', embedMode.closeLabel || '닫기')) : null;
    return { done, close };
  })() : null;
  const bar = el('header', { class: 'cv-bar' },
    el('span', { class: 'onba-editor-logo' }, onbatangLogo()),
    ...(mark ? [mark, el('span', { class: 'cv-bar-sep cv-brand-sep', 'aria-hidden': 'true' })] : []),
    el('button', { class: 'btn btn-ghost cv-back', type: 'button', title: '저장하고 내 그림으로 돌아가요', onClick: (e) => closeDesign(O, e.currentTarget) }, ...face('back', '내 그림')),
    el('span', { class: 'cv-bar-sep', 'aria-hidden': 'true' }),
    name, O.status, ...(material ? [material] : []), ...(lesson?[lesson]:[]), ...(accountLibrary?[accountLibrary]:[]), el('span', { class: 'cv-bar-gap' }), shapes, el('span', { class: 'cv-bar-sep', 'aria-hidden': 'true' }), tourButton('editor', O), ...(share ? [share] : []), show, down);
  // 들여쓰기 막대는 보통 막대 뒤에 만든다(이름 칸 · 저장 상태는 한 곳에만 놓일 수 있다).
  const embedHeader = embedBar ? el('header', { class: 'cv-bar cv-embed-bar' },
    el('span', { class: 'onba-editor-logo' }, onbatangLogo()), ...(embedBar.close ? [embedBar.close, el('span', { class: 'cv-bar-sep', 'aria-hidden': 'true' })] : []),
    name, O.status, el('span', { class: 'cv-bar-gap' }), tourButton('editor', O), embedBar.done) : null;
  const shell = editorShell(O, embedHeader || bar);
  // ? : 꾸미는 화면 단축키 표(글을 쓰는 칸에서는 그냥 글자다). 아무 데도 누르지 않은 때에도 듣도록 문서에 단다.
  const onHelpKey = (e) => {
    if (!shell.isConnected) { document.removeEventListener('keydown', onHelpKey); return; }
    if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || document.querySelector('.modal-backdrop, .cv-show')
      || e.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    e.preventDefault();
    openShortcuts();
  };
  document.addEventListener('keydown', onHelpKey);
  markRatio(O, shapes);
  setView('edit');
  app.replaceChildren(shell);
  O.editor.refresh();                    // 화면에 놓은 뒤에 다시 그려서 테두리·손잡이의 자리를 맞춘다
  renderStrip(O);
  O.materialLoadingPromise=loadMaterialNavigation(O);
  // 처음 꾸미는 화면을 열면 사용법 안내를 한 번 보여 준다(이 기기에서 한 번). 언제든 ? 단추로 다시 본다.
  // 안내를 이미 본 기기에는 새 기능이 들어온 뒤 처음 열 때 새 기능 안내를 한 번 보여 준다(처음 온 기기의 안내에는 이미 들어 있다).
  if (embedMode) { markTourSeen('editor'); markTourSeen(NEWS_KEY); }   // 들여쓰기는 바로 꾸민다(사용법은 ? 단추로)
  else if (!tourSeen('editor')) {
    markTourSeen('editor');
    markTourSeen(NEWS_KEY);
    setTimeout(() => { if (!O.closed && app.dataset.view === 'edit') editorTour(O); }, 700);
  } else if (!tourSeen(NEWS_KEY)) {
    markTourSeen(NEWS_KEY);
    setTimeout(() => { if (!O.closed && app.dataset.view === 'edit') editorTour(O, { news: true }); }, 700);
  }
  window.scrollTo({ top: 0 });
}

/**
 * 꾸미는 화면의 틀: 위 막대(bar) · 왼쪽 도구 줄과 옆 칸 · 가운데(고른 요소의 도구 막대 · 그림 · 슬라이드 띠). O.strip · O.shell 을 채운다.
 * O 에는 editor 와 alert(저장하지 못했을 때의 띠)가 있어야 한다.
 */
function editorShell(O, bar) {
  // 왼쪽: 도구 줄(템플릿·텍스트·요소·업로드·배경·레이어)과 옆 칸. 고른 도구를 한 번 더 누르거나 ‹ 를 누르면 옆 칸을 접는다(그림이 넓어진다).
  // 고른 요소의 펼친 칸(색·위치·투명도 …)은 넓은 화면에서 옆 칸 자리에 뜬다(그림을 가리지 않게. app.css). 그래서 옆 칸을 접을 때는 닫고, 열릴 때는 편다.
  const pop = O.editor.toolbar.querySelector('.fe-pop');
  const closePop = () => { if (pop && !pop.hidden && WIDE.matches) pop.querySelector('.fe-pop-close')?.click(); };
  const fold = el('button', { class: 'cv-fold', type: 'button', onClick: () => setFold(!shell.classList.contains('folded')) }, ic('back'));
  const setFold = (want) => {
    const on = want && WIDE.matches;       // 쌓는 화면에는 접을 옆 칸이 없다
    if (on) closePop();
    shell.classList.toggle('folded', on);
    fold.title = on ? '옆 칸 펴기' : '옆 칸 접기';
    fold.setAttribute('aria-label', fold.title);
    fold.setAttribute('aria-expanded', String(!on));
  };
  const side = el('aside', { class: 'cv-side', 'aria-label': '넣을 것 고르기' }, O.editor.panel);
  side.addEventListener('click', (e) => {
    const tab = e.target.closest('.fe-tab');
    if (!tab) return;
    O.activityConfig?.remove();O.activityConfig=null;
    const same = tab.classList.contains('on');
    const wasFolded = shell.classList.contains('folded');
    closePop();
    setFold(!wasFolded && same);
    // 다른 도구를 골랐으면(편집기가 옆 칸을 다시 그린 뒤에) 그 내용이 살짝 떠오른다.
    if (!same || wasFolded) requestAnimationFrame(() => ease(side.querySelector('.fe-tabbody'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 200));
  }, true);                              // 편집기가 옆 칸을 다시 그리기 전에(고른 도구가 무엇이었는지 보고) 정한다
  let popOpen = false;
  if (pop) {
    new MutationObserver(() => {
      const open = !pop.hidden;
      if (open && shell.classList.contains('folded')) setFold(false);
      if (open && !popOpen && WIDE.matches) ease(pop, [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], 200);
      popOpen = open;
    }).observe(pop, { attributes: true, attributeFilter: ['hidden'] });
  }
  // 가운데: 고른 요소의 도구 막대 · 그림 · 슬라이드 띠(지금 장 고르기, 장 더하기·복제·옮기기·지우기)
  O.strip = el('div', { class: 'cv-strip', role: 'group', 'aria-label': '슬라이드' });
  // 슬라이드 목록의 작은 그림을 우클릭: 그 장을 고르고 장 메뉴(새 장 · 복제 · 옮기기 · 이 장부터 발표 · 지우기)를 띄운다.
  // 전체 자료의 다른 파트에 있는 장은 먼저 그 파트를 연다(누른 것과 같다).
  O.strip.addEventListener('contextmenu', (e) => {
    const tile = e.target.closest?.('.cv-slide');
    if (!tile || tile.classList.contains('add') || tile.disabled || O.inlineImport || O.closed) return;
    e.preventDefault();
    if (tile.dataset.slide === undefined) { tile.click(); return; }
    const i = Number(tile.dataset.slide);
    if (i !== O.at) goSlide(O, i);
    if (i !== O.at) return;
    O.editor.showMenu(e.clientX, e.clientY, slideMenuGroups(O, { strip: true }), { label: `${i + 1}번째 장 메뉴` });
  });
  const canvasBox = el('div', { class: 'cv-canvas' }, O.editor.stage);
  const work = el('section', { class: 'cv-work', 'aria-label': '그림' },
    el('div', { class: 'cv-tools' }, O.editor.toolbar),
    canvasBox,
    O.editor.notes, O.strip, fold);
  // 노트 칸을 펴 두었는지는 이 기기에 기억한다(다음에 열 때도 그대로).
  try { O.editor.notes.open = localStorage.getItem(NOTES_OPEN_KEY) === '1'; } catch { /* 저장 공간이 막힌 기기: 접어 둔다 */ }
  O.editor.notes.addEventListener('toggle', () => { try { localStorage.setItem(NOTES_OPEN_KEY, O.editor.notes.open ? '1' : '0'); } catch { /* 기억하지 못해도 칸은 그대로 쓴다 */ } });
  const shell = O.shell = el('div', { class: 'cv-app' }, bar, O.alert, side, work);
  setFold(false);
  return shell;
}

// ---------- 슬라이드 ----------
/**
 * 영상을 찍거나 넣는 중이면 알리고 true 를 돌려준다. 그동안 다른 장으로 가거나 나가면 찍던 것이 사라지므로,
 * 장을 바꾸는 일 · 발표 · 내려받기 · 나가기는 이것을 먼저 보고 미룬다.
 */
function videoBusy(O) {
  const why = O.editor?.busy() || '';
  if (!why) return false;
  toast(why === 'recording' ? '영상을 찍는 중이에요. 먼저 "멈추기"를 눌러요.' : '영상을 넣는 중이에요. 잠깐만 기다려요.', 3500);
  return true;
}
/** 지금 모든 장(꾸미는 중인 장은 편집기에서 꺼낸 것). */
function currentSlides(O) {
  return O.slides.map((d, i) => (i === O.at && !O.viewing ? O.editor.getDesign() : d));
}
// sceneEdge: 영상 장면의 첫 모습을 그릴 때의 긴 쪽(px). 띠의 작은 그림은 작게(목록 · 꾸미기 판과 같은 그림을 쓴다), 발표 화면은 크게.
function slideView(design, aspect, sceneEdge = 640) {
  const view = designView(design, { sceneEdge });
  view.style.setProperty('--fe-ratio', String(aspect));
  view.style.aspectRatio = String(aspect);
  return view;
}
// 띠의 작은 그림에 붙이는 이름: 몇 번째 장인지 + 영상 장면 · 움직임이 있는지.
function slideLabel(i, design) {
  const marks = [design.topic ? `주제 ${design.topic}` : '', design.dur ? `리허설 ${design.dur}초` : '', design.hidden ? '발표에서 숨김' : '', hasVideo(design) ? '영상 있음' : '', hasMotion(design) ? '움직임 있음' : ''].filter(Boolean);
  return `${i + 1}번째 장${marks.length ? ` (${marks.join(' · ')})` : ''}`;
}
function renderStrip(O) {
  if (!O.strip || O.closed) return;
  O.activityConfig?.remove();O.activityConfig=null;
  if(O.materialDeck&&O.strip.dataset.materialLayout==='1'){
    renderMaterialNavigation(O,O.strip.querySelector('.cv-slide-list').scrollLeft);
    const pages=materialPages(O),at=pages.findIndex(v=>v.record.id===O.record.id&&v.index===O.at),tools=O.strip.querySelectorAll('.cv-slide-tool');
    tools[0].disabled=at<=0;tools[1].disabled=at>=pages.length-1;tools[2].disabled=O.slides.length>=MAX_SLIDES;
    const del=tools[3];del.disabled=O.slides.length===1&&!O.editor.getDesign().items.length&&!hasVideo(O.editor.getDesign());
    if(O.stripSelection!==O.editor.getDesign().id){del.dataset.armed='0';del.classList.remove('danger');del.parentElement.classList.remove('arming');relabel(del,'지우기');}
    O.stripSelection=O.editor.getDesign().id;
    updateActivityTools(O);
    return;
  }
  O.stripDrag?.destroy();
  const aspect = aspectOf(O.record);
  const n = O.slides.length;
  const full = n >= MAX_SLIDES;
  const left = O.strip.querySelector('.cv-slide-list')?.scrollLeft || 0;
  // 움직임(발표할 때)이 있는 장에는 작은 표시가 붙는다
  const thumbs = O.slides.map((d, i) => {
    const design = i === O.at ? O.editor.getDesign() : d;
    const moves = hasMotion(design);
    return el('button', {
      class: `cv-slide${i === O.at ? ' on' : ''}${moves ? ' moves' : ''}${hasVideo(design) ? ' film' : ''}${design.hidden ? ' skip' : ''}`, type: 'button', 'aria-label': slideLabel(i, design),
      'aria-pressed': String(i === O.at), dataset: { slide: String(i) },
      onClick: () => goSlide(O, i),
    }, el('span', { class: 'cv-slide-no', text: String(i + 1) }), el('span', { class: 'cv-slide-view', 'aria-hidden': 'true' }, slideView(design, aspect)),
    el('span', { class: 'cv-slide-vd', 'aria-hidden': 'true' }, ic('video')),
    el('span', { class: 'cv-slide-fx', 'aria-hidden': 'true' }, ic('motion')),
    el('span', { class: 'cv-slide-skip', 'aria-hidden': 'true', text: '숨김' }),
    design.topic ? el('span', { class: 'cv-slide-topic', 'aria-hidden': 'true', text: design.topic }) : null);
  });
  const tool = (icon, label, title, onClick, disabled = false) => el('button', { class: 'cv-slide-tool', type: 'button', title, 'aria-label': title, disabled, onClick }, ...face(icon, label));
  const del = tool('trash', '지우기', '이 장 지우기', () => {
    if (del.dataset.armed !== '1') {
      del.dataset.armed = '1';
      relabel(del, '한 번 더 누르면 지워져요');
      del.classList.add('danger');
      del.parentElement.classList.add('arming');      // 그동안 다른 단추를 감춘다(같은 자리를 한 번 더 눌렀을 때 "복제"가 눌리지 않게)
      setTimeout(() => { if (del.isConnected) renderStrip(O); }, 4000);
      return;
    }
    changeSlides(O, removeSlide);
  }, n === 1 && !O.editor.getDesign().items.length && !hasVideo(O.editor.getDesign()));
  O.strip.replaceChildren(
    el('div', { class: 'cv-slide-list' }, ...thumbs,
      el('button', {
        class: 'cv-slide add', type: 'button', disabled: full, title: full ? `슬라이드는 ${MAX_SLIDES}장까지예요` : '새 장 더하기', 'aria-label': '새 장 더하기',
        // 새 장은 지금 장의 배경과 움직임(조합 효과 · 전환 효과)을 이어받는다
        onClick: () => changeSlides(O, (slides, at) => addSlide(slides, at, slides[at]?.bg, slides[at])),
      }, el('span', { class: 'cv-slide-plus', 'aria-hidden': 'true' }, ic('plus')), el('span', { class: 'cv-slide-add-text', text: '새 장' }))),
    el('div', { class: 'cv-slide-tools' },
      el('span', { class: 'cv-slide-count', text: `${O.at + 1} / ${n}장` }),
      tool('left', '앞으로', '이 장을 앞으로 옮기기', () => moveStripSelection(O,-1), O.materialDeck?materialPages(O).findIndex(v=>v.record.id===O.record.id&&v.index===O.at)===0:O.at===0),
      tool('right', '뒤로', '이 장을 뒤로 옮기기', () => moveStripSelection(O,1), O.materialDeck?materialPages(O).findIndex(v=>v.record.id===O.record.id&&v.index===O.at)===materialPages(O).length-1:O.at===n-1),
      tool('copy', '복제', '이 장을 복제하기', () => changeSlides(O, copySlide), full),
      del,
      activityAuthoring&&el('button',{class:'btn cv-activity-add',type:'button',dataset:{addActivity:''},title:'미리 준비된 픽셀아트 활동을 새 슬라이드로 넣어요',onClick:()=>configureActivity(O)},'픽셀아트 활동 넣기'),
      activityAuthoring&&appMaker&&el('button',{class:'btn cv-activity-add',type:'button',dataset:{addGaiApp:''},onClick:()=>configureGaiActivity(O)},gaiOwl(),'가이X로 앱 만들기'),
      // 가이X 에게 개요를 부탁해 꾸민 장 여러 장을 만든다(개요로 장 만들기 창이 부탁 칸부터 열린다)
      activityAuthoring&&appMaker&&el('button',{class:'btn cv-activity-add',type:'button',dataset:{addGaiSlides:''},onClick:()=>openOutline(O)},gaiOwl(),'가이X로 장 만들기'),
      el('button',{class:'btn cv-activity-add',type:'button',dataset:{importLessonResults:''},onClick:()=>importLessonResults(O)},'HTML 수업 결과 가져오기'),
      el('button',{class:'btn cv-activity-edit',type:'button',dataset:{editActivity:''},onClick:()=>configureActivity(O,true)},'활동 설정')));
  updateActivityTools(O);
  // 띠를 다시 그려도 옆으로 넘겨 둔 자리는 그대로 두고, 고른 장이 안 보일 때에만 그쪽으로 (부드럽게) 넘긴다.
  const list = O.strip.querySelector('.cv-slide-list');
  const on = list.querySelector('.cv-slide.on');
  list.scrollLeft = left;
  if (on) {
    const box = list.getBoundingClientRect();
    const r = on.getBoundingClientRect();
    const by = r.left < box.left + 8 ? r.left - box.left - 8 : r.right > box.right - 8 ? r.right - box.right + 8 : 0;
    if (by) list.scrollBy({ left: by, behavior: CALM.matches ? 'auto' : 'smooth' });
  }
  renderMaterialNavigation(O,left);
  decorateStrip(O);
  if(O.materialDeck)O.strip.dataset.materialLayout='1';
}
function moveStripSelection(O,delta){if(O.materialDeck){const pages=materialPages(O),from=pages.findIndex(v=>v.record.id===O.record.id&&v.index===O.at);reorderStrip(O,from,from+delta);}else changeSlides(O,(slides,at)=>moveSlide(slides,at,delta));}
async function reorderStrip(O,from,to){
  if(O.closed||O.leaving||O.inlineImport||app.inert||videoBusy(O))return;
  if(!O.materialDeck){changeSlides(O,(slides,at)=>{const next=[...slides];next.splice(to,0,...next.splice(from,1));const selected=slides[at];return [next,next.indexOf(selected)];});return;}
  if(!materialNavigation.reorder){toast('이 자료의 순서를 저장하는 기능을 연결하지 못했어요.');return;}
  const pages=materialPages(O);if(from<0||to<0||from>=pages.length||to>=pages.length||from===to)return;
  O.leaving=true;app.inert=true;
  try{await persistEditorAction(O);const deck=await materialNavigation.reorder({designId:O.record.id,materialRef:O.materialDeck.materialRef,pageIds:movePage(pages.map(v=>v.page.id),from,to)});
    if(!O.closed&&S.open===O){O.materialDeck={...deck,documents:deck.documents.map(migrateRecord)};renderStrip(O);toast('슬라이드 순서를 저장했어요. 원본과 이전 저장본은 그대로예요.');}
  }catch(error){toast(error?.message||'순서를 저장하지 못했어요. 원래 순서와 편집은 유지돼요.',5000);}
  finally{O.leaving=false;if(!O.closed&&S.open===O)app.inert=false;}
}
function decorateStrip(O){
  const list=O.strip.querySelector('.cv-slide-list'),count=O.strip.querySelector('.cv-slide-count');
  const size=el('input',{type:'range',min:'88',max:'600',step:'1',value:'120','aria-label':'슬라이드 목록 창 높이',dataset:{trayHeight:''}});
  const scroll=(text,dir)=>el('button',{class:'cv-slide-scroll',type:'button','aria-label':text,onClick:()=>list.scrollBy({left:dir*list.clientWidth*.75,behavior:CALM.matches?'auto':'smooth'})},dir<0?'‹':'›');
  const guide=window.matchMedia('(pointer: coarse)').matches?'손잡이로 순서 변경 · 목록을 밀어 이동':'끌어서 순서 변경 · 휠로 가로 이동';
  const bodyId=O.trayId??=newId('u');
  const toggle=el('button',{class:'cv-tray-toggle',type:'button','aria-controls':bodyId,title:'슬라이드 목록 접기/펼치기'},el('span',{class:'cv-tray-toggle-label'},'목록 접기'),el('span',{class:'cv-tray-chevron','aria-hidden':'true'},'⌄'));
  const page=(dir,text)=>el('button',{class:'cv-slide-scroll cv-tray-page',type:'button',dataset:{trayStep:String(dir)},'aria-label':text},dir<0?'‹':'›');
  const options=el('div',{class:'cv-tray-options'},el('div',{class:'cv-tray-options-heading'},el('b',{},'슬라이드 도구'),el('button',{class:'cv-tray-reset',type:'button',dataset:{trayReset:''}},'창 높이 초기화')),
    O.strip.querySelector('.cv-slide-tools'),
    el('div',{class:'cv-tray-options-row'},el('label',{class:'cv-strip-size'},'창 높이',size),scroll('목록 왼쪽 보기',-1),scroll('목록 오른쪽 보기',1)),
    el('p',{class:'cv-strip-guide',text:guide}),O.strip.querySelector('.cv-material-hint'));
  const menu=el('details',{class:'cv-tray-menu'},el('summary',{'aria-label':'슬라이드 도구 열기',title:'슬라이드 복제·삭제·순서·높이·결과 가져오기'},'···'),options);
  const header=el('div',{class:'cv-strip-header'},toggle,count,page(-1,'이전 슬라이드'),page(1,'다음 슬라이드'),menu);
  const body=el('div',{class:'cv-tray-body',id:bodyId},list);
  const grip=el('div',{class:'cv-tray-grip',role:'separator',tabindex:'0','aria-orientation':'horizontal','aria-label':'슬라이드 목록 높이 조절','aria-controls':bodyId,'aria-valuemin':'0','aria-valuemax':'152',title:'위아래로 끌어 목록 높이 조절 · 누르면 접기/펼치기 · 방향키로도 조절'});
  O.strip.replaceChildren(grip,header,body);list.tabIndex=0;
  O.tray??=bindSlideTray(O.strip,{key:`onbatang.filmstrip-tray.v1.${storageName()}`,
    navigation:()=>{const at=O.materialDeck?materialPages(O).findIndex(v=>v.record.id===O.record.id&&v.index===O.at):O.at,n=O.materialDeck?materialPages(O).length:O.slides.length;return {previous:at>0,next:at<n-1};},
    step:delta=>{if(O.materialDeck){const pages=materialPages(O),at=pages.findIndex(v=>v.record.id===O.record.id&&v.index===O.at);if(pages[at+delta])navigateMaterialPage(O,pages[at+delta]);}else goSlide(O,O.at+delta);}});
  O.tray.refresh();
  O.stripDrag=bindFilmstrip(list,{reorder:(from,to)=>reorderStrip(O,from,to),busy:()=>O.closed||O.leaving||!!O.inlineImport||app.inert});
}

// Stored PPT parts stay independent. The editor shows their pages as one deck
// without exceeding per-document size limits or rewriting fixed revisions.
function materialLoading(O,options){
  O.materialLoading?.dispose();
  return O.materialLoading=deferredOnbatangLoading(O.shell.querySelector('.cv-canvas'),{...options,compact:true,className:'cv-material-loading',active:()=>!O.closed&&S.open===O});
}
async function loadMaterialNavigation(O) {
  if (!materialNavigation || O.record.source?.kind !== 'pptx') return;
  const loading=materialLoading(O,{title:'PPT 전체 슬라이드를 불러오고 있어요',detail:'저장된 모든 쪽을 순서대로 연결해요.'});
  try {
    const deck=await materialNavigation.load({designId:O.record.id});
    O.materialLoadError=null;
    if(O.closed||S.open!==O)return;
    if(deck?.documents?.some(record=>record.id===O.record.id)){
      O.materialDeck={...deck,documents:deck.documents.map(migrateRecord)};
      renderStrip(O);
    }
  }catch(error){O.materialLoadError=error;if(!O.closed&&S.open===O)toast('PPT 전체 목록을 열지 못했어요. 현재 편집과 저장 자료는 유지돼요. 내 자료에서 다시 열어주세요.',5000);}
  finally{loading.finish();}
}
function materialPages(O){return orderPages(O.materialDeck.documents.flatMap(record=>(record.id===O.record.id?currentSlides(O):record.slides).map((page,index)=>({record,page,index}))),O.materialDeck.pageOrder);}
function renderMaterialNavigation(O,left=0) {
  if(!O.materialDeck)return;
  const pages=materialPages(O);
  const at=pages.findIndex(value=>value.record.id===O.record.id&&value.index===O.at);
  const rail=O.strip.querySelector('.cv-slide-list');
  rail.setAttribute('aria-label','PPT 전체 슬라이드');
  const existing=new Map([...rail.children].map(node=>[node.dataset.pageId,node]));
  const nodes=pages.map((value,index)=>{
   let node=existing.get(value.page.id);
   if(!node){node=el('button',{
    class:`cv-slide${index===at?' on':''}`,type:'button','aria-label':`전체 자료 ${index+1}쪽${value.page.source?.pageNumber?` · 원본 ${value.page.source.pageNumber}쪽`:''}`,
    dataset:{pageId:value.page.id},onClick:()=>navigateMaterialPage(O,node.materialValue)
   },el('span',{class:'cv-slide-no'}),el('span',{class:'cv-slide-view','aria-hidden':'true'}));}
   node.materialValue=value;node.classList.toggle('on',index===at);node.setAttribute('aria-pressed',String(index===at));node.classList.toggle('skip',!!value.page.hidden);
   if(!node.querySelector('.cv-slide-skip'))node.append(el('span',{class:'cv-slide-skip','aria-hidden':'true',text:'숨김'}));
   node.querySelector('.cv-slide-topic')?.remove();if(value.page.topic)node.append(el('span',{class:'cv-slide-topic','aria-hidden':'true',text:value.page.topic}));
   node.setAttribute('aria-label',`전체 자료 ${index+1}쪽${value.page.source?.pageNumber?` · 원본 ${value.page.source.pageNumber}쪽`:''}${value.page.topic?` · 주제 ${value.page.topic}`:''}${value.page.hidden?' · 발표에서 숨김':''}`);
   Object.assign(node.dataset,{materialPage:String(index),documentId:value.record.id});
   if(value.record.id===O.record.id)node.dataset.slide=String(value.index);else delete node.dataset.slide;
   node.querySelector('.cv-slide-no').textContent=String(index+1);
   if(node.materialRendered!==value.page){node.querySelector('.cv-slide-view').replaceChildren(slideView(value.page,aspectOf(value.record),240));node.materialRendered=value.page;}
   return node;
  });
  if(nodes.length!==rail.children.length||nodes.some((node,i)=>rail.children[i]!==node)){
   O.stripDrag?.destroy();rail.replaceChildren(...nodes);
   // Rebind only when the page set/order changes, never on selection.
   for(const grip of rail.querySelectorAll('.cv-slide-grip'))grip.remove();
   if(O.strip.dataset.materialLayout==='1')O.stripDrag=bindFilmstrip(rail,{reorder:(from,to)=>reorderStrip(O,from,to),busy:()=>O.closed||O.leaving||!!O.inlineImport||app.inert});
  }
  const count=O.strip.querySelector('.cv-slide-count');
  count.textContent=`${at+1} / ${pages.length}쪽 · 전체 PPT`;
  count.dataset.materialCount='';
  if(!O.strip.querySelector('.cv-material-hint'))O.strip.append(el('span',{class:'cv-material-hint',text:'모든 쪽을 이어서 편집할 수 있어요. 변경은 이 기기에 자동 저장돼요.'}));
  const selected=rail.querySelector('.on');
  const key=`${O.record.id}:${O.at}`;
  rail.scrollLeft=left;
  if(selected&&O.materialScrollTarget!==key){const box=rail.getBoundingClientRect(),r=selected.getBoundingClientRect();rail.scrollLeft+=r.left<box.left+8?r.left-box.left-8:r.right>box.right-8?r.right-box.right+8:0;}
  O.materialScrollTarget=key;
  O.tray?.refresh();
}
async function navigateMaterialPage(O,value) {
  if(O.closed||O.leaving||O.inlineImport||moving||app.inert||hostFlush||videoBusy(O))return;
  if(value.record.id===O.record.id){goSlide(O,value.index);return;}
  O.leaving=true;app.inert=true;
  const loading=materialLoading(O,{title:`${value.page.source?.pageNumber||value.index+1}쪽을 여는 중이에요`,detail:'지금 편집한 내용을 먼저 저장해요.'});
  try{
    await persistEditorAction(O);
    const record=await getDesign(value.record.id);
    if(!record)throw Error('DOCUMENT_NOT_FOUND');
    const ready=migrateRecord(record);
    if(ready.slides[value.index]?.id!==value.page.id)throw Error('DOCUMENT_CHANGED');
    await tidyVideos(O.record.id,currentSlides(O));
    // The editor's render normalization is not a saved draft. Keep the exact
    // snapshot written by this editor as the CAS basis when another part later
    // needs room for an activity/result. Foreign drafts must still conflict.
    O.materialDeck.documents=O.materialDeck.documents.map(row=>row.id===O.record.id?structuredClone(O.persistedRecord):row);
    clearTimeout(O.timer);clearTimeout(O.thumbTimer);O.editor.quiet();
    O.persistedRecord=structuredClone(ready);O.record={...ready};delete O.record.slides;O.slides=ready.slides;O.at=value.index;
    O.dirty=false;O.saved=true;O.localOk=true;O.accountOk=null;O.nameInput.value=ready.name;
    setupApp(ready);markRatio(O,O.shapes);O.editor.setUploads(libraryOf(ready.uploads,ready.slides));O.editor.setDesign(O.slides[O.at]);
    setStatus(O,accountFor(ready)?'저장돼 있어요':'이 기기에 저장돼 있어요');upsert(ready);renderStrip(O);
  }catch{
    if(!O.closed&&S.open===O){setStatus(O,'현재 쪽을 저장하거나 다음 쪽을 열지 못했어요. 편집은 그대로 유지돼요.','bad');toast('저장 상태를 확인한 뒤 다시 이동해주세요.',5000);}
  }finally{loading.finish();O.leaving=false;if(!O.closed&&S.open===O)app.inert=false;}
}
// 지금 장의 작은 그림만 다시 그린다(꾸미는 동안 띠를 통째로 다시 그리지 않는다).
function refreshThumb(O) {
  const box = O.strip?.querySelector(`.cv-slide[data-slide="${O.at}"] .cv-slide-view`);
  if (O.closed) return;
  if(O.materialDeck){renderStrip(O);return;}
  if (!box) return;
  const design = O.editor.getDesign();
  box.replaceChildren(slideView(design, aspectOf(O.record)));
  const tile = box.closest('.cv-slide');
  tile.classList.toggle('moves', hasMotion(design));
  tile.classList.toggle('film', hasVideo(design));
  tile.setAttribute('aria-label', slideLabel(O.at, design));
}
/** 다른 장으로 간다. 지금 장은 편집기에서 꺼내 두고, 그 장을 편집기에 끼운다(실행 취소 기록은 장마다 따로라 비워진다). */
// 꾸미는 화면에서 우클릭: 카드와 슬라이드 목록은 자기 메뉴를 먼저 띄운다(defaultPrevented).
// 그 밖의 곳(그림 둘레 · 옆 칸 · 도구 막대 · 노트 머리, 그리고 꾸미는 화면이 다 채우지 못한 페이지 바탕)은 브라우저 메뉴 대신 장 메뉴를 띄운다.
// 글을 쓰는 칸은 브라우저 메뉴(붙여넣기 · 맞춤법)를 그대로 둔다. 창(모달) · 발표 화면 · PPT 가져오기 · 활동 설정은 그 화면의 것이라 건드리지 않는다.
function onPageMenu(e) {
  const O = S.open;
  if (!O || O.closed || O.inlineImport || e.defaultPrevented || !O.editor || !O.shell) return;
  const t = e.target instanceof Element ? e.target : null;
  if (!t || O.editor.stage.contains(t) || document.body.classList.contains('modal-open')) return;
  const page = t === document.documentElement || t === document.body || t === app;
  if (!page && !O.shell.contains(t)) return;
  if (t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), a[href], iframe, .cv-activity-config')) return;
  e.preventDefault();
  O.editor.menuAt(e.clientX, e.clientY);
}
// 장(슬라이드) 메뉴: 카드의 빈 곳 · 그 둘레 · 슬라이드 목록에서 우클릭할 때 함께 쓴다.
// 옮기기 · 복제 · 지우기는 슬라이드 띠의 단추를 그대로 눌러서, 전체 자료(여러 파트)에서도 같은 저장 규칙을 따른다.
function slideMenuGroups(O, { strip = false } = {}) {
  const tools = [...(O.strip?.querySelectorAll('.cv-slide-tool') || [])], add = O.strip?.querySelector('.cv-slide.add');
  const [left, right, dup, del] = tools;
  const press = (node, times = 1) => () => { for (let k = 0; k < times && node?.isConnected && !node.disabled; k++) node.click(); };
  const off = (node) => !node || node.disabled;
  const openNotes = () => { O.editor.notes.open = true; O.editor.notes.querySelector('textarea')?.focus({ preventScroll: false }); };
  return [
    strip ? [] : [
      { icon: 'palette', label: '바탕색 바꾸기', run: () => O.editor.openTab('bg') },
      { icon: 'template', label: '틀 고르기', run: () => O.editor.openTab('layout') },
    ],
    [{ icon: 'pencil', label: '발표자 노트 적기', run: openNotes }],
    strip ? [] : [
      { icon: 'swap', label: '찾아 바꾸기', run: () => openFindReplace(O) },
      { icon: 'check', label: '단축키 보기', hint: '?', run: () => openShortcuts() },
      { icon: 'check', label: '새 기능 보기', run: () => openWhatsNew() },
    ],
    [
      { icon: 'plus', label: '새 장 더하기', run: press(add), disabled: off(add) },
      { icon: 'text', label: '개요로 장 만들기', run: () => openOutline(O), disabled: off(add) },
      { icon: 'duplicate', label: '이 장 복제', run: press(dup), disabled: off(dup) },
      { icon: 'left', label: '앞으로 옮기기', hint: strip ? 'Alt+←' : '', run: press(left), disabled: off(left) },
      { icon: 'right', label: '뒤로 옮기기', hint: strip ? 'Alt+→' : '', run: press(right), disabled: off(right) },
    ],
    [
      { icon: 'play', label: '이 장부터 발표', run: () => present(O) },
      // 주제(구역): 이 장부터 새 주제. 발표의 전체 보기(G)가 주제로 묶이고, PPTX 에는 PowerPoint 의 구역으로 들어간다.
      { icon: 'template', label: O.editor.getDesign().topic ? '주제 이름 고치기' : '여기서 주제 시작', run: () => openTopic(O) },
      ...(O.editor.getDesign().dur ? [{ icon: 'trash', label: `리허설 시간 지우기 (${O.editor.getDesign().dur}초)`, run: () => { O.editor.patchSlide({ dur: null }); renderStrip(O); toast('이 장의 리허설 시간을 지웠어요. 자동 넘기기·영상에서 기본 시간을 써요.'); } }] : []),
      // 숨긴 장: 지우지 않고 발표 · HTML 수업 · PDF 에서만 건너뛴다(정답 장, 예비 앱 장 등). PPTX 에는 숨긴 슬라이드로 들어간다.
      O.editor.getDesign().hidden
        ? { icon: 'screen', label: '숨기기 풀기', run: () => setSlideHidden(O, false) }
        : { icon: 'screen', label: '발표에서 숨기기', run: () => setSlideHidden(O, true) },
    ],
    // 띠의 지우기는 두 번 눌러야 지워진다(실수 방지). 메뉴에서 고른 것은 이미 한 번 확인한 것이라 바로 지운다.
    [{ icon: 'trash', label: '이 장 지우기', run: press(del, 2), disabled: off(del), danger: true }],
  ];
}
// 꾸미는 화면의 단축키 표(? 로 연다). 발표 화면의 단축키는 발표 중에 ? 로 본다(show-keys.js).
const EDITOR_KEYS = [
  ['누르기 · Shift+누르기 · 빈 곳 끌기', '고르기 · 여럿 고르기'],
  ['화살표 (Shift: 크게)', '고른 것 옮기기'],
  ['Enter · 두 번 누르기', '글 고치기'],
  ['Esc', '고르기 풀기 · 글 고치기 끝내기'],
  ['Delete · Backspace', '지우기'],
  ['Ctrl+C · Ctrl+X · Ctrl+V', '복사 · 잘라내기 · 붙여넣기'],
  ['Ctrl+D', '복제'],
  ['Ctrl+Z · Ctrl+Y (Ctrl+Shift+Z)', '실행 취소 · 다시 실행'],
  ['Ctrl+A', '모두 고르기'],
  ['Ctrl+G · Ctrl+Shift+G', '그룹으로 묶기 · 풀기'],
  ['두 조각 고르기 → 연결선', '두 조각을 화살표로 잇기(옮기면 따라와요)'],
  ['Ctrl+B', '굵게(글)'],
  ['I', '스포이드: 화면에서 색 찍기'],
  ['Alt (끄는 동안)', '가운데 맞춤 잠깐 끄기'],
  ['우클릭 · Shift+F10', '메뉴'],
  ['Alt+← · Alt+→ (슬라이드 목록)', '장 순서 옮기기'],
  ['?', '이 표 열기'],
];
const escCloses = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); } };
function openShortcuts() {
  const list = el('dl', { class: 'cv-keys' }, ...EDITOR_KEYS.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
  const box = el('section', { class: 'cv-keys-box', tabindex: '-1', 'aria-labelledby': 'cv-keys-title', onKeydown: escCloses },
    el('h2', { id: 'cv-keys-title', text: '꾸미는 화면 단축키' }), list,
    el('p', { class: 'cv-down-note', text: '발표하는 동안의 단축키(번호로 가기 · 검은 화면 · 펜 · 발표자 화면 …)는 발표 화면에서 ? 를 눌러 봐요. Mac 에서는 Ctrl 대신 ⌘ 를 눌러요.' }));
  openModal(box);
  requestAnimationFrame(() => box.focus({ preventScroll: true }));
}
// 찾아 바꾸기: 지금 연 자료(여러 파트로 된 전체 자료면 지금 연 파트)의 모든 장 글상자와, 고르면 발표자 노트.
function openFindReplace(O) {
  if (O.closed || videoBusy(O) || O.inlineImport) return;
  const find = el('input', { class: 'cv-find-input', type: 'text', 'aria-label': '찾을 글', placeholder: '찾을 글', maxlength: '200' });
  const replace = el('input', { class: 'cv-find-input', type: 'text', 'aria-label': '바꿀 글', placeholder: '바꿀 글(비우면 지워요)', maxlength: '200' });
  const notes = el('input', { type: 'checkbox', checked: true }), cased = el('input', { type: 'checkbox' });
  const result = el('p', { class: 'cv-down-note', role: 'status', 'aria-live': 'polite' });
  const hits = el('div', { class: 'cv-find-hits' });
  const options = () => ({ find: find.value, replace: replace.value, notes: notes.checked, caseSensitive: cased.checked });
  const slides = () => { O.slides[O.at] = O.editor.getDesign(); return O.slides; };
  const update = () => {
    const found = findText(slides(), options());
    result.textContent = !find.value ? '찾을 글을 적어요.' : found.total ? `${found.slides.length}장에서 ${found.total}곳을 찾았어요. 장 번호를 누르면 그 장으로 가요.` : '찾은 곳이 없어요. 잠긴 조각은 찾지 않아요(글상자와 연결선 위의 글을 찾아요).';
    hits.replaceChildren(...found.slides.map(({ index, count }) => el('button', { class: `btn chip${index === O.at ? ' on' : ''}`, type: 'button', onClick: () => { goSlide(O, index); update(); } }, `${index + 1}장 · ${count}곳`)));
    all.disabled = !found.total;
  };
  const all = el('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
    const r = replaceText(slides(), { ...options(), limit: textLimit });
    if (!r.count && !r.skipped) { update(); return; }
    O.slides = r.slides;
    O.editor.setDesign(O.slides[O.at]);
    renderStrip(O);
    touched(O);
    update();
    result.textContent = `${r.count}곳을 바꿨어요.${r.skipped ? ` 글자 수가 넘치는 글상자 · 선 위의 글 ${r.skipped}개는 바꾸지 않았어요.` : ''} 되돌리려면 반대로 한 번 더 바꿔요.`;
  } }, '모두 바꾸기');
  for (const input of [find, replace]) input.addEventListener('input', update);
  for (const box of [notes, cased]) box.addEventListener('change', update);
  find.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = hits.querySelector('button'); first?.click(); } });
  openModal(el('section', { class: 'cv-find-box', 'aria-labelledby': 'cv-find-title', onKeydown: escCloses },
    el('h2', { id: 'cv-find-title', text: '찾아 바꾸기' }),
    O.materialDeck ? el('p', { class: 'cv-down-note', text: '여러 파트로 된 전체 자료는 지금 연 파트의 장에서 찾아요.' }) : null,
    el('label', { class: 'cv-find-row' }, el('span', { text: '찾기' }), find),
    el('label', { class: 'cv-find-row' }, el('span', { text: '바꾸기' }), replace),
    el('div', { class: 'cv-find-opts' }, el('label', {}, notes, ' 발표자 노트도'), el('label', {}, cased, ' 영어 대소문자 구분')),
    result, hits,
    el('div', { class: 'cv-find-actions' }, el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal }, '닫기'), all)), { onClose: () => O.editor.refresh() });
  update();
  requestAnimationFrame(() => find.focus());
}
// 개요로 장 만들기: 줄글 개요(제목 줄 · 들여 쓴 내용 줄 · > 노트)를 적으면 장마다 제목과 내용을 놓아 한꺼번에 만든다(outline.js).
// 지금 장이 비어 있으면 그 장부터 채우고, 아니면 지금 장 뒤에 넣는다. 바탕 · 글꼴 · 움직임은 지금 장을 따른다.
const OUTLINE_SAMPLE = '식물의 한살이\n  씨앗이 싹 터요\n  잎과 줄기가 자라요\n    햇빛을 받아 양분을 만들어요\n  꽃이 피고 열매를 맺어요\n> 씨앗을 직접 보여 주며 시작하기\n물의 순환\n  - 증발\n  - 구름\n  - 비\n정리해 볼까요?';
function openOutline(O) {
  if (O.closed || videoBusy(O) || O.inlineImport) return;
  const input = el('textarea', { class: 'cv-outline-input', rows: '11', 'aria-label': '개요', spellcheck: 'false', placeholder: `예)\n${OUTLINE_SAMPLE}` });
  const result = el('p', { class: 'cv-down-note', role: 'status', 'aria-live': 'polite' });
  const list = el('div', { class: 'cv-outline-thumbs' });
  const blank = (d) => !d.items.length && !d.video && !d.activity && !d.notes;
  // 장 모양: 테마 색 묶음(장마다 배치를 골라 꾸민다) 또는 "글만"(지금 바탕의 글 장). 고른 것은 이 기기에 기억한다.
  const STYLE_KEY = 'onbatang-outline-style-v1', known = (v) => v === 'plain' || OUTLINE_STYLES.some((t) => t.id === v);
  let style = (() => { try { const v = localStorage.getItem(STYLE_KEY); if (known(v)) return v; } catch { /* 기억하지 못해도 괜찮다 */ }
    const bg = O.editor.getDesign().bg; return OUTLINE_STYLES.find((t) => t.bg === bg)?.id || OUTLINE_STYLES[0].id; })();
  const styleChip = ({ id, name, bg, accent }) => el('button', { class: 'cv-outline-style', type: 'button', dataset: { outlineStyle: id }, 'aria-pressed': String(style === id), title: id === 'plain' ? '지금 장의 바탕색 그대로, 글만 놓아요' : `${name}: 장마다 배치를 골라 그림과 함께 꾸며요`,
    onClick: () => { style = id; try { localStorage.setItem(STYLE_KEY, id); } catch { /* 괜찮다 */ } for (const b of styles.children) b.setAttribute('aria-pressed', String(b.dataset.outlineStyle === id)); update(); } },
  el('span', { class: 'cv-outline-swatch', 'aria-hidden': 'true', style: `background:${bg};box-shadow:inset 0 0 0 4px ${bg},inset 0 0 0 10px ${accent}` }), el('span', { text: name }));
  const styles = el('div', { class: 'cv-outline-styles', role: 'group', 'aria-label': '장 모양' },
    ...OUTLINE_STYLES.map((t) => styleChip({ id: t.id, name: t.swatch, bg: t.bg, accent: t.accent })),
    styleChip({ id: 'plain', name: '글만', bg: '#ffffff', accent: '#9aa3b5' }));
  const plan = () => {
    O.slides[O.at] = O.editor.getDesign();
    const here = O.slides[O.at], empty = blank(here);
    const room = MAX_SLIDES - O.slides.length + (empty ? 1 : 0);
    const font = here.items.find((it) => it.t === 'text' && it.font)?.font;
    return { empty, ...outlineSlides(parseOutline(input.value), { bg: here.bg, font: font === 'gothic' ? undefined : font, like: here, room, style }) };
  };
  // 미리 보기: 만들어질 장의 작은 그림과 제목(글을 치는 동안에는 잠깐 기다렸다 그린다)
  let thumbTimer = 0;
  const thumbs = (slides, titles) => list.replaceChildren(...slides.map((d, i) => el('figure', { class: 'cv-outline-thumb' },
    slideView(d, aspectOf(O.record), 320), el('figcaption', {}, el('b', { text: titles[i] || '(제목 없음)' })))));
  const update = (now = true) => {
    const { slides, cut, empty, titles } = plan();
    make.disabled = !slides.length;
    make.textContent = slides.length ? `${slides.length}장 만들기` : '장 만들기';
    clearTimeout(thumbTimer);
    if (now) thumbs(slides, titles); else thumbTimer = setTimeout(() => thumbs(slides, titles), 250);
    result.textContent = !input.value.trim() ? '들여 쓰지 않은 줄은 장의 제목, 그 아래 들여 쓰거나 "-"로 시작하는 줄은 그 장의 내용이에요. 더 들여 쓰면 한 단계 아래, ">"로 시작하면 발표자 노트예요.'
      : !slides.length ? `슬라이드는 ${MAX_SLIDES}장까지예요. 장을 지운 뒤 다시 해 주세요.`
        : `${empty ? '비어 있는 지금 장부터' : '지금 장 뒤에'} ${slides.length}장을 만들어요.${cut ? ` ${MAX_SLIDES}장을 넘는 ${cut}장은 만들지 않아요.` : ''} 내용이 많으면 "(이어서)" 장으로 나눠요.`;
  };
  const make = el('button', { class: 'btn btn-primary', type: 'button', dataset: { outlineMake: '' }, onClick: () => {
    const { slides, cut, empty } = plan();
    if (!slides.length) return;
    changeSlides(O, (all, at) => { const next = all.slice(); next.splice(empty ? at : at + 1, empty ? 1 : 0, ...slides); return [next, empty ? at : at + 1]; });
    closeModal();
    toast(`${slides.length}장을 만들었어요.${cut ? ` (${cut}장은 ${MAX_SLIDES}장을 넘어 만들지 않았어요)` : ''} 글을 눌러 고치고, 틀 · 바탕색으로 꾸며요.`, 4500);
  } }, '장 만들기');
  const sample = el('button', { class: 'btn chip', type: 'button', dataset: { outlineSample: '' }, onClick: () => { input.value = OUTLINE_SAMPLE; update(); input.focus(); } }, '예시 넣어 보기');
  input.addEventListener('input', () => update(false));
  // 가이X 에게 개요 부탁하기(가이랩처럼 가이X 를 이어 준 곳에서만): 주제 · 장 수를 보내면 개요 글이 칸에 들어온다. 장은 확인 · 고친 뒤 직접 만든다.
  let asking = null, before = null;
  const ai = appMaker && activityAuthoring ? (() => {
    const topic = el('textarea', { class: 'cv-outline-topic', rows: '2', maxlength: '600', 'aria-label': '가이X에게 부탁할 주제', placeholder: '예) 초등 4학년 과학 — 식물의 한살이를 처음 배우는 시간. 씨앗 관찰부터 열매까지.' });
    const count = el('select', { class: 'cv-outline-count', 'aria-label': '만들 장 수' }, ...[4, 5, 6, 8, 10].map((n) => el('option', { value: String(n), text: `${n}장`, ...(n === 6 ? { selected: true } : {}) })));
    const say = el('p', { class: 'cv-down-note', role: 'status', 'aria-live': 'polite', text: '주제와 대상을 적으면 가이X가 개요를 써 줘요. 써 준 개요는 아래 칸에서 고친 뒤 장으로 만들어요.' });
    const label = el('span', { text: '가이X에게 부탁하기' });
    const undo = el('button', { class: 'btn chip', type: 'button', hidden: true, dataset: { outlineUndo: '' }, onClick: () => { if (before == null) return; input.value = before; before = null; undo.hidden = true; update(); } }, '전 개요로 되돌리기');
    const go = el('button', { class: 'btn btn-primary cv-outline-ask', type: 'button', dataset: { outlineAsk: '' }, onClick: async () => {
      if (asking) { asking.abort(); return; }
      const want = topic.value.trim();
      if (want.length < 3) { say.textContent = '부탁할 주제를 3자 넘게 적어 주세요.'; topic.focus(); return; }
      // 연결 창은 누른 그 순간에 열어야 막히지 않는다: 기다리기 전에 connect 를 부른다.
      let task; try { task = appMaker.connect(); } catch (error) { task = Promise.reject(error); }
      const controller = asking = new AbortController();
      label.textContent = '그만두기'; topic.disabled = count.disabled = true; say.textContent = '가이X 연결을 확인하고 있어요…';
      try {
        await task;
        if (controller.signal.aborted) throw new DOMException('', 'AbortError');
        say.textContent = '가이X가 개요를 쓰고 있어요… 30초쯤 걸릴 수 있어요.';
        const answer = await appMaker.generate({ kind: 'outline', prompt: want, slides: Number(count.value) }, { signal: controller.signal });
        const text = answer?.kind === 'outline' ? outlineFromAnswer(answer.outline) : '';
        if (!parseOutline(text).some((part) => part.lines.length)) throw Error('개요 모양의 답을 받지 못했어요. 주제를 조금 더 자세히 적어 다시 부탁해 주세요.');
        if (input.value.trim()) { before = input.value; undo.hidden = false; }
        input.value = text;
        update();
        say.textContent = '가이X가 쓴 개요예요. 아래 칸에서 고친 뒤 "장 만들기"를 눌러요.';
      } catch (error) {
        say.textContent = error?.name === 'AbortError' ? '부탁을 그만뒀어요.' : String(error?.message || '가이X가 개요를 쓰지 못했어요. 다시 부탁해 주세요.').slice(0, 300);
      } finally {
        if (asking === controller) asking = null;
        label.textContent = '가이X에게 부탁하기'; topic.disabled = count.disabled = false;
      }
    } }, gaiOwl(), label);
    input.rows = 6; input.classList.add('short');                  // 부탁하는 칸이 있으면 개요 칸을 줄여 만들기 단추까지 한 화면에 들게
    return el('div', { class: 'cv-outline-ai' }, el('b', { text: '가이X에게 개요 부탁하기' }), topic, el('div', { class: 'cv-find-opts' }, count, go, undo), say);
  })() : null;
  input.addEventListener('keydown', (e) => {
    // Tab 으로 들여 쓰기(Shift+Tab 은 내어 쓰기). 개요는 들여 쓰기로 내용을 나누므로 칸 밖으로 나가지 않게 한다.
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const { selectionStart: a, value } = input, startOfLine = value.lastIndexOf('\n', a - 1) + 1;
    if (e.shiftKey) {
      const cut2 = value.slice(startOfLine).match(/^ {1,2}/)?.[0].length || 0;
      input.value = value.slice(0, startOfLine) + value.slice(startOfLine + cut2);
      input.selectionStart = input.selectionEnd = Math.max(startOfLine, a - cut2);
    } else {
      input.value = value.slice(0, startOfLine) + '  ' + value.slice(startOfLine);
      input.selectionStart = input.selectionEnd = a + 2;
    }
    update();
  });
  openModal(el('section', { class: 'cv-find-box cv-outline-box', 'aria-labelledby': 'cv-outline-title', onKeydown: escCloses },
    el('h2', { id: 'cv-outline-title', text: '개요로 장 만들기' }),
    el('p', { class: 'cv-down-note', text: '발표할 차례를 적으면 장마다 제목과 내용을 놓아 한꺼번에 만들어요. 다른 곳에 쓴 개요를 붙여 넣어도 돼요.' }),
    // 넓은 화면: 왼쪽은 개요 쓰기, 오른쪽은 장 모양과 미리 보기(좁으면 위아래로)
    el('div', { class: 'cv-outline-cols' },
      el('div', { class: 'cv-outline-write' }, ai, input, el('div', { class: 'cv-find-opts' }, sample, el('span', { class: 'cv-down-note', text: 'Tab: 들여 쓰기 · Shift+Tab: 내어 쓰기' }))),
      el('div', { class: 'cv-outline-look' }, el('div', { class: 'cv-outline-style-row' }, el('b', { text: '장 모양' }), styles), result, list)),
    el('div', { class: 'cv-find-actions' }, el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal }, '닫기'), make)), { wide: true, onClose: () => { asking?.abort(); clearTimeout(thumbTimer); O.editor.refresh(); } });
  update();
  requestAnimationFrame(() => (ai ? ai.querySelector('textarea') : input).focus());
}
// 리허설이 끝나면: 장마다 잰 시간을 보여 주고 저장할지 묻는다. 저장한 시간은 자동 넘기기와 영상 만들기에서 그 장의 머무는 시간이 된다.
function offerRehearsal(O, list) {
  if (O.closed) return;
  const mine = new Map(list.filter(([id]) => O.slides.some((p) => p.id === id)));
  const total = list.reduce((sum, [, s]) => sum + s, 0);
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const rows = O.slides.map((p, i) => (mine.has(p.id) ? el('li', {}, el('b', { text: `${i + 1}장` }), el('span', { text: clock(mine.get(p.id)) })) : null)).filter(Boolean);
  const save = () => {
    closeModal();
    O.slides[O.at] = O.editor.getDesign();
    O.slides = O.slides.map((p) => (mine.has(p.id) ? { ...p, dur: Math.min(DUR_LIMIT, mine.get(p.id)) } : p));
    O.editor.setDesign(O.slides[O.at]);
    renderStrip(O);
    touched(O);
    toast('장마다 잰 시간을 저장했어요. 발표에서 A(자동 넘기기)와 영상 만들기가 이 시간을 써요.', 4000);
  };
  openModal(el('section', { class: 'cv-find-box', 'aria-labelledby': 'cv-rehearse-title', onKeydown: escCloses },
    el('h2', { id: 'cv-rehearse-title', text: `리허설 · 모두 ${clock(total)}` }),
    el('ol', { class: 'cv-rehearse-list' }, ...rows),
    list.length > mine.size ? el('p', { class: 'cv-down-note', text: '다른 파트의 장은 그 파트를 열고 리허설해야 저장돼요.' }) : null,
    el('p', { class: 'cv-down-note', text: '저장하면 자동 넘기기(발표 중 A)와 영상 만들기에서 장마다 이 시간만큼 머물러요. 장 메뉴에서 장마다 지울 수 있어요.' }),
    el('div', { class: 'cv-find-actions' },
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal }, '버리기'),
      el('button', { class: 'btn btn-primary', type: 'button', onClick: save, disabled: !mine.size }, '장마다 저장'))));
}
// 주제 이름 붙이기: 이 장부터 새 주제가 시작된다(비우면 주제를 없앤다).
function openTopic(O) {
  if (O.closed || videoBusy(O) || O.inlineImport) return;
  const now = O.editor.getDesign().topic || '';
  const input = el('input', { class: 'cv-find-input', type: 'text', 'aria-label': '주제 이름', placeholder: '예: 1. 생각 열기', maxlength: String(TOPIC_LIMIT), value: now });
  const save = () => {
    const topic = cleanTopic(input.value);
    closeModal();
    if (topic === now) return;
    O.editor.patchSlide({ topic });
    renderStrip(O);
    toast(topic ? `이 장부터 「${topic}」 주제예요. 발표의 전체 보기(G)에서 주제별로 모여요.` : '이 장의 주제를 없앴어요.', 3500);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save(); } });
  openModal(el('section', { class: 'cv-find-box', 'aria-labelledby': 'cv-topic-title', onKeydown: escCloses },
    el('h2', { id: 'cv-topic-title', text: now ? '주제 이름 고치기' : '여기서 주제 시작' }),
    el('p', { class: 'cv-down-note', text: '이 장부터 다음 주제 앞까지가 한 주제예요(파워포인트의 구역과 같아요). 발표 중 G 를 누르면 주제별로 모여 보이고, 주제 이름을 누르면 그 주제로 확대해 들어가요.' }),
    el('label', { class: 'cv-find-row' }, el('span', { text: '이름' }), input),
    el('div', { class: 'cv-find-actions' },
      now ? el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { input.value = ''; save(); } }, '주제 없애기') : null,
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal }, '닫기'),
      el('button', { class: 'btn btn-primary', type: 'button', onClick: save }, '저장'))));
  requestAnimationFrame(() => { input.focus(); input.select(); });
}
function setSlideHidden(O, hidden) {
  if (O.closed || videoBusy(O)) return;
  O.editor.patchSlide({ hidden });
  renderStrip(O);
  toast(hidden ? '이 장은 발표할 때 건너뛰어요. 지우지 않았고, 편집·저장·PPTX 에는 그대로 있어요.' : '이 장을 다시 발표에 넣었어요.', 3500);
}
function goSlide(O, i) {
  if (O.closed || i === O.at || !O.slides[i] || videoBusy(O)) return;
  O.slides[O.at] = O.editor.getDesign();
  O.at = i;
  O.editor.setDesign(O.slides[i]);
  renderStrip(O);
  // Selection is immediate; entrance motion belongs to presentation, not editing.
}
/** 슬라이드 목록을 바꾼다(더하기·복제·지우기·옮기기). change(slides, at) 는 [새 목록, 이어서 꾸밀 번호] 를 돌려준다. */
function changeSlides(O, change) {
  if (O.closed || videoBusy(O)) return;
  O.slides[O.at] = O.editor.getDesign();
  const before = O.slides;
  const was = O.at;
  const [next, at] = change(O.slides, O.at);
  if (at < 0) { toast(`슬라이드는 ${MAX_SLIDES}장까지 만들 수 있어요.`, 3500); return; }
  if (next === O.slides) return;
  O.slides = next;
  O.at = at;
  O.editor.setDesign(O.slides[at]);
  renderStrip(O);
  // 보이는 장이 바뀌었으면(더하기·복제·지우기) 그림이 들어오는 것처럼 보여 준다. 같은 장의 순서만 옮겼으면 그림은 그대로 둔다.
  if (next[at] !== before[was]) slideIn(stageCard(O), Math.sign(at - was));
  if (next.length > before.length) ease(O.strip.querySelector('.cv-slide.on'), [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], 240);
  touched(O);
}

/** 움직임 칸의 "모든 장에 똑같이": 지금 장의 조합 효과와 전환 효과를 다른 장들에도 적는다(요소 하나하나의 효과는 그대로 둔다). */
function applyMotionAll(O, motion) {
  if (O.closed) return;
  const others = O.slides.length - 1;
  if (others < 1) { toast('아직 한 장뿐이에요. 새 장을 더하면 이 장의 움직임을 이어받아요.', 3500); return; }
  const same = slideMotion(motion);
  O.slides = O.slides.map((d, i) => (i === O.at ? d : withSlideMotion(d, same)));
  // 다른 장까지 바꿨으므로 실행 취소로는 지금 장만 되돌아가 어긋난다. 되돌리기 기록을 비운다(모양을 바꿀 때와 같다).
  O.editor.forget();
  renderStrip(O);
  touched(O);
  const nameOf = (list, id) => list.find((k) => k.id === id)?.name || '없음';
  toast(`다른 ${others}장도 맞췄어요. 조합 효과: ${nameOf(COMBOS, same.pa)} · 전환 효과: ${nameOf(TRANSITIONS, same.tr)}`, 4000);
}

// Activities are local, typed page data. Both hosts use the same runtime and
// pin a new material revision before acknowledging a result. No app URL opens.
function updateActivityTools(O){
  const edit=O.strip.querySelector('[data-edit-activity]'),activity=O.editor.getDesign().activity;if(edit)edit.hidden=!activityAuthoring||!activity||activity.kind==='gai-app'&&!appMaker;
}
function lessonPages(O){
  if(O.materialLoadError)throw Error('PPT 전체 자료를 읽지 못했어요. 내 자료에서 다시 열어주세요.');
  return O.materialDeck?materialPages(O):currentSlides(O).map((page,index)=>({record:{...O.record,slides:currentSlides(O)},page,index}));
}
const lessonTarget=O=>({kind:O.materialDeck?'material':'document',id:O.materialDeck?.materialRef.id||O.record.id});
async function importLessonResults(O){
 if(O.closed||O.inlineImport||O.activityBusy||videoBusy(O))return;
 try{
  if(O.materialLoadingPromise)await O.materialLoadingPromise;await persistEditorAction(O);
  const snapshot=()=>({target:lessonTarget(O),records:O.materialDeck?O.materialDeck.documents.map(row=>row.id===O.record.id?structuredClone(O.persistedRecord):structuredClone(row)):[structuredClone(O.persistedRecord)],pageOrder:lessonPages(O).map(v=>v.page.id)});
  openLessonResults({snapshot,onSave:async plan=>{
   if(O.closed||O.activityBusy)throw Error('현재 작업을 마친 뒤 다시 시도해주세요.');
   O.activityBusy=true;app.inert=true;
   try{
    if(!plan.added.length)return;
    const first=plan.added[0];
    if(O.materialDeck){
     if(!materialNavigation.saveResults)throw Error('결과 저장 연결을 확인해주세요.');
     const deck=await materialNavigation.saveResults({designId:O.record.id,materialRef:O.materialDeck.materialRef,documents:plan.documents,pageOrder:plan.pageOrder,expectedDocuments:plan.expectedDocuments});
     O.materialDeck={...deck,documents:deck.documents.map(migrateRecord)};selectActivityRecord(O,O.materialDeck.documents.find(d=>d.id===first.documentId),first.pageId);
     if(deck.recoveryRequired){O.recoveryRequired=true;O.localOk=false;O.dirty=false;clearTimeout(O.timer);O.shell.inert=true;}
     for(const warning of deck.warnings||[])toast(warning,6500);
    }else await commitActivityDocument(O,plan.documents[0],plan.pageOrder,first.pageId,plan.expectedDocuments[0]);
    if(O.recoveryRequired)await closeDesign(O);else setStatus(O,'HTML 결과를 새 저장본에 저장했어요');
   }finally{O.activityBusy=false;app.inert=false;}
  }});
 }catch(error){toast(error.message||'자료를 저장한 뒤 다시 시도해주세요.');}
}
function selectActivityRecord(O,record,pageId){
  const ready=migrateRecord(record);O.persistedRecord=structuredClone(ready);O.record={...ready};delete O.record.slides;
  O.slides=ready.slides;O.at=Math.max(0,ready.slides.findIndex(p=>p.id===pageId));
  clearTimeout(O.timer);clearTimeout(O.thumbTimer);O.dirty=false;O.saved=true;O.localOk=true;
  O.nameInput.value=ready.name;setupApp(ready);markRatio(O,O.shapes);
  O.editor.setUploads(libraryOf(ready.uploads,ready.slides));O.editor.setDesign(O.slides[O.at]);
  upsert(ready);renderStrip(O);setStatus(O,'활동과 결과를 이 기기에 저장했어요');
}
async function commitActivityDocument(O,document,pageOrder,selectedPageId,expectedDocument){
  if(O.recoveryRequired)throw Error('전체 자료에는 저장했어요. 발표를 끝내고 내 자료에서 다시 열어주세요.');
  if(O.materialDeck){
    if(!materialNavigation?.saveActivity)throw Error('이 자료의 활동 저장 기능을 연결하지 못했어요.');
    const deck=await materialNavigation.saveActivity({designId:document.id,materialRef:O.materialDeck.materialRef,document,pageOrder,expectedDocument});
    O.materialDeck={...deck,documents:deck.documents.map(migrateRecord)};
    const ready=O.materialDeck.documents.find(row=>row.id===document.id);
    selectActivityRecord(O,ready,selectedPageId);
    if(deck.recoveryRequired){O.recoveryRequired=true;O.localOk=false;O.shell.inert=true;clearTimeout(O.timer);clearTimeout(O.thumbTimer);O.dirty=false;toast('전체 자료에는 저장했어요. 다른 창의 초안을 보존하기 위해 편집을 마쳐요. 내 자료에서 고정 저장본을 확인해주세요.',8000);}
    for(const warning of deck.warnings||[])toast(warning,6500);
  }else{
    const ready=await replaceDesignIfUnchanged(document,expectedDocument);
    selectActivityRecord(O,ready,selectedPageId);if(accountFor(ready))pusher.queue(ready);
  }
}
async function configureActivity(O,editing=false){
  if(!activityAuthoring)return;
  if(editing&&O.editor.getDesign().activity?.kind==='gai-app')return configureGaiActivity(O,true);
  if(O.closed||O.leaving||O.inlineImport||O.activityBusy||videoBusy(O))return;
  if(O.materialLoadingPromise)await O.materialLoadingPromise;
  if(O.closed||S.open!==O||O.recoveryRequired)return;
  if(O.materialLoadError){toast('PPT 전체 자료를 읽지 못했어요. 내 자료에서 다시 열어주세요.');return;}
  clearTimeout(O.thumbTimer);
  O.activityConfig?.remove();
  const selected=O.editor.getDesign(),activity=editing?selected.activity:undefined;
  if(editing&&!activity)return;
  const host=el('section',{class:'cv-activity-config','aria-label':'픽셀아트 활동 만들기'});
  const cancel=()=>{host.remove();if(O.activityConfig===host)O.activityConfig=null;};
  host.append(createPixelArtSetup({activity,onCancel:cancel,onApply:async value=>{
    if(O.closed||O.activityBusy)throw Error('현재 작업을 마친 뒤 다시 시도해주세요.');
    O.activityBusy=true;app.inert=true;
    try{
      await persistEditorAction(O);
      const entries=lessonPages(O),at=entries.findIndex(v=>v.page.id===selected.id);
      if(at<0)throw Error('선택한 쪽이 바뀌었어요. 다시 선택해주세요.');
      let record={...O.record,slides:currentSlides(O)};
      if(!editing){
        // Keep each existing part bounded and reserve room for its first result.
        const candidates=O.materialDeck?[record,...O.materialDeck.documents.filter(row=>row.id!==record.id)]:[record];
        record=candidates.find(row=>row.slides.length<=MAX_SLIDES-2&&new TextEncoder().encode(JSON.stringify(row)).length<500000);
        if(!record)throw Error('활동과 결과를 넣을 공간이 부족해요. 새 그림에 활동을 만들어주세요. 기존 자료는 그대로예요.');
      }
      const page={...pixelArtCover(value,aspectOf(record),pixelArtImage(value)),id:editing?selected.id:newId('p'),
        source:editing?selected.source:{kind:'local'},origin:editing?selected.origin:{documentId:O.record.id,pageId:selected.id,revision:O.record.revision},activity:value};
      const slides=[...record.slides],ids=entries.map(v=>v.page.id);
      if(editing)slides[slides.findIndex(p=>p.id===selected.id)]=page;
      else{const local=slides.findIndex(p=>p.id===selected.id);slides.splice(local<0?slides.length:local+1,0,page);ids.splice(at+1,0,page.id);}
      await commitActivityDocument(O,{...record,slides},ids,page.id,record.id===O.record.id?O.persistedRecord:record);cancel();
      if(O.recoveryRequired)await closeDesign(O);
    }finally{O.activityBusy=false;app.inert=false;}
  }}));
  O.activityConfig=host;O.shell.querySelector('.cv-canvas').append(host);
  host.querySelector('input')?.focus({preventScroll:true});
}

async function configureGaiActivity(O,editing=false){
  if(!activityAuthoring||!appMaker||O.closed||O.leaving||O.inlineImport||O.activityBusy||videoBusy(O))return;
  if(O.materialLoadingPromise)await O.materialLoadingPromise;
  if(O.closed||S.open!==O||O.recoveryRequired)return;
  if(O.materialLoadError){toast('PPT 전체 자료를 읽지 못했어요. 내 자료에서 다시 열어주세요.');return;}
  try{await persistEditorAction(O);}catch{toast('현재 그림을 저장하지 못했어요. 저장 상태를 확인한 뒤 앱을 만들어주세요.');return;}
  if(O.closed||S.open!==O)return;
  clearTimeout(O.thumbTimer);O.activityConfig?.remove();
  const selected=O.editor.getDesign(),activity=editing?selected.activity:undefined;
  if(editing&&activity?.kind!=='gai-app')return;
  const host=el('section',{class:'cv-activity-config','aria-label':'가이X 앱 만들기'});
  const cancel=()=>{host.remove();if(O.activityConfig===host)O.activityConfig=null;};
  const maker=createGaiMaker({provider:appMaker,activity,
    context:gaiLessonContext(lessonPages(O),selected.id,O.materialDeck?.title||O.record.name),
    entries:lessonPages(O),selectedId:selected.id,title:O.materialDeck?.title||O.record.name,
    previewSlide:(row,width)=>slideView(row.page,aspectOf(row.record),width),
    referenceImage:async(row,position)=>{
      for(const width of [800,560,360]){
        const {blob}=await designToBlob(row.page,{width,aspect:aspectOf(row.record),type:'image/jpeg',quality:.8});
        if(blob.size<=300*1024){const data=await new Promise((yes,no)=>{const reader=new FileReader();reader.onload=()=>yes(reader.result.split(',')[1]);reader.onerror=no;reader.readAsDataURL(blob);});return {name:`온바탕 ${position}쪽.jpg`,mimeType:'image/jpeg',data};}
      }
      throw Error('참고 화면이 너무 커요. 화면 전달을 끄고 글로 요청해주세요.');
    },
    draftKey:JSON.stringify([storageName(),O.record.id,selected.id,O.record.revision,editing?'edit':'new']),onCancel:cancel,
    onApply:async(value,{afterPageId=selected.id}={})=>{
      if(O.closed||O.activityBusy||S.open!==O)throw Error('현재 작업을 마친 뒤 다시 시도해주세요.');
      O.activityBusy=true;app.inert=true;
      try{
        await persistEditorAction(O);
        const entries=lessonPages(O),anchor=editing?selected.id:afterPageId,at=entries.findIndex(v=>v.page.id===anchor);
        if(at<0)throw Error('선택한 쪽이 바뀌었어요. 다시 선택해주세요.');
        const origin=entries[at];let record=origin.record.id===O.record.id?{...O.record,slides:currentSlides(O)}:origin.record;
        const id=editing?selected.id:newId('p');
        const makePage=row=>({...gaiAppCover(value,aspectOf(row)),id,source:editing?selected.source:{kind:'local'},origin:editing?selected.origin:{documentId:origin.record.id,pageId:anchor,revision:origin.record.revision},activity:value});
        const updated=row=>{
          const slides=[...row.slides],page=makePage(row),local=slides.findIndex(p=>p.id===anchor);
          if(editing){if(local<0)throw Error('수정할 앱을 다시 선택해주세요.');slides[local]=page;}
          else slides.splice(local<0?slides.length:local+1,0,page);
          return {...row,slides};
        };
        if(!editing){
          const candidates=O.materialDeck?[record,...O.materialDeck.documents.filter(row=>row.id!==record.id).map(row=>row.id===O.record.id?{...O.record,slides:currentSlides(O)}:row)]:[record];
          record=candidates.find(row=>row.slides.length<=MAX_SLIDES-2&&new TextEncoder().encode(JSON.stringify(updated(row))).length<460000);
          if(!record)throw Error('이 자료에 앱과 결과를 넣을 공간이 부족해요. 대화는 남아 있어요. 가이X에게 더 작은 앱으로 줄여 달라고 요청해주세요.');
        }
        const document=updated(record);
        if(new TextEncoder().encode(JSON.stringify(document)).length>500000)throw Error('앱이 너무 커서 저장하지 않았어요. 더 작은 앱으로 줄여 달라고 요청해주세요.');
        const ids=entries.map(v=>v.page.id);if(!editing)ids.splice(at+1,0,id);
        await commitActivityDocument(O,document,ids,id,record.id===O.record.id?O.persistedRecord:record);cancel();
        if(O.recoveryRequired)await closeDesign(O);
      }finally{O.activityBusy=false;app.inert=false;}
    }});
  host.append(maker);const remove=host.remove.bind(host);host.remove=()=>{maker.dispose();remove();};
  O.activityConfig=host;O.shell.querySelector('.cv-canvas').append(host);
}

// ---------- 발표: 화면 가득 한 장씩 보여 준다 ----------
// 움직임(src/motion.js): 다음 장으로 갈 때 그 장의 전환 효과로 넘어오고, 이어서 요소들이 나타난다.
// "누를 때" 나오는 요소가 있으면, 넘기는 글쇠·누르기가 먼저 그것을 하나씩 나타나게 하고, 다 나온 뒤에 다음 장으로 간다.
// 앞 장으로 돌아갈 때는 그 장의 다 나온 모습을 보여 준다. 움직임을 줄여 달라고 해 둔 기기에서는 움직이지 않고 바로 보인다.
// 영상 장면이 있는 장은 그 장이 열리면 영상이 소리와 함께 저절로 틀어지고(쓰는 구간만), 끝나면 마지막 모습에서 멈춘다.
// 아래 막대의 단추로 멈추거나 다시 틀 수 있다. 다른 장으로 넘어가면 멈춘다.
async function present(O) {
  if (videoBusy(O)||O.activityBusy||O.inlineImport) return;
  try{await persistEditorAction(O);if(O.materialLoadingPromise)await O.materialLoadingPromise;if(O.materialLoadError)throw O.materialLoadError;}catch{toast('전체 자료를 준비하지 못했어요. 저장 상태를 확인하고 내 자료에서 다시 열어주세요.');return;}
  stopTour();
  O.editor.quiet();          // 꾸미기 판에서 틀어 보던 영상을 멈추고 카메라를 끈다(발표 화면 뒤에서 소리가 나지 않게)
  // 그리는 것과 움직임의 차례가 같은 요소를 가리키도록, 정리한 디자인 하나로 둘 다 한다(그릴 때와 같은 방법으로 정리한다).
  // 숨긴 장은 발표에서 건너뛴다(지우지 않는다). 지금 장이 숨긴 장이면 그다음 보이는 장부터.
  const showable=()=>lessonPages(O).filter(v=>!v.page.hidden);
  const everyPage=lessonPages(O),here=Math.max(0,everyPage.findIndex(v=>v.page.id===O.editor.getDesign().id));
  let entries=showable(),slides=entries.map(v=>cleanDesign(v.page,{keepSpaces:true}));
  if(!entries.length){toast('모든 장을 숨겼어요. 발표할 장의 숨기기를 풀어주세요.',4000);return;}
  const aspect = aspectOf(O.record),working=new Map(),savedResults=new Map();
  let i=Math.max(0,entries.findIndex(v=>everyPage.findIndex(w=>w.page.id===v.page.id)>=here)),savingActivity=false,closed=false;
  let pixel=null;
  let tools = null;          // 발표 도구(검은 화면 · 펜 · 레이저 · 전체 보기 · 발표자 화면 …, show-tools.js)
  let parts = null;          // 지금 장의 요소 움직임(조종기)
  let turning = null;        // 틀고 있는 전환 효과
  let leaving = null;        // 나가는 중인 장(전환이 끝나면 뗀다)
  let film = null;           // 지금 장의 영상 조종기(영상 장면이 없는 장이면 null)
  let filmTimer = 0;
  const films = new WeakMap();      // 장(그린 요소) → 그 장의 영상 조종기
  // 유튜브 영상(장마다 미리 불러 둔다): 스페이스 바로 튼다(누를 때 나오는 요소들 다음 차례). 틀고 있는 동안 스페이스 바는 멈추기·다시 틀기다.
  const tubes = new WeakMap();      // 장 → 그 장의 유튜브 조종기들
  let tube = [];                    // 지금 장의 유튜브 조종기들
  let tubeTimer = 0;
  const tubeNow = () => tube.find((p) => p.started) || null;
  const stage = el('div', { class: 'cv-show-stage' });
  const count = el('span', { class: 'cv-show-count' });
  const btn = (label, title, onClick) => el('button', { class: 'cv-show-key', type: 'button', title, 'aria-label': title, onClick: (e) => { e.stopPropagation(); onClick(); } }, label);
  // 영상 장면이 있는 장에서만 보이는 단추: 틀고 있으면 "멈추기", 멈춰 있으면 "틀기".
  const toggleFilm = () => {
    if (!film && tube.length) { (tubeNow() || tube[0]).toggle(); return; }
    if (!film) return;
    clearTimeout(filmTimer);
    if (film.playing) film.pause(); else film.play();
  };
  const filmBtn = btn(ic('pause'), '영상 멈추기 (K)', toggleFilm);
  filmBtn.classList.add('cv-show-film');
  const markFilm = () => {
    const media = film || tubeNow() || tube[0] || null;
    filmBtn.hidden = !media;
    if (!media) return;
    const title = media.playing ? '영상 멈추기' : '영상 틀기';
    filmBtn.replaceChildren(ic(media.playing ? 'pause' : 'play'));
    filmBtn.title = `${title} (K)`;
    filmBtn.setAttribute('aria-label', title);
  };
  // 장을 뗀다(그 장의 영상도 함께 치운다).
  const drop = (view) => {
    films.get(view)?.destroy();
    films.delete(view);
    tubes.get(view)?.forEach((p) => p.destroy());
    tubes.delete(view);
    view.remove();
  };
  // 지금 장의 영상을 준비하고, delay(ms) 뒤에 처음부터 튼다. 영상 장면이 없는 장이면 단추를 감춘다.
  const startFilm = (view, design, delay) => {
    clearTimeout(filmTimer);
    film?.pause();                     // 나가는 장의 영상은 멈춘다(마지막에 보이던 모습 그대로 넘어간다)
    film = null;
    const layer = design.video ? view.querySelector(':scope > .fe-scene') : null;
    if (layer) {
      const mine = film = scenePlayer(layer, design.video, { onState: () => { if (film === mine) markFilm(); } });
      films.set(view, mine);
      filmTimer = setTimeout(() => { if (film === mine) mine.play({ from: design.video.in }); }, delay);
      // 파일이 이 기기에 없으면 틀 것이 없다: 단추를 감춘다
      mine.ready.then((ok) => { if (!ok && film === mine) { film = null; markFilm(); } });
    }
    // 유튜브: 나가는 장의 영상은 멈추고, 들어오는 장의 영상을 미리 불러 둔다. "장이 열리면 바로 틀기"로 정한 것은 저절로 튼다.
    clearTimeout(tubeTimer);
    for (const p of tube) if (p.started) p.pause();
    tube = youTubePlayers(view, { onState: () => markFilm() });
    tubes.set(view, tube);
    const autos = tube.filter((p) => p.auto);
    if (autos.length) tubeTimer = setTimeout(() => { for (const p of autos) if (!p.started) p.play(); }, delay + 400);
    markFilm();
  };
  // 틀던 전환을 바로 끝내고 나가던 장을 뗀다.
  const shownDesigns = new WeakMap();   // 발표 화면에 그린 카드 → 그 장의 디자인(이어 움직이기가 짝을 찾는다)
  let rehearsed = null;                 // 리허설로 잰 시간 [[장 id, 초]] (발표를 끝낸 뒤 저장할지 묻는다)
  const settle = () => {
    turning?.finish();
    turning = null;
    if (leaving) drop(leaving);
    leaving = null;
  };
  const draw = (dir = 0) => {
    pixel?.destroy();pixel=null;
    settle();
    tools?.changed();
    const design = slides[i];
    const ar=aspectOf(entries[i].record);
    overlay.style.setProperty('--cv-show-ratio',String(ar));
    const view = slideView(design, ar, 1920);
    view.style.setProperty('--fe-card-radius', '0');
    shownDesigns.set(view, design);
    const old = stage.firstElementChild;
    count.textContent = `${i + 1} / ${slides.length}`;
    if(design.activity){
      for(const n of [...stage.children])drop(n);film?.pause();for(const p of tube)p.pause();film=null;tube=[];markFilm();parts=null;
      const host=el('section',{class:'cv-show-activity',dataset:{pixelApp:''}});stage.append(host);
      const gai=design.activity.kind==='gai-app',activity=gai?{...design.activity,state:working.get(design.id)||design.activity.state}:{...design.activity,cells:working.get(design.id)||design.activity.cells};
      pixel=(gai?mountGaiApp:mountPixelArt)(host,{activity,onKey:appKey,onChange:value=>working.set(design.id,value),onSave:async cells=>{
        if(savingActivity||closed)return;
        savingActivity=true;
        try{
          const signature=JSON.stringify([design.id,cells]),prior=savedResults.get(signature);
          if(prior&&slides.some(p=>p.id===prior)){i=slides.findIndex(p=>p.id===prior);draw(1);return;}
          const source=entries.find(v=>v.page.id===design.id),record=source.record.id===O.record.id?{...O.record,slides:currentSlides(O)}:source.record;
          if(record.slides.length>=MAX_SLIDES)throw Error('이 활동의 저장 공간이 가득 찼어요. 이전 결과 쪽을 정리한 뒤 다시 저장해주세요.');
          const updated=gai?cleanGaiActivity({...design.activity,state:cells.state}):{...design.activity,cells:[...cells]},result=gai?gaiAppResult(updated,cells,aspectOf(record)):pixelArtResult(updated,cells,aspectOf(record),pixelArtImage(updated));
          result.origin={documentId:record.id,pageId:design.id,revision:record.revision};
          const next=record.slides.map(p=>p.id===design.id?{...p,activity:updated}:p),index=next.findIndex(p=>p.id===design.id);
          // 전체 자료의 쪽 순서는 숨긴 장까지 모두 넣어 저장한다(발표 목록은 숨긴 장을 빼고 보여 줄 뿐이다).
          next.splice(index+1,0,result);const ids=lessonPages(O).map(v=>v.page.id);ids.splice(ids.indexOf(design.id)+1,0,result.id);
          await commitActivityDocument(O,{...record,slides:next},ids,result.id,record.id===O.record.id?O.persistedRecord:record);
          working.set(design.id,gai?cells.state:[...cells]);savedResults.set(signature,result.id);
          if(gai&&cells.imageOmitted)toast('앱 화면 그림은 생략하고 답과 진행 상태를 저장했어요.');
          entries=showable();slides=entries.map(v=>cleanDesign(v.page,{keepSpaces:true}));i=slides.findIndex(p=>p.id===result.id);draw(1);
        }finally{savingActivity=false;}
      }});
      ease(host,[{opacity:0,transform:'scale(.965)'},{opacity:1,transform:'scale(1)'}],260);return;
    }
    if (!dir || !old) {
      for (const n of [...stage.children]) drop(n);
      stage.append(view);
      parts = playDesign(view, design, { delay: 300 });          // 발표 화면이 뜬 뒤에 요소들이 나온다
      startFilm(view, design, 300);
      return;
    }
    stage.append(view);
    // 다음 장으로: 그 장의 전환 효과. 앞 장으로: 방금 보던 장이 들어올 때의 전환을 거꾸로.
    // 이어 움직이기는 두 장의 같은 요소를 짝지어야 하므로 두 장의 디자인을 함께 넘긴다.
    const turn = playTransition(old, view, dir > 0 ? design.tr : slides[i + 1]?.tr, dir, { from: shownDesigns.get(old), to: design });
    startFilm(view, design, turn.ms);
    if (turn.ms) {
      turning = turn;
      leaving = old;
      turn.done.then(() => { if (turning === turn) settle(); });
    } else {
      drop(old);
      ease(view, [{ opacity: 0, transform: `translateX(${dir * 4}%)` }, { opacity: 1, transform: 'none' }], 260);
    }
    parts = playDesign(view, design, { delay: turn.ms, still: dir < 0 });
  };
  const go = (step) => {
    if(savingActivity)return;
    if (step > 0) {
      // 움직이는 중에 넘기면 그 움직임은 바로 끝낸다. 누를 때 나오는 것이 남아 있으면 그것부터 하나 나타나게 한다.
      settle();
      parts?.finish();
      if (parts?.next()) return;
      // 아직 틀지 않은 유튜브 영상이 있으면 그것을 튼다(영상도 발표의 한 차례다).
      const waiting = tube.find((p) => !p.started);
      if (waiting) { waiting.play(); return; }
    }
    const to = i + step;
    if (to < 0) return;
    if (to >= slides.length) { close(); return; }      // 마지막 장에서 더 넘기면 끝난다
    i = to;
    draw(step);
  };
  // 번호·처음·끝·전체 보기로 그 쪽에 바로 간다(앞으로 가면 그 장의 전환으로, 뒤로 가면 거꾸로).
  const jump = (to) => {
    if (savingActivity) return;
    to = Math.max(0, Math.min(slides.length - 1, to));
    if (to === i) return;
    const dir = to > i ? 1 : -1;
    i = to;
    draw(dir);
  };
  // 앱 안을 누른 뒤에도 프레젠터(리모컨)의 넘기기 단추와 Esc 는 발표가 듣는다(앱이 그 글쇠를 쓰지 않았을 때 앱이 알려 준다).
  const appKey = (key) => { if (['PageDown', 'PageUp', 'Escape'].includes(key)) tools?.handle({ key, code: key }); };
  const onKey = (e) => {
    // 앱·그림판 안에서 치는 글쇠는 앱의 것이다. 프레젠터의 넘기기(PageDown · PageUp)와 Esc 만 발표가 듣는다.
    if(e.target?.closest?.('.cv-show-activity')&&!['Escape','PageDown','PageUp'].includes(e.key))return;
    // 아래 막대의 단추에 초점이 있을 때 스페이스 · 엔터는 그 단추를 누르는 글쇠다(다음 장으로 넘기지 않는다).
    if ((e.key === ' ' || e.key === 'Enter') && e.target?.closest?.('.cv-show-key')) { e.stopPropagation(); return; }
    // 유튜브를 틀었으면 스페이스 바는 멈추기 · 다시 틀기다(다음 장은 → · PageDown · 누르기).
    if (e.key === ' ' && tubeNow()) { e.preventDefault(); e.stopPropagation(); tubeNow().toggle(); return; }
    // 넘기기 · 번호로 가기 · 검은 화면 · 펜 · 전체 보기 · 발표자 화면 · K(영상) … 글쇠 약속은 show-keys.js 에 있다(HTML 수업과 같다).
    if (!tools?.handle(e)) return;
    e.preventDefault();
    e.stopPropagation();          // 발표하는 동안에는 글쇠가 편집기로 가지 않게 한다
  };
  // 전체 화면이 풀리면 발표를 끝낸다(Esc 로 푼 것). 다만 발표자 화면을 열면 브라우저가 전체 화면을 풀 수 있으므로,
  // 그때는 창 안에서 이어 간다(F 로 다시 켠다).
  const onFull = () => {
    if (document.fullscreenElement === overlay) { overlay.dataset.full = '1'; return; }
    if (document.fullscreenElement || overlay.dataset.full !== '1') return;
    overlay.dataset.full = '0';
    // 발표자 화면 창을 열거나 카메라 허락을 묻는 동안 브라우저가 전체 화면을 풀 수 있다: 그때는 창 안에서 이어 간다(F 로 다시 켠다).
    if (!tools?.presenting() && !tools?.camera()) close();
  };
  function close() {
    if(savingActivity)return;
    closed=true;pixel?.destroy();pixel=null;
    tools?.destroy();tools=null;
    settle();
    clearTimeout(filmTimer);
    clearTimeout(tubeTimer);
    film = null;
    tube = [];
    for (const n of [...stage.children]) drop(n);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('fullscreenchange', onFull);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    overlay.remove();
    document.body.classList.remove('modal-open');
    if(O.recoveryRequired){closeDesign(O);return;}
    if(rehearsed?.length)offerRehearsal(O,rehearsed);
  }
  const overlay = el('div', { class: `cv-show${slides.some(page=>page.activity)?' cv-show-lesson':''}`, role: 'dialog', 'aria-label': '발표 화면', tabindex: '-1', onClick: e => {if(tools?.claimClick(e))return;if(!e.composedPath().some(n=>n.classList?.contains('cv-show-activity')))go(1);} },
    stage,
    el('div', { class: 'cv-show-bar' }, btn(ic('left'), '앞 장', () => go(-1)), count, btn(ic('right'), '다음 장', () => go(1)), filmBtn));
  overlay.style.setProperty('--cv-show-ratio', String(aspect));
  tools = createShowTools(overlay, {
    total: () => slides.length, index: () => i, next: () => go(1), prev: () => go(-1), go: jump, close, video: toggleFilm,
    ratio: (k) => aspectOf(entries[k].record),
    thumb: (k) => slideView(slides[k], aspectOf(entries[k].record), 480),
    preview: (k) => slideView(slides[k], aspectOf(entries[k].record), 960),
    notes: (k) => slides[k]?.notes || '',
    // 주제: 숨긴 장에서 시작한 주제는 그다음 보이는 장으로 넘긴다.
    topic: (k) => shownTopics(lessonPages(O).map((v) => v.page)).get(entries[k]?.page.id) || '',
    label: (k) => (slides[k]?.activity ? '활동' : entries[k]?.page.source?.kind === 'result' ? '결과' : ''),
    // 자동 넘기기: 리허설로 잰 시간(없으면 기본) · 누를 때 나오는 걸음 수. 리허설: 잰 시간을 발표가 끝난 뒤 저장할지 묻는다.
    dwell: (k) => slides[k]?.dur, steps: (k) => (slides[k] && !slides[k].activity ? planMotion(slides[k]).clicks.length : 0),
    saveTimes: (seconds) => { rehearsed = entries.map((v, k) => [v.page.id, seconds[k]]).filter(([, s]) => s != null); },
    title: O.record.name, notify: toast, keyClass: 'cv-show-key',
  });
  overlay.querySelector('.cv-show-bar').append(...tools.buttons, btn([ic('close'), '끝내기'], '발표 끝내기 (Esc)', close));
  document.body.append(overlay);
  document.body.classList.add('modal-open');
  draw();
  document.addEventListener('keydown', onKey, true);
  overlay.focus({ preventScroll: true });
  // 화면 가득 채워 본다(막힌 곳에서는 창 안에서 보여 준다).
  document.addEventListener('fullscreenchange', onFull);
  if (overlay.requestFullscreen) {
    overlay.requestFullscreen().then(() => { overlay.dataset.full = '1'; }).catch(() => {});
  }
}

function markRatio(O, shapes) {
  // 그림 칸은 이 비율로 남은 자리에 꼭 맞게 커진다(app.css 의 .cv-canvas).
  const aspect = aspectOf(O.record);
  const ratio = canvasRatioOf(O.record);
  if (O.ratioLabel) {
    O.ratioLabel.hidden = O.record.source?.kind !== 'pptx' && ratio.preset !== null;
    O.ratioLabel.textContent = ratio.label;
    O.ratioLabel.dataset.ratio = ratio.id;
    O.ratioLabel.classList.toggle('on', ratio.preset === null);
    O.ratioLabel.setAttribute('aria-current', String(ratio.preset === null));
    const source = O.record.originalSize;
    O.ratioLabel.title = ratio.original && source?.unit === 'emu'
      ? `원본 슬라이드 크기 ${Number((source.width / 360000).toFixed(3))} × ${Number((source.height / 360000).toFixed(3))}cm`
      : '저장된 슬라이드 크기의 정확한 가로·세로 비율이에요.';
  }
  O.shell?.style.setProperty('--cv-aspect', String(aspect));
  if (O.shell) O.shell.dataset.shape = aspect >= 1.3 ? 'wide' : aspect < 0.7 ? 'tall' : 'even';       // 옆 칸의 템플릿 줄 수를 정한다(app.css)
  for (const b of shapes.querySelectorAll('.cv-shape')) {
    const on = ratio.preset === b.dataset.ratio;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}
// '가로' → '로', '정사각형' → '으로' (받침이 있으면 '으로'. ㄹ 받침은 '로')
function toParticle(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '(으)로';
  const last = code % 28;
  return last === 0 || last === 8 ? '로' : '으로';
}
// 그림의 모양을 바꾼다. 놓아 둔 것이 있으면 어떻게 맞출지 먼저 묻는다(파워포인트에서 슬라이드 크기를 바꿀 때처럼).
function setRatio(O, id, shapes) {
  const r = ratioOf(id);
  if (O.closed || r.id === O.record.ratio || videoBusy(O)) return;
  const many = O.slides.length > 1;
  const apply = (fit) => {
    if (O.closed) return;
    const before = settings().aspect;
    O.record.ratio = r.id;
    const [width, height] = r.id.split(':').map(Number);
    O.record.size = { width, height, unit: 'px' };
    keepRatio(r.id);
    markRatio(O, shapes);
    const after = O.editor.setAspect(r.aspect, { fit });       // 지금 장. 요소가 있으면 onChange → touched 로 저장이 걸린다
    slideIn(stageCard(O));
    // 다른 장들도 같은 방법으로 맞춘다. 여러 장이면 실행 취소로는 지금 장만 되돌아가서 어긋나므로, 되돌리기 기록을 비운다.
    if (many) {
      O.slides = O.slides.map((d, i) => (i === O.at ? d : { bg: d.bg, items: reshapeItems(d.items, before, after, { fit }), ...slideExtra(d) }));
      O.editor.forget();
    }
    renderStrip(O);
    touched(O);
  };
  const design = O.editor.getDesign();
  if (!design.items.length && !O.slides.some((d, i) => i !== O.at && d.items.length)) { apply(false); return; }
  // 두 가지 결과를 미리 그려 본다(크기의 한도가 설정의 모양을 따르므로, 잠깐 새 모양으로 바꿔 놓고 그린 뒤 되돌린다).
  const from = settings().aspect;
  const to = configure({ aspect: r.aspect }).aspect;
  const made = [true, false].map((fit) => {
    const items = reshapeItems(design.items, from, to, { fit });
    return { fit, items, view: fitView(designView({ bg: design.bg, items }), to) };
  });
  configure({ aspect: from });
  // 두 결과가 똑같으면(예: 가운데에 하나만 있을 때) 묻지 않는다. 여러 장이면 다른 장에서는 다를 수 있으니 묻는다.
  if (!many && JSON.stringify(made[0].items) === JSON.stringify(made[1].items)) { apply(false); return; }
  const smaller = to > from;       // 더 납작해진다: 통째로 맞추면 요소가 작아진다
  const texts = {
    true: ['통째로 맞추기', smaller ? '지금 그림을 그대로 줄여서 새 모양 안에 넣어요. 겹치거나 잘리지 않아요.' : '지금 배치를 그대로 가운데에 놓아요. 위아래에 빈 곳이 생겨요.'],
    false: ['크기는 그대로', '글과 그림의 크기는 그대로 두고, 자리만 새 모양에 맞게 옮겨요.'],
  };
  const pick = (m) => el('button', {
    class: 'cv-fit', type: 'button', dataset: { fit: m.fit ? 'fit' : 'keep' },
    onClick: () => { closeModal(); apply(m.fit); },
  }, el('span', { class: 'cv-fit-view', 'aria-hidden': 'true' }, m.view), el('b', { text: texts[m.fit][0] }), el('small', { text: texts[m.fit][1] }));
  openModal(el('div', { class: 'cv-fit-ask' },
    el('h2', { text: `그림의 모양을 "${r.name}"${toParticle(r.name)} 바꿔요` }),
    el('p', { class: 'muted', text: many
      ? `${O.slides.length}장 모두 같은 방법으로 바뀌어요(아래는 지금 장). 여러 장일 때는 실행 취소로 되돌릴 수 없으니, 마음에 안 들면 예전 모양을 다시 골라요.`
      : '놓아 둔 것들을 어떻게 할까요? 바꾼 뒤에 마음에 안 들면 실행 취소로 되돌릴 수 있어요.' }),
    el('div', { class: 'cv-fits' }, ...made.map(pick)),
    el('div', { class: 'row cv-fit-foot' }, el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal }, '그만두기'))));
}

function setStatus(O, text, cls = '') {
  if (S.open !== O) return;
  O.status.textContent = text;
  O.status.title = text;
  O.status.className = `cv-status ${cls}`.trim();
  // 빨간 띠는 저장에 성공할 때까지 그대로 둔다(고칠 때마다 숨겼다 보였다 하면 그림 칸의 크기가 흔들린다).
  if (cls === 'bad') { O.alert.textContent = text; O.alert.hidden = false; }
  else if (cls === 'ok') { O.alert.textContent = ''; O.alert.hidden = true; }
}
function touched(O) {
  if (O.closed||O.recoveryRequired) return;
  clearTimeout(O.thumbTimer);
  O.thumbTimer = setTimeout(() => refreshThumb(O), 300);
  O.dirty = true;
  setStatus(O, '꾸미는 중…', 'busy');
  clearTimeout(O.timer);
  O.timer = setTimeout(() => save(O), SAVE_DELAY);
}
async function save(O, { preserveBlank = false, leaving = false } = {}) {
  clearTimeout(O.timer);
  O.timer = 0;
  if(O.recoveryRequired)return true; // The fixed receipt must never overwrite a conflicting draft.
  if (!O.dirty || O.closed) return true;       // 닫은 뒤에는 저장하지 않는다(치운 편집기는 빈 그림을 돌려준다)
  const slides = currentSlides(O);
  // 올린 파일 목록도 함께 적는다(편집기가 들고 있는 목록 + 다른 장에서 쓰는 사진).
  const record = { ...O.record, revision: ++O.record.revision, slides, uploads: libraryOf(O.editor.getUploads().map((u) => u.url), slides), updatedAt: Date.now(), synced: false };
  // 아직 아무것도 놓지 않은 새 그림은 저장하지 않는다(빈 그림이 목록에 쌓이지 않게).
  if (!preserveBlank && !O.saved && isBlank(record)) { O.dirty = false; setStatus(O, '꾸미기 시작하면 저절로 저장돼요'); return true; }
  O.dirty = false;
  // 창을 떠나는 중이면 이 기기의 저장소(IndexedDB)가 쓰기를 마치기 전에 창이 사라질 수 있다.
  // 그래서 곧바로 적히는 localStorage 에도 임시본을 남기고, 다음에 열 때 더 새것이면 되살린다(recoverDrafts).
  if (leaving) keepDraft(record);
  let ok = true;
  let kept = record;
  const put = putDesign(record);
  O.putting = put.catch(() => {});             // 나갈 때 이 저장이 끝났는지 기다릴 수 있게 둔다
  try {
    kept = await put;
    O.persistedRecord=structuredClone(kept);
    O.saved = true;
    dropDraft(kept.id);
    rememberOpen(O);
  } catch (ex) {
    console.error(ex);
    ok = false;
  }
  O.localOk = ok;                              // 이 기기에 적혔는지(영상 파일을 정리해도 되는지 볼 때 쓴다)
  if (ok) {
    upsert(kept);
    if (accountFor(kept)) pusher.queue(kept);
    if (typeof shareAction?.saved === 'function') { try { shareAction.saved(kept); } catch (error) { console.warn(error); } }   // 공유 링크가 있으면 호스트가 고친 것을 링크에도 반영한다
    if (!O.dirty) setStatus(O, accountFor(kept) ? '이 기기에 저장했어요 · 계정에 올리는 중…' : '이 기기에 저장했어요', 'ok');
    return true;
  }
  O.dirty = true;
  setStatus(O, '저장하지 못했어요. 기기의 저장 공간이 꽉 찼는지 확인하고, 그림을 내려받아 두세요.', 'bad');
  return false;
}
/** 꾸미던 것을 저장하고 편집기를 치운다. 저장했으면 true. */
async function leaveEditor(O, { requireSaved = false, waitForSync = false } = {}) {
  app.inert = true;                              // 나가는 동안에는 더 고치지 못하게 한다(그때 고친 것은 저장되지 않는다)
  if (O.putting) await O.putting;                // 저절로 걸린 저장이 아직 끝나지 않았으면 기다린다(끝난 뒤에 결과를 본다)
  let ok = await save(O);
  if (O.dirty) ok = await save(O);               // 저장하는 사이에 더 바뀐 것
  if (requireSaved && (!ok || O.dirty || O.localOk === false)) {
    app.inert = false;
    return false;
  }
  // 영상을 빼거나 바꿔서 이제 쓰지 않는 영상 파일을 이 기기에서 지운다(나가면 실행 취소로 되살릴 수 없다).
  // 지금 모습이 이 기기에 적힌 것이 확실할 때에만 지운다. 적히지 못했으면 예전 모습의 그림이 남아 있고,
  // 그 그림은 지우려던 영상을 아직 쓰고 있을 수 있다.
  if (ok && !O.dirty && O.localOk !== false) await tidyVideos(O.record.id, currentSlides(O));
  O.closed = true;
  forgetOpen();
  O.activityConfig?.remove();O.activityConfig=null;
  O.materialLoading?.dispose();
  O.stripDrag?.destroy();
  O.tray?.destroy();
  if (accountFor(O.record)) {
    const uploading = pusher.flush(O.record.id);
    if (waitForSync) await uploading;            // 바깥 화면으로 가면 이 앱이 닫히므로 올리기까지 기다린다
  }
  clearTimeout(O.timer);
  clearTimeout(O.thumbTimer);
  closeModal();
  O.editor.destroy();
  S.open = null;
  app.inert = false;
  return ok;
}
/**
 * 그 그림(designId)에 딸린 영상 파일 가운데 이제 아무 데서도 쓰지 않는 것을 이 기기에서 지운다.
 * slides: 그 그림의 지금 슬라이드들(그림을 지웠으면 빈 목록) · more: 그 밖에 살펴볼 열쇠들(지운 그림이 쓰던 것).
 * 이 기기의 다른 그림이 쓰는 파일은 지우지 않는다. 다른 그림들을 읽지 못했으면 아무것도 지우지 않는다.
 */
async function tidyVideos(designId, slides, more = []) {
  try {
    const files = await listVideos();
    if (!files.some((f) => f.design === designId) && !more.length) return;
    const others = [...(await listDesigns()), ...(S.list || [])].filter((r) => r.id !== designId);
    const gone = unusedVideos(files, designId, [...deckVideos(slides), ...others.flatMap((r) => deckVideos(r.slides))], more);
    if (!gone.length) return;
    await removeVideos(gone);
    for (const key of gone) dropScene(key);
  } catch (ex) {
    console.warn(ex);
  }
}
async function closeToHost(O, btn) {
  if (!onBrandClick || O.closed || O.leaving || moving || videoBusy(O)) return;
  O.leaving = true;
  btn.disabled = true;
  try {
    if (!await leaveEditor(O, { requireSaved: true, waitForSync: true })) {
      toast('저장하지 못해 이동하지 않았어요. 그림을 내려받거나 저장 공간을 확인해주세요.', 5000);
      return;
    }
    onBrandClick();
  } finally {
    O.leaving = false;
    btn.disabled = false;
    app.inert = false;
  }
}

/** Import navigation is opt-in. Keep the existing editor intact until local and
 * account persistence have both succeeded; never drop a new blank drawing. */
async function persistEditorAction(O) {
  if (O.putting) await O.putting;
  if (O.closed || S.open !== O) throw new Error('EDITOR_BUSY');
  if (!O.saved) O.dirty = true;
  let ok = await save(O, {preserveBlank: true});
  if (O.dirty) ok = await save(O, {preserveBlank: true});
  if (!ok || O.dirty || O.localOk === false) throw new Error('EDITOR_SAVE_FAILED');
  const saved = await getDesign(O.record.id);
  if (!saved) throw new Error('DOCUMENT_NOT_FOUND');
  if (accountFor(saved)) {
    // Background flush absorbs errors; observe this exact saved revision's result.
    await pusher.flush(saved.id);
    O.accountOk = null; pusher.queue(saved); await pusher.flush(saved.id);
    if (O.accountOk !== true) throw new Error('EDITOR_SYNC_FAILED');
  }
  if (O.closed || S.open !== O) throw new Error('EDITOR_BUSY');
  return saved;
}

async function saveMaterialFromEditor(O) {
  if (!materialAction || S.open !== O || O.closed || O.inlineImport || O.leaving || moving || app.inert || hostFlush || videoBusy(O)) return;
  try { if (materialAction.accepts && !materialAction.accepts(O.record)) return; } catch { return; }
  const focus = app.contains(document.activeElement) ? document.activeElement : null;
  O.leaving = true; app.inert = true;
  try {
    await persistEditorAction(O);
    await materialAction.open({designId: O.record.id, slideIndex: O.at});
    // The host may have committed a new fixed revision. Refresh only the rail
    // context so the next reorder uses that revision without clearing undo.
    if(S.open===O&&!O.closed)await loadMaterialNavigation(O);
  } catch (error) {
    const note = error?.message === 'EDITOR_SYNC_FAILED'
      ? '계정에 올리지 못했어요. 이 기기의 그림은 저장했고, 전체 자료 저장은 진행하지 않았어요.'
      : '전체 자료에 저장하지 못했어요. 현재 그림은 그대로 있으니 저장 상태를 확인하고 다시 시도해주세요.';
    if (S.open === O && !O.closed) setStatus(O, note, 'bad');
    toast(note, 5000);
  } finally {
    O.leaving = false;
    if (S.open === O && !O.closed) {
      app.inert = false;
      const target = focus?.isConnected ? focus : O.shell.querySelector('[data-material-action]');
      if (target && document.activeElement === document.body && document.hasFocus()) {
        try { target.focus({preventScroll: true}); } catch { /* Keep the save result. */ }
      }
    }
  }
}

async function importFromEditor(O) {
  if (!importAction?.editorLabel || S.open !== O || O.closed || O.inlineImport || O.leaving || moving || app.inert || hostFlush || videoBusy(O)) return;
  const context = { from: 'editor', designId: O.record.id, slideIndex: O.at };
  const previousFocus = app.contains(document.activeElement) ? document.activeElement : null;
  let left = false, restored = false;
  O.leaving = true; app.inert = true;
  try {
    const saved = await persistEditorAction(O);
    if (importAction.editorMode === 'inline') {
      await openInlineImport(O, context);
      return;
    }
    if (!await leaveEditor(O, { requireSaved: true })) throw new Error('EDITOR_SAVE_FAILED');
    left = true;
    try { S.list = await listDesigns(); } catch { upsert(saved); }
    S.phase = 'home'; render();
    await importAction.open(context);
  } catch (error) {
    if (left && !S.open && !moving && S.phase === 'home') {
      try { await openSavedDesign(context.designId, { slideIndex: context.slideIndex, tab: 'upload' }); restored = true; }
      catch { /* The persisted drawing remains in the home library for recovery. */ }
    }
    const note = error?.message === 'EDITOR_SYNC_FAILED'
      ? '계정에 올리지 못했어요. 이 기기의 그림은 저장했고, 편집 화면을 유지했어요. 다시 시도해주세요.'
      : left ? restored ? '가져오기 화면을 열지 못했어요. 저장한 그림으로 돌아왔어요.' : '가져오기 화면을 열지 못했어요. 그림은 내 그림에 저장돼 있어요.'
      : '지금 그림을 저장하지 못해 가져오기로 이동하지 않았어요. 다시 시도해주세요.';
    if (S.open === O) setStatus(O, note, 'bad');
    toast(note, 5000);
  } finally {
    O.leaving = false;
    if (S.open === O && !O.closed) {
      app.inert = false;
      if (previousFocus?.isConnected && document.activeElement === document.body && document.hasFocus()) {
        try { previousFocus.focus({ preventScroll: true }); } catch { /* Preserve the persistence result. */ }
      }
    }
  }
}

/** The host owns conversion; the editor owns its shell and the saved drawing.
 * No navigation/home render occurs while a host imports inside My materials. */
// 공유 링크: 저장을 마친 뒤 호스트의 공유 창을 연다(서버 · 로그인은 호스트가 맡는다). goTo 로 그 장 · 내 자료 칸(유튜브 등)을 연다.
async function openShareFromEditor(O){
  if(!shareAction||S.open!==O)return;
  try{
    await shareAction.open({designId:O.record.id,flush:()=>flushSavedDesign(O.record.id),
      goTo:(slideIndex,{upload=null}={})=>{if(S.open!==O)return;if(Number.isSafeInteger(slideIndex)&&slideIndex>=0&&slideIndex<O.slides.length)goSlide(O,slideIndex);if(upload)O.editor.openUpload?.(upload);}});
  }catch(error){toast(String(error?.message||'공유 창을 열지 못했어요.').slice(0,200),4500);}
}
async function openLessonFromEditor(O,action=lessonAction){
 if(!action||S.open!==O||O.closed||O.inlineImport||O.leaving||moving||app.inert||hostFlush||videoBusy(O))return;
 O.leaving=true;app.inert=true;
 try{await persistEditorAction(O);await openInlineImport(O,{from:'editor',designId:O.record.id,slideIndex:O.at},action);}
 catch(error){setStatus(O,error?.message||'수업 화면을 열지 못했어요. 그림은 그대로예요.','bad');}
 finally{O.leaving=false;if(S.open===O&&!O.closed)app.inert=false;}
}
/** Account lists do not require creating an empty drawing on a new device. */
async function openAccountFromHome(){
 if(!accountAction||accountHome||S.open||moving||S.phase!=='home')return;
 const session={controller:null,disposed:false,closing:false};accountHome=session;
 const outlet=el('div',{class:'cv-account-home-body'}),back=el('button',{class:'btn',type:'button',disabled:true},'내 그림으로 돌아가기');
 const shell=el('section',{class:'cv-account-home',role:'region','aria-label':accountAction.editorTitle||accountAction.label},
  el('style',{},'.cv-account-home{height:100dvh;display:flex;flex-direction:column;background:#fbfdfb;color:#233f36}.cv-account-home>header{padding:16px 24px;display:flex;gap:16px;align-items:center;justify-content:space-between;border-bottom:1px solid #d8e6df}.cv-account-home h2{margin:0}.cv-account-home-body{flex:1;min-height:0;overflow:auto}'),
  el('header',{},el('h2',{},accountAction.editorTitle||accountAction.label),back),outlet);
 const dispose=async()=>{if(session.disposed)return;session.disposed=true;await session.controller?.dispose?.();if(accountHome===session)accountHome=null;};
 const close=async()=>{if(session.closing||session.disposed)return;session.closing=true;await dispose();await refresh();};
 const open=async(id,options={})=>{const record=await getDesign(id);if(!record||session.disposed)throw Error('DOCUMENT_NOT_FOUND');await dispose();await openSavedDesign(id,options);};
 back.onclick=async()=>{if(session.controller?.requestClose)await session.controller.requestClose({reason:'return'});else await close();};
 setView('edit');app.replaceChildren(shell);
 try{session.controller=await accountAction.open({from:'home',inline:{root:outlet,close,openDesign:open}})||{};if(session.disposed)await session.controller.dispose?.();else back.disabled=false;}
 catch(error){await dispose();await refresh();toast(error.message||'내 수업을 열지 못했어요.');}
}
async function openInlineImport(O, context, action=importAction) {
  const work = O.shell.querySelector('.cv-work');
  const protectedNodes = [O.shell.querySelector('.cv-bar'), O.shell.querySelector('.cv-side')];
  const readonlyInputs = protectedNodes.flatMap(node => [...node.querySelectorAll('input:not([type=file]),textarea')].map(input => [input, input.readOnly]));
  const previousChildren = [...work.children].map(node => [node, node.hidden]);
  const previousFocus = document.activeElement;
  const back = el('button', {class: 'btn btn-ghost', type: 'button', disabled: true, dataset: {inlineImportClose: ''}}, ...face('back', '편집으로 돌아가기'));
  const outlet = el('div', {class: 'cv-inline-import-body'});
  const header = el('header', {class: 'cv-inline-import-header'},
    el('div', {}, el('small', {text: action===accountAction?'내 수업':action===lessonAction?'수업':'내 자료 / PPT'}), el('h2', {text: action.editorTitle||'내 PPT 가져오기'})), back);
  const region = el('section', {class: 'cv-inline-import', role: 'region', 'aria-label': action===accountAction?'내 계정 수업':action===lessonAction?'이 자료로 수업 만들기':'내 자료 · PPT 가져오기', dataset: {inlineImport: ''}}, header, outlet);
  const session = {controller: null, disposed: false, closing: false, navigating: false};
  O.inlineImport = session;
  O.editor.quiet();
  // Keep navigation available, but do not mutate the drawing before the provider
  // has accepted the transition (saving/partial work can refuse or suspend it).
  for (const [input] of readonlyInputs) input.readOnly = true;
  for (const [node] of previousChildren) node.hidden = true;
  O.shell.classList.add('inline-importing'); work.append(region); app.inert = false;
  const controlFor = event => {
    const target = event.target instanceof Element ? event.target.closest('button,a,input,select,textarea,summary') : null;
    return target && protectedNodes.some(node => node.contains(target)) ? target : null;
  };
  const releaseControls = () => {
    O.shell.removeEventListener('pointerdown', guardPointer, true);
    O.shell.removeEventListener('click', guardClick, true);
    O.shell.removeEventListener('focusin', guardFocus, true);
    readonlyInputs.forEach(([input, readonly]) => { input.readOnly = readonly; });
  };
  const replayControl = target => {
    if (target.matches('.fe-tab[data-tab]')) {
      const tab = target.dataset.tab;
      return () => O.editor.openTab(tab);
    }
    const base = protectedNodes.find(node => node.contains(target)), path = [];
    let cursor = target;
    while (cursor && cursor !== base) { path.unshift([...cursor.parentElement.children].indexOf(cursor)); cursor = cursor.parentElement; }
    const signature = node => node && [node.tagName, node.getAttribute('type'), node.getAttribute('aria-label'), node.textContent].join('|');
    const expected = signature(target);
    return () => {
      let current = base;
      for (const index of path) current = current?.children[index];
      // refresh() rebuilds sidebar controls. Replay only the identical control,
      // never a neighbouring action at the same position after a host change.
      if (!current?.isConnected || current.disabled || signature(current) !== expected) return;
      if (current.matches('input:not([type=file]),textarea,select')) current.focus({preventScroll: true});
      else current.click();
    };
  };
  const request = async (details, replay) => {
    if (session.closing || session.disposed || session.navigating || !session.controller) return;
    session.navigating = true;
    try {
      const accepted = typeof session.controller.requestClose === 'function'
        ? await session.controller.requestClose(details) : (await close(), true);
      if (accepted !== false && O.inlineImport !== session && S.open === O && !O.closed) replay?.();
    } catch { toast('작업 상태를 확인하지 못했어요. 잠시 뒤 다시 눌러주세요.'); }
    finally { session.navigating = false; }
  };
  const guardPointer = event => { if (controlFor(event)) event.preventDefault(); };
  const guardClick = event => {
    const target = controlFor(event); if (!target) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (target.matches('[data-document-import]')) return;
    const action = target.dataset.tab ? `tool:${target.dataset.tab}` : target.dataset.uploadTab ? `upload:${target.dataset.uploadTab}` : target.matches('.cv-back') ? 'home' : target.matches('[data-material-action]') ? 'material' : 'control';
    void request({reason: 'navigate', action}, replayControl(target));
  };
  const guardFocus = event => {
    const target = controlFor(event);
    if (target?.matches('input:not([type=file]),textarea,select')) void request({reason: 'navigate', action: 'field'}, replayControl(target));
  };
  O.shell.addEventListener('pointerdown', guardPointer, true);
  O.shell.addEventListener('click', guardClick, true);
  O.shell.addEventListener('focusin', guardFocus, true);
  const dispose = async () => {
    if (session.disposed) return;
    session.disposed = true;
    await session.controller?.dispose?.();
  };
  const restore = () => {
    region.remove();
    previousChildren.forEach(([node, hidden]) => { node.hidden = hidden; });
    releaseControls();
    O.shell.classList.remove('inline-importing');
    if (O.inlineImport === session) O.inlineImport = null;
    if (S.open === O && !O.closed) {
      setupApp(O.record); O.editor.refresh();
      if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus({preventScroll: true});
      else O.editor.panel.querySelector('[data-document-import]')?.focus({preventScroll: true});
    }
  };
  const close = async () => {
    if (session.closing || session.disposed) return;
    session.closing = true; back.disabled = true;
    try { await dispose(); } finally { restore(); }
  };
  const openImported = async (id, {slideIndex = 0, tab = 'upload'} = {}) => {
    if (session.closing || session.disposed || S.open !== O) throw new Error('EDITOR_BUSY');
    // Read and validate before replacing any active DOM. A failed host write
    // leaves the previous editor and its undo stack available for cancellation.
    const record = await getDesign(id);
    if (!record) throw new Error('DOCUMENT_NOT_FOUND');
    const ready = migrateRecord(record);
    if (session.closing || session.disposed || S.open !== O) throw new Error('EDITOR_BUSY');
    session.closing = true; back.disabled = true;
    try {
      if (!await leaveEditor(O, {requireSaved: true})) throw new Error('EDITOR_SAVE_FAILED');
      S.phase = 'home'; // Internal readiness only: never render or emit the home view.
      await dispose();
      releaseControls();
      upsert(ready); openDesign(ready, false);
      if (Number.isSafeInteger(slideIndex) && slideIndex > 0 && slideIndex < S.open.slides.length) goSlide(S.open, slideIndex);
      if (typeof tab === 'string') S.open.editor.openTab(tab);
    } catch (error) {
      session.closing = false;
      if (!O.closed) back.disabled = false;
      else if (!S.open) {
        // Recovery stays in the editor even when a host disposer rejects.
        await openSavedDesign(context.designId, {slideIndex: context.slideIndex, tab: 'upload'});
      }
      throw error;
    }
  };
  back.addEventListener('click', async () => {
    await request({reason: 'return'});
  });
  try {
    const controller = await action.open({...context, inline: {root: outlet, close, openDesign: openImported}});
    session.controller = controller || {};
    if (session.disposed) await session.controller.dispose?.();
    else { back.disabled = false; outlet.querySelector('button:not(:disabled),input:not(:disabled)')?.focus({preventScroll: true}); }
  } catch (error) {
    await dispose().catch(() => {}); restore(); throw error;
  }
}
async function closeDesign(O, btn = null) {
  if (O.closed || moving || videoBusy(O)) return;
  // 저장하지 못했으면 바로 나가지 않는다(나가면 그림이 사라진다). 한 번 더 누르면 그래도 나간다.
  let ok = await save(O);
  if (O.dirty) ok = await save(O);
  if (!ok && btn && btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    relabel(btn, '저장 안 하고 나가기');
    toast('저장하지 못했어요. 그림으로 내려받아 두고, 그래도 나가려면 한 번 더 눌러요.', 5000);
    setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; relabel(btn, '내 그림'); } }, 6000);
    return;
  }
  if (btn) btn.disabled = true;
  await leaveEditor(O);
  // 이 기기의 그림 목록은 다시 읽는다(싸다).
  try { S.list = await listDesigns(); } catch { /* 저장소를 못 쓰는 창: 기억하고 있는 목록을 그대로 쓴다 */ }
  // 꾸미던 그림이 작아지면서 목록의 그 그림 자리로 돌아간다(저장되지 않은 빈 그림이면 그냥 사라진다).
  const id = O.record.id;
  transit(() => {
    render();
    window.scrollTo({ top: 0 });
    app.querySelector(`.cv-item[data-id="${id}"] .cv-thumb .fe-card`)?.classList.add('cv-moving');
  }, 'close');
}
// ---------- 내려받기: 파일 형식 → 범위 → 형식별 옵션 → 명시 실행 ----------
function exportPref() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(EXPORT_KEY)) || {}; } catch { /* 기억해 둔 것이 없다 */ }
  return {
    size: EXPORT_SIZES.some((x) => x.id === p.size) ? p.size : DEFAULT_EXPORT, jpg: p.jpg === true, all: p.all === true,
    video: p.video === true, vsize: VIDEO_SIZES.some((x) => x.id === p.vsize) ? p.vsize : DEFAULT_VIDEO, stay: STAYS.includes(p.stay) ? p.stay : DEFAULT_STAY,
  };
}
// 고른 것을 기억한다(그림과 영상의 것을 한곳에 두므로, 바뀐 것만 덮어쓴다).
function rememberExport(changes) {
  try {
    let old = {};
    try { old = JSON.parse(localStorage.getItem(EXPORT_KEY)) || {}; } catch { /* 처음이다 */ }
    localStorage.setItem(EXPORT_KEY, JSON.stringify({ ...old, ...changes }));
  } catch { /* 기억하지 못해도 괜찮다 */ }
}
const secondsText = (ms) => { const sec = Math.max(1, Math.round(ms / 1000)); return sec < 60 ? `${sec}초` : sec % 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec / 60}분`; };
const NO_VIDEO = '이 브라우저에서는 영상으로 만들 수 없어요. 크롬이나 엣지에서 해 봐요.';
function askDownload(O, btn) {
  if (videoBusy(O)) return;
  O.editor.quiet();          // 틀어 보던 영상을 멈춘다(창 뒤에서 소리가 나지 않게)
  const aspect = aspectOf(O.record);
  const n = O.slides.length;
  const pref = exportPref();
  const can = canMakeVideo();
  const pick = { kind: pref.video && can ? 'video' : pref.jpg ? 'jpg' : 'png', all: pref.all && n > 1, stay: pref.stay, pptxMode: 'editable', htmlNotes: false, printLayout: 'slides', gifWidth: 480, size: pref.size, vsize: pref.vsize };
  // 장마다 바탕에 깐 영상이 있는지: ''(없다) · 'yes'(있다) · 'gone'(있는데 그 파일이 이 기기에 없다. 조금 뒤에 알게 된다)
  const scenes = currentSlides(O).map((d) => (hasVideo(d) ? 'yes' : ''));
  currentSlides(O).forEach((d, i) => {
    const src = slideVideo(d).video?.src;
    if (src) sceneUrl(src).then((url) => { if (!url) { scenes[i] = 'gone'; if (body.isConnected) draw(); } });
  });
  // 바탕에 깐 영상을 움직이는 채로 · 소리와 함께 담을 수 있는 브라우저인지(아니면 첫 모습의 멈춘 그림으로 담긴다).
  const live = canFilmScenes();
  // 내보낼 장들에 깐 영상이 어떻게 나오는지 알려 주는 글(없으면 빈 글).
  const sceneNote = (list, video) => {
    const have = list.filter(Boolean);
    if (!have.length) return '';
    const gone = have.filter((s) => s === 'gone').length;
    if (gone === have.length) return '바탕에 깐 영상이 이 기기에 없어서, 그 장은 바탕색만 나와요.';
    const lost = gone ? ' 이 기기에 없는 영상은 바탕색만 나와요.' : '';
    if (!video) return `바탕에 깐 영상은 첫 모습이 그림으로 나와요.${lost}`;
    return live ? `바탕에 깐 영상은 움직이는 채로, 소리와 함께 담겨요. 그 장은 영상이 끝날 때까지 이어져요.${lost}`
      : `이 브라우저에서는 바탕에 깐 영상이 첫 모습의 멈춘 그림으로 들어가요(소리도 없어요). 크롬이나 엣지에서 만들면 움직이는 채로 담겨요.${lost}`;
  };
  // 영상의 길이(ms): 만들 때와 같은 계산이다(이 기기에 없는 영상은 세지 않는다).
  const filmMs = (stay) => filmPlan(currentSlides(O).map((d, i) => {
    const clean = cleanDesign(d, { keepSpaces: true });
    if (scenes[i] === 'gone') delete clean.video;
    return clean;
  }), { stay, scenes: live }).ms;
  const lead = el('p', { class: 'muted', text: '파일 형식과 저장할 쪽을 고른 뒤 내려받으세요.' });
  const body = el('div', { class: 'cv-down-body' });
  const summaryTitle = el('b');
  const summaryDetail = el('small');
  const submit = el('button', { class: 'btn btn-primary cv-down-submit', type: 'button', 'data-download-save': '', onClick: () => {
    // 옵션을 고를 때는 만들지 않는다. 마지막 단추에서만 현재 선택을 실행한다.
    if (pick.kind === 'pptx') { makePptx(O, {all: pick.all, mode: pick.pptxMode}); return; }
    if (pick.kind === 'html') { makeHtmlLesson(O, {notes: pick.htmlNotes}); return; }
    if (pick.kind === 'pdf') { printDeck(O, {layout: pick.printLayout}); return; }
    if (pick.kind === 'gif') { makeGif(O, {stay: pick.stay, width: pick.gifWidth}); return; }
    if (pick.kind === 'video' && (!can || filmMs(pick.stay) > MAX_FILM_SECONDS * 1000)) return;
    closeModal();
    if (pick.kind === 'video') {
      rememberExport({video: true, vsize: pick.vsize, stay: pick.stay});
      makeVideo(O, {vsize: pick.vsize, stay: pick.stay});
    } else {
      rememberExport({size: pick.size, jpg: pick.kind === 'jpg', all: pick.all, video: false});
      download(O, btn, {size: pick.size, jpg: pick.kind === 'jpg', all: pick.all});
    }
  } });
  const box = el('div', {class: 'cv-down-ask'},
    el('div', {class: 'cv-down-head'}, el('h2', {id: 'cv-download-title', text: '내려받기'}), lead), body,
    el('div', {class: 'cv-down-footer'},
      el('div', {class: 'cv-down-summary', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true'}, summaryTitle, summaryDetail),
      el('div', {class: 'cv-down-actions'}, el('button', {class: 'btn btn-ghost cv-down-cancel', type: 'button', onClick: closeModal}, '취소'), submit)));
  const set = (changes) => {
    Object.assign(pick, changes);
    draw();
  };
  const chip = (label, on, onClick, data, more = {}) => el('button', { class: `btn chip${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), dataset: data, onClick, ...more }, label);
  const section = (label, ...children) => el('fieldset', {class: 'cv-down-section'}, el('legend', {class: 'cv-down-heading', text: label}), ...children);
  const choice = (className, name, desc, on, data, changes, more = {}) => el('button', {
    class: className, type: 'button', 'aria-pressed': String(on), dataset: data, onClick: () => set(changes), ...more,
  }, el('b', {text: name}), el('small', {text: desc}));
  const sizeButton = ({ id, name, desc, width, height, last, note, onPick }) => el('button', { class: `cv-size${last ? ' last' : ''}`, type: 'button', 'aria-pressed': String(last), dataset: { size: id }, onClick: onPick },
    el('b', { text: name }), el('span', { class: 'cv-size-px', text: `${width} × ${height}` }), el('small', { text: desc }),
    note ? el('span', { class: 'cv-size-last', text: note }) : null);
  const imageSizes = () => EXPORT_SIZES.map((size) => sizeButton({
    ...size, ...exportSize(size.id, aspect), last: size.id === pick.size, note: size.id === DEFAULT_EXPORT ? '추천' : '',
    onPick: () => set({size: size.id}),
  }));
  const videoSizes = () => VIDEO_SIZES.map((size) => sizeButton({
    ...size, ...videoSize(aspect, size.short), last: size.id === pick.vsize, note: size.id === DEFAULT_VIDEO ? '추천' : '',
    onPick: () => set({vsize: size.id}),
  }));
  const draw = () => {
    // 누른 단추와 스크롤 위치를 유지한다. 비동기 영상 확인도 선택을 방해하지 않는다.
    const active = body.contains(document.activeElement) ? {...document.activeElement.dataset} : null;
    const scrollTop = body.scrollTop;
    const video = pick.kind === 'video';
    const pptx = pick.kind === 'pptx';
    const html=pick.kind==='html';
    const pdf=pick.kind==='pdf',gif=pick.kind==='gif';
    const scopeN=(pptx||html||pdf||gif)&&O.materialDeck?O.materialDeck.documents.reduce((total,row)=>total+(row.id===O.record.id?O.slides.length:row.slides.length),0):n;
    const scopeAt=pptx&&O.materialDeck?materialPages(O).findIndex(value=>value.record.id===O.record.id&&value.index===O.at):O.at;
    const ms = video ? filmMs(pick.stay) : 0;
    const long = ms > MAX_FILM_SECONDS * 1000;
    const rows = [section('파일 형식', el('div', {class: 'cv-down-formats'},
      choice('cv-down-format', 'PNG', '또렷한 그림', pick.kind === 'png', {type: 'png'}, {kind: 'png'}),
      choice('cv-down-format', 'JPG', '용량이 작은 그림', pick.kind === 'jpg', {type: 'jpg'}, {kind: 'jpg'}),
      choice('cv-down-format', 'PPTX', 'PowerPoint 파일', pptx, {type: 'pptx'}, {kind: 'pptx'}),
      choice('cv-down-format', 'HTML 수업', '슬라이드와 활동을 함께 실행', html, {type: 'html'}, {kind: 'html'}),
      choice('cv-down-format', 'PDF·인쇄', '종이로 뽑거나 PDF로 저장', pdf, {type: 'pdf'}, {kind: 'pdf'}),
      choice('cv-down-format', 'GIF', '저절로 넘어가는 움직이는 그림', gif, {type: 'gif'}, {kind: 'gif'}),
      choice('cv-down-format', '영상', '움직임까지 담기', video, {type: 'video'}, {kind: 'video'}, can ? {} : {disabled: true, title: NO_VIDEO})))];
    rows.push(section('저장할 쪽', pdf||gif?el('p',{class:'cv-down-note',text:`전체 ${scopeN}쪽을 차례대로 담아요. 발표에서 숨긴 장은 빼요.`}):html?el('p',{class:'cv-down-note',text:`전체 ${scopeN}쪽과 픽셀아트 활동을 한 HTML 파일로 담아요. 발표에서 숨긴 장은 빼요.`}):video
      ? el('p', {class: 'cv-down-note', text: `모든 장 (${n}장)을 순서대로 영상 하나에 담아요.`})
      : scopeN > 1 ? el('div', {class: 'cv-down-chips'},
        chip(`지금 장 (${scopeAt + 1}번째)`, !pick.all, () => set({all: false}), {scope: 'one'}),
        chip(`모든 장 (${scopeN}장)`, pick.all, () => set({all: true}), {scope: 'all'}))
        : el('p', {class: 'cv-down-note', text: '지금 장 (1장)'})));
    if (pptx) rows.push(section('PPTX 방식', el('div', {class: 'cv-down-modes'},
      choice('cv-down-mode', '편집형', '글·기본 도형·사진을 따로 수정해요.', pick.pptxMode === 'editable', {pptx: 'editable'}, {pptxMode: 'editable'}),
      choice('cv-down-mode', '이미지형', '화면 모습을 한 장의 그림으로 담아요.', pick.pptxMode === 'image', {pptx: 'image'}, {pptxMode: 'image'})),
      el('p', {class: 'cv-down-note', text: pick.pptxMode === 'editable'
        ? '지원하지 않는 조각은 개별 이미지로 담아요. 글꼴 파일은 포함하지 않아 여는 기기에 해당 글꼴이 필요해요.'
        : '글이나 요소를 따로 수정하기는 어려워요.'}),
      el('p', {class: 'cv-down-note', text: '영상과 움직임은 정지한 모습으로 담아요.'})));
    else if(html){
      rows.push(el('p',{class:'cv-down-note',text:'브라우저에서 같은 화면으로 슬라이드와 픽셀아트를 실행해요. 일반 슬라이드는 그림으로, 영상·움직임은 정지한 모습으로 담아요. 만든 결과를 포함해 HTML을 다시 내려받을 수 있어요. 온바탕과 같은 발표 모드(단축키·펜·전체 보기·발표자 화면)로 띄울 수 있어요.'}));
      // 발표자 노트는 선생님 것이다: 학생에게 나눠 줄 파일에 실수로 담기지 않게 처음에는 빼 둔다.
      rows.push(section('발표자 노트',el('div',{class:'cv-down-chips'},
        chip('넣지 않기 · 학생에게 줄 때',!pick.htmlNotes,()=>set({htmlNotes:false}),{notes:'off'}),
        chip('함께 넣기 · 내가 발표할 때',pick.htmlNotes,()=>set({htmlNotes:true}),{notes:'on'})),
        el('p',{class:'cv-down-note',text:pick.htmlNotes?'노트는 발표자 화면(S)에서만 보여요. 이 파일을 받은 사람은 파일 안의 노트를 볼 수 있어요.':'노트를 빼고 담아요. 슬라이드와 활동은 그대로예요.'})));
    }
    else if(gif){
      // GIF: 장마다 한 장의 그림이 정한 시간만큼 머물고 끝나면 처음부터(움직임·영상은 멈춘 모습). 학급 게시판·메신저에 올리기 좋게 작다.
      rows.push(section('장마다 머무는 시간',el('div',{class:'cv-down-chips'},...STAYS.map(sec=>chip(`${sec}초`,pick.stay===sec,()=>set({stay:sec}),{stay:String(sec)}))),
        currentSlides(O).some(p=>p.dur)?el('p',{class:'cv-down-note',text:'리허설로 잰 시간이 있는 장은 그 시간만큼 머물러요.'}):null));
      rows.push(section('크기',el('div',{class:'cv-down-chips'},
        chip('작게 · 가로 480px',pick.gifWidth===480,()=>set({gifWidth:480}),{gifWidth:'480'}),
        chip('보통 · 가로 800px',pick.gifWidth===800,()=>set({gifWidth:800}),{gifWidth:'800'})),
        el('p',{class:'cv-down-note',text:'GIF 는 256색까지라 사진은 조금 거칠어 보일 수 있어요. 움직임·영상은 멈춘 모습으로 나와요.'})));
    }
    else if(pdf){
      // 인쇄 모양: 슬라이드 한 장씩(가로) · 노트와 함께(세로, 파워포인트의 노트 페이지) · 한 쪽에 여러 장(유인물)
      rows.push(section('인쇄 모양',el('div',{class:'cv-down-chips'},
        ...PRINT_LAYOUTS.map(v=>chip(v.name,pick.printLayout===v.id,()=>set({printLayout:v.id}),{printLayout:v.id}))),
        el('p',{class:'cv-down-note',text:PRINT_LAYOUTS.find(v=>v.id===pick.printLayout).hint})));
      rows.push(el('p',{class:'cv-down-note',text:'인쇄 창이 열리면 프린터로 뽑거나, 대상에서 "PDF로 저장"을 골라 PDF 파일로 저장해요. 영상·움직임은 멈춘 모습으로 나와요.'}));
    }
    else rows.push(section(video ? '영상 화질' : '이미지 화질',
      el('p', {class: 'cv-down-note', text: '클수록 또렷하지만 파일 용량이 커져요.'}),
      el('div', {class: `cv-sizes${video ? ' two' : ''}`}, ...(video ? videoSizes() : imageSizes()))));
    if (video) {
      // 한 장이 얼마나 머무는지만 고른다(바탕에 영상을 깐 장은 그 영상이 끝날 때까지 이어진다).
      rows.push(section('장마다 머무는 시간', el('div', {class: 'cv-down-chips'}, ...STAYS.map((sec) => chip(`${sec}초`, pick.stay === sec, () => set({stay: sec}), {stay: String(sec)}))),
        el('p', {class: 'cv-down-note', text: '바탕에 깐 영상이 있는 장은 그 영상이 끝날 때까지 이어져요.'}),
        currentSlides(O).some((p) => p.dur) ? el('p', {class: 'cv-down-note', text: '리허설로 잰 시간이 있는 장은 그 시간만큼 머물러요.'}) : null));
      if (long) rows.push(el('p', { class: 'cv-down-note warn', role: 'status', text: `영상은 ${MAX_FILM_SECONDS / 60}분까지 만들 수 있어요. 바탕에 깐 영상의 쓸 구간을 줄이거나, 장을 나눠 따로 만들어요.` }));
      // 바탕에 깐 영상이 어떻게 담기는지 미리 알려 준다(멈춘 그림으로 담기거나 빠지는 것이 있을 때는 눈에 띄게).
      const note = sceneNote(scenes, true);
      if (note) rows.push(el('p', { class: `cv-down-note${live && !scenes.includes('gone') ? '' : ' warn'}`, text: note }));
    }
    if (!video && sceneNote(pick.all ? scenes : [scenes[O.at]], false)) rows.push(el('p', { class: 'cv-down-note', text: sceneNote(pick.all ? scenes : [scenes[O.at]], false) }));
    if (!can) rows.push(el('p', { class: 'cv-down-note', text: NO_VIDEO }));
    body.replaceChildren(...rows);
    body.scrollTop = scrollTop;
    if (active && Object.keys(active).length) body.querySelector(Object.entries(active).map(([k, v]) => `button[data-${k}="${v}"]`).join(''))?.focus({preventScroll: true});
    const range = video || html || pdf || gif || pick.all ? `모든 장 ${scopeN}장` : `지금 장 (${scopeAt + 1}/${scopeN})`;
    const label = gif ? 'GIF' : pdf ? 'PDF·인쇄' : video ? '영상' : pptx ? `PPTX ${pick.pptxMode === 'editable' ? '편집형' : '이미지형'}` : pick.kind.toUpperCase();
    summaryTitle.textContent = `${label} · ${range}`;
    const px = video ? videoSize(aspect, VIDEO_SIZES.find(size => size.id === pick.vsize).short) : exportSize(pick.size, aspect);
    summaryDetail.textContent = gif?`가로 ${pick.gifWidth}px · 장마다 ${pick.stay}초 · 끝나면 처음부터 되풀이해요.`:pdf?`${PRINT_LAYOUTS.find(v=>v.id===pick.printLayout).name} · 인쇄 창에서 PDF로 저장할 수 있어요.`:html?'인터넷 연결 없이 실행하는 수업 파일 · 원본은 보존돼요.':pptx ? 'PPTX 한 파일 · 원본과 편집 자료는 그대로 보관돼요.' : video
      ? `${px.width} × ${px.height}px · 약 ${secondsText(ms)} · 만든 뒤 미리보고 저장해요.`
      : `${px.width} × ${px.height}px · ${pick.all && n > 1 ? `${label} ${n}장을 ZIP 한 파일로 저장해요.` : '그림 한 파일로 저장해요.'}`;
    submit.disabled = video && long;
    submit.toggleAttribute('data-pptx-save', pptx);
    submit.replaceChildren(...face('download', gif ? 'GIF 내려받기' : pdf ? '인쇄 창 열기' : video ? '영상 만들기' : `${pptx ? 'PPTX' : label} 내려받기`));
  };
  draw();
  const wasInert = app.inert;
  openModal(box, {onClose: () => { app.inert = wasInert; if (btn.isConnected) btn.focus({preventScroll: true}); }});
  const panel = box.closest('.modal-panel');
  app.inert = true;
  panel.classList.add('download-panel');
  panel.parentElement.classList.add('download-backdrop');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'cv-download-title');
  panel.addEventListener('keydown', e => {
    e.stopPropagation(); // 뒤쪽 편집기의 단축키가 열려 있는 창에 반응하지 않게 한다.
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    if (e.key === 'Tab') {
      const buttons = [...panel.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  body.querySelector('[aria-pressed="true"]')?.focus({preventScroll: true});
}
const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
// GIF: 숨기지 않은 장마다 그림 한 장을 만들어 GIF 하나로 잇는다(app/gif.js. 바깥 라이브러리 없음). 크기는 첫 장의 비율을 따르고,
// 비율이 다른 장(여러 파트 자료)은 흰 바탕 가운데에 맞춰 넣는다.
async function makeGif(O,{stay=5,width=480}={}){
  const abort=new AbortController(),status=el('p',{role:'status',text:'GIF 로 만들 쪽을 준비하고 있어요…'});
  openModal(el('section',{},el('h2',{text:'GIF 만들기'}),status,el('button',{class:'btn',onClick:closeModal},'취소')),{onClose:()=>abort.abort()});
  try{
    await persistEditorAction(O);if(O.materialLoadingPromise)await O.materialLoadingPromise;
    const entries=lessonPages(O).filter(v=>!v.page.hidden);
    if(!entries.length)throw Error('모든 장을 숨겨서 담을 장이 없어요.');
    if(entries.length>GIF_LIMITS.frames)throw Error(`GIF 에는 ${GIF_LIMITS.frames}쪽까지 담을 수 있어요.`);
    const first=aspectOf(entries[0].record),W=width,H=Math.max(1,Math.round(width/first));
    const sheet=document.createElement('canvas');sheet.width=W;sheet.height=H;const ctx=sheet.getContext('2d',{willReadFrequently:true});
    const frames=[];
    for(const [index,value]of entries.entries()){
      if(abort.signal.aborted)return;
      status.textContent=`${index+1} / ${entries.length}쪽을 그리고 있어요…`;
      const aspect=aspectOf(value.record);setupApp(value.record);
      const made=await designToCanvas(value.page,{width:Math.round(aspect>=first?W:H*aspect),aspect});
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
      const k=Math.min(W/made.canvas.width,H/made.canvas.height),w=made.canvas.width*k,h=made.canvas.height*k;
      ctx.drawImage(made.canvas,(W-w)/2,(H-h)/2,w,h);
      frames.push({data:ctx.getImageData(0,0,W,H).data,delay:(value.page.dur||stay)*100});
    }
    if(abort.signal.aborted)return;
    status.textContent='GIF 파일로 묶고 있어요…';
    await new Promise(r=>setTimeout(r,30));
    const bytes=encodeGif(frames,{width:W,height:H});
    if(abort.signal.aborted)return;
    saveBlob(new Blob([bytes],{type:'image/gif'}),`${fileName()}.gif`);closeModal();
    toast(`${frames.length}쪽을 GIF 로 내려받았어요(${Math.max(1,Math.round(bytes.length/1024))}KB).`);
  }catch(error){if(!abort.signal.aborted)status.textContent=`GIF 를 만들지 못했어요. ${error.message||''} 원본과 편집 자료는 그대로예요.`;}
  finally{setupApp(O.record);}
}
// PDF·인쇄: 장마다 그림을 만들어 인쇄용 문서(보이지 않는 틀)에 깔고, 브라우저의 인쇄 창을 연다("PDF로 저장"도 여기서).
// 바깥 라이브러리 없이 @page 로 쪽을 나눈다. 숨긴 장은 뺀다. 원본과 저장본은 바꾸지 않는다.
async function printDeck(O,{layout='slides'}={}){
  const abort=new AbortController(),status=el('p',{role:'status',text:'인쇄할 쪽을 준비하고 있어요…'});
  openModal(el('section',{},el('h2',{text:'PDF·인쇄'}),status,el('button',{class:'btn',onClick:closeModal},'취소')),{onClose:()=>abort.abort()});
  const urls=[];
  try{
    await persistEditorAction(O);if(O.materialLoadingPromise)await O.materialLoadingPromise;
    const entries=lessonPages(O).filter(v=>!v.page.hidden),pages=[];
    if(!entries.length)throw Error('모든 장을 숨겨서 뽑을 장이 없어요.');
    for(const [index,value]of entries.entries()){
      if(abort.signal.aborted)return;
      status.textContent=`${index+1} / ${entries.length}쪽을 준비하고 있어요…`;
      const aspect=aspectOf(value.record);setupApp(value.record);
      const {width}=exportSize('medium',aspect);
      const {blob}=await designToBlob(value.page,{width,aspect,type:'image/png'});
      const url=URL.createObjectURL(blob);urls.push(url);
      pages.push({url,aspect,notes:value.page.notes||'',number:index+1});
    }
    if(abort.signal.aborted)return;
    status.textContent='인쇄 창을 여는 중이에요…';
    const frame=el('iframe',{class:'cv-print-frame',title:'인쇄용 문서','aria-hidden':'true',tabindex:'-1'});
    document.body.append(frame);
    const doc=frame.contentDocument;
    doc.open();doc.write(printHtml(O.materialDeck?.title||O.record.name,pages,layout));doc.close();
    await Promise.all([...doc.images].map(img=>img.decode().catch(()=>{})));
    if(abort.signal.aborted){frame.remove();return;}
    closeModal();
    const done=()=>{frame.remove();for(const url of urls)URL.revokeObjectURL(url);};
    frame.contentWindow.addEventListener('afterprint',()=>setTimeout(done,500),{once:true});
    setTimeout(done,10*60*1000);
    frame.contentWindow.focus();frame.contentWindow.print();
  }catch(error){if(!abort.signal.aborted)status.textContent=`인쇄할 쪽을 만들지 못했어요. ${error.message||''} 원본과 편집 자료는 그대로예요.`;for(const url of urls)URL.revokeObjectURL(url);}
  finally{setupApp(O.record);}
}
async function makeHtmlLesson(O,{notes=false}={}){
  const abort=new AbortController(),status=el('p',{role:'status',text:'수업 화면을 만들고 있어요…'});
  const box=el('section',{},el('h2',{text:'HTML 수업 내려받기'}),status,el('button',{class:'btn',onClick:closeModal},'취소'));
  openModal(box,{onClose:()=>abort.abort()});
  try{
    await persistEditorAction(O);if(O.materialLoadingPromise)await O.materialLoadingPromise;
    // 숨긴 장은 발표용 HTML 수업에 넣지 않는다.
    const every=lessonPages(O),entries=every.filter(v=>!v.page.hidden),pages=[],topics=shownTopics(every.map(v=>v.page));
    if(!entries.length)throw Error('모든 장을 숨겨서 담을 장이 없어요.');
    for(const [index,value]of entries.entries()){
      if(abort.signal.aborted)return;
      status.textContent=`${index+1} / ${entries.length}쪽을 수업에 담고 있어요…`;
      const aspect=aspectOf(value.record);setupApp(value.record);
      const {width}=exportSize('medium',aspect);
      const {blob}=await designToBlob(value.page,{width,aspect,type:'image/png'});
      const image=await new Promise((yes,no)=>{const reader=new FileReader();reader.onload=()=>yes(reader.result);reader.onerror=no;reader.readAsDataURL(blob);});
      const activity=value.page.activity;
      pages.push({id:value.page.id,image,aspect,...(notes?slideNotes(value.page):{}),...(topics.get(value.page.id)?{topic:topics.get(value.page.id)}:{}),...slideDur(value.page),...(value.page.source?.kind==='result'?{result:true}:{}),...(activity?{activity,binding:{documentId:value.record.id,pageId:value.page.id,activityId:activity.id,kind:activity.kind,definitionHash:await activityDefinitionHash(activity)}}:{})});
    }
    if(abort.signal.aborted)return;
    const html=createHtmlLesson({title:O.materialDeck?.title||O.record.name,pages,target:lessonTarget(O)});
    saveBlob(html,`${fileName()}-lesson.html`);closeModal();toast('슬라이드와 활동을 함께 실행하는 HTML 수업을 내려받았어요.');
  }catch(error){if(!abort.signal.aborted)status.textContent=`수업 파일을 만들지 못했어요. ${error.message||''} 원본과 편집 자료는 보관돼요.`;}
  finally{setupApp(O.record);}
}
// PPTX는 편집 중인 장까지 저장한 뒤 한 파일로 만든다. 실패·취소 때 일부 파일을 내려받지 않는다.
async function makePptx(O, {all, mode}) {
  if (O.closed) return;
  const controller = new AbortController();
  const label = el('p', {role: 'status', 'aria-live': 'polite', text: '편집 내용을 저장하고 있어요…'});
  const progress = el('progress', {max: all ? O.slides.length : 1, value: 0, 'aria-label': 'PPTX 만드는 중'});
  const notes = el('ul');
  const cancel = el('button', {class: 'btn', type: 'button', onClick: closeModal}, '만들기 취소');
  const box = el('div', {class: 'cv-pptx-export'}, el('h2', {text: 'PPTX 내려받기'}), label, progress, notes, cancel);
  openModal(box, {onClose: () => controller.abort()});
  try {
    await flushSavedDesign(O.record.id);
    if (controller.signal.aborted || O.closed) return;
    const slides = structuredClone(currentSlides(O));let selected=all?slides:[slides[O.at]];
    if(all&&O.materialDeck){
      selected=[];
      for(const row of O.materialDeck.documents){
        const draft=row.id===O.record.id?{...O.record,slides}:await getDesign(row.id);
        if(!draft)throw Error('다른 쪽을 불러오지 못했어요. 전체 자료를 다시 열어주세요.');
        if(Math.abs(aspectOf(draft)-aspectOf(O.record))>.001)throw Error('슬라이드 비율이 서로 달라요. 원본과 편집 자료는 보존돼요.');
        selected.push(...structuredClone(draft.slides));
      }
      progress.max=selected.length;
      selected=orderPages(selected,O.materialDeck.pageOrder);
    }
    const result = await createPptx({slides: selected, aspect: aspectOf(O.record), size: O.record.size,
      title: O.record.name || '온바탕', mode, signal: controller.signal,
      onProgress: ({completed, total}) => { progress.value = completed; label.textContent = `${completed} / ${total}장을 만들었어요…`; }});
    if (controller.signal.aborted) return;
    const name = (O.record.name || '온바탕').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100);
    saveBlob(result.blob, `${name}${all || slides.length === 1 ? '' : `-${O.at + 1}`}.pptx`);
    label.textContent = `${result.slideCount}장을 PPTX로 내려받았어요. 파일을 열어 글꼴과 배치를 확인해주세요.`;
    for (const text of new Set(result.warnings.map(note => `${note.pageNumber}장 · ${note.message}`))) notes.append(el('li', {text}));
    cancel.textContent = '닫기'; progress.hidden = true;
  } catch (error) {
    if (controller.signal.aborted) return;
    label.textContent = `PPTX를 만들지 못했어요. ${error.message || ''} 편집 내용은 그대로 보관돼요.`;
    label.setAttribute('role', 'alert'); cancel.textContent = '닫기'; progress.hidden = true;
  }
}
async function download(O, btn, { size, jpg, all }) {
  if (O.closed) return;
  const label = labelOf(btn);
  btn.disabled = true;
  relabel(btn, '그림으로 바꾸는 중…');
  try {
    const aspect = aspectOf(O.record);
    const px = exportSize(size, aspect);
    const slides = currentSlides(O);
    const type = jpg ? 'image/jpeg' : 'image/png';
    const missing = new Set();
    const now = new Date();
    const render = async (design) => {
      const made = await designToBlob(design, { width: px.width, aspect, type, quality: 0.92 });
      for (const f of made.missingFonts) missing.add(f);
      return made;
    };
    let what = '';
    if (all && slides.length > 1) {
      // 한 장씩 그림으로 바꿔서 압축 파일 하나로 묶는다(파일을 여러 번 내려받게 하지 않는다).
      const files = [];
      for (let i = 0; i < slides.length; i++) {
        relabel(btn, `그림으로 바꾸는 중… (${i + 1}/${slides.length})`);
        const made = await render(slides[i]);
        files.push({ name: `${fileName(now, i + 1)}.${made.ext}`, bytes: new Uint8Array(await made.blob.arrayBuffer()) });
      }
      saveBlob(new Blob([zipStore(files, now)], { type: 'application/zip' }), `${fileName(now)}.zip`);
      what = `${slides.length}장을 압축 파일(ZIP)로 내려받았어요. (${jpg ? 'JPG' : 'PNG'} · ${px.width}×${px.height})`;
    } else {
      const made = await render(slides[O.at]);
      saveBlob(made.blob, `${fileName(now, slides.length > 1 ? O.at + 1 : 0)}.${made.ext}`);
      what = `그림 파일로 내려받았어요. (${jpg ? 'JPG' : 'PNG'} · ${made.width}×${made.height})`;
    }
    toast(missing.size ? `${what} 다만 글꼴(${[...missing].join(', ')})을 받지 못해 기본 글꼴로 나왔어요. 인터넷을 확인해요.` : what, missing.size ? 6000 : 3500);
  } catch (ex) {
    console.error(ex);
    toast(size === 'large' ? '그림으로 바꾸지 못했어요. "보통" 크기로 다시 해 봐요.' : '그림으로 바꾸지 못했어요. 크롬이나 엣지에서 다시 해 봐요.', 4500);
  }
  btn.disabled = false;
  relabel(btn, label);
}

// 영상으로 만들기: 만드는 모습을 그대로 보여 주고(진행 막대 · 그만두기), 다 되면 틀어 보고 내려받게 한다.
async function makeVideo(O, { vsize, stay }) {
  if (O.closed) return;
  const size = videoSize(aspectOf(O.record), (VIDEO_SIZES.find((x) => x.id === vsize) || VIDEO_SIZES[0]).short);
  const slides = currentSlides(O);
  const stop = new AbortController();
  let url = '';
  let making = true;
  let again = false;           // 다른 파일 종류로 처음부터 다시 만드는 중인지
  let armed = 0;               // "그만두기"를 한 번 누른 뒤의 기다림(그동안 한 번 더 누르면 그만둔다)
  const canvas = el('canvas', { class: 'cv-film-view', 'aria-label': '만들고 있는 영상' });
  const fill = el('span', { class: 'cv-film-fill' });
  // 얼마나 됐는지는 막대(progressbar)가 알린다. 글은 1초에도 여러 번 바뀌므로 화면 읽기 프로그램이 따라 읽지 않게 둔다.
  const bar = el('span', { class: 'cv-film-bar', role: 'progressbar', 'aria-label': '영상을 만든 정도', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, fill);
  const label = el('p', { class: 'cv-film-label', text: '준비하는 중이에요…' });
  const stage = el('div', { class: 'cv-film-stage' }, canvas);
  stage.style.setProperty('--cv-film-ratio', String(size.width / size.height));
  // 만드는 데 오래 걸리므로, 잘못 눌러 날리지 않게 한 번 더 누를 때 그만둔다.
  const quit = el('button', { class: 'btn cv-film-quit', type: 'button', onClick: () => askQuit() }, '그만두기');
  const askQuit = () => {
    if (!making || armed) { closeModal(); return; }
    quit.textContent = '한 번 더 누르면 그만둬요';
    quit.classList.add('armed');
    armed = setTimeout(() => { armed = 0; quit.textContent = '그만두기'; quit.classList.remove('armed'); }, 4000);
  };
  const box = el('div', { class: 'cv-film' },
    el('h2', { text: '영상을 만드는 중이에요' }), stage, label, bar,
    el('p', { class: 'muted cv-film-note', text: '다 될 때까지 이 창을 그대로 두어요.' }),
    el('div', { class: 'cv-film-actions' }, quit));
  // 만드는 동안에는 창 바깥을 눌러도 닫히지 않고, 닫기(✕)도 "그만두기"처럼 한 번 더 누를 때 닫힌다.
  const guard = (e) => {
    if (!making) return;
    if (e.target?.classList?.contains('modal-backdrop')) e.stopPropagation();
    else if (e.target?.closest?.('.modal-close')) { e.stopPropagation(); askQuit(); }
  };
  document.addEventListener('click', guard, true);
  openModal(box, {
    wide: true,
    onClose: () => {
      document.removeEventListener('click', guard, true);
      clearTimeout(armed);
      if (making) toast('영상 만들기를 그만뒀어요.');
      making = false;
      stop.abort();
      if (url) URL.revokeObjectURL(url);
    },
  });
  try {
    const made = await designsToVideo(slides, {
      ...size, stay, canvas, signal: stop.signal, fixBlob: fixWebmBlob,
      onProgress: (p) => {
        const pct = Math.round(p * 100);
        fill.style.width = `${pct}%`;
        bar.setAttribute('aria-valuenow', String(pct));
        label.textContent = `${again ? '다시 만드는 중이에요' : '영상을 만드는 중이에요'}… ${pct}%`;
      },
      onRetry: () => { again = true; fill.style.width = '0%'; label.textContent = '다른 방식으로 다시 만드는 중이에요…'; },
    });
    if (stop.signal.aborted) return;          // 그만뒀다(창을 닫을 때 이미 알렸다)
    making = false;
    clearTimeout(armed);
    if (!made) throw new Error('영상이 만들어지지 않았어요');
    url = URL.createObjectURL(made.blob);
    const name = `${fileName(new Date())}.${made.ext}`;
    const mb = made.blob.size / 1048576;
    const facts = [made.ext.toUpperCase(), `${made.width}×${made.height}`, secondsText(made.seconds * 1000), `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10}MB`];
    // 다 된 영상은 바로 틀어 보여 준다(소리를 꺼 두어야 브라우저가 저절로 틀게 해 준다. 소리가 담겼으면 켜는 법을 알려 준다).
    const view = el('video', { class: 'cv-film-view', src: url, controls: true, playsinline: true, loop: true, autoplay: true });
    view.muted = true;
    if (made.sound) facts.push('소리 있음');
    const notes = [];
    if (made.sound) notes.push('여기서는 소리를 끄고 틀어요. 소리를 들으려면 영상 아래의 스피커 단추를 눌러요.');
    if (made.ext === 'webm') notes.push('WebM 파일이에요. 크롬이나 엣지에서 잘 열려요.');
    // MP4 에 Opus 소리를 담았을 때(이 기기에 AAC 인코더가 없다): 그림은 어디서나 나오지만 소리는 못 트는 프로그램이 있다.
    if (made.sound === 'opus' && made.ext === 'mp4') notes.push('소리는 크롬 · 엣지 · 안드로이드에서 잘 들려요. 다른 프로그램에서는 그림만 나오고 소리가 안 날 수 있어요.');
    if (made.soundLost) notes.push(made.sound ? '소리를 풀지 못한 영상이 있어서, 그 영상의 소리는 빠졌어요.' : '이 기기에서는 바탕에 깐 영상의 소리를 담지 못했어요. 그림만 들어 있어요.');
    if (made.stills) notes.push(canFilmScenes() ? '읽지 못한 바탕 영상은 멈춘 그림으로 들어갔어요.' : '이 브라우저에서는 바탕에 깐 영상이 멈춘 그림으로 들어갔어요.');
    if (made.missingFonts.length) notes.push(`글꼴(${made.missingFonts.join(', ')})을 받지 못해 기본 글꼴로 나왔어요. 인터넷을 확인하고 다시 만들어 봐요.`);
    const done = el('div', { class: 'cv-film-stage' }, view);
    done.style.setProperty('--cv-film-ratio', String(size.width / size.height));
    box.replaceChildren(
      el('h2', { text: '영상이 다 됐어요' }), done,
      el('p', { class: 'cv-film-label', role: 'status', text: facts.join(' · ') }),
      ...notes.map((text) => el('p', { class: 'muted cv-film-note', text })),
      el('div', { class: 'cv-film-actions' },
        el('button', { class: 'btn', type: 'button', onClick: () => closeModal() }, '닫기'),
        el('a', { class: 'btn btn-primary cv-film-save', href: url, download: name, onClick: () => toast('영상 파일로 내려받았어요.', 3500) }, ...face('download', '내려받기'))));
    box.querySelector('.cv-film-save').focus();
  } catch (ex) {
    console.error(ex);
    if (stop.signal.aborted) return;
    making = false;
    if (box.isConnected) closeModal();
    if (ex?.code === 'too-long') { toast(`영상은 ${MAX_FILM_SECONDS / 60}분까지 만들 수 있어요. 바탕에 깐 영상의 쓸 구간을 줄여 봐요.`, 5000); return; }
    toast(vsize !== VIDEO_SIZES[0].id ? `영상으로 만들지 못했어요. "${VIDEO_SIZES[0].name}" 크기로 다시 해 봐요.` : '영상으로 만들지 못했어요. 잠시 뒤에 다시 해 봐요.', 5000);
  }
}

// 창을 닫거나 다른 곳으로 갈 때: 미뤄 둔 저장을 바로 한다.
function flush() {
  const O = S.open;
  const saving = !!O?.dirty;
  if (saving) save(O, { leaving: true });
  if (O && !O.closed) rememberOpen(O, saving);  // 막 처음 저장하는 그림도(저장이 아직 끝나지 않았다)
  if (O && pusher) pusher.flush(O.record.id);
}
// 창을 떠날 때의 임시본(그림마다 하나). 저장소가 꽉 찼거나 그림이 너무 크면 남기지 않는다(그때는 IndexedDB 저장만 믿는다).
const draftKey = (id) => `onbatang-draft-v1:${storageName()}:${id}`;
function keepDraft(record) {
  try { localStorage.setItem(draftKey(record.id), JSON.stringify(record)); } catch { /* 남기지 못해도 IndexedDB 저장은 그대로 한다 */ }
}
function dropDraft(id) {
  try { localStorage.removeItem(draftKey(id)); } catch { /* 기억하지 못하는 창 */ }
}
/** 시작할 때: 남은 임시본이 이 기기에 저장된 것보다 새것이면(또는 저장된 것이 없으면) 그것으로 저장하고, 임시본은 지운다. */
async function recoverDrafts() {
  let keys = [];
  try { keys = Object.keys(localStorage).filter((k) => k.startsWith(`onbatang-draft-v1:${storageName()}:`)); } catch { return; }
  for (const key of keys) {
    try {
      const draft = JSON.parse(localStorage.getItem(key));
      const stored = draft?.id ? await getDesign(draft.id) : null;
      if (draft?.id && (!stored || (Number(stored.revision) || 0) < (Number(draft.revision) || 0))) await putDesign(draft);
      localStorage.removeItem(key);
    } catch (ex) {
      console.warn(ex);            // 읽지 못한 임시본은 그대로 둔다(다음에 다시 해 본다)
    }
  }
}
// 새로 고침해도 꾸미던 그림 · 장으로 돌아오게: 이 창(탭)에만 무엇을 열어 두었는지 적어 둔다(resume 을 켠 곳만).
const openKey = () => `onbatang-open-v1:${storageName()}`;
function rememberOpen(O, saving = false) {
  if (!resumeOpen || !(O.saved || saving)) return;
  try { sessionStorage.setItem(openKey(), JSON.stringify({ id: O.record.id, at: O.at })); } catch { /* 기억하지 못하는 창 */ }
}
function forgetOpen() {
  try { sessionStorage.removeItem(openKey()); } catch { /* 기억하지 못하는 창 */ }
}
// 새로 고침 · 뒤로 가기로 돌아왔을 때만 다시 연다(주소를 새로 열면 첫 화면).
function readOpen() {
  try {
    if (!['reload', 'back_forward'].includes(performance.getEntriesByType('navigation')[0]?.type)) return null;
    const v = JSON.parse(sessionStorage.getItem(openKey()));
    return v && typeof v.id === 'string' ? v : null;
  } catch { return null; }
}

/**
 * 미니캔 앱을 시작한다. 한 쪽(page)에 한 번만 부른다.
 * - root: 앱을 그릴 곳(없으면 #app)
 * - fonts: 글꼴 목록 [{ id, name, desc?, url }] · titleFont: 템플릿의 큰 제목에 쓸 글꼴 id
 * - storage: 이 기기의 저장소 이름(같은 주소에서 다른 앱과 섞이지 않게. 기본 'minican')
 * - onView(view): 화면이 바뀔 때('home' · 'edit') 알려 준다(들여 쓰는 곳이 둘레를 맞출 때 쓴다)
 * - brand: 들여 쓰는 곳의 표시 { name, logo }. 꾸미는 화면 위 막대 맨 앞에 작게 보인다(없으면 표시하지 않는다)
 * - onBrandClick(): 표시를 누르면 기기 저장과 계정 올리기를 마친 뒤 부른다. 저장하지 못하면 이동하지 않는다
 * - sync: 계정 저장 { pull, push, drop, accepts? }(sync.js). accepts(record)는 선택적인 기기 전용 자료 제외 정책이다.
 * - importAction: 가져오기 연결 { label, open, editorLabel?, editorDescription?, editorMode?: 'inline', hideHome? }.
 *   inline이면 내 자료 안의 root/close/openDesign을 제공한다. open은 {requestClose,dispose}를 반환할 수 있다.
 * - materialAction: {label, accepts?(record), open({designId,slideIndex})} 현재 그림 저장 후 같은 편집기에서 전체 자료 작업을 여는 선택 연결.
 *   기본 모드는 기존 호스트 이동 계약을 유지한다. 파일 해석과 저장은 호스트가 맡는다.
 * - activityAuthoring: 명시적으로 true인 호스트만 활동/앱 제작·설정을 제공한다. 기존 활동 실행·결과 저장은 항상 유지한다.
 * - resume: true 면 새로 고침한 뒤 이 탭에서 꾸미던 그림 · 장을 다시 연다(공용 온바탕 첫 쪽이 켠다. 그림을 스스로 여는 들여 쓰는 곳은 끈 채로 둔다).
 * - lessonAction: {label, editorTitle?, accepts?(record), open({designId,slideIndex,inline})}; 저장 후 같은 편집 영역에서 호스트의 수업 구성/진행을 연다. 공용 기본값은 숨김.
 * - accountAction: {label,editorTitle?,open({from,designId?,inline})}; 첫 화면과 편집기 안의 계정 수업 목록. 기본값은 숨김이며 서버/로그인은 호스트가 담당한다.
 * - shareAction: {label,title?,open({designId,flush(),goTo(slideIndex,{upload})}),saved?(record)}; 편집기 위 막대의 공유 단추(가이랩의 보기 전용 링크). saved 는 이 기기에 저장할 때마다 불린다(링크에 반영은 호스트가 모아서). 기본값은 숨김.
 */
export function startMinican({ root = document.getElementById('app'), fonts = [], titleFont = '', storage = 'minican', onView: view = null, brand: mark = null, onBrandClick: hostHome = null, sync: account = null, importAction: importing = null, materialAction: material = null, lessonAction: lesson = null, accountAction: accountLibrary = null, shareAction: sharing = null, materialNavigation: navigation = null, appMaker: maker = null, activityAuthoring: authoring = false, resume = false, embed = null, syncDelay = null } = {}) {
  if (app) throw new Error('minican already started');
  if (!root) throw new Error('minican root');
  app = root;
  app.classList.add('cv-app-root');
  if (typeof view === 'function') onView = view;
  brand = cleanBrand(mark);
  if (typeof hostHome === 'function') onBrandClick = hostHome;
  if (importing && typeof importing.open === 'function' && typeof importing.label === 'string' && importing.label.trim()) importAction = importing;
  if (material && typeof material.open === 'function' && typeof material.label === 'string' && material.label.trim() && (!material.accepts || typeof material.accepts === 'function')) materialAction = material;
  if(lesson&&typeof lesson.open==='function'&&typeof lesson.label==='string'&&lesson.label.trim()&&(!lesson.accepts||typeof lesson.accepts==='function'))lessonAction=lesson;
  if(accountLibrary&&typeof accountLibrary.open==='function'&&typeof accountLibrary.label==='string'&&accountLibrary.label.trim())accountAction=accountLibrary;
  if(navigation&&typeof navigation.load==='function')materialNavigation=navigation;
  if(sharing&&typeof sharing.open==='function'&&typeof sharing.label==='string'&&sharing.label.trim())shareAction=sharing;
  activityAuthoring=authoring===true;
  resumeOpen=resume===true;
  if (embed && typeof embed.done === 'function' && (embed.close == null || typeof embed.close === 'function')) {
    const label = (v) => (typeof v === 'string' && v.trim() ? Array.from(v.trim()).slice(0, 16).join('') : '');
    embedMode = { ...embed, doneLabel: label(embed.doneLabel), closeLabel: label(embed.closeLabel) };
  }
  if(maker&&typeof maker.connect==='function'&&typeof maker.generate==='function')appMaker=maker;
  if (account && ['pull', 'push', 'drop'].every((k) => typeof account[k] === 'function')) {
    sync = account;
    pusher = createPusher(sync, { onDone: pushed, ...(Number.isFinite(syncDelay) && syncDelay >= 500 ? { delay: Math.min(60000, syncDelay) } : {}) });
  }
  setStorageName(storage);
  colorPalettes=createLocalPalettes(storage);
  useFonts(fonts, titleFont);
  setupApp();
  window.addEventListener('pagehide', flush);
  document.addEventListener('contextmenu', onPageMenu);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  S.phase = 'boot';
  return refresh();
}

/** Check before a wrapper replaces DOM; this editor owns one app per window. */
export function isMinicanStarted() { return app !== null; }

/** Open an already persisted host import. Never replaces an active/unsaved editor. */
export async function openSavedDesign(id, { slideIndex = 0, tab = null } = {}) {
  if (!app || S.phase !== 'home' || S.open || moving) throw new Error('EDITOR_BUSY');
  const record = await getDesign(id);
  if (!record) throw new Error('DOCUMENT_NOT_FOUND');
  if (S.open || moving) throw new Error('EDITOR_BUSY');
  upsert(record);
  openDesign(record, false);
  if (Number.isSafeInteger(slideIndex) && slideIndex > 0 && slideIndex < S.open.slides.length) goSlide(S.open, slideIndex);
  if (typeof tab === 'string') S.open.editor.openTab(tab);
}

let hostFlush = null;
/** Persist the latest editor state before an explicit host save. Never closes or replaces it.
 * Rejects on failed local persistence rather than returning an older saved record.
 */
export function flushSavedDesign(id) {
  if (!app || moving) return Promise.reject(new Error('EDITOR_BUSY'));
  if (S.open && S.open.record.id !== id) return Promise.reject(new Error('EDITOR_MISMATCH'));
  if (hostFlush) return hostFlush.id === id ? hostFlush.job : Promise.reject(new Error('EDITOR_BUSY'));
  const editor = S.open;
  const job = (async () => {
    const wasInert = app.inert;
    const previousFocus = !wasInert && app.contains(document.activeElement) ? document.activeElement : null;
    if (editor) app.inert = true;
    try {
      if (editor) {
        if (editor.putting) await editor.putting;
        if (editor.closed || S.open !== editor) throw new Error('EDITOR_BUSY');
        let ok = await save(editor);
        if (editor.dirty) ok = await save(editor);
        if (!ok || editor.dirty || editor.localOk === false) throw new Error('EDITOR_SAVE_FAILED');
      }
      const record = await getDesign(id);
      if (!record) throw new Error('DOCUMENT_NOT_FOUND');
      return record;
    } finally {
      if (editor && S.open === editor) {
        app.inert = wasInert;
        // A rendered inert frame blurs the stage. Restore only that temporary
        // loss, so the next shortcut works without stealing a host control's focus.
        if (!wasInert && !editor.closed && previousFocus?.isConnected && app.contains(previousFocus)
          && document.activeElement === document.body && document.hasFocus()) {
          try { previousFocus.focus({ preventScroll: true }); } catch { /* Keep the save result if focus is no longer available. */ }
        }
      }
    }
  })();
  hostFlush = {id, job};
  job.finally(() => { if (hostFlush?.job === job) hostFlush = null; }).catch(() => {});
  return job;
}
