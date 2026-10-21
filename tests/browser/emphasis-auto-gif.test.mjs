// Local-only browser contract for v0.38: emphasis effects, auto-advance with loop, rehearsal timings and GIF export.
// No accounts or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep, join} from 'node:path';
import {createHtmlLesson} from '../../app/html-lesson.js';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const fixture = slides => `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('v38-fixture');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.44','1');}catch{}
const seed=newRecord('16:9');seed.name='강조 자동 검수';seed.slides=${JSON.stringify(slides)};
await putDesign(seed);window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'v38-fixture'});window.ready=true;
</script>`;
const text = (id, value, patch = {}) => ({id, t: 'text', text: value, x: 50, y: 30, w: 50, size: 5, ...patch});
const shape = (id, patch = {}) => ({id, t: 'shape', shape: 'circle', x: 30, y: 65, w: 16, h: 24, color: '#3d4bc0', ...patch});

async function setup(t, slides, {motion = 'no-preference', downloads = false} = {}) {
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
  const origin = `http://127.0.0.1:${server.address().port}`, external = [];
  const context = await browser.newContext({reducedMotion: motion, viewport: {width: 1280, height: 800}, acceptDownloads: downloads});
  await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? (external.push(route.request().url()), route.abort()) : route.continue());
  const page = await context.newPage();
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  return {page, external};
}
async function saved(page, check) {
  for (let end = Date.now() + 15000; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (check(await page.evaluate(() => window.readSaved()))) return;
  assert.fail('saved record never matched');
}
const count = page => page.locator('.cv-show-count').textContent();

test('emphasis: chosen in the motion panel, then a click in the show moves the visible element once', options, async t => {
  const {page, external} = await setup(t, [
    {id: 'pemph00001', bg: '#ffffff', items: [text('etitle0001', '제목'), shape('ecircle001')]},
    {id: 'pemph00002', bg: '#ffffff', items: [text('enext00001', '둘째')]},
  ]);
  const circle = page.locator('.cv-canvas .fe-card .fi-shape').first();
  await circle.click();
  await page.locator('.fe-tab[data-tab="motion"]').click();
  await page.locator('.fe-motions[data-group="emph"] .fe-mo[data-motion="pulse"]').click();
  await saved(page, r => r.slides[0].items[1].em === 'pulse');
  assert.match(await page.locator('.fe-tabbody').textContent(), /누를 때 한 번 움직이고/);
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  await page.waitForTimeout(500);
  // The circle is visible from the start (emphasis does not hide it).
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.cv-show-stage .fi-shape')).visibility), 'visible');
  await page.keyboard.press('ArrowRight');
  const playing = await page.evaluate(() => document.querySelector('.cv-show-stage .fi-shape').getAnimations().map(a => [a.playState, a.effect.getTiming().duration]));
  assert.deepEqual(playing, [['running', 760]]);
  assert.equal(await count(page), '1 / 2');
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => document.querySelector('.cv-show-stage .fi-shape').getAnimations().length), 0);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '2 / 2');
  await page.keyboard.press('Escape');
  assert.deepEqual(external, []);
});

test('auto-advance walks the slides on their rehearsed times and loops; rehearsal measures and saves times', options, async t => {
  const {page, external} = await setup(t, [
    {id: 'pauto00001', bg: '#ffffff', dur: 1, items: [text('eauto00001', '하나')]},
    {id: 'pauto00002', bg: '#fff3bf', dur: 1, items: [text('eauto00002', '둘')]},
    {id: 'pauto00003', bg: '#ffffff', items: [text('eauto00003', '셋')]},
  ], {motion: 'reduce'});
  // 3rd slide has no time yet: give it one through rehearsal later. First, auto mode on the timed ones.
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  await page.keyboard.press('a');
  assert.equal(await page.locator('.cv-show-key[aria-label^="자동 넘기기"]').getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '2 / 3', null, {timeout: 4000});
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '3 / 3', null, {timeout: 4000});
  await page.keyboard.press('a');
  await page.waitForTimeout(1500);
  assert.equal(await count(page), '3 / 3');
  // Loop: from the last slide auto mode goes back to the first (a 1-second slide is the shortest wait).
  await page.keyboard.press('End');
  await page.evaluate(() => { window.seen = []; new MutationObserver(() => window.seen.push(document.querySelector('.cv-show-count').textContent)).observe(document.querySelector('.cv-show-count'), {childList: true, characterData: true, subtree: true}); });
  await page.keyboard.press('a');
  await page.waitForFunction(() => window.seen.includes('1 / 3'), null, {timeout: 12000});
  await page.keyboard.press('a');
  await page.keyboard.press('Home');
  // Rehearsal: about 1.3 s on slide 1, about 2.4 s on slide 2, then end the show.
  await page.keyboard.press('r');
  await page.locator('.ost-rehearse.on').waitFor();
  await page.waitForTimeout(1300);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(2400);
  assert.match(await page.locator('.ost-rehearse').textContent(), /리허설 · 이 쪽 0:0[23] · 전체 0:0[34]/);
  await page.keyboard.press('Escape');
  await page.locator('.cv-rehearse-list').waitFor();
  assert.deepEqual(await page.locator('.cv-rehearse-list li b').allTextContents(), ['1장', '2장']);
  await page.getByRole('button', {name: '장마다 저장'}).click();
  await saved(page, r => r.slides[0].dur >= 1 && r.slides[0].dur <= 2 && r.slides[1].dur >= 2 && r.slides[1].dur <= 3 && !r.slides[2].dur);
  assert.match(await page.locator('.cv-slide-list .cv-slide[data-slide="0"]').getAttribute('aria-label'), /리허설 [12]초/);
  assert.deepEqual(external, []);
});

test('GIF export: one frame per shown slide, the browser decodes it, sizes and stays follow the choices', options, async t => {
  const {page, external} = await setup(t, [
    {id: 'pgif000001', bg: '#ffffff', items: [text('egif000001', '하나', {color: '#e03131'}), shape('egifshape1')]},
    {id: 'pgif000002', bg: '#3d4bc0', hidden: true, items: [text('egif000002', '숨김')]},
    {id: 'pgif000003', bg: '#fff3bf', dur: 2, items: [text('egif000003', '셋')]},
  ], {motion: 'reduce', downloads: true});
  await page.locator('.cv-down-btn').click();
  await page.locator('.cv-down-format[data-type="gif"]').click();
  await page.locator('[data-gif-width="800"]').click();
  await page.locator('[data-stay="3"]').click();
  assert.match(await page.locator('.cv-down-summary').textContent(), /GIF · 모든 장.*가로 800px · 장마다 3초/);
  assert.equal(await page.locator('[data-download-save]').textContent(), 'GIF 내려받기');
  const download = page.waitForEvent('download');
  await page.locator('[data-download-save]').click();
  const file = await (await download).path();
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(0, 6).toString('latin1'), 'GIF89a');
  assert.equal(bytes.readUInt16LE(6), 800);
  assert.equal(bytes.readUInt16LE(8), 450);
  // Two frames (the hidden slide is left out) with 3 s and the rehearsed 2 s.
  const delays = [];
  for (let p = 0; p < bytes.length - 8; p++) if (bytes[p] === 0x21 && bytes[p + 1] === 0xf9 && bytes[p + 2] === 4) delays.push(bytes.readUInt16LE(p + 4));
  assert.deepEqual(delays, [300, 200]);
  // The browser itself decodes the file and the first frame shows the white slide with the blue circle.
  const look = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/gif;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return {w: img.naturalWidth, h: img.naturalHeight, corner: [...x.getImageData(5, 5, 1, 1).data].slice(0, 3), circle: [...x.getImageData(240, 292, 1, 1).data].slice(0, 3)};
  }, bytes.toString('base64'));
  assert.deepEqual([look.w, look.h], [800, 450]);
  assert.ok(look.corner.every(v => v > 240), `corner ${look.corner}`);
  assert.ok(look.circle[2] > 150 && look.circle[0] < 110, `circle ${look.circle}`);
  assert.deepEqual(external, []);
});

test('a downloaded HTML lesson offers auto-advance with page times but not rehearsal', options, async t => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
  const file = join(await mkdtemp(join(tmpdir(), 'onbatang-auto-')), 'lesson.html');
  await writeFile(file, await createHtmlLesson({title: '자동 수업', pages: [{id: 'pslide00001', image: png, aspect: 16 / 9, dur: 1}, {id: 'pslide00002', image: png, aspect: 16 / 9, dur: 1}]}).text());
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport: {width: 1280, height: 800}}), external = [];
  await context.route('**/*', route => /^https?:/.test(route.request().url()) ? (external.push(route.request().url()), route.abort()) : route.continue());
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.locator('.lesson-present').click();
  await page.locator('.lesson-show').waitFor();
  assert.equal(await page.locator('.lesson-show-key', {hasText: '리허설'}).count(), 0);
  await page.keyboard.press('r');
  assert.equal(await page.locator('.ost-rehearse.on').count(), 0);
  await page.keyboard.press('a');
  await page.waitForFunction(() => document.querySelector('.lesson-show-count')?.textContent === '2 / 2', null, {timeout: 4000});
  await page.waitForFunction(() => document.querySelector('.lesson-show-count')?.textContent === '1 / 2', null, {timeout: 4000});
  assert.deepEqual(external, []);
});
