// 올린 HTML 장(발표 화면 · 보기 링크 · 공유 링크 재생기)은 온바탕 장처럼 1920 너비 화면으로 그려 자리에 맞게 줄이고,
// 줄인 만큼의 실제 선명도(화면 비율 × 줄인 비율)를 devicePixelRatio 로 알려 준다. 자리가 1920 이상이면 그대로 채운다.
// 2026-11-21 K-EDU27 발표 보기 링크: (1) 1024 너비로 그리면서 화면 비율 3을 그대로 두자 2.6배 큰 그림을 만들어 아이폰 사파리가 탭을 껐고,
// (2) 실제 장 크기(390)로 그리면 SVG 안의 1920 canvas 를 사파리가 줄이지 못해 장면이 크게 확대돼 보였다. 웹사이트 장은 그대로 1024 로 그려 줄인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
// 문서가 처음 본 값(스크립트보다 먼저 바뀌었는가)을 적어 둔다.
const deck = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#123}</style><p id="size"></p>'
  + '<script>window.firstDpr=devicePixelRatio;document.getElementById("size").textContent=innerWidth+"x"+innerHeight;</script>';
const slides = [
  {id: 'phtmlphone1', web: {html: deck, filename: 'deck.html'}, items: []},
  {id: 'psitephone1', web: {url: 'https://example.com/'}, items: []},
];
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/player.css">
<body style="margin:0;background:#222"><main id="stage"></main><script type="module">
import {mountPlayer} from '/app/player.js';
window.player=mountPlayer(document.getElementById('stage'),{slides:${JSON.stringify(slides).replaceAll('</', '<\\/')},aspect:16/9});window.ready=true;
</script>`;

test('player: uploaded HTML draws at 1920 and scales down with the real sharpness; wide slots and websites keep their sizes', options, async t => {
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
  const open = async (options) => {
    const page = await browser.newPage(options);
    await page.route('https://example.com/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><p>site</p>'}));
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
    await page.waitForFunction(() => window.ready);
    const frame = () => page.locator('#stage > .fe-card:last-child > .fe-web-frame');
    await frame().waitFor();
    const inside = async () => { let f; await page.waitForFunction(() => document.querySelector('.fe-web-frame')?.srcdoc); while (!(f = page.frames().find(x => x !== page.mainFrame() && x.url() === 'about:srcdoc'))) await page.waitForTimeout(50); await f.waitForFunction(() => document.getElementById('size')?.textContent); return f; };
    const look = () => frame().evaluate(f => { const host = f.parentElement, r = f.getBoundingClientRect(); return {scaled: 'scaled' in f.dataset, transform: f.style.transform, width: f.style.width, box: [Math.round(r.width), Math.round(r.height)], host: [host.clientWidth, host.clientHeight]}; });
    return {page, errors, inside, look};
  };

  // 휴대폰 세로: 1920 너비로 그려 장 너비(약 390)에 맞게 줄이고, 선명도는 3 × 줄인 비율.
  const phone = await open({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true});
  const doc = await phone.inside();
  const upload = await phone.look();
  assert.ok(upload.host[0] < 600, `the slide is phone narrow (${upload.host})`);
  const k = upload.host[0] / 1920;
  assert.equal(upload.scaled, true, 'uploaded HTML is drawn at 1920 and scaled down');
  assert.equal(upload.width, '1920px');
  assert.equal(upload.transform, `scale(${k})`);
  assert.deepEqual(upload.box, upload.host, 'the scaled HTML fills the slide box');
  assert.equal(await doc.evaluate(() => innerWidth), 1920, 'the HTML lays out on a 1920 wide screen');
  const sharp = Math.round(3 * k * 1000) / 1000;
  assert.equal(await doc.evaluate(() => window.firstDpr), sharp, 'the HTML sees the real sharpness before its own scripts run');
  await phone.page.evaluate(() => window.player.next());
  await phone.page.waitForTimeout(1200);
  const site = await phone.look();
  assert.equal(site.scaled, true, 'websites still draw at desktop width on phones');
  assert.equal(site.width, '1024px');
  assert.deepEqual(phone.errors, []);

  // 1920 이상인 자리: 그대로 채우고 선명도도 그대로.
  const wide = await open({viewport: {width: 2100, height: 1300}});
  const wideDoc = await wide.inside();
  const full = await wide.look();
  assert.ok(full.host[0] >= 1920, `the slide is wide (${full.host})`);
  assert.equal(full.scaled, false);
  assert.equal(full.transform, '');
  assert.equal(await wideDoc.evaluate(() => innerWidth), full.host[0]);
  assert.equal(await wideDoc.evaluate(() => window.firstDpr), 1);
  assert.deepEqual(wide.errors, []);
});
