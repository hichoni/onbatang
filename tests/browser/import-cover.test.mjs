// PPT 를 담는 동안 화면 전체를 덮는 판(app/pptx-import/saving-cover.js): 지금 담는 장이 크게 보이고, 띠의 장들이 담김 · 담는 중 · 남음으로 바뀌며,
// 멈추기를 누르면 한 번만 멈춘다(브라우저). MINICAN_PLAYWRIGHT_PATH 가 없으면 건너뛴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 60000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/pptx-import/style.css"><body class="mc-app"><main><button id="behind">뒤의 단추</button></main><div class="oi-loading-region is-cover" id="region"></div><script type="module">
import {savingCover} from '/app/pptx-import/saving-cover.js';
const thumb = n => { const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); g.fillStyle = 'hsl(' + n * 50 + ',60%,60%)'; g.fillRect(0, 0, 160, 90); const i = document.createElement('img'); i.src = c.toDataURL(); i.alt = n + '쪽'; return i; };
window.stops = 0;
window.cover = savingCover({pages: [1, 2, 3, 4, 5, 6], thumbOf: n => n === 6 ? null : thumb(n), onCancel: () => window.stops++});
document.getElementById('region').append(window.cover.node); window.ready = true;
</script>`;

test('the saving cover fills the screen, shows the slide being stored and every slide state, and stops once', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/cover.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
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
  const page = await (await browser.newContext({viewport: {width: 1280, height: 800}})).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/cover.html`);
  await page.waitForFunction(() => window.ready);
  // It covers the whole window: the button behind it cannot be pressed.
  const box = await page.locator('.oi-cover').boundingBox();
  assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 1280, 800]);
  assert.equal(await page.evaluate(() => document.elementFromPoint(640, 400).closest('.oi-cover') !== null), true);
  assert.equal(await page.getByRole('dialog', {name: 'PPT 를 온바탕에 담는 중'}).count(), 1);
  const states = () => page.locator('.oi-cover-cell').evaluateAll(cells => cells.map(c => c.dataset.state));
  assert.deepEqual(await states(), ['wait', 'wait', 'wait', 'wait', 'wait', 'wait']);
  // A part of three slides is being stored: they glow, and the big preview shows the first of them.
  await page.evaluate(() => window.cover.update({phase: 'converting', completed: 0, total: 6, current: [1, 2, 3]}));
  assert.deepEqual(await states(), ['now', 'now', 'now', 'wait', 'wait', 'wait']);
  assert.equal(await page.locator('.oi-cover-now-view img').getAttribute('alt'), '1쪽');
  assert.equal(await page.locator('.oi-cover-now-caption').textContent(), '1쪽을 담는 중');
  // The big preview turns through the slides of the part on its own.
  await page.waitForFunction(() => document.querySelector('.oi-cover-now-caption').textContent === '2쪽을 담는 중', null, {timeout: 4000});
  // Saved: they are checked and the count and bar move.
  await page.evaluate(() => window.cover.update({phase: 'saved', completed: 3, total: 6}));
  assert.deepEqual(await states(), ['done', 'done', 'done', 'wait', 'wait', 'wait']);
  assert.equal(await page.locator('.oi-cover-count strong').textContent(), '3');
  assert.equal(await page.locator('.oi-cover-bar').getAttribute('aria-valuenow'), '3');
  // A slide without a ready thumbnail shows its number.
  await page.evaluate(() => window.cover.update({phase: 'converting', completed: 3, total: 6, current: [6]}));
  assert.equal(await page.locator('.oi-cover-now-view').textContent(), '6쪽');
  // A detail message alone does not lose the progress.
  await page.evaluate(() => window.cover.update({detail: '3 / 6쪽 저장 완료'}));
  assert.deepEqual(await states(), ['done', 'done', 'done', 'wait', 'wait', 'now']);
  // Stop: once.
  await page.locator('[data-import-cancel]').click();
  assert.equal(await page.locator('[data-import-cancel]').isDisabled(), true);
  assert.equal(await page.locator('[data-import-cancel]').textContent(), '멈추는 중…');
  assert.equal(await page.evaluate(() => window.stops), 1);
  assert.deepEqual(errors, []);
});
