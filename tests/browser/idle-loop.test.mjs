// 머무는 동안 계속 움직이기: 움직임 칸에서 고르고 저장되는지, 발표에서 되풀이해 움직이고 장을 떠나면 멈추는지(브라우저).
// MINICAN_PLAYWRIGHT_PATH 가 없으면 건너뛴다(emphasis-auto-gif.test.mjs 와 같다).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const fixture = slides => `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('v64-fixture');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
const seed=newRecord('16:9');seed.name='계속 움직이기 검수';seed.slides=${JSON.stringify(slides)};
await putDesign(seed);window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'v64-fixture'});window.ready=true;
</script>`;
const text = (id, value, patch = {}) => ({id, t: 'text', text: value, x: 50, y: 30, w: 50, size: 5, ...patch});
const shape = (id, patch = {}) => ({id, t: 'shape', shape: 'circle', x: 30, y: 65, w: 16, h: 24, color: '#3d4bc0', ...patch});

async function setup(t, slides) {
  const html = fixture(slides);
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
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
  await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? route.abort() : route.continue());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  return {page, errors};
}
async function saved(page, check) {
  for (let end = Date.now() + 15000; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (check(await page.evaluate(() => window.readSaved()))) return;
  assert.fail('saved record never matched');
}
const anims = (page, sel) => page.evaluate(s => document.querySelector(s).getAnimations().map(a => [a.playState, a.effect.getTiming().duration, a.effect.getTiming().iterations]), sel);

test('계속 움직이기: chosen in the panel it is saved; in the show it loops, outlives clicks, and stops when the slide changes', options, async t => {
  const {page, errors} = await setup(t, [
    {id: 'ploop00001', bg: '#ffffff', items: [text('etitle0001', '제목', {an: 'rise'}), shape('ecircle001'), text('eclick0001', '누르면', {y: 80, aw: true})]},
    {id: 'ploop00002', bg: '#ffffff', items: [text('enext00001', '둘째')]},
  ]);
  const circle = page.locator('.cv-canvas .fe-card .fi-shape').first();
  await circle.click();
  await page.locator('.fe-tab[data-tab="motion"]').click();
  await page.locator('.fe-motions[data-group="idle"] .fe-mo[data-motion="float"]').click();
  await saved(page, r => r.slides[0].items[1].lp === 'float');
  assert.match(await page.locator('.fe-tabbody').textContent(), /숨 쉬듯/);
  // Picking it shows a short loop on the card itself, which winds down on its own.
  assert.deepEqual(await anims(page, '.cv-canvas .fe-card .fi-shape'), [['running', 3400, Infinity]]);
  // The title also loops, started after its entrance.
  await page.locator('.cv-canvas .fe-card .fi-text').first().click();
  await page.locator('.fe-motions[data-group="idle"] .fe-mo[data-motion="breathe"]').click();
  await saved(page, r => r.slides[0].items[0].lp === 'breathe');
  // In the show: the circle breathes from the start (its own phase), the title after it rose.
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  await page.waitForTimeout(400);
  assert.deepEqual(await anims(page, '.cv-show-stage .fi-shape'), [['running', 3400, Infinity]]);
  await page.waitForTimeout(1200);
  assert.deepEqual(await anims(page, '.cv-show-stage .fi-text'), [['running', 3000, Infinity]]);
  // A click reveals the waiting text; the loops keep running (finish() leaves them alone).
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.cv-show-count').textContent(), '1 / 2');
  assert.deepEqual(await anims(page, '.cv-show-stage .fi-shape'), [['running', 3400, Infinity]]);
  // The looping element really moves: its transform differs between two instants.
  const at = () => page.evaluate(() => getComputedStyle(document.querySelector('.cv-show-stage .fi-shape')).transform);
  const a = await at();
  await page.waitForTimeout(700);
  assert.notEqual(a, await at());
  // Next slide: the old card is gone and the new one has no loops.
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '2 / 2');
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => document.querySelectorAll('.cv-show-stage .fi').length), 1);
  assert.deepEqual(await anims(page, '.cv-show-stage .fi-text'), []);
  // Back: the first slide is shown settled, but the loops run again at their own phase.
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '1 / 2');
  await page.waitForTimeout(800);
  assert.deepEqual(await anims(page, '.cv-show-stage .fi-shape'), [['running', 3400, Infinity]]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.querySelector('.cv-show')), null);
  assert.deepEqual(errors, []);
});
