// 넘겨도 켜 두기(브라우저): 웹사이트 장에 "넘겨도 켜 두기"를 켜면, 발표 중 다른 장으로 넘겨도 사이트를 닫지 않고 숨겨 둔다.
// 돌아오면 새로 열리지 않고 하던 그대로이며(누른 것 · 적은 것), 숨긴 동안에도 사이트 안의 일은 이어진다. 켜 두지 않은 웹 장은 전처럼 닫힌다.
// 발표를 끝내면 켜 둔 사이트도 모두 닫는다. 사이트는 https://site.test/ 로 꾸며 낸 작은 쪽이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const SITE = '<!doctype html><meta charset="utf-8"><body style="margin:0;font:24px sans-serif"><button id="b" style="font-size:40px;margin:80px">눌러 보기</button><p id="out">아직</p><p id="tick">0</p><script>let n=0;setInterval(()=>{tick.textContent=String(++n)},50);b.onclick=()=>{out.textContent="눌렀어요"};</script>';
const fixture = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('web-keep');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
const r=newRecord('16:9');r.name='켜 두기';r.slides=[{items:[],web:{url:'https://site.test/keep',keep:true}},{items:[{id:'etitle00001',t:'text',text:'둘째 장',x:50,y:50,w:60,size:6}]},{items:[],web:{url:'https://site.test/plain'}}];
await putDesign(r);window.readSaved=()=>getDesign(r.id);
await startMinican({storage:'web-keep'});window.ready=true;
</script>`;

test('a kept website stays open across slides: one load, same state, still running; others close; the show closes them all', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch(process.env.MINICAN_CHROMIUM ? {executablePath: process.env.MINICAN_CHROMIUM, headless: true} : {channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  const loads = {keep: 0, plain: 0};
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('https://site.test/')) { loads[new URL(url).pathname.slice(1)]++; return route.fulfill({contentType: 'text/html', body: SITE}); }
    return /^https?:/.test(url) && !url.startsWith(origin + '/') ? route.abort() : route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-list .cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();

  // 꾸미기: 내 자료 → 웹사이트에 "넘겨도 켜 두기"가 켜져 있고, 끄고 켜면 그대로 저장된다
  await page.locator('.fe-tab[data-tab="upload"]').click();
  await page.locator('[data-upload-tab="web"]').click();
  const keep = page.locator('[data-web-keep]');
  assert.equal(await keep.isChecked(), true);
  await keep.uncheck();
  await page.waitForFunction(async () => (await window.readSaved()).slides[0].web.keep === undefined);
  await page.locator('[data-web-keep]').check();
  await page.waitForFunction(async () => (await window.readSaved()).slides[0].web.keep === true);

  // 발표: 켜 둔 사이트에서 누르고, 다음 장으로 넘긴다
  await page.locator('.cv-show-btn').click();
  const shown = page.locator('[data-show-web]:not([data-away])');
  await shown.waitFor();
  const site = page.frameLocator('[data-show-web]:not([data-away]) iframe');
  await site.locator('#b').waitFor();
  await page.locator('[data-web-use]').click();
  await site.locator('#b').click();
  assert.equal(await site.locator('#out').textContent(), '눌렀어요');
  await page.locator('[data-web-view]').click();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  const away = page.locator('[data-show-web][data-away]');
  assert.equal(await away.count(), 1, 'hidden, not closed');
  assert.equal(await away.evaluate(n => getComputedStyle(n).visibility), 'hidden');
  assert.equal(await shown.count(), 0);
  const tickAway = Number(await page.frameLocator('[data-show-web][data-away] iframe').locator('#tick').textContent());
  await page.waitForTimeout(800);

  // 돌아오면: 새로 열리지 않고 하던 그대로, 숨긴 동안에도 돌았다
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('1 /'));
  await shown.waitFor();
  assert.equal(await site.locator('#out').textContent(), '눌렀어요', 'same page, same state');
  assert.ok(Number(await site.locator('#tick').textContent()) >= tickAway + 5, 'kept running while away');
  assert.equal(loads.keep, 1, 'loaded once');
  assert.equal(await shown.getAttribute('data-mode'), 'view');

  // 켜 두지 않은 웹 장은 떠나면 닫히고, 돌아오면 새로 연다
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('3 /'));
  await page.frameLocator('[data-show-web]:not([data-away]) iframe').locator('#b').waitFor();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  assert.equal(await page.locator('[data-show-web]').count(), 1, 'only the kept one remains');
  await page.keyboard.press('ArrowRight');
  await page.frameLocator('[data-show-web]:not([data-away]) iframe').locator('#b').waitFor();
  assert.equal(loads.plain, 2);

  // 발표를 끝내면 켜 둔 사이트도 닫는다
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});
  assert.equal(await page.locator('[data-show-web]').count(), 0);
  assert.deepEqual(errors, []);
});
