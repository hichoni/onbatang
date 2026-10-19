import test from 'node:test';
import assert from 'node:assert/strict';
import { createHtmlLesson } from '../app/html-lesson.js';
import { cleanHtmlLesson } from '../app/html-lesson-runtime.js';
import { newPixelActivity } from '../src/pixel-art.js';
const image = 'data:image/png;base64,iVBORw0KGgo=';
const page = () => ({ id: 'ptestpage123', image, aspect: 16 / 9, activity: newPixelActivity() });

test('HTML lesson embeds the runtime and raster pages without external script, CSS or asset links', async () => {
  const pages = [page()], before = structuredClone(pages);
  const blob = createHtmlLesson({ title: '내 실과 수업', pages });
  assert.equal(blob.type, 'text/html;charset=utf-8');
  const html = await blob.text();
  assert.match(html, /id="onbatang-lesson-runtime"/); assert.match(html, /data:image\/png;base64/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=|<link\b|<iframe\b/i);
  assert.match(html, /connect-src 'none'/); assert.deepEqual(pages, before);
});

test('teacher titles and activity strings cannot escape HTML or JSON script contexts', async () => {
  const payload = '</script><img src=x onerror=alert(1)>\u2028';
  const p = page(); p.activity.title = payload; p.activity.instructions = payload;
  const html = await createHtmlLesson({ title: payload, pages: [p] }).text();
  assert.doesNotMatch(html, /<img src=x/);
  const seed = html.match(/<script type="application\/json" id="onbatang-lesson-data">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(seed).pages[0].activity.title, payload);
  assert.equal((html.match(/<\/script>/g) || []).length, 2);
});

test('malformed image, executable activity and duplicate pages are rejected before export', () => {
  const valid = { version: 1, id: 'dlesson123', title: '수업', pages: [page()] };
  for (const pages of [[{ ...page(), image: 'https://example.com/image.png' }], [page(), page()], [{ ...page(), activity: { ...newPixelActivity(), kind: 'html' } }]]) {
    assert.throws(() => cleanHtmlLesson({ ...valid, pages }));
  }
});
