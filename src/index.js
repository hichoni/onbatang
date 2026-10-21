// 온바탕 편집기 — 글·도형·사진으로 꾸미는 작은 편집기. 이 폴더만 옮기면 다른 프로젝트에서도 쓸 수 있다(바깥 라이브러리·빌드 없음).
// 쓰는 법은 같은 폴더의 README.md 와 demo.html 을 본다.
//
//   import { configure, createEditor, designView, registerFonts } from './onbatang/index.js';
//   <link rel="stylesheet" href="./onbatang/editor.css">

export { createEditor } from './editor.js';
export { designView, itemView, shapeThumb, youTubePlayers } from './render.js';
export { isYouTubeId, parseYouTube, ytStart, ytThumb, ytWatch, ytEmbed, ytTime, YT_MAX_START, YT_ORIGIN } from './youtube.js';
export { SHAPE_ASSETS, shapeAsset, shapeSvg } from './shapes.js';
export { ICONS, icon, iconSvg } from './icons.js';
export { designToBlob, designToCanvas, designSheet } from './export.js';
export { designsToVideo, createFilm, recordFilm, encodeFilm, encodeKinds, filmToVideo, videoTypes, canMakeVideo, canFilmScenes } from './video.js';
export { muxMp4, muxWebm, mp4Parts, webmParts, opusHead } from './mux.js';
export * from './film.js';
export { sceneView, scenePlayer, sceneFrame, sceneUrl, sceneBlob, keepScene, dropScene, scenesReady, probeVideo, ACCEPT_VIDEOS } from './scene.js';
export { demuxVideo, blobReader, bytesReader } from './demux.js';
export { openReel, videoInfo } from './reel.js';
export { SOUND_RATE, soundTrack, mixSound, hasSound, decodeSound, encodeSound, soundKinds, canDecodeSound } from './sound.js';
export { registerFonts, fontReady } from './fonts.js';
export { shrinkImage, readPixels, canvasToPng, ACCEPT_IMAGES } from './images.js';
export { removeBackground, borderColor, TOLERANCE, refineCutout, colorAlpha, plainBorder } from './cutout.js';
export { STICKERS, searchStickers } from './stickers.js';
export { ART_PACKS, isArtId, artPack, artAspect, artColorable, loadArt, artReady, artName, artSvg, searchArt } from './art.js';
export { toast } from './dom.js';
export * from './motion.js';
export * from './links.js';
export * from './model.js';
