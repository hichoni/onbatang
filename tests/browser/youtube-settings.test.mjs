// 유튜브 재생 설정: 꾸미기 판에서 끝 시각 · 화면 가득 · 자막 · 되풀이를 고르면 저장되고,
// 발표에서 틀면 영상이 장 전체로 커지며 고른 자막 · 끝 시각이 트는 주소에 실린다. 유튜브에는 실제로 접속하지 않는다.
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
setStorageName('yt-fixture');
const record=newRecord('16:9');record.name='영상 수업';record.slides=[{id:'pyt00001',bg:'#ffffff',items:[{id:'eyt00001',t:'yt',yt:'dQw4w9WgXcQ',x:30,y:40,w:40,h:40,start:30}]}];await putDesign(record);
window.recordId=record.id;await startMinican({storage:'yt-fixture'});await openSavedDesign(record.id);window.ready=true;
</script>`;

test('YouTube settings: end time, full screen, captions and repeat are saved, and the show grows the video to the whole slide', options, async t => {
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
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // 유튜브 썸네일 · 영상은 막는다(트는 주소만 본다).
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === origin || ['data:', 'blob:', 'about:'].includes(u.protocol)) return route.continue(); return route.abort(); });
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-canvas .fe-stage .fi-yt').click();
  await page.getByRole('button', {name: /1:30부터|0:30부터|재생 설정/}).first().click();
  await page.locator('.fe-yt-end').fill('1:15');
  await page.locator('.fe-yt-end').press('Enter');
  await page.locator('[data-yt-full=on]').click();
  await page.locator('[data-yt-cc=ko]').click();
  await page.locator('[data-yt-loop=on]').click();
  assert.equal(await page.locator('[data-yt-full=on]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.cv-canvas .fe-stage .fi-yt.full').count(), 1, 'the editor marks a full-screen video');
  const saved = async () => page.evaluate(async (id) => { const {getDesign} = await import('/app/store.js'); const it = (await getDesign(id)).slides[0].items[0]; return {start: it.start, end: it.end, full: it.full, cc: it.cc, loop: it.loop}; }, await page.evaluate(() => window.recordId));
  for (let i = 0; i < 60 && !(await saved()).loop; i++) await page.waitForTimeout(250);
  assert.deepEqual(await saved(), {start: 30, end: 75, full: true, cc: 'ko', loop: true});

  await page.keyboard.press('Escape');
  await page.locator('.cv-show-btn').click();
  const video = page.locator('.cv-show .fi-yt');
  await video.waitFor();
  const src = await page.locator('.cv-show .fi-yt-frame').getAttribute('src');
  assert.match(src, /start=30&end=75&cc_load_policy=1&cc_lang_pref=ko&hl=ko&enablejsapi=1/);
  assert.equal(await video.evaluate(n => n.classList.contains('expanded')), false, 'it waits in its own box until played');
  await page.keyboard.press(' ');
  await page.waitForFunction(() => document.querySelector('.cv-show .fi-yt')?.classList.contains('expanded'));
  const box = await video.boundingBox(), card = await page.locator('.cv-show .fe-card').first().boundingBox();
  assert.ok(Math.abs(box.width - card.width) < 2 && Math.abs(box.height - card.height) < 2, `covers the slide: ${JSON.stringify({box, card})}`);
  assert.deepEqual(errors, []);
});
