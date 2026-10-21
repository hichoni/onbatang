// 온바탕 편집기의 영상 내보내기(브라우저): 여러 장의 디자인을, 발표할 때의 움직임 그대로 영상 파일 하나로 만든다.
//
// 어떻게 그리는가(화면을 녹화하지 않는다)
//   1. 한 장의 요소들을 "움직이는 것 하나씩"과 "가만히 있는 것들의 묶음"으로 나눠, 투명한 그림으로 한 번만 그려 둔다(export.js 의 designSheet).
//      그림은 그림으로 내려받을 때와 같은 방법으로 그리므로 글꼴 · 줄 바꿈 · 도형이 편집 화면과 똑같다.
//   2. 프레임마다 시간표(film.js)에서 그 순간의 모습(자리 · 크기 · 각도 · 투명도 · 가리개)을 받아, 그 그림들을 canvas 에 옮겨 붙인다.
//      장이 넘어갈 때는 두 장을 따로 그린 뒤 전환 효과의 모습대로 겹친다.
//   3. 그 canvas 를 영상으로 만든다. 두 가지 길이 있다.
//      가. 한 장씩 인코딩하기(WebCodecs 의 VideoEncoder. 먼저 써 본다): 프레임을 한 장 그릴 때마다 인코더에 넣고, 나온 조각들을 파일로 묶는다(mux.js).
//          시계를 따라가지 않으므로 기기가 느려도 프레임이 빠지지 않고(정확히 fps 장), 화질을 직접 정하고, 빠른 기기에서는 영상 길이보다 빨리 끝난다.
//          파일에 길이와 찾아가기 표가 온전히 들어간다.
//      나. 틀면서 녹화하기(MediaRecorder. 인코더를 쓸 수 없는 브라우저에서): 처음부터 끝까지 한 번 틀면서 녹화한다. 영상 길이만큼 걸리고,
//          기기가 밀리면 프레임이 빠질 수 있다.
//      모두 이 기기 안에서 끝난다(서버로 아무것도 보내지 않는다).
//
// 영상 장면(그 장의 바탕에 깐 영상)은 프레임마다 그 순간의 장면을 영상 파일에서 꺼내(reel.js) 바탕 위에 그리고, 요소들을 그 위에 얹는다.
// 소리는 시간표대로 한 줄로 섞어(sound.js) 인코딩해서 파일에 함께 담는다(한 장씩 인코딩하는 길에서만. 틀면서 녹화하는 길에는 소리가 없다).
//
// 메모리를 아끼려고 지금 장과 그 앞뒤 장의 그림만 들고 있는다.
import { el } from './dom.js';
import { itemView, paintCard } from './render.js';
import { cleanDesign, fontFamilyOf } from './model.js';
import { designSheet } from './export.js';
import { transitionPose, clipInsets, TURN_DEPTH, tweenItem, contentChanged } from './motion.js';
import { filmPlan, slidePoses, filmCells, packCells, DEFAULT_STAY, MAX_FILM_SECONDS } from './film.js';
import { mp4Parts, webmParts } from './mux.js';
import { sceneBlob } from './scene.js';
import { openReel, videoInfo } from './reel.js';
import { soundTrack, mixSound, hasSound, decodeSound, encodeSound, soundKinds } from './sound.js';

const RAD = Math.PI / 180;
const FONT_WAIT_MS = 6000;       // 글의 크기를 재기 전에 글꼴을 기다리는 가장 긴 시간
const STRIP = 8;                 // 뒤집기 효과를 그릴 때 장을 세로로 나누는 띠의 너비(px. 넓으면 위아래 가장자리가 계단처럼 보인다)
const BACKDROP = '#000';         // 장 뒤로 보이는 바탕(발표 화면과 같다)
const SCENE_END = 0.03;          // 영상 장면의 마지막 모습: 쓰는 구간의 끝에서 이만큼(초) 앞의 장면(발표 화면이 멈추는 자리와 같다)

// 써 볼 파일 종류: 휴대폰이나 다른 프로그램에서도 잘 열리는 MP4(H.264)를 먼저, 안 되면 WebM.
// (크롬이 녹화한 MP4 는 조각으로 나뉜 파일이라 길이가 적혀 있지 않다. 틀어지기는 하지만, 재생기에 따라 길이가 안 보이거나 건너뛰기가 안 될 수 있다.)
const VIDEO_TYPES = [
  { mime: 'video/mp4;codecs=avc1.42E028', ext: 'mp4', type: 'video/mp4' },
  { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4', type: 'video/mp4' },
  { mime: 'video/webm;codecs=vp8', ext: 'webm', type: 'video/webm' },
  { mime: 'video/webm', ext: 'webm', type: 'video/webm' },
];
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const nextFrame = () => new Promise((resolve) => { requestAnimationFrame(resolve); });
const even = (v) => Math.max(2, Math.round(v / 2) * 2);

/** 이 브라우저에서 녹화할 수 있는 파일 종류들(먼저 써 볼 것부터) [{ mime, ext, type }]. */
export function videoTypes() {
  if (typeof MediaRecorder !== 'function') return [];
  return VIDEO_TYPES.filter((t) => { try { return MediaRecorder.isTypeSupported(t.mime); } catch { return false; } });
}
// 한 장씩 인코딩할 때 써 볼 것들(먼저 써 볼 것부터): H.264 → MP4(어디서나 잘 열린다), 안 되면 VP9 · VP8 → WebM.
// H.264 는 화질이 좋은 설정(High)부터 써 본다. 수준(level)은 그림의 크기와 초당 장수가 들어가는 가장 낮은 것으로 고른다
// (수준이 모자라면 인코더가 받아 주지 않고, 쓸데없이 높으면 오래된 재생기가 꺼린다).
const AVC_LEVELS = [[0x1f, 3600, 108000], [0x28, 8192, 245760], [0x2a, 8704, 522240], [0x32, 22080, 589824], [0x33, 36864, 983040], [0x34, 36864, 2073600]];   // [수준, 한 장의 칸 수, 1초의 칸 수]
function encodeCandidates(width, height, fps) {
  const cells = Math.ceil(width / 16) * Math.ceil(height / 16);          // 16px 칸(매크로블록)의 수
  const level = (AVC_LEVELS.find(([, frame, rate]) => cells <= frame && cells * fps <= rate) || AVC_LEVELS.at(-1))[0].toString(16).padStart(2, '0');
  const vp9 = cells <= 8192 && cells * fps <= 245760 ? '40' : '51';
  return [
    { codec: `avc1.6400${level}`, family: 'avc', ext: 'mp4', type: 'video/mp4' },
    { codec: `avc1.4d00${level}`, family: 'avc', ext: 'mp4', type: 'video/mp4' },
    { codec: `avc1.42e0${level}`, family: 'avc', ext: 'mp4', type: 'video/mp4' },
    { codec: `vp09.00.${vp9}.08`, family: 'vp9', ext: 'webm', type: 'video/webm' },
    { codec: 'vp8', family: 'vp8', ext: 'webm', type: 'video/webm' },
  ];
}
const canEncode = () => typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';
const canRecord = () => typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' && videoTypes().length > 0;
/** 영상 장면(바탕에 깐 영상)을 움직이는 채로 · 소리와 함께 담을 수 있는지(한 장씩 인코딩할 수 있어야 한다. 아니면 멈춘 그림으로 담긴다). */
export const canFilmScenes = () => canEncode();
/** 이 브라우저에서 영상으로 만들 수 있는지(한 장씩 인코딩하거나, 틀면서 녹화하거나). */
export function canMakeVideo() {
  return canEncode() || canRecord();
}

// ---------- 한 장을 그림들로 준비하기 ----------

// 글의 크기를 재려면 그 글꼴이 이 화면에도 받아져 있어야 한다. 쓰는 글꼴을 받아 둔다(너무 오래 걸리면 그냥 간다).
async function documentFonts(design) {
  if (!document.fonts || typeof document.fonts.load !== 'function') return;
  const wants = new Map();
  for (const it of design.items) {
    const family = it.t === 'text' ? fontFamilyOf(it.font) : '';
    if (!family) continue;
    const font = `${it.italic ? 'italic ' : ''}${it.bold ? 900 : 500} 16px "${family}"`;
    wants.set(font, (wants.get(font) || '') + it.text);
  }
  if (!wants.size) return;
  await Promise.race([
    Promise.all([...wants].map(([font, text]) => document.fonts.load(font, text || '가').catch(() => []))),
    wait(FONT_WAIT_MS),
  ]);
}

// 요소들이 카드 위에서 차지하는 자리를 잰다(px). 화면 밖에 그 크기의 카드를 잠깐 놓고 읽는다.
// 돌려주는 것: 요소마다 { x, y, w, h(돌리고 뒤집은 뒤의 바깥 네모) · bw, bh(돌리기 전 제 칸의 크기) }
async function measure(design, W, H) {
  const card = paintCard(el('div', { class: 'fe-card', 'aria-hidden': 'true' }, ...design.items.map(itemView)), design.bg);
  card.style.setProperty('--fe-ratio', String(W / H));
  card.style.setProperty('--fe-card-radius', '0');
  Object.assign(card.style, { position: 'fixed', left: '-100000px', top: '0', width: `${W}px`, height: `${H}px`, visibility: 'hidden', pointerEvents: 'none' });
  document.body.append(card);
  try {
    await documentFonts(design);
    const base = card.getBoundingClientRect();
    return [...card.children].map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, bw: node.offsetWidth, bh: node.offsetHeight };
    });
  } finally {
    card.remove();
  }
}

// 영상 장면을 그릴 준비: 영상 파일의 릴을 열고, 첫 모습과 마지막 모습을 그림으로 떠 둔다(트기 전 · 다 튼 뒤 · 장이 넘어가는 동안에 쓴다).
// 파일이 이 기기에 없거나 읽지 못하면 null(그때는 바탕에 그려 둔 멈춘 그림이 그대로 보인다).
// 장면(now)은 둘 가운데 하나다: 릴이 빌려준 것(다음 장면을 꺼내면 못 쓰게 된다. 꺼낸 바로 뒤에 그릴 때만 쓴다)이거나, 베껴 둔 것(own. 오래 두고 그려도 된다).
const copyPic = async (pic) => ({ source: await createImageBitmap(pic.source), width: pic.width, height: pic.height, rotation: pic.rotation });
const closePic = (pic) => { try { pic?.source.close?.(); } catch { /* 이미 닫힘 */ } };
async function openScene(video, timing) {
  let reel = null;
  const pics = [];
  try {
    const blob = await sceneBlob(video.src);
    if (!blob) return null;
    reel = await openReel(blob);
    const grab = async (t) => {
      const pic = await reel.frame(t);
      if (!pic) throw new Error('영상의 장면을 꺼내지 못했어요');
      pics.push(await copyPic(pic));
      return pics.at(-1);
    };
    const last = await grab(Math.max(video.in, video.out - SCENE_END));
    const first = await grab(video.in);
    return { reel, first, last, now: null, own: null, broken: false, start: timing.start, ms: timing.ms, from: video.in, fit: video.fit };
  } catch (ex) {
    console.warn(ex);
    reel?.close();
    pics.forEach(closePic);
    return null;
  }
}
function closeScene(scene) {
  if (!scene) return;
  scene.reel.close();
  scene.now = null;
  for (const pic of [scene.first, scene.last, scene.own]) closePic(pic);
  scene.own = null;
}

// 이어 움직이기(영상): 짝이 된 요소마다 앞 장의 모습에서 이 장의 모습까지의 중간 모습을 진짜 값으로 여러 장 그려 둔다(tweenItem).
// 늘이거나 줄인 그림이 아니라 둥글기 · 테두리 · 색 · 글자 크기가 그 순간의 값인 그림이라, 옮겨 가는 동안 모든 모습이 이어진다.
// 몇 장을 그릴지는 요소의 넓이에 맞춘다(큰 사진은 덜, 작은 조각은 더. 메모리를 지키려고).
const TWEEN_STEPS = 24, TWEEN_LEAST = 8, TWEEN_PIXELS = 36e6;
async function buildTweens(before, design, turn, W, H) {
  const pairs = (turn.pairs || []).filter(([i, j]) => before.items[i] && design.items[j]);
  if (!pairs.length) return null;
  const area = (it) => Math.max(1, ((Number(it.w) || 10) / 100) * W) * Math.max(1, ((Number(it.h) || Number(it.w) || 10) / 100) * H) * 1.6;
  const need = pairs.reduce((sum, [i, j]) => sum + Math.max(area(before.items[i]), area(design.items[j])) * (contentChanged(before.items[i], design.items[j]) ? 2 : 1), 0);
  const steps = Math.max(TWEEN_LEAST, Math.min(TWEEN_STEPS, Math.floor(TWEEN_PIXELS / need)));
  const items = [], tracks = new Map();
  for (const [i, j] of pairs) {
    const a = before.items[i], b = design.items[j], two = contentChanged(a, b), track = { b: [], a: two ? [] : null };
    for (let k = 0; k <= steps; k++) {
      track.b.push(items.length); items.push(tweenItem(a, b, k / steps));
      if (two) { track.a.push(items.length); items.push(tweenItem(a, b, k / steps, { content: 'a' })); }
    }
    tracks.set(j, track);
  }
  const sheetDesign = { bg: design.bg, items };
  const boxes = await measure(sheetDesign, W, H);
  const cells = filmCells(sheetDesign, { moves: items.map((_, i) => ({ i })) }, boxes, W, H).filter((c) => c.i >= 0);
  const sheets = packCells(cells), canvases = [];
  for (const s of sheets) canvases.push((await designSheet(sheetDesign, s.cells, { width: W, height: H, sheetWidth: s.width, sheetHeight: s.height })).canvas);
  const layerOf = new Map(cells.map((c) => [c.i, { img: canvases[c.sheet], sx: c.at.x, sy: c.at.y, w: c.box.w, h: c.box.h, ox: c.box.x, oy: c.box.y, cx: (items[c.i].x / 100) * W, cy: (items[c.i].y / 100) * H }]));
  const out = new Map();
  for (const [j, t] of tracks) {
    const b = t.b.map((n) => layerOf.get(n)), a = t.a?.map((n) => layerOf.get(n)) || null;
    if (b.every(Boolean) && (!a || a.every(Boolean))) out.set(j, { steps, b, a });
  }
  return { tracks: out, canvases };
}

// 한 장을 그릴 준비: 칸을 나누고 큰 그림에 그려, 프레임마다 옮겨 붙일 "겹(layer)"들로 만든다.
async function buildSlide(design, slide, W, H, before = null) {
  // 움직이는 것이 없으면 잴 것도 없다: 통째로 한 칸이다(그림으로 내려받을 때와 같다).
  // 영상 장면이 있는 장은 요소들을 바탕과 따로 그려야 해서(그 사이에 영상이 들어간다) 잰다.
  const boxes = slide.moves.length || slide.split?.length || design.video ? await measure(design, W, H) : null;
  const cells = filmCells(design, slide, boxes, W, H);
  const sheets = packCells(cells);
  const canvases = [];
  const missingFonts = new Set();
  for (const s of sheets) {
    const made = await designSheet(design, s.cells, { width: W, height: H, sheetWidth: s.width, sheetHeight: s.height });
    canvases.push(made.canvas);
    for (const f of made.missingFonts) missingFonts.add(f);
  }
  const layers = cells.map((c) => {
    const it = c.i >= 0 ? design.items[c.i] : null;
    const b = c.i >= 0 ? boxes[c.i] : null;
    return {
      img: canvases[c.sheet], sx: c.at.x, sy: c.at.y, w: c.box.w, h: c.box.h, ox: c.box.x, oy: c.box.y, i: c.i, bg: !!c.bg,
      // 움직이는 요소: 가운데 점 · 제 칸의 크기 · 기울기 · 뒤집기(가리개를 그 요소의 방향대로 놓을 때 쓴다)
      cx: it ? (it.x / 100) * W : 0, cy: it ? (it.y / 100) * H : 0, bw: b?.bw || 0, bh: b?.bh || 0,
      rot: Number(it?.rot) || 0, fx: !!it?.fx, fy: !!it?.fy,
    };
  });
  // 영상 장면: 시간표에 트는 때가 적혀 있을 때만(멈춘 그림으로 담는 길에서는 적혀 있지 않다) 릴을 연다.
  const scene = slide.scene && design.video ? await openScene(design.video, slide.scene) : null;
  const tweens = slide.turn?.pairs && before ? await buildTweens(before, design, slide.turn, W, H) : null;
  return { slide, layers, canvases, missingFonts: [...missingFonts], scene, tweens };
}
function freeSlide(built) {
  for (const c of [...(built?.canvases || []), ...(built?.tweens?.canvases || [])]) { c.width = 0; c.height = 0; }
  closeScene(built?.scene);
}

// ---------- 그리기 ----------

// 영상 장면의 그 순간의 모습을 카드에 맞춰 그린다(꽉 채우기 · 다 보이게. 화면의 object-fit 과 같은 계산). 남는 곳은 까맣다.
function drawScene(ctx, W, H, scene, local) {
  const pic = local >= scene.start + scene.ms ? scene.last : local >= scene.start && scene.now ? scene.now : scene.first;
  const turned = pic.rotation % 180 !== 0;      // 세워 찍은 영상: 돌려서 그린다
  const [dw, dh] = turned ? [pic.height, pic.width] : [pic.width, pic.height];
  const k = scene.fit === 'contain' ? Math.min(W / dw, H / dh) : Math.max(W / dw, H / dh);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(W / 2, H / 2);
  if (pic.rotation) ctx.rotate(pic.rotation * RAD);
  ctx.drawImage(pic.source, (-pic.width * k) / 2, (-pic.height * k) / 2, pic.width * k, pic.height * k);
  ctx.restore();
}

// 한 장을 그 순간(local)의 모습으로 그린다. local 이 Infinity 면 모두 다 나온 모습이다.
function drawSlide(ctx, W, H, built, local, skip = null) {
  const poses = slidePoses(built.slide, local);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, W, H);
  for (const L of built.layers) {
    if (skip && skip.has(L.i)) continue;              // 이어 움직이기: 옮겨 그릴 요소는 따로 그린다
    const p = L.i >= 0 ? poses.get(L.i) : null;
    if (!p) {
      ctx.drawImage(L.img, L.sx, L.sy, L.w, L.h, L.ox, L.oy, L.w, L.h);
      // 바탕 바로 위에 영상 장면의 프레임을 그린다(요소들은 그 위에 얹힌다).
      if (L.bg && built.scene) drawScene(ctx, W, H, built.scene, local);
      continue;
    }
    if (p.o <= 0.001 || p.clip >= 99.999) continue;
    const dx = (p.x / 100) * W;
    const dy = (p.y / 100) * W;      // 세로로 옮기는 거리도 카드 "너비"를 따른다(화면에서 cqw 로 옮기는 것과 같다)
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.o);
    if (p.clip > 0) {
      // 가리개는 요소의 제 방향(기울기 · 뒤집기 · 크기)을 따라간다. 그 방향으로 좌표를 돌려 놓고 네모를 잘라 둔다.
      const [top, right, bottom, left] = clipInsets(p.clip, L.fx);
      ctx.translate(L.cx + dx, L.cy + dy);
      ctx.rotate((L.rot + p.r) * RAD);
      ctx.scale(p.k * (L.fx ? -1 : 1), p.k * (L.fy ? -1 : 1));
      ctx.beginPath();
      ctx.rect(-L.bw / 2 + (left / 100) * L.bw, -L.bh / 2 + (top / 100) * L.bh, L.bw * (1 - (left + right) / 100), L.bh * (1 - (top + bottom) / 100));
      ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // 그려 둔 그림은 이미 제자리에 기울고 뒤집힌 모습이다. 가운데 점을 붙들고 더 옮기고 · 돌리고 · 키우기만 한다.
    ctx.translate(L.cx + dx, L.cy + dy);
    ctx.rotate(p.r * RAD);
    ctx.scale(p.k, p.k);
    ctx.translate(-L.cx, -L.cy);
    ctx.drawImage(L.img, L.sx, L.sy, L.w, L.h, L.ox, L.oy, L.w, L.h);
    ctx.restore();
  }
}

// 세로축으로 돌린 장(뒤집기 효과): 세로 띠로 나눠, 멀어지는 쪽은 좁고 작게 그린다(화면의 perspective · rotateY 와 같은 계산).
function drawTurned(ctx, W, H, img, deg, depth) {
  const cos = Math.cos(deg * RAD);
  const sin = Math.sin(deg * RAD);
  if (Math.abs(cos) < 0.005) return;
  const at = (x) => { const s = depth / (depth + x * sin); return { x: x * cos * s, s }; };
  const strips = Math.ceil(W / STRIP);
  const dw = W / strips;
  for (let n = 0; n < strips; n++) {
    const a = at(-W / 2 + n * dw);
    const b = at(-W / 2 + (n + 1) * dw);
    const s = (a.s + b.s) / 2;
    const left = Math.min(a.x, b.x);
    // 띠 사이에 실금이 보이지 않게 아주 조금 겹쳐 그린다.
    ctx.drawImage(img, n * dw, 0, dw, H, W / 2 + left - 0.3, H / 2 - (H * s) / 2, Math.abs(b.x - a.x) + 0.6, H * s);
  }
}
// 한 장(다 그려 둔 그림)을 전환 효과의 모습대로 그린다. pose 가 없으면 그대로.
function drawTurnSide(ctx, W, H, img, pose, depth) {
  if (!pose) { ctx.drawImage(img, 0, 0); return; }
  if (pose.o <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, pose.o);
  if (pose.inset) {
    const [top, right, bottom, left] = pose.inset;
    ctx.beginPath();
    ctx.rect((W * left) / 100, (H * top) / 100, W * (1 - (left + right) / 100), H * (1 - (top + bottom) / 100));
    ctx.clip();
  }
  if (pose.circle != null) {
    // 동그라미의 반지름 % 는 "가로 · 세로로 만든 대각선 ÷ √2" 에 대한 값이다(CSS 의 circle() 과 같다).
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, (pose.circle / 100) * (Math.hypot(W, H) / Math.SQRT2), 0, Math.PI * 2);
    ctx.clip();
  }
  if (pose.turn) drawTurned(ctx, W, H, img, pose.turn, depth);
  else {
    ctx.translate(W / 2 + (pose.x / 100) * W, H / 2);
    ctx.scale(pose.k, pose.k);
    ctx.drawImage(img, -W / 2, -H / 2);
  }
  ctx.restore();
}

// 이어 움직이기(영상): 짝 없는 것은 두 장을 서서히 바꾸고(앞 장 → 이 장), 짝이 된 요소는 따로 그려 둔 칸을
// 앞 장의 자리·크기·각도에서 이 장의 것으로 옮겨 그린다(발표 화면의 FLIP 과 같은 모습). 옮기는 동안 앞 장의 그림 위에 이 장의 그림이 서서히 겹친다.
// p: 0~1(전환 효과의 속도 곡선을 거친 값).
function drawMorph(ctx, W, H, from, to, turn, p, flat, n) {
  const pairs = turn.pairs, changed = new Set(turn.changed || []);
  const skipOld = new Set(pairs.map(([i]) => i)), skipNew = new Set(pairs.map(([, j]) => j));
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(flat(0, n - 1, Infinity, skipOld), 0, 0);
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, p));
  ctx.drawImage(flat(1, n, 0, skipNew), 0, 0);
  ctx.restore();
  const mix = (a, b) => a + (b - a) * p;
  const q = Math.min(1, Math.max(0, p));
  // 중간 모습들 가운데 지금(q)에 가까운 두 장을 같은 가운데에 맞춰 겹친다(자리는 매끄럽게, 모습은 아주 작은 걸음으로 이어진다).
  const track = (list, steps, alpha) => {
    if (alpha <= 0.001) return;
    const f = q * steps, k = Math.min(steps - 1, Math.floor(f)), fr = f - k, L0 = list[k], L1 = list[k + 1];
    const cx = L0.cx + (L1.cx - L0.cx) * fr, cy = L0.cy + (L1.cy - L0.cy) * fr;
    for (const [L, a] of [[L0, alpha], [L1, alpha * fr]]) {
      if (a <= 0.001) continue;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(cx - L.cx, cy - L.cy);
      ctx.drawImage(L.img, L.sx, L.sy, L.w, L.h, L.ox, L.oy, L.w, L.h);
      ctx.restore();
    }
  };
  for (const [i, j] of pairs) {
    const tw = to.tweens?.tracks.get(j);
    if (tw) {
      // 내용이 달라졌으면 앞 내용의 갈래는 사라지고 새 내용의 갈래가 나타난다(둘 다 같은 자리 · 같은 모습으로 옮겨 간다).
      if (tw.a) { track(tw.a, tw.steps, 1 - q); track(tw.b, tw.steps, q); } else track(tw.b, tw.steps, 1);
      continue;
    }
    const A = from.layers.find((L) => L.i === i), B = to.layers.find((L) => L.i === j);
    if (!A || !B || !A.bw || !B.bw || !A.bh || !B.bh) continue;
    // 지금의 가운데 · 각도 · 크기(제 방향으로 잰 가로 · 세로)
    const cx = mix(A.cx, B.cx), cy = mix(A.cy, B.cy), rot = mix(A.rot, B.rot), bw = mix(A.bw, B.bw), bh = mix(A.bh, B.bh);
    // 그려 둔 칸은 제자리에 이미 기울어 있다: 제 각도를 풀고 · 제 방향으로 늘리고 · 지금 각도로 돌려 지금 자리에 놓는다.
    const place = (L, alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.rotate(rot * RAD);
      ctx.scale(bw / L.bw, bh / L.bh);
      ctx.rotate(-L.rot * RAD);
      ctx.translate(-L.cx, -L.cy);
      ctx.drawImage(L.img, L.sx, L.sy, L.w, L.h, L.ox, L.oy, L.w, L.h);
      ctx.restore();
    };
    // (중간 모습을 그리지 못했을 때만) 같은 모습이면 앞 것 위에 새것을 서서히 겹치고, 달라졌으면 앞 것은 사라지고 새것이 나타난다.
    place(A, changed.has(j) ? 1 - q : 1);
    place(B, q);
  }
}

// ---------- 필름: 그 순간의 그림을 그려 주는 것 ----------

/**
 * 디자인들로 필름을 만든다. 필름은 "몇 번째 장의 언제"를 주면 그 순간의 그림을 canvas 에 그려 준다(녹화는 recordFilm 이 한다).
 * - designs: 디자인들(장의 차례대로) · width · height: 영상의 크기(px. 짝수로 맞춘다) · stay: 한 장이 머무는 시간(초)
 * - canvas: 그릴 canvas(안 주면 새로 만든다. 화면에 붙여 두면 만드는 모습을 보여 줄 수 있다)
 * - scenes: 거짓이면 영상 장면을 틀지 않고 첫 모습의 멈춘 그림으로 그린다(그 장도 다른 장처럼 머무는 시간만큼만 이어진다)
 * 돌려주는 것: {
 *   canvas, width, height, plan(시간표. film.js 의 filmPlan)
 *   ready(n):       n 번째 장을 그릴 준비를 한다(약속). 이미 했으면 바로 끝난다
 *   seek(n, local, { keep }): 그 순간에 보일 영상 장면의 프레임을 꺼내 둔다(약속). draw 를 부르기 전에 부르고, 끝난 뒤에 그린다(영상 장면이 없거나 틀 때가 아니면 바로 끝난다).
 *                   끝나기를 기다리지 않고 그릴 것이면(틀면서 녹화할 때) keep 을 준다: 꺼낸 프레임을 베껴 두어, 다음 것을 꺼내는 동안에도 그릴 수 있다
 *   stills():       움직이는 채로 담지 못한 영상 장면의 수(파일을 읽지 못했거나 꺼내다 실패해서 멈춘 그림으로 그린 것)
 *   draw(n, local): n 번째 장이 시작된 지 local(ms) 이 지난 순간을 그린다. 그 장이 준비되어 있어야 하고,
 *                   전환 효과가 도는 동안이면 앞 장도 준비되어 있어야 한다(없으면 전환 없이 그린다)
 *   drop(n):        n 번째 장의 그림을 버린다(메모리를 돌려준다)
 *   close():        모두 버린다
 *   sound({ signal }): 영상 장면들의 소리를 시간표대로 한 줄로 섞는다(약속). 돌려주는 것: { track(sound.js 의 큰 줄. 들릴 소리가 없으면 null), lost(소리가 있는데 풀지 못한 영상이 있었는지) }
 *   missingFonts(): 받지 못해 기본 글꼴로 그린 글꼴의 이름들
 * }
 */
export function createFilm(designs, { width = 1920, height = 1080, stay = DEFAULT_STAY, canvas = null, scenes = true } = {}) {
  const W = even(width);
  const H = even(height);
  const list = (Array.isArray(designs) ? designs : []).map((d) => cleanDesign(d, { keepSpaces: true }));
  const plan = filmPlan(list, { stay, scenes });
  const out = canvas || document.createElement('canvas');
  out.width = W;
  out.height = H;
  // 영상의 그림은 늘 빈틈없이 차 있다. 투명한 곳이 없다고 알려 두면 녹화할 때 투명도까지 따로 담지 않는다(느린 기기에서 일이 준다).
  const ctx = out.getContext('2d', { alpha: false });
  // 뒤집기 효과의 원근: 발표 화면에서 보던 깊이감이 나도록, 보통의 화면(1366 × 768)에 꽉 차게 띄운 카드를 기준으로 맞춘다.
  const depth = TURN_DEPTH * (W / Math.min(1366, 768 * (W / H)));
  const jobs = new Map();          // 장 번호 → 준비하는 약속
  const built = new Map();         // 장 번호 → 준비된 것
  const missing = new Set();
  const still = new Set();         // 영상 장면을 움직이는 채로 담지 못한 장들
  // 한 장을 통째로 그려 둔 그림 두 장: 0 은 나가는 장, 1 은 지금 장. held 는 거기에 지금 무엇이 그려져 있는지.
  const flats = [null, null];
  const held = ['', ''];
  const flat = (k, n, local, skip = null) => {
    const key = `${n}:${local}${skip ? `:-${[...skip].join(',')}` : ''}`;
    if (!flats[k]) { flats[k] = document.createElement('canvas'); flats[k].width = W; flats[k].height = H; }
    if (held[k] !== key) { const c = flats[k].getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.clearRect(0, 0, W, H); drawSlide(c, W, H, built.get(n), local, skip); held[k] = key; }
    return flats[k];
  };
  const forget = (n) => { for (const k of [0, 1]) if (held[k].startsWith(`${n}:`)) held[k] = ''; };

  function ready(n) {
    if (!plan.slides[n]) return Promise.reject(new Error('없는 장이에요'));
    if (!jobs.has(n)) {
      const job = buildSlide(list[n], plan.slides[n], W, H, n > 0 ? list[n - 1] : null).then((b) => {
        // 준비하는 사이에 버려졌으면(그만뒀으면) 바로 치운다.
        if (jobs.get(n) !== job) { freeSlide(b); return null; }
        for (const f of b.missingFonts) missing.add(f);
        if (plan.slides[n].scene && !b.scene) still.add(n);      // 영상 파일을 읽지 못했다: 바탕에 그려 둔 멈춘 그림이 보인다
        built.set(n, b);
        return b;
      });
      job.catch(() => { if (jobs.get(n) === job) jobs.delete(n); });
      jobs.set(n, job);
    }
    return jobs.get(n);
  }
  function drop(n) {
    if (!jobs.has(n)) return;
    jobs.delete(n);
    freeSlide(built.get(n));
    built.delete(n);
    forget(n);
  }
  function draw(n, local) {
    const slide = plan.slides[n];
    if (!built.has(n)) throw new Error('아직 준비되지 않은 장이에요');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (slide.turn?.pairs && local < slide.turn.ms && built.has(n - 1)) {
      drawMorph(ctx, W, H, built.get(n - 1), built.get(n), slide.turn, transitionPose(slide.turn.id, 1, local).next.o, flat, n);
    } else if (slide.turn && local < slide.turn.ms && built.has(n - 1)) {
      // 전환 효과가 도는 동안: 나가는 장은 다 나온 모습, 들어오는 장은 요소가 나오기 전의 모습이다.
      const pose = transitionPose(slide.turn.id, 1, local);
      const old = flat(0, n - 1, Infinity);
      const next = flat(1, n, 0);
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, W, H);
      drawTurnSide(ctx, W, H, old, pose.old, depth);
      drawTurnSide(ctx, W, H, next, pose.next, depth);
    } else if (local >= slide.settle && (!built.get(n).scene || local >= built.get(n).scene.start + built.get(n).scene.ms)) {
      // 다 나온 뒤에는 한 번 그려 둔 것을 그대로 붙인다(영상 장면이 있는 장은 영상까지 다 튼 뒤에야 멈춘 모습이 된다)
      ctx.drawImage(flat(1, n, Infinity), 0, 0);
    } else {
      drawSlide(ctx, W, H, built.get(n), local);
    }
  }
  function close() {
    for (const n of [...jobs.keys()]) drop(n);
    for (const k of [0, 1]) { if (flats[k]) { flats[k].width = 0; flats[k].height = 0; flats[k] = null; } held[k] = ''; }
  }
  // 그 순간에 보일 영상 장면의 프레임을 꺼내 둔다. 꺼내지 못하면 그 영상은 더 꺼내지 않고 멈춘 그림으로 둔다(영상 전체를 그만두지는 않는다).
  // 릴이 빌려준 프레임은 다음 것을 꺼내는 순간 못 쓰게 되므로, 실패했을 때 앞의 것을 그대로 두지 않는다(닫힌 프레임을 그리면 오류가 난다).
  async function seek(n, local, { keep = false } = {}) {
    const scene = built.get(n)?.scene;
    if (!scene || scene.broken || !(local >= scene.start) || local >= scene.start + scene.ms) return;
    const mine = () => built.get(n)?.scene === scene;       // 기다리는 사이에 그 장이 버려지지 않았는지
    try {
      if (!keep) scene.now = scene.own;                     // 빌린 것은 이제 못 쓴다(베껴 둔 것이 있으면 그것으로)
      const pic = await scene.reel.frame(scene.from + (local - scene.start) / 1000);
      if (!mine()) return;
      if (!pic) throw new Error('영상의 장면을 꺼내지 못했어요');
      if (!keep) { scene.now = pic; return; }
      const own = await copyPic(pic);
      if (!mine()) { closePic(own); return; }
      closePic(scene.own);
      scene.own = own;
      scene.now = own;
    } catch (ex) {
      console.warn(ex);
      if (!mine()) return;
      scene.broken = true;
      scene.now = scene.own;
      still.add(n);
    }
  }
  // 영상 장면들의 소리를 시간표대로 한 줄로 섞는다. 같은 파일을 여러 장에서 쓰면 한 번만 푼다.
  async function sound({ signal = null } = {}) {
    let master = null;
    let lost = false;
    const clips = new Map();
    const heard = (n) => (plan.slides[n].scene && list[n].video && list[n].video.vol > 0 ? list[n].video : null);
    // 풀어 낸 소리는 크다(1분에 20MB 쯤). 그 파일을 쓰는 마지막 장까지 섞고 나면 바로 놓아준다.
    const lastUse = new Map();
    plan.slides.forEach((_, n) => { const v = heard(n); if (v) lastUse.set(v.src, n); });
    let base = 0;
    for (let n = 0; n < plan.slides.length; n++) {
      const slide = plan.slides[n];
      const video = heard(n);
      if (video) {
        if (signal?.aborted) return null;
        if (!clips.has(video.src)) {
          const blob = await sceneBlob(video.src);
          const info = blob ? await videoInfo(blob) : null;
          const clip = blob ? await decodeSound(blob) : null;
          // 소리 트랙이 있는 파일인데 풀지 못했다(브라우저가 못 푸는 소리 · 메모리가 모자람): 그 소리는 빠진다고 알린다
          if (!clip && info?.audio) lost = true;
          // 풀어 낸 소리는 파일의 "첫 소리 조각"부터다. 소리가 영상보다 늦게 시작하는 파일은 그만큼(lead) 뒤로 민다.
          clips.set(video.src, clip ? { clip, lead: (info?.audioStart || 0) / 1e6 } : null);
        }
        const got = clips.get(video.src);
        if (got) {
          master ||= soundTrack(plan.ms / 1000);
          const from = video.in - got.lead;                 // 쓰는 구간의 처음이 소리 조각에서는 어디인지(소리가 아직 시작하지 않았으면 음수)
          const late = Math.max(0, -from);
          mixSound(master, got.clip, { at: (base + slide.scene.start) / 1000 + late, from: Math.max(0, from), to: video.out - got.lead, gain: video.vol / 100 });
        }
        if (lastUse.get(video.src) === n) clips.delete(video.src);
      }
      base += slide.ms;
    }
    return { track: master && hasSound(master) ? master : null, lost };
  }
  return { canvas: out, width: W, height: H, plan, ready, seek, draw, drop, close, sound, stills: () => still.size, missingFonts: () => [...missing] };
}

// ---------- 녹화 ----------

// 만든 파일이 정말 틀어지는지 확인한다: 첫 그림까지 풀려야 된다고 본다(머리말만 읽히고 그림은 깨진 파일을 걸러 낸다).
// true · false, 제때 알 수 없었으면 null(가려진 탭에서는 브라우저가 영상을 읽기를 미뤄서 알 수 없다. 안 되는 것과는 다르다).
function playable(blob) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(blob);
    let over = false;
    const done = (ok) => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      try { v.load(); } catch { /* 괜찮다 */ }
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    // 가려진 탭에서는 대개 답이 오지 않는다. 오래 기다리지 않는다.
    const timer = setTimeout(() => done(null), document.hidden ? 1500 : 8000);
    v.muted = true;
    v.preload = 'auto';
    v.onloadeddata = () => done(v.videoWidth > 0);
    v.onerror = () => done(false);
    v.src = url;
  });
}

const tried = new Map();         // 'mime:너비x높이' → 그 종류로 틀어지는 파일이 만들어지는지(한 번 알아 두면 다시 찍어 보지 않는다)
const triedKey = (film, kind) => `${kind.mime}:${film.width}x${film.height}`;
// 그 파일 종류로 아주 짧게 찍어 보고, 틀어지는 파일이 나오는지 본다(기기에 따라 MP4 는 된다고 해 놓고 안 되기도 한다).
// 긴 영상을 다 만든 뒤에야 안 되는 것을 알면 처음부터 다시 만들어야 하므로 먼저 알아본다.
async function works(film, kind, fps, signal) {
  const key = triedKey(film, kind);
  if (tried.has(key)) return tried.get(key);
  let ok = false;
  const stream = film.canvas.captureStream(fps);
  try {
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: kind.mime, videoBitsPerSecond: 2000000 });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve, reject) => { rec.onstop = resolve; rec.onerror = (e) => reject(e?.error || new Error('녹화 오류')); });
    rec.start();
    const until = performance.now() + 350;
    while (performance.now() < until && !signal?.aborted) { film.draw(0, 0); await Promise.race([nextFrame(), wait(60)]); }
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    if (signal?.aborted) return false;
    const blob = new Blob(chunks, { type: kind.type });
    ok = blob.size > 0 ? await playable(blob) : false;
  } catch {
    ok = false;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
  // 제때 알 수 없었던 것(느려서 확인이 늦은 것)은 적어 두지 않는다: 이번에는 쓰지 않고, 다음에 다시 알아본다.
  if (ok !== null) tried.set(key, ok);
  return ok === true;
}

/**
 * 필름을 처음부터 끝까지 한 번 틀면서 녹화한다.
 * - kind: 파일 종류({ mime, ext, type }. videoTypes() 의 것) · fps · bitrate(초당 비트 수)
 * - onProgress(0~1) · signal(AbortSignal): 그만두기
 * 돌려주는 것: { blob, type, ext, mime, seconds, width, height }. 그만뒀으면 null.
 * 화면이 가려지면(다른 탭으로 가면) 그림이 그려지지 않으므로, 그동안 녹화도 쉬었다가 돌아오면 이어 간다.
 * 녹화기가 도중에 멈추거나 오류를 내면 끝까지 기다리지 않고 바로 실패한다(던진다).
 */
export async function recordFilm(film, { kind, fps = 30, bitrate = 4000000, onProgress = () => {}, signal = null } = {}) {
  const { plan } = film;
  const last = plan.slides.length - 1;
  if (last < 0) throw new Error('영상으로 만들 장이 없어요');
  if (!kind) throw new Error('이 브라우저에서는 영상으로 만들 수 없어요');
  if (signal?.aborted) return null;
  await film.ready(0);
  // 화면이 가려져 있으면 그림이 그려지지 않는다. 보일 때까지 기다렸다가 시작한다.
  while (document.hidden && !signal?.aborted) await wait(300);
  if (signal?.aborted) return null;
  film.draw(0, 0);
  // 그릴 때마다 한 장씩 잡는다(초당 몇 장으로 묶어 달라고 하면, 그리는 때가 조금만 흔들려도 브라우저가 그 장을 버린다).
  const stream = film.canvas.captureStream();
  const chunks = [];
  let recorder = null;
  let spent = 0;                   // 녹화가 돌아간 시간(ms). 쉬는 동안은 세지 않는다
  let since = 0;
  let running = false;
  let finishing = false;           // 우리가 멈추라고 한 뒤인지(그 전에 멈추면 녹화기가 죽은 것이다)
  let broke = null;                // 녹화기가 낸 오류
  let onBroke = () => {};
  const now = () => spent + (running ? performance.now() - since : 0);
  const run = (on) => {
    if (on === running) return;
    if (on) since = performance.now(); else spent += performance.now() - since;
    running = on;
  };
  const onHide = () => {
    if (!recorder || finishing) return;
    if (document.hidden && running) {
      try { if (recorder.state === 'recording') recorder.pause(); } catch { /* 이미 멈춤 */ }
      run(false);
    } else if (!document.hidden && !running && recorder.state !== 'inactive') {
      try { if (recorder.state === 'paused') recorder.resume(); } catch { /* 끝남 */ }
      run(true);
    }
  };
  try {
    recorder = new MediaRecorder(stream, { mimeType: kind.mime, videoBitsPerSecond: bitrate });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const breakNow = (ex) => { if (!broke) { broke = ex; onBroke(ex); } };
    const stopped = new Promise((resolve) => {
      recorder.onstop = () => { resolve(); if (!finishing) breakNow(new Error('녹화가 도중에 멈췄어요')); };
    });
    recorder.onerror = (e) => breakNow(e?.error || new Error('녹화 오류'));
    document.addEventListener('visibilitychange', onHide);
    recorder.start(1000);
    run(true);
    onHide();
    const how = await new Promise((resolve, reject) => {
      let n = 0;                   // 지금 장
      let base = 0;                // 지금 장이 시작된 때
      let passed = 0;              // 지나간 장들의 길이(시간표로)
      let wanted = -1;             // 준비를 시작한 다음 장
      let nextUp = -1;             // 준비가 끝난 다음 장
      let raf = 0;
      let over = false;
      let drawn = -Infinity;       // 마지막으로 그린 때
      let told = -Infinity;        // 마지막으로 진행을 알린 때
      let seeking = false;         // 영상 장면의 프레임을 꺼내는 중(이 길에서는 되는 만큼만 따라간다: 늦으면 앞의 프레임이 보인다)
      const gap = 1000 / fps - 4;  // 화면은 보통 1초에 60번 깜빡이지만 영상에는 fps 장만 담긴다. 그보다 자주 그리지 않는다
      const end = (v) => { if (over) return; over = true; cancelAnimationFrame(raf); resolve(v); };
      const fail = (ex) => { if (over) return; over = true; cancelAnimationFrame(raf); reject(ex); };
      onBroke = fail;
      if (broke) { fail(broke); return; }
      signal?.addEventListener('abort', () => end('aborted'), { once: true });
      const tick = () => {
        if (over) return;
        try {
          const t = now();
          if (running && t - drawn >= gap) {
            drawn = t;
            let slide = plan.slides[n];
            if (t - base >= slide.ms) {
              if (n === last) { film.draw(n, slide.ms); onProgress(1); end('ended'); return; }
              if (nextUp === n + 1) {
                // 제때 준비됐으면 시간표대로, 준비가 늦어 기다렸으면 지금부터 다음 장을 시작한다.
                base = t - (base + slide.ms) > 100 ? t : base + slide.ms;
                passed += slide.ms;
                n += 1;
                slide = plan.slides[n];
              }
            }
            const local = Math.min(t - base, slide.ms);
            // (기다리지 않고 그리므로, 꺼낸 프레임을 베껴 두라고 한다: 다음 것을 꺼내는 동안에는 베껴 둔 것이 그려진다)
            if (film.seek && !seeking) { seeking = true; Promise.resolve(film.seek(n, local, { keep: true })).catch(() => {}).then(() => { seeking = false; }); }
            try { film.draw(n, local); } catch (ex) { throw filmError(ex); }
            if (n > 0 && local >= (slide.turn?.ms || 0)) film.drop(n - 1);
            // 요소가 다 나와 화면이 멈춰 있는 동안에 다음 장을 준비한다(준비하느라 잠깐 버벅여도 영상에는 티가 나지 않는다).
            if (n < last && wanted !== n + 1 && local >= slide.settle) {
              wanted = n + 1;
              const want = wanted;
              film.ready(want).then(() => { nextUp = want; }, (ex) => fail(filmError(ex)));
            }
            // 진행은 가끔만 알린다(알릴 때마다 화면을 고치면 그만큼 그리기가 밀린다).
            if (t - told >= 200) { told = t; onProgress(Math.min(0.999, (passed + local) / plan.ms)); }
          }
          raf = requestAnimationFrame(tick);
        } catch (ex) {
          fail(ex);
        }
      };
      tick();
    });
    onBroke = () => {};
    if (how === 'aborted') {
      finishing = true;
      run(false);
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* 이미 멈춤 */ }
      await Promise.race([stopped, wait(2000)]);
      return null;
    }
    // 마지막 그림이 녹화에 들어가도록 아주 잠깐 더 그린다.
    const until = performance.now() + 200;
    while (performance.now() < until && !broke) { film.draw(last, plan.slides[last].ms); await Promise.race([nextFrame(), wait(60)]); }
    if (broke) throw broke;
    finishing = true;
    run(false);
    recorder.stop();
    await stopped;
    if (broke) throw broke;
    const blob = new Blob(chunks, { type: kind.type });
    if (!blob.size) throw new Error('녹화된 것이 없어요');
    return { blob, type: kind.type, ext: kind.ext, mime: kind.mime, seconds: Math.round(spent / 10) / 100, width: film.width, height: film.height };
  } finally {
    finishing = true;
    onBroke = () => {};
    document.removeEventListener('visibilitychange', onHide);
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* 이미 멈춤 */ }
    stream.getTracks().forEach((t) => t.stop());
  }
}

// ---------- 한 장씩 인코딩하기 ----------

// 인코더의 설정. 화질을 먼저 생각한다(latencyMode 'quality': 빨리 내보내려고 화질을 깎거나 프레임을 버리지 않는다).
const encoderConfig = (kind, film, fps, bitrate) => ({
  codec: kind.codec, width: film.width, height: film.height, bitrate, framerate: fps, bitrateMode: 'variable', latencyMode: 'quality',
  ...(kind.family === 'avc' ? { avc: { format: 'avc' } } : {}),      // 길이 붙은 조각으로 받는다(MP4 에 그대로 담긴다)
});
/** 이 기기의 인코더가 받아 주는 것들(먼저 써 볼 것부터) [{ codec, family('avc' | 'vp9' | 'vp8'), ext, type }]. */
export async function encodeKinds(film, fps = 30, bitrate = 8000000) {
  if (!canEncode()) return [];
  const list = [];
  for (const kind of encodeCandidates(film.width, film.height, fps)) {
    try {
      const got = await VideoEncoder.isConfigSupported(encoderConfig(kind, film, fps, bitrate));
      if (got?.supported) list.push(kind);
    } catch { /* 모르는 코덱 */ }
  }
  return list;
}
// 다른 일(화면 고치기)이 끼어들 틈을 준다. 타이머와 달리, 가려진 탭에서도 느려지지 않는다.
const breathe = () => new Promise((resolve) => {
  if (typeof MessageChannel !== 'function') { setTimeout(resolve, 0); return; }
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
  ch.port2.postMessage(0);
});
// 필름(그림을 준비하고 그리는 쪽)에서 난 오류라고 적어 둔다: 인코더의 탓이 아니므로 다른 길로 다시 만들어도 똑같이 실패한다.
const filmError = (ex) => Object.assign(ex instanceof Error ? ex : new Error(String(ex)), { fromFilm: true });
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
// 다시 만들기 전에: 앞에서 만들다 남은 장들을 버린다(첫 장은 곧 다시 쓰이므로 둔다).
const rewind = (film) => { for (let n = 1; n < film.plan.slides.length; n++) film.drop(n); };

// 필름을 한 장씩 그려 인코딩한다. 돌려주는 것: { samples(조각들), description(H.264 의 설정 기록), color(색을 읽는 법), count }. 그만뒀으면 null.
async function encodeSamples(film, { kind, fps, bitrate, onProgress, signal, frames }) {
  const { plan } = film;
  const last = plan.slides.length - 1;
  if (last < 0) throw new Error('영상으로 만들 장이 없어요');
  if (!kind) throw new Error('이 브라우저에서는 영상으로 만들 수 없어요');
  const count = Math.min(frames, Math.max(1, Math.round((plan.ms / 1000) * fps)));
  const span = 1e6 / fps;                 // 한 장의 길이(마이크로초)
  const every = Math.max(1, Math.round(fps * 2));     // 2초마다 온전한 장면을 넣는다(재생기에서 아무 데로나 건너뛸 수 있게)
  const samples = [];
  let description = null;
  let color = null;
  let broke = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, key: chunk.type === 'key', ts: chunk.timestamp, dur: chunk.duration || Math.round(span) });
      const config = meta?.decoderConfig;
      if (config?.colorSpace && !color) color = { primaries: config.colorSpace.primaries, transfer: config.colorSpace.transfer, matrix: config.colorSpace.matrix, fullRange: config.colorSpace.fullRange };
      const d = config?.description;
      if (!d) return;
      const bytes = new Uint8Array(d instanceof ArrayBuffer ? d.slice(0) : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
      // 설정 기록은 파일에 하나만 담는다. 도중에 다른 것으로 바뀌면 그 뒤의 장면을 풀 수 없으므로, 이 길을 그만둔다.
      if (!description) description = bytes;
      else if (!sameBytes(description, bytes)) broke ||= new Error('인코더의 설정이 도중에 바뀌었어요');
    },
    error: (ex) => { broke ||= ex; },
  });
  try {
    encoder.configure(encoderConfig(kind, film, fps, bitrate));
    let n = 0;                            // 지금 장
    let base = 0;                         // 지금 장이 시작되는 때(ms)
    let told = -Infinity;
    await film.ready(0).catch((ex) => { throw filmError(ex); });
    for (let f = 0; f < count; f++) {
      if (signal?.aborted) return null;
      if (broke) throw broke;
      const t = (f * 1000) / fps;
      while (n < last && t >= base + plan.slides[n].ms) {
        base += plan.slides[n].ms;
        n += 1;
        await film.ready(n).catch((ex) => { throw filmError(ex); });
        film.drop(n - 2);                 // 바로 앞 장은 전환 효과에 쓰이므로 남겨 둔다
        if (signal?.aborted) return null;
      }
      const slide = plan.slides[n];
      const local = t - base;
      if (n > 0 && local >= (slide.turn?.ms || 0)) film.drop(n - 1);
      // 영상 장면이 있는 장: 그 순간의 프레임을 영상 파일에서 꺼내 둔 뒤에 그린다.
      if (slide.scene && film.seek) {
        await film.seek(n, local);
        if (signal?.aborted) return null;
      }
      try { film.draw(n, local); } catch (ex) { throw filmError(ex); }
      const frame = new VideoFrame(film.canvas, { timestamp: Math.round(f * span), duration: Math.round(span), alpha: 'discard' });
      try {
        encoder.encode(frame, { keyFrame: f % every === 0 });
      } finally {
        frame.close();
      }
      // 인코더가 밀리면 기다린다(그리는 것이 훨씬 빠르면 프레임이 메모리에 쌓인다).
      while (encoder.encodeQueueSize > 3 && !broke && !signal?.aborted) {
        await new Promise((resolve) => {
          const done = () => { clearTimeout(timer); encoder.removeEventListener?.('dequeue', done); resolve(); };
          const timer = setTimeout(done, 40);
          encoder.addEventListener?.('dequeue', done);
        });
      }
      const now = performance.now();
      if (now - told >= 80) { told = now; onProgress(Math.min(0.999, f / count)); await breathe(); }
    }
    if (signal?.aborted) return null;
    await encoder.flush();
    if (broke) throw broke;
    if (signal?.aborted) return null;
    if (samples.length !== count) throw new Error(`프레임 수가 맞지 않아요(${samples.length} / ${count})`);
    return { samples, description, color, count };
  } finally {
    try { if (encoder.state !== 'closed') encoder.close(); } catch { /* 이미 닫힘 */ }
  }
}
// 조각들을 파일로 묶는다. 조각의 속을 베끼지 않고 덩어리째 파일로 만든다(긴 영상도 메모리를 두 배로 쓰지 않는다).
// 조각의 차례가 뒤섞여 있으면(뒤의 장면을 먼저 내보내는 인코더) 묶는 쪽이 던진다: 그런 것은 담지 못한다.
// audio: 함께 담을 소리(sound.js 의 encodeSound 가 돌려준 것. 없으면 그림만 담는다). 소리 때문에 묶지 못하면 그림만 담고, 그렇다고 적어 둔다(soundLost).
function wrap(film, kind, fps, made, audio = null) {
  const pack = (sound) => (kind.family === 'avc'
    ? mp4Parts({ width: film.width, height: film.height, description: made.description, samples: made.samples, color: made.color, audio: sound })
    : webmParts({ codec: kind.family, width: film.width, height: film.height, fps, samples: made.samples, color: made.color, audio: sound }));
  let parts = null;
  let sound = audio;
  if (sound) {
    try { parts = pack(sound); } catch (ex) { console.warn(ex); sound = null; }
  }
  parts ||= pack(null);
  return {
    blob: new Blob(parts, { type: kind.type }), type: kind.type, ext: kind.ext, mime: kind.codec, seconds: Math.round((made.count / fps) * 100) / 100,
    width: film.width, height: film.height, frames: made.count, sound: sound ? sound.codec : '', soundLost: !!audio && !sound,
  };
}

/**
 * 필름을 한 장씩 그려 인코딩하고, 파일로 묶는다. 시계를 따라가지 않는다: 영상의 f 번째 프레임은 늘 정확히 f ÷ fps 초의 그림이다.
 * - kind: 인코더의 종류(encodeKinds() 의 것) · fps · bitrate · onProgress(0~1) · signal(AbortSignal)
 * - frames: 앞의 몇 장만 만든다(되는지 짧게 알아볼 때)
 * - audio: 함께 담을 소리(인코딩한 것. sound.js 의 encodeSound 가 돌려준 것). 없으면 그림만 담는다
 * 돌려주는 것: { blob, type, ext, mime(코덱), seconds, width, height, frames(담긴 프레임 수), sound(담긴 소리의 종류. 없으면 ''), soundLost }. 그만뒀으면 null.
 * 필름에서 난 오류(그림을 준비하거나 그리지 못함)에는 fromFilm 이 붙는다.
 */
export async function encodeFilm(film, { kind, fps = 30, bitrate = 8000000, onProgress = () => {}, signal = null, frames = Infinity, audio = null } = {}) {
  const made = await encodeSamples(film, { kind, fps, bitrate, onProgress, signal, frames });
  if (!made) return null;
  const out = wrap(film, kind, fps, made, audio);
  onProgress(1);
  return out;
}

// 인코더가 낸 조각들이 정말 풀리는지 본다(브라우저의 디코더에 넣어 본다). true · false, 디코더가 없어 알 수 없으면 null.
// <video> 로 틀어 보는 것과 달리 가려진 탭에서도 되고, 머리말만이 아니라 그림이 풀리는지까지 본다.
async function decodable(film, kind, made) {
  if (typeof VideoDecoder !== 'function' || typeof EncodedVideoChunk !== 'function') return null;
  let got = 0;
  let broke = null;
  const decoder = new VideoDecoder({ output: (frame) => { got += 1; frame.close(); }, error: (ex) => { broke ||= ex; } });
  try {
    const config = { codec: kind.codec, codedWidth: film.width, codedHeight: film.height, ...(made.description ? { description: made.description } : {}) };
    if (!(await VideoDecoder.isConfigSupported(config))?.supported) return false;
    decoder.configure(config);
    for (const s of made.samples) decoder.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.ts, duration: s.dur, data: s.data }));
    await decoder.flush();
    return !broke && got === made.samples.length;
  } catch {
    return false;
  } finally {
    try { if (decoder.state !== 'closed') decoder.close(); } catch { /* 이미 닫힘 */ }
  }
}
// 그 인코더가 이 기기에서 정말 쓸 만한지 짧게 알아본다: 몇 장을 인코딩해서 → 풀어 보고 → 파일로 묶어 본다.
// true(된다) · false(안 된다) · null(그만뒀다). 필름에서 난 오류는 그대로 던진다.
async function encoderWorks(film, kind, fps, bitrate, signal) {
  let made = null;
  try {
    made = await encodeSamples(film, { kind, fps, bitrate, onProgress: () => {}, signal, frames: 4 });
  } catch (ex) {
    if (ex?.fromFilm) throw ex;
    return false;
  }
  if (!made) return null;
  try {
    const file = wrap(film, kind, fps, made);
    const ok = await decodable(film, kind, made);
    if (ok !== null) return ok;
    // 디코더로 알아볼 수 없는 브라우저: 묶은 파일을 틀어 본다. 그것으로도 알 수 없으면(가려진 탭) 된다고 보고 간다.
    return (await playable(file.blob)) !== false;
  } catch {
    return false;
  }
}

/**
 * 필름을 영상 파일로 만든다: 만드는 길을 고르고 → 만들고 → 정말 틀어지는지 확인한다(designsToVideo 의 속).
 * 써 보는 차례: 한 장씩 인코딩하기(H.264 → MP4, VP9 · VP8 → WebM) → 틀면서 녹화하기(MP4 → WebM).
 * 한 장씩 인코딩하는 길은 먼저 몇 장만 만들어 풀리는지 본다. 만들다 인코더가 실패하거나 다 만든 것이 틀어지지 않으면 다음 길로 처음부터 다시 만든다
 * (그때 onRetry 가 불린다). 안 된 길은 이 창이 열려 있는 동안 그 크기에서 다시 써 보지 않는다.
 * 그림을 준비하거나 그리지 못한 것(필름의 오류)은 길을 바꿔도 같으므로 바로 던진다.
 * 영상 장면의 소리가 있으면(film.sound) 한 장씩 인코딩하는 길에서 함께 담는다: MP4 에는 AAC(없으면 Opus), WebM 에는 Opus.
 * 소리를 인코딩하지 못하는 브라우저이거나 틀면서 녹화하는 길로 만들었으면 그림만 담고 soundLost 로 알린다.
 * - fps · bitrate · onProgress · onRetry · signal · fixBlob: designsToVideo 와 같다
 * 돌려주는 것: { blob, type, ext, mime, seconds, width, height, sound(담긴 소리의 종류: 'aac' | 'opus' | ''), soundLost(담지 못한 소리가 있는지) }. 그만뒀으면 null.
 */
export async function filmToVideo(film, { fps = 30, bitrate = 8000000, onProgress = () => {}, onRetry = () => {}, signal = null, fixBlob = null } = {}) {
  await film.ready(0);
  if (signal?.aborted) return null;
  film.draw(0, 0);
  const done = async (made) => {
    if (fixBlob) {
      try { made.blob = (await fixBlob(made.blob, made.seconds)) || made.blob; } catch { /* 손보지 못해도 영상은 틀어진다 */ }
    }
    return made;
  };
  let started = 0;                 // 처음부터 만들기 시작한 횟수(두 번째부터는 "다시 만드는 중"이다)
  let lastError = null;
  let kinds = await encodeKinds(film, fps, bitrate);
  // 1초에 60장을 담지 못하는 기기·크기면 30장으로 담는다.
  if (!kinds.length && fps > 30) { fps = 30; kinds = await encodeKinds(film, fps, bitrate); }
  // 소리: 영상 장면들의 소리를 한 번만 풀어 섞어 두고(track), 파일 종류에 맞게 인코딩한다(같은 종류는 한 번만).
  let track = null;
  let unheard = false;             // 소리가 있는데 풀지 못한 영상이 있었다
  if (typeof film.sound === 'function') {
    try {
      const got = await film.sound({ signal });
      track = got?.track || null;
      unheard = !!got?.lost;
    } catch (ex) {
      console.warn(ex);
      unheard = true;
    }
    if (signal?.aborted) return null;
  }
  const hadSound = !!track;
  const encoded = new Map();       // 소리의 종류 → 인코딩한 것(안 되면 null)
  const soundFor = async (kind) => {
    if (!hadSound) return null;
    for (const codec of await soundKinds(kind.family === 'avc' ? ['aac', 'opus'] : ['opus'])) {
      if (!encoded.has(codec)) {
        let got = null;
        if (track) { try { got = await encodeSound(track, { codec, signal }); } catch (ex) { console.warn(ex); } }
        if (signal?.aborted) return null;
        encoded.set(codec, got);
        // Opus 는 어느 파일에나 담긴다: 더 인코딩할 일이 없으니 큰 줄(10분에 100MB 쯤)을 놓아준다.
        if (got && codec === 'opus') track = null;
      }
      if (encoded.get(codec)) return encoded.get(codec);
    }
    return null;
  };
  const keyOf = (kind) => `encode:${kind.codec}:${film.width}x${film.height}`;
  for (const kind of kinds) {
    if (signal?.aborted) return null;
    const key = keyOf(kind);
    if (tried.get(key) === false) continue;
    if (!tried.has(key)) {
      const ok = await encoderWorks(film, kind, fps, bitrate, signal);
      if (ok === null) return null;
      tried.set(key, ok);
      if (!ok) continue;
    }
    try {
      if (started++) onRetry();
      rewind(film);
      const audio = await soundFor(kind);
      if (signal?.aborted) return null;
      const made = await encodeFilm(film, { kind, fps, bitrate, onProgress, signal, audio });
      if (!made) return null;
      if ((hadSound && !made.sound) || unheard) made.soundLost = true;      // 소리가 있었는데 담지 못했다(인코더가 없다 · 풀지 못한 영상이 있다)
      // 틀어 봐서 "안 된다"가 분명할 때만 버린다. 알 수 없으면(가려진 탭에서는 브라우저가 영상을 읽기를 미룬다) 그대로 쓴다:
      // 같은 인코더가 낸 조각이 풀리는 것은 앞에서 보았다.
      if ((await playable(made.blob)) === false) throw new Error('만든 영상을 틀 수 없어요');
      return done(made);
    } catch (ex) {
      if (signal?.aborted) return null;
      if (ex?.fromFilm) throw ex;
      // 끝까지 만들다 실패한 것은 비싸다. 같은 코덱의 다른 설정(H.264 의 다른 화질 설정)도 같은 까닭으로 실패하기 쉬우므로 함께 접는다.
      for (const k of kinds) if (k.family === kind.family) tried.set(keyOf(k), false);
      lastError = ex;
    }
  }
  if (!canRecord()) throw lastError || new Error('이 브라우저에서는 영상으로 만들 수 없어요');
  if (started++) onRetry();
  rewind(film);
  const made = await recordVideo(film, { fps, bitrate, onProgress, onRetry, signal });
  if (!made) return null;
  // 틀면서 녹화하는 길에는 소리가 없다. 담을 소리가 있었으면 담지 못했다고 알린다.
  return done({ ...made, sound: '', soundLost: hadSound || unheard });
}

// 틀면서 녹화해서 만든다(인코더를 쓸 수 없을 때). MP4 를 먼저 써 보고(짧게 찍어 틀어지는지 본다), 안 되거나 만들다 실패하면 WebM 으로 한 번 더 만든다.
async function recordVideo(film, { fps, bitrate, onProgress, onRetry, signal }) {
  // 화면이 가려져 있으면 짧게 찍어 보는 것도 되지 않는다. 보일 때까지 기다린다.
  while (document.hidden && !signal?.aborted) await wait(300);
  if (signal?.aborted) return null;
  await film.ready(0);             // 앞에서 다른 길로 만들다 실패했으면 첫 장이 버려져 있을 수 있다
  if (signal?.aborted) return null;
  film.draw(0, 0);
  const kinds = videoTypes();
  const webm = kinds.find((k) => k.ext === 'webm') || null;
  let kind = null;
  for (const k of kinds) {
    if (k.ext !== 'mp4' || await works(film, k, fps, signal)) { kind = k; break; }
    if (signal?.aborted) return null;
  }
  if (!kind) throw new Error('이 브라우저에서는 영상으로 만들 수 없어요');
  const record = async (k) => {
    // 틀면서 녹화하는 길은 화면 시계를 따라가므로 1초에 30장까지만 담는다(느린 기기에서 프레임이 빠지지 않게).
    const made = await recordFilm(film, { kind: k, fps: Math.min(fps, 30), bitrate, onProgress, signal });
    // 틀어 봐서 "안 된다"가 분명할 때만 버린다(가려진 탭에서는 알 수 없다. 그때는 그대로 쓴다).
    if (made && (await playable(made.blob)) === false) throw new Error('만든 영상을 틀 수 없어요');
    return made;
  };
  try {
    return await record(kind);
  } catch (ex) {
    // MP4 로 만들다 실패했으면(녹화가 멈췄거나, 다 만들었는데 틀어지지 않으면) WebM 으로 한 번 더 만든다.
    // 이 크기에서는 MP4 를 다시 써 보지 않는다(한 종류가 안 되면 다른 MP4 도 같은 까닭으로 안 되기 쉽다).
    // 그림을 준비하지 못한 것(필름의 오류)은 종류를 바꿔도 같으므로 다시 만들지 않는다.
    if (signal?.aborted) return null;
    if (ex?.fromFilm || kind.ext !== 'mp4' || !webm) throw ex;
    for (const k of kinds) if (k.ext === 'mp4') tried.set(triedKey(film, k), false);
    onRetry();
    rewind(film);
    await film.ready(0);
    return record(webm);
  }
}

/**
 * 디자인들을 영상 파일로 만든다(필름을 만들고 → 만드는 길을 고르고 → 만든다. 길은 filmToVideo 가 고른다).
 * - width · height · stay · canvas: createFilm 과 같다 · fps: 초당 그림 수
 * - onProgress(0~1) · signal(AbortSignal): 그만두기 · onRetry(): 다른 파일 종류로 처음부터 다시 만들기 시작할 때
 * - fixBlob(blob, seconds): 다 만든 파일을 손볼 함수(없어도 된다). 브라우저가 녹화한 WebM 은 길이가 적혀 있지 않아
 *   재생기에서 진행 막대가 이상할 수 있는데, 길이를 적어 넣는 함수를 여기에 주면 된다(이 모듈은 바깥 코드를 쓰지 않으므로 받아서 쓴다).
 *   어떤 종류의 파일이든 넘겨주므로, 손볼 수 없는 종류는 받은 것을 그대로 돌려주면 된다.
 * 영상 장면(그 장의 바탕에 깐 영상)은 발표할 때처럼 움직이는 채로, 소리와 함께 담긴다(한 장씩 인코딩할 수 있는 브라우저에서).
 * 파일이 이 기기에 없는 영상 장면은 바탕색만 나온다. 영상이 너무 길면(MAX_FILM_SECONDS 를 넘으면) code 가 'too-long' 인 오류를 던진다.
 * 돌려주는 것: { blob, type, ext, mime, seconds, width, height, missingFonts(받지 못한 글꼴의 이름들),
 *   sound(담긴 소리의 종류: 'aac' | 'opus' | ''), soundLost(담지 못한 소리가 있는지: sound 가 있으면 일부 영상의 소리만 빠진 것이다),
 *   scenes(움직이는 채로 담은 영상 장면의 수), stills(멈춘 그림으로 담은 영상 장면의 수) }.
 * 그만뒀으면 null.
 */
export async function designsToVideo(designs, {
  width = 1920, height = 1080, stay = DEFAULT_STAY, fps = 0, canvas = null, onProgress = () => {}, onRetry = () => {}, signal = null, fixBlob = null,
} = {}) {
  if (!canMakeVideo()) throw new Error('이 브라우저에서는 영상으로 만들 수 없어요');
  // 파일이 이 기기에 없는 영상 장면은 미리 뗀다(시간표에서도 영상의 길이를 세지 않는다. 그 장은 바탕색만 나온다).
  const list = await Promise.all((Array.isArray(designs) ? designs : []).map(async (raw) => {
    const d = cleanDesign(raw, { keepSpaces: true });
    if (d.video && !(await sceneBlob(d.video.src))) delete d.video;
    return d;
  }));
  if (signal?.aborted) return null;
  // 영상 장면을 움직이는 채로 담으려면 한 장씩 인코딩할 수 있어야 한다. 틀면서 녹화하는 길밖에 없는 브라우저에서는 멈춘 그림으로 담는다.
  const live = canEncode();
  const film = createFilm(list, { width, height, stay, canvas, scenes: live });
  const seconds = film.plan.ms / 1000;
  if (seconds > MAX_FILM_SECONDS) { film.close(); throw Object.assign(new Error('영상이 너무 길어요'), { code: 'too-long' }); }
  // 화질(초당 비트 수): 글자의 가장자리가 뭉개지지 않게 넉넉히 준다. 1920×1080 에 10Mbps, 1280×720 에 4.6Mbps.
  // (가만히 있는 장면이 많아서 실제 파일은 이보다 훨씬 작다.) 긴 영상은 다 만들 때까지 메모리에 쌓이므로, 전체가 200MB 쯤을 넘지 않게 낮춘다.
  let bitrate = Math.round(Math.min(10000000, Math.max(4000000, film.width * film.height * 5)));
  if (seconds > 160) bitrate = Math.max(2500000, Math.min(bitrate, Math.round(1.6e9 / seconds)));
  const count = list.filter((d) => d.video).length;
  try {
    // 움직임이 매끄럽게: 한 장씩 인코딩하는 길에서는 1초에 60장(못 하면 30장), 녹화하는 길은 30장.
    const made = await filmToVideo(film, { fps: fps || (live ? 60 : 30), bitrate, onProgress, onRetry, signal, fixBlob });
    // 움직이는 채로 담으려 했지만 읽지 못한 영상 장면(film.stills)도 멈춘 그림으로 담긴 것이다.
    const stills = live ? Math.min(count, film.stills()) : count;
    return made ? { ...made, missingFonts: film.missingFonts(), scenes: count - stills, stills } : null;
  } finally {
    film.close();
  }
}
