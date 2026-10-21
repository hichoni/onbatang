// Local-only browser contract for presentation tools: speaker notes, shared keys, presenter window and app clicker keys.
// No real accounts, uploads or network services.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep, join} from 'node:path';
import {newGaiActivity} from '../../src/gai-app.js';
import {createHtmlLesson} from '../../app/html-lesson.js';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
// A generated app that keeps arrow keys for itself but leaves PageDown to the presentation.
const appSource = `<main><button id="step">단계</button><output id="count">0</output><input id="answer" aria-label="답"></main><script>
const bridge="ONBATANG_APP_BRIDGE_TOKEN",initial={me:{checkpoint:{"onbatangRestoreMarker":"ONBATANG_APP_CHECKPOINT"}}};let count=0;
function report(){parent.postMessage({type:'gai-classroom-report',bridge,request:crypto.randomUUID(),patch:{checkpoint:{count},state:{count},answer:count+'단계',progress:0,score:null,completed:false}},'*');}
addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();count++;document.getElementById('count').textContent=count;report();}});
document.getElementById('step').onclick=()=>{count++;document.getElementById('count').textContent=count;report();};report();
</script>`;
const activity = () => newGaiActivity({title: '단계 앱', instructions: '단계를 눌러요.', document: appSource, project: {template: 'freeform', title: '단계 앱'}, state: {}});
const text = (id, value) => ({id, t: 'text', layout: 'slide', text: value, x: 50, y: 45, w: 80, h: 20, size: 6, color: '#1d2433', align: 'c'});
const appFrame = page => page.frameLocator('.gai-app-frame').frameLocator('[data-gai-app-content]');

async function browserFor(t) {
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  // Nested opaque srcdoc app frames stay reachable when the test runs frames in one renderer (same rule as gai-app-sandbox).
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true, args: ['--disable-features=IsolateOrigins,site-per-process', '--disable-site-isolation-trials']});
  t.after(() => browser.close());
  return browser;
}

async function setupApp(t) {
  const act = activity();
  const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/gai-app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName} from '/app/store.js';
setStorageName('presentation-fixture');const seed=newRecord('16:9');seed.name='발표 도구 검수';
seed.slides=[{id:'pslide00001',bg:'#ffffff',notes:'첫 쪽 노트: 인사하고 질문 던지기',items:[${JSON.stringify(text('etext00001', '첫 쪽'))}]},
 {id:'pslide00002',bg:'#ffffff',activity:${JSON.stringify(act).replace(/</g, '\\u003c')},items:[${JSON.stringify(text('etext00002', '앱 표지'))}]},
 {id:'pslide00003',bg:'#ffffff',notes:'마지막 쪽 노트',items:[${JSON.stringify(text('etext00003', '셋째 쪽'))}]}];
await putDesign(seed);window.seedId=seed.id;await startMinican({storage:'presentation-fixture'});window.ready=true;
</script>`;
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.html': 'text/html'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const browser = await browserFor(t), origin = `http://127.0.0.1:${server.address().port}`, external = [];
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 800}});
  await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? (external.push(route.request().url()), route.abort()) : route.continue());
  const page = await context.newPage();
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  return {page, context, external};
}

test('editor keeps per-slide speaker notes and the presentation offers shared keys, tools and a presenter window', options, async t => {
  const {page, context, external} = await setupApp(t);
  await page.locator('.cv-item .cv-thumb').first().click();
  const notes = page.locator('.fe-notes');
  await notes.locator('summary').click();
  await assert.doesNotReject(page.locator('.fe-notes-input').waitFor());
  assert.equal(await page.locator('.fe-notes-input').inputValue(), '첫 쪽 노트: 인사하고 질문 던지기');
  await page.locator('.fe-notes-input').fill('첫 쪽 노트: 고친 문장');
  assert.match(await notes.locator('.fe-notes-mark').textContent(), /자$/);
  // The open/closed choice is remembered on this device.
  assert.equal(await page.evaluate(() => localStorage.getItem('minican.notes-open')), '1');

  await page.locator('.cv-show-btn').click();
  const show = page.locator('.cv-show');
  await show.waitFor();
  const count = () => page.locator('.cv-show-count').textContent();
  assert.equal(await count(), '1 / 3');
  await page.keyboard.press('End'); assert.equal(await count(), '3 / 3');
  await page.keyboard.press('Home'); assert.equal(await count(), '1 / 3');
  await page.keyboard.press('3'); await page.keyboard.press('Enter'); assert.equal(await count(), '3 / 3');
  // Overview: every page as a tile, pick one to jump.
  await page.keyboard.press('g');
  assert.equal(await page.locator('.ost-tile').count(), 3);
  await page.locator('.ost-tile').first().click();
  assert.equal(await count(), '1 / 3');
  assert.equal(await page.locator('.ost-panel.open').count(), 0);
  // Black screen, then any key returns without moving.
  await page.keyboard.press('b');
  assert.equal(await page.locator('.ost-curtain.black').count(), 1);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.ost-curtain.black').count(), 0);
  assert.equal(await count(), '1 / 3');
  // Pen: drawing does not advance; Esc turns the pen off before ending the show.
  await page.keyboard.press('p');
  const box = await page.locator('.ost-ink').boundingBox();
  await page.mouse.move(box.x + 200, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 320, box.y + 260); await page.mouse.up();
  assert.equal(await count(), '1 / 3');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.ost-ink.on').count(), 0);
  assert.equal(await show.count(), 1);
  await page.keyboard.press('?');
  assert.equal(await page.locator('.ost-help-list dt').count() >= 8, true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.ost-panel.open').count(), 0);

  // Presenter window: notes, next page and timer; its keys drive the audience screen.
  const popupPromise = context.waitForEvent('page');
  await page.keyboard.press('s');
  const presenter = await popupPromise;
  await presenter.locator('.ost-p-notes').waitFor();
  assert.equal(await presenter.locator('.ost-p-notes').textContent(), '첫 쪽 노트: 고친 문장');
  assert.equal(await presenter.locator('.ost-p-count').textContent(), '1 / 3');
  assert.match(await presenter.locator('.ost-p-clock').textContent(), /^\d+:\d\d$/);
  assert.equal(await presenter.locator('.ost-p-next .fe-card').count(), 1);
  await presenter.keyboard.press('ArrowRight');
  assert.equal(await count(), '2 / 3');
  assert.equal(await presenter.locator('.ost-p-count').textContent(), '2 / 3');
  assert.match(await presenter.locator('.ost-p-notes').textContent(), /노트가 없어요/);

  // App slide: after clicking inside the sandboxed app, the app keeps its own keys but a remote clicker still turns the page.
  await appFrame(page).locator('#step').click();
  await appFrame(page).locator('#step').press('ArrowRight');
  assert.equal(await appFrame(page).locator('#count').textContent(), '2');
  assert.equal(await count(), '2 / 3');
  await appFrame(page).locator('#step').press('PageDown');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '3 / 3');
  assert.equal(await presenter.locator('.ost-p-notes').textContent(), '마지막 쪽 노트');
  const closing = presenter.waitForEvent('close');
  await page.keyboard.press('Escape');
  await show.waitFor({state: 'detached'});
  await closing;
  assert.deepEqual(external, []);
});

test('downloaded HTML lessons present with the same keys, opt-in notes in the presenter window and clicker keys from apps', options, async t => {
  const pages = [
    {id: 'pslide00001', image: png, aspect: 16 / 9, notes: 'HTML 첫 쪽 노트'},
    {id: 'pslide00002', image: png, aspect: 16 / 9, activity: activity()},
    {id: 'pslide00003', image: png, aspect: 16 / 9},
  ];
  const html = await createHtmlLesson({title: 'HTML 발표', pages}).text();
  const dir = await mkdtemp(join(tmpdir(), 'onbatang-show-')), file = join(dir, 'lesson.html');
  await writeFile(file, html);
  const browser = await browserFor(t), context = await browser.newContext({viewport: {width: 1280, height: 800}}), external = [];
  await context.route('**/*', route => /^https?:/.test(route.request().url()) ? (external.push(route.request().url()), route.abort()) : route.continue());
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.locator('.lesson-present').click();
  await page.locator('.lesson-show').waitFor();
  const count = () => page.locator('.lesson-show-count').textContent();
  assert.equal(await count(), '1 / 3');
  await page.keyboard.press('End'); assert.equal(await count(), '3 / 3');
  await page.keyboard.press('1'); await page.keyboard.press('Enter'); assert.equal(await count(), '1 / 3');
  await page.keyboard.press('g'); assert.equal(await page.locator('.ost-tile').count(), 3); await page.keyboard.press('Escape');
  const popupPromise = context.waitForEvent('page');
  await page.keyboard.press('s');
  const presenter = await popupPromise;
  await presenter.locator('.ost-p-notes').waitFor();
  assert.equal(await presenter.locator('.ost-p-notes').textContent(), 'HTML 첫 쪽 노트');
  assert.equal(await presenter.locator('.ost-p-view img').count(), 2);
  // Clicking the slide advances; the app starts from its cover and a clicker key moves on from inside it.
  await page.locator('.lesson-slide').click();
  assert.equal(await count(), '2 / 3');
  await page.locator('.lesson-start').click();
  await appFrame(page).locator('#step').click();
  await appFrame(page).locator('#step').press('PageDown');
  await page.waitForFunction(() => document.querySelector('.lesson-show-count')?.textContent === '3 / 3');
  const closing = presenter.waitForEvent('close');
  await page.keyboard.press('Escape');
  await page.locator('.lesson-show').waitFor({state: 'detached'});
  await closing;
  assert.equal(await page.locator('.lesson-header').isVisible(), true);
  assert.deepEqual(external, []);
});
