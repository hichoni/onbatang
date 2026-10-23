// 웹사이트 장(브라우저): 내 자료 → 웹사이트에 주소를 넣으면 꾸미기 판에는 표지가, 발표에는 실제 사이트가 열린다.
// 보기: 누르면 다음 장. "사이트 조작하기": 사이트를 직접 누르고(글쇠도 사이트로 간다), 마우스가 사이트 밖으로 나오면 → 가 다시 발표를 넘긴다. Esc 는 보기로.
// 다른 화면 안에 넣는 것을 막아 둔 잘 알려진 사이트는 사이트 대신 "새 창으로 열기". 사이트는 https://site.test/ 로 꾸며 낸 작은 쪽이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const SITE = '<!doctype html><meta charset="utf-8"><body style="margin:0;font:24px sans-serif"><button id="b" style="font-size:40px;margin:80px">눌러 보기</button><p id="out">아직</p><input id="t"><script>b.onclick=()=>{out.textContent="눌렀어요"};addEventListener("keydown",e=>{out.textContent="글쇠 "+e.key})</script>';
const fixture = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('v75-web');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
const r=newRecord('16:9');r.name='웹사이트 장';r.slides=[{items:[{id:'etitle00001',t:'text',text:'첫 장',x:50,y:50,w:60,size:6}]},{items:[{id:'etitle00002',t:'text',text:'둘째 장',x:50,y:50,w:60,size:6}]},{items:[],web:{url:'https://m.naver.com/'}}];
await putDesign(r);window.readSaved=()=>getDesign(r.id);
await startMinican({storage:'v75-web'});window.ready=true;
</script>`;

async function setup(t, html = fixture) {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
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
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('https://site.test/')) return route.fulfill({contentType: 'text/html', body: SITE});
    return /^https?:/.test(url) && !url.startsWith(origin + '/') ? route.abort() : route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-list .cv-item').first().waitFor();
  return {page, errors, origin};
}
const saved = (page) => page.evaluate(async () => (await window.readSaved()).slides);
async function until(page, check, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) { const v = await saved(page); if (check(v)) return v; if (Date.now() > end) throw Error('not saved: ' + JSON.stringify(v)); await page.waitForTimeout(150); }
}
const count = (page) => page.locator('.cv-show-count').textContent();

test('a website slide: cover in the editor, the live site in the show, view/use modes and the keyboard handed back', options, async t => {
  const {page, errors} = await setup(t);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  // 내 자료 → 웹사이트: 주소를 넣으면 이 장(첫 장)이 웹사이트가 된다
  await page.locator('.fe-tab[data-tab="upload"]').click();
  await page.locator('[data-upload-tab="web"]').click();
  await page.locator('.fe-web-input').fill('site.test/app');
  await page.locator('[data-web-set]').click();
  await page.locator('.cv-canvas .fe-web').waitFor();
  assert.match(await page.locator('.cv-canvas .fe-web-host').textContent(), /site\.test/);
  assert.match(await page.locator('[data-web-now]').innerText(), /site\.test/);
  await until(page, (s) => s[0].web?.url === 'https://site.test/app');
  if (process.env.WEB_SHOT) await page.screenshot({path: process.env.WEB_SHOT + '-editor.png'});
  // 발표: 실제 사이트가 열리고, 보기에서는 눌러도 사이트가 아니라 다음 장
  await page.locator('.cv-show-btn').click();
  const web = page.locator('[data-show-web]');
  await web.waitFor();
  assert.equal(await web.getAttribute('data-mode'), 'view');
  const site = page.frameLocator('[data-show-web] iframe');
  await site.locator('#b').waitFor();
  assert.equal(await web.locator('iframe').evaluate((n) => getComputedStyle(n).pointerEvents), 'none');
  if (process.env.WEB_SHOT) await page.screenshot({path: process.env.WEB_SHOT + '-view.png'});
  await page.mouse.click(640, 500);
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  assert.equal(await page.locator('[data-show-web]').count(), 0, 'the site goes with its slide');
  await page.keyboard.press('ArrowLeft');
  await web.waitFor();
  // 조작: 사이트를 직접 누르고, 글쇠도 사이트로 간다(발표는 넘어가지 않는다)
  await page.locator('[data-web-use]').click();
  assert.equal(await web.getAttribute('data-mode'), 'use');
  await site.locator('#b').click();
  assert.equal(await site.locator('#out').textContent(), '눌렀어요');
  await page.keyboard.press('ArrowRight');
  assert.equal(await site.locator('#out').textContent(), '글쇠 ArrowRight');
  assert.match(await count(page), /^1 \//);
  if (process.env.WEB_SHOT) await page.screenshot({path: process.env.WEB_SHOT + '-use.png'});
  // 마우스가 사이트 밖(위의 단추 막대)으로 나오면 글쇠를 돌려받는다: → 가 다음 장으로
  const pill = await page.locator('.cv-web-pill').boundingBox();
  await page.mouse.move(pill.x + 4, pill.y + pill.height / 2);
  await page.waitForFunction(() => document.activeElement?.tagName !== 'IFRAME');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  // 위의 ◀ 단추로 돌아오고, 조작 중 Esc 는 발표를 끝내지 않고 보기로
  await page.keyboard.press('ArrowLeft');
  await web.waitFor();
  await page.locator('[data-web-use]').click();
  await page.keyboard.press('Escape');
  assert.equal(await web.getAttribute('data-mode'), 'view');
  assert.equal(await page.locator('.cv-show').count(), 1);
  await page.locator('[data-web-use]').click();
  await page.locator('[data-web-next]').click();
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  // 막아 둔 잘 알려진 사이트: 사이트 대신 "새 창으로 열기"
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('3 /'));
  const blocked = page.locator('[data-show-web][data-blocked]');
  await blocked.waitFor();
  assert.equal(await blocked.locator('iframe').count(), 0);
  assert.match(await blocked.innerText(), /네이버은\(는\) 다른 화면 안에 넣는 것을 막아 두었어요/);
  assert.equal(await blocked.locator('[data-web-open]').count(), 1);
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});
  // 웹사이트 빼기
  await page.locator('[data-web-remove]').click();
  await until(page, (s) => !s[0].web);
  assert.equal(await page.locator('.cv-canvas .fe-web').count(), 0);
  assert.deepEqual(errors, []);
});
