// 온바탕 편집기: 옆 칸에서 넣고 → 카드에서 누르고 끌어 옮기고 → 도구 막대에서 꾸민다.
// 낱말은 초등학생이 바로 알아듣는 우리말로 쓴다(틀 · 글 · 꾸미기 · 내 자료 · 바탕 · 겹 순서 …).
// 계산과 규칙은 model.js·cutout.js(순수 함수)에 있고, 여기는 화면과 손가락·마우스·키보드만 다룬다.
// 저장소는 모른다: 사진을 어디에 올릴지는 uploadImage 로, 무엇이 바뀌었는지는 onChange 로 프로젝트가 정한다.
import { el, toast } from './dom.js';
import { newId, cleanNotes, NOTES_LIMIT, cleanTopic } from './document.js';
import {
  COLORS, SHAPES, SHAPE_GROUPS, MASKS, OPACITY, TEXT_PRESETS, settings, configure, reshapeItems, backgroundOf, fontList, fontFamilyOf, layoutList, textLimit, clip, DEFAULT_FONT,
  cleanBg, cleanItems, cleanDesign, emptyDesign, cleanItem, cleanImg, moveLayer, newPresetText, newEmoji, newShape, newArt, newYouTube, newPhoto, moveItem, rotateItem,
  designMotion, reorder, duplicateItem, pasteItem, itemLabel, sizeOf, resizeTo, sizeRange, alignItem, coverItem, layoutItems, EDGE, canEdge, canRound, cornerOf, THICK, isLine, thickOf, thicken,
  designVideo, cleanVideo, trimVideo, videoSeconds, videoTime, VIDEO_FITS, MIN_VIDEO, rebaseItems, alignBoxes, distributeBoxes, clampShift, scaleItems, regroup, newGroupId,
  styleOf, applyStyle, LINE_SPACINGS, ALT_LIMIT,
} from './model.js';
import { ENTERS, COMBOS, TRANSITIONS, EMPHASES, IDLES, EXITS, SPEEDS, DELAYS, STILL, planMotion, playEnter, playEmphasis, playExit, playIdle, playDesign, playTransition, morphs, enterTime, emphasisTime, exitTime } from './motion.js';
import { searchStickers } from './stickers.js';
import { ART_PACKS, artSvg, artColorable, artReady, loadArt, searchArt } from './art.js';
import { designView, itemView, placeItem, paintCard, shapeThumb } from './render.js';
import { styleRuns, runsAll, dropRunKey, shiftRuns } from './runs.js';
// 부분 서식으로 입힐 수 있는 것: 도구 막대의 값 이름 → 구간의 열쇠(runs.js)
const RUN_KEYS = [['bold', 'b'], ['italic', 'i'], ['under', 'u'], ['color', 'c']];
import { layoutLinks, relink, LINK_LINE, LINK_SHAPES, LINK_LABEL_MAX, linkSvg, linkHandle, dragLinkHandle, linkLabelSize, linkLabelT, linkEnds, endSpot, pieceNear, boxOfItem } from './links.js';
import { sceneView, scenePlayer, keepScene, probeVideo, ACCEPT_VIDEOS } from './scene.js';
import { icon } from './icons.js';
import { parseYouTube, ytStart, ytTime, ytWatch } from './youtube.js';
import { ACCEPT_IMAGES, PHOTO_EDGE, readPixels, canvasToPng, shrinkImage } from './images.js';
import { fontReady } from './fonts.js';
import { TOLERANCE, colorAlpha, prepareAlpha, finishCutout, resizeMask, plainBorder } from './cutout.js';
import { anchorResizedItem, resizeItemFromHandle } from './resize.js';
import {cleanPalettes,updatePalettes} from './palettes.js';
import {FULL_CROP, cleanCrop, coverCrop, cropImage, panCrop} from './crop.js';

const HISTORY = 40;
// 옆 메뉴의 칸: [이름, 아이콘(icons.js), 보이는 이름, 한 줄 설명]
const TABS = [
  ['layout', 'template', '틀', '만들어 둔 틀을 눌러 시작해요. 글을 눌러 내 글로 바꿔요.'],
  ['text', 'text', '글', '넣은 글은 두 번 눌러 고쳐요.'],
  ['element', 'shapes', '꾸미기', '도형과 그림 조각을 눌러 놓아요. 색과 크기는 위 도구에서 바꿔요.'],
  ['upload', 'upload', '내 자료', '사진·영상을 넣어요.'],
  ['bg', 'palette', '바탕색', '이 장의 바탕색을 골라요.'],
  ['layer', 'layers', '겹 순서', '앞에 보이는 조각부터 차례로 나와요.'],
];
// 움직임 칸은 configure({ motion: true }) 를 한 프로젝트에만 나온다(발표 화면이 있는 곳).
const MOTION_TAB = ['motion', 'motion', '움직임', '발표할 때 조각과 장이 움직여요.'];
const tabList = () => (settings().motion ? [...TABS, MOTION_TAB] : TABS);
// 영상(바탕 영상 · 유튜브)은 "내 자료"의 "영상" 칸 한곳에 있다. 바탕 영상(그 장의 바탕에 까는 영상 파일 · 찍은 것)은 편집기에 saveVideo 를 준 프로젝트에만 나온다.
// 영상 장면의 한도(기본값): 카메라로 한 번에 찍는 길이(초) · 골라 넣는 파일의 길이(초)와 크기(바이트)
const VIDEO_LIMITS = { maxSeconds: 60, maxFileSeconds: 300, maxBytes: 200 * 1024 * 1024 };
const ALIGN_NAME = { l: '왼쪽', c: '가운데', r: '오른쪽' };
const ALIGN_ICON = { l: 'alignL', c: 'alignC', r: 'alignR' };
const ITEM_ICON = { text: 'text', emoji: 'shapes', shape: 'shapes', art: 'shapes', image: 'image', yt: 'video' };
const NEXT_ALIGN = { l: 'c', c: 'r', r: 'l' };
const LONG_PRESS = 550;       // 손가락으로 이만큼(ms) 누르고 있으면 오른쪽 누르기 메뉴가 열린다
// 복사해 둔 요소들(이 화면 안에서만 쓰는 클립보드. 다른 카드에 붙여 넣을 수 있다). 여럿을 함께 복사하면 여럿이 들어 있다.
let clipboard = null;

const BLOB_CACHE = 12;         // 이번에 올린 사진의 파일 내용을 이만큼까지 기억해 둔다(배경 제거에서 다시 읽으려고)

/**
 * 편집기를 만든다. 돌려주는 것: { stage, toolbar, panel, mount(host), setDesign(design), setAspect(aspect, { fit }), getDesign(), getUploads(), setUploads(list),
 *   refresh(), refreshFonts(), forget(), busy(), quiet(), destroy() }
 *
 * 화면 조각은 셋이다. 프로젝트의 짜임에 맞게 따로 놓아도 되고, mount(host) 로 기본 짜임에 한꺼번에 놓아도 된다.
 *   - stage: 카드(꾸미기 판) · toolbar: 고른 요소에 따라 바뀌는 도구 막대 · panel: 옆 메뉴(넣을 것 고르기)
 *
 * options
 *   - design: 처음에 꾸밀 디자인 { bg, items } (없으면 빈 디자인). 편집기는 이 객체의 bg 와 items 를 그 자리에서 바꾼다.
 *   - onChange(design): 디자인이 바뀔 때마다 부른다(저장·미리보기 갱신 등은 여기서).
 *   - uploadImage({ blob, ext, type, ratio }): 사진을 저장하고 { url, path? } 를 돌려주는 함수(비동기 가능).
 *       편집기가 미리 줄여서(긴 쪽 800) 넘겨준다. 주지 않으면 이 화면에서만 보이는 임시 주소(blob:)를 쓴다(새로 고침하면 사라진다).
 *   - loadImageBlob(item): 저장해 둔 사진의 파일 내용을 돌려주는 함수(배경 제거용). 주지 않으면 fetch(item.url) 로 받는다.
 *   - documentImport: { label, description?, open() } 내 자료에 문서 가져오기 단추를 보이는 선택 연결. 파일 해석·저장·이동은 호스트가 맡는다.
 *   - outline: { open() } 틀 칸 맨 위에 "개요로 여러 장 만들기" 단추를 보이는 선택 연결(여러 장을 다루는 프로젝트만 준다. 장을 만드는 일은 프로젝트가 한다).
 *   - fonts(): 지금 고를 수 있는 글꼴 목록을 돌려주는 함수(주지 않으면 configure 에 준 전부).
 *   - onAspect(aspect): 카드의 모양(가로 ÷ 세로)이 실행 취소·다시 실행으로 바뀌었을 때(setAspect 로 모양을 바꾸는 프로젝트만 쓴다).
 *   - notify(message, ms): 알림을 보여 주는 함수(주지 않으면 화면 아래의 작은 알림).
 *   - onMotionAll({ pa, tr }): 움직임 칸의 "모든 장에 똑같이"를 눌렀을 때(여러 장을 다루는 프로젝트만 준다. 주지 않으면 그 단추가 없다).
 *       지금 장의 조합 효과(pa)와 전환 효과(tr)를 넘겨준다(정하지 않은 것은 빠져 있다). 다른 장들에 적는 일은 프로젝트가 한다.
 *   - saveVideo({ blob, type, seconds, width, height }): 영상 파일을 저장하고 그 열쇠(글)를 돌려주는 함수(비동기 가능. 저장하지 못하면 오류를 낸다:
 *       그때 편집기는 영상을 넣지 않고 알린다). 주면 옆 메뉴에 "영상" 칸이 나온다:
 *       그 장의 바탕에 영상을 깔고(영상 장면), 앞뒤를 자르고, 소리 크기와 화면 맞춤을 정한다. 디자인에는 열쇠와 쓰는 구간만 적힌다(design.video).
 *       저장해 둔 파일을 다시 꺼내는 방법은 configure({ loadVideo }) 로 알려 준다(그리는 곳 어디서나 쓰이므로 편집기가 아니라 설정에 둔다).
 *   - createCamera(): 카메라를 만드는 함수(주면 "카메라로 찍기"가 나온다). 돌려주는 것은 minicut/camera.js 의 createCamera 와 같은 모양이어야 한다:
 *       { video(미리 보기 요소), open() → { audio }, close(), flip(), canFlip(), start({ maxSeconds, onTick, onDone }), stop(), recording }
 *   - videoLimits: { maxSeconds(카메라로 한 번에 찍는 길이. 기본 60초), maxFileSeconds(골라 넣는 파일의 길이. 기본 300초), maxBytes(파일 크기. 기본 200MB) }
 *   - videoNote: 영상 칸에 적을 안내 글(영상 파일이 어디에 저장되는지처럼 프로젝트마다 다른 것).
 *   - videoHint: 깔아 둔 영상이 어디에서 틀어지는지 알려 주는 글(비우면 "발표에서 소리와 함께 틀어져요 …". 영상 파일로 만드는 기능이 있는 프로젝트는 그것도 적는다).
 *   - onSelect(id): 고른 요소가 바뀔 때 그 요소의 이름표(id, 없으면 '')를 알려 준다(여럿이 함께 꾸미는 프로젝트가 "누가 무엇을 고르고 있는지" 나눌 때).
 *   - lockedBy(item): 그 요소를 다른 사람이 고르고 있으면 그 사람의 이름을, 아니면 ''를 돌려준다. 이름이 오면 그 요소를 고를 수 없다(함께 꾸밀 때).
 *   함께 꾸밀 때 쓰는 것: merge(design, patch) — 다른 사람이 바꾼 것을 끼워 넣는다 · idle() — 지금 끼워 넣어도 되는지 · markOthers(list) — 다른 사람이 고른 요소에 테두리
 */
export function createEditor({
  design = null, onChange = () => {}, uploadImage = null, loadImageBlob = null, fonts = fontList, notify = toast, onAspect = () => {},
  uploads = null, usedElsewhere = null, onRemoveUpload = null, onMotionAll = null, canPaste = () => true,
  documentImport = null, colorPalettes = null,
  saveVideo = null, createCamera = null, videoLimits = null, videoNote = '', videoHint = '',
  onSelect = null, lockedBy = null, slideMenu = null, outline = null,
} = {}) {
  let card = null;            // 지금 꾸미는 디자인(card.items 를 새 목록으로, card.bg 를 새 값으로 바꿔 끼운다)
  let palettes;try{palettes=cleanPalettes(colorPalettes?.read());}catch{palettes=cleanPalettes();}
  let sampling=null;
  function paletteAction(action){
    palettes=updatePalettes(palettes,action);
    try{colorPalettes?.write(palettes);}catch{notify('이 기기에 팔레트를 저장하지 못했어요. 이번 화면에서는 계속 쓸 수 있어요.',4000);}
  }
  function colorTarget(){const it=cur();if(many.length||it?.lock)return null;if(!it)return {value:backgroundOf(card.bg).bg,apply:setBg};if(['text','shape','art','link'].includes(it.t)&&it.color)return {value:it.color,apply:it.t==='shape'?fillWith:hex=>change({color:hex})};return null;}
  function eyedropper(value,onPick,fallback){
    return el('button',{class:'fe-btn fe-eyedropper',type:'button','aria-label':'화면에서 색 추출',title:'화면에서 색 추출 (I) · Esc로 취소',onClick:()=>sampleColor(value,onPick,fallback)},icon('eyedropper'),el('span',{text:'스포이드'}));
  }
  async function sampleColor(value,onPick,fallback){
    if(sampling||!card)return;
    if(typeof globalThis.EyeDropper!=='function'){
      notify('이 브라우저는 화면 스포이드를 지원하지 않아 색 선택 창을 열어요.',4000);
      if(fallback){try{fallback.showPicker?fallback.showPicker():fallback.click();}catch{fallback.click();}}
      else{pop=cur()?'color':'pagebg';renderBar();const input=popBox.querySelector('input[type=color]');try{input?.showPicker?input.showPicker():input?.click();}catch{input?.click();}}
      return;
    }
    const job={card,sel:cur(),controller:new AbortController()};sampling=job;
    try{
      // Invoke open directly from the user gesture; do not await anything first.
      const result=await new globalThis.EyeDropper().open({signal:job.controller.signal});
      if(sampling!==job||card!==job.card||cur()!==job.sel||many.length)return;
      if(!/^#[0-9a-f]{6}$/i.test(result.sRGBHex))return;
      paletteAction({type:'add',color:result.sRGBHex});onPick(result.sRGBHex.toLowerCase());renderBar();renderPanel();
      notify(`색을 적용하고 팔레트 ${palettes.active+1}에 담았어요.`);
    }catch(error){if(error?.name!=='AbortError')notify('색을 추출하지 못했어요. 다시 누르거나 직접 색을 골라주세요.');}
    finally{if(sampling===job)sampling=null;}
  }
  function savedColors(value,onPick){
    const box=el('section',{class:'fe-palettes','aria-label':'나의 팔레트'});
    function fill(){
      const slot=palettes.slots[palettes.active];
      const choose=hex=>{paletteAction({type:'recent',color:hex});onPick(hex);};
      const chips=(colors,remove=false)=>el('div',{class:'fe-palette-colors'},...colors.map(hex=>{
        const pick=el('button',{class:'fe-palette-color',type:'button',title:hex,'aria-label':`${hex} 적용`,'aria-pressed':String(value===hex),onClick:()=>choose(hex)});pick.style.background=hex;
        return el('span',{class:'fe-palette-cell'},pick,remove?el('button',{class:'fe-palette-remove',type:'button','aria-label':`${hex} 팔레트에서 지우기`,title:'팔레트에서 지우기',onClick:()=>{paletteAction({type:'remove',color:hex});fill();}},'×'):null);
      }));
      const name=el('input',{class:'fe-palette-name',value:slot.name,maxlength:'18','aria-label':'팔레트 이름',onChange:()=>{paletteAction({type:'rename',name:name.value});fill();}});
      box.replaceChildren(...[el('div',{class:'fe-palette-heading'},el('b',{text:'나의 팔레트'}),el('small',{text:colorPalettes?'이 기기에 저장':'이번 화면에서 사용'})),
        el('div',{class:'fe-palette-slots',role:'group','aria-label':'팔레트 슬롯'},...palettes.slots.map((s,i)=>el('button',{type:'button','aria-label':`팔레트 ${i+1}: ${s.name}`,'aria-pressed':String(i===palettes.active),onClick:()=>{paletteAction({type:'select',index:i});fill();}},String(i+1)))),
        el('div',{class:'fe-palette-heading'},name,el('button',{class:'fe-btn',type:'button',disabled:!/^#[0-9a-f]{6}$/i.test(value||''),onClick:()=>{paletteAction({type:'add',color:value});fill();}},'현재 색 담기')),
        slot.colors.length?chips(slot.colors,true):el('p',{class:'fe-note',text:'스포이드로 찍거나 현재 색을 담아보세요. 최대 12색까지 모아요.'}),
        palettes.recent.length?el('div',{},el('small',{text:'최근 사용한 색'}),chips(palettes.recent)):null].filter(Boolean));
    }fill();return box;
  }
  const blobs = new Map();    // 사진 주소 → 파일 내용
  let sel = -1;               // 고른 것의 번호(없으면 -1)
  let many = [];              // 여럿을 함께 골랐을 때 그 번호들(둘 이상일 때만. 그동안 sel 은 -1). 잠근 것은 넣지 않는다
  let preview = null;         // 꾸미기 판에서 미리 보는 움직임 { ctl, tr, timers }
  let idleTry = null;         // 움직임 칸에서 골라 본 "계속 움직이기"(잠깐 틀고 멈춘다)
  let motionSel = -1;         // 움직임 칸을 마지막으로 그렸을 때 고른 요소
  let nodes = [];             // 카드 위의 요소들(card.items 와 같은 순서)
  let past = [];              // 실행 취소 기록
  let future = [];            // 다시 실행 기록
  let drag = null;
  let tab = 'layout';         // 옆 메뉴에서 열려 있는 칸
  let pop = null;             // 도구 막대 아래에 펼쳐진 칸: 'color' · 'bgc' · 'edge' · 'corner' · 'thick' · 'size' · 'op' · 'flip' · 'pos' · 'swap' · 'mask' · 'cut' · null
  let busy = false;           // 사진 올리는 중
  let cropJob = null;         // Preview only; Apply creates a single undo step.
  let importingDocument = false;
  let uploadTab = 'photo';     // 내 자료의 종류는 같은 편집기를 다시 그려도 유지한다.
  let youtubeInput = null;
  const uploadTabsId = newId('u');
  const uploadHelpOpen = {photo: false, ppt: false, youtube: false};
  let editing = -1;           // 카드 위에서 바로 글을 고치는 중인 글상자의 번호
  // 글을 고치면서 고른 글자 구간 { i: 글상자 번호, s, e, text }. 도구 막대의 굵게 · 기울임 · 밑줄 · 글자 색은 이 구간에만 입힌다.
  // 도구 막대를 누르면 글 고치기가 먼저 끝나므로 구간을 따로 기억해 둔다. 카드의 다른 곳을 누르거나 다른 조각을 고르면 잊는다.
  let textRange = null;
  let typed = false;          // 이번에 고치기 시작한 뒤 기록을 남겼는지(처음 한 번만 남긴다)
  let cut = null;             // 배경 제거 작업(openCut 의 job): 방식(AI · 단색) · 막대 값 · 붓질 · 미리보기
  let armed = null;           // 한 번 눌러 둔 템플릿(이미 꾸민 카드에서는 한 번 더 눌러야 바뀐다)
  let menu = null;            // 열려 있는 오른쪽 누르기 메뉴(없으면 null)
  let press = null;           // 길게 누르기를 기다리는 중: { id, x, y, timer }
  let library = [];           // 올린 파일 목록 [{ url, path? }] (올린 차례대로. configure({ maxUploads }) 가 1 이상일 때만 쓴다)
  let armedFile = null;       // 지우려고 한 번 눌러 둔 올린 파일의 주소(한 번 더 확인하고 지운다)
  let artQuery = '';          // 그림 찾기의 낱말과 묶음(옆 칸을 다시 그려도 그대로 둔다). 묶음 'emoji' 는 기기 이모지
  let artFrom = '';
  const thumbs = new Map();   // 올린 파일의 주소 → 목록에 보이는 작은 그림(<img>). 칸을 다시 그릴 때 같은 것을 다시 써서 깜빡이지 않게 한다
  let sorting = null;         // 레이어를 끌어 순서를 바꾸는 중: { id, row, list, from, to, y0, … }
  let sorted = false;         // 방금 끌어서 옮겼다(뒤따라오는 누르기는 모른 척한다)
  let scene = null;           // 꾸미기 판에 깔린 영상 장면: { src, layer(그림), player(조종기), state: 'loading'|'ready'|'missing' }
  let cam = null;             // 카메라로 찍는 중: { camera, phase: 'opening'|'ready'|'recording'|'saving'|'error', … }
  let filing = false;         // 고른 영상 파일을 살펴보고 넣는 중
  let others = [];            // 다른 사람이 고른 요소들 [{ id, name, color }] (함께 꾸밀 때. markOthers 로 받는다)
  let lastSelId = '';         // 마지막으로 onSelect 에 알린 이름표
  const limits = { ...VIDEO_LIMITS, ...(videoLimits && typeof videoLimits === 'object' ? videoLimits : {}) };
  const hasDocumentImport = typeof documentImport?.open === 'function' && typeof documentImport.label === 'string' && !!documentImport.label.trim();
  const tabsHere = () => tabList().map(row => row[0] === 'upload' ? [...row.slice(0, 3), hasDocumentImport ? '사진·PPT·영상을 넣어요.' : '사진·영상을 넣어요.'] : row);
  // 영상 칸(내 자료 → 영상)을 보고 있는지. 바탕 영상의 상태가 바뀌면 칸을 다시 그린다.
  const videoOpen = () => tab === 'upload' && uploadTab === 'video';

  const guideV = el('div', { class: 'fe-guide v', hidden: true });
  const guideH = el('div', { class: 'fe-guide h', hidden: true });
  const handle = (h, cls, label, pic = null) => el('span', { class: `fe-h fe-${cls}`, dataset: { h, ...(h === 'scale' ? { corner: cls.split(' ').at(-1) } : {}) }, title: label }, pic);
  const hWide = handle('wide', 'wide', '너비 바꾸기 · 왼쪽 변 고정 · Ctrl: 가운데 기준');
  const hTall = handle('tall', 'tall', '높이 바꾸기 · 위쪽 변 고정 · Ctrl: 가운데 기준');
  const resizeHint = '가로·세로 바꾸기 · Shift: 비율 유지 · Ctrl: 가운데 기준';
  // 손잡이의 차례: 변의 손잡이를 먼저, 모서리의 손잡이를 나중에 둔다(작은 요소에서 닿는 자리가 겹치면 모서리가 위에 온다).
  const selBox = el('div', { class: 'fe-sel', hidden: true },
    handle('rot', 'rot', '돌리기', icon('upright')),
    hWide, hTall,
    handle('scale', 'scale nw', resizeHint), handle('scale', 'scale ne', resizeHint),
    handle('scale', 'scale sw', resizeHint), handle('scale', 'scale se', resizeHint),
    el('span', { class: 'fe-lockmark', 'aria-hidden': 'true' }, icon('lock')));
  // 고른 테두리의 가장 작은 크기(px). 요소가 이보다 작으면 테두리를 넉넉하게 둘러서, 손잡이끼리 겹치지 않고 따로 잡힌다.
  const coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
  const minBox = () => (coarse?.matches ? 52 : 40);
  // cardEl: 카드 그 자체(넘치는 것은 잘려 보인다). overlay: 테두리·손잡이·안내선(카드 밖으로 나가도 보여야 해서 따로 둔다).
  const cardEl = el('div', { class: 'fe-card' });
  // 영상 장면의 파일이 이 기기에 없을 때 꾸미기 판 위쪽에 보이는 이름표(요소에 가려지지 않게 맨 위 겹에 둔다)
  const sceneFlag = el('div', { class: 'fe-scene-flag', hidden: true }, icon('video'), el('span', { text: '이 기기에는 영상이 없어요' }));
  // 다른 사람이 고른 요소의 테두리들(함께 꾸밀 때). 내 테두리보다 아래에 그린다.
  const othersBox = el('div', { class: 'fe-others', 'aria-hidden': 'true' });
  // 여럿을 골랐을 때: 하나하나의 가는 테두리(manyBox)와 모두를 감싸는 상자(groupBox). 빈 곳을 끌어 고를 때의 네모(marquee).
  const manyBox = el('div', { class: 'fe-many', 'aria-hidden': 'true' });
  // 모두를 감싸는 상자의 네 모서리 손잡이: 끌면 고른 것들이 맞은편 모서리를 기준으로 함께 커지고 작아진다.
  const groupHandle = (corner) => el('span', { class: `fe-h fe-scale ${corner}`, dataset: { h: 'gscale', corner }, title: '함께 크기 바꾸기 · 모양 비율 유지 · Ctrl: 가운데 기준' });
  const groupBox = el('div', { class: 'fe-groupbox', hidden: true }, groupHandle('nw'), groupHandle('ne'), groupHandle('sw'), groupHandle('se'));
  const marquee = el('div', { class: 'fe-marquee', hidden: true });
  // 고른 곡선 · 꺾인 선의 손잡이: 끌면 휘는 깊이와 쪽(곡선) · 꺾이는 자리(꺾인 선)가 바뀐다(links.js 의 linkHandle · dragLinkHandle).
  const linkKnob = el('span', { class: 'fe-h fe-link-knob', dataset: { h: 'bend' }, hidden: true });
  // 고른 연결선의 두 끝 손잡이: 끌어서 다른 조각에 놓으면 그 조각으로 다시 잇고, 놓은 자리의 옆 · 자리에 붙는다(가운데 언저리면 알아서).
  const endKnob = (end) => el('span', { class: 'fe-h fe-link-end', dataset: { h: 'lend', corner: end }, hidden: true, title: end === 'from' ? '시작 끝: 끌어서 다른 조각 · 다른 자리에 잇기' : '닿는 끝: 끌어서 다른 조각 · 다른 자리에 잇기' });
  const linkEndKnobs = [endKnob('from'), endKnob('to')];
  // 끝을 끄는 동안 놓일 조각의 테두리
  const linkTarget = el('div', { class: 'fe-link-target', hidden: true, 'aria-hidden': 'true' });
  // 이어서 하나 더: 고른 조각(또는 그룹) 둘레의 + 단추. 누르면 그쪽 옆에 똑같은 것을 하나 더 놓고 화살표로 잇는다.
  const GROW = { right: ['오른쪽', [1, 0]], down: ['아래', [0, 1]], left: ['왼쪽', [-1, 0]], up: ['위', [0, -1]] };
  const growBox = el('div', { class: 'fe-grow-box', hidden: true },
    ...Object.entries(GROW).map(([dir, [name]]) => el('button', {
      class: `fe-grow ${dir}`, type: 'button', dataset: { grow: dir }, title: `${name}에 이어서 하나 더`, 'aria-label': `${name}에 이어서 하나 더 놓고 화살표로 잇기`,
      onClick: (e) => { e.stopPropagation(); grow(dir); },
    }, icon('plus'))));
  const overlay = el('div', { class: 'fe-overlay' }, othersBox, manyBox, guideV, guideH, selBox, linkTarget, linkKnob, ...linkEndKnobs, groupBox, growBox, marquee, sceneFlag);
  const cropLayer = el('div', {class:'fe-crop-layer',hidden:true});
  // 잇기 안내(꾸미기 칸의 "연결선" · 한 조각을 고른 뒤 "선 잇기"): 지금 누를 조각과 그만두기 단추.
  const linkHint = el('div', { class: 'fe-link-hint', role: 'status', hidden: true });
  const stage = el('div', {
    class: 'fe-stage', tabindex: '0', role: 'group',
    'aria-label': '꾸미기 판. 조각을 누르면 고르고, 끌면 옮겨요. 화살표 키로도 옮길 수 있어요.',
  }, cardEl, overlay, cropLayer, linkHint);
  const bar = el('div', { class: 'fe-bar', role: 'toolbar', 'aria-label': '고른 조각의 도구' });
  const popBox = el('div', { class: 'fe-pop', hidden: true });
  const toolbar = el('div', { class: 'fe-tools' }, bar, popBox);
  const panel = el('div', { class: 'fe-panel' });
  const fileInput = el('input', { type: 'file', accept: ACCEPT_IMAGES, hidden: true, onChange: onPhotoPicked });
  const videoInput = el('input', { type: 'file', accept: ACCEPT_VIDEOS, hidden: true, onChange: onVideoPicked });
  const replaceInput = el('input', { type: 'file', accept: ACCEPT_IMAGES, hidden: true, onChange: onReplacePicked });
  let replaceFor = null;      // 사진 바꾸기로 고른 사진(이름표, 없으면 번호)
  let styleClip = null;       // 스타일 복사로 담아 둔 꾸밈 값(styleOf)
  const camBox = el('div', { class: 'fe-cam', role: 'group', 'aria-label': '카메라로 찍기', tabindex: '-1' });
  // 발표자 노트: 그 장을 발표할 때 발표자만 보는 글. 그림에는 나오지 않는다. 프로젝트가 notes 조각을 놓을 자리를 정한다.
  const notesInput = el('textarea', {
    class: 'fe-notes-input', rows: '3', maxlength: String(NOTES_LIMIT), spellcheck: 'true', 'aria-label': '발표자 노트',
    placeholder: '발표할 때 나만 볼 메모를 적어요. 슬라이드 그림에는 나오지 않아요.',
    onInput: () => {
      if (!card) return;
      const text = cleanNotes(notesInput.value);
      if (text) card.notes = text; else delete card.notes;
      markNotes();
      onChange();
    },
  });
  const notesMark = el('span', { class: 'fe-notes-mark' });
  const notes = el('details', { class: 'fe-notes' }, el('summary', {}, el('span', { text: '발표자 노트' }), notesMark), notesInput);
  function markNotes() {
    const length = card?.notes?.length || 0;
    notesMark.textContent = length ? `${length}자` : '비어 있어요';
    notes.classList.toggle('has-notes', !!length);
  }

  const items = () => card.items;
  const cur = () => (sel >= 0 ? card.items[sel] : null);
  // 지금 고른 것들의 번호(하나만 골랐으면 그것 하나, 없으면 빈 목록).
  const chosen = () => (many.length ? many.slice() : sel >= 0 ? [sel] : []);
  // 여럿 고르기에 넣을 수 있는 것: 잠그지 않았고, 다른 사람이 고르고 있지 않은 것.
  const free = (i) => !!items()[i] && !items()[i].lock && !(lockedBy && lockedBy(items()[i]));
  // 그 요소가 든 그룹의 모든 번호(그룹이 아니면 그것 하나). 그룹은 늘 통째로 고른다.
  const groupOf = (i) => {
    const g = items()[i]?.g;
    return g ? items().map((it, k) => (it.g === g ? k : -1)).filter((k) => k >= 0) : [i];
  };
  const withGroups = (list) => [...new Set(list.flatMap(groupOf))];
  // 고른 것이 꼭 한 그룹인지(그룹 해제 단추를 보일지).
  const isGroup = () => many.length >= 2 && !!items()[many[0]]?.g && many.every((i) => items()[i].g === items()[many[0]].g) && groupOf(many[0]).length === many.length;
  const focusStage = () => stage.focus({ preventScroll: true });

  // ---------- 실행 취소 · 다시 실행 ----------
  // 카드의 모양(aspect)도 함께 적어 둔다: 모양을 바꾼 것도 실행 취소로 되돌아가고, 요소의 높이(세로에 대한 %)가 그때의 모양과 짝이 맞는다.
  // 사진의 주소는 기록마다 통째로 적지 않는다: 사진이 디자인 안에 글자로(data 주소) 들어 있는 프로젝트에서는 한 장이 1MB 쯤이라,
  // 기록 40개에 사진 10장씩 적으면 수백 MB 가 된다. 주소는 한 번만 들고 있고(shots), 기록에는 그 번호만 적는다.
  const shots = [];
  const shotMark = '\u0000shot:';
  const shotOf = (url) => {
    let i = shots.indexOf(url);
    if (i < 0) i = shots.push(url) - 1;
    return `${shotMark}${i}`;
  };
  const snap = () => JSON.stringify({
    items: card.items.map((it) => (it.t === 'image' && it.url.length > 200 ? { ...it, url: shotOf(it.url) } : it)), bg: card.bg, aspect: settings().aspect,
    ...designMotion(card), ...designVideo(card),
  });
  // 디자인의 움직임(조합 효과 pa · 전환 효과 tr)을 바꿔 적는다. 정하지 않은 것은 칸째 지운다(저장되는 모양에 빈 값이 남지 않게).
  function setMotion(next) {
    const m = designMotion(next);
    for (const key of ['pa', 'tr']) { if (m[key]) card[key] = m[key]; else delete card[key]; }
  }
  // 디자인의 영상 장면(video)을 바꿔 적는다. 없으면 칸째 지운다.
  function setVideo(next) {
    const v = designVideo(next);
    if (v.video) card.video = v.video; else delete card.video;
  }
  function remember() {
    past.push(snap());
    if (past.length > HISTORY) past.shift();
    future = [];
    markHistory();
  }
  // 실행 취소·다시 실행 단추만 고친다(글을 치거나 화살표로 옮길 때는 도구 막대를 통째로 다시 그리지 않으므로).
  function markHistory() {
    const u = bar.querySelector('.fe-tb.undo');
    const r = bar.querySelector('.fe-tb.redo');
    if (u) u.disabled = !past.length;
    if (r) r.disabled = !future.length;
  }
  function restore(text) {
    const s = JSON.parse(text);
    stopDrag();
    if (Number.isFinite(s.aspect) && s.aspect !== settings().aspect) onAspect(configure({ aspect: s.aspect }).aspect);
    card.items = s.items.map((it) => (it.t === 'image' && it.url.startsWith(shotMark) ? { ...it, url: shots[Number(it.url.slice(shotMark.length))] } : it));
    const bgChanged = card.bg !== s.bg;
    card.bg = s.bg;
    setMotion(s);
    setVideo(s);
    stopPreview();
    sel = -1;
    many = [];
    pop = null;
    cut = null;
    renderStage();
    renderUi();
    // 템플릿 칸은 지금 배경의 묶음을 맨 위에 보여 준다. 되돌려서 배경이 바뀌었으면 그 차례도 다시 맞춘다
    if (bgChanged && tab === 'layout') { armed = null; renderPanel({ top: true }); }
    if (tab === 'motion' || videoOpen()) renderPanel();
    onChange();
    keepKeys();
  }
  function undo() {
    if (!past.length) return;
    endEdit();
    future.push(snap());
    restore(past.pop());
  }
  function redo() {
    if (!future.length) return;
    endEdit();
    past.push(snap());
    restore(future.pop());
  }

  // 끄는 도중에 목록이 바뀌면(사진이 다 올라왔거나, 되돌리기·지우기 키를 눌렀거나) 끌기를 그만둔다.
  function stopDrag() {
    drag = null;
    guideV.hidden = true;
    guideH.hidden = true;
    marquee.hidden = true;
    linkTarget.hidden = true;
  }

  // ---------- 카드(꾸미기 판) ----------
  function renderStage() {
    dismissCrop();
    editing = -1;
    paintCard(cardEl, card.bg);
    nodes = items().map(itemView);
    // 바탕의 영상 장면은 떼었다 붙이지 않는다(떼면 틀던 영상이 멈추고 깜빡인다). 그 위의 것들만 새로 놓는다.
    syncScene();
    for (const n of [...cardEl.children]) if (n !== scene?.layer) n.remove();
    cardEl.append(...nodes,
      // 비어 있을 때만 보이는 안내(화면에만 있다: 디자인에도, 내보낸 그림에도 들어가지 않는다)
      // 빈 장에서는 무엇부터 할지 바로 고르는 단추를 함께 보인다(왼쪽 도구를 찾지 않아도 시작할 수 있게).
      ...(nodes.length || card.video ? [] : [el('div', { class: 'fe-empty' },
        el('b', { text: '무엇부터 놓을까요?' }),
        el('span', { text: '아래 단추를 누르거나, 도구 칸에서 골라요' }),
        el('div', { class: 'fe-empty-go', role: 'group', 'aria-label': '빠르게 시작하기' },
          quick('text', '큰 제목 쓰기', () => add(newPresetText('title'))),
          quick('shapes', '꾸미기', () => openTab('element')),
          quick('upload', hasDocumentImport ? '내 자료' : '사진 · 영상', () => openTab('upload')),
          quick('template', '틀 고르기', () => openTab('layout'))))]));
    syncSel();
  }

  // 빈 장의 빠른 시작 단추 · 옆 칸의 그 도구 열기(옆 칸이 접혀 있으면 들어 있는 화면이 편다: 단추를 누른 것과 같다)
  function quick(pic, text, onClick) { return el('button', { class: 'fe-quick', type: 'button', onClick }, icon(pic), el('span', { text })); }
  function openTab(id) {
    const btn = panel.querySelector(`.fe-tab[data-tab="${id}"]`);
    if (btn && !btn.classList.contains('on')) btn.click(); else btn?.focus();
    btn?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  // ---------- 영상 장면(이 장의 바탕에 깐 영상) ----------
  // 꾸미기 판의 바탕에 그 영상을 놓는다. 같은 파일이면 놓여 있는 것을 그대로 두고 구간 · 소리 · 화면 맞춤만 맞춘다.
  function syncScene() {
    const v = card?.video || null;
    if (scene && (!v || scene.src !== v.src)) dropScene();
    if (!v) return;
    if (scene) {
      scene.player.set(v);
      // 멈춰 있을 때는 쓰는 구간의 첫 모습을 보여 준다(앞을 잘랐거나 되돌렸으면 그 자리로)
      if (!scene.player.playing && scene.shown !== v.in) { scene.shown = v.in; scene.player.seek(v.in); }
      return;
    }
    const layer = sceneView(v);      // 첫 모습의 그림(작은 그림들과 같은 것을 쓴다). 곧 그 위에 진짜 영상이 얹힌다
    const mine = scene = { src: v.src, layer, player: null, state: 'loading', shown: v.in };
    mine.player = scenePlayer(layer, v, {
      onState: () => { if (scene === mine) markPlaying(); },
      onTime: (t) => { if (scene === mine) markTime(t); },
      onEnd: () => { if (scene === mine) markTime(card?.video?.out ?? 0); },
    });
    mine.player.ready.then((ok) => {
      if (scene !== mine) return;
      mine.state = ok ? 'ready' : 'missing';
      sceneFlag.hidden = ok;
      if (videoOpen() && !cam) renderPanel();
    });
    cardEl.prepend(layer);
  }
  function dropScene() {
    sceneFlag.hidden = true;
    if (!scene) return;
    scene.player.destroy();
    scene.layer.remove();
    scene = null;
  }
  // 영상 칸의 "틀어 보기" 단추와 진행 막대를 제자리에서 고친다(트는 동안 칸을 통째로 다시 그리지 않는다).
  function markPlaying() {
    const btn = panel.querySelector('.fe-video-play');
    if (!btn) return;
    const on = !!scene?.player.playing;
    btn.replaceChildren(icon(on ? 'pause' : 'play'), on ? '멈추기' : '틀어 보기');
    btn.setAttribute('aria-pressed', String(on));
  }
  function markTime(t) {
    const fill = panel.querySelector('.fe-video-fill');
    const v = card?.video;
    if (!fill || !v) return;
    fill.style.width = `${Math.min(100, Math.max(0, ((t - v.in) / Math.max(0.01, v.out - v.in)) * 100))}%`;
  }
  function toggleVideo() {
    if (!scene || scene.state !== 'ready') return;
    if (scene.player.playing) { scene.player.pause(); return; }
    showStage();
    scene.shown = -1;                      // 다 틀고 나면 멈춘 자리가 첫 모습이 아니다(다음에 맞출 때 되돌린다)
    scene.player.play();
  }
  // 영상 장면의 값을 바꾼다(되돌리기 기록은 부르는 쪽이 남긴다). 꾸미기 판의 영상에도 바로 맞춘다.
  function putVideo(next) {
    const v = cleanVideo(next);
    if (!v || !card.video) return;
    card.video = v;
    scene?.player.set(v);
  }
  // 한 번에 끝나는 바꾸기(화면 맞춤): 기록 → 바꾸기 → 알리기.
  function changeVideo(patch) {
    if (!card.video) return;
    endEdit();
    remember();
    putVideo({ ...card.video, ...patch });
    renderPanel();
    // 칸을 다시 그려서 누른 단추가 새것으로 바뀌었다: 같은 자리의 단추에 초점을 돌려놓는다
    if (patch.fit) panel.querySelector(`.fe-video-fit[data-fit="${patch.fit}"]`)?.focus({ preventScroll: true });
    onChange();
  }
  // 새 영상을 이 장의 바탕에 깐다(찍은 것 · 고른 파일). 먼저 프로젝트의 저장소에 맡기고, 받은 열쇠를 디자인에 적는다.
  async function placeVideo(made, target) {
    let key = '';
    try {
      key = await saveVideo({ blob: made.blob, type: made.type || made.blob.type || '', seconds: made.seconds, width: made.width || 0, height: made.height || 0 });
    } catch (ex) {
      console.error(ex);
      notify('영상을 이 기기에 저장하지 못해서 넣지 않았어요. 기기의 저장 공간을 확인해요.', 6000);
      return false;
    }
    const video = cleanVideo({ src: key, dur: made.seconds });
    if (!video) { console.error('saveVideo 가 쓸 수 있는 열쇠를 돌려주지 않았어요', key); notify('이 영상은 넣을 수 없어요.', 4000); return false; }
    keepScene(key, made.blob);
    // 넣는 사이에 다른 장으로 갔다: 그 장에 깔지 않는다(저장해 둔 파일은 쓰이지 않으므로 프로젝트가 정리한다)
    if (card !== target) { if (card) notify('다른 장으로 넘어가서 영상을 넣지 않았어요. 다시 넣어 봐요.', 5000); return false; }
    endEdit();
    stopDrag();
    const had = !!card.video;
    remember();
    card.video = video;
    renderStage();
    renderBar();
    if (videoOpen()) renderPanel();
    onChange();
    notify(had ? '영상을 바꿨어요. 실행 취소로 되돌릴 수 있어요.' : '영상을 깔았어요. 그 위에 글과 조각을 올릴 수 있어요.', 4000);
    return true;
  }
  // 영상을 넣은 뒤: 글쇠로 누르던 사람이 길을 잃지 않게 초점을 "틀어 보기"(없으면 꾸미기 판)에 둔다.
  function focusVideo() {
    const play = videoOpen() && !cam ? panel.querySelector('.fe-video-play') : null;
    if (play && !play.disabled) play.focus({ preventScroll: true }); else keepKeys();
  }
  function removeVideo() {
    if (!card.video) return;
    endEdit();
    stopDrag();
    remember();
    delete card.video;
    renderStage();
    renderBar();
    renderPanel();
    onChange();
    keepKeys();
    notify('영상을 뺐어요. 실행 취소로 되돌릴 수 있어요.', 3500);
  }
  const megabytes = (bytes) => Math.round(bytes / 1048576);
  const minutesText = (sec) => (sec % 60 ? `${Math.floor(sec / 60) ? `${Math.floor(sec / 60)}분 ` : ''}${sec % 60}초` : `${sec / 60}분`);
  async function onVideoPicked() {
    const file = videoInput.files?.[0];
    videoInput.value = '';
    if (!file || filing || cam || !card) return;
    if (file.size > limits.maxBytes) { notify(`영상 파일이 너무 커요(${megabytes(limits.maxBytes)}MB까지). 더 짧은 영상으로 해 봐요.`, 5000); return; }
    const target = card;
    filing = true;
    renderPanel();
    try {
      const info = await probeVideo(file);
      if (!info) notify('이 영상은 이 브라우저에서 틀 수 없어요. MP4나 WebM 영상으로 해 봐요.', 5000);
      else if (info.seconds < MIN_VIDEO) notify('영상이 너무 짧아요. 조금 더 긴 영상으로 해 봐요.', 4000);
      else if (info.seconds > limits.maxFileSeconds) notify(`영상이 너무 길어요(${minutesText(limits.maxFileSeconds)}까지). 더 짧은 영상으로 해 봐요.`, 5000);
      else await placeVideo({ blob: file, type: file.type, ...info }, target);
    } catch (ex) {
      console.error(ex);
      notify('영상을 넣지 못했어요. 다시 해 봐요.', 4000);
    }
    filing = false;
    if (!card) return;
    if (videoOpen()) renderPanel();
    focusVideo();
  }

  // ---------- 카메라로 찍기(영상 장면) ----------
  // 꾸미기 판 위에 카메라 화면을 덮는다: 보이는 그대로가 이 장의 바탕이 된다. 찍기 · 멈추기 · 그만두기도 그 위에 있다.
  const camBtn = (label, onClick, cls = '') => el('button', { class: `fe-btn${cls ? ` ${cls}` : ''}`, type: 'button', onClick: (e) => { e.stopPropagation(); onClick(); } }, label);
  function drawCam() {
    const c = cam;
    if (!c) return;
    const msg = (text, ...buttons) => el('div', { class: 'fe-cam-msg', role: 'status' }, el('p', { text }), buttons.length ? el('div', { class: 'fe-cam-row' }, ...buttons) : null);
    const quit = camBtn('그만두기', closeCamera);
    camBox.classList.toggle('recording', c.phase === 'recording');
    if (c.phase === 'opening') { camBox.replaceChildren(msg('카메라를 켜는 중이에요…', quit)); return; }
    if (c.phase === 'error') { camBox.replaceChildren(msg(c.error, camBtn('다시 해 보기', () => { closeCamera(); openCamera(); }, 'primary'), quit)); return; }
    if (c.phase === 'saving') { camBox.replaceChildren(c.camera.video, msg('찍은 영상을 넣는 중이에요…')); return; }
    const total = videoTime(limits.maxSeconds);
    c.clock = el('span', { class: `fe-cam-chip${c.phase === 'recording' ? ' rec' : ''}`, role: 'timer', text: c.phase === 'recording' ? `찍는 중 ${videoTime(c.secs)} / ${total}` : `한 번에 ${minutesText(limits.maxSeconds)}까지 찍을 수 있어요` });
    const main = c.phase === 'recording'
      ? camBtn([icon('stop'), '멈추기'], stopRecord, 'rec fe-cam-main')
      : camBtn([icon('record'), '찍기 시작'], startRecord, 'rec fe-cam-main');
    const flip = c.phase === 'ready' && c.canFlip ? camBtn([icon('swap'), '카메라 바꾸기'], flipCamera) : null;
    camBox.replaceChildren(c.camera.video, el('div', { class: 'fe-cam-top' }, c.clock),
      el('div', { class: 'fe-cam-bar' }, main, flip, c.phase === 'ready' ? quit : null));
    // 단추가 새로 그려졌다: 글쇠로 누르던 사람이 이어서 누를 수 있게 큰 단추에 초점을 둔다
    if (camBox.contains(document.activeElement) || document.activeElement === document.body) main.focus({ preventScroll: true });
  }
  async function openCamera() {
    if (cam || filing || !card || !createCamera) return;
    endEdit();
    stopDrag();
    stopPreview();
    select(-1);
    scene?.player.pause();
    const camera = createCamera();
    const mine = cam = { camera, phase: 'opening', error: '', secs: 0, canFlip: false, target: card, clock: null };
    stage.classList.add('fe-filming');
    stage.append(camBox);
    drawCam();
    renderPanel();
    // 카메라가 그림 칸을 덮고 있는 동안에는 옆 메뉴와 도구 막대를 쓰지 못하게 한다(가려진 카드를 모르고 고치지 않게)
    panel.inert = true;
    toolbar.inert = true;
    showStage();
    camBox.focus({ preventScroll: true });
    try {
      const got = await camera.open();
      if (cam !== mine) { camera.close(); return; }
      if (!got) { closeCamera(); return; }
      mine.phase = 'ready';
      if (!got.audio) notify('마이크를 쓸 수 없어서 소리 없이 찍어요.', 4000);
      Promise.resolve(camera.canFlip?.()).then((ok) => { if (cam === mine && ok && mine.phase === 'ready') { mine.canFlip = true; drawCam(); } }).catch(() => {});
    } catch (ex) {
      console.error(ex);
      if (cam !== mine) return;
      mine.phase = 'error';
      mine.error = ex?.name === 'NotAllowedError' || ex?.name === 'SecurityError'
        ? '카메라를 쓸 수 있게 허락해 주세요. 주소 창의 자물쇠(또는 카메라) 그림을 눌러 허용으로 바꾼 뒤 다시 눌러요.'
        : '카메라를 켜지 못했어요. 다른 앱이 카메라를 쓰고 있는지 확인해요.';
    }
    drawCam();
  }
  // 카메라를 끈다. 찍던 것 · 넣던 것이 있었는데 다 넣지 못하고 끄는 것이면(done 이 거짓) 그렇다고 알린다.
  function closeCamera({ done = false } = {}) {
    const c = cam;
    if (!c) return;
    cam = null;
    try { c.camera.close(); } catch (ex) { console.warn(ex); }
    camBox.remove();
    camBox.replaceChildren();
    camBox.classList.remove('recording');
    stage.classList.remove('fe-filming');
    panel.inert = false;
    toolbar.inert = false;
    if (!done && (c.phase === 'recording' || c.phase === 'saving')) notify('찍던 영상은 넣지 않았어요.', 4000);
    if (card) { renderPanel(); keepKeys(); }
  }
  async function flipCamera() {
    const c = cam;
    if (!c || c.phase !== 'ready') return;
    try { await c.camera.flip(); } catch (ex) { console.error(ex); notify('카메라를 바꾸지 못했어요.'); }
  }
  function startRecord() {
    const c = cam;
    if (!c || c.phase !== 'ready') return;
    c.secs = 0;
    const ok = c.camera.start({
      maxSeconds: limits.maxSeconds,
      onTick: (sec) => { c.secs = sec; if (cam === c && c.clock) c.clock.textContent = `찍는 중 ${videoTime(sec)} / ${videoTime(limits.maxSeconds)}`; },
      onDone: (made) => onRecorded(c, made),
    });
    if (!ok) { notify('찍기를 시작하지 못했어요.'); return; }
    c.phase = 'recording';
    drawCam();
  }
  function stopRecord() {
    if (cam?.phase === 'recording') cam.camera.stop();
  }
  async function onRecorded(c, made) {
    if (cam !== c) return;                  // 찍는 중에 닫았다(다른 장으로 갔거나 편집기를 치웠다): 찍은 것은 버린다
    if (!made || !(made.seconds >= MIN_VIDEO)) {
      notify('너무 짧아서 넣지 않았어요. 조금 더 길게 찍어요.', 4000);
      c.phase = 'ready';
      drawCam();
      return;
    }
    c.phase = 'saving';
    drawCam();
    await placeVideo(made, c.target);
    if (cam === c) closeCamera({ done: true });
  }
  camBox.addEventListener('keydown', (e) => {
    e.stopPropagation();                    // 찍는 동안에는 글쇠가 꾸미기 판으로 가지 않게(Delete 로 요소가 지워지지 않게)
    if (e.key === 'Escape' && cam && cam.phase !== 'recording' && cam.phase !== 'saving') { e.preventDefault(); closeCamera(); }
  });
  for (const type of ['pointerdown', 'pointerup', 'dblclick', 'contextmenu']) camBox.addEventListener(type, (e) => e.stopPropagation());

  // 고른 것 둘레의 테두리와 손잡이를 그 자리·크기에 맞춘다.
  // 연결선: 잇는 조각이 움직이면(끌기 · 크기 · 글자판) 선을 다시 계산해 그 자리에 다시 그린다. 고르기 테두리를 그리기 전에 부른다.
  function syncLinks() {
    const list = items();
    if (!list.some((it) => it.t === 'link')) return;
    const next = layoutLinks(list, settings().aspect);
    if (next.length !== list.length) return;          // 잇는 조각이 없어진 선은 목록이 바뀔 때(listChanged) 뺀다
    let moved = false;
    next.forEach((it, i) => {
      const was = list[i];
      if (it.t !== 'link' || !nodes[i] || (was.x === it.x && was.y === it.y && was.w === it.w && was.h === it.h && was.pts?.join() === it.pts.join())) return;
      moved = true;
      const node = itemView(it);
      node.classList.toggle('sel', nodes[i].classList.contains('sel'));
      nodes[i].replaceWith(node);
      nodes[i] = node;
    });
    if (moved) card.items = next;
  }
  function syncSel() {
    syncLinks();
    if(cropJob && (pop!=='crop'||cur()?.id!==cropJob.item.id||cur()?.url!==cropJob.item.url))dismissCrop();
    nodes.forEach((n, i) => n.classList.toggle('sel', i === sel || many.includes(i)));
    const it = cur();
    const node = nodes[sel];
    drawOthers();
    drawMany();
    drawGrow();
    const id = it?.id || '';
    if (onSelect && id !== lastSelId) { lastSelId = id; onSelect(id); }
    // 연결선은 크기 손잡이가 없다(잇는 조각을 옮기면 따라온다). 고른 선은 빛나는 것으로 보이고, 곡선 · 꺾인 선은 가운데 손잡이 하나를 둔다.
    const knob = it?.t === 'link' && node && !it.lock && !cropJob && !many.length ? linkHandle(it, settings().aspect) : null;
    linkKnob.hidden = !knob;
    if (knob) {
      // 선 위의 글이 있으면 손잡이를 글 바로 아래로 비켜 둔다(끌 때는 그만큼 빼서 계산한다: start 의 knobShift).
      const shift = it.label ? linkLabelSize(it) * 1.25 * settings().aspect : 0;
      linkKnob.dataset.shift = String(shift);
      linkKnob.style.left = `${knob.at[0]}%`;
      linkKnob.style.top = `${knob.at[1] + shift}%`;
      linkKnob.dataset.kind = knob.kind;
      linkKnob.title = knob.kind === 'bend' ? '끌어서 휘는 정도 · 쪽 바꾸기' : '끌어서 꺾이는 자리 옮기기';
    }
    const endsAt = it?.t === 'link' && node && !it.lock && !cropJob && !many.length && it.pts ? linkEnds(it, settings().aspect) : null;
    linkEndKnobs.forEach((k, n) => {
      k.hidden = !endsAt;
      if (endsAt) { k.style.left = `${endsAt[n][0]}%`; k.style.top = `${endsAt[n][1]}%`; }
    });
    selBox.hidden = !it || !node || !!cropJob || it.t === 'link';
    if (selBox.hidden) return;
    selBox.style.left = `${it.x}%`;
    selBox.style.top = `${it.y}%`;
    // 잠근 것은 손잡이가 없고, 글을 고치는 중에는 글상자의 테(.editing)와 어긋나 보이니, 그때는 꼭 맞게 두른다.
    const least = it.lock || editing === sel ? 0 : minBox();
    const [w, h] = [node.offsetWidth, node.offsetHeight];
    selBox.style.width = `${Math.max(w, least)}px`;
    selBox.style.height = `${Math.max(h, least)}px`;
    // 위로 넉넉하게 두른 만큼 돌리기 손잡이를 당겨서, 요소에서 늘 같은 거리에 있게 한다(카드 위쪽에 잡아 둔 자리를 넘지 않게).
    selBox.style.setProperty('--fe-pad-y', `${Math.max(0, (least - h) / 2)}px`);
    // 가로·세로가 모두 작은 도형은 모서리 손잡이만 둔다(변의 손잡이까지 두면 옆의 요소를 누르기 어렵다). 가는 선은 그대로 둔다.
    const tiny = it.t === 'shape' && w < least && h < least;
    selBox.style.transform = `translate(-50%, -50%) rotate(${it.rot}deg)`;
    selBox.classList.toggle('locked', it.lock);
    hWide.hidden = it.t === 'emoji' || tiny;
    hTall.hidden = it.t === 'emoji' || (it.t === 'text' && !Number.isFinite(it.h)) || tiny;
    const hint = it.t === 'emoji' ? '이모지 크기 바꾸기 · 모양 비율 유지 · Ctrl: 가운데 기준'
      : it.t === 'text' && !Number.isFinite(it.h) ? '글상자 너비 바꾸기 · Shift: 글자도 함께 확대 · Ctrl: 가운데 기준' : resizeHint;
    selBox.querySelectorAll('[data-h="scale"]').forEach(h => { h.title = hint; });
  }

  // 다른 사람이 고른 요소마다 그 사람의 색 테두리와 이름표를 두른다(내 테두리와 같은 자리 계산).
  function drawOthers() {
    const boxes = [];
    for (const o of others) {
      const i = items().findIndex((it) => it.id === o.id);
      const it = items()[i];
      const node = nodes[i];
      if (!it || !node || i === sel) continue;
      const box = el('div', { class: 'fe-other' }, el('span', { class: 'fe-other-name', text: o.name }));
      box.style.setProperty('--fe-other', o.color || '#e8590c');
      box.style.left = `${it.x}%`;
      box.style.top = `${it.y}%`;
      box.style.width = `${node.offsetWidth}px`;
      box.style.height = `${node.offsetHeight}px`;
      box.style.transform = `translate(-50%, -50%) rotate(${it.rot}deg)`;
      boxes.push(box);
    }
    othersBox.replaceChildren(...boxes);
  }

  // 여럿을 골랐을 때: 하나하나에 가는 테두리를, 모두를 감싸는 곳에 점선 상자를 그린다(손잡이는 없다: 끌어서 함께 옮긴다).
  function drawMany() {
    if (many.length < 2) { manyBox.replaceChildren(); groupBox.hidden = true; return; }
    const s = stage.getBoundingClientRect();
    const boxes = [];
    let [l, t, r, b] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const i of many) {
      const it = items()[i];
      const node = nodes[i];
      if (!it || !node) continue;
      const box = el('div', { class: 'fe-one' });
      box.style.left = `${it.x}%`;
      box.style.top = `${it.y}%`;
      box.style.width = `${node.offsetWidth}px`;
      box.style.height = `${node.offsetHeight}px`;
      box.style.transform = `translate(-50%, -50%) rotate(${it.rot}deg)`;
      boxes.push(box);
      const n = node.getBoundingClientRect();
      [l, t, r, b] = [Math.min(l, n.left), Math.min(t, n.top), Math.max(r, n.right), Math.max(b, n.bottom)];
    }
    manyBox.replaceChildren(...boxes);
    groupBox.hidden = !boxes.length;
    if (!boxes.length) return;
    groupBox.style.left = `${l - s.left}px`;
    groupBox.style.top = `${t - s.top}px`;
    groupBox.style.width = `${r - l}px`;
    groupBox.style.height = `${b - t}px`;
  }
  // 이어서 하나 더를 할 조각들: 잠그지 않은 조각 하나, 또는 잠근 것이 없는 그룹 하나(연결선 · 글 고치는 중 · 자르는 중 · 잇는 중은 없음)
  function growSet() {
    if (cropJob || linking || editing >= 0) return null;
    const set = many.length ? (isGroup() ? many.slice() : null) : sel >= 0 ? [sel] : null;
    if (!set || set.some((i) => !items()[i] || !nodes[i] || items()[i].lock || items()[i].t === 'link')) return null;
    return set;
  }
  function drawGrow() {
    const set = growSet();
    growBox.hidden = !set;
    if (!set) return;
    const s = stage.getBoundingClientRect();
    let [l, t, r, b] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const i of set) { const n = nodes[i].getBoundingClientRect(); [l, t, r, b] = [Math.min(l, n.left), Math.min(t, n.top), Math.max(r, n.right), Math.max(b, n.bottom)]; }
    // 작은 조각은 고른 테두리를 넉넉하게 두르므로(minBox) 그 손잡이와 겹치지 않게 그만큼 넓혀 둔다.
    if (set.length === 1) {
      const least = minBox(), [cx, cy] = [(l + r) / 2, (t + b) / 2];
      [l, r] = [Math.min(l, cx - least / 2), Math.max(r, cx + least / 2)];
      [t, b] = [Math.min(t, cy - least / 2), Math.max(b, cy + least / 2)];
    }
    Object.assign(growBox.style, { left: `${l - s.left}px`, top: `${t - s.top}px`, width: `${r - l}px`, height: `${b - t}px` });
    growBox.classList.toggle('single', set.length === 1);          // 하나만 고르면 위쪽 가운데에 돌리기 손잡이가 있어 위 단추를 더 올린다
  }
  // 고른 조각(그룹)을 dir 쪽 옆에 하나 더 놓고, 고른 것에서 새것으로 연결선을 잇는다. 새것을 고르므로 잇달아 누르면 흐름도가 이어진다.
  function grow(dir) {
    const set = growSet();
    if (!set) return;
    const [dx, dy] = GROW[dir][1], aspect = settings().aspect;
    const boxes = set.map(boxOf);
    const span = { l: Math.min(...boxes.map((q) => q.x - q.hw)), r: Math.max(...boxes.map((q) => q.x + q.hw)), t: Math.min(...boxes.map((q) => q.y - q.hh)), b: Math.max(...boxes.map((q) => q.y + q.hh)) };
    // 한 걸음: 그 쪽 크기 + 사이(카드 너비의 6%, 세로는 같은 길이가 되게 비율만큼). 자리가 차 있으면 한 걸음씩 더 가 본다(세 걸음까지).
    const step = dx ? span.r - span.l + 6 : span.b - span.t + 6 * aspect;
    const others = items().map((it, k) => (set.includes(k) || it.t === 'link' || it.lock || !nodes[k] ? null : boxOf(k))).filter((q) => q && q.hw < 45 && q.hh < 45);
    const fits = (k) => span.l + dx * step * k >= 0 && span.r + dx * step * k <= 100 && span.t + dy * step * k >= 0 && span.b + dy * step * k <= 100;
    const clear = (k) => !others.some((q) => q.x + q.hw > span.l + dx * step * k && q.x - q.hw < span.r + dx * step * k && q.y + q.hh > span.t + dy * step * k && q.y - q.hh < span.b + dy * step * k);
    const k = [1, 2, 3].find((n) => fits(n) && clear(n)) ?? (fits(1) ? 1 : 0);
    if (!k) { notify(`카드 끝이라 ${GROW[dir][0]}에는 더 놓을 자리가 없어요. 조각을 옮기거나 다른 쪽을 눌러요.`, 3500); return; }
    // 복제(한도 · 사진 장수는 duplicateItem 이 본다) → 자리를 옮긴다.
    let list = items();
    const made = [];
    for (const i of set) {
      const dup = duplicateItem(list, list.indexOf(items()[i]));
      if (!dup) { notify(fullNote(items()[i].t === 'image')); return; }
      made.push({ ...dup, id: dup.id || newId(), lock: false, x: items()[i].x + dx * step * k, y: items()[i].y + dy * step * k });
      list = [...list, dup];
    }
    if (list.length >= settings().maxItems) { notify(`카드 한 장에는 조각을 ${settings().maxItems}개까지 놓을 수 있어요.`); return; }
    const copies = regroup(made);
    // 이을 조각: 그룹이면 글이 아닌 것 가운데 가장 큰 것(흐름도의 상자), 없으면 첫째.
    const area = (it) => (Number(it.w) || 0) * (Number(it.h) || it.w || 0);
    const main = set.map((i) => i).sort((p, q) => (items()[p].t === 'text') - (items()[q].t === 'text') || area(items()[q]) - area(items()[p]))[0];
    endEdit();
    stopDrag();
    remember();
    const ided = items().map((it, n) => (n === main && !it.id ? { ...it, id: newId() } : it));
    const source = ided[main], target = copies[set.indexOf(main)];
    // 그 조각에 이미 이어진 선이 있으면 그 꾸밈(색 · 굵기 · 머리 · 선의 길 …)을 그대로 쓴다.
    const near = ided.find((it) => it.t === 'link' && it.from === source.id) || ided.find((it) => it.t === 'link' && it.to === source.id);
    const base = { t: 'link', id: newId(), from: source.id, to: target.id, head: 'end', color: '#1d2433', line: LINK_LINE.base };
    const link = cleanItem(near ? applyStyle(base, styleOf(near)) : base);
    const at = main;
    card.items = [...ided.slice(0, at), link, ...ided.slice(at), ...copies];
    const start = card.items.length - copies.length;
    const added = copies.map((_, n) => start + n);
    listChanged(added.length === 1 ? added[0] : -1, added.length > 1 ? added : []);
    notify(copies.some((it) => it.t === 'text') ? '이어서 하나 더 놓았어요. 글은 두 번 눌러 고쳐요. + 를 또 누르면 계속 이어져요.' : '이어서 하나 더 놓았어요. + 를 또 누르면 계속 이어져요.', 3500);
    focusStage();
  }
  // 그 요소가 화면에 보이는 자리와 크기(돌린 것은 돌린 채로 감싸는 상자). 카드 너비·높이를 100 으로 본 값.
  function boxOf(i) {
    const s = stage.getBoundingClientRect();
    const r = nodes[i].getBoundingClientRect();
    return {
      x: (r.left + r.width / 2 - s.left) / (s.width || 1) * 100, y: (r.top + r.height / 2 - s.top) / (s.height || 1) * 100,
      hw: r.width / 2 / (s.width || 1) * 100, hh: r.height / 2 / (s.height || 1) * 100,
    };
  }

  // 도구 막대는 늘, 옆 메뉴는 고른 것·목록에 따라 달라지는 칸(레이어·업로드·배경)일 때만 다시 그린다.
  // (텍스트·요소·템플릿 칸까지 다시 그리면 찾던 낱말과 넘겨 보던 자리가 사라진다)
  function renderUi() {
    drawGrow();                                     // 묶기 · 풀기 · 글 고치기 끝 같은 바뀜에도 + 단추를 맞춘다
    renderBar();
    if (tab === 'layer' || tab === 'upload' || tab === 'bg') renderPanel();
    // 움직임 칸은 고른 요소의 것이 맨 위에 나온다: 다른 요소를 고르면 맨 위부터 보여 준다
    if (tab === 'motion') { renderPanel({ top: motionSel !== sel }); motionSel = sel; }
  }

  function select(i) {
    if (i === sel && !many.length) return;
    // 다른 사람이 고르고 있는 요소는 고르지 않는다(함께 꾸밀 때). 알리고, 빈 곳을 누른 것처럼 고르기를 푼다.
    const who = i >= 0 && lockedBy ? lockedBy(items()[i]) : '';
    if (who) {
      notify(`${who} 친구가 고르고 있어요. 친구가 다 고치면 고를 수 있어요.`, 3000);
      if (sel >= 0) select(-1);
      return;
    }
    endEdit();
    stopDrag();
    if (i >= 0) stopPreview();           // 미리 보느라 숨겨 둔 요소를 고르는 일이 없게
    textRange = null;                    // 다른 조각을 고르면 고른 글자 구간은 잊는다
    sel = i;
    many = [];
    pop = null;
    cut = null;
    syncSel();
    renderUi();
  }

  // 여럿을 고른다(Shift 누르기 · 빈 곳을 끌어 고르기 · Ctrl+A). 둘보다 적으면 하나 고르기와 같다. 잠근 것은 빠진다.
  function selectMany(list) {
    const pick = withGroups(list).filter(free).sort((a, b) => a - b);
    if (pick.length < 2) { select(pick.length ? pick[0] : -1); return; }
    if (pick.length === many.length && pick.every((i, k) => many[k] === i)) return;
    endEdit();
    stopDrag();
    stopPreview();
    setMany(pick);
    renderUi();
  }
  // 고른 것만 바꾼다(끌어서 고르는 동안에는 끌기를 멈추지 않고, 도구 막대도 다 고른 뒤에 한 번만 그린다).
  function setMany(pick) {
    if (pick.length >= 2) { sel = -1; many = pick; } else { many = []; sel = pick.length ? pick[0] : -1; }
    pop = null;
    cut = null;
    syncSel();
  }
  // 고른 것 가운데 하나를 넣거나 뺀다(Shift 를 누른 채 누르기).
  function toggleChosen(i) {
    if (!free(i)) { notify(items()[i]?.lock ? '잠근 조각은 함께 고를 수 없어요. 먼저 잠금을 풀어요.' : '친구가 고르고 있는 조각이에요.', 3000); return; }
    const list = chosen().filter(free);
    const group = groupOf(i);
    selectMany(list.includes(i) ? list.filter((k) => !group.includes(k)) : [...list, ...group]);
  }

  // 고른 것을 새 값으로 바꾼다(자리·크기·투명도만 바뀔 때는 요소를 그대로 두고 옮긴다).
  function put(next, { rebuild = false } = {}) {
    if (!next || sel < 0 || !nodes[sel]) return;
    const list = items().slice();
    list[sel] = next;
    card.items = list;
    if (rebuild) {
      const node = itemView(next);
      nodes[sel].replaceWith(node);
      nodes[sel] = node;
    } else placeItem(nodes[sel], next);
    syncSel();
  }

  // 여럿을 한꺼번에 새 값으로 바꾼다(next: 번호 → 새 요소). 자리만 바뀌므로 요소를 그대로 두고 옮긴다.
  function putMany(next) {
    const list = items().slice();
    for (const [i, it] of next) { list[i] = it; if (nodes[i]) placeItem(nodes[i], it); }
    card.items = list;
    syncSel();
  }
  // 여럿을 함께 옮긴다(가운데가 카드 밖으로 나가지 않게 거리를 줄인다).
  function shiftMany(from, idx, dx, dy) {
    const [mx, my] = clampShift(from, dx, dy);
    putMany(new Map(idx.map((i, k) => [i, moveItem(from[k], from[k].x + mx, from[k].y + my, { snap: false }).item])));
  }

  // 한 번에 끝나는 바꾸기(색·글꼴·모양 등): 기록 → 바꾸기 → 알리기.
  function change(patch, { keepPop = true } = {}) {
    if (!cur()) return;
    if (rangeChange(patch)) return;
    endEdit();
    stopDrag();
    let merged = { ...cur(), ...patch };
    // 글상자 전체의 굵게 · 기울임 · 밑줄 · 색을 바꾸면 그 서식의 부분 서식은 지운다(전체가 정말 그렇게 되게).
    if (merged.t === 'text' && merged.runs?.length) for (const [key, k] of RUN_KEYS) if (key in patch) merged = { ...merged, runs: dropRunKey(merged, k) };
    const next = cleanItem(merged, { keepSpaces: true });
    if (!next) return;
    remember();
    put(next, { rebuild: true });
    if (!keepPop) pop = null;
    renderUi();
    onChange();
    keepKeys();
  }
  // 고른 글자 구간에만 서식을 입힌다(굵게 · 기울임 · 밑줄은 구간이 모두 그러면 풀고 아니면 입힌다, 색은 그 색으로).
  // 입힌 뒤에는 글 고치기로 돌아가 같은 구간을 다시 골라 둔다(이어서 색도 바꿀 수 있게). 구간이 없으면 false.
  function rangeChange(patch) {
    const it = cur(), keys = Object.keys(patch), pair = RUN_KEYS.find(([key]) => key === keys[0]);
    const r = textRange;
    if (!it || it.t !== 'text' || keys.length !== 1 || !pair || !r || r.i !== sel || r.text !== it.text || !(r.e > r.s)) return false;
    const [, k] = pair, value = k === 'c' ? patch.color : !runsAll(it, r.s, r.e, k);
    endEdit();
    stopDrag();
    const next = cleanItem({ ...it, runs: styleRuns(it, r.s, r.e, { [k]: value }) }, { keepSpaces: true });
    if (!next) return true;
    remember();
    put(next, { rebuild: true });
    renderUi();
    onChange();
    startEdit();
    pickText(nodes[sel], r.s, r.e);
    textRange = { ...r, text: next.text };
    return true;
  }
  // 글상자 안의 s ~ e 글자를 고른다(글자 자리는 글의 위치, 서식 조각 <span> 을 건너 센다).
  function pickText(node, s, e) {
    if (!node) return;
    const spot = (at) => {
      const walk = document.createTreeWalker(node, 4);
      for (let t = walk.nextNode(); t; t = walk.nextNode()) { if (at <= t.data.length) return [t, at]; at -= t.data.length; }
      return [node, node.childNodes.length];
    };
    const range = document.createRange();
    range.setStart(...spot(s));
    range.setEnd(...spot(e));
    const pick = window.getSelection();
    pick.removeAllRanges();
    pick.addRange(range);
  }
  // 지금 고른 글자 구간을 기억한다(글을 고치는 중에 그 글상자 안을 고른 것만).
  // 고른 것이 바뀐 알림(selectionchange)은 늦게 올 수 있어서, 단추 · 글쇠를 누르는 그때에도 지금 고른 것을 읽는다.
  function readRange() {
    if (editing < 0) return;
    const node = nodes[editing], pick = window.getSelection();
    if (!node || !pick?.rangeCount) return;
    const range = pick.getRangeAt(0);
    if (!node.contains(range.startContainer) || !node.contains(range.endContainer)) return;
    if (range.collapsed) { textRange = null; return; }
    const before = document.createRange();
    before.setStart(node, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const s = before.toString().length, e = s + range.toString().length;
    textRange = { i: editing, s, e, text: items()[editing]?.text };
  }
  document.addEventListener('selectionchange', readRange);
  bar.addEventListener('pointerdown', readRange, true);
  // 도구 막대를 다시 그리면 방금 누른 단추가 사라져서 글자판이 갈 곳을 잃는다. 그때는 꾸미기 판으로 돌려 화살표·Delete 가 계속 듣게 한다.
  function keepKeys() {
    const at = document.activeElement;
    if (!at || at === document.body || !at.isConnected) focusStage();
  }

  // 목록이 통째로 바뀌는 일(넣기·삭제·순서·복제·템플릿)을 한 뒤에 부른다.
  function listChanged(nextSel, nextMany = []) {
    stopLinking();
    if (card.id) card.items = card.items.map(it => it.id ? it : { ...it, id: newId() });
    // 잇던 조각을 지웠으면 그 연결선도 뺀다(고른 번호도 그만큼 당긴다). 남은 선은 다시 계산한다.
    if (card.items.some((it) => it.t === 'link')) {
      const ids = new Set(card.items.filter((it) => it.t !== 'link' && it.id).map((it) => it.id));
      const alive = card.items.map((it) => it.t !== 'link' || (ids.has(it.from) && ids.has(it.to) && it.from !== it.to));
      const at = []; let n = 0;
      alive.forEach((ok, i) => { at[i] = ok ? n++ : -1; });
      if (n !== card.items.length) {
        nextSel = nextSel >= 0 ? at[nextSel] ?? -1 : nextSel;
        nextMany = nextMany.map((i) => at[i]).filter((i) => i >= 0);
      }
      card.items = layoutLinks(card.items.filter((_, i) => alive[i]), settings().aspect);
    }
    sel = nextMany.length >= 2 ? -1 : nextSel;
    many = nextMany.length >= 2 ? nextMany : [];
    pop = null;
    cut = null;
    renderStage();
    renderUi();
    onChange();
  }

  function add(item, { edit = true, focus = true } = {}) {
    if (!item) return;
    if (items().length >= settings().maxItems) { notify(`카드 한 장에는 조각을 ${settings().maxItems}개까지 놓을 수 있어요.`); return; }
    endEdit();
    // 같은 자리에 겹쳐 놓이지 않게 조금씩 비켜 놓는다.
    let n = 0;
    while (n < 8 && items().some((k) => Math.abs(k.x - (item.x + n * 3)) < 1 && Math.abs(k.y - (item.y + n * 5)) < 1)) n++;
    const placed = { ...item, x: item.x + n * 3, y: item.y + n * 5 };
    stopDrag();
    remember();
    card.items = [...items(), placed];
    listChanged(card.items.length - 1);
    // 텍스트는 바로 글을 쓸 수 있게(글 전체가 골라진 채로), 나머지는 화살표 키로 옮길 수 있게.
    if (placed.t === 'text' && edit) startEdit(true); else if (focus) focusStage();
  }

  function remove() {
    const gone = chosen().filter((i) => !items()[i].lock);
    if (!gone.length) return;
    endEdit();
    stopDrag();
    remember();
    card.items = items().filter((_, i) => !gone.includes(i));
    listChanged(-1);
    focusStage();
  }

  function order(to, { keepOpen = true } = {}) {
    const [list, at] = reorder(items(), sel, to);
    if (list === items()) return;
    endEdit();
    stopDrag();
    remember();
    card.items = list;
    listChanged(at);
    if (keepOpen) {
      pop = 'pos';            // 도구 막대에서 눌렀으면 위치 칸은 열어 둔다(여러 번 누를 수 있게)
      renderBar();
    }
    focusStage();
  }

  function copy() {
    if (many.length) { copyMany(); return; }
    if (cur()?.t === 'link') { notify('연결선은 조각 두 개를 골라 새로 이어요(같은 자리에 겹치지 않게 복제하지 않아요).', 3500); return; }
    const dup = duplicateItem(items(), sel);
    if (!dup) { notify(cur()?.t === 'image' ? `사진은 카드 한 장에 ${settings().maxPhotos}장까지예요.` : `카드 한 장에는 조각을 ${settings().maxItems}개까지 놓을 수 있어요.`); return; }
    endEdit();
    stopDrag();
    remember();
    card.items = [...items(), regroup([{ ...dup, lock: false }])[0]];      // 하나만 복제한 것은 그룹에 들지 않는다
    listChanged(card.items.length - 1);
    focusStage();
  }

  // 여럿을 한꺼번에 넣는다(복제 · 붙여넣기). 넣은 것들을 함께 고른다. 다 넣지 못했으면 알린다.
  function addMany(made, short) {
    if (!made.length) { notify(short); return; }
    endEdit();
    stopDrag();
    remember();
    const start = items().length;
    card.items = [...items(), ...made];
    const added = made.map((_, k) => start + k);
    listChanged(added.length === 1 ? added[0] : -1, added.length > 1 ? added : []);
    if (short && made.length) notify(short);
    focusStage();
  }
  const fullNote = (image) => (image ? `사진은 카드 한 장에 ${settings().maxPhotos}장까지예요.` : `카드 한 장에는 조각을 ${settings().maxItems}개까지 놓을 수 있어요.`);
  // 고른 것들을 하나씩 복제한다(겹치는 순서는 그대로, 새것은 맨 앞에).
  function copyMany() {
    let list = items();
    const made = [];
    let failed = null;
    for (const i of many) {
      const dup = duplicateItem(list, list.indexOf(items()[i]));
      if (!dup) { failed = items()[i]; continue; }
      made.push({ ...dup, lock: false, from0: items()[i].id });
      list = [...list, dup];
    }
    addMany(relinkCopies(regroup(made)), failed ? fullNote(failed.t === 'image') : '');
  }
  // 함께 복제·붙여넣기한 연결선은 새로 생긴 두 조각을 잇는다(from0: 그 조각의 원래 이름표. 넣기 전에 뺀다).
  // 새 조각에 이름표가 없으면 붙여 준다(연결선은 이름표로 잇는다).
  function relinkCopies(made) {
    const ided = made.map(({ from0, ...it }) => ({ it: it.id ? it : { ...it, id: newId() }, from0 }));
    const map = new Map(ided.filter((v) => v.from0 && v.it.t !== 'link').map((v) => [v.from0, v.it.id]));
    return relink(ided.map((v) => v.it), map);
  }
  // 고른 두 조각을 연결선으로 잇는다(고른 차례가 아니라 위·왼쪽에 있는 것에서 다른 것으로). 선은 두 조각보다 뒤에 깔린다.
  function linkMany() {
    const pick = many.filter((i) => items()[i].t !== 'link');
    if (pick.length !== 2) { notify('연결선은 조각 두 개를 골라야 이을 수 있어요(Shift 를 누른 채 누르기).', 3500); return; }
    // 여럿 골라 이을 때는 위(같으면 왼쪽)에 있는 조각에서 시작한다.
    const [a, b] = pick.slice().sort((p, q) => items()[p].y - items()[q].y || items()[p].x - items()[q].x);
    linkPair(a, b);
  }
  // 조각 i 에서 조각 j 로(화살표가 j 를 가리키게) 연결선을 놓고, 놓은 선을 고른다.
  function linkPair(i, j) {
    if (items().length >= settings().maxItems) { notify(`카드 한 장에는 조각을 ${settings().maxItems}개까지 놓을 수 있어요.`); return; }
    endEdit();
    stopDrag();
    remember();
    const list = items().map((it, k) => ((k === i || k === j) && !it.id ? { ...it, id: newId() } : it));
    const a = list[i], b = list[j];
    if (list.some((it) => it.t === 'link' && ((it.from === a.id && it.to === b.id) || (it.from === b.id && it.to === a.id)))) { notify('이미 이어져 있어요.', 2500); past.pop(); return; }
    const link = cleanItem({ t: 'link', id: newId(), from: a.id, to: b.id, head: 'end', color: '#1d2433', line: LINK_LINE.base });
    const at = Math.min(i, j);
    card.items = [...list.slice(0, at), link, ...list.slice(at)];
    listChanged(at);
    notify('연결선으로 이었어요. 조각을 옮기면 선이 따라와요. 선을 누르면 위 막대의 "화살표"에서 곧게·둥글게·꺾어서를 바꾸고, 선 끝의 파란 점을 끌어 다른 조각 · 다른 자리에 이어요.', 5500);
    focusStage();
  }
  // 빈 곳에 새 조각을 만들며 잇기: like 번째 조각을 하나 더(그룹에서는 빼고) point(카드 너비 · 높이 = 100) 가운데에 놓는다. 카드 밖으로 나가지 않게 맞춘다.
  // 놓을 수 없으면(한도 · 사진 장수) 알리고 null. 돌려주는 것: { list: 이름표를 붙인 지금 목록, piece: 새 조각 }.
  function pieceAt(like, point) {
    const list = items().map((it, k) => (k === like && !it.id ? { ...it, id: newId() } : it));
    if (list.length + 1 >= settings().maxItems) { notify(`카드 한 장에는 조각을 ${settings().maxItems}개까지 놓을 수 있어요.`); return null; }
    const dup = duplicateItem(list, like);
    if (!dup) { notify(fullNote(list[like].t === 'image')); return null; }
    const b = nodes[like] ? boxOf(like) : { hw: 0, hh: 0 };
    const fit = (v, half) => Math.min(100 - Math.min(half, 50), Math.max(Math.min(half, 50), v));
    const piece = { ...regroup([{ ...dup, lock: false }])[0], id: newId(), x: fit(point[0], b.hw), y: fit(point[1], b.hh) };
    return { list, piece };
  }
  // 잇는 중 ② 에서 빈 곳을 눌렀다: 시작 조각을 그 자리에 하나 더 놓고 화살표로 잇는다.
  function linkToNew(from, point) {
    const made = pieceAt(from, point);
    if (!made) return;
    endEdit();
    stopDrag();
    remember();
    const { list, piece } = made, source = list[from];
    const near = list.find((it) => it.t === 'link' && it.from === source.id) || list.find((it) => it.t === 'link' && it.to === source.id);
    const base = { t: 'link', id: newId(), from: source.id, to: piece.id, head: 'end', color: '#1d2433', line: LINK_LINE.base };
    const link = cleanItem(near ? applyStyle(base, styleOf(near)) : base);
    card.items = [...list.slice(0, from), link, ...list.slice(from), piece];
    listChanged(card.items.length - 1);
    notify(piece.t === 'text' ? '새 조각을 놓고 이었어요. 글은 두 번 눌러 고쳐요.' : '새 조각을 놓고 이었어요.', 3000);
    focusStage();
  }
  // 잇기: 화살표가 시작할 조각과 닿을 조각을 차례로 누른다. from: 이미 고른 조각에서 시작하면 그 번호.
  let linking = null;                                // { from: 시작 조각의 번호 | null } · 잇는 중이 아니면 null
  function startLinking(from = -1) {
    if (items().filter((it) => it.t !== 'link').length < 2) { notify('먼저 이을 조각(도형·글·사진)을 두 개 넣어 주세요. 그다음 차례로 누르면 화살표로 이어져요.', 4500); return; }
    endEdit();
    stopDrag();
    if (pop) toggle(pop);
    linking = { from: from >= 0 && items()[from] && items()[from].t !== 'link' ? from : null };
    if (linking.from == null) select(-1);
    paintLinking();
    focusStage();
  }
  function stopLinking(said = false) {
    if (!linking) return;
    linking = null;
    paintLinking();
    if (said) notify('잇기를 그만뒀어요.', 2000);
  }
  function paintLinking() {
    stage.classList.toggle('fe-linking', !!linking);
    linkHint.hidden = !linking;
    if (!linking) return;
    linkHint.replaceChildren(
      el('b', { text: linking.from == null ? '① 화살표가 시작할 조각을 누르세요' : '② 화살표가 닿을 조각을 누르세요 · 빈 곳을 누르면 새 조각을 놓고 이어요' }),
      el('button', { class: 'fe-link-hint-x', type: 'button', onClick: () => { stopLinking(true); focusStage(); } }, '그만두기 (Esc)'));
  }
  // 고른 것들을 한 그룹으로 묶는다 · 그룹을 푼다.
  function groupMany() {
    if (many.length < 2 || isGroup()) return;
    endEdit();
    stopDrag();
    remember();
    const g = newGroupId();
    const list = items().slice();
    for (const i of many) list[i] = { ...list[i], g };
    card.items = list;
    renderUi();
    onChange();
    notify('그룹으로 묶었어요. 한 번 누르면 함께 골라지고, 한 번 더 누르면 하나만 골라져요.', 3500);
    focusStage();
  }
  function ungroupMany() {
    if (!isGroup()) return;
    endEdit();
    stopDrag();
    remember();
    const list = items().slice();
    for (const i of many) { const { g, ...rest } = list[i]; list[i] = rest; }
    card.items = list;
    renderUi();
    onChange();
    focusStage();
  }

  // ---------- 복사 · 잘라내기 · 붙여넣기 ----------
  function clipCopy() {
    const list = chosen();
    if (!list.length) return false;
    clipboard = JSON.parse(JSON.stringify(list.map((i) => items()[i])));
    return true;
  }
  function clipCut() {
    if (!chosen().some((i) => !items()[i].lock)) return;
    clipCopy();
    remove();
  }
  // at({ x, y })을 주면 그 자리에(오른쪽 누르기 메뉴로 빈 곳에 붙일 때. 여럿이면 그 가운데가 거기에), 아니면 원래 자리에서 조금 옆에.
  function clipPaste(at = null) {
    if (!clipboard?.length) { notify('먼저 조각을 복사해요 (오른쪽 누르기 → 복사).'); return; }
    if (!clipboard.every(item => canPaste(item))) {
      notify('이 그림에 없는 원본 자료가 연결되어 있어요. 원래 그림을 복사해서 사용해 주세요.', 5000);
      return;
    }
    const cx = clipboard.reduce((n, k) => n + k.x, 0) / clipboard.length;
    const cy = clipboard.reduce((n, k) => n + k.y, 0) / clipboard.length;
    let list = items();
    const made = [];
    let failed = null;
    for (const k of clipboard) {
      const it = pasteItem(list, k, at ? { x: at.x + k.x - cx, y: at.y + k.y - cy } : null);
      if (!it) { failed = k; continue; }
      made.push({ ...it, from0: k.id });
      list = [...list, it];
    }
    const fresh = relinkCopies(regroup(made));   // 붙여 넣은 것은 원래 그룹과 따로 묶인다 · 함께 붙인 연결선은 새 조각끼리 잇는다
    if (fresh.length === 1 && !failed) { add(fresh[0], { edit: false }); return; }
    addMany(fresh, failed ? fullNote(failed.t === 'image') : '');
  }
  // 고른 것들을 함께 맨 앞(top) · 맨 뒤(bottom)로 보낸다. 고른 것끼리의 순서는 그대로다.
  function orderMany(to) {
    const picked = many.map((i) => items()[i]);
    const rest = items().filter((_, i) => !many.includes(i));
    const list = to === 'top' ? [...rest, ...picked] : [...picked, ...rest];
    if (list.every((it, i) => it === items()[i])) return;
    const keep = pop === 'malign';          // 도구 막대에서 눌렀으면 정렬 칸은 열어 둔다
    endEdit();
    stopDrag();
    remember();
    card.items = list;
    listChanged(-1, picked.map((it) => list.indexOf(it)));
    if (keep) { pop = 'malign'; renderBar(); }
    focusStage();
  }
  // 고른 것들을 서로에게 맞춰 정렬하거나(alignBoxes) 사이를 고르게 펼친다(distributeBoxes).
  function arrangeMany(kind, where) {
    if (many.length < 2) return;
    const boxes = many.map(boxOf);
    const to = kind === 'align' ? alignBoxes(boxes, where) : distributeBoxes(boxes, where);
    const next = new Map();
    many.forEach((i, k) => {
      const it = items()[i];
      const moved = moveItem(it, it.x + to[k].x - boxes[k].x, it.y + to[k].y - boxes[k].y, { snap: false }).item;
      if (moved.x !== it.x || moved.y !== it.y) next.set(i, moved);
    });
    if (!next.size) return;
    endEdit();
    stopDrag();
    remember();
    putMany(next);
    onChange();
    focusStage();
  }
  // 고른 것들을 모두 잠근다(잠근 것은 여럿 고르기에 들지 않으므로 고르기를 푼다).
  function lockMany() {
    const count = many.length;
    if (!count) return;
    endEdit();
    stopDrag();
    remember();
    const list = items().slice();
    for (const i of many) list[i] = { ...list[i], lock: true };
    card.items = list;
    listChanged(-1);
    notify(`${count}개를 잠갔어요. 풀려면 하나씩 누르고 "잠금 해제"를 눌러요.`, 3500);
    focusStage();
  }

  // ---------- 오른쪽 누르기 메뉴(터치는 길게 누르기) ----------
  // 요소 위에서 열면 그 요소에 할 일이, 빈 곳에서 열면 붙여넣기와 실행 취소가 나온다.
  function closeMenu() {
    if (!menu) return;
    menu.node.remove();
    for (const off of menu.offs) off();
    menu = null;
  }
  function openMenu(x, y, { touch = false, keep = false } = {}) {
    if (!card) return;
    closeMenu();
    endEdit();
    stopDrag();
    // 누른 곳에서 맨 위에 보이는 요소를 고른다(빈 곳이면 고르기를 푼다). keep: 글자판으로 열 때는 고른 것을 그대로 둔다.
    if (!keep) {
      const at = itemAt(x, y, touch);
      if (!(many.length && many.includes(at))) select(at);       // 여럿 고른 것 위에서 열면 그 묶음에 할 일이 나온다
    }
    const it = cur();
    const rect = stage.getBoundingClientRect();
    // 붙여넣을 자리: 카드 안을 눌렀으면 그 자리, 카드 밖이면 정해 둔 자리(null).
    const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    const at = inside ? { x: (x - rect.left) / rect.width * 100, y: (y - rect.top) / rect.height * 100 } : null;
    // 한 줄: 아이콘 · 이름 · 단축키. 못 쓰는 일은 흐리게 두고(자리가 바뀌지 않게), 지우기처럼 되돌려야 하는 일은 맨 아래에 따로 둔다.
    const row = (pic, label, hint, run, { disabled = false, danger = false } = {}) => ({ icon: pic, label, hint, run, disabled, danger });
    const last = items().length - 1;
    // 스타일 복사 · 붙여넣기(캔바의 스타일 복사, 파워포인트의 서식 복사): 꾸밈 값만 옮긴다.
    const styleRows = (one) => [
      ...(one ? [row('copy', '스타일 복사', '', () => { styleClip = styleOf(one); notify('스타일을 담았어요. 다른 요소를 우클릭해 "스타일 붙여넣기"를 눌러요.'); })] : []),
      row('fill', '스타일 붙여넣기', '', pasteStyle, { disabled: !styleClip }),
    ];
    // 묶음: 글 고치기 → 복사·붙여넣기 → 겹치는 순서 → 뒤집기 → 잠금 → 삭제. 묶음 사이에 구분선을 둔다(빈 묶음은 건너뛴다).
    let groups;
    if (many.length) {
      groups = [
        [
          row('copy', '복사', 'Ctrl+C', () => { clipCopy(); focusStage(); }),
          row('cut', '잘라내기', 'Ctrl+X', clipCut),
          row('paste', '붙여넣기', 'Ctrl+V', () => clipPaste(), { disabled: !clipboard }),
          row('duplicate', '복제', 'Ctrl+D', copyMany),
        ],
        styleRows(null),
        [
          row('toFront', '맨 앞으로', '', () => orderMany('top')),
          row('toBack', '맨 뒤로', '', () => orderMany('bottom')),
        ],
        [
          row('pageL', '왼쪽 맞춤', '', () => arrangeMany('align', 'left')),
          row('pageC', '가운데 맞춤', '', () => arrangeMany('align', 'center')),
          row('pageT', '위쪽 맞춤', '', () => arrangeMany('align', 'top')),
          row('pageM', '중간 맞춤', '', () => arrangeMany('align', 'middle')),
        ],
        [isGroup() ? row('ungroup', '그룹 해제', 'Ctrl+Shift+G', ungroupMany) : row('group', '그룹으로 묶기', 'Ctrl+G', groupMany), row('lock', '모두 잠금', '', lockMany),
          ...(many.length === 2 && many.every((i) => items()[i].t !== 'link') ? [row('right', '연결선으로 잇기', '', linkMany)] : [])],
        [row('trash', `${many.length}개 삭제`, 'Delete', remove, { danger: true })],
      ];
    } else if (!it) {
      groups = [
        [row('paste', '붙여넣기', 'Ctrl+V', () => clipPaste(at), { disabled: !clipboard })],
        [row('undo', '실행 취소', 'Ctrl+Z', undo, { disabled: !past.length }), row('redo', '다시 실행', 'Ctrl+Y / Ctrl+Shift+Z', redo, { disabled: !future.length })],
        // 장(슬라이드)에 하는 일: 새 장 · 복제 · 바탕 · 발표 … 프로젝트가 정한다(slideMenu).
        ...hostRows(slideMenu),
      ];
    } else if (it.lock) {
      groups = [[row('unlock', '잠금 해제', '', () => change({ lock: false })), row('copy', '복사', 'Ctrl+C', () => { clipCopy(); focusStage(); })]];
    } else {
      groups = [
        it.t === 'text' ? [row('pencil', '글 고치기', 'Enter', () => startEdit(true))] : [],
        [
          row('copy', '복사', 'Ctrl+C', () => { clipCopy(); focusStage(); }),
          row('cut', '잘라내기', 'Ctrl+X', clipCut),
          row('paste', '붙여넣기', 'Ctrl+V', () => clipPaste(), { disabled: !clipboard }),
          row('duplicate', '복제', 'Ctrl+D', copy),
        ],
        styleRows(it),
        // 사진: 그 자리에서 자르기 · 같은 자리와 크기로 다른 사진으로 바꾸기 · 바탕으로 깔기
        it.t === 'image' ? [
          row('crop', '자르기', '', openCrop),
          row('swap', '사진 바꾸기', '', replacePhoto, { disabled: busy }),
          row('cover', '바탕으로 깔기', '', toBackground),
          row('pencil', it.alt ? '그림 설명 고치기' : '그림 설명 적기', '', () => { if (pop !== 'alt') toggle('alt'); }),
        ] : [],
        [row('align', '페이지 가운데로', '', centerOnPage)],
        [
          row('toFront', '맨 앞으로', '', () => order('top', { keepOpen: false }), { disabled: sel === last }),
          row('forward', '앞으로', '', () => order('up', { keepOpen: false }), { disabled: sel === last }),
          row('backward', '뒤로', '', () => order('down', { keepOpen: false }), { disabled: sel === 0 }),
          row('toBack', '맨 뒤로', '', () => order('bottom', { keepOpen: false }), { disabled: sel === 0 }),
        ],
        // 글상자는 뒤집지 않는다(도구 막대와 같은 기준)
        it.t === 'text' || it.t === 'yt' ? [] : [
          row('flipH', '좌우 뒤집기', '', () => change({ fx: !cur().fx }, { keepPop: false })),
          row('flipV', '상하 뒤집기', '', () => change({ fy: !cur().fy }, { keepPop: false })),
        ],
        [row('lock', '잠금', '', () => change({ lock: true }, { keepPop: false }))],
        [row('trash', '삭제', 'Delete', remove, { danger: true })],
      ];
    }
    showMenu(x, y, groups, { touch, label: many.length ? `고른 ${many.length}개 메뉴` : it ? `${itemLabel(it)} 메뉴` : '카드 메뉴' });
  }
  // 프로젝트가 주는 메뉴 줄: [[{ icon, label, hint?, run, disabled?, danger? }, …], …]. 잘못된 것은 건너뛴다.
  function hostRows(source) {
    let groups = [];
    try { groups = typeof source === 'function' ? source() : source; } catch (ex) { console.error(ex); return []; }
    return (Array.isArray(groups) ? groups : []).map((g) => (Array.isArray(g) ? g : []).filter((r) => r && typeof r.label === 'string' && typeof r.run === 'function'));
  }
  /** 메뉴를 (x, y) 에 띄운다. groups: 줄 묶음(묶음 사이에 구분선). 줄: { icon, label, hint, run, disabled, danger } */
  function showMenu(x, y, groups, { touch = false, label = '메뉴' } = {}) {
    closeMenu();
    const openedAt = performance.now();
    const button = (r) => el('button', {
      class: `fe-mi${r.danger ? ' danger' : ''}`, type: 'button', role: 'menuitem', disabled: !!r.disabled,
      onClick: () => {
        // 길게 눌러 연 직후 손가락을 떼면서 눌리는 것은 모른 척한다(메뉴가 손가락 바로 밑에 뜨므로).
        if (touch && performance.now() - openedAt < 350) return;
        closeMenu();
        try { r.run(); } catch (ex) { console.error(ex); notify('그 일을 하지 못했어요. 다시 해 봐요.'); }
      },
    }, icon(r.icon || 'check'), el('span', { class: 'fe-mi-name', text: r.label }), r.hint ? el('kbd', { text: r.hint }) : null);
    const sep = () => el('div', { class: 'fe-msep', role: 'separator' });
    const rows = groups.filter((g) => g.length).flatMap((g, i) => (i ? [sep(), ...g.map(button)] : g.map(button)));
    if (!rows.length) return;
    const node = el('div', { class: `fe-menu${touch ? ' touch' : ''}`, role: 'menu', 'aria-label': label }, ...rows);
    document.body.append(node);
    // 화면 밖으로 나가지 않게 자리를 맞춘다.
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    node.style.left = `${Math.max(8, Math.min(x + 2, window.innerWidth - w - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(y + 2, window.innerHeight - h - 8))}px`;
    const buttons = () => [...node.querySelectorAll('.fe-mi:not(:disabled)')];
    node.addEventListener('keydown', (e) => {
      const list = buttons();
      const i = list.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); focusStage(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
      else if (e.key === 'Tab') { e.preventDefault(); closeMenu(); focusStage(); }
    });
    node.addEventListener('contextmenu', (e) => e.preventDefault());
    // 메뉴 밖을 누르거나, 화면을 넘기거나, 창 크기가 바뀌면 닫는다.
    // (넘김은 화면이 실제로 움직였을 때만 본다. 열기 직전에 생긴 넘김 알림이 늦게 와서 바로 닫히는 일이 없게)
    const outside = (e) => { if (!node.contains(e.target)) closeMenu(); };
    const away = () => closeMenu();
    const [sx, sy] = [window.scrollX, window.scrollY];
    const scrolled = () => { if (window.scrollX !== sx || window.scrollY !== sy) closeMenu(); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', away);
    window.addEventListener('blur', away);
    menu = {
      node,
      offs: [
        () => document.removeEventListener('pointerdown', outside, true),
        () => window.removeEventListener('scroll', scrolled, true),
        () => window.removeEventListener('resize', away),
        () => window.removeEventListener('blur', away),
      ],
    };
    if (!touch) buttons()[0]?.focus({ preventScroll: true });
  }
  stage.addEventListener('contextmenu', (e) => {
    if (!card) return;
    // 글을 고치는 중에는 브라우저의 메뉴(붙여넣기·맞춤법 등)를 그대로 쓴다.
    if (editing >= 0 && nodes[editing]?.contains(e.target)) return;
    e.preventDefault();
    if (menu) return;                 // 길게 눌러 이미 열었다
    openMenu(e.clientX, e.clientY);
  });
  function stopPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press = null;
  }

  function applyLayout(id) {
    const layout = layoutList().find((l) => l.id === id);
    if (!layout) return;
    endEdit();
    stopDrag();
    // 올려 둔 사진은 템플릿을 바꿔도 남긴다(맨 아래에 깔린 채로). 그 밖에 꾸민 것이 있으면 한 번 더 눌러야 바꾼다.
    const photos = items().filter((it) => it.t === 'image');
    const had = items().length > photos.length;
    if (had && armed !== id) {
      armed = id;
      showArmed();
      return;
    }
    armed = null;
    remember();
    const first = layoutGroups()[0]?.name;
    card.items = [...photos, ...layoutItems(id)].slice(0, settings().maxItems);
    if (layout.bg) card.bg = layout.bg;
    listChanged(-1);
    // 배경이 바뀌어 묶음의 차례가 달라졌으면(그 테마가 맨 위로 온다) 칸을 맨 위부터 다시 그린다. 아니면 표시만 지운다.
    const reordered = layoutGroups()[0]?.name !== first;
    if (reordered) renderPanel({ top: true });
    else showArmed();
    notify(had ? '틀로 바꿨어요. 실행 취소로 되돌릴 수 있어요.' : '글을 두 번 눌러 내 글로 바꿔요.', 3500);
    focusStage();
    // 템플릿 칸이 페이지와 함께 길게 스크롤되는 화면에서: 카드가 화면 밖에 있으면 바뀐 카드가 보이는 곳으로 간다.
    // 카드는 보이는데 묶음의 차례가 바뀌었고 칸의 머리가 위로 지나가 있으면, 칸의 머리(지금 테마의 묶음)로 간다.
    // 위에 붙어 있는 띠가 있는 화면은 --fe-scroll-top 으로 그 높이를 알려 준다(editor.css).
    stage.scrollIntoView?.({ block: 'nearest' });
    if (reordered && panel.getBoundingClientRect().top < (parseFloat(getComputedStyle(panel).scrollMarginTop) || 0)) panel.scrollIntoView?.({ block: 'start' });
  }
  // "한 번 더 눌러요" 표시를 제자리에서 바꾼다. 템플릿 칸을 통째로 다시 그리면 작은 그림 수십 장을 새로 그려야 해서 느리고,
  // 누른 단추가 새로 만들어져 글쇠로 누르던 초점도 사라진다.
  const armNote = () => el('p', { class: 'fe-note strong fe-arm-note', text: '꾸며 둔 글과 조각이 틀로 바뀌어요(사진은 남아요). 바꾸려면 한 번 더 눌러요.' });
  function showArmed() {
    const tiles = [...panel.querySelectorAll('.fe-layout')];
    if (tab !== 'layout' || !tiles.length) { renderPanel(); return; }
    for (const tile of tiles) {
      const on = tile.dataset.layout === armed;
      tile.classList.toggle('armed', on);
      const name = tile.querySelector('small');
      if (name) name.textContent = on ? '한 번 더 눌러요' : layoutList().find((l) => l.id === tile.dataset.layout)?.name || '';
    }
    // 안내는 누른 템플릿이 든 묶음 바로 아래에 둔다(그 위의 것들이 밀리지 않아서, 같은 자리를 한 번 더 누를 수 있다).
    panel.querySelector('.fe-arm-note')?.remove();
    panel.querySelector('.fe-layout.armed')?.parentElement.after(armNote());
  }

  function setBg(id) {
    if (card.bg === id) return;
    endEdit();
    remember();
    card.bg = id;
    renderStage();
    renderUi();
    onChange();
    keepKeys();                        // 다시 그려 누른 칸이 사라져도 Ctrl+Z 가 듣게
  }

  // 담아 둔 스타일을 고른 것(여럿이면 모두)에 입힌다. 잠긴 것은 건너뛴다. 한 번에 되돌린다.
  function pasteStyle() {
    if (!styleClip) return;
    const idx = chosen().filter((i) => !items()[i].lock);
    if (!idx.length) return;
    endEdit();
    stopDrag();
    const list = items().slice();
    let changed = 0;
    for (const i of idx) {
      const next = cleanItem(applyStyle(list[i], styleClip), { keepSpaces: true });
      if (next && JSON.stringify(next) !== JSON.stringify(list[i])) { list[i] = next; changed++; }
    }
    if (!changed) { notify('이 요소에는 담아 둔 스타일에서 옮길 것이 없어요.'); return; }
    remember();
    card.items = list;
    listChanged(sel, many);
    focusStage();
  }
  // 사진 바꾸기: 고른 사진의 자리·크기·기울기·뒤집기·모양은 그대로 두고, 새 사진을 그 틀에 꽉 차게(가운데를 잘라) 넣는다.
  function replacePhoto() {
    const it = cur();
    if (!it || it.t !== 'image' || it.lock || busy) return;
    replaceFor = it.id || sel;
    replaceInput.click();
  }
  async function onReplacePicked() {
    const file = replaceInput.files?.[0];
    replaceInput.value = '';
    const key = replaceFor, target = card;
    replaceFor = null;
    if (!file || !card || busy) return;
    busy = true;
    try {
      const made = await shrinkImage(file, { max: settings().photoEdge, alpha: true });
      const img = await store(made);
      if (card !== target) return;
      const i = typeof key === 'string' ? items().findIndex((k) => k.id === key) : key;
      const old = items()[i];
      if (!old || old.t !== 'image' || old.lock) return;
      // 틀의 화면 비율(가로 ÷ 세로)과 새 사진의 비율로 가운데를 잘라 꽉 채운다. 원래 사진의 출처 표시는 새 사진에 남기지 않는다.
      const { url, path, crop, source, assetRefs, origin, ...rest } = old;
      const frame = old.w / old.h * settings().aspect, picture = 1 / (made.ratio || 1);
      const next = cleanItem({ ...rest, url: img.url, ...(img.path ? { path: img.path } : {}), ...(cleanCrop(coverCrop(picture, frame)) ? { crop: cleanCrop(coverCrop(picture, frame)) } : {}) }, { keepSpaces: true });
      if (!next) throw new Error('replace');
      if (libraryOn() && !library.some(sameUrl(img.url))) library.push(img.path ? { url: img.url, path: img.path } : { url: img.url });
      endEdit();
      stopDrag();
      sel = i;
      many = [];
      remember();
      put(next, { rebuild: true });
      renderUi();
      onChange();
      focusStage();
    } catch (ex) {
      console.error(ex);
      notify('사진을 바꾸지 못했어요. PNG나 JPG 그림 파일인지 확인하고 다시 해 봐요.', 4000);
    } finally {
      busy = false;
      if (tab === 'upload') renderPanel();
    }
  }
  // 페이지 가운데로: 가로·세로 모두 가운데(한 번에 되돌린다).
  function centerOnPage() {
    const it = cur();
    if (!it || it.lock) return;
    const node = nodes[sel];
    const rect = stage.getBoundingClientRect();
    const hw = node ? node.offsetWidth / (rect.width || 1) * 50 : 0, hh = node ? node.offsetHeight / (rect.height || 1) * 50 : 0;
    const to = alignItem(alignItem(it, 'center', hw, hh), 'middle', hw, hh);
    change({ x: to.x, y: to.y });
  }

  // 사진을 카드에 꽉 차게 키워 맨 뒤에 깐다.
  function toBackground() {
    const it = cur();
    if (!it || it.t !== 'image') return;
    endEdit();
    stopDrag();
    remember();
    const list = items().slice();
    list[sel] = cleanItem({ ...coverItem(it), lock: true });
    card.items = reorder(list, sel, 'bottom')[0];
    // 고르기를 풀고 잠가 둔다. 고른 채로 두면 그 위의 글을 끌 때 배경이 대신 끌려 온다.
    listChanged(-1);
    notify('사진을 맨 뒤에 깔고 잠갔어요. 다시 바꾸려면 사진을 누르고 "잠금 해제"를 눌러요.', 4500);
    focusStage();
  }

  // 페이지(카드)에 맞춰 정렬: 화면에서 잰 크기로 가장자리에 붙인다.
  function alignTo(where) {
    const it = cur();
    const node = nodes[sel];
    if (!it || !node) return;
    const rect = stage.getBoundingClientRect();
    const to = alignItem(it, where, node.offsetWidth / (rect.width || 1) * 50, node.offsetHeight / (rect.height || 1) * 50);
    change({ x: to.x, y: to.y });
  }

  // ---------- 카드 위에서 바로 글 고치기 ----------
  function startEdit(selectAll = false) {
    const it = cur();
    const node = nodes[sel];
    if (!it || it.t !== 'text' || it.lock || !node || editing === sel) return;
    editing = sel;
    typed = false;
    // Render-only punctuation spans must never trap the caret or an IME range.
    if (node.querySelector('.fi-text-flow')) node.textContent = it.text;
    try { node.contentEditable = 'plaintext-only'; } catch { /* 아래에서 다시 */ }
    if (node.contentEditable !== 'plaintext-only') node.contentEditable = 'true';
    node.classList.add('editing');
    node.spellcheck = false;
    node.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(node);
    if (!selectAll) range.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    syncSel();
    markEditing();
  }
  // "글 고치기" 단추의 눌림만 바꾼다. 여기서 도구 막대를 통째로 다시 그리면, 글을 고치다가 누른 단추가 눌리기 전에 사라진다.
  function markEditing() {
    bar.querySelector('.fe-tb.edit')?.classList.toggle('on', editing >= 0 && editing === sel);
  }
  function endEdit() {
    if (editing < 0) return;
    const i = editing;
    editing = -1;
    const node = nodes[i];
    if (items()[i] && node) {
      // 저장될 때와 같은 모양으로 정리해 다시 그린다(여러 칸 띄어쓰기는 한 칸으로, 끝의 빈 줄은 뗀다).
      // 그래야 화면에서 본 것과 저장한 것·그림으로 내보낸 것이 같다. 글이 비었으면 빈 글상자로 남겨 둔다.
      const tidy = { ...items()[i], text: items()[i].text.replace(/\s+$/, '') };
      const it = cleanItem(tidy) || cleanItem(tidy, { keepSpaces: true });
      if (it.text !== items()[i].text) {
        const list = items().slice();
        list[i] = it;
        card.items = list;
        onChange();
      }
      const fresh = itemView(it);
      node.replaceWith(fresh);
      nodes[i] = fresh;
    }
    syncSel();
    markEditing();
  }
  cardEl.addEventListener('input', () => {
    if (editing < 0) return;
    const node = nodes[editing];
    const it = items()[editing];
    if (!node || !it) return;
    if (!typed) { typed = true; remember(); }
    const text = node.innerText.replace(/ /g, ' ');
    const limit = textLimit(it);
    if (text.length > limit) notify(`글상자 하나에는 ${limit}자까지 쓸 수 있어요.`);
    const list = items().slice();
    list[editing] = cleanItem({ ...it, text, ...(it.runs?.length ? { runs: shiftRuns(it.text, text, it.runs, it) } : {}) }, { keepSpaces: true });
    card.items = list;
    if (textRange?.i === editing) textRange = { ...textRange, text: list[editing].text };
    syncSel();
    onChange();
  });
  cardEl.addEventListener('focusout', (e) => {
    if (editing >= 0 && e.target === nodes[editing]) endEdit();
  });
  // 붙여 넣을 때는 글자만 넣는다(다른 곳에서 복사한 꾸밈이나 그림이 따라 들어오지 않게).
  // 글을 고치는 중이 아니면: 붙여 넣은 글이 유튜브 주소면 영상을 놓는다.
  stage.addEventListener('paste', (e) => {
    if (editing >= 0 || cam) return;
    const text = e.clipboardData?.getData('text/plain') || '';
    e.preventDefault();
    if (parseYouTube(text)) addYouTube(text);
    else notify('먼저 조각을 복사해요 (오른쪽 누르기 → 복사). 유튜브 주소를 붙여 넣으면 영상이 들어가요.', 4000);
  });
  cardEl.addEventListener('paste', (e) => {
    if (editing < 0) return;
    e.preventDefault();
    const text = clip(e.clipboardData?.getData('text/plain') || '', textLimit(cur()));
    if (text) document.execCommand('insertText', false, text);
  });
  cardEl.addEventListener('drop', (e) => { if (editing >= 0) e.preventDefault(); });

  // ---------- 누른 곳의 요소 ----------
  // 속을 비운 도형(테두리만)은 테두리만 눌린다. 빈 속을 누르면 그 밑에 있는 것이 눌려서, 틀 안의 글이나 사진을 바로 고르고 고칠 수 있다.
  // 밑에 아무것도 없으면 빈 도형이 눌린다(틀만 있을 때에는 속을 잡고 끌 수 있다). 손가락은 넉넉하게(slack) 본다.
  function itemAt(x, y, touch = false) {
    const stack = [];
    for (const n of document.elementsFromPoint(x, y)) {
      const node = n.closest?.('.fi');
      if (node && nodes.includes(node) && !stack.includes(node)) stack.push(node);
    }
    const solid = stack.find((node) => !inHole(node, x, y, touch ? 12 : 5));
    return nodes.indexOf(solid || stack[0]);
  }
  // 그 점이 빈 도형의 "속"인가(테두리에서 slack 보다 멀리 떨어진 안쪽).
  function inHole(node, x, y, slack) {
    const it = items()[nodes.indexOf(node)];
    if (!it || it.t !== 'shape' || !it.hollow) return false;
    if (node.querySelector('svg')) {
      // SVG 도형: 속을 비우면 획(테두리)만 눌리므로, 그 점과 둘레의 몇 점 가운데 하나라도 이 도형의 획에 닿으면 테두리다.
      const around = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]];
      return !around.some(([dx, dy]) => document.elementsFromPoint(x + dx * slack, y + dy * slack).some((n) => n.ownerSVGElement && node.contains(n)));
    }
    // CSS 도형(네모·둥근 네모·동그라미·캡슐): 기울기를 풀어 도형 안의 자리로 바꾼 뒤, 테두리 안쪽의 (둥근) 네모 안인지 본다.
    const box = node.getBoundingClientRect();
    const rad = -it.rot * Math.PI / 180;
    const dx = x - (box.left + box.width / 2);
    const dy = y - (box.top + box.height / 2);
    const px = Math.abs(dx * Math.cos(rad) - dy * Math.sin(rad));
    const py = Math.abs(dx * Math.sin(rad) + dy * Math.cos(rad));
    const style = getComputedStyle(node);
    const inset = (parseFloat(style.borderTopWidth) || 0) + slack;
    const hw = node.offsetWidth / 2 - inset;
    const hh = node.offsetHeight / 2 - inset;
    if (hw <= 0 || hh <= 0) return false;                         // 속이 남지 않을 만큼 테두리가 굵다
    if (it.shape === 'circle') return (px / hw) ** 2 + (py / hh) ** 2 <= 1;
    const r = Math.max(0, Math.min(parseFloat(style.borderTopLeftRadius) || 0, node.offsetWidth / 2, node.offsetHeight / 2) - inset);
    if (px > hw || py > hh) return false;
    if (px <= hw - r || py <= hh - r) return true;
    return Math.hypot(px - (hw - r), py - (hh - r)) <= r;
  }

  // ---------- 끌기·크기·돌리기 ----------
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !card || drag) return;      // 끄는 중에 다른 손가락이 닿으면 모른 척한다
    if(cropJob){e.preventDefault();applyCrop();return;}
    // 잇는 중: 조각을 누르면 시작 → 닿을 조각 차례로 고르고, 빈 곳을 누르면 그만둔다.
    if (linking) {
      if (e.target.closest?.('.fe-link-hint')) return;
      e.preventDefault();
      const top = e.target.closest?.('.fi') ? itemAt(e.clientX, e.clientY, !!e.pointerType && e.pointerType !== 'mouse') : -1;
      if (top < 0 && linking.from != null && !e.target.closest?.('.fe-h')) {
        const r = stage.getBoundingClientRect(), point = [(e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100];
        if (point.every((v) => v >= 0 && v <= 100)) { const from = linking.from; stopLinking(); linkToNew(from, point); return; }
      }
      if (top < 0 || items()[top].t === 'link') { stopLinking(true); return; }
      if (linking.from == null) { linking.from = top; select(top); paintLinking(); return; }
      if (top === linking.from) return;
      const from = linking.from;
      stopLinking();
      linkPair(from, top);
      return;
    }
    if (e.target.closest?.('.fe-empty-go, .fe-grow')) return;   // 빈 장의 빠른 시작 · 이어서 하나 더 단추는 그냥 누른다  // 빈 장의 빠른 시작 단추는 그냥 누른다(고르기 · 끌기를 시작하지 않는다)
    if (editing >= 0 && nodes[editing]?.contains(e.target)) return;   // 글을 고치는 중에는 글 안을 눌러 자리를 옮길 수 있게 둔다
    textRange = null;                               // 카드의 다른 곳을 누르면 고른 글자 구간은 잊는다
    endEdit();
    stopPreview();                                  // 미리 보던 움직임은 끝낸다(숨겨 둔 요소가 있으면 다시 보인다)
    // 손가락·펜은 오른쪽 누르기가 없으니, 움직이지 않고 길게 누르고 있으면 메뉴를 연다.
    stopPress();
    if (e.pointerType && e.pointerType !== 'mouse' && !e.target.closest?.('.fe-h')) {
      const p = { id: e.pointerId, x: e.clientX, y: e.clientY };
      p.timer = setTimeout(() => { if (press === p) { press = null; openMenu(p.x, p.y, { touch: true }); } }, LONG_PRESS);
      press = p;
    }
    const h = e.target.closest?.('.fe-h');
    const top = e.target.closest?.('.fi') ? itemAt(e.clientX, e.clientY, !!e.pointerType && e.pointerType !== 'mouse') : -1;
    if (h && h.dataset.h === 'gscale' && many.length) startGroupScale(e, h.dataset.corner);
    else if (h && sel >= 0 && !cur().lock) start(h.dataset.h, e, h.dataset.corner);
    // 고른 연결선의 글을 잡으면 그 글을 선을 따라 옮긴다.
    else if (top >= 0 && top === sel && items()[top].t === 'link' && !items()[top].lock && e.target.closest?.('.fi-link-label, .fi-link-label-bg')) start('label', e);
    // Shift 를 누른 채 누르면 그 요소를 고른 것에 넣거나 뺀다. 빈 곳에서 끌면 고른 것에 더한다.
    else if (e.shiftKey && top >= 0 && !items()[top].lock) { e.preventDefault(); focusStage(); toggleChosen(top); }
    // 여럿 고른 것 가운데 하나를 잡으면 모두 함께 옮긴다(끌지 않고 떼면 그것 하나만 고른다).
    else if (many.length && many.includes(top)) startGroup(e, top);
    // 그룹에 든 요소를 누르면 그룹 전체를 고르고, 끌면 함께 옮긴다(한 번 더 누르면 그것 하나만 고른다).
    else if (top >= 0 && !e.shiftKey && groupOf(top).filter(free).length >= 2 && !(sel >= 0 && groupOf(sel).includes(top))) { selectMany(groupOf(top)); if (many.length) startGroup(e, undefined); }
    else if (top >= 0 && e.shiftKey) startMarquee(e, true);
    else if (top >= 0 && top !== sel && sel >= 0 && !cur().lock && document.elementsFromPoint(e.clientX, e.clientY).includes(nodes[sel])) {
      // 고른 것 위에 다른 것이 겹쳐 있을 때: 끌면 고른 것이 움직이고, 그냥 누르기만 하면 위에 있는 것을 고른다.
      start('move', e);
      if (drag) drag.tap = top;
    } else if (top >= 0) {
      const again = top === sel;
      select(top);
      if (sel !== top) return;                      // 고르지 못했다(다른 사람이 고르고 있다): 끌지 않는다
      start('move', e);
      if (drag) drag.again = again;
    } else startMarquee(e, e.shiftKey);
  });
  // 빈 곳에서 끌어 네모 안에 닿는 것들을 고른다(잠근 것은 빼고). add: 이미 고른 것에 더한다(Shift).
  function startMarquee(e, add) {
    e.preventDefault();
    focusStage();
    const base = add ? chosen().filter(free) : [];
    if (!add) select(-1);
    try { stage.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 계속한다 */ }
    drag = { mode: 'marquee', id: e.pointerId, px: e.clientX, py: e.clientY, base, moved: false };
  }
  function dragMarquee(e) {
    const s = stage.getBoundingClientRect();
    const [l, r] = [Math.min(drag.px, e.clientX), Math.max(drag.px, e.clientX)];
    const [t, b] = [Math.min(drag.py, e.clientY), Math.max(drag.py, e.clientY)];
    Object.assign(marquee.style, { left: `${l - s.left}px`, top: `${t - s.top}px`, width: `${r - l}px`, height: `${b - t}px` });
    marquee.hidden = false;
    const hits = nodes.map((n, i) => [n.getBoundingClientRect(), i]).filter(([n, i]) => free(i) && n.right >= l && n.left <= r && n.bottom >= t && n.top <= b).map(([, i]) => i);
    const pick = withGroups([...drag.base, ...hits]).filter(free).sort((a, c) => a - c);
    if (pick.join() !== chosen().join()) setMany(pick);
  }
  // 모두를 감싸는 상자의 모서리를 잡고 함께 키우거나 줄이기 시작한다. 맞은편 모서리는 그 자리에 있다.
  function startGroupScale(e, corner) {
    e.preventDefault();
    endEdit();
    focusStage();
    try { stage.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 계속한다 */ }
    const s = stage.getBoundingClientRect();
    const g = groupBox.getBoundingClientRect();
    const ax = corner.includes('w') ? g.right : g.left;
    const ay = corner.includes('n') ? g.bottom : g.top;
    drag = {
      mode: 'gscale', id: e.pointerId, px: e.clientX, py: e.clientY, idx: many.slice(), from: many.map((i) => items()[i]), moved: false,
      rect: s, box: g, corner, ax, ay,
    };
  }
  // 여럿을 함께 옮기기 시작한다. tap: 끌지 않고 떼면 이것 하나만 고른다.
  function startGroup(e, tap) {
    e.preventDefault();
    endEdit();
    focusStage();
    try { stage.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 계속한다 */ }
    drag = { mode: 'group', id: e.pointerId, rect: stage.getBoundingClientRect(), px: e.clientX, py: e.clientY, idx: many.slice(), from: many.map((i) => items()[i]), moved: false, tap };
  }
  // 연결선의 끝을 끄는 중: 놓일 조각과 그 위의 붙는 곳을 찾아 선을 미리 그린다(잇는 다른 끝의 조각 · 빈 곳이면 처음 모양).
  function dragLinkEnd(e) {
    const { rect, from, corner: end } = drag, aspect = settings().aspect;
    const point = [(e.clientX - rect.left) / rect.width * 100, (e.clientY - rect.top) / rect.height * 100];
    if (!drag.ided) {
      // 이름표가 없는 조각도 이을 수 있게 미리 붙여 둔다(보이는 것은 그대로).
      drag.ided = true;
      if (items().some((x) => x.t !== 'link' && !x.id)) card.items = items().map((x) => (x.t !== 'link' && !x.id ? { ...x, id: newId() } : x));
    }
    const list = items(), other = end === 'from' ? from.to : from.from;
    const i = pieceNear(list, point, aspect);
    const piece = i >= 0 && list[i].id !== other ? list[i] : null;
    const sideKey = end === 'from' ? 'fromSide' : 'toSide', posKey = end === 'from' ? 'fromPos' : 'toPos';
    let next = from;
    if (piece) {
      const { side, pos } = endSpot(piece, point, aspect);
      next = { ...from, [end]: piece.id, [sideKey]: side, [posKey]: side && pos !== 0.5 ? pos : undefined };
      const b = boxOfItem(piece, aspect);
      Object.assign(linkTarget.style, { left: `${b.cx - b.hw}%`, top: `${(b.cy - b.hh) * aspect}%`, width: `${b.hw * 2}%`, height: `${b.hh * 2 * aspect}%` });
    }
    linkTarget.hidden = !piece;
    drag.next = piece ? next : null;
    drag.point = i >= 0 ? null : point;        // 조각 위(이어진 다른 끝의 조각도)가 아닌 빈 곳에 놓을 때만 새 조각을 만든다
    const now = items()[sel];
    if (now[end] !== next[end] || now[sideKey] !== next[sideKey] || now[posKey] !== next[posKey]) put(next, { rebuild: true });   // 선 그림을 새로 그려야 처음 모양으로 돌아와도 맞다
  }
  // 끝을 놓았다: 조각 위면 그대로 저장하고, 빈 곳 · 이미 이어진 두 조각 · 바뀐 것 없음이면 처음으로 되돌린다.
  function dropLinkEnd() {
    const { from, next, moved, corner: end, point } = drag;
    stopDrag();
    linkTarget.hidden = true;
    if (!moved) { renderUi(); return; }
    const a = next?.from, b = next?.to;
    const twin = next && next[end] !== from[end] && items().some((x, k) => k !== sel && x.t === 'link' && ((x.from === a && x.to === b) || (x.from === b && x.to === a)));
    // 빈 곳에 놓았다: 그 끝이 붙어 있던 조각을 그 자리에 하나 더 놓고 그쪽으로 잇는다(카드 밖이면 처음으로 되돌린다).
    const like = items().findIndex((x) => x.id && x.t !== 'link' && x.id === from[end]), fallback = items().findIndex((x) => x.id && x.t !== 'link' && x.id === (end === 'from' ? from.to : from.from));
    if (!next && point && point.every((v) => v >= 0 && v <= 100) && (like >= 0 || fallback >= 0)) {
      put(from, { rebuild: true });
      past.pop();
      const made = pieceAt(like >= 0 ? like : fallback, point);
      if (!made) { markHistory(); renderUi(); return; }
      remember();
      const { list, piece } = made, at = list.findIndex((x) => x === items()[sel] || (x.t === 'link' && x.id === from.id));
      const sideKey = end === 'from' ? 'fromSide' : 'toSide', posKey = end === 'from' ? 'fromPos' : 'toPos';
      const relinked = cleanItem({ ...list[at], [end]: piece.id, [sideKey]: undefined, [posKey]: undefined });
      card.items = [...list.slice(0, at), relinked, ...list.slice(at + 1), piece];
      listChanged(card.items.length - 1);
      notify('빈 곳에 새 조각을 놓고 이었어요.', 2500);
      return;
    }
    const same = !next || twin || ['from', 'to', 'fromSide', 'toSide', 'fromPos', 'toPos'].every((k) => next[k] === from[k]);
    if (same) {
      put(from, { rebuild: true });
      past.pop();                                   // 바뀐 것이 없으니 되돌리기 기록도 남기지 않는다
      markHistory();
      renderUi();
      if (twin) notify('그 두 조각은 이미 이어져 있어요.', 2500);
      else if (!next) notify('선의 끝은 조각 위나 카드 안의 빈 곳에 놓아요.', 2500);
      return;
    }
    renderUi();
    onChange();
  }
  function start(mode, e, corner) {
    e.preventDefault();
    focusStage();
    const it = cur();
    if (!it) return;
    if (it.t === 'link' && mode !== 'bend' && mode !== 'label' && mode !== 'lend') return;  // 연결선은 끌어 옮기지 않는다(잇는 조각을 옮긴다). 가운데 손잡이 · 두 끝 · 선 위의 글만 끈다.
    try { stage.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 계속한다 */ }
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + rect.width * it.x / 100;
    const cy = rect.top + rect.height * it.y / 100;
    // 넉넉한 선택 테두리 대신 실제 요소 크기를 기억한다. 잡은 자리에서
    // 움직인 만큼만 바꾸므로 작은 조각도 손잡이를 잡는 순간 튀지 않는다.
    const node = nodes[sel];
    drag = {
      mode, id: e.pointerId, rect, from: it, moved: false,
      px: e.clientX, py: e.clientY, cx, cy,
      corner: corner || mode, width: node?.offsetWidth || 1, height: node?.offsetHeight || 1,
      knobShift: mode === 'bend' ? Number(linkKnob.dataset.shift) || 0 : 0,
    };
  }
  stage.addEventListener('pointermove', (e) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) stopPress();
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.mode === 'marquee') {
      if (!drag.moved && Math.hypot(e.clientX - drag.px, e.clientY - drag.py) < 4) return;
      drag.moved = true;
      dragMarquee(e);
      return;
    }
    if (drag.mode === 'gscale') {
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.px, e.clientY - drag.py) < 3) return;
        drag.moved = true;
        remember();
      }
      const { box, rect, corner } = drag;
      const dx = e.clientX - drag.px, dy = e.clientY - drag.py;
      const k = Math.max(0.000001, 1 + (e.ctrlKey ? 2 : 1) * ((corner.includes('w') ? -1 : 1) * box.width * dx + (corner.includes('n') ? -1 : 1) * box.height * dy) / Math.max(1, box.width ** 2 + box.height ** 2));
      const ax = e.ctrlKey ? box.left + box.width / 2 : drag.ax;
      const ay = e.ctrlKey ? box.top + box.height / 2 : drag.ay;
      const made = scaleItems(drag.from, k, (ax - rect.left) / rect.width * 100, (ay - rect.top) / rect.height * 100).items;
      putMany(new Map(drag.idx.map((i, n) => [i, made[n]])));
      return;
    }
    if (drag.mode === 'group') {
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.px, e.clientY - drag.py) < 4) return;
        drag.moved = true;
        remember();
      }
      shiftMany(drag.from, drag.idx, (e.clientX - drag.px) / drag.rect.width * 100, (e.clientY - drag.py) / drag.rect.height * 100);
      return;
    }
    const { mode, rect, from, cx, cy } = drag;
    if (from.lock) {
      // 잠근 것(배경으로 깐 사진 등)은 움직이지 않는다. 그 위에서 끌면 빈 곳에서처럼 네모로 고른다.
      if (mode === 'move' && Math.hypot(e.clientX - drag.px, e.clientY - drag.py) >= 4) {
        const { id, px, py } = drag;
        select(-1);                                 // 끌기를 멈추므로 새 끌기는 그 뒤에 만든다
        drag = { mode: 'marquee', id, px, py, base: [], moved: true };
        dragMarquee(e);
      }
      return;
    }
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.px, e.clientY - drag.py) < 4) return;
      drag.moved = true;
      remember();
    }
    let next = from;
    if (mode === 'label') {
      const labelAt = linkLabelT(from, [(e.clientX - rect.left) / rect.width * 100, (e.clientY - rect.top) / rect.height * 100], settings().aspect);
      if (labelAt !== (items()[sel].labelAt ?? 0.5)) put({ ...from, labelAt }, { rebuild: true });   // 선의 길은 그대로라 다시 그려야 글이 따라온다
      return;
    }
    if (mode === 'lend') { dragLinkEnd(e); return; }
    if (mode === 'bend') {
      const byId = (id) => items().find((x) => x.id === id);
      const patch = dragLinkHandle(from, byId(from.from), byId(from.to), [(e.clientX - rect.left) / rect.width * 100, (e.clientY - rect.top) / rect.height * 100 - drag.knobShift], settings().aspect);
      if (patch) put({ ...from, ...patch });
      return;
    }
    if (mode === 'move') {
      const moved = moveItem(from,
        from.x + (e.clientX - drag.px) / rect.width * 100,
        from.y + (e.clientY - drag.py) / rect.height * 100, { snap: !e.altKey });
      next = moved.item;
      guideV.hidden = !moved.guides.v;
      guideH.hidden = !moved.guides.h;
    } else if (mode === 'rot') {
      next = rotateItem(from, Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90);
    } else {
      const box = {
        width: drag.width, height: drag.height, stageWidth: rect.width, stageHeight: rect.height,
        handle: drag.corner, dx: e.clientX - drag.px, dy: e.clientY - drag.py,
        proportional: e.shiftKey, centered: e.ctrlKey,
      };
      next = resizeItemFromHandle(from, box);
      // Text can wrap differently at its new width. Anchor against the actual
      // rendered height so its opposite corner stays still after that reflow.
      const node = nodes[sel];
      placeItem(node, next);
      next = anchorResizedItem(from, next, { ...box, afterWidth: node.offsetWidth, afterHeight: node.offsetHeight });
      if (next.x < 0 || next.x > 100 || next.y < 0 || next.y > 100) next = items()[sel];
    }
    put(next);
  });
  const end = (e) => {
    if (press && e.pointerId === press.id) stopPress();
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, tap, again, mode } = drag;
    // select(-1) 이 끌기를 멈추므로, 잡아 둔 drag 를 지운 뒤에 고른다.
    if (mode === 'marquee') { stopDrag(); renderUi(); return; }
    if (mode === 'lend') { dropLinkEnd(); return; }
    stopDrag();
    if (moved) { renderUi(); onChange(); return; }
    if (tap != null) { select(tap); return; }
    // 돌리기 손잡이가 다른 요소(위쪽의 글 등)를 가리고 있을 때: 끌지 않고 누르기만 했으면 그 밑의 요소를 고른다.
    if (mode === 'rot' && e.type === 'pointerup') {
      const under = itemAt(e.clientX, e.clientY, !!e.pointerType && e.pointerType !== 'mouse');
      if (under >= 0 && under !== sel && !items()[under].lock) select(under);      // 잠근 것(배경으로 깐 사진)으로는 넘어가지 않는다
      return;
    }
    // 이미 고른 텍스트를 손가락으로 한 번 더 누르면 글을 고친다(마우스는 두 번 누르기).
    if (again && mode === 'move' && e.type === 'pointerup' && e.pointerType && e.pointerType !== 'mouse') {
      if(cur()?.t==='image')openCrop();else startEdit();
    }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('lostpointercapture', end);      // 손을 뗀 것을 놓쳤어도 끌기가 끝나게
  // 고른 텍스트를 두 번 누르면 글을 고친다. 끌기 때문에 포인터를 잡아 두어서 이 사건은 꾸미기 판에서 일어난 것으로 온다.
  // 그래서 누른 곳이 고른 글상자 안인지를 자리로 견준다.
  stage.addEventListener('dblclick', (e) => {
    if(cropJob)return;
    // 그룹(여럿 고른 것) 안의 글을 두 번 누르면 그 글 하나를 골라 고친다.
    if (many.length) {
      const at = itemAt(e.clientX, e.clientY);
      if (at >= 0 && many.includes(at)) { select(at); if (items()[at].t === 'text') startEdit();else if(items()[at].t==='image')openCrop(); }
      return;
    }
    const it = cur();
    // 연결선을 두 번 누르면 선 위의 글 칸을 연다.
    if (it?.t === 'link' && !it.lock && itemAt(e.clientX, e.clientY) === sel) { if (pop !== 'llabel') toggle('llabel'); return; }
    const box = nodes[sel]?.getBoundingClientRect();
    if (!it || !['text','image'].includes(it.t) || !box) return;
    if (e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom) {
      if(it.t==='image')openCrop();else startEdit();
    }
  });

  // 옆 칸의 단추에 초점이 있을 때에도 실행 취소 · 다시 실행은 듣는다(효과를 고른 바로 뒤에 Ctrl+Z 를 누르는 일이 많다).
  panel.addEventListener('keydown', (e) => {
    if (!card || editing >= 0 || !(e.ctrlKey || e.metaKey)) return;
    const t = e.target;
    // 글을 쓰는 칸에서는 그 칸의 되돌리기. 막대(range)는 글을 쓰는 칸이 아니라서 편집기의 되돌리기를 듣는다(영상 칸의 자르기 막대 등).
    if (t.isContentEditable || ['TEXTAREA', 'SELECT'].includes(t.tagName) || (t.tagName === 'INPUT' && t.type !== 'range')) return;
    if (e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (e.code === 'KeyY') { e.preventDefault(); redo(); }
  });

  stage.addEventListener('keydown', (e) => {
    if (cam) return;                                // 카메라로 찍는 중에는 꾸미기 판의 글쇠를 듣지 않는다
    if(cropJob){cropKey(e);return;}
    if (editing >= 0) {
      if (e.key === 'Escape') { e.preventDefault(); endEdit(); focusStage(); }
      // 고른 글자만 굵게 · 기울임 · 밑줄(Ctrl+B · I · U). 고르지 않았으면 글상자 전체.
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && ['KeyB', 'KeyI', 'KeyU'].includes(e.code) && cur()?.t === 'text') {
        e.preventDefault();
        readRange();
        const key = { KeyB: 'bold', KeyI: 'italic', KeyU: 'under' }[e.code];
        change({ [key]: !cur()[key] });
      }
      return;                                       // 글을 고치는 중에는 글자판이 글로 간다
    }
    // 글쇠의 자리(e.code)로 견준다. 한글 입력 상태에서는 e.key 가 'ㅋ' 처럼 와서 Ctrl+Z 를 놓친다.
    const key = e.code;
    const mod = e.ctrlKey || e.metaKey;
    if (linking && e.key === 'Escape') { e.preventDefault(); stopLinking(true); return; }
    if(!mod&&!e.altKey&&!e.shiftKey&&!e.isComposing&&key==='KeyI'){const target=colorTarget();if(target){e.preventDefault();sampleColor(target.value,target.apply);}return;}
    if (mod && key === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && key === 'KeyY') { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape' && pop) { e.preventDefault(); toggle(pop); return; }
    // 복사해 둔 요소가 없으면 브라우저의 붙여넣기에 맡긴다(유튜브 주소를 붙여 넣으면 영상이 놓인다: 아래의 paste).
    if (mod && key === 'KeyV') { if (!clipboard?.length) return; e.preventDefault(); clipPaste(); return; }
    // 메뉴 글쇠(또는 Shift+F10): 고른 요소의 가운데(없으면 카드 가운데)에서 메뉴를 연다.
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const b = (nodes[sel] || (many.length ? groupBox : stage)).getBoundingClientRect();
      openMenu(b.left + b.width / 2, b.top + b.height / 2, { keep: true });
      return;
    }
    // Ctrl+A: 잠그지 않은 것을 모두 고른다.
    if (mod && key === 'KeyA') { e.preventDefault(); selectMany(items().map((_, i) => i)); return; }
    if (many.length) {
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (mod && key === 'KeyC') { e.preventDefault(); clipCopy(); }
      else if (mod && key === 'KeyX') { e.preventDefault(); clipCut(); }
      else if (mod && key === 'KeyD') { e.preventDefault(); copyMany(); }
      else if (mod && key === 'KeyG') { e.preventDefault(); if (e.shiftKey) ungroupMany(); else groupMany(); }
      else if (arrows[e.key]) {
        e.preventDefault();
        const rect = stage.getBoundingClientRect(), step = e.shiftKey ? 10 : 1;
        remember();
        shiftMany(many.map((i) => items()[i]), many.slice(), arrows[e.key][0] * step / rect.width * 100, arrows[e.key][1] * step / rect.height * 100);
        onChange();
      } else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
      else if (e.key === 'Escape') select(-1);
      return;
    }
    const it = cur();
    if (!it) return;
    if (mod && key === 'KeyC') { e.preventDefault(); clipCopy(); return; }
    if (mod && key === 'KeyX') { e.preventDefault(); clipCut(); return; }
    if (mod && key === 'KeyD') { e.preventDefault(); copy(); return; }
    if (it.lock) { if (e.key === 'Escape') select(-1); return; }
    const rect = stage.getBoundingClientRect(), step = e.shiftKey ? 10 : 1;
    const arrows = { ArrowLeft: [-step / rect.width * 100, 0], ArrowRight: [step / rect.width * 100, 0], ArrowUp: [0, -step / rect.height * 100], ArrowDown: [0, step / rect.height * 100] };
    if (arrows[e.key] && it.t === 'link') e.preventDefault();
    else if (arrows[e.key]) {
      e.preventDefault();
      remember();
      put(moveItem(it, it.x + arrows[e.key][0], it.y + arrows[e.key][1], { snap: false }).item);
      onChange();
    } else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
    else if (e.key === 'Escape') select(-1);
    else if (e.key === 'Enter' && it.t === 'text') { e.preventDefault(); startEdit(true); }
    else if (e.key === 'Enter' && it.t === 'image') { e.preventDefault(); openCrop(); }
    else if (mod && key === 'KeyB' && it.t === 'text') { e.preventDefault(); change({ bold: !it.bold }); }
  });

  // 카드 크기가 바뀌면(창 크기·화면 돌리기) 테두리를 다시 맞춘다.
  const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (card) { syncSel(); drawCrop(); tidySeps(); } }) : null;
  watcher?.observe(stage);
  watcher?.observe(bar);
  // 글씨체 파일을 다 받으면 글상자 크기가 달라지므로 테두리를 다시 맞춘다.
  const onFontsLoaded = () => { if (card) syncSel(); };
  document.fonts?.addEventListener?.('loadingdone', onFontsLoaded);

  // ---------- 사진 넣기 ----------
  // 줄인 그림을 프로젝트의 저장소에 맡기고 { url, path? } 를 받는다. 저장소를 주지 않았으면 이 화면에서만 쓰는 임시 주소.
  async function store(made) {
    const img = uploadImage ? await uploadImage(made) : { url: URL.createObjectURL(made.blob) };
    if (!img || typeof img.url !== 'string') throw new Error('uploadImage 가 { url } 을 돌려주지 않았어요');
    blobs.set(img.url, made.blob);
    while (blobs.size > BLOB_CACHE) blobs.delete(blobs.keys().next().value);
    return img;
  }
  // 사진의 파일 내용: 이번에 올린 것은 기억해 둔 것을, 아니면 프로젝트의 방법이나 주소에서 새로 받는다.
  // (같은 주소를 <img> 로 받아 둔 보관본에는 "읽어도 된다"는 허락 표시가 없을 수 있어, 보관본을 쓰지 않고 새로 받는다)
  async function blobOf(it) {
    const kept = blobs.get(it.url);
    if (kept) return kept;
    if (loadImageBlob) return loadImageBlob(it);
    const res = await fetch(it.url, /^(blob|data):/.test(it.url) ? {} : { cache: 'no-store' });
    if (!res.ok) throw new Error(`사진을 받지 못했어요 (${res.status})`);
    return res.blob();
  }
  // ---------- 올린 파일 목록 ----------
  // configure({ maxUploads }) 가 1 이상이면 업로드 칸에 올린 파일들이 남는다: 눌러서 다시 넣고, 안 쓰는 것은 지운다.
  // 목록은 저장소를 모른다: 프로젝트가 getUploads() 로 꺼내 디자인과 함께 저장하고, 편집기를 만들 때 uploads 로 다시 준다.
  const libraryOn = () => settings().maxUploads > 0;
  const sameUrl = (url) => (u) => u.url === url;
  const photosHere = () => items().filter((k) => k.t === 'image').length;
  function setUploads(list) {
    library = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const img = cleanImg(typeof raw === 'string' ? { url: raw } : raw);
      if (img && !library.some(sameUrl(img.url))) library.push(img);
    }
  }
  // 카드에 놓인 사진은 늘 목록에도 있다(배경을 지워 새로 생긴 사진, 실행 취소로 되살아난 사진을 목록에 넣는다).
  function keepUploads() {
    if (!libraryOn() || !card) return library;
    for (const it of items()) {
      if (it.t === 'image' && !library.some(sameUrl(it.url))) library.push(it.path ? { url: it.url, path: it.path } : { url: it.url });
    }
    return library;
  }
  // 그 파일을 쓴 곳의 수: 이 카드 + 다른 카드(프로젝트가 usedElsewhere 로 알려 준다. 슬라이드가 여러 장일 때).
  const usesHere = (url) => items().filter((it) => it.t === 'image' && it.url === url).length;
  const usesOf = (url) => usesHere(url) + (usedElsewhere ? Number(usedElsewhere(url)) || 0 : 0);
  // 목록의 파일을 카드에 놓는다. 사진의 비율은 목록의 작은 그림에서 읽는다(아직 못 읽었으면 지금 읽는다).
  async function placeUpload(img, view) {
    if (busy || !card) return;
    if (photosHere() >= settings().maxPhotos) { notify(`사진은 카드 한 장에 ${settings().maxPhotos}장까지예요.`); return; }
    let ratio = view?.naturalWidth ? view.naturalHeight / view.naturalWidth : 0;
    if (!ratio) {
      try {
        const probe = new Image();
        probe.src = img.url;
        await probe.decode();
        ratio = probe.naturalHeight / probe.naturalWidth;
      } catch { ratio = 1; }
    }
    const photo = newPhoto({ ...img, ratio });
    if (!photo) { notify('이 파일은 넣을 수 없어요. 지우고 다시 올려 봐요.', 4000); return; }
    add(photo);
  }
  // 목록에서 지운다. 이 카드에서 쓴 것도 함께 지우고(실행 취소로 되살릴 수 있다), 다른 카드에서 쓴 것은 프로젝트가 지운다(onRemoveUpload).
  function removeUpload(url) {
    const img = library.find(sameUrl(url));
    armedFile = null;
    if (!img || busy) { renderPanel(); return; }
    const elsewhere = usedElsewhere ? Number(usedElsewhere(url)) || 0 : 0;
    library = library.filter((u) => u.url !== url);
    blobs.delete(url);
    if (usesHere(url)) {
      endEdit();
      stopDrag();
      remember();
      card.items = items().filter((it) => !(it.t === 'image' && it.url === url));
      sel = -1;
      many = [];
      pop = null;
      cut = null;
      renderStage();
    }
    onRemoveUpload?.({ ...img });
    // 다른 카드에서 쓴 것까지 지웠으면 되돌리기 기록을 비운다(이 카드만 되살아나면 그림의 앞뒤가 맞지 않는다).
    if (elsewhere) { past = []; future = []; }
    renderBar();
    renderPanel();
    onChange();
  }

  async function onPhotoPicked() {
    const picked = [...(fileInput.files || [])];
    fileInput.value = '';
    if (!picked.length || busy || !card) return;
    const keep = libraryOn();
    const target = card;
    busy = true;
    renderPanel();
    let failed = 0;        // 올리지 못한 파일 수
    let full = false;      // 목록이 꽉 차서 남은 파일을 올리지 않았다
    let listed = 0;        // 카드에 사진이 꽉 차서 목록에만 넣은 파일 수
    // 목록을 쓰면 여러 장을 한꺼번에 고를 수 있다(차례로 올린다). 안 쓰면 한 장.
    for (const file of keep ? picked : picked.slice(0, 1)) {
      if (keep && keepUploads().length >= settings().maxUploads) { full = true; break; }
      try {
        const made = await shrinkImage(file, { max: settings().photoEdge, alpha: true });
        const img = await store(made);
        const photo = newPhoto({ ...img, ratio: made.ratio });
        if (!photo) throw new Error('올린 사진의 주소를 쓸 수 없어요(configure 의 cleanImage 가 받지 않는 주소)');
        if (keep && !library.some(sameUrl(photo.url))) library.push(photo.path ? { url: photo.url, path: photo.path } : { url: photo.url });
        // 카드에 자리가 있으면 바로 놓는다. 사진이 꽉 찬 카드라면 목록에만 둔다(올린 것은 남는다).
        if (card === target) {
          if (!keep || photosHere() < settings().maxPhotos) {
            // The photo may finish while a user is choosing a material tab or
            // entering a video URL. Preserve that newer keyboard task.
            const focused = document.activeElement;
            const keepUploadFocus = panel.contains(focused) && (focused === youtubeInput || !!focused?.dataset.uploadTab);
            add(photo, { focus: !keepUploadFocus });
          }
          else listed += 1;
        }
      } catch (ex) {
        console.error(ex);
        failed += 1;
      }
    }
    busy = false;
    renderPanel();
    if (keep && card) onChange();
    if (failed) notify(picked.length > 1 ? `${failed}개는 올리지 못했어요. PNG나 JPG 그림 파일인지 확인하고 다시 해 봐요.` : '사진을 올리지 못했어요. PNG나 JPG 그림 파일인지 확인하고 다시 해 봐요.', 4000);
    else if (full) notify(`올린 파일은 ${settings().maxUploads}개까지 둘 수 있어요. 안 쓰는 파일을 지우고 다시 올려요.`, 4500);
    else if (listed) notify(`사진은 카드 한 장에 ${settings().maxPhotos}장까지라, 올린 파일 목록에만 넣었어요.`, 4500);
  }

  // ---------- 배경 제거 ----------
  // 🤖 자동(AI): 사진의 주인공(사람 · 동물 · 사물)을 찾아 경계를 사진에 맞춰 다듬는다(segment.js + cutout.js).
  // 🎨 단색 배경: 가장자리와 이어진 배경색을 지운다(그림 · 로고 · 흰 종이). 둘 다 가장자리 색을 걷어 내고, 지우개 · 살리개로 손본다.
  async function openCut() {
    const it = cur();
    if (!it || it.t !== 'image') return;
    endEdit();
    pop = 'cut';
    const job = {
      url: it.url, state: 'loading', mode: 'ai', tol: TOLERANCE.start, inside: false, edge: 0.5, soft: 0.3,
      strokes: [], brush: null, brushSize: 0.06, original: false,
      ai: { state: 'idle', mask: null, size: 0, progress: 0 }, base: null, baseKey: '',
    };
    cut = job;
    renderBar();
    try {
      job.blob = await blobOf(it);
      job.prev = await readPixels(job.blob, 420);
      const { canvas, pixels } = job.prev;
      // 가장자리가 거의 한 가지 색이면(흰 종이의 그림 · 로고) 단색 방식이 더 깔끔하다
      if (plainBorder(pixels.data, canvas.width, canvas.height) > 0.9) job.mode = 'color';
      job.state = 'ready';
    } catch (ex) {
      console.error(ex);
      job.state = 'error';
    }
    if (cut !== job) return;
    renderBar();
    if (job.state === 'ready' && job.mode === 'ai') runAi(job);
  }
  async function runAi(job) {
    if (job.ai.state === 'loading' || job.ai.state === 'ready') return;
    job.ai.state = 'loading';
    if (cut === job) renderBar();
    try {
      const { findSubject } = await import('./segment.js');
      const found = await findSubject(await bitmapOf(job), (f) => {
        job.ai.progress = f;
        const note = document.querySelector('.fe-cut-ai');
        if (note && cut === job) note.textContent = aiNote(job);
      });
      job.ai = { state: 'ready', mask: found.mask, size: found.size, progress: 1 };
      job.baseKey = '';
    } catch (ex) {
      console.error(ex);
      job.ai.state = 'error';
    }
    if (cut === job) renderBar();
  }
  // 모델에는 원래 사진을 그대로 준다(미리보기 크기로 줄인 것보다 조금 더 정확하다)
  async function bitmapOf(job) {
    try { return await createImageBitmap(job.blob, { imageOrientation: 'from-image' }); } catch { return job.prev.canvas; }
  }
  const aiNote = (job) => (job.ai.state === 'error' ? 'AI 를 불러오지 못했어요. 인터넷을 확인하거나 "단색 배경"으로 해 봐요.'
    : job.ai.progress < 1 ? `AI 가 주인공을 찾을 준비를 해요… ${Math.round(job.ai.progress * 100)}% (처음 한 번만 받아요)` : 'AI 가 주인공을 찾는 중이에요…');

  // 미리보기 크기 · 저장 크기 모두 같은 방법으로: 거친 알파 → 1단계(막대 바뀔 때만) → 2단계(붓질)
  function roughAlpha(job, pixels, w, h) {
    if (job.mode === 'ai') return job.ai.mask ? resizeMask(job.ai.mask, job.ai.size, job.ai.size, w, h) : null;
    return colorAlpha(pixels.data, w, h, { tolerance: job.tol, inside: job.inside });
  }
  const cutOpts = (job) => ({ edge: job.edge, soft: job.soft, refine: job.mode === 'ai', clean: job.mode === 'ai' });
  function cutResult(job, pixels, w, h, { preview = false } = {}) {
    const key = [job.mode, job.tol, job.inside, job.edge, job.soft, job.ai.state].join('|');
    let base = preview && job.baseKey === key ? job.base : null;
    if (!base) {
      const rough = roughAlpha(job, pixels, w, h);
      if (!rough) return null;
      base = prepareAlpha(pixels.data, w, h, rough, cutOpts(job));
      if (preview) { job.base = base; job.baseKey = key; }
    }
    return finishCutout(pixels.data, w, h, base, { strokes: job.strokes });
  }
  // 미리보기: 막대를 끌거나 붓질하는 동안 계속 다시 그린다. 지워지는 넓이의 비율을 돌려준다(못 그리면 -1).
  function paintCut() {
    if (!cut || !cut.prev) return -1;
    const { canvas, ctx, pixels } = cut.prev;
    if (cut.original) { ctx.putImageData(pixels, 0, 0); return -1; }
    const res = cutResult(cut, pixels, canvas.width, canvas.height, { preview: true });
    if (!res) { ctx.putImageData(pixels, 0, 0); return -1; }
    ctx.putImageData(new ImageData(res.data, canvas.width, canvas.height), 0, 0);
    return res.cleared;
  }
  async function applyCut() {
    const job = cut;
    if (!job || job.state !== 'ready') return;
    if (job.mode === 'ai' && job.ai.state !== 'ready') return;
    job.state = 'saving';
    renderBar();
    try {
      const { canvas, ctx, pixels } = await readPixels(job.blob, PHOTO_EDGE);
      const res = cutResult(job, pixels, canvas.width, canvas.height);
      if (!res || res.cleared < 0.005 || res.cleared > 0.98) {
        notify(!res || res.cleared < 0.005 ? '지울 배경을 찾지 못했어요. 가장자리 막대를 옮기거나 지우개로 지워 보세요.' : '사진이 거의 다 지워져요. 가장자리 막대를 옮기거나 살리개로 살려 보세요.', 4500);
        job.state = 'ready';
        if (cut === job) renderBar();
        return;
      }
      ctx.putImageData(new ImageData(res.data, canvas.width, canvas.height), 0, 0);
      const img = await store(await canvasToPng(canvas));
      // 올리는 사이에 다른 것을 골랐으면 그만둔다(올린 파일은 다음에 갤러리에 올릴 때 정리된다).
      if (cut !== job || cur()?.url !== job.url) return;
      cut = null;
      change({ path: img.path, url: img.url }, { keepPop: false });
      if (cur()?.url !== img.url) throw new Error('올린 그림의 주소를 쓸 수 없어요');
      notify('배경을 지웠어요. 마음에 안 들면 실행 취소를 눌러요.', 3500);
    } catch (ex) {
      console.error(ex);
      notify('배경을 지우지 못했어요. 잠시 뒤에 다시 해 봐요.', 4000);
      job.state = 'ready';
      if (cut === job) renderBar();
    }
  }

  // ---------- 작은 부품들 ----------
  // 도구 막대의 단추. 아이콘만 있는 단추는 name 으로 접근 이름을 준다(title 은 마우스를 올렸을 때의 풍선 도움말).
  // 칸을 펼치는 단추(has-pop)에는 작은 ▾ 를 붙여, 누르면 바로 하는 단추와 구별되게 한다(아이콘만 있는 단추는 빼고).
  const tb = (label, onClick, { on = null, title = '', name = '', disabled = false, cls = '' } = {}) => el('button', {
    class: `fe-tb${on ? ' on' : ''}${cls ? ` ${cls}` : ''}`, type: 'button', title: title || name || null, 'aria-label': name || null, disabled,
    'aria-pressed': on == null ? null : String(!!on), onClick,
  }, label, /\bhas-pop\b/.test(cls) && !/\bicon\b/.test(cls) ? icon('chev', 'fe-chev') : null);
  const toggle = (name) => { dismissCrop();pop = pop === name ? null : name; if (pop !== 'cut') cut = null; renderBar(); keepKeys(); };
  const popBtn = (label, name, opts = {}) => tb(label, () => toggle(name), { ...opts, on: pop === name, cls: 'has-pop' });
  // 아이콘 + 이름 단추의 속. 이름(.fe-lbl)은 좁은 도구 막대에서 감춰지므로, 단추에는 늘 name(aria-label)을 함께 준다.
  const lab = (pic, text) => [icon(pic), el('span', { class: 'fe-lbl', text })];
  const pick = (pic, text, name, opts = {}) => popBtn(lab(pic, text), name, { name: text, ...opts });
  const pbtn = (label, onClick, extra = {}) => el('button', { class: 'fe-btn', type: 'button', onClick, ...extra }, label);

  function swatches(value, onPick, { none = false, noneName = '없음', label }) {
    const custom = el('input', {
      class: 'fe-color', type: 'color', value: value || '#1c7ed6', 'aria-label': `${label} 직접 고르기`, title: '다른 색 고르기',
      onChange: () => {paletteAction({type:'recent',color:custom.value});onPick(custom.value);},
    });
    return el('div', { class: 'fe-color-picker' },eyedropper(value,onPick,custom),el('div', { class: 'fe-swatches', role: 'group', 'aria-label': label },
      none ? el('button', { class: `fe-sw none${value ? '' : ' on'}`, type: 'button', 'aria-pressed': String(!value), title: noneName, 'aria-label': noneName, onClick: () => onPick('') }, icon('close')) : null,
      ...COLORS.map((c) => {
        const b = el('button', {
          class: `fe-sw${value === c.hex ? ' on' : ''}`, type: 'button', 'aria-label': c.name, 'aria-pressed': String(value === c.hex), title: c.name,
          onClick: () => {paletteAction({type:'recent',color:c.hex});onPick(c.hex);},
        });
        b.style.background = c.hex;
        return b;
      }), custom),savedColors(value,onPick));
  }

  // 막대: 끄는 동안에는 카드만 바꾸고(기록은 처음 한 번), 놓으면 알린다.
  function slider(label, value, { min, max, step }, apply, unit = '') {
    let started = false;
    const show = (v) => `${Math.round(v)}${unit}`;
    const at = Math.min(max, Math.max(min, value));       // 범위를 벗어난 값은 범위의 끝으로 보여 준다(숫자와 손잡이의 자리가 어긋나지 않게)
    const out = el('span', { class: 'fe-num', text: show(at) });
    const input = el('input', {
      type: 'range', min: String(min), max: String(max), step: String(step), value: String(at), 'aria-label': label,
      onInput: () => {
        if (!cur()) return;
        if (!started) { started = true; remember(); }
        const next = cleanItem(apply(cur(), Number(input.value)), { keepSpaces: true });
        if (next) put(next);
        out.textContent = show(Number(input.value));
      },
      onChange: () => { started = false; renderBar(); onChange(); },
    });
    return el('label', { class: 'fe-slider' }, el('span', { text: label }), input, out);
  }

  function stickerPicker(onPick) {
    const grid = el('div', { class: 'fe-stickers' });
    const search = el('input', { class: 'fe-search', placeholder: '낱말로 찾기 (예: 비밀번호, 저작권)', 'aria-label': '그래픽 찾기', onInput: () => fill() });
    function fill() {
      const found = searchStickers(search.value);
      grid.replaceChildren(...(found.length
        ? found.map((s) => el('button', { class: 'fe-sticker', type: 'button', 'aria-label': s.k.split(' ')[0], title: s.k, onClick: () => onPick(s.e) }, s.e))
        : [el('p', { class: 'fe-note', text: '찾는 그래픽이 없어요. 다른 낱말로 찾아봐요.' })]));
    }
    fill();
    return el('div', { class: 'fe-picker' }, search, grid,
      el('p', { class: 'fe-note', text: '기기에 들어 있는 그림(이모지)이라 누구나 자유롭게 쓸 수 있어요.' }));
  }

  // 요소의 기본 색이 지금 배경과 똑같으면(남색 배경에 남색 화살표, 노란 배경에 노란 별) 놓아도 보이지 않는다.
  // 그때는 그 배경의 강조색(없으면 글자색)으로 놓는다. 다른 때에는 기본 색 그대로({}).
  function visibleColor(shape) {
    const b = backgroundOf(card.bg);
    if (newShape(shape).color !== String(b.bg).toLowerCase()) return {};
    return { color: b.accent && String(b.accent).toLowerCase() !== String(b.bg).toLowerCase() ? b.accent : b.ink };
  }

  // 도형의 채우기: 색을 고르면 그 색으로 채우고, "없음"을 고르면 속을 비운다(테두리만 남는다).
  // 테두리가 없는 도형의 속을 비우면 보이지 않게 되니, 그때는 지금 색으로 테두리를 둘러 준다.
  function fillWith(hex) {
    const c = cur();
    if (hex) change({ color: hex, hollow: false });
    else change(c.line ? { hollow: true } : { hollow: true, line: EDGE.base, lc: c.color });
  }
  // 도형의 테두리: 색을 고르면 그 색으로 두르고(처음이면 기본 굵기로), "없음"을 고르면 지운다.
  // 속이 빈 도형의 테두리를 지우면 역시 보이지 않게 되니, 그때는 테두리 색으로 다시 채운다.
  function edgeWith(hex) {
    const c = cur();
    if (hex) change({ line: c.line || EDGE.base, lc: hex });
    else change(c.hollow ? { line: 0, color: c.lc } : { line: 0 });
  }

  // 그림 고르기: 그림 묶음(art.js)을 낱말과 묶음으로 찾는다. 묶음은 처음 열 때 불러온다. '기기 이모지'는 예전 그래픽(이모지)이다.
  // onPick 은 { art } 또는 { emoji } 를 받는다.
  function artPicker(onPick) {
    const PAGE = 60;
    let limit = PAGE;
    const grid = el('div', { class: 'fe-arts' });
    const note = el('p', { class: 'fe-note' });
    const more = el('button', { class: 'fe-btn fe-more', type: 'button', text: '더 보기', onClick: () => { limit += PAGE * 2; fill(); } });
    const search = el('input', {
      class: 'fe-search', value: artQuery, placeholder: '낱말로 찾기 (예: 공부, 동물, 날씨, 사람)', 'aria-label': '그림 찾기',
      onInput: () => { artQuery = search.value; limit = PAGE; fill(); },
    });
    const packs = [{ id: '', name: '전체' }, ...ART_PACKS, { id: 'emoji', name: '기기 이모지' }];
    const chips = el('div', { class: 'fe-chips', role: 'group', 'aria-label': '그림 묶음' }, ...packs.map((p) => el('button', {
      class: 'fe-chip', type: 'button', 'aria-pressed': String(artFrom === p.id), dataset: { pack: p.id },
      onClick: () => {
        artFrom = p.id; limit = PAGE;
        for (const b of chips.children) b.setAttribute('aria-pressed', String(b.dataset.pack === artFrom));
        fill();
      },
    }, p.name)));
    function fill() {
      if (artFrom === 'emoji') {
        const found = searchStickers(search.value);
        grid.replaceChildren(...(found.length
          ? found.map((s) => el('button', { class: 'fe-sticker', type: 'button', 'aria-label': s.k.split(' ')[0], title: s.k, onClick: () => onPick({ emoji: s.e }) }, s.e))
          : [el('p', { class: 'fe-note', text: '찾는 이모지가 없어요. 다른 낱말로 찾아봐요.' })]));
        more.hidden = true;
        note.textContent = '기기에 들어 있는 이모지예요. 기기마다 모양이 조금 달라요.';
        return;
      }
      if (!artReady()) {
        grid.replaceChildren(el('p', { class: 'fe-note', text: '그림을 불러오는 중이에요…' }));
        more.hidden = true;
        loadArt().then(() => { if (grid.isConnected) fill(); })
          .catch(() => { if (grid.isConnected) grid.replaceChildren(el('p', { class: 'fe-note', text: '그림을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.' })); });
        return;
      }
      const found = searchArt(search.value, artFrom);
      grid.replaceChildren(...(found.length
        ? found.slice(0, limit).map((a) => el('button', {
          class: `fe-art pk-${a.id.slice(0, 2)}`, type: 'button', title: a.name, 'aria-label': a.name, dataset: { art: a.id },
          html: artSvg(a.id, { fit: 'meet' }), onClick: () => onPick({ art: a.id }),
        }))
        : [el('p', { class: 'fe-note', text: '찾는 그림이 없어요. 다른 낱말로 찾아봐요.' })]));
      more.hidden = found.length <= limit;
      const pack = ART_PACKS.find((p) => p.id === artFrom);
      note.textContent = pack ? `${pack.credit} · 누구나 자유롭게 쓸 수 있는 그림이에요.` : '모두 누구나 자유롭게 쓸 수 있는 그림이에요(MIT · CC0). 선 아이콘과 픽셀은 색을 바꿀 수 있어요.';
    }
    fill();
    return el('div', { class: 'fe-picker fe-artpicker' }, search, chips, grid, more, note);
  }

  // 도형·꾸밈 요소 고르기: 분류별로 나눠 보여 준다. 작은 그림은 놓일 때와 같은 그림·같은 색이다(render.js 의 shapeThumb).
  function shapePicker(onPick) {
    return SHAPE_GROUPS.flatMap((g) => [
      el('div', { class: 'fe-head', text: g.name }),
      el('div', { class: 'fe-shapes', role: 'group', 'aria-label': `${g.name} 고르기` },
        ...SHAPES.filter((k) => k.group === g.id).map((k) => el('button', {
          class: 'fe-shape', type: 'button', title: `${k.name} 넣기`, dataset: { shape: k.id }, onClick: () => onPick(k.id),
        }, shapeThumb(k.id), el('small', { text: k.name })))),
    ]);
  }

  // ---------- 도구 막대(카드 위): 고른 요소에 따라 바뀐다 ----------
  function renderBar() {
    if (!card) { bar.replaceChildren(); popBox.hidden = true; return; }
    // 글자판으로 글꼴 목록이나 막대를 움직이던 중이면, 다시 그린 뒤에도 그 칸에 머물게 한다.
    const at = document.activeElement;
    const back = toolbar.contains(at) ? (at.classList.contains('fe-font') ? '.fe-font' : at.type === 'range' ? '.fe-pop input[type=range]' : null) : null;
    drawBar();
    tidySeps();
    if (back) toolbar.querySelector(back)?.focus({ preventScroll: true });
  }
  // 도구 막대가 두 줄이 되면 구분선이 줄의 맨 끝이나 맨 앞에 걸릴 수 있다. 그런 선은 자리만 두고 보이지 않게 한다(자리는 그대로라 줄이 다시 바뀌지 않는다).
  function tidySeps() {
    const kids = [...bar.querySelectorAll('.fe-sep, .fe-tb, .fe-font, .fe-size, .fe-hint')].filter((n) => !n.closest('.fe-size') || n.classList.contains('fe-size'));
    const mid = (n) => { const r = n.getBoundingClientRect(); return r.top + r.height / 2; };
    kids.forEach((n, i) => {
      if (!n.classList.contains('fe-sep')) return;
      const r = n.getBoundingClientRect();
      const [before, after] = [kids[i - 1], kids[i + 1]];
      const alone = !before || !after || mid(before) < r.top || mid(before) > r.bottom || mid(after) < r.top || mid(after) > r.bottom;
      n.classList.toggle('lone', alone);
    });
  }
  function drawBar() {
    if(cropJob){drawCropBar();return;}
    const it = cur();
    const always = [
      tb(icon('undo'), undo, { title: '실행 취소 (Ctrl+Z)', name: '실행 취소', disabled: !past.length, cls: 'icon undo' }),
      tb(icon('redo'), redo, { title: '다시 실행 (Ctrl+Y / Ctrl+Shift+Z)', name: '다시 실행', disabled: !future.length, cls: 'icon redo' }),
      el('span', { class: 'fe-sep' }),
    ];
    if (many.length) {
      const group = (name, ...kids) => el('span', { class: 'fe-group', role: 'group', 'aria-label': name }, ...kids);
      bar.replaceChildren(...always,
        el('span', { class: 'fe-count', role: 'status' }, icon('selectAll'), `${many.length}개 고름`),
        group('배치', pick('align', '정렬', 'malign', { title: '서로에게 맞춰 정렬하고 간격을 고르게' }),
          isGroup()
            ? tb(lab('ungroup', '그룹 해제'), ungroupMany, { title: '그룹 해제 (Ctrl+Shift+G)', name: '그룹 해제', cls: 'grouping' })
            : tb(lab('group', '그룹'), groupMany, { title: '그룹으로 묶기 (Ctrl+G): 한 번 누르면 함께 골라져요', name: '그룹으로 묶기', cls: 'grouping' })),
        el('span', { class: 'fe-sep' }),
        many.length === 2 && many.every((i) => items()[i].t !== 'link') ? group('잇기', tb(lab('right', '연결선'), linkMany, { title: '고른 두 조각을 연결선(화살표)으로 이어요. 조각을 옮기면 선이 따라와요', name: '연결선으로 잇기', cls: 'linking' })) : null,
        many.length === 2 ? el('span', { class: 'fe-sep' }) : null,
        group('작업',
          tb(icon('duplicate'), copyMany, { title: '모두 복제 (Ctrl+D)', name: '모두 복제', cls: 'icon dup' }),
          tb(icon('lock'), lockMany, { title: '모두 잠금', name: '모두 잠금', cls: 'icon lock' })),
        el('span', { class: 'fe-sep' }),
        tb(icon('trash'), remove, { title: `${many.length}개 삭제 (Delete)`, name: `${many.length}개 삭제`, cls: 'icon del' }));
      renderManyPop();
      return;
    }
    if (!it) {
      // 아무것도 고르지 않았을 때(카드의 빈 곳을 눌렀을 때): 카드에 할 일인 배경색을 바로 보인다.
      const ink = el('span', { class: 'fe-ink' });
      ink.style.background = backgroundOf(card.bg).bg;
      bar.replaceChildren(...always,
        tb([icon('palette'), el('span', { class: 'fe-lbl', text: '바탕색' }), ink], () => toggle('pagebg'), {
          title: '카드의 바탕색 바꾸기', name: '바탕색', on: pop === 'pagebg', cls: 'has-pop pagebg',
        }),
        eyedropper(backgroundOf(card.bg).bg,setBg),
        el('span', { class: 'fe-sep' }),
        el('span', { class: 'fe-hint', text: items().length
          ? '조각을 누르면 꾸미는 도구가 나와요 · Shift 누르기나 빈 곳 끌기로 여럿 고르기' : '도구 칸에서 틀이나 글을 넣어 시작해요.' }));
      const body = pop === 'pagebg' ? [el('div', { class: 'fe-poshead', text: '바탕색' }), bgPicker(), el('p', { class: 'fe-note', text: bgNote })] : null;
      popBox.hidden = !body;
      popBox.replaceChildren(...(body ? [
        el('button', { class: 'fe-pop-close', type: 'button', 'aria-label': '닫기', title: '닫기 (Esc)', onClick: () => toggle(pop) }, icon('close')), ...body] : []));
      return;
    }
    if (it.lock) {
      bar.replaceChildren(...always,
        el('span', { class: 'fe-hint' }, icon('lock'), `잠근 조각이에요 (${itemLabel(it)})`),
        tb([icon('unlock'), '잠금 해제'], () => change({ lock: false }), { cls: 'unlock' }));
      popBox.hidden = true;
      popBox.replaceChildren();
      return;
    }

    const own = [];
    if (it.t === 'text') {
      const choices = fonts();
      const font = el('select', { class: 'fe-font', 'aria-label': '글꼴', title: '글꼴', onChange: () => {
        if (font.value) change({ font: font.value, typeface: undefined });
      } },
        it.typeface ? el('option', { value: '', text: `${it.typeface} (원본 글꼴)` }) : null,
        ...choices.map((f) => {
          const o = el('option', { value: f.id, text: f.name });
          const family = fontFamilyOf(f.id);
          if (family && fontReady(f.id)) o.style.fontFamily = `"${family}", sans-serif`;
          return o;
        }),
        choices.some((f) => f.id === it.font) ? null : el('option', { value: it.font, text: '(지금은 고를 수 없는 글꼴)' }));
      font.value = it.typeface ? '' : it.font;
      const size = sizeRange(it);
      const ink = el('span', { class: 'fe-ink' });
      ink.style.background = it.color;
      // 단추가 하는 일은 "누르는 때"의 요소(cur())로 정한다. 도구 막대를 그릴 때 잡아 둔 it 는 글을 치거나 화살표로 옮긴 뒤에는 옛것이라,
      // 그것을 통째로 넣으면 방금 쓴 글이 사라진다. 그래서 바뀌는 값만 넘긴다.
      const step = (d) => change({ size: Math.min(size.max, Math.max(size.min, cur().size + d)) });
      own.push(
        font,
        el('span', { class: 'fe-size', role: 'group', 'aria-label': '글자 크기' },
          tb(icon('minus'), () => step(-1), { name: '글자 작게', cls: 'icon smaller' }),
          el('span', { class: 'fe-num', text: String(Math.round(it.size * 10) / 10) }),
          tb(icon('plus'), () => step(1), { name: '글자 크게', cls: 'icon bigger' })),
        tb(el('span', { class: 'fe-a' }, 'A', ink), () => toggle('color'), { name: '글자 색', on: pop === 'color', cls: 'has-pop icon color' }),
        tb('B', () => change({ bold: !cur().bold }), { on: it.bold, title: '굵게 (Ctrl+B)', name: '굵게', cls: 'icon b' }),
        tb('I', () => change({ italic: !cur().italic }), { on: it.italic, name: '기울임', cls: 'icon i' }),
        tb('U', () => change({ under: !cur().under }), { on: it.under, name: '밑줄', cls: 'icon u' }),
        tb(icon(ALIGN_ICON[it.align]), () => change({ align: NEXT_ALIGN[cur().align] }), {
          title: `정렬: ${ALIGN_NAME[it.align]} (누를 때마다 왼쪽 → 가운데 → 오른쪽)`, name: `정렬: ${ALIGN_NAME[it.align]}`, cls: 'icon align',
        }),
        pick('highlight', '바탕색', 'bgc', { title: '글 뒤에 색 깔기' }),
        pick('border', '효과', 'textfx', { title: '줄 간격 · 글 테두리 · 그림자' }),
        tb(icon('pencil'), () => startEdit(true), { title: '글 고치기 (Enter): 카드에서 글을 두 번 눌러도 돼요', name: '글 고치기', on: editing === sel, cls: 'icon edit' }));
    } else if (it.t === 'shape') {
      // 면으로 된 도형은 채우기·테두리를 따로 정한다(네모·둥근 네모는 모서리도). 선·체크처럼 가는 꾸밈은 색만 바꾼다.
      const edge = canEdge(it);
      const ink = el('span', { class: `fe-ink dot${it.hollow ? ' none' : ''}` });
      if (!it.hollow) ink.style.background = it.color;
      own.push(tb([icon(edge ? 'fill' : 'palette'), el('span', { class: 'fe-lbl', text: edge ? '채우기' : '색' }), ink], () => toggle('color'), {
        title: edge ? '도형을 채우는 색' : '도형 색', name: edge ? '채우기 색' : '도형 색', on: pop === 'color', cls: 'has-pop color',
      }));
      if (edge) {
        const ring = el('span', { class: `fe-ink dot ring${it.line ? '' : ' none'}` });
        if (it.line) ring.style.borderColor = it.lc;
        own.push(tb([icon('border'), el('span', { class: 'fe-lbl', text: '테두리' }), ring], () => toggle('edge'), { title: '테두리 색과 굵기', name: '테두리', on: pop === 'edge', cls: 'has-pop edge' }));
      }
      if (canRound(it)) own.push(pick('corner', '모서리', 'corner', { title: '모서리를 둥글게' }));
      if (isLine(it)) own.push(pick('thick', '굵기', 'thick', { title: '선의 굵기' }));
    } else if (it.t === 'emoji') {
      own.push(pick('swap', '바꾸기', 'swap', { title: '다른 그래픽으로 바꾸기' }));
    } else if (it.t === 'art') {
      // 그림 묶음의 그림: 한 가지 색으로 그린 것(선 아이콘 · 픽셀)만 색을 바꾼다. 컬러 그림과 사람은 원래 색 그대로다.
      if (it.color) {
        const ink = el('span', { class: 'fe-ink dot' });
        ink.style.background = it.color;
        own.push(tb([icon('palette'), el('span', { class: 'fe-lbl', text: '색' }), ink], () => toggle('color'), { title: '그림 색', name: '그림 색', on: pop === 'color', cls: 'has-pop color' }));
      }
    } else if (it.t === 'link') {
      // 연결선: 색 · 굵기 · 화살표(끝 · 양쪽 · 없음) · 점선 · 방향 바꾸기. 자리는 잇는 두 조각이 정한다.
      const ink = el('span', { class: 'fe-ink dot' });
      ink.style.background = it.color;
      own.push(tb([icon('palette'), el('span', { class: 'fe-lbl', text: '색' }), ink], () => toggle('color'), { title: '선 색', name: '선 색', on: pop === 'color', cls: 'has-pop color' }),
        pick('thick', '굵기', 'lthick', { title: '선의 굵기' }),
        pick('right', '화살표', 'arrow', { title: '선 꾸미기: 모양 모음 · 화살표 머리 · 점선 · 곧게/둥글게/꺾어서 · 붙는 곳' }),
        pick('text', '선 위 글', 'llabel', { title: '선 위에 짧은 글 붙이기 (예: 예 · 아니오 · 다음). 선을 두 번 눌러도 돼요' }));
    } else if (it.t === 'yt') {
      // 유튜브 영상: 발표할 때 누르면 그 자리에서 틀어진다. 시작 시각을 정하고, 유튜브에서 미리 볼 수 있다.
      own.push(
        pick('play', it.start ? `${ytTime(it.start)}부터` : '재생 설정', 'ytstart', { title: '어디서부터, 언제 틀지 정해요' }),
        tb(lab('screen', '유튜브에서 보기'), () => window.open(ytWatch(it.yt, it.start || 0), '_blank', 'noopener'), { title: '새 탭에서 이 영상을 열어요', name: '유튜브에서 보기', cls: 'yt-open' }));
    } else {
      own.push(
        tb(lab('crop', '자르기'), openCrop, {title:'사진 위에서 바로 잘라요 · 사진을 두 번 눌러도 열려요',name:'이미지 자르기',cls:'crop'}),
        tb(lab('eraser', '배경 제거'), () => (pop === 'cut' ? toggle('cut') : openCut()), { on: pop === 'cut', title: '사진의 배경을 투명하게 지워요', name: '배경 제거', cls: 'has-pop cut' }),
        pick('mask', '모양', 'mask', { title: '사진의 테두리 모양(동그라미 · 둥근 네모 …)' }),
        pick('pencil', it.alt ? '설명 ✓' : '설명', 'alt', { title: '그림 설명: 화면을 읽어 주는 프로그램과 PPTX 에 쓰여요' }),
        tb(lab('cover', '배경으로'), toBackground, { title: '카드에 꽉 차게 키워 맨 뒤에 깔아요', name: '배경으로 깔기', cls: 'cover' }));
    }

    // 세 묶음으로 나눈다: 스타일(종류마다 다른 것 + 투명도) | 배치(크기 · 뒤집기 · 위치) | 작업(복제 · 잠금), 그리고 삭제는 따로.
    // 단추의 규칙: 글자 단추는 칸을 펼치고(색은 지금 색을 함께 보여 준다), 아이콘 단추는 누르면 바로 한다.
    const group = (name, ...kids) => el('span', { class: 'fe-group', role: 'group', 'aria-label': name }, ...kids.filter(Boolean));
    bar.replaceChildren(...always,
      group('스타일', ...own, colorTarget()?eyedropper(colorTarget().value,colorTarget().apply):null, pick('opacity', '투명도', 'op', { title: '투명도: 낮출수록 비쳐 보여요' })),
      el('span', { class: 'fe-sep' }),
      group('배치',
        it.t === 'text' || it.t === 'link' ? null : pick('resize', '크기', 'size', { title: '조각의 크기 (가로세로 비율은 그대로)' }),      // 텍스트는 − 숫자 + 로 바꾼다
        it.t === 'text' || it.t === 'yt' || it.t === 'link' ? null : pick('flipH', '뒤집기', 'flip', { title: '좌우·상하 뒤집기, 바로 세우기' }),
        pick('layers', '위치', 'pos', { title: '겹치는 순서와 페이지 정렬' })),
      el('span', { class: 'fe-sep' }),
      group('작업',
        // 한 조각을 고르면: 이 조각에서 다른 조각으로 화살표 잇기(누른 뒤 닿을 조각을 누른다)
        it.t !== 'link' && items().filter((x) => x.t !== 'link').length >= 2 ? tb(lab('right', '선 잇기'), () => startLinking(sel), { title: '이 조각에서 다른 조각으로 화살표를 이어요: 누른 뒤 이을 조각(또는 새 조각을 놓을 빈 곳)을 눌러요', name: '선 잇기', cls: 'linking' }) : null,
        tb(icon('duplicate'), copy, { title: '복제: 똑같은 것을 하나 더 (Ctrl+D)', name: '복제', cls: 'icon dup' }),
        tb(icon('lock'), () => change({ lock: true }, { keepPop: false }), { title: '잠금: 실수로 움직이지 않게 해요', name: '잠금', cls: 'icon lock' })),
      el('span', { class: 'fe-sep' }),
      tb(icon('trash'), remove, { title: '삭제 (Delete)', name: '삭제', cls: 'icon del' }));
    renderPop(it);
  }

  // 여럿을 골랐을 때 펼치는 칸: 서로에게 맞춰 정렬 · 간격을 고르게 · 겹치는 순서.
  function renderManyPop() {
    const body = pop === 'malign' ? [
      el('div', { class: 'fe-poshead', text: '서로에게 맞춰 정렬' }),
      el('div', { class: 'fe-grid three' },
        ...[['left', '왼쪽', 'pageL'], ['center', '가운데', 'pageC'], ['right', '오른쪽', 'pageR'], ['top', '위', 'pageT'], ['middle', '중간', 'pageM'], ['bottom', '아래', 'pageB']]
          .map(([where, name, pic]) => pbtn([icon(pic), name], () => arrangeMany('align', where), { class: 'fe-btn stack', dataset: { align: where } }))),
      el('div', { class: 'fe-poshead', text: '간격을 고르게' }),
      el('div', { class: 'fe-grid two' },
        pbtn([icon('distH'), '가로 간격'], () => arrangeMany('spread', 'x'), { disabled: many.length < 3, dataset: { spread: 'x' } }),
        pbtn([icon('distV'), '세로 간격'], () => arrangeMany('spread', 'y'), { disabled: many.length < 3, dataset: { spread: 'y' } })),
      el('p', { class: 'fe-note', text: many.length < 3 ? '간격을 고르게 하려면 셋 이상 골라요.' : '양 끝의 것은 그대로 두고 사이의 빈칸을 똑같이 맞춰요.' }),
      el('div', { class: 'fe-poshead', text: '겹치는 순서' }),
      el('div', { class: 'fe-grid two' },
        pbtn([icon('toFront'), '맨 앞으로'], () => orderMany('top')),
        pbtn([icon('toBack'), '맨 뒤로'], () => orderMany('bottom'))),
    ] : null;
    popBox.hidden = !body;
    popBox.replaceChildren(...(body ? [
      el('button', { class: 'fe-pop-close', type: 'button', 'aria-label': '닫기', title: '닫기 (Esc)', onClick: () => toggle(pop) }, icon('close')),
      ...body] : []));
  }

  // 도구 막대 아래에 펼쳐지는 칸.
  function renderPop(it) {
    let body = null;
    if (pop === 'color' && canEdge(it)) {
      body = [el('div', { class: 'fe-poshead', text: '채우기 색' }),
        swatches(it.hollow ? '' : it.color, fillWith, { none: true, noneName: '채우기 없음 (테두리만)', label: '채우기 색' })];
    } else if (pop === 'color' && it.t !== 'image' && it.t !== 'emoji' && it.t !== 'yt' && (it.t !== 'art' || it.color)) {
      const label = it.t === 'text' ? '글자 색' : it.t === 'art' ? '그림 색' : it.t === 'link' ? '선 색' : '도형 색';
      body = [el('div', { class: 'fe-poshead', text: label }), swatches(it.color, (hex) => change({ color: hex }), { label })];
    } else if (pop === 'edge' && canEdge(it)) {
      body = [el('div', { class: 'fe-poshead', text: '테두리 색' }),
        swatches(it.line ? it.lc : '', edgeWith, { none: true, noneName: '테두리 없음', label: '테두리 색' }),
        it.line
          ? slider('굵기', Math.round(it.line / EDGE.step), { min: 1, max: Math.round(EDGE.max / EDGE.step), step: 1 }, (c, v) => ({ ...c, line: v * EDGE.step }))
          : el('p', { class: 'fe-note', text: '색을 고르면 테두리가 생겨요.' })];
    } else if (pop === 'corner' && canRound(it)) {
      body = [slider('둥글기', cornerOf(it), { min: 0, max: 100, step: 1 }, (c, v) => ({ ...c, r: v }), '%'),
        el('p', { class: 'fe-note', text: '0% 는 뾰족한 모서리, 100% 는 양 끝이 반원이에요.' })];
    } else if (pop === 'bgc' && it.t === 'text') {
      body = [el('div', { class: 'fe-poshead', text: '글 바탕색' }), swatches(it.bgc, (hex) => change({ bgc: hex }), { none: true, label: '글 바탕색' })];
    } else if (pop === 'lthick' && it.t === 'link') {
      body = [slider('굵기', Math.round(it.line / LINK_LINE.step), { min: Math.round(LINK_LINE.min / LINK_LINE.step), max: Math.round(LINK_LINE.max / LINK_LINE.step), step: 1 }, (c, v) => ({ ...c, line: Math.round(v * LINK_LINE.step * 100) / 100 }))];
    } else if (pop === 'arrow' && it.t === 'link') {
      const chip = (label, on, patch, data) => el('button', { class: `fe-chip${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), dataset: data, onClick: () => change(patch) }, label);
      // 고르는 단추마다 그 모양을 실제로 그린 작은 선(같은 linkSvg)을 보여 준다. 머리는 왼쪽(시작) 또는 오른쪽(끝)에.
      const sample = (patch, { w = 40, atStart = false } = {}) => el('span', { class: 'fe-link-sample', 'aria-hidden': 'true', html: linkSvg({
        w, vh: 10, line: 1.1, color: 'currentColor', head: 'end', pts: atStart ? [w - 3, 5, 4, 5] : [3, 5, w - 4, 5], ...patch }) });
      const startOn = it.head === 'both' || it.head === 'start', endOn = it.head === 'end' || it.head === 'both';
      const SHAPE_NAMES = { arrow: '뾰족 화살표', open: '열린 화살표', dot: '동그라미', ring: '빈 동그라미', diamond: '마름모', bar: '막대' };
      const headRow = (side) => {
        const isStart = side === 'start', on = isStart ? startOn : endOn, other = isStart ? endOn : startOn, key = isStart ? 'startShape' : 'endShape';
        const headWith = (has) => (isStart ? (has ? (other ? 'both' : 'start') : (other ? 'end' : 'none')) : (has ? (other ? 'both' : 'end') : (other ? 'start' : 'none')));
        const label = isStart ? '시작' : '끝';
        const button = (shape) => {
          const pressed = shape === 'none' ? !on : on && (it[key] || 'arrow') === shape;
          const patch = shape === 'none' ? { head: headWith(false) } : { head: headWith(true), [key]: shape === 'arrow' ? undefined : shape };
          const b = el('button', { class: `fe-chip fe-shape-chip${pressed ? ' on' : ''}`, type: 'button', 'aria-pressed': String(pressed), dataset: { [isStart ? 'startHead' : 'endHead']: shape },
            title: `${label}: ${shape === 'none' ? '머리 없음' : SHAPE_NAMES[shape]}`, 'aria-label': `${label} ${shape === 'none' ? '머리 없음' : SHAPE_NAMES[shape]}`, onClick: () => change(patch) },
            sample(shape === 'none' ? { head: 'none', line: 1.4 } : { endShape: shape, line: 1.4 }, { w: 18, atStart: isStart }));
          return b;
        };
        return el('div', { class: 'fe-row fe-head-row', role: 'group', 'aria-label': `${label} 머리 모양` }, el('span', { class: 'fe-side-lbl', text: label }), ...['none', ...LINK_SHAPES].map(button));
      };
      // 모양 모음: 한 번 눌러 머리 · 점선 · 굵기를 함께 바꾼다(색 · 선의 길 · 붙는 곳은 그대로).
      const PRESETS = [
        ['plain', '기본 화살표', { head: 'end', startShape: undefined, endShape: undefined, dash: undefined, line: LINK_LINE.base }],
        ['dashed', '점선 화살표', { head: 'end', startShape: undefined, endShape: undefined, dash: true, line: LINK_LINE.base }],
        ['dotted', '동글 점선', { head: 'end', startShape: undefined, endShape: 'open', dash: 'dot', line: 0.6 }],
        ['both', '양쪽 화살표', { head: 'both', startShape: undefined, endShape: undefined, dash: undefined, line: LINK_LINE.base }],
        ['beads', '점 잇기', { head: 'both', startShape: 'dot', endShape: 'dot', dash: undefined, line: LINK_LINE.base }],
        ['bold', '굵은 화살표', { head: 'end', startShape: undefined, endShape: undefined, dash: undefined, line: 1.2 }],
        ['flow', '흐름선', { head: 'end', startShape: undefined, endShape: 'open', dash: 'dashdot', line: 0.5 }],
        ['relate', '관계선', { head: 'both', startShape: 'ring', endShape: 'diamond', dash: undefined, line: LINK_LINE.base }],
      ];
      const same = (patch) => Object.entries(patch).every(([k, v]) => (k === 'line' ? Math.abs((it.line || 0) - v) < 1e-6 : (it[k] ?? undefined) === v));
      const presetBtn = ([id, name, patch]) => el('button', { class: `fe-btn fe-link-preset${same(patch) ? ' on' : ''}`, type: 'button', 'aria-pressed': String(same(patch)), dataset: { linkPreset: id }, onClick: () => change(patch) },
        sample({ ...patch, line: Math.max(0.8, patch.line * 1.6) }, { w: 48 }), el('span', { text: name }));
      body = [
        el('div', { class: 'fe-poshead', text: '모양 모음' }),
        el('div', { class: 'fe-grid two fe-link-presets' }, ...PRESETS.map(presetBtn)),
        el('div', { class: 'fe-poshead', text: '화살표 머리' }),
        headRow('start'),
        headRow('end'),
        el('div', { class: 'fe-poshead', text: '선의 길' }),
        el('div', { class: 'fe-row' },
          chip('곧게', !it.curve && !it.elbow, { curve: undefined, elbow: undefined, avoid: undefined }, { curve: 'off' }),
          chip('둥글게', !!it.curve, { curve: it.curve || 1, elbow: undefined, avoid: undefined }, { curve: 'on' }),
          // 꺾어서: 두 조각이 옆으로 더 떨어져 있으면 가로 먼저, 위아래로 더 떨어져 있으면 세로 먼저 꺾는다.
          // 새로 꺾으면 다른 조각을 피해 가기도 켠다(끄면 늘 같은 모양으로 꺾는다).
          chip('꺾어서', !!it.elbow, { elbow: it.elbow || (it.w >= it.vh ? 1 : -1), curve: undefined, ...(it.elbow ? {} : { avoid: true }) }, { elbow: 'on' }),
          it.curve ? el('button', { class: 'fe-chip', type: 'button', dataset: { bendLink: '1' }, onClick: () => change({ curve: -it.curve }) }, '반대로 휘기') : null,
          it.elbow ? el('button', { class: 'fe-chip', type: 'button', dataset: { turnLink: '1' }, onClick: () => change({ elbow: -it.elbow }) }, it.elbow > 0 ? '세로 먼저 꺾기' : '가로 먼저 꺾기') : null,
          it.elbow ? el('button', { class: `fe-chip${it.avoid ? ' on' : ''}`, type: 'button', 'aria-pressed': String(!!it.avoid), dataset: { avoid: it.avoid ? 'on' : 'off' }, title: '다른 조각을 뚫지 않는 길을 스스로 찾아요', onClick: () => change({ avoid: it.avoid ? undefined : true, turn: undefined }) }, '피해 가기') : null,
          // 손잡이로 고친 깊이 · 꺾이는 자리를 처음 모양으로
          (it.curve && Number.isFinite(it.bend)) || (it.elbow && Number.isFinite(it.turn)) ? el('button', { class: 'fe-chip', type: 'button', dataset: { resetLinkShape: '1' }, onClick: () => change({ bend: undefined, turn: undefined }) }, '처음 모양으로') : null),
        it.curve || it.elbow ? el('p', { class: 'fe-note', text: it.curve ? '선 가운데의 동그란 손잡이를 끌면 휘는 정도와 쪽이 바뀌어요.' : it.avoid ? '"피해 가기"를 켜면 다른 조각을 뚫지 않는 길을 스스로 찾아요. 조각을 옮기면 길도 다시 찾아요.' : '가운데 마디의 동그란 손잡이를 끌면 꺾이는 자리가 옮겨 가요.' }) : null,
        // 붙는 곳: 시작 조각 · 끝 조각마다 그 옆 가운데에 붙인다(자동이면 서로를 향하는 쪽).
        el('div', { class: 'fe-poshead', text: '붙는 곳' }),
        ...[['fromSide', '시작'], ['toSide', '끝']].flatMap(([key, label]) => [el('div', { class: 'fe-row fe-side-row', role: 'group', 'aria-label': `${label} 붙는 곳` },
          el('span', { class: 'fe-side-lbl', text: label }),
          // 좁은 칸에서도 한 줄에 들어가게 방향은 화살표로 보이고, 이름은 읽어 주는 글 · 풍선 도움말로 둔다.
          ...[['auto', '자동', '자동'], ['top', '↑', '위'], ['right', '→', '오른쪽'], ['bottom', '↓', '아래'], ['left', '←', '왼쪽']].map(([side, face, name]) => {
            const b = chip(face, (it[key] || 'auto') === side, { [key]: side === 'auto' ? undefined : side }, { [key]: side });
            b.title = `${label}: ${name}`; b.setAttribute('aria-label', `${label} ${name}`);
            if (side !== 'auto') b.classList.add('fe-side-chip');
            return b;
          })),
          // 옆을 골랐으면 그 옆의 어디에 붙을지(앞 · 가운데 · 뒤): 한 조각의 같은 옆에서 선 여럿이 나갈 때 겹치지 않게.
          it[key] ? (() => {
            const posKey = key === 'fromSide' ? 'fromPos' : 'toPos', across = it[key] === 'top' || it[key] === 'bottom';
            return el('div', { class: 'fe-row fe-side-row fe-pos-row', role: 'group', 'aria-label': `${label} 옆 위의 자리` }, el('span', { class: 'fe-side-lbl', text: '' }),
              ...[[0.25, across ? '왼쪽' : '위'], [undefined, '가운데'], [0.75, across ? '오른쪽' : '아래']].map(([pos, name]) => {
                const on = (it[posKey] ?? undefined) === pos;
                return el('button', { class: `fe-chip${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), dataset: { [posKey]: pos ?? 'mid' }, title: `${label}: 옆의 ${name}`, onClick: () => change({ [posKey]: pos }) }, name);
              }));
          })() : null]),
        el('div', { class: 'fe-poshead', text: '선 모양' }),
        el('div', { class: 'fe-row' },
          ...[[undefined, '실선', 'off'], [true, '긴 점선', 'on'], ['dot', '동글 점', 'dot'], ['dashdot', '점과 선', 'dashdot']].map(([dash, name, data]) => {
            const pressed = (it.dash ?? undefined) === dash;
            return el('button', { class: `fe-chip fe-dash-chip${pressed ? ' on' : ''}`, type: 'button', 'aria-pressed': String(pressed), dataset: { dash: data }, title: name, onClick: () => change({ dash }) },
              sample({ head: 'none', dash, line: 1.1 }, { w: 34 }), el('span', { text: name }));
          })),
        el('div', { class: 'fe-row' },
          el('button', { class: 'fe-chip', type: 'button', dataset: { flipLink: '1' }, onClick: () => change({ from: it.to, to: it.from, fromSide: it.toSide, toSide: it.fromSide, fromPos: it.toPos, toPos: it.fromPos }) }, '방향 바꾸기')),
        el('p', { class: 'fe-note', text: '두 조각 중 하나를 옮기거나 키우면 선이 따라와요. 조각을 지우면 선도 함께 없어져요.' }),
      ];
    } else if (pop === 'thick' && isLine(it)) {
      // 세로로 긴 카드에서는 가장 가는 굵기가 조금 더 굵다(도형의 높이에 한도가 있어서). 막대의 처음 칸을 거기에 맞춘다.
      const first = Math.max(1, Math.ceil(thickOf(thicken(it, THICK.min)) / THICK.step - 1e-6) - 1);
      body = [slider('굵기', Math.round(thickOf(it) / THICK.step) - 1, { min: first, max: Math.round(THICK.max / THICK.step) - 1, step: 1 }, (c, v) => thicken(c, (v + 1) * THICK.step)),
        el('p', { class: 'fe-note', text: '길이는 선 오른쪽 끝의 손잡이를 끌어서 바꿔요.' })];
    } else if (pop === 'size') {
      body = [slider('크기', sizeOf(it), sizeRange(it), (c, v) => resizeTo(c, v)),
        el('p', { class: 'fe-note', text: '카드에서 모서리의 동그란 손잡이를 끌어도 크기가 바뀌어요(가로세로 비율은 그대로).' })];
    } else if (pop === 'op') {
      body = [slider('투명도', it.op, { ...OPACITY, step: 5 }, (c, v) => ({ ...c, op: v }), '%'),
        el('p', { class: 'fe-note', text: '100% 는 또렷하고, 낮출수록 뒤가 비쳐 보여요.' })];
    } else if (pop === 'ytstart' && it.t === 'yt') {
      body = ytStartBody(it);
    } else if (pop === 'flip' && it.t !== 'text' && it.t !== 'yt') {
      body = [
        el('div', { class: 'fe-poshead', text: '뒤집기' }),
        el('div', { class: 'fe-grid two' },
          pbtn([icon('flipH'), '좌우'], () => change({ fx: !cur().fx }), { 'aria-label': '좌우 뒤집기', 'aria-pressed': String(it.fx), class: `fe-btn${it.fx ? ' on' : ''}` }),
          pbtn([icon('flipV'), '상하'], () => change({ fy: !cur().fy }), { 'aria-label': '상하 뒤집기', 'aria-pressed': String(it.fy), class: `fe-btn${it.fy ? ' on' : ''}` })),
        el('div', { class: 'fe-poshead', text: '기울기' }),
        el('div', { class: 'fe-row' },
          pbtn([icon('upright'), '바로 세우기'], () => change({ rot: 0 }), { disabled: !it.rot }),
          el('span', { class: 'fe-note', text: it.rot ? `지금 ${it.rot}° 기울어 있어요.` : '위쪽의 동그란 손잡이를 끌면 기울어져요.' })),
      ];
    } else if (pop === 'pos') {
      const top = sel === items().length - 1;
      body = [
        el('div', { class: 'fe-poshead', text: '겹치는 순서' }),
        el('div', { class: 'fe-grid two' },
          pbtn([icon('forward'), '앞으로'], () => order('up'), { disabled: top }),
          pbtn([icon('backward'), '뒤로'], () => order('down'), { disabled: sel === 0 }),
          pbtn([icon('toFront'), '맨 앞으로'], () => order('top'), { disabled: top }),
          pbtn([icon('toBack'), '맨 뒤로'], () => order('bottom'), { disabled: sel === 0 })),
        el('p', { class: 'fe-note', text: '겹쳤을 때 앞에 있는 것이 위에 보여요.' }),
        el('div', { class: 'fe-poshead', text: '페이지에 맞춰 정렬' }),
        el('div', { class: 'fe-grid three' },
          ...[['left', '왼쪽', 'pageL'], ['center', '가운데', 'pageC'], ['right', '오른쪽', 'pageR'], ['top', '위', 'pageT'], ['middle', '중간', 'pageM'], ['bottom', '아래', 'pageB']]
            .map(([where, name, pic]) => pbtn([icon(pic), name], () => alignTo(where), { class: 'fe-btn stack', dataset: { align: where } }))),
      ];
    } else if (pop === 'swap' && it.t === 'emoji') body = [stickerPicker((ch) => change({ ch }, { keepPop: false }))];
    else if (pop === 'mask' && it.t === 'image') {
      body = [el('div', { class: 'fe-row' }, ...MASKS.map((m) => el('button', {
        class: `fe-chip${it.mask === m.id ? ' on' : ''}`, type: 'button', 'aria-pressed': String(it.mask === m.id), onClick: () => change({ mask: m.id }),
      }, m.name)))];
    } else if (pop === 'cut' && it.t === 'image' && cut) body = cutBody();
    else if (pop === 'textfx' && it.t === 'text') {
      // 글 효과: 줄 간격 · 글 테두리 · 그림자. 사진 위에 놓은 제목이 잘 읽히게.
      const chip = (label, on, patch, data) => el('button', {
        class: `fe-chip${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), dataset: data, onClick: () => change(patch),
      }, label);
      const lh = it.lh || 1.3;
      body = [
        el('div', { class: 'fe-poshead', text: '줄 간격' }),
        el('div', { class: 'fe-row' }, ...LINE_SPACINGS.map((v) => chip(String(v), Math.abs(lh - v) < .001, { lh: v }, { lineSpacing: String(v) }))),
        el('div', { class: 'fe-poshead', text: '글 테두리' }),
        el('div', { class: 'fe-row' },
          chip('없음', !it.stroke, { stroke: undefined }, { stroke: 'none' }),
          chip('흰 테두리', it.stroke === '#ffffff', { stroke: '#ffffff' }, { stroke: 'white' }),
          chip('검은 테두리', it.stroke === '#1d2433', { stroke: '#1d2433' }, { stroke: 'dark' })),
        el('div', { class: 'fe-poshead', text: '그림자' }),
        el('div', { class: 'fe-row' },
          chip('없음', !it.shadow, { shadow: undefined }, { shadow: 'none' }),
          chip('그림자', !!it.shadow, { shadow: true }, { shadow: 'on' })),
        el('p', { class: 'fe-note', text: '테두리와 그림자는 그림·영상·PPTX 로 내려받을 때도 함께 나와요.' }),
      ];
    } else if (pop === 'llabel' && it.t === 'link') {
      // 선 위의 글: 다 쓰고 칸을 벗어나거나 Enter 를 누르면 저장한다(글자마다 되돌리기 기록이 쌓이지 않게). 비우면 글을 뗀다.
      const box = el('input', { class: 'fe-alt-input fe-link-label-input', type: 'text', maxlength: String(LINK_LABEL_MAX), 'aria-label': '선 위의 글', placeholder: '예: 예 · 아니오 · 다음 단계', value: it.label || '' });
      const save = () => { if ((cur()?.label || '') !== box.value.trim()) change({ label: box.value.trim() || undefined }); };
      box.addEventListener('change', save);
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); box.blur(); } e.stopPropagation(); });
      const quick = (text) => el('button', { class: 'fe-chip', type: 'button', dataset: { linkLabel: text }, onClick: () => change({ label: text }) }, text);
      body = [
        el('div', { class: 'fe-poshead', text: '선 위의 글' }),
        box,
        el('div', { class: 'fe-row' }, ...['예', '아니오', '다음', '원인', '결과'].map(quick),
          it.label ? el('button', { class: 'fe-chip', type: 'button', dataset: { linkLabelClear: '1' }, onClick: () => change({ label: undefined }) }, '글 떼기') : null),
        Number.isFinite(it.labelAt) ? el('div', { class: 'fe-row' }, el('button', { class: 'fe-chip', type: 'button', dataset: { linkLabelCenter: '1' }, onClick: () => change({ labelAt: undefined }) }, '가운데로')) : null,
        // 글의 크기 · 모양 · 글꼴(글이 있을 때)
        ...(it.label ? [
          el('div', { class: 'fe-poshead', text: '글 크기 · 모양' }),
          el('div', { class: 'fe-row' }, ...[['small', '작게'], [undefined, '보통'], ['large', '크게']].map(([size, name]) => {
            const on = (it.labelSize ?? undefined) === size;
            return el('button', { class: `fe-chip${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), dataset: { labelSize: size || 'normal' }, onClick: () => change({ labelSize: size }) }, name);
          })),
          el('div', { class: 'fe-row' }, ...[[undefined, '흰 바탕'], ['fill', '색 바탕'], ['none', '글만']].map(([look, name]) => {
            const on = (it.labelStyle ?? undefined) === look;
            return el('button', { class: `fe-chip${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), dataset: { labelStyle: look || 'pill' }, onClick: () => change({ labelStyle: look }) }, name);
          })),
          el('label', { class: 'fe-row fe-label-font' }, el('span', { class: 'fe-side-lbl', text: '글꼴' }),
            el('select', { class: 'fe-label-font-select', 'aria-label': '선 위 글의 글꼴', onChange: (e) => change({ labelFont: e.target.value === DEFAULT_FONT ? undefined : e.target.value }) },
              ...fonts().map((f) => { const o = el('option', { value: f.id, text: f.name }); if ((it.labelFont || DEFAULT_FONT) === f.id) o.selected = true; return o; }))),
        ] : []),
        el('p', { class: 'fe-note', text: `선 색으로 붙어요(${LINK_LABEL_MAX}자까지). 고른 선의 글을 끌면 선을 따라 자리가 옮겨 가요. 선을 두 번 눌러도 이 칸이 열려요.` }),
      ];
      requestAnimationFrame(() => box.focus({ preventScroll: true }));
    } else if (pop === 'alt' && it.t === 'image') {
      // 그림 설명(대체 텍스트): 다 쓰고 칸을 벗어나거나 Enter 를 누르면 저장한다(글자마다 되돌리기 기록이 쌓이지 않게).
      const box = el('textarea', { class: 'fe-alt-input', rows: '3', maxlength: String(ALT_LIMIT), 'aria-label': '그림 설명', placeholder: '예: 운동장에서 줄넘기를 하는 학생들', value: it.alt || '' });
      const save = () => { if ((cur()?.alt || '') !== box.value.trim()) change({ alt: box.value }); };
      box.addEventListener('change', save);
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); box.blur(); } e.stopPropagation(); });
      body = [
        el('div', { class: 'fe-poshead', text: '그림 설명' }),
        box,
        el('p', { class: 'fe-note', text: '눈이 불편한 친구에게 화면을 읽어 주는 프로그램이 이 글을 읽어요. PPTX 로 내려받으면 PowerPoint 의 "대체 텍스트"에 들어가요.' }),
      ];
      requestAnimationFrame(() => box.focus({ preventScroll: true }));
    }
    popBox.hidden = !body;
    popBox.replaceChildren(...(body ? [
      el('button', { class: 'fe-pop-close', type: 'button', 'aria-label': '닫기', title: '닫기 (Esc)', onClick: () => toggle(pop) }, icon('close')),
      ...body.filter(Boolean)] : []));
  }

  async function openCrop() {
    if(cropJob)return;
    const it=cur();if(it?.t!=='image'||it.lock)return;
    endEdit();stopDrag();stopPress();stopPreview();closeMenu();cut=null;
    const job=cropJob={item:structuredClone(it),state:'loading',aspect:settings().aspect};pop='crop';syncSel();renderBar();
    try {
      const image=new Image();image.src=it.url;await image.decode();
      if(cropJob!==job||pop!=='crop'||cur()?.url!==it.url||cur()?.id!==it.id)return;
      job.sourceAspect=image.naturalWidth/image.naturalHeight;
      job.base=it.crop||coverCrop(job.sourceAspect,it.w/(it.h/job.aspect));
      job.full=cropImage(job.item,FULL_CROP,{base:job.base,aspect:job.aspect});
      job.rect={...job.base};job.state='ready';mountCrop();renderBar();focusStage();
    } catch {if(cropJob===job){cancelCrop();notify('사진을 읽지 못했어요. 사진을 다시 확인해주세요.');}}
  }
  function dismissCrop() {
    const job=cropJob;cropJob=null;job?.stop?.();
    cropLayer.hidden=true;cropLayer.replaceChildren();stage.classList.remove('fe-cropping');
    nodes.forEach(node=>node.classList.remove('fe-crop-hidden'));
    if(pop==='crop')pop=null;
  }
  function cancelCrop(){dismissCrop();syncSel();renderBar();focusStage();}
  function applyCrop() {
    const job=cropJob;
    if(!job||job.state!=='ready')return;
    if(JSON.stringify(cur())!==JSON.stringify(job.item)){cancelCrop();notify('사진이 바뀌었어요. 다시 자르기를 열어주세요.');return;}
    const next=cropImage(job.full,job.rect,{base:FULL_CROP,aspect:job.aspect}),clean=cleanItem(next,{keepSpaces:true});
    if(!clean||['w','h','x','y'].some(k=>Math.abs(clean[k]-next[k])>.11)){notify('자를 영역이 너무 작거나 커요. 손잡이로 영역을 조절해주세요.');return;}
    const changed=['x','y','w','h'].some(k=>Math.abs(next[k]-job.item[k])>.00001)||JSON.stringify(cleanCrop(job.rect))!==JSON.stringify(cleanCrop(job.base));
    dismissCrop();
    if(changed)change(next,{keepPop:false});else{syncSel();renderBar();}
    focusStage();
  }
  function drawCropBar() {
    const job=cropJob,ready=job.state==='ready';
    const choose=(value)=>{
      if(!ready)return;
      if(!value)job.rect={...FULL_CROP};
      else{
        const c=job.rect,ratio=Number(value)/(job.full.w/(job.full.h/job.aspect));
        const w=Math.min(c.w,c.h*ratio),h=w/ratio;
        job.rect={x:c.x+(c.w-w)/2,y:c.y+(c.h-h)/2,w,h};
      }
      drawCrop();
    };
    bar.replaceChildren(el('b',{class:'fe-crop-title'},icon('crop'),'사진 자르기'),
      el('span',{class:'fe-hint',text:ready?'손잡이로 자르기 · 안쪽을 끌어 사진 이동':'사진을 여는 중이에요…'}),
      pbtn('원본 전체',()=>choose(''),{disabled:!ready}),
      el('select',{'aria-label':'자르기 비율',disabled:!ready,onChange:e=>{choose(e.target.value);e.target.value='';}},
        ...[['','비율 선택'],['1','정사각형'],[String(4/3),'4:3'],[String(16/9),'16:9']].map(([value,text])=>el('option',{value,text}))),
      pbtn('취소',cancelCrop,{'aria-label':'자르기 취소'}),
      el('button',{class:'fe-btn primary',type:'button',disabled:!ready,onClick:applyCrop,'data-crop-apply':'',title:'Enter 또는 사진 바깥을 눌러도 적용돼요'},'자르기 적용'));
    popBox.hidden=true;popBox.replaceChildren();
  }
  function mountCrop() {
    const job=cropJob;
    const image=()=>el('img',{src:job.item.url,alt:'',draggable:'false'});
    job.source=el('div',{class:'fe-crop-source','data-image-crop':'',role:'group','aria-label':'사진 위에서 자르기'});
    job.visible=image();job.rectNode=el('div',{class:'fe-crop-rect'},el('div',{class:'fe-crop-window'},job.visible,el('div',{class:'fe-crop-grid','aria-hidden':'true'})));
    const names={nw:'왼쪽 위',n:'위쪽',ne:'오른쪽 위',e:'오른쪽',se:'오른쪽 아래',s:'아래쪽',sw:'왼쪽 아래',w:'왼쪽'};
    for(const [corner,name]of Object.entries(names))job.rectNode.append(el('button',{type:'button',class:'fe-crop-handle',dataset:{corner},'aria-label':name+' 자르기 손잡이'}));
    job.source.append(el('div',{class:'fe-crop-ghost'},image()),job.rectNode);
    job.source.onpointerdown=startCropDrag;
    job.source.ondblclick=e=>{e.preventDefault();e.stopPropagation();applyCrop();};
    cropLayer.replaceChildren(job.source);cropLayer.hidden=false;stage.classList.add('fe-cropping');nodes[sel].classList.add('fe-crop-hidden');
    drawCrop();
  }
  function drawCrop() {
    const job=cropJob;if(job?.state!=='ready'||!job.source)return;
    const f=job.full,c=job.rect;
    Object.assign(job.source.style,{left:`${f.x}%`,top:`${f.y}%`,width:`${f.w}%`,height:`${f.h}%`,transform:`translate(-50%,-50%) rotate(${f.rot}deg) scale(${f.fx?-1:1},${f.fy?-1:1})`});
    Object.assign(job.rectNode.style,{left:`${c.x*100}%`,top:`${c.y*100}%`,width:`${c.w*100}%`,height:`${c.h*100}%`});
    Object.assign(job.visible.style,{left:`${-c.x/c.w*100}%`,top:`${-c.y/c.h*100}%`,width:`${100/c.w}%`,height:`${100/c.h}%`});
  }
  function startCropDrag(e) {
    if(e.button>0)return;
    e.preventDefault();e.stopPropagation();
    const job=cropJob;if(job?.state!=='ready'||job.stop)return;
    const corner=e.target.closest('[data-corner]')?.dataset.corner,start={...job.rect},full={...job.full},bounds=stage.getBoundingClientRect(),x=e.clientX,y=e.clientY;
    const angle=full.rot*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),width=bounds.width*full.w/100,height=bounds.height*full.h/100;
    focusStage();job.source.setPointerCapture(e.pointerId);
    const move=ev=>{
      if(ev.pointerId!==e.pointerId)return;
      const px=ev.clientX-x,py=ev.clientY-y,dx=(px*cos+py*sin)/width*(full.fx?-1:1),dy=(-px*sin+py*cos)/height*(full.fy?-1:1);
      if(!corner)Object.assign(job,panCrop(full,start,dx,dy,{aspect:job.aspect}));
      else{
        let l=start.x,t=start.y,r=l+start.w,b=t+start.h;
        if(corner.includes('w'))l=Math.max(0,Math.min(r-.01,l+dx));
        if(corner.includes('e'))r=Math.min(1,Math.max(l+.01,r+dx));
        if(corner.includes('n'))t=Math.max(0,Math.min(b-.01,t+dy));
        if(corner.includes('s'))b=Math.min(1,Math.max(t+.01,b+dy));
        job.rect={x:l,y:t,w:r-l,h:b-t};
      }
      drawCrop();
    };
    const done=ev=>{if(ev.pointerId!==e.pointerId)return;if(ev.type==='pointercancel'){job.rect=start;job.full=full;drawCrop();}job.stop();};
    job.stop=()=>{
      job.source.removeEventListener('pointermove',move);job.source.removeEventListener('pointerup',done);job.source.removeEventListener('pointercancel',done);job.source.removeEventListener('lostpointercapture',done);
      job.stop=null;try{job.source.releasePointerCapture(e.pointerId);}catch{}
    };
    job.source.addEventListener('pointermove',move);job.source.addEventListener('pointerup',done);job.source.addEventListener('pointercancel',done);job.source.addEventListener('lostpointercapture',done);
  }
  function cropKey(e) {
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelCrop();return;}
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();applyCrop();return;}
    const job=cropJob,d=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]})[e.key];
    if(job?.state==='ready'&&d){
      e.preventDefault();const step=e.shiftKey?10:1,bounds=stage.getBoundingClientRect(),angle=job.full.rot*Math.PI/180;
      const px=d[0]*step,py=d[1]*step;
      const dx=(px*Math.cos(angle)+py*Math.sin(angle))/(bounds.width*job.full.w/100)*(job.full.fx?-1:1),dy=(-px*Math.sin(angle)+py*Math.cos(angle))/(bounds.height*job.full.h/100)*(job.full.fy?-1:1);
      Object.assign(job,panCrop(job.full,job.rect,dx,dy,{aspect:job.aspect}));drawCrop();
    }
  }
  toolbar.addEventListener('keydown',e=>{if(cropJob&&e.key==='Escape')cropKey(e);});
  const onCropOutside=e=>{
    if(e.button>0||cropJob?.state!=='ready'||cropLayer.contains(e.target)||toolbar.contains(e.target))return;
    applyCrop();
  };
  document.addEventListener('pointerdown',onCropOutside,true);

  function cutBody() {
    if (cut.state === 'loading') return [el('p', { class: 'fe-note', text: '사진을 읽는 중이에요…' })];
    if (cut.state === 'error') {
      return [el('p', { class: 'fe-note strong', text: '이 사진을 다시 읽지 못했어요. 사진을 지우고 다시 올린 뒤에 해 봐요.' })];
    }
    const job = cut;
    const saving = job.state === 'saving';
    const { canvas } = job.prev;
    canvas.className = `fe-cut-canvas${job.brush ? ` brush-${job.brush}` : ''}`;
    const info = el('small', { class: 'fe-cut-info' });
    const show = () => {
      const f = paintCut();
      info.textContent = job.original ? '원본을 보고 있어요' : f < 0 ? '' : `사진의 ${Math.round(f * 100)}%가 지워져요`;
    };
    let frame = 0;
    const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; show(); }); };
    show();
    // 붓질: 미리보기 위에 지우개 · 살리개로 칠한다(점은 사진에 대한 비율로 남겨 저장할 때 큰 사진에도 그대로 칠한다)
    canvas.onpointerdown = (e) => {
      if (!job.brush || saving) return;
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      const at = (ev) => { const r = canvas.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]; };
      const stroke = { mode: job.brush, size: job.brushSize, pts: [at(e)] };
      job.strokes.push(stroke);
      later();
      canvas.onpointermove = (ev) => { stroke.pts.push(at(ev)); later(); };
      const end = () => { canvas.onpointermove = null; canvas.onpointerup = null; canvas.onpointercancel = null; renderBar(); };
      canvas.onpointerup = end; canvas.onpointercancel = end;
    };
    const chip = (label, on, onClick, title = '') => el('button', { class: `fe-chip fe-cut-chip${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), disabled: saving, title, onClick }, ...[label].flat());
    const range = (label, value, min, max, step, onInput) => {
      const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), disabled: saving, 'aria-label': label,
        onInput: () => { onInput(Number(input.value)); later(); } });
      return el('label', { class: 'fe-slider' }, el('span', { text: label }), input);
    };
    const mode = (m) => { job.mode = m; job.baseKey = ''; if (m === 'ai') runAi(job); renderBar(); };
    const waiting = job.mode === 'ai' && job.ai.state !== 'ready';
    return [el('div', { class: 'fe-cut' },
      el('div', { class: 'fe-cut-view' }, canvas, info),
      el('div', { class: 'fe-cut-side' },
        el('b', { text: '배경 제거' }),
        el('div', { class: 'fe-row', role: 'group', 'aria-label': '지우는 방식' },
          chip([icon('people'), '자동 (사람·사물)'], job.mode === 'ai', () => mode('ai'), 'AI 가 사진의 주인공을 찾아 테두리를 따라 지워요'),
          chip([icon('palette'), '단색 배경 (그림·로고)'], job.mode === 'color', () => mode('color'), '흰 종이 · 한 가지 색 배경을 지워요')),
        waiting ? el('p', { class: 'fe-note fe-cut-ai', text: aiNote(job) }) : null,
        job.mode === 'color' ? range('지우는 정도', job.tol, TOLERANCE.min, TOLERANCE.max, 2, (v) => { job.tol = v; }) : null,
        job.mode === 'color' ? el('label', { class: 'fe-check' },
          el('input', { type: 'checkbox', checked: job.inside, disabled: saving, onChange: (e) => { job.inside = e.target.checked; later(); } }),
          el('span', { text: '안쪽의 같은 색도 지우기' })) : null,
        range('가장자리 (넉넉하게 - 바짝)', job.edge, 0, 1, 0.05, (v) => { job.edge = v; }),
        range('부드럽게', job.soft, 0, 1, 0.05, (v) => { job.soft = v; }),
        el('div', { class: 'fe-row', role: 'group', 'aria-label': '손질' },
          chip([icon('eraser'), '지우개'], job.brush === 'erase', () => { job.brush = job.brush === 'erase' ? null : 'erase'; renderBar(); }, '미리보기에서 더 지울 곳을 칠해요'),
          chip([icon('pencil'), '살리개'], job.brush === 'keep', () => { job.brush = job.brush === 'keep' ? null : 'keep'; renderBar(); }, '지워진 곳 중 살릴 곳을 칠해요'),
          job.strokes.length ? pbtn('붓질 되돌리기', () => { job.strokes.pop(); renderBar(); }, { disabled: saving }) : null),
        job.brush ? range('붓 크기', job.brushSize, 0.02, 0.2, 0.01, (v) => { job.brushSize = v; }) : null,
        el('label', { class: 'fe-check' },
          el('input', { type: 'checkbox', checked: job.original, disabled: saving, onChange: (e) => { job.original = e.target.checked; show(); } }),
          el('span', { text: '원본 보기' })),
        el('div', { class: 'fe-row' },
          el('button', { class: 'fe-btn primary fe-cut-go', type: 'button', disabled: saving || waiting, onClick: applyCut }, saving ? '지우는 중…' : '이대로 지우기'),
          pbtn('취소', () => toggle('cut'), { disabled: saving }))))];
  }

  // ---------- 배경색 고르기(옆 메뉴의 배경 칸과, 아무것도 고르지 않았을 때 도구 막대의 "배경색" 칸이 함께 쓴다) ----------
  const bgNote = '사진을 배경으로 쓰려면 내 자료에서 사진을 넣고, 사진을 고른 뒤 "배경으로 깔기"를 눌러요.';
  function bgPicker() {
    const now = backgroundOf(card.bg);
    const custom = el('input', {
      class: `fe-bgsw fe-bgcustom${String(card.bg).startsWith('#') ? ' on' : ''}`, type: 'color', value: now.bg,
      'aria-label': '배경 색 직접 고르기', title: '다른 색 고르기', onChange: () => {paletteAction({type:'recent',color:custom.value});setBg(custom.value);},
    });
    return el('div', {class:'fe-color-picker'},eyedropper(now.bg,setBg,custom),el('div', { class: 'fe-bgs', role: 'group', 'aria-label': '배경 색' }, ...settings().backgrounds.map((b) => {
      const sw = el('button', {
        class: `fe-bgsw${card.bg === b.id ? ' on' : ''}`, type: 'button', 'aria-label': `배경 ${b.name}`, 'aria-pressed': String(card.bg === b.id), title: b.name,
        onClick: () => setBg(b.id),
      }, '가');
      sw.style.background = b.bg;
      sw.style.color = b.ink;
      return sw;
    }), custom),savedColors(now.bg,setBg));
  }

  // ---------- 옆 메뉴 ----------
  // top: 칸을 맨 위부터 보여 준다. 아니면 같은 칸을 다시 그릴 때 보던 자리(스크롤)를 그대로 둔다
  // (긴 목록의 아래쪽에서 무엇을 눌렀을 때 목록이 맨 위로 튀어 올라가지 않게).
  let shownTab = '';
  function renderPanel({ top = false } = {}) {
    if (!card) { panel.replaceChildren(); shownTab = ''; return; }
    const focused = panel.contains(document.activeElement) ? document.activeElement : null;
    const focusedUploadTab = focused?.dataset.uploadTab;
    const focusedYoutube = focused === youtubeInput;
    const was = panel.querySelector('.fe-tabbody');
    const keep = !top && was && shownTab === tab ? was.scrollTop : 0;
    const priorTabsLeft = panel.querySelector('.fe-tabs')?.scrollLeft || 0;
    const tabButton = ([id, pic, name]) => {
      let pressed = null, pendingTap = null;
      return el('button', {
        class: `fe-tab${tab === id ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(tab === id), dataset: { tab: id },
        onPointerdown: e => { if (e.pointerType === 'touch' && e.isPrimary) pressed = {id:e.pointerId,x:e.clientX,y:e.clientY}; },
        onPointercancel: () => { pressed = null; pendingTap = null; },
        onPointerup: e => {
          const start = pressed; pressed = null;
          if (!start || e.pointerId !== start.id || Math.hypot(e.clientX-start.x,e.clientY-start.y)>8) return;
          // Prefer the browser's click. After a captured slide drag it can be
          // omitted: replay only an unhandled tap, through host save/close guards.
          const button = e.currentTarget, tap = pendingTap = {}, doc = button.ownerDocument;
          let replayed = false;
          const unlisten = () => doc.removeEventListener('click', heard, true);
          // A host can consume the click before it reaches this button. Count
          // that as handled too, so a denied close is not requested twice.
          const heard = event => {
            const target = event.target.closest?.('.fe-tab');
            if (!event.isTrusted || !target || target.dataset.tab !== id || !panel.contains(target)) return;
            // Rendering may retarget a late native click to the new tab button.
            // Suppress only the gesture we replayed; a new touch has a new ID.
            if (replayed && event.pointerId === start.id) { event.preventDefault(); event.stopImmediatePropagation(); }
            pendingTap = null; unlisten();
          };
          doc.addEventListener('click', heard, true);
          requestAnimationFrame(() => {
            if (pendingTap !== tap || !button.isConnected) { unlisten(); return; }
            pendingTap = null; replayed = true; button.click();
            setTimeout(unlisten, 600);
          });
        },
        onClick: e => {
          pendingTap = null;
          stopPreview(); tab = id; armed = null; armedFile = null; renderPanel();
        },
      }, icon(pic, 'fe-tab-icon'), el('span', { text: name }));
    };
    const tabs = el('div', { class: `fe-tabs${tabsHere().length > 7 ? ' many' : ''}`, role: 'tablist', 'aria-label': '넣을 것 고르기' }, ...tabsHere().map(tabButton));
    // 칸의 머리말(이름 + 한 줄 설명)은 짧게, 그 아래에 바로 고를 것이 나온다.
    if (!tabsHere().some((t) => t[0] === tab)) tab = 'text';
    const [, , title, desc] = tabsHere().find((t) => t[0] === tab);
    const body = el('div', { class: 'fe-tabbody', role: 'tabpanel', 'aria-label': title },
      el('div', { class: 'fe-panel-head' }, el('b', { class: 'fe-panel-title', text: title }), el('span', { class: 'fe-panel-desc', text: desc })),
      ...tabBody().filter(Boolean));
    panel.replaceChildren(tabs, body, fileInput, videoInput, replaceInput);
    tabs.scrollLeft = priorTabsLeft;
    shownTab = tab;
    if (keep) body.scrollTop = keep;
    fileInput.multiple = libraryOn();        // 올린 파일 목록을 쓰면 여러 장을 한꺼번에 고를 수 있다
    if (tab === 'upload') {
      if (focusedUploadTab) panel.querySelector(`[data-upload-tab="${uploadTab}"]`)?.focus({ preventScroll: true });
      else if (focusedYoutube && uploadTab === 'video') youtubeInput?.focus({ preventScroll: true });
    }
  }

  // 템플릿을 묶음(group)별로 나눈다. 묶음이 적히지 않은 목록은 한 덩어리다.
  // 지금 카드와 같은 배경을 쓰는 묶음이 맨 위에 온다: 테마의 표지로 시작한 그림에 새 장을 더하면 그 테마의 템플릿부터 보인다.
  function layoutGroups() {
    const groups = [];
    for (const l of layoutList()) {
      const name = typeof l.group === 'string' ? l.group : '';
      let g = groups.find((k) => k.name === name);
      if (!g) groups.push(g = { name, list: [] });
      g.list.push(l);
    }
    const mine = groups.findIndex((g) => g.list.some((l) => l.bg && cleanBg(l.bg) === card.bg));
    if (mine > 0) groups.unshift(...groups.splice(mine, 1));
    return groups;
  }

  // ---------- 움직임(발표할 때): 고르는 칸의 본보기 · 꾸미기 판에서 미리 보기 ----------
  // 고르는 칸: 작은 카드에서 그 효과가 어떻게 보이는지 올려놓으면(또는 글쇠로 닿으면) 틀어 준다. 진짜 요소와 같은 방법으로 그리고 튼다.
  const DEMO = {
    enter: { bg: '#eef1fb', items: [{ t: 'shape', shape: 'round', x: 50, y: 50, w: 34, h: 48, color: '#3d4bc0', r: 30 }] },
    combo: {
      bg: '#eef1fb',
      items: [
        { t: 'text', text: '제목', x: 34, y: 28, w: 50, size: 15, bold: true, align: 'l', color: '#1d2433' },
        { t: 'shape', shape: 'pill', x: 32, y: 62, w: 46, h: 12, color: '#aab4f6' },
        { t: 'shape', shape: 'circle', x: 78, y: 56, w: 26, h: 37, color: '#ffc93c' },
      ],
    },
    old: { bg: '#cfd6f3', items: [] },
    next: { bg: '#3d4bc0', items: [{ t: 'shape', shape: 'circle', x: 50, y: 50, w: 26, h: 37, color: '#ffffff' }] },
    // 이어 움직이기: 같은 동그라미가 왼쪽 위에서 오른쪽 아래로 커지며 옮겨 간다.
    moveOld: { bg: '#cfd6f3', items: [{ id: 'edemomove1', t: 'shape', shape: 'circle', x: 28, y: 32, w: 18, h: 26, color: '#3d4bc0' }] },
    moveNext: { bg: '#eef1fb', items: [{ id: 'edemomove1', t: 'shape', shape: 'circle', x: 68, y: 58, w: 34, h: 48, color: '#ffc93c' }] },
  };
  const DEMO_RATIO = 1.42;
  const demoCard = (design) => {
    const view = designView(design);
    view.style.setProperty('--fe-ratio', String(DEMO_RATIO));
    return view;
  };
  /** 효과 하나를 고르는 단추. kind: 'enter'(요소 효과) · 'emph'(강조) · 'exit'(사라지기) · 'idle'(계속 움직이기) · 'combo'(조합 효과) · 'tr'(전환 효과) · 'none'(없음) · 'follow'(장의 효과대로) */
  // "장의 효과대로"(id '')는 'follow', 없음 · 가만히는 'none' 이라는 표를 단다(둘이 한 칸에 함께 나올 때 가려낸다).
  const tileOf = (group, id) => panel.querySelector(`.fe-motions[data-group="${group}"] .fe-mo[data-motion="${id || 'follow'}"]`) || panel.querySelector(`.fe-motions[data-group="${group}"] .fe-mo[data-motion="${id || 'none'}"]`);
  function motionTile({ group, name, hint = '', on, kind, id, onPick }) {
    const view = el('span', { class: 'fe-mo-view', 'aria-hidden': 'true' });
    let play = () => {};
    if (kind === 'enter') {
      const design = cleanDesign(DEMO.enter);
      const c = demoCard(design);
      view.append(c);
      play = () => playEnter(c.firstElementChild, design.items[0], id);
    } else if (kind === 'emph') {
      const design = cleanDesign(DEMO.enter);
      const c = demoCard(design);
      view.append(c);
      play = () => playEmphasis(c.firstElementChild, design.items[0], id);
    } else if (kind === 'exit') {
      // 사라지기: 사라진 뒤 잠깐 있다가 다시 보이게 한다(본보기가 빈 칸으로 남지 않게).
      const design = cleanDesign(DEMO.enter);
      const c = demoCard(design);
      view.append(c);
      play = () => { const n = c.firstElementChild; playExit(n, design.items[0], id); setTimeout(() => { n.style.visibility = ''; }, 1400); };
    } else if (kind === 'idle') {
      // 계속 움직이기는 끝이 없으므로 본보기는 잠깐만 틀고 멈춘다(작은 칸이라 거리를 조금 크게).
      const design = cleanDesign(DEMO.enter);
      const c = demoCard(design);
      view.append(c);
      let anim = null;
      play = () => { anim?.cancel(); anim = playIdle(c.firstElementChild, design.items[0], id, { scale: 1.6 }); if (anim) setTimeout(() => { anim?.cancel(); anim = null; }, 3600); };
    } else if (kind === 'combo') {
      const design = cleanDesign({ ...DEMO.combo, pa: id });
      const c = demoCard(design);
      view.append(c);
      play = () => playDesign(c, design);
    } else if (kind === 'tr' && morphs(id)) {
      const from = cleanDesign(DEMO.moveOld), to = cleanDesign(DEMO.moveNext);
      const [a, b] = [demoCard(from), demoCard(to)];
      view.append(a, b);
      play = () => playTransition(a, b, id, 1, { from, to });
    } else if (kind === 'tr') {
      const [a, b] = [demoCard(DEMO.old), demoCard(DEMO.next)];
      view.append(a, b);
      play = () => playTransition(a, b, id);
    } else {
      // 없음(✕) · 장의 효과대로(움직임 표시)
      view.classList.add('none');
      view.append(icon(kind === 'follow' ? 'motion' : 'close'));
    }
    let busy = false;
    const run = () => {
      if (busy) return;
      busy = true;
      play();
      setTimeout(() => { busy = false; }, 1600);
    };
    return el('button', {
      class: `fe-mo${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(!!on), title: hint || name, dataset: { motion: id || (kind === 'follow' ? 'follow' : 'none') },
      // 고르면 칸이 다시 그려져 이 단추가 새것으로 바뀐다. 같은 자리의 새 단추에 초점을 돌려놓아 글쇠로 이어서 고를 수 있게 한다.
      onClick: () => { onPick(); tileOf(group, id)?.focus({ preventScroll: true }); },
      onPointerenter: run, onFocus: run,
    }, view, el('small', { text: name }));
  }
  // 움직임 칸의 조각(본보기가 든 단추들)은 만들어 둔 것을 다시 쓴다: 요소를 고르거나 끌어 옮길 때마다 칸을 다시 그리는데,
  // 작은 카드가 든 단추 서른 개쯤을 그때마다 새로 만들면 느린 기기에서 누른 것이 늦게 보인다. key 가 같으면 내용도 같다.
  const motionParts = new Map();
  function motionPart(name, key, build) {
    const got = motionParts.get(name);
    if (got && got.key === key) return got.nodes;
    const nodes = build().filter(Boolean);
    motionParts.set(name, { key, nodes });
    return nodes;
  }

  // 꾸미기 판에서 미리 보기. 틀던 것이 있으면 먼저 끝낸다(숨겨 둔 것도 다시 보이게).
  // 보는 동안에는 고른 테두리와 손잡이를 감춘다(움직임을 가리지 않게. 고른 것은 그대로 두어서 옆 칸의 "고른 요소"가 남는다).
  function stopPreview() {
    idleTry?.cancel(); idleTry = null;
    if (!preview) return;
    for (const t of preview.timers) clearTimeout(t);
    preview.tr?.finish();
    preview.ctl?.restore();
    preview = null;
    stage.classList.remove('fe-playing');
  }
  // 카드가 화면 밖에 있으면(옆 칸이 카드 아래에 길게 놓이는 좁은 화면) 보이는 곳으로 데려온 뒤에 튼다.
  const showStage = () => stage.scrollIntoView?.({ block: 'nearest' });
  /** 고른 요소 하나를 지금 정해진 효과로 틀어 본다(요소에 정한 것, 없으면 조합 효과가 정해 준 것). */
  function previewItem() {
    stopPreview();
    const plan = planMotion(cleanDesign(card, { keepSpaces: true }));
    const step = [...plan.auto, ...plan.clicks].find((a) => a.i === sel);
    if (!step || !nodes[sel]) return;
    showStage();
    playEnter(nodes[sel], cur(), step.enter, { mirror: step.mirror });
  }
  /** 이 장을 발표할 때처럼 틀어 본다: 전환 효과 → 요소들 → "누를 때" 나오는 것은 조금씩 쉬었다가 차례로. */
  function previewPage({ transition = true } = {}) {
    endEdit();
    stopDrag();
    stopPreview();
    showStage();
    const design = cleanDesign(card, { keepSpaces: true });
    const tr = transition ? playTransition(null, cardEl, design.tr) : null;
    const start = tr?.ms || 0;
    const ctl = playDesign(cardEl, design, { delay: start });
    const timers = [];
    const mine = preview = { ctl, tr, timers };
    stage.classList.add('fe-playing');
    const wait = start + planMotion(design).ms + 500;
    for (let n = 0; n < ctl.left(); n++) timers.push(setTimeout(() => { if (preview === mine) ctl.next(); }, wait + n * 800));
    const linger = planMotion(design).loops.length ? 3500 : 0;      // 계속 움직이는 조각이 있으면 조금 더 보여 준다
    timers.push(setTimeout(() => { if (preview === mine) stopPreview(); }, wait + ctl.left() * 800 + 1200 + linger));
    keepKeys();
  }
  function setCombo(id) {
    if ((card.pa || '') === (id || '')) { previewPage({ transition: false }); return; }
    endEdit();
    remember();
    setMotion({ ...designMotion(card), pa: id });
    // 조합 효과를 없애면 "가만히"(조합 효과가 있어도 움직이지 않기)는 뜻이 없어진다. 그 표시를 함께 지운다.
    if (!id && card.items.some((it) => it.an === STILL)) card.items = card.items.map((it) => (it.an === STILL ? cleanItem({ ...it, an: undefined }, { keepSpaces: true }) : it));
    onChange();
    renderPanel();
    previewPage({ transition: false });
  }
  function setTransition(id) {
    const play = () => {
      stopPreview();
      if (!id) return;
      showStage();
      preview = { tr: playTransition(null, cardEl, id), ctl: null, timers: [] };
    };
    if ((card.tr || '') === (id || '')) { play(); return; }
    endEdit();
    remember();
    setMotion({ ...designMotion(card), tr: id });
    onChange();
    renderPanel();
    play();
  }
  // 고른 요소의 움직임. 이미 그 값이면 기록을 남기지 않는다(효과는 다시 틀어 보여 준다).
  function setEnter(id) {
    if ((cur()?.an || '') !== (id || '')) change({ an: id || undefined });
    previewItem();
  }
  function setWait(on) {
    if (!!cur()?.aw !== on) change({ aw: on || undefined });
  }
  function setEmphasis(id) {
    if ((cur()?.em || '') !== (id || '')) change({ em: id || undefined });
    if (id && nodes[sel]) { stopPreview(); showStage(); playEmphasis(nodes[sel], cur(), id); }
  }
  // 사라지기: 고르면 카드 위의 그 조각이 사라져 보이고, 조금 뒤에 다시 보인다(꾸미는 중이니까).
  function setExit(id) {
    if ((cur()?.ex || '') !== (id || '')) change({ ex: id || undefined });
    const n = nodes[sel];
    if (id && n) { stopPreview(); showStage(); playExit(n, cur(), id); setTimeout(() => { if (n.isConnected) n.style.visibility = ''; }, 1600); }
  }
  // 빠르기 · 늦추기: 고르면 그 조각의 나타나기를 다시 틀어 본다.
  function setSpeed(id) {
    if ((cur()?.sp || '') !== (id || '')) change({ sp: id || undefined });
    previewItem();
  }
  function setDelay(sec) {
    if ((cur()?.dl || 0) !== sec) change({ dl: sec || undefined });
  }
  // 계속 움직이기: 고르면 카드 위의 그 조각이 잠깐 되풀이해 움직여 보여 준다(발표가 아니니 몇 바퀴만).
  function setIdle(id) {
    if ((cur()?.lp || '') !== (id || '')) change({ lp: id || undefined });
    idleTry?.cancel(); idleTry = null;
    // "장의 효과대로"를 고르면 조합 효과가 붙여 주는 움직임을 틀어 본다.
    const shown = id === '' ? planMotion(cleanDesign(card, { keepSpaces: true })).loops.find((l) => l.i === sel)?.loop : id;
    if (shown && shown !== STILL && nodes[sel]) {
      stopPreview(); showStage();
      const mine = idleTry = playIdle(nodes[sel], cur(), shown);
      if (mine) setTimeout(() => { if (idleTry === mine) { mine.cancel(); idleTry = null; } }, 5000);
    }
  }

  // 이 장의 움직임 차례(시간표): 장이 열릴 때 나오는 것은 언제부터 얼마 동안인지 막대로, 누를 때 하는 것은 누르는 차례대로 적는다.
  // 줄을 누르면 그 조각을 고른다(그 조각의 움직임을 바로 고칠 수 있게).
  function motionTimeline() {
    const design = cleanDesign(card, { keepSpaces: true });
    const plan = planMotion(design);
    if (!plan.auto.length && !plan.clicks.length) return [];
    const list = design.items;
    const nameOf = (defs, id) => defs.find((d) => d.id === id)?.name || '';
    const total = Math.max(1, plan.ms);
    const sec = (ms) => `${(Math.round(ms / 100) / 10).toFixed(1)}초`;
    const row = (i, body, extra = {}) => el('li', { class: `fe-tl-row${i === sel ? ' on' : ''}` },
      el('button', { type: 'button', class: 'fe-tl-pick', title: '이 조각 고르기', onClick: () => select(i), dataset: { timeline: String(i) }, ...extra }, ...body));
    const autoRows = [...plan.auto].sort((a, b) => a.delay - b.delay || a.i - b.i).map((a) => {
      const ms = enterTime(a.enter, list[a.i]);
      const bar = el('span', { class: 'fe-tl-track', 'aria-hidden': 'true' }, el('span', { class: 'fe-tl-bar', style: `left:${(a.delay / total) * 100}%;width:${Math.max(2, (ms / total) * 100)}%` }));
      return row(a.i, [el('b', { text: itemLabel(list[a.i]) }), el('small', { text: `${nameOf(ENTERS, a.enter)} · ${sec(a.delay)}부터 ${sec(ms)}` }), bar]);
    });
    const clickRows = plan.clicks.map((c, n) => {
      const what = c.emphasis ? `강조 · ${nameOf(EMPHASES, c.emphasis)} ${sec(emphasisTime(c.emphasis, list[c.i]))}`
        : c.exit ? `사라지기 · ${nameOf(EXITS, c.exit)} ${sec(exitTime(c.exit, list[c.i]))}` : `나타나기 · ${nameOf(ENTERS, c.enter)} ${sec(enterTime(c.enter, list[c.i]))}`;
      return row(c.i, [el('span', { class: 'fe-tl-step', text: `누름 ${n + 1}` }), el('b', { text: itemLabel(list[c.i]) }), el('small', { text: what })]);
    });
    const loopNote = plan.loops.length ? el('p', { class: 'fe-note', text: `머무는 동안 계속 움직이는 조각: ${plan.loops.map((l) => `${itemLabel(list[l.i])}(${nameOf(IDLES, l.loop)})`).slice(0, 6).join(', ')}${plan.loops.length > 6 ? ` 외 ${plan.loops.length - 6}개` : ''}` }) : null;
    return [
      el('div', { class: 'fe-head', text: `이 장의 움직임 차례${plan.ms ? ` · ${sec(plan.ms)}` : ''}` }),
      el('ol', { class: 'fe-timeline', 'aria-label': '이 장의 움직임 차례' }, ...autoRows, ...clickRows),
      loopNote,
    ];
  }

  function tabBody() {
    if (tab === 'motion') {
      const here = designMotion(card);
      const waits = items().filter((k) => k.aw || k.em || k.ex).length;
      // 고른 요소가 있으면 맨 위에 그 요소의 움직임이 나온다. 정하지 않은 요소는 장의 조합 효과를 따른다(조합 효과가 없으면 처음부터 보인다).
      const it = cur();
      const mine = it && !it.lock ? motionPart('mine', [sel, itemLabel(it), it.an || '', !!it.aw, it.em || '', it.lp || '', it.ex || '', it.sp || '', it.dl || 0, here.pa || ''].join('|'), () => {
        const follow = { id: '', name: here.pa ? '장의 효과대로' : '없음' };
        const choices = [follow, ...(here.pa ? [{ id: STILL, name: '가만히' }] : []), ...ENTERS];
        const now = it.an === STILL && !here.pa ? '' : it.an || '';
        // 계속 움직이기도 같은 짜임: 장의 조합 효과가 저절로 붙여 주면 "장의 효과대로 · 가만히"가 앞에 온다.
        const combo = COMBOS.find((c) => c.id === here.pa), autoLoops = !!combo?.loops, comboName = combo?.name || '';
        const idleChoices = [{ id: '', name: autoLoops ? '장의 효과대로' : '없음' }, ...(autoLoops ? [{ id: STILL, name: '가만히' }] : []), ...IDLES];
        const idleNow = it.lp === STILL && !autoLoops ? '' : it.lp || '';
        const given = autoLoops && !it.lp ? planMotion(cleanDesign(card, { keepSpaces: true })).loops.find((l) => l.i === sel)?.loop || '' : '';
        return [
          el('div', { class: 'fe-head', text: `고른 조각 · ${itemLabel(it)}` }),
          el('div', { class: 'fe-grid two fe-motion-when', role: 'group', 'aria-label': '나타나는 때' },
            pbtn('장이 열릴 때', () => setWait(false), { 'aria-pressed': String(!it.aw), class: `fe-btn${it.aw ? '' : ' on'}` }),
            pbtn('누를 때', () => setWait(true), { 'aria-pressed': String(!!it.aw), class: `fe-btn${it.aw ? ' on' : ''}` })),
          it.aw ? el('p', { class: 'fe-note', text: '발표하다가 화면을 누르면(또는 오른쪽 화살표 · 스페이스) 그때 나타나요. 여러 개면 위에서부터 하나씩 나와요.' }) : null,
          el('div', { class: 'fe-motions', role: 'group', 'aria-label': '고른 조각이 나타나는 모양', dataset: { group: 'mine' } }, ...choices.map((c) => motionTile({
            group: 'mine', name: c.name, on: now === c.id, kind: c.id && c.id !== STILL ? 'enter' : c.id === '' && here.pa ? 'follow' : 'none', id: c.id,
            onPick: () => setEnter(c.id),
          }))),
          el('div', { class: 'fe-head', text: '누를 때 강조하기' }),
          el('div', { class: 'fe-motions', role: 'group', 'aria-label': '고른 조각의 강조 효과', dataset: { group: 'emph' } },
            motionTile({ group: 'emph', name: '없음', on: !it.em, kind: 'none', onPick: () => setEmphasis('') }),
            ...EMPHASES.map((c) => motionTile({ group: 'emph', name: c.name, on: it.em === c.id, kind: 'emph', id: c.id, onPick: () => setEmphasis(c.id) }))),
          it.em ? el('p', { class: 'fe-note', text: it.aw ? '누르면 나타나고, 한 번 더 누르면 강조해요.' : '이미 보이는 조각이 발표하다가 누를 때 한 번 움직이고 제자리로 돌아와요. 누를 때 나오는 다른 조각과 위에서부터 차례로 이어져요.' }) : null,
          el('div', { class: 'fe-head', text: '누를 때 사라지기' }),
          el('div', { class: 'fe-motions', role: 'group', 'aria-label': '고른 조각이 사라지는 모양', dataset: { group: 'exit' } },
            motionTile({ group: 'exit', name: '없음', on: !it.ex, kind: 'none', onPick: () => setExit('') }),
            ...EXITS.map((c) => motionTile({ group: 'exit', name: c.name, on: it.ex === c.id, kind: 'exit', id: c.id, onPick: () => setExit(c.id) }))),
          it.ex ? el('p', { class: 'fe-note', text: `발표하다가 누르면 사라져요${it.aw || it.em ? '(나타나기 · 강조 다음 차례)' : ''}. 다음 설명으로 넘어가기 전에 앞 것을 치울 때 좋아요. 내려받은 영상에서도 사라져요.` }) : null,
          el('div', { class: 'fe-head', text: '빠르기 · 늦추기' }),
          el('div', { class: 'fe-grid three fe-motion-speed', role: 'group', 'aria-label': '고른 조각의 빠르기' },
            ...SPEEDS.map((s) => pbtn(s.name, () => setSpeed(s.id), { 'aria-pressed': String((it.sp || '') === s.id), class: `fe-btn${(it.sp || '') === s.id ? ' on' : ''}`, dataset: { speed: s.id || 'normal' } }))),
          it.aw ? null : el('div', { class: 'fe-chips fe-motion-delay', role: 'group', 'aria-label': '장이 열린 뒤 늦게 나오기' },
            ...DELAYS.map((d) => pbtn(d ? `${d}초 늦게` : '늦추지 않기', () => setDelay(d), { 'aria-pressed': String((it.dl || 0) === d), class: `fe-chip${(it.dl || 0) === d ? ' on' : ''}`, dataset: { delay: String(d) } }))),
          it.sp || it.dl ? el('p', { class: 'fe-note', text: [it.sp ? `나타나기 · 강조 · 사라지기 · 계속 움직이기가 모두 ${SPEEDS.find((s) => s.id === it.sp)?.name} 움직여요.` : '', it.dl && !it.aw ? `장이 열리고 제 차례보다 ${it.dl}초 늦게 나와요. 여러 조각을 서로 다른 때에 나오게 하면 모션그래픽처럼 짜 맞출 수 있어요.` : ''].filter(Boolean).join(' ') }) : null,
          el('div', { class: 'fe-head', text: '머무는 동안 계속 움직이기' }),
          el('div', { class: 'fe-motions', role: 'group', 'aria-label': '고른 조각이 계속 움직이는 모양', dataset: { group: 'idle' } },
            ...idleChoices.map((c) => motionTile({ group: 'idle', name: c.name, on: idleNow === c.id, kind: c.id && c.id !== STILL ? 'idle' : c.id === '' && autoLoops ? 'follow' : 'none', id: c.id, onPick: () => setIdle(c.id) }))),
          given ? el('p', { class: 'fe-note', text: `이 조각은 장의 "${comboName}" 효과대로 "${IDLES.find((c) => c.id === given)?.name}" 움직여요. 다른 움직임을 고르거나 "가만히"로 멈출 수 있어요.` })
            : IDLES.some((c) => c.id === it.lp) ? el('p', { class: 'fe-note', text: '다 나온 뒤에 그 장에 머무는 동안 숨 쉬듯 살며시 되풀이해 움직여요. 조각마다 박자가 조금씩 달라서 살아 있는 느낌이 나요. 내려받은 영상에도 들어가요.' }) : null,
        ];
      }) : [];
      const combos = motionPart('combo', here.pa || '', () => [
        el('div', { class: 'fe-head', text: '조각들이 나오는 모양 · 조합 효과' }),
        el('div', { class: 'fe-motions', role: 'group', 'aria-label': '조합 효과', dataset: { group: 'combo' } },
          motionTile({ group: 'combo', name: '없음', on: !here.pa, kind: 'none', onPick: () => setCombo('') }),
          ...COMBOS.map((c) => motionTile({ group: 'combo', name: c.name, hint: c.hint, on: here.pa === c.id, kind: 'combo', id: c.id, onPick: () => setCombo(c.id) }))),
      ]);
      const turns = motionPart('tr', here.tr || '', () => [
        el('div', { class: 'fe-head', text: '장이 넘어오는 모양 · 전환 효과' }),
        el('div', { class: 'fe-motions', role: 'group', 'aria-label': '전환 효과', dataset: { group: 'tr' } },
          motionTile({ group: 'tr', name: '없음', on: !here.tr, kind: 'none', onPick: () => setTransition('') }),
          ...TRANSITIONS.map((t) => motionTile({ group: 'tr', name: t.name, on: here.tr === t.id, kind: 'tr', id: t.id, onPick: () => setTransition(t.id) }))),
        morphs(here.tr) ? el('p', { class: 'fe-note', text: '앞 장과 같은 조각(장을 복제해 만든 조각, 또는 글·그림이 같은 조각)이 발표할 때 제자리로 옮겨 가요. 앞 장을 복제한 뒤 조각을 옮기거나 키워 보세요. 내려받은 영상에서도 옮겨 가요(이 편집 화면의 미리 보기는 서서히 바뀌어요).' }) : null,
      ]);
      // "모든 장에 똑같이"는 다른 장에 정해 둔 것을 덮어쓰고 되돌릴 수 없어서, 한 번 더 눌러야 한다.
      const ALL = '모든 장에 똑같이';
      const all = onMotionAll ? el('button', {
        class: 'fe-btn fe-motion-all', type: 'button', title: '이 장의 조합 효과와 전환 효과를 다른 장에도 넣어요(다른 장에 정해 둔 것은 바뀌어요)',
        onClick: () => {
          if (all.dataset.armed !== '1') {
            all.dataset.armed = '1';
            all.textContent = '한 번 더 누르면 다른 장도 바뀌어요';
            all.classList.add('danger');
            setTimeout(() => { if (all.dataset.armed === '1') { delete all.dataset.armed; all.textContent = ALL; all.classList.remove('danger'); } }, 4000);
            return;
          }
          delete all.dataset.armed;
          all.textContent = ALL;
          all.classList.remove('danger');
          onMotionAll(designMotion(card));
        },
      }, ALL) : null;
      const hint = it?.lock ? '잠근 조각은 잠금을 풀면 움직임을 정할 수 있어요. ' : it ? '' : '조각을 하나 고르면 그 조각만 다르게 움직이게 할 수 있어요. ';
      return [
        ...mine, ...motionTimeline(), ...combos, ...turns,
        el('div', { class: 'fe-row fe-motion-go' },
          el('button', { class: 'fe-btn primary', type: 'button', onClick: () => previewPage() }, icon('play'), '이 장 미리 보기'), all),
        hint || waits ? el('p', { class: 'fe-note', text: `${hint}${waits ? `이 장에는 누를 때 나오거나 강조하는 요소가 ${waits}개 있어요.` : ''}`.trim() }) : null,
        el('p', { class: 'fe-note', text: settings().motionNote || '움직임은 "발표"를 누르면 보여요. 내려받은 그림에는 움직임이 없어요.' }),
      ];
    }
    if (tab === 'layout') {
      const tile = (l) => el('button', {
        class: `fe-layout${armed === l.id ? ' armed' : ''}`, type: 'button', dataset: { layout: l.id }, onClick: () => applyLayout(l.id),
      },
        el('span', { class: 'fe-layout-view', 'aria-hidden': 'true' }, designView({ bg: l.bg || card.bg, items: layoutItems(l.id) })),
        el('small', { text: armed === l.id ? '한 번 더 눌러요' : l.name }));
      // 개요로 여러 장 만들기(프로젝트가 outline 을 줄 때만): 틀 하나하나를 고르기 전에, 발표 차례를 적어 장들을 한꺼번에 만든다.
      const fromOutline = typeof outline?.open === 'function' ? [
        el('button', { class: 'fe-outline-start', type: 'button', dataset: { outlineStart: '' }, onClick: () => outline.open() },
          icon('text'), el('span', {}, el('b', { text: '개요로 여러 장 만들기' }), el('small', { text: '차례를 적으면 장마다 제목 · 내용을 놓아 줘요' }))),
      ] : [];
      return [...fromOutline, ...layoutGroups().flatMap((g) => [
        g.name ? el('div', { class: 'fe-head', text: g.name }) : null,
        el('div', { class: 'fe-layouts', role: 'group', 'aria-label': g.name ? `${g.name} 틀` : '틀' }, ...g.list.map(tile)),
        armed && g.list.some((l) => l.id === armed) ? armNote() : null,
      ])];
    }
    if (tab === 'text') {
      return [
        el('div', { class: 'fe-texts' }, ...TEXT_PRESETS.map((p) => el('button', {
          class: `fe-textadd ${p.id}`, type: 'button', onClick: () => add(newPresetText(p.id, { color: backgroundOf(card.bg).ink })),
        }, p.name))),
        el('p', { class: 'fe-note', text: '터치 화면에서는 글을 고른 뒤 한 번 더 누르면 고칠 수 있어요. 글꼴·크기·색은 도구 막대에서 바꿔요.' }),
      ];
    }
    if (tab === 'element') {
      // 연결선: 두 조각을 화살표로 잇는 선(순서도 · 마인드맵 · 관계도). 누르면 이을 조각을 차례로 고른다.
      const linkArt = '<svg viewBox="0 0 120 52" aria-hidden="true" focusable="false"><rect x="3" y="4" width="34" height="24" rx="7" fill="#3d4bc0"/><circle cx="101" cy="34" r="15" fill="#ffc93c"/><path d="M38 16H62Q70 16 70 24V30Q70 34 78 34H80" fill="none" stroke="#1d2433" stroke-width="2.6" stroke-linecap="round"/><path d="M85 34l-7-4.5v9z" fill="#1d2433"/></svg>';
      return [
        el('div', { class: 'fe-head', text: '잇기' }),
        el('button', { class: 'fe-link-start', type: 'button', dataset: { startLink: '' }, onClick: () => startLinking(sel) },
          el('span', { class: 'fe-link-start-art', html: linkArt }),
          el('span', { class: 'fe-link-start-text' }, el('b', { text: '연결선' }), el('small', { text: '두 조각을 화살표로 이어요. 조각을 옮기면 선이 따라와요 (순서도 · 마인드맵)' }))),
        el('div', { class: 'fe-head', text: '그림' }),
        artPicker((p) => add(p.emoji ? newEmoji(p.emoji) : newArt(p.art, artColorable(p.art) ? { color: backgroundOf(card.bg).ink } : {}))),
        ...shapePicker((shape) => add(newShape(shape, visibleColor(shape)))),
      ];
    }
    if (tab === 'upload') return uploadPane();
    if (tab === 'bg') return [bgPicker(), el('p', { class: 'fe-note', text: bgNote })];
    // 레이어: 겹친 순서대로(위에 보이는 것부터). 가려져서 누르기 어려운 것도 여기서 고를 수 있다.
    // 줄을 끌어서 순서를 바꾼다: 마우스는 줄 어디든, 손가락은 왼쪽의 손잡이(목록을 넘기는 것과 헷갈리지 않게). 손잡이에서 ↑ ↓ 글쇠로도 옮긴다.
    const list = el('div', { class: 'fe-layers' });
    list.append(...items().map((k, i) => {
      const row = el('div', { class: 'fe-layer-row', dataset: { i: String(i) } },
        el('button', {
          class: 'fe-layer-grip', type: 'button', title: '끌어서 순서 바꾸기 (↑ ↓ 글쇠로도 돼요)', 'aria-label': `${itemLabel(k)} 순서 바꾸기`,
          onPointerdown: (e) => startSort(e, i, row, list),
          onKeydown: (e) => {
            const to = e.key === 'ArrowUp' ? i + 1 : e.key === 'ArrowDown' ? i - 1 : -1;      // 위쪽 줄이 앞(위에 보이는 것)
            if (to < 0) return;
            e.preventDefault();
            sortTo(i, to, true);
          },
        }, icon('grip')),
        el('button', {
          class: `fe-layer${i === sel ? ' on' : ''}`, type: 'button', 'aria-pressed': String(i === sel), 'aria-label': `${itemLabel(k)}${k.lock ? ' (잠금)' : ''}`,
          onPointerdown: (e) => { if (e.pointerType === 'mouse') startSort(e, i, row, list); },
          onClick: () => { if (sorted) return; select(i); focusStage(); },
        }, icon(ITEM_ICON[k.t] || 'shapes'), el('span', { class: 'fe-layer-name', text: itemLabel(k) }), k.lock ? icon('lock', 'fe-layer-lock') : null));
      return row;
    }).reverse());
    return [
      items().length ? list : el('p', { class: 'fe-note', text: '아직 넣은 조각이 없어요.' }),
      items().length > 1 ? el('p', { class: 'fe-note', text: '눌러서 고르고, 끌어서 순서를 바꿔요. 위에 있는 줄이 그림에서 앞에 보여요.' })
        : items().length ? el('p', { class: 'fe-note', text: '눌러서 골라요. 조각이 여러 개면 끌어서 순서를 바꿀 수 있어요.' }) : null,
    ];
  }

  // 영상 칸: 영상이 없으면 넣는 단추(찍기 · 파일), 있으면 틀어 보기 · 앞뒤 자르기 · 소리 · 화면 맞춤 · 바꾸기 · 빼기.
  function videoBody() {
    const v = card.video;
    const big = (pic, label, onClick, cls = '') => el('button', { class: `fe-btn fe-upload${cls ? ` ${cls}` : ''}`, type: 'button', disabled: filing || !!cam, onClick }, icon(pic), label);
    const record = (label, cls) => (createCamera ? big('record', label, openCamera, cls) : null);
    const pick = (label, cls) => big('upload', filing ? '영상을 살펴보는 중…' : label, () => videoInput.click(), cls);
    const where = videoNote ? el('p', { class: 'fe-note', text: videoNote }) : null;
    const care = el('p', { class: 'fe-note', text: '내가 찍은 것, 허락을 받은 것만 넣어요. 다른 사람의 얼굴이나 목소리가 나오면 먼저 허락을 받아요.' });
    if (cam) {
      return [
        el('p', { class: 'fe-note strong', text: '그림 칸에 카메라가 보여요. 보이는 그대로 이 장의 바탕이 돼요.' }),
        el('p', { class: 'fe-note', text: `"찍기 시작"을 누르고, 다 찍으면 "멈추기"를 눌러요. 한 번에 ${minutesText(limits.maxSeconds)}까지 찍을 수 있어요.` }),
        el('p', { class: 'fe-note', text: '앞뒤에 필요 없는 부분은 넣은 뒤에 잘라 낼 수 있어요.' }),
        care,
      ];
    }
    if (!v) {
      return [
        record('카메라로 찍기', 'primary'),
        pick('영상 파일 고르기', createCamera ? '' : 'primary'),
        el('p', { class: 'fe-note', text: '영상은 이 장의 바탕에 깔려요. 그 위에 글과 조각을 올려 꾸밀 수 있어요.' }),
        el('p', { class: 'fe-note', text: `MP4나 WebM 영상을 넣을 수 있어요(${minutesText(limits.maxFileSeconds)}, ${megabytes(limits.maxBytes)}MB까지).` }),
        where, care,
      ];
    }
    const swap = [
      el('div', { class: 'fe-head', text: '영상 바꾸기' }),
      el('div', { class: `fe-grid${createCamera ? ' two' : ''} fe-video-swap` }, record('다시 찍기'), pick('다른 파일')),
      el('button', { class: 'fe-btn fe-video-remove', type: 'button', disabled: filing, onClick: removeVideo }, icon('trash'), '영상 빼기'),
    ];
    if (scene?.state === 'missing') {
      return [
        el('p', { class: 'fe-note strong', text: '이 기기에는 이 영상 파일이 없어요.' }),
        el('p', { class: 'fe-note', text: '영상 파일은 넣은 기기에만 있어요. 그 기기에서 열면 다시 보여요. 여기서 새 영상으로 바꿀 수도 있어요.' }),
        ...swap, where,
      ];
    }
    const ready = scene?.state === 'ready';
    const length = el('span', { class: 'fe-video-len' });
    const showLength = () => { length.textContent = `쓰는 길이 ${videoTime(videoSeconds(card.video), { tenths: true })} · 전체 ${videoTime(card.video.dur, { tenths: true })}`; };
    showLength();
    // 앞 · 뒤 자르기: 막대를 끄는 동안 그 자리의 모습을 꾸미기 판에 보여 준다. 놓으면 첫 모습으로 돌아간다.
    const lastStep = Math.floor(v.dur * 10) / 10;           // 막대의 마지막 눈금(전체 길이는 0.1초 단위가 아닐 수 있다)
    const trim = (label, edge) => {
      let started = false;
      const out = el('span', { class: 'fe-num', text: videoTime(card.video[edge], { tenths: true }) });
      const input = el('input', {
        type: 'range', min: '0', max: String(lastStep), step: '0.1', value: String(Math.min(lastStep, card.video[edge])), disabled: !ready,
        'aria-label': `${label} 자리(초)`, 'aria-valuetext': videoTime(card.video[edge], { tenths: true }), dataset: { edge },
        onInput: () => {
          if (!card.video) return;
          if (!started) { started = true; endEdit(); remember(); scene?.player.pause(); }
          const raw = Number(input.value);
          putVideo(trimVideo(card.video, edge, edge === 'out' && raw >= lastStep ? card.video.dur : raw));
          // 반대쪽 끝에 막혀 더 갈 수 없는 곳까지 끌었으면 손잡이를 멈춘 자리에 둔다
          const now = card.video[edge];
          if (Math.abs(Math.min(lastStep, now) - raw) > 0.001) input.value = String(Math.min(lastStep, now));
          out.textContent = videoTime(now, { tenths: true });
          input.setAttribute('aria-valuetext', out.textContent);
          showLength();
          markTime(card.video.in);
          if (scene) { scene.shown = -1; scene.player.seek(edge === 'out' ? Math.max(card.video.in, now - 0.05) : now); }
        },
        onChange: () => {
          if (!started) return;
          started = false;
          syncScene();                     // 첫 모습으로 돌려놓는다
          onChange();
        },
      });
      return el('label', { class: 'fe-slider wide time' }, el('span', { text: label }), input, out);
    };
    let volStarted = false;
    const volOut = el('span', { class: 'fe-num', text: `${v.vol}%` });
    const vol = el('input', {
      type: 'range', min: '0', max: '100', step: '5', value: String(v.vol), 'aria-label': '소리 크기',
      onInput: () => {
        if (!card.video) return;
        if (!volStarted) { volStarted = true; endEdit(); remember(); }
        putVideo({ ...card.video, vol: Number(vol.value) });
        volOut.textContent = `${card.video.vol}%`;
      },
      onChange: () => { if (volStarted) { volStarted = false; onChange(); } },
    });
    return [
      el('div', { class: 'fe-video-now' },
        el('button', { class: 'fe-btn primary fe-video-play', type: 'button', disabled: !ready, 'aria-pressed': String(!!scene?.player.playing), onClick: toggleVideo },
          icon(scene?.player.playing ? 'pause' : 'play'), scene?.player.playing ? '멈추기' : '틀어 보기'),
        el('span', { class: 'fe-video-bar', 'aria-hidden': 'true' }, el('span', { class: 'fe-video-fill' }))),
      length,
      el('div', { class: 'fe-head', text: '앞뒤 자르기' }),
      trim('시작', 'in'), trim('끝', 'out'),
      el('p', { class: 'fe-note', text: '막대를 옮기면 그 자리의 모습이 그림 칸에 보여요. 잘라도 원래 영상은 그대로라서 다시 늘릴 수 있어요.' }),
      el('div', { class: 'fe-head', text: '소리' }),
      el('label', { class: 'fe-slider wide' }, el('span', {}, icon('sound')), vol, volOut),
      el('div', { class: 'fe-head', text: '화면 맞춤' }),
      el('div', { class: 'fe-grid two', role: 'group', 'aria-label': '화면 맞춤' }, ...VIDEO_FITS.map((f) => pbtn(f.name, () => { if (card.video.fit !== f.id) changeVideo({ fit: f.id }); }, {
        'aria-pressed': String(v.fit === f.id), class: `fe-btn fe-video-fit${v.fit === f.id ? ' on' : ''}`, title: f.hint, dataset: { fit: f.id },
      }))),
      // 발표할 때: 누르면 틀기(PowerPoint 의 "클릭할 때"처럼 첫 모습으로 기다린다) · 장이 열리면 바로 틀기
      el('div', { class: 'fe-head', text: '발표할 때' }),
      el('div', { class: 'fe-grid two', role: 'group', 'aria-label': '발표할 때 영상을 트는 때' },
        ...[['click', '누르면 틀기', '다음(→ · 스페이스 · 리모컨)을 누르면 틀어져요'], ['auto', '장이 열리면 바로', '장이 열리자마자 저절로 틀어져요']].map(([id, name, hint]) => {
          const on = (id === 'auto') === !!v.auto;
          return pbtn(name, () => { if (on) return; changeVideo({ auto: id === 'auto' || undefined }); panel.querySelector(`.fe-video-start[data-start="${id}"]`)?.focus({ preventScroll: true }); }, {
            'aria-pressed': String(on), class: `fe-btn fe-video-start${on ? ' on' : ''}`, title: hint, dataset: { start: id },
          });
        })),
      el('p', { class: 'fe-note', text: v.auto ? '장이 열리면 저절로 틀어져요.' : '발표할 때 영상이 첫 모습으로 기다리다가, 다음을 누르면 틀어져요. 한 번 더 누르면 다음 차례로 넘어가요.' }),
      ...swap,
      el('p', { class: 'fe-note', text: videoHint || '영상은 "발표"에서 소리와 함께 틀어져요. 그림으로 내려받으면 첫 모습이 나와요.' }),
      where,
    ];
  }

  // 영상 칸: 이 장의 바탕 영상(파일 · 찍기. saveVideo 가 있을 때) 과 유튜브 영상(조각으로 놓는다)을 한곳에서.
  function videoPane() {
    const yt = [el('div', { class: 'fe-head', text: '유튜브 영상' }), ytAdder()];
    if (!saveVideo) return yt;
    return [el('div', { class: 'fe-head', text: '이 장의 바탕 영상' }), ...videoBody(), el('div', { class: 'fe-video-split', 'aria-hidden': 'true' }), ...yt];
  }
  // 내 자료: 종류를 먼저 고르고, 고른 자료의 작업만 보여 준다.
  function uploadPane() {
    const choices = [['photo', '사진'], ...(hasDocumentImport ? [['ppt', 'PPT']] : []), ['video', '영상']];
    const choose = id => {
      if (importingDocument || !choices.some(([key]) => key === id)) return;
      uploadTab = id; armedFile = null; renderPanel({ top: true });
      panel.querySelector(`[data-upload-tab="${id}"]`)?.focus({ preventScroll: true });
    };
    const tabs = el('div', { class: 'fe-upload-tabs', role: 'tablist', 'aria-label': '자료 종류', dataset: { uploadTabs: '' } },
      ...choices.map(([id, name], index) => el('button', {
        class: `fe-upload-tab${uploadTab === id ? ' on' : ''}`, type: 'button', role: 'tab', id: `${uploadTabsId}-tab-${id}`,
        'aria-selected': String(uploadTab === id), 'aria-controls': `${uploadTabsId}-panel-${id}`, tabindex: uploadTab === id ? '0' : '-1',
        dataset: { uploadTab: id }, disabled: importingDocument,
        onClick: () => choose(id), onKeydown: event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % choices.length : event.key === 'ArrowLeft' ? (index + choices.length - 1) % choices.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : -1;
          if (next < 0) return; event.preventDefault(); choose(choices[next][0]);
        },
      }, name)));
    const content = uploadTab === 'photo' ? (libraryOn() ? uploadBody() : directPhotoBody()) : uploadTab === 'ppt' ? pptUploadBody() : videoPane();
    return [tabs, ...choices.map(([id]) => el('div', {
      class: 'fe-upload-panel', role: 'tabpanel', id: `${uploadTabsId}-panel-${id}`, 'aria-labelledby': `${uploadTabsId}-tab-${id}`,
      dataset: { uploadPanel: id }, hidden: uploadTab !== id,
    }, ...(uploadTab === id ? content : [])))];
  }
  function uploadHelp(id, title, ...notes) {
    const details = el('details', { class: 'fe-upload-help', open: uploadHelpOpen[id], dataset: { uploadHelp: id } },
      el('summary', { text: title }), el('div', { class: 'fe-upload-help-body' }, ...notes.filter(Boolean)));
    details.addEventListener('toggle', () => { uploadHelpOpen[id] = details.open; }); return details;
  }
  function photoHelp(note) {
    return uploadHelp('photo', '사진 올리기 안내',
      note ? el('p', { class: 'fe-note', text: note }) : null,
      el('p', { class: 'fe-note', text: '사진을 고르면 배경 제거, 테두리 모양, 크기, 투명도, 뒤집기를 쓸 수 있어요.' }),
      el('p', { class: 'fe-note', text: '내가 찍거나 그린 것, 허락을 받은 것만 올려요. 얼굴·이름 같은 개인 정보도 살펴봐요.' }));
  }
  function directPhotoBody() {
    const photos = photosHere();
    return [el('button', {
      class: 'fe-btn primary fe-upload', type: 'button', disabled: busy,
      onClick: () => { if (photos >= settings().maxPhotos) { notify(`사진은 카드 한 장에 ${settings().maxPhotos}장까지예요.`); return; } fileInput.click(); },
    }, ...(busy ? ['올리는 중…'] : [icon('upload'), '사진 올리기'])),
    el('p', { class: 'fe-note', text: `이 장에 사진 ${photos}/${settings().maxPhotos}장` }), photoHelp('PNG·JPG 사진이나 그림을 올려요.')];
  }
  function pptUploadBody() {
    return [el('div', { class: 'fe-ppt-intro' }, icon('screen'),
      el('b', { text: 'PPT를 온바탕으로' }), el('p', { class: 'fe-note', text: '글·도형·사진을 편집할 수 있어요.' })),
    ...documentImportBody(),
    el('div', { class: 'fe-ppt-size' }, icon('cover'), el('div', {}, el('b', { text: '원본 비율로 자동 맞춤' }),
      el('p', { class: 'fe-note', text: '16:9·4:3 등 PPT 크기에 맞춰 열어요.' }))),
    el('p', { class: 'fe-note', text: '현재 그림은 저장한 뒤 새 자료로 열어요.' }),
    uploadHelp('ppt', '가져오기 안내',
      el('p', { class: 'fe-note', text: 'PPTX 파일의 슬라이드를 살펴보고 가져올 쪽을 골라요. 원본 파일은 바뀌지 않아요.' }),
      typeof documentImport?.description === 'string' && documentImport.description.trim()
        ? el('p', { class: 'fe-note', text: documentImport.description.trim() }) : null)];
  }

  // ---------- 유튜브 영상 넣기 ----------
  // 주소를 붙여 넣으면 카드 가운데에 영상이 놓인다(영상의 이름표와 시작 시각만 저장한다). 발표할 때 누르면 그 자리에서 틀어진다.
  function addYouTube(text) {
    const found = parseYouTube(text);
    if (!found) { notify('유튜브 영상 주소가 아니에요. 유튜브에서 "공유 → 복사"한 주소를 붙여 넣어요.', 4500); return false; }
    add(newYouTube(found.id, { start: found.start || 0 }));
    notify(found.start ? `유튜브 영상을 넣었어요. 발표할 때 스페이스 바를 누르면 ${ytTime(found.start)}부터 틀어져요.` : '유튜브 영상을 넣었어요. 발표할 때 스페이스 바를 누르면 틀어져요.', 3500);
    return true;
  }
  function ytAdder() {
    const go = () => { if (addYouTube(youtubeInput.value)) youtubeInput.value = ''; };
    const input = youtubeInput ||= el('input', {
      class: 'fe-search fe-yt-input', type: 'url', inputmode: 'url', placeholder: 'https://youtu.be/…', 'aria-label': '유튜브 영상 주소', autocomplete: 'off', spellcheck: 'false',
      onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } },
    });
    return el('div', { class: 'fe-yt-add', role: 'group', 'aria-label': '유튜브 영상 넣기' },
      el('div', { class: 'fe-row fe-yt-row' }, input, el('button', { class: 'fe-btn', type: 'button', onClick: go }, icon('plus'), '넣기')),
      el('p', { class: 'fe-note', text: '공개된 유튜브 영상을 넣을 수 있어요.' }),
      uploadHelp('youtube', '유튜브 사용 안내', el('p', { class: 'fe-note', text: '유튜브의 "공유 → 복사" 주소를 붙여 넣어요. 꾸미기 판에서 Ctrl+V로 붙여 넣어도 돼요. 발표할 때 스페이스 바로 틀고 멈춰요(인터넷 필요).' })));
  }
  // 시작 시각 칸: "1:30" · "90" · "1m30s" 를 받는다. 비우면 처음부터.
  function ytStartBody(it) {
    const input = el('input', { class: 'fe-search fe-yt-start', type: 'text', inputmode: 'numeric', value: it.start ? ytTime(it.start) : '', placeholder: '0:00', 'aria-label': '시작 시각' });
    const apply = () => change({ start: ytStart(input.value) });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    return [
      el('div', { class: 'fe-poshead', text: '시작 시각' }),
      el('div', { class: 'fe-row' }, input, pbtn('정하기', apply), pbtn('처음부터', () => change({ start: 0 }), { disabled: !it.start })),
      el('p', { class: 'fe-note', text: '예: 1:30 이면 1분 30초부터 틀어져요.' }),
      el('div', { class: 'fe-poshead', text: '발표할 때' }),
      el('div', { class: 'fe-grid two' },
        pbtn('스페이스 바로 틀기', () => change({ auto: false }), { 'aria-pressed': String(!it.auto), class: `fe-btn${it.auto ? '' : ' on'}` }),
        pbtn('장이 열리면 바로 틀기', () => change({ auto: true }), { 'aria-pressed': String(!!it.auto), class: `fe-btn${it.auto ? ' on' : ''}` })),
      el('p', { class: 'fe-note', text: '발표 중 스페이스 바: 영상 틀기 → 멈추기 → 다시 틀기. 다음 장은 → 글쇠나 화면 누르기로 넘어가요.' }),
    ];
  }

  function documentImportBody() {
    if (!hasDocumentImport) return [];
    const button = el('button', {
      class: 'fe-btn primary fe-upload fe-document-import', type: 'button', dataset: { documentImport: '' },
      disabled: busy || importingDocument || filing || !!cam,
      'aria-busy': importingDocument ? 'true' : null,
      onClick: async () => {
        if (!card || busy || importingDocument || filing || cam) return;
        importingDocument = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
        for (const control of panel.querySelectorAll('[data-upload-tab]')) control.disabled = true;
        try { await documentImport.open(); }
        catch { notify('가져오기 화면을 열지 못했어요. 지금 그림을 확인하고 다시 시도해주세요.', 4500); }
        finally {
          importingDocument = false;
          if (card) {
            const current = panel.querySelector('[data-document-import]');
            if (current) { current.disabled = busy || filing || !!cam; current.removeAttribute('aria-busy'); }
            for (const control of panel.querySelectorAll('[data-upload-tab]')) control.disabled = false;
          }
        }
      },
    }, icon('upload'), documentImport.label.trim());
    return [button];
  }

  function uploadBody() {
    const files = keepUploads();
    const max = settings().maxUploads;
    for (const url of thumbs.keys()) if (!files.some(sameUrl(url))) thumbs.delete(url);
    const armedImg = armedFile ? files.find(sameUrl(armedFile)) : null;
    if (!armedImg) armedFile = null;
    const uses = armedImg ? usesOf(armedImg.url) : 0;
    const tile = (img, n) => {
      const used = usesOf(img.url) > 0;
      let view = thumbs.get(img.url);
      if (!view) {
        view = el('img', { src: img.url, alt: '', draggable: 'false', onError: () => view.classList.add('broken') });
        thumbs.set(img.url, view);
      }
      return el('div', { class: `fe-file${used ? ' used' : ''}${armedFile === img.url ? ' armed' : ''}` },
        el('button', {
          class: 'fe-file-view', type: 'button', disabled: busy, title: '눌러서 카드에 넣기', 'aria-label': `올린 파일 ${n} 카드에 넣기${used ? ' (쓰는 중)' : ''}`,
          onClick: () => placeUpload(img, view),
        }, view),
        used ? el('span', { class: 'fe-file-mark', text: '쓰는 중' }) : null,
        el('button', {
          class: 'fe-file-del', type: 'button', disabled: busy, title: '이 파일 지우기', 'aria-label': `올린 파일 ${n} 지우기`, 'aria-pressed': String(armedFile === img.url),
          onClick: () => {
            armedFile = armedFile === img.url ? null : img.url;
            renderPanel();
            // 긴 목록의 아래쪽에서 눌렀으면 묻는 칸이 화면 밖에 있다. 보이는 곳으로 데려온 뒤에 초점을 준다(보지 못한 채 지우지 않게)
            panel.querySelector('.fe-file-ask')?.scrollIntoView?.({ block: 'nearest' });
            panel.querySelector('.fe-file-ask .fe-btn')?.focus({ preventScroll: true });
          },
        }, icon('trash')));
    };
    return [
      el('button', {
        class: 'fe-btn primary fe-upload', type: 'button', disabled: busy,
        onClick: () => {
          if (files.length >= max) { notify(`올린 파일은 ${max}개까지 둘 수 있어요. 안 쓰는 파일을 지우고 다시 올려요.`, 4500); return; }
          fileInput.click();
        },
      }, ...(busy ? ['올리는 중…'] : [icon('upload'), '사진 올리기'])),
      el('div', { class: 'fe-files-head' }, el('b', { class: 'fe-head', text: '올린 파일' }), el('span', { class: 'fe-files-count', text: `${files.length}/${max}` })),
      // 지우기 전에 한 번 더 묻는다. 쓰고 있는 파일이면 쓴 곳에서도 사라진다고 알려 준다.
      armedImg ? el('div', { class: 'fe-file-ask', role: 'group', 'aria-label': '올린 파일 지우기' },
        el('p', { class: 'fe-note strong', text: uses ? `이 파일을 지우면 그림에서 쓴 ${uses}곳에서도 사라져요.` : '이 파일을 올린 목록에서 지울까요?' }),
        uses > usesHere(armedImg.url) ? el('p', { class: 'fe-note', text: '다른 장에서 쓴 것까지 지워서, 실행 취소로 되돌릴 수 없어요.' }) : null,
        el('div', { class: 'fe-row' },
          el('button', { class: 'fe-btn danger', type: 'button', onClick: () => removeUpload(armedImg.url) }, icon('trash'), '지우기'),
          pbtn('그만두기', () => { armedFile = null; renderPanel(); }))) : null,
      files.length
        ? el('div', { class: 'fe-files' }, ...files.map((img, i) => tile(img, i + 1)).reverse())
        : el('div', { class: 'fe-files-empty' }, icon('image'), el('p', { class: 'fe-note', text: '아직 올린 사진이 없어요.' })),
      photoHelp(`사진을 누르면 이 장에 놓여요(한 장에 ${settings().maxPhotos}장까지). 여러 번 넣어도 올린 파일은 하나예요.`),
    ];
  }

  // ---------- 레이어를 끌어서 순서 바꾸기 ----------
  // 줄은 위에서 아래로 "앞에 보이는 것부터"다(목록의 번호와 반대 차례). 끄는 동안에는 줄만 움직이고, 놓을 때 한 번에 순서를 바꾼다.
  function sortTo(from, to, viaKeys = false) {
    const [next, at] = moveLayer(items(), from, to);
    if (next === items()) return;
    endEdit();
    stopDrag();
    remember();
    card.items = next;
    listChanged(at);
    if (viaKeys) panel.querySelector(`.fe-layer-row[data-i="${at}"] .fe-layer-grip`)?.focus({ preventScroll: true });
  }
  // 넘길 수 있는 가장 가까운 칸(미니캔의 옆 칸). 없으면 화면 전체가 넘어간다.
  function scrollerOf(node) {
    for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;
  }
  function startSort(e, i, row, list) {
    sorting?.stop();                       // 손을 뗀 것을 놓친 채 남은 끌기가 있으면 정리한다
    if (e.button > 0 || items().length < 2) return;
    const rows = [...list.children];
    const at = rows.indexOf(row);
    const box = scrollerOf(list);
    const S = {
      id: e.pointerId, row, list, rows, from: i, at, to: at, y0: e.clientY, y: e.clientY, on: false, box,
      scroll0: box ? box.scrollTop : window.scrollY, pitch: 0, raf: 0,
    };
    sorting = S;
    const scrolled = () => (S.box ? S.box.scrollTop : window.scrollY) - S.scroll0;
    const paint = () => {
      const dy = S.y - S.y0 + scrolled();
      S.to = Math.min(S.rows.length - 1, Math.max(0, S.at + Math.round(dy / S.pitch)));
      S.rows.forEach((r, j) => {
        if (r === S.row) r.style.transform = `translateY(${dy}px)`;
        else r.style.transform = j > S.at && j <= S.to ? `translateY(${-S.pitch}px)` : j < S.at && j >= S.to ? `translateY(${S.pitch}px)` : '';
      });
    };
    // 끄는 손이 칸의 위·아래 끝에 가까우면 목록을 넘긴다(긴 목록에서 멀리 옮길 수 있게).
    const tick = () => {
      if (sorting !== S || !S.on) return;
      const [top, bottom] = S.box ? [S.box.getBoundingClientRect().top, S.box.getBoundingClientRect().bottom] : [0, window.innerHeight];
      const by = S.y < top + 36 ? -8 : S.y > bottom - 36 ? 8 : 0;
      if (by) {
        if (S.box) S.box.scrollTop += by; else window.scrollBy(0, by);
        paint();
      }
      S.raf = requestAnimationFrame(tick);
    };
    const move = (ev) => {
      if (ev.pointerId !== S.id) return;
      if (!row.isConnected) { S.stop(); return; }      // 끄는 사이에 칸을 다시 그렸다: 그만둔다
      S.y = ev.clientY;
      if (!S.on) {
        if (Math.abs(S.y - S.y0) < 5) return;
        S.on = true;
        const first = S.rows[0].getBoundingClientRect();
        S.pitch = S.rows.length > 1 ? S.rows[1].getBoundingClientRect().top - first.top : first.height + 4;
        list.classList.add('sorting');
        row.classList.add('dragging');
        S.raf = requestAnimationFrame(tick);
      }
      ev.preventDefault();
      paint();
    };
    // 끌기를 끝낸다(순서는 바꾸지 않는다): 지켜보던 것을 떼고 줄을 제자리에 둔다.
    S.stop = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', done, true);
      window.removeEventListener('pointercancel', done, true);
      window.removeEventListener('blur', S.stop);
      cancelAnimationFrame(S.raf);
      if (sorting === S) sorting = null;
      list.classList.remove('sorting');
      row.classList.remove('dragging');
      for (const r of S.rows) r.style.transform = '';
    };
    const done = (ev) => {
      if (ev.pointerId !== S.id) return;
      const moved = S.on;
      S.stop();
      if (!moved || !row.isConnected) return;
      // 끌어 놓은 뒤에 따라오는 "누르기"는 모른 척한다(아래에서 직접 고르거나 옮긴다).
      sorted = true;
      setTimeout(() => { sorted = false; }, 0);
      if (ev.type !== 'pointerup') return;
      const n = S.rows.length;
      if (S.to !== S.at) sortTo(n - 1 - S.at, n - 1 - S.to);
      else { select(i); focusStage(); }       // 끌었지만 자리가 그대로다: 누른 것으로 친다
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', done, true);
    window.addEventListener('pointercancel', done, true);
    window.addEventListener('blur', S.stop);
  }

  // ---------- 함께 꾸밀 때: 다른 사람이 바꾼 것 끼워 넣기 ----------
  // 지금 끼워 넣어도 되는지: 끄는 중 · 레이어를 끄는 중 · 메뉴가 열린 중에는 기다린다(손 밑의 것이 바뀌지 않게).
  // 글을 고치는 중에는 기다리지 않는다(오래 걸린다): 고치는 글상자만 그대로 두고 끼워 넣는다(merge).
  const idle = () => !!card && !drag && !sorting && !menu && !press && !cropJob;
  // 되돌리기 기록에도 다른 사람이 바꾼 것을 끼워 넣는다. 그래서 실행 취소는 내가 한 것만 되돌리고, 친구가 바꾼 것은 그대로 둔다.
  // patch: { items: Map(이름표 → 새 요소 또는 null(지워졌다)), added: Set(다른 사람이 새로 넣은 이름표), order: [지금 이름표 차례], bg?, pa?, tr? }
  // 다른 사람이 새로 넣은 것만 예전 기록에도 끼워 넣는다(내가 넣고 친구가 고친 것은, 내가 넣기 전 기록에 생기지 않게).
  function rebase(patch) {
    if (!past.length && !future.length) return;
    // 사진 주소는 기록처럼 번호로 바꿔 둔다(한 번만)
    const items = new Map([...patch.items].map(([id, v]) => [id, v && v.t === 'image' && typeof v.url === 'string' && v.url.length > 200 ? { ...v, url: shotOf(v.url) } : v]));
    const fix = (text) => {
      const s = JSON.parse(text);
      s.items = rebaseItems(s.items, { items, added: patch.added, order: patch.order });
      if ('bg' in patch) s.bg = patch.bg;
      for (const key of ['pa', 'tr']) if (key in patch) { if (patch[key]) s[key] = patch[key]; else delete s[key]; }
      return JSON.stringify(s);
    };
    past = past.map(fix);
    future = future.map(fix);
  }
  /**
   * 다른 사람이 바꾼 것을 끼워 넣는다(되돌리기 기록에 남기지 않고, onChange 도 부르지 않는다). 부르기 전에 idle() 을 본다.
   * next: 끼워 넣은 뒤의 디자인 { bg, items(이름표가 붙은), pa?, tr? } · patch: rebase 와 같다(다른 사람의 것으로 바꾼 것들).
   * 고른 요소는 이름표로 다시 찾아 그대로 둔다(그 요소가 지워졌으면 고르기를 푼다).
   */
  function merge(next, patch = { items: new Map() }) {
    if (!card || !next) return;
    const was = cur();
    const selId = was?.id || '';
    // 글을 고치는 중이면 그 글상자는 내 것 그대로 두고, 그 칸(글자를 치는 자리)도 떼지 않는다(친구는 내가 고른 것을 고치지 못한다).
    // 고치던 글상자를 친구가 지웠으면 고치기를 끝낸다.
    let keepId = '';
    let keepNode = null;
    if (editing >= 0) {
      const mine = items()[editing];
      if (mine?.id && next.items.some((it) => it.id === mine.id)) {
        keepId = mine.id;
        keepNode = nodes[editing];
        next = { ...next, items: next.items.map((it) => (it.id === keepId ? mine : it)) };
        if (patch.items.has(keepId)) patch = { ...patch, items: new Map([...patch.items].filter(([id]) => id !== keepId)) };
      } else endEdit();
    }
    card.items = cleanItems(next.items, { keepSpaces: true });
    const bgChanged = next.bg !== undefined && cleanBg(next.bg) !== card.bg;
    if (next.bg !== undefined) card.bg = cleanBg(next.bg);
    setMotion(next);
    sel = selId ? card.items.findIndex((it) => it.id === selId) : -1;
    many = [];                         // 다른 사람이 바꾼 것을 끼워 넣으면 번호가 달라진다: 여럿 고른 것은 푼다
    if (selId && sel < 0) { pop = null; cut = null; }
    rebase(patch);
    const at = keepNode ? card.items.findIndex((it) => it.id === keepId) : -1;
    if (at >= 0) {
      // 고치는 글상자는 그대로 두고 둘레의 것만 새로 놓는다(글자를 치던 자리와 글쇠 입력이 끊기지 않게)
      paintCard(cardEl, card.bg);
      nodes = card.items.map((it, i) => (i === at ? keepNode : itemView(it)));
      for (const n of [...cardEl.children]) if (n !== scene?.layer && n !== keepNode) n.remove();
      keepNode.before(...nodes.slice(0, at));
      keepNode.after(...nodes.slice(at + 1));
      editing = at;
      syncSel();
    } else renderStage();
    const now = cur();
    if (JSON.stringify(now || null) !== JSON.stringify(was || null)) renderUi();
    else if (tab === 'layer' || (tab === 'bg' && bgChanged) || tab === 'motion') renderPanel();
    markHistory();
  }

  /** 꾸밀 디자인을 바꾼다(다른 카드·다른 쪽으로 넘어갈 때). 고르기와 되돌리기 기록은 비워진다. */
  function setDesign(next) {
    stopLinking();
    sampling?.controller.abort();sampling=null;
    card = next && typeof next === 'object' ? next : { bg: undefined, items: [] };
    card.bg = cleanBg(card.bg);
    card.items = cleanItems(card.items, { keepSpaces: true, strict: !!card.id });
    if (card.id) card.items = card.items.map(it => it.id ? it : { ...it, id: newId() });
    setMotion(card);
    setVideo(card);
    if (cleanNotes(card.notes)) card.notes = cleanNotes(card.notes); else delete card.notes;
    notesInput.value = card.notes || '';
    markNotes();
    closeCamera();                     // 찍던 것은 그만둔다(다른 장의 바탕이 되면 안 된다)
    scene?.player.pause();
    if (scene) scene.shown = -1;       // 같은 영상을 쓰는 다른 장이면 그 장의 첫 모습으로 맞춘다
    stopPreview();
    sel = -1;
    many = [];
    others = [];
    past = [];
    future = [];
    pop = null;
    cut = null;
    armed = null;
    armedFile = null;
    editing = -1;
    sorting?.stop();
    stopDrag();
    stopPress();
    closeMenu();
    // 움직임 칸을 보고 있었으면 그대로 둔다(장마다 전환 효과를 정하는 중일 수 있다). 빈 장은 템플릿 칸부터.
    // 영상 칸도 그대로 둔다(장마다 영상을 넣는 중일 수 있다).
    tab = videoOpen() ? 'upload' : !card.items.length ? 'layout' : tab === 'motion' && settings().motion ? 'motion' : 'text';
    motionSel = -1;
    renderStage();
    renderBar();
    renderPanel({ top: true });        // 다른 카드다: 칸을 맨 위부터 보여 준다(템플릿 칸은 그 카드의 배경에 맞는 묶음이 맨 위에 있다)
  }

  /**
   * 카드의 모양(가로 ÷ 세로)을 바꾼다. 놓아 둔 요소는 새 모양에 맞춘다(model.js 의 reshapeItems).
   *   fit: false — 요소의 크기는 그대로, 자리만 같은 비율의 자리로(도형·사진은 찌그러지지 않게 높이만 맞춘다).
   *   fit: true  — 지금 그림을 통째로 줄여서 새 모양 안에 넣는다(요소끼리의 관계가 그대로다).
   * 실행 취소로 되돌아간다(그때는 onAspect 로 알린다). 바뀐 모양을 돌려준다.
   */
  function setAspect(aspect, { fit = false } = {}) {
    const from = settings().aspect;
    const want = Number(aspect);
    if (!card || !(want > 0)) return from;
    const to = Math.min(4, Math.max(0.25, want));      // configure 가 받는 범위와 같다
    if (to === from) return from;
    endEdit();
    stopDrag();
    stopPress();
    closeMenu();
    if (card.items.length) remember();       // 빈 카드의 모양을 바꾼 것은 기록하지 않는다(되돌릴 것이 없다)
    configure({ aspect: to });
    pop = null;
    cut = null;
    card.items = reshapeItems(card.items, from, to, { fit });
    renderStage();
    renderBar();
    renderPanel();
    onChange();
    return to;
  }

  /**
   * 기본 짜임으로 host 안에 놓는다: 넓으면 도구 막대가 위에 길게, 그 아래 왼쪽에 카드·오른쪽에 옆 메뉴.
   * 좁으면 카드 → 도구 막대 → 옆 메뉴 차례로 쌓인다(editor.css 의 .fe-app).
   */
  function mount(host) {
    host.classList.add('fe-app');
    host.replaceChildren(el('div', { class: 'fe-app-stage' }, stage), el('div', { class: 'fe-app-tools' }, toolbar), el('div', { class: 'fe-app-panel' }, panel));
    syncSel();
    return api;
  }

  const api = {
    stage, toolbar, panel, mount, setDesign,
    /** 발표자 노트 칸(접고 펴는 칸). 프로젝트가 그림 아래 등 원하는 자리에 놓는다. 놓지 않으면 노트는 그대로 저장만 된다. */
    notes,
    /** 장(슬라이드) 자체의 표시를 바꾼다: 지금은 hidden(발표에서 건너뛰기)만. 그림이 아니라서 되돌리기 기록에는 넣지 않는다. */
    patchSlide: (patch) => {
      if (!card || !patch || typeof patch !== 'object') return;
      if ('hidden' in patch) { if (patch.hidden === true) card.hidden = true; else delete card.hidden; }
      if ('topic' in patch) { const topic = cleanTopic(patch.topic); if (topic) card.topic = topic; else delete card.topic; }
      if ('dur' in patch) { if (Number.isInteger(patch.dur) && patch.dur >= 1) card.dur = patch.dur; else delete card.dur; }
      onChange();
    },
    /** 카드 밖(그림 둘레의 빈 곳)을 우클릭했을 때: 고르기를 풀고 카드의 빈 곳 메뉴(붙여넣기 · 되돌리기 · slideMenu)를 띄운다. */
    menuAt: (x, y) => { if (!card) return; select(-1); openMenu(x, y, { keep: true }); },
    /** 프로젝트가 만든 메뉴를 편집기와 같은 모양으로 띄운다(슬라이드 목록 등). groups: [[{ icon, label, hint?, run, disabled?, danger? }]] */
    showMenu: (x, y, groups, { label = '메뉴' } = {}) => showMenu(x, y, hostRows(groups), { label }),
    /** Host navigation can restore an existing tool without knowing its DOM selectors. */
    openTab: id => { if (card && tabsHere().some(([name]) => name === id)) openTab(id); },
    /** 내 자료 칸을 그 종류로 연다(호스트가 "유튜브 영상으로 바꿔요"를 안내할 때). kind: 'photo' · 'video'('youtube' 도 영상 칸) */
    openUpload: kind => { if (!card || !['photo', 'youtube', 'video'].includes(kind) || !tabsHere().some(([name]) => name === 'upload')) return; uploadTab = kind === 'photo' ? 'photo' : 'video'; armedFile = null; openTab('upload'); renderPanel({ top: true }); },
    /** 함께 꾸밀 때: 다른 사람이 바꾼 것을 끼워 넣는다 merge(design, patch) · 지금 끼워 넣어도 되는지 idle() */
    merge, idle,
    /** 함께 꾸밀 때: 다른 사람이 고른 요소들 [{ id, name, color }] 에 그 사람의 색 테두리를 두른다(빈 목록이면 지운다). */
    /** 지금 고른 요소의 이름표(없으면 ''). 이름표는 프로젝트가 onChange 에서 붙이므로, 막 넣은 요소는 onSelect 뒤에 여기로 다시 본다. */
    selectedId: () => cur()?.id || '',
    markOthers: (list) => { others = Array.isArray(list) ? list.filter((o) => o && typeof o.id === 'string') : []; if (card) drawOthers(); },
    /** 카드의 모양(가로 ÷ 세로)을 바꾼다. setAspect(aspect, { fit }) — fit 이 참이면 그림을 통째로 줄여 맞추고, 아니면 요소의 크기를 그대로 둔다. */
    setAspect,
    /** 지금 디자인의 정리된 사본 { bg, items } (저장할 때 쓴다). 움직임을 정했으면 pa · tr 도 들어 있다. */
    getDesign: () => cleanDesign(card),
    /** 올린 파일 목록 [{ url, path? }] (올린 차례대로. 디자인과 함께 저장했다가, 편집기를 만들 때 uploads 로 다시 준다). */
    getUploads: () => keepUploads().map((u) => ({ ...u })),
    /** 올린 파일 목록을 바꿔 끼운다(다른 그림을 열었을 때). */
    setUploads: (list) => { setUploads(list); armedFile = null; if (card && tab === 'upload') renderPanel(); },
    /** 밖에서 디자인을 바꿨을 때(배경 등) 다시 그린다. */
    refresh: () => { if (card) { renderStage(); renderBar(); renderPanel(); } },
    /** 고를 수 있는 글꼴이 바뀌었을 때(fonts() 가 다른 목록을 돌려주게 됐을 때) 도구 막대를 다시 그린다. */
    refreshFonts: () => { if (card && editing < 0 && !drag) renderBar(); },
    /**
     * 영상을 찍거나 넣는 중인지: 'recording'(카메라로 찍는 중) · 'saving'(찍은 것을 넣는 중) · 'filing'(고른 파일을 넣는 중) · ''(아니다).
     * 그동안 다른 장으로 가거나 편집기를 치우면 찍던 것이 사라지므로, 프로젝트는 이것을 보고 그런 일을 미룬다.
     */
    busy: () => (cam?.phase === 'recording' || cam?.phase === 'saving' ? cam.phase : filing ? 'filing' : ''),
    /** 조용히 한다: 틀어 보던 영상을 멈추고, (찍는 중이 아니면) 카메라를 끈다. 발표 화면이나 큰 창을 띄우기 전에 부른다. */
    quiet: () => {
      scene?.player.pause();
      if (cam && cam.phase !== 'recording' && cam.phase !== 'saving') closeCamera();
    },
    /** 되돌리기 기록을 비운다(예: 저장한 뒤 안 쓰는 사진 파일을 지웠다면, 그 사진을 되살리는 되돌리기는 막아야 한다). */
    forget: () => { past = []; future = []; if (card) renderBar(); },
    /** 편집기를 치운다(열린 메뉴와 지켜보던 것들을 정리한다). 화면 조각은 프로젝트가 떼어 낸다. */
    destroy: () => {
      dismissCrop();
      document.removeEventListener('pointerdown',onCropOutside,true);
      sampling?.controller.abort();sampling=null;
      closeMenu();
      stopPress();
      stopDrag();
      sorting?.stop();
      stopPreview();
      closeCamera();
      dropScene();
      watcher?.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', onFontsLoaded);
      card = null;
    },
  };
  setUploads(uploads);
  setDesign(design || emptyDesign());
  return api;
}
