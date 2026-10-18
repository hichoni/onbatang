// Pointer resizing uses the item's local axes, rather than its distance from the
// centre. The actual painted box is separate from the padded selection outline.
import { cleanItem, scaleItem } from './model.js';

const axes = handle => ({
  x: handle === 'tall' ? 0 : handle === 'wide' ? 1 : handle.includes('w') ? -1 : 1,
  y: handle === 'wide' ? 0 : handle.includes('n') ? -1 : 1,
});
const validBox = box => ['width', 'height', 'stageWidth', 'stageHeight'].every(k => Number.isFinite(box[k]) && box[k] > 0);

/** Keep the opposite corner/edge still after model limits or text reflow. */
export function anchorResizedItem(item, next, box) {
  if (!validBox(box) || box.centered) return { ...next, x: item.x, y: item.y };
  const { x, y } = axes(box.handle || 'se');
  const localX = x * (box.afterWidth - box.width) / 2;
  const localY = y * (box.afterHeight - box.height) / 2;
  const rad = (item.rot || 0) * Math.PI / 180;
  return {
    ...next,
    x: item.x + (localX * Math.cos(rad) - localY * Math.sin(rad)) / box.stageWidth * 100,
    y: item.y + (localX * Math.sin(rad) + localY * Math.cos(rad)) / box.stageHeight * 100,
  };
}

// scaleItem also scales the font. Text width and font limits must all constrain
// the same scale, so reaching a width limit cannot distort a Shift resize.
function proportionalItem(item, factor) {
  let k = Math.max(0.000001, factor);
  for (let pass = 0; pass < 3; pass++) {
    const next = scaleItem(item, k);
    const ratios = ['w', 'h', 'size'].filter(key => Number.isFinite(item[key]) && item[key] > 0).map(key => next[key] / item[key]);
    const real = k >= 1 ? Math.min(...ratios) : Math.max(...ratios);
    if (Math.abs(real - k) < 0.000001) return next;
    k = real;
  }
  return scaleItem(item, k);
}

/**
 * Resize a clean item from pointer displacement in CSS pixels. Shift preserves
 * the ratio; Ctrl keeps the centre. Ordinary text keeps its font and natural
 * height, while imported fixed-height text resizes its frame. Emoji retain their
 * intrinsic ratio because their model stores a font size, not an image frame.
 * Existing cleaning/size limits remain the only limits on saved dimensions.
 */
export function resizeItemFromHandle(item, box) {
  if (!validBox(box) || item.lock) return item;
  const { width, height, stageWidth, stageHeight, handle = 'se', centered = false } = box;
  const { x, y } = axes(handle);
  const rad = (item.rot || 0) * Math.PI / 180;
  const dx = (Number(box.dx) || 0) * Math.cos(rad) + (Number(box.dy) || 0) * Math.sin(rad);
  const dy = -(Number(box.dx) || 0) * Math.sin(rad) + (Number(box.dy) || 0) * Math.cos(rad);
  const multiple = centered ? 2 : 1;
  const proportional = box.proportional || item.t === 'emoji';
  const denominator = x * x * width * width + y * y * height * height;
  const factor = 1 + multiple * (x * width * dx + y * height * dy) / denominator;
  const targetWidth = width + x * dx * multiple;
  const targetHeight = height + y * dy * multiple;
  const naturalText = item.t === 'text' && !Number.isFinite(item.h);
  const targetAt = progress => {
    if (proportional) return proportionalItem(item, 1 + (factor - 1) * progress);
    const clean = cleanItem({
      ...item,
      w: item.w * Math.max(0, width + (targetWidth - width) * progress) / width,
      ...(!naturalText ? { h: item.h * Math.max(0, height + (targetHeight - height) * progress) / height } : {}),
    }, { keepSpaces: true });
    // Preserve all authored metadata and properties; only cleaned dimensions
    // change. No new layout marker or storage schema is needed for resizing.
    return { ...item, w: clean.w, ...(!naturalText && Number.isFinite(clean.h) ? { h: clean.h } : {}) };
  };
  const target = targetAt(1);
  const sizeAt = progress => {
    if (progress === 1) return target;
    if (proportional) return proportionalItem(item, 1 + ((item.t === 'text' ? target.size / item.size : target.w / item.w) - 1) * progress);
    const clean = cleanItem({ ...item, w: item.w + (target.w - item.w) * progress,
      ...(!naturalText ? { h: item.h + (target.h - item.h) * progress } : {}),
    }, { keepSpaces: true });
    return { ...item, w: clean.w, ...(!naturalText && Number.isFinite(clean.h) ? { h: clean.h } : {}) };
  };
  const painted = next => ({
    ...box,
    afterWidth: width * next.w / item.w,
    afterHeight: Number.isFinite(item.h) ? height * next.h / item.h
      : proportional ? height * (item.t === 'text' ? next.size / item.size : next.w / item.w) : height,
  });
  // Saved centres stay within the existing 0..100 model contract. Stop the
  // size change at that boundary instead of clamping the centre and moving the
  // opposite corner. Limits are evaluated after dimension cleaning/rounding.
  let progress = 1;
  for (let pass = 0; pass < 8; pass++) {
    const next = sizeAt(progress);
    const anchored = anchorResizedItem(item, next, painted(next));
    let allowed = 1;
    for (const key of ['x', 'y']) {
      const delta = anchored[key] - item[key];
      if (anchored[key] < 0 && delta < 0) allowed = Math.min(allowed, -item[key] / delta);
      if (anchored[key] > 100 && delta > 0) allowed = Math.min(allowed, (100 - item[key]) / delta);
    }
    if (allowed === 1) return anchored;
    progress *= Math.max(0, allowed - 0.00001);
  }
  return item;
}
