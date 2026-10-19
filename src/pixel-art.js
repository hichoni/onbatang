// A small local activity contract. No scripts, URLs, account or network state.
import { DocumentError, isId, isObject, newId } from './document.js';

export const PIXEL_ART_PALETTE = Object.freeze(['#273f3a', '#ffffff', '#ef6461', '#ffcf56', '#63b995', '#57a9df', '#9676ce', '#f39e62']);
const invalid = (raw, key) => { throw new DocumentError('INVALID_ACTIVITY', `activity.${key}`, raw); };
export function cleanPixelActivity(raw) {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) invalid(raw, 'value');
  if (raw.version !== 1 || raw.kind !== 'pixel-art') invalid(raw, 'kind');
  if (!isId(raw.id)) invalid(raw, 'id');
  if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 80 || /[\u0000-\u001f]/.test(raw.title)) invalid(raw, 'title');
  if (typeof raw.instructions !== 'string' || raw.instructions.length > 400 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw.instructions)) invalid(raw, 'instructions');
  if (![8, 12, 16].includes(raw.size)) invalid(raw, 'size');
  if (!Array.isArray(raw.palette) || raw.palette.length < 2 || raw.palette.length > 12 || [...raw.palette].some(c => typeof c !== 'string' || !/^#[a-f\d]{6}$/i.test(c))) invalid(raw, 'palette');
  if (!Array.isArray(raw.cells) || raw.cells.length !== raw.size ** 2 || [...raw.cells].some(c => !Number.isInteger(c) || c < -1 || c >= raw.palette.length)) invalid(raw, 'cells');
  return { version: 1, kind: 'pixel-art', id: raw.id, title: raw.title, instructions: raw.instructions, size: raw.size, palette: raw.palette.map(c => c.toLowerCase()), cells: [...raw.cells] };
}

export function newPixelActivity(options = {}) {
  const size = options.size ?? 8;
  if (![8, 12, 16].includes(size)) invalid(options, 'size');
  return cleanPixelActivity({ version: 1, kind: 'pixel-art', id: newId('a'), title: '나만의 픽셀아트', instructions: '색을 고르고 칸을 눌러 그림을 만들어 보세요.', size, palette: [...PIXEL_ART_PALETTE], cells: Array(size ** 2).fill(-1), ...options });
}

const ratio = value => typeof value === 'number' && value >= 0.25 && value <= 4 ? value : 16 / 9;
const text = (value, x, y, w, size, extra = {}) => ({ id: newId('e'), t: 'text', layout: 'slide', text: value, x, y, w, size, color: '#273f3a', align: 'c', font: 'gothic', ...extra });
function picture(url, x, y, w, aspect) {
  if (typeof url !== 'string' || !/^data:image\/png;base64,[A-Za-z\d+/=]+$/.test(url) || url.length > 4_000_000) throw new DocumentError('INVALID_ACTIVITY_IMAGE', 'activity.image', url);
  return { id: newId('e'), t: 'image', layout: 'slide', x, y, w, h: w * aspect, url };
}

// Cover/result are ordinary editor elements, so PNG and PPTX exports work
// without an app runtime. Pass the raster from app/pixel-art.js when available.
export function pixelArtCover(raw, aspect, imageData) {
  const activity = cleanPixelActivity(raw), ar = ratio(aspect), wide = ar >= 1.3;
  const summary = activity.instructions.length > 90 ? `${activity.instructions.slice(0, 89)}…` : activity.instructions;
  const items = [
    text('함께 만드는 활동', wide ? 29 : 50, 15, wide ? 48 : 88, 2.2),
    text(activity.title, wide ? 29 : 50, wide ? 34 : 26, wide ? 48 : 88, wide ? 4 : 4.3, { bold: true }),
    text(summary, wide ? 29 : 50, wide ? 57 : 39, wide ? 45 : 84, wide ? 2.1 : 2.2),
    text('발표에서 활동 시작', 50, 92, 80, 2.1),
  ];
  const w = wide ? Math.min(35, 64 / ar) : Math.min(54, 37 / ar), x = wide ? 77 : 50, y = wide ? 49 : 68;
  if (imageData) items.push(picture(imageData, x, y, w, ar));
  else {
    // A recognizable pixel icon instead of 256 separate editable elements.
    const pattern = ['0110', '1111', '1111', '0110'];
    pattern.forEach((row, r) => [...row].forEach((cell, c) => {
      if (cell === '1') items.push({ id: newId('e'), t: 'shape', layout: 'slide', shape: 'rect', x: x + (c - 1.5) * w / 4, y: y + (r - 1.5) * w * ar / 4, w: w / 4 - 0.4, h: (w / 4 - 0.4) * ar, color: activity.palette[(r + c) % activity.palette.length] });
    }));
  }
  return { bg: '#f1f7f3', items };
}

export function pixelArtResult(raw, cells, aspect, imageData) {
  const activity = cleanPixelActivity({ ...raw, cells }), ar = ratio(aspect), w = Math.min(82, 68 / ar);
  return { id: newId('p'), source: { kind: 'result' }, bg: '#fffdf5', items: [
    text(`${activity.title} · 결과`, 50, 11, 90, 3.2, { bold: true }),
    picture(imageData, 50, 53, w, ar),
    text('온바탕에서 만든 픽셀아트', 50, 94, 88, 1.8),
  ] };
}
