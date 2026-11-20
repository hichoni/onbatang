// 휴대폰 세로 화면의 재생기(보기 링크 · 공유 링크): 올린 HTML 장은 실제 장 크기로 그린다(컴퓨터 너비로 그려 줄이지 않는다).
// 컴퓨터 너비(1024)로 그리면 화면 비율(devicePixelRatio 3)을 따라 해상도를 정하는 HTML 발표가 2.6배 큰 그림을 만들어
// 아이폰 사파리가 메모리 부족으로 탭을 끈다(2026-11-21 K-EDU27 발표 보기 링크). 웹사이트 장은 그대로 컴퓨터 너비로 그려 줄인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const deck = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#123}</style><p id="size"></p>'
  + '<script>const s=()=>{document.getElementById("size").textContent=innerWidth+"x"+innerHeight;};s();addEventListener("resize",s);</script>';
const slides = [
  {id: 'phtmlphone1', web: {html: deck, filename: 'deck.html'}, items: []},
  {id: 'psitephone1', web: {url: 'https://example.com/'}, items: []},
];
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/player.css">
<body style="margin:0;background:#222"><main id="stage"></main><script type="module">
import {mountPlayer} from '/app/player.js';
window.player=mountPlayer(document.getElementById('stage'),{slides:${JSON.stringify(slides).replaceAll('</', '<\\/')},aspect:16/9});window.ready=true;
</script>`;

test('phone portrait player: uploaded HTML uses the real slide size, websites keep the scaled desktop width', options, async t => {
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
  const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true});
  await page.route('https://example.com/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><p>site</p>'}));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);
  const frame = () => page.locator('#stage > .fe-card:last-child > .fe-web-frame');
  await frame().waitFor();
  await page.waitForTimeout(100);
  const look = () => frame().evaluate(f => { const host = f.parentElement, r = f.getBoundingClientRect(); return {scaled: 'scaled' in f.dataset, transform: f.style.transform, width: f.style.width, box: [Math.round(r.width), Math.round(r.height)], host: [host.clientWidth, host.clientHeight]}; });
  const upload = await look();
  assert.ok(upload.host[0] < 600, `the slide is phone narrow (${upload.host})`);
  assert.equal(upload.scaled, false, 'uploaded HTML is not scaled from desktop width');
  assert.equal(upload.transform, '');
  assert.equal(upload.width, '');
  assert.deepEqual(upload.box, upload.host, 'HTML fills the real slide box');
  const inside = page.frames().find(f => f !== page.mainFrame());
  await inside.waitForFunction(() => document.getElementById('size')?.textContent);
  assert.equal(await inside.evaluate(() => innerWidth), upload.host[0], 'the HTML lays out at the real slide width');
  await page.evaluate(() => window.player.next());
  await page.waitForTimeout(1200);
  const site = await look();
  assert.equal(site.scaled, true, 'websites still draw at desktop width on phones');
  assert.equal(site.width, '1024px');
  assert.deepEqual(errors, []);
});
