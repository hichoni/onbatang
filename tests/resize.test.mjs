import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanItem, configure, newShape, newText, newEmoji } from '../src/model.js';
import { anchorResizedItem, resizeItemFromHandle } from '../src/resize.js';

configure({ aspect: 16 / 9 });
const near = (actual, expected, message, tolerance = 0.002) => assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} ≈ ${expected}`);
const stage = { stageWidth: 1000, stageHeight: 562.5 };
const rectangle = (rot = 0) => cleanItem({ t: 'shape', layout: 'slide', id: 'elem012345', source: { kind: 'pptx', slide: 2 }, x: 50, y: 50, w: 20, h: 30, rot, shape: 'rect', color: '#334455' });
const frame = (item, options = {}) => ({ ...stage, width: item.w * 10, height: item.h * stage.stageHeight / 100, handle: 'se', dx: 0, dy: 0, ...options });
const corners = ['nw', 'ne', 'sw', 'se'];
const direction = corner => [corner.includes('w') ? -1 : 1, corner.includes('n') ? -1 : 1];
const rotated = (x, y, angle) => {
  const rad = angle * Math.PI / 180;
  return [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];
};
const opposite = (item, corner, box) => {
  const [sx, sy] = direction(corner);
  const [dx, dy] = rotated(-sx * box.width / 2, -sy * box.height / 2, item.rot);
  return [item.x / 100 * box.stageWidth + dx, item.y / 100 * box.stageHeight + dy];
};
const fixed = (before, after, corner, box) => {
  const a = opposite(before, corner, box);
  const b = opposite(after, corner, { ...box, width: box.width * after.w / before.w, height: box.height * after.h / before.h });
  near(b[0], a[0], 'opposite corner x'); near(b[1], a[1], 'opposite corner y');
};

test('every corner follows local pointer axes and keeps its opposite corner, including rotated items', () => {
  for (const rot of [0, 32, 90, -126]) for (const handle of corners) {
    const item = rectangle(rot), [sx, sy] = direction(handle);
    const [dx, dy] = rotated(sx * 40, sy * 18, rot);
    const box = frame(item, { handle, dx, dy });
    const next = resizeItemFromHandle(item, box);
    near(next.w, 24, `${rot}/${handle} width`);
    near(next.h, 33.2, `${rot}/${handle} height`);
    fixed(item, next, handle, box);
    assert.equal(next.id, item.id); assert.deepEqual(next.source, item.source);
    assert.equal(next.color, item.color); assert.equal(next.rot, item.rot);
  }
});

test('Shift preserves ratio around the opposite corner; Ctrl uses the centre; both can change during a drag', () => {
  const item = rectangle(32), [dx, dy] = rotated(60, 10, 32);
  const box = frame(item, { dx, dy });
  const free = resizeItemFromHandle(item, box);
  const ratio = resizeItemFromHandle(item, { ...box, proportional: true });
  assert.notEqual(free.w / item.w, free.h / item.h);
  near(ratio.w / item.w, ratio.h / item.h, 'Shift ratio'); fixed(item, ratio, 'se', box);
  const center = resizeItemFromHandle(item, { ...box, centered: true });
  near(center.w, 32, 'Ctrl doubles width increment'); near(center.x, item.x, 'Ctrl centre x'); near(center.y, item.y, 'Ctrl centre y');
  const both = resizeItemFromHandle(item, { ...box, proportional: true, centered: true });
  near(both.w / item.w, both.h / item.h, 'Ctrl+Shift ratio'); near(both.x, item.x, 'Ctrl+Shift centre x');
  assert.deepEqual(resizeItemFromHandle(item, box), free, 'releasing modifiers restores unconstrained calculation from drag start');
});

test('width/height handles pin the opposite edge rather than growing in both directions', () => {
  const item = rectangle(32);
  for (const [handle, lx, ly] of [['wide', 40, 0], ['tall', 0, 18]]) {
    const [dx, dy] = rotated(lx, ly, 32), box = frame(item, { handle, dx, dy });
    const next = resizeItemFromHandle(item, box);
    const [moveX, moveY] = rotated(lx / 2, ly / 2, 32);
    near(next.x - item.x, moveX / 10, `${handle} centre x`);
    near(next.y - item.y, moveY / stage.stageHeight * 100, `${handle} centre y`);
    near(next.w, handle === 'wide' ? 24 : 20, `${handle} width`);
    near(next.h, handle === 'tall' ? 33.2 : 30, `${handle} height`);
  }
});

test('small padded selection boxes resize by the pointer delta, without an initial jump', () => {
  const item = { ...rectangle(32), w: 0.5, h: 0.4 };
  const box = frame(item, { handle: 'se' });
  assert.deepEqual(resizeItemFromHandle(item, box), item);
  const [dx, dy] = rotated(7, 3, item.rot);
  const next = resizeItemFromHandle(item, { ...box, dx, dy });
  near(next.w, 1.2, 'tiny width'); near(next.h, 0.9333, 'tiny height'); fixed(item, next, 'se', box);
});

test('model minimum, maximum, and centre boundaries stop the moving corner without shifting its anchor', () => {
  const item = newShape('rect', { w: 20, h: 30, x: 50, y: 50 });
  const box = frame(item);
  const min = resizeItemFromHandle(item, { ...box, dx: -10000, dy: -10000 });
  near(min.w, 2, 'ordinary minimum width'); near(min.h, 0.6, 'ordinary minimum height'); fixed(item, min, 'se', box);
  const max = resizeItemFromHandle(item, { ...box, dx: 10000, dy: 10000 });
  assert.ok(max.w > item.w && max.h > item.h, 'large pointer delta stops at the usable boundary');
  assert.ok(max.w <= 140 && max.h <= 140 && max.x <= 100 && max.y <= 100);
  fixed(item, max, 'se', box);
  const ratio = resizeItemFromHandle(item, { ...box, dx: 10000, dy: 10000, proportional: true });
  near(ratio.w / item.w, ratio.h / item.h, 'max ratio', 0.005); fixed(item, ratio, 'se', box);
});

test('fixed-height PPT text changes its frame without changing font; Shift scales text and the frame together', () => {
  const item = cleanItem({ ...newText('원본 내용'), layout: 'slide', w: 20, h: 10, size: 4, valign: 'bottom' });
  const box = frame(item, { dx: 60, dy: 12 });
  const free = resizeItemFromHandle(item, box);
  assert.equal(free.size, item.size); assert.equal(free.text, item.text); assert.equal(free.valign, 'bottom');
  fixed(item, free, 'se', box);
  const ratio = resizeItemFromHandle(item, { ...box, proportional: true });
  near(ratio.w / item.w, ratio.size / item.size, 'font ratio'); near(ratio.h / item.h, ratio.size / item.size, 'frame ratio');
  const huge = resizeItemFromHandle(item, { ...box, dx: 2000, dy: 300, proportional: true, centered: true });
  near(huge.w / item.w, huge.size / item.size, 'width limit constrains font');
  near(huge.h / item.h, huge.size / item.size, 'width limit constrains height');
});

test('ordinary text preserves font, uses its natural height, and can anchor after a measured line wrap', () => {
  const item = newText('내용은 보존하고 글상자만 바꿉니다', { w: 40, size: 4 });
  const box = { ...stage, width: 400, height: 65, handle: 'se', dx: -120, dy: 80 };
  const next = resizeItemFromHandle(item, box);
  assert.equal(next.w, 28); assert.equal(next.size, 4); assert.equal(next.h, undefined); assert.equal(next.text, item.text);
  const anchored = anchorResizedItem(item, next, { ...box, afterWidth: 280, afterHeight: 130 });
  near(anchored.x / 100 * 1000 - 140, item.x / 100 * 1000 - 200, 'left remains fixed');
  near(anchored.y / 100 * 562.5 - 65, item.y / 100 * 562.5 - 32.5, 'top remains fixed after wrapping');
});

test('photos can resize freely and retain references; emoji keep intrinsic ratio; locked and invalid boxes do not mutate', () => {
  const photo = cleanItem({ t: 'image', w: 20, h: 30, x: 50, y: 50, url: 'https://example.com/a.png', path: 'teacher/photo.png', rot: 32 });
  const box = frame(photo, { dx: 42, dy: 8 });
  const free = resizeItemFromHandle(photo, box);
  assert.notEqual(free.w / photo.w, free.h / photo.h); assert.equal(free.url, photo.url); assert.equal(free.path, photo.path);
  fixed(photo, free, 'se', box);
  const emoji = newEmoji('😀');
  const resized = resizeItemFromHandle(emoji, { ...stage, width: 220, height: 250, handle: 'se', dx: 60, dy: 20 });
  assert.equal(resized.h, undefined); assert.equal(resized.ch, emoji.ch); assert.ok(resized.w > emoji.w);
  const locked = { ...photo, lock: true };
  assert.equal(resizeItemFromHandle(locked, box), locked);
  assert.equal(resizeItemFromHandle(photo, { ...box, stageWidth: 0 }), photo);
  assert.deepEqual(photo, cleanItem(photo), 'starting item is never mutated');
});
