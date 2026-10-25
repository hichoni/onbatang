// 슬라이드 위에서 붙여넣기: 바깥에서 복사한 그림 · 글 · 웹 주소가 단추 없이 바로 조각이 되고,
// 이 편집기에서 복사한 조각은 (그사이 다른 것을 복사하지 않았으면) 그대로 다시 붙는다. 서버 · 계정 · 바깥 요청은 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName} from '/app/store.js';
try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
setStorageName('paste-fixture');
const record=newRecord('16:9');record.name='붙여넣기';await putDesign(record);
await startMinican({storage:'paste-fixture'});await openSavedDesign(record.id);window.ready=true;
</script>`;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFElEQVR42mP8z8Dwn4EIwDiqkL4KAc0eB/0kx8sXAAAAAElFTkSuQmCC';

test('paste on the slide: a picture, text and a web address become pieces right away; a copied piece pastes again', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin});
  const page = await context.newPage();
  const errors = [], external = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === origin || ['data:', 'blob:', 'about:'].includes(u.protocol)) return route.continue(); external.push(u.origin); return route.abort(); });
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  const stage = page.locator('.cv-canvas .fe-stage');
  await stage.waitFor();
  const count = (sel) => page.locator(`.cv-canvas .fe-stage ${sel}`).count();
  const paste = (data) => page.evaluate(async ({text, html, png}) => {
    const d = new DataTransfer();
    if (text) d.setData('text/plain', text);
    if (html) d.setData('text/html', html);
    if (png) d.items.add(new File([Uint8Array.from(atob(png), c => c.charCodeAt(0))], 'image.png', {type: 'image/png'}));
    document.querySelector('.cv-canvas .fe-stage').dispatchEvent(new ClipboardEvent('paste', {clipboardData: d, bubbles: true, cancelable: true}));
  }, data);
  const before = await count('.fi');

  await paste({text: '오늘의 목표: 붙여넣기로 바로 넣기'});
  await page.locator('.cv-canvas .fe-stage .fi-text', {hasText: '오늘의 목표: 붙여넣기로 바로 넣기'}).waitFor();
  assert.equal(await page.locator('.fi-text[contenteditable="true"]').count(), 0, 'pasted text is placed, not opened for typing');

  // Copy a piece in the editor (Ctrl+C), then paste: the same piece comes back. Something copied elsewhere afterwards wins.
  await page.locator('.cv-canvas .fe-stage .fi-text', {hasText: '오늘의 목표'}).click();
  await page.keyboard.press('Control+c');
  await page.waitForFunction(async () => (await navigator.clipboard.readText()) === '오늘의 목표: 붙여넣기로 바로 넣기');
  await page.keyboard.press('Escape');
  await stage.focus();
  await page.keyboard.press('Control+v');
  await page.waitForFunction(() => document.querySelectorAll('.cv-canvas .fe-stage .fi-text').length >= 2 && [...document.querySelectorAll('.cv-canvas .fe-stage .fi-text')].filter(n => n.textContent.includes('오늘의 목표')).length === 2);
  await page.evaluate(() => navigator.clipboard.writeText('다른 곳에서 복사한 글'));
  await stage.focus();
  await page.keyboard.press('Control+v');
  await page.locator('.cv-canvas .fe-stage .fi-text', {hasText: '다른 곳에서 복사한 글'}).waitFor();
  assert.equal(await page.locator('.cv-canvas .fe-stage .fi-text', {hasText: '오늘의 목표'}).count(), 2, 'the old copied piece did not paste again');

  await paste({png: PNG});
  await page.waitForFunction(() => document.querySelectorAll('.cv-canvas .fe-stage .fi-image').length === 1);

  // A copied web picture comes with its <img> markup: the picture wins over the alt text.
  await paste({png: PNG, text: '고양이', html: '<img src="https://example.org/cat.png" alt="고양이">'});
  await page.waitForFunction(() => document.querySelectorAll('.cv-canvas .fe-stage .fi-image').length === 2);

  await paste({text: 'https://padlet.com/teacher/board'});
  await page.locator('.cv-canvas .fe-stage .fi-web').waitFor();
  assert.equal(await count('.fi'), before + 6);

  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});
