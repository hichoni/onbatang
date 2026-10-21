import test from 'node:test';
import assert from 'node:assert/strict';
import {styleOf, applyStyle, cleanItem} from '../src/model.js';

const text = patch => ({id: 'etext00001', t: 'text', text: '글', x: 30, y: 40, w: 50, size: 5, color: '#123456', font: 'gothic', ...patch});
const shape = patch => ({id: 'eshape0001', t: 'shape', shape: 'round', x: 60, y: 60, w: 20, h: 10, color: '#abcdef', ...patch});

test('style copy moves only look values between texts; position, size of box and words stay', () => {
  const from = text({bold: true, italic: true, align: 'l', color: '#ff0000', size: 7, op: 60});
  const to = text({id: 'etext00002', text: '다른 글', x: 70, y: 80, w: 30, under: true});
  const out = applyStyle(to, styleOf(from));
  assert.equal(out.text, '다른 글');
  assert.deepEqual([out.x, out.y, out.w, out.id], [70, 80, 30, 'etext00002']);
  assert.deepEqual([out.bold, out.italic, out.align, out.color, out.size, out.op], [true, true, 'l', '#ff0000', 7, 60]);
  // A value the source did not have is cleared, like a format painter.
  assert.equal(out.under, undefined);
  assert.ok(cleanItem(out, {keepSpaces: true}));
});

test('style copy across kinds moves only shared values; locked or unknown targets are untouched', () => {
  const style = styleOf(text({color: '#00aa00', op: 50, bold: true}));
  const out = applyStyle(shape({line: 1}), style);
  assert.equal(out.color, '#00aa00');
  assert.equal(out.op, 50);
  assert.equal(out.bold, undefined);
  assert.equal(out.line, 1, 'shape-only values are kept when the source cannot carry them');
  const locked = shape({lock: true});
  assert.equal(applyStyle(locked, style), locked);
  assert.equal(styleOf({t: 'unknown'}), null);
  assert.equal(applyStyle({t: 'unknown', x: 1}, style).x, 1);
  const photo = {id: 'eimage0001', t: 'image', url: 'data:image/png;base64,AAAA', x: 50, y: 50, w: 40, h: 30};
  const masked = applyStyle(photo, styleOf({...photo, mask: 'circle', op: 80}));
  assert.deepEqual([masked.mask, masked.op, masked.url], ['circle', 80, photo.url]);
});
