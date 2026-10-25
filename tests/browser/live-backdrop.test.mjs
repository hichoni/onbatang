// 움직이는 바탕(src/live.js): 바탕색 칸에서 고르면 저장되고 꾸미기 판에서 움직인다. 발표에서는 장이 열린 때부터 움직이고,
// 그림으로 내려받으면 멈춘 모습이, 영상(프레임마다 그린다)에는 순간마다 다른 모습이 글 아래에 들어간다. 인터넷 · 바깥 요청은 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 150000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName,getDesign} from '/app/store.js';
try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
setStorageName('live-fixture');
const record=newRecord('16:9');record.name='움직이는 바탕';record.slides=[{id:'plive0001',bg:'#ffffff',items:[{id:'elive0001',t:'text',text:'오늘의 하늘',x:50,y:50,w:60,size:8,color:'#ffffff'}]}];await putDesign(record);
window.recordId=record.id;window.getDesign=getDesign;await startMinican({storage:'live-fixture'});await openSavedDesign(record.id);window.ready=true;
</script>`;
// canvas 전체의 합(바탕이 움직이면 바뀐다).
const sample = (page, selector) => page.evaluate((sel) => { const c = document.querySelector(sel); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) >>> 0; return h; }, selector);

test('moving backgrounds: picked in the background panel, saved, moving in the editor and the show, a still in images and every frame in video', options, async t => {
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
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  const errors = [], external = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === origin || ['data:', 'blob:', 'about:'].includes(u.protocol)) return route.continue(); external.push(u.origin); return route.abort(); });
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  // 빈 곳을 누른 채로 위 막대의 "바탕색"을 열고 밤하늘을 고른다.
  await page.locator('.fe-tb.pagebg, [class*="pagebg"]').first().click();
  const tiles = page.locator('[data-live-tile]');
  assert.equal(await tiles.count(), 26, 'none + 25 styles');
  assert.equal(await page.locator('.fe-lives-head').count(), 5, 'five groups');
  await page.locator('[data-live-tile=stars]').click();
  assert.equal(await page.locator('[data-live-tile=stars]').getAttribute('aria-pressed'), 'true');
  const stage = '.cv-canvas .fe-stage .fe-live-canvas';
  await page.locator(stage).waitFor();
  const a = await sample(page, stage); await page.waitForTimeout(700); const b = await sample(page, stage);
  assert.notEqual(a, b, 'the editor stage moves');
  for (let i = 0; i < 40; i++) { const d = await page.evaluate(async (id) => (await window.getDesign(id)).slides[0], await page.evaluate(() => window.recordId)); if (d.live?.id === 'stars') { assert.equal(d.bg, '#0c1431', 'the card colour follows the style'); break; } if (i === 39) assert.fail('not saved'); await page.waitForTimeout(250); }
  // 밝은 바탕(종이 산)으로 바꾸면 안 보이게 될 흰 글은 그 바탕의 글자 색이 된다.
  await page.locator('[data-live-tile=paperhills]').click();
  for (let i = 0; i < 40; i++) { const d = await page.evaluate(async (id) => (await window.getDesign(id)).slides[0], await page.evaluate(() => window.recordId)); if (d.live?.id === 'paperhills') { assert.equal(d.items[0].color, '#1d2433'); break; } if (i === 39) assert.fail('not saved'); await page.waitForTimeout(250); }
  // 발표: 장이 열리면 움직인다.
  await page.keyboard.press('Escape');
  await page.locator('.cv-show-btn').click();
  const show = '.cv-show .fe-card .fe-live-canvas';
  await page.locator(show).waitFor();
  await page.waitForTimeout(200);
  const c = await sample(page, show); await page.waitForTimeout(700); const d = await sample(page, show);
  assert.notEqual(c, d, 'the show moves');
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});
  // 그림 · 영상: 멈춘 모습은 바탕이 칠해지고, 영상의 두 순간은 바탕이 다르며 글은 그 위에 그대로 있다.
  const out = await page.evaluate(async () => {
    const {designToCanvas, createFilm} = await import('/src/index.js');
    const design = { id: 'plive0001', bg: '#0c1431', live: { id: 'stars' }, items: [{ id: 'elive0001', t: 'text', text: '오늘의 하늘', x: 50, y: 50, w: 60, size: 8, color: '#ffffff' }] };
    const png = await designToCanvas(design, { width: 640, aspect: 16 / 9 });
    const px = (cv, x, y) => [...cv.getContext('2d').getImageData(x, y, 1, 1).data];
    const film = createFilm([design], { width: 640, height: 360, stay: 3 });
    await film.ready(0);
    const grab = (ms) => { film.draw(0, ms); const d = film.canvas.getContext('2d').getImageData(0, 0, 640, 360).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) >>> 0; return { corner: h, center: px(film.canvas, 320, 180) }; };
    const one = grab(1000), two = grab(2200);
    film.close();
    return { stillDark: px(png.canvas, 10, 10).slice(0, 3).every((v) => v < 60), one, two };
  });
  assert.equal(out.stillDark, true, 'the still is painted under the card');
  assert.notEqual(out.one.corner, out.two.corner, 'each video frame draws its own moment');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});
