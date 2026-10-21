// Local-only browser contract for the public page: refreshing never loses the last edit, comes back to the same drawing,
// and the opening splash covers the page until the first screen is fully drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};

async function setup(t, {seen = ['home', 'editor', 'news-0.44']} = {}) {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const f = resolve(root, '.' + decodeURIComponent(path.endsWith('/') ? path + 'index.html' : path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 800}});
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  await context.addInitScript((keys) => { try { for (const k of keys) if (!localStorage.getItem('onbatang-tour-seen-v1:' + k)) localStorage.setItem('onbatang-tour-seen-v1:' + k, '1'); } catch {} }, seen);
  const page = await context.newPage();
  return {page, origin};
}
const editing = page => page.evaluate(() => document.body.classList.contains('cv-editing'));
const stored = page => page.evaluate(() => new Promise((done, fail) => {
  const q = indexedDB.open('minican');
  q.onerror = () => fail(q.error);
  q.onsuccess = () => { const g = q.result.transaction('designs').objectStore('designs').getAll(); g.onsuccess = () => { q.result.close(); done(g.result); }; };
}));
const splashGone = page => page.waitForFunction(() => !document.getElementById('onba-splash'));

test('a refresh right after typing keeps the edit and reopens the same drawing on the same slide', options, async t => {
  const {page, origin} = await setup(t);
  await page.goto(origin + '/app/');
  await splashGone(page);
  assert.equal(await editing(page), false);
  await page.locator('.cv-start').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  // Add a second slide so the reopened slide number is checked too.
  await page.locator('.cv-strip .cv-slide.add').click();
  await page.waitForFunction(() => document.querySelectorAll('.cv-strip .cv-slide:not(.add)').length === 2);
  await page.locator('.cv-strip .cv-slide:not(.add)').first().click();
  const card = await page.locator('.cv-canvas .fe-card').first().boundingBox();
  await page.mouse.dblclick(card.x + card.width * .3, card.y + card.height * .45);
  await page.waitForFunction(() => document.activeElement?.isContentEditable);
  await page.keyboard.press('End');
  await page.keyboard.type(' 새로고침');
  await page.waitForFunction(() => document.activeElement?.textContent.endsWith(' 새로고침'));
  // Well inside the 500 ms autosave delay: only the page-hide save can keep it.
  await page.waitForTimeout(80);
  await page.reload();
  await splashGone(page);
  assert.equal(await editing(page), true, 'came back to the drawing, not the home screen');
  const [record] = await stored(page);
  assert.ok(record.slides.flatMap(s => s.items).some(it => it.t === 'text' && it.text.endsWith(' 새로고침')), 'the last typing was saved');
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('onbatang-draft-v1:')).length), 0, 'the leave-time draft is cleared once it is stored');
  assert.equal(await page.locator('.cv-strip .cv-slide.on').evaluate(n => [...n.parentNode.querySelectorAll('.cv-slide:not(.add)')].indexOf(n)), 0);
  await page.locator('.cv-strip .cv-slide:not(.add)').nth(1).click();
  await page.waitForTimeout(700);
  await page.reload();
  await splashGone(page);
  assert.equal(await page.locator('.cv-strip .cv-slide.on').evaluate(n => [...n.parentNode.querySelectorAll('.cv-slide:not(.add)')].indexOf(n)), 1, 'the same slide');
  // Going back to the list means the next refresh starts at home.
  await page.locator('.cv-back').click();
  await page.waitForFunction(() => !document.body.classList.contains('cv-editing'));
  await page.reload();
  await splashGone(page);
  assert.equal(await editing(page), false);
  assert.equal(await page.locator('.cv-item').count(), 1);
});

test('the opening splash shows the slogan and lifts only after the first screen is drawn', options, async t => {
  const {page, origin} = await setup(t);
  await page.route('**/app/app.js', async route => { await new Promise(r => setTimeout(r, 600)); await route.continue(); });
  await page.goto(origin + '/app/', {waitUntil: 'domcontentloaded'});
  const early = await page.evaluate(() => ({splash: !!document.getElementById('onba-splash'), slogan: document.querySelector('.onba-splash-slogan')?.textContent, tips: document.querySelectorAll('.onba-splash-tips li').length}));
  assert.deepEqual(early, {splash: true, slogan: '생각을 바로, 작품으로.', tips: 5});
  await splashGone(page);
  assert.ok(await page.locator('.cv-hero').isVisible());
  assert.ok(await page.locator('.cv-mine h2').isVisible(), 'the list finished loading before the splash lifted');
  assert.equal(await page.locator('.cv-mine [data-onbatang-loading]').count(), 0);
});

test('a device that already saw the guide gets the new-features guide once when it next opens a drawing', options, async t => {
  const {page, origin} = await setup(t, {seen: ['home', 'editor']});
  await page.goto(origin + '/app/');
  await splashGone(page);
  await page.locator('.cv-start').first().click();
  const card = page.locator('.onba-tour');
  await card.waitFor();
  assert.match(await card.locator('.onba-tour-top span').textContent(), /^온바탕 새 기능 · 1 \/ \d+$/);
  assert.equal(await card.locator('h3').textContent(), '연결선으로 잇기');
  await card.locator('.onba-tour-x').click();
  await page.locator('.cv-back').click();
  await page.waitForFunction(() => !document.body.classList.contains('cv-editing'));
  await page.locator('.cv-start').nth(1).click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.onba-tour').count(), 0, 'shown only once');
});
