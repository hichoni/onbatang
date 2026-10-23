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
window.remoteCalls=0;await startMinican({storage:'v75-web',showRemote:{open:async({command})=>{window.remoteCommand=command;window.remoteCalls++;return {update(){},close(){}};}}});window.ready=true;
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
// 웹사이트 상자가 다 나타난 뒤에 만진다(나타나는 동안에는 숨겨져 있어 누른 것이 발표로 간다).
async function boxReady(page) {
  await page.waitForFunction(() => { const box = document.querySelector('.cv-show-stage .fi-web.live'); if (!box) return false; const style = getComputedStyle(box); return style.visibility === 'visible' && Number(style.opacity) === 1 && !box.getAnimations().length; });
}
// "사이트 둘러보기"를 누르고, 정말 둘러보기가 된 뒤에 사이트를 만진다(보기에서 사이트를 누르면 다음 장으로 넘어가므로).
async function useSite(page) {
  await page.locator('[data-web-use]').click();
  await page.waitForFunction(() => document.querySelector('[data-show-web]')?.dataset.mode === 'use' && getComputedStyle(document.querySelector('[data-show-web] iframe')).pointerEvents === 'auto');
}

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
  await useSite(page);
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
  await useSite(page);
  await page.keyboard.press('Escape');
  assert.equal(await web.getAttribute('data-mode'), 'view');
  assert.equal(await page.locator('.cv-show').count(), 1);
  await useSite(page);
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

test('browse the site, finish browsing, then the slide moves on as usual; the phone remote moves on even while browsing', options, async t => {
  const {page, errors} = await setup(t);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  await page.locator('.fe-tab[data-tab="upload"]').click();
  await page.locator('[data-upload-tab="web"]').click();
  await page.locator('.fe-web-input').fill('https://site.test/app');
  await page.locator('[data-web-set]').click();
  await until(page, (s) => s[0].web?.url === 'https://site.test/app');
  await page.locator('.cv-show-btn').click();
  const web = page.locator('[data-show-web]'), site = page.frameLocator('[data-show-web] iframe');
  await site.locator('#b').waitFor();
  assert.equal(await page.locator('[data-web-use]').innerText(), '사이트 둘러보기');
  // 1) 둘러보기 → 사이트를 누르고 글을 친다(글쇠는 사이트로) → 둘러보기 끝내기 → → 로 다음 장
  await useSite(page);
  await site.locator('#b').click();
  await site.locator('#t').fill('안녕');
  await page.keyboard.press('ArrowRight');
  assert.match(await count(page), /^1 \//, 'while browsing, keys belong to the site');
  await page.locator('[data-web-view]').click();
  assert.equal(await web.getAttribute('data-mode'), 'view');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('cv-show')), true, 'the show has the keyboard again');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  // 2) 돌아와서 둘러보기를 끝낸 뒤 화면을 한 번 누르면 다음 장 · 프레젠터의 PageDown 도
  await page.keyboard.press('ArrowLeft');
  await web.waitFor();
  await useSite(page);
  await site.locator('#b').click();
  await page.locator('[data-web-view]').click();
  await page.mouse.click(640, 500);
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  await page.keyboard.press('PageUp');
  await web.waitFor();
  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  // 3) 휴대폰 리모컨: 둘러보는 중(사이트에 글쇠가 가 있어도) "다음"을 누르면 그냥 넘어가고, "앞"으로 돌아오면 다시 보기로 열린다
  await page.locator('[data-show-remote]').click();
  await page.waitForFunction(() => typeof window.remoteCommand === 'function');
  await page.evaluate(() => window.remoteCommand({action: 'prev'}));
  await web.waitFor();
  await useSite(page);
  await site.locator('#t').click();
  await site.locator('#t').type('abc');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'IFRAME');
  await page.evaluate(() => window.remoteCommand({action: 'next'}));
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  assert.equal(await page.locator('[data-show-web]').count(), 0);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('3 /'), null, {timeout: 5000});
  await page.evaluate(() => window.remoteCommand({action: 'prev'}));
  await page.evaluate(() => window.remoteCommand({action: 'prev'}));
  await web.waitFor();
  assert.equal(await web.getAttribute('data-mode'), 'view', 'coming back opens in view mode');
  assert.deepEqual(errors, []);
});

test('a website box inside a slide: placed in the editor, used right away in the show; outside the box the slide moves on', options, async t => {
  const {page, errors} = await setup(t);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  await page.locator('.fe-tab[data-tab="upload"]').click();
  await page.locator('[data-upload-tab="web"]').click();
  await page.locator('.fe-web-input').fill('site.test/box');
  await page.locator('[data-web-box]').click();
  await page.locator('.fe-stage .fi-web').waitFor();
  const items = await until(page, (s) => s[0].items.some((it) => it.t === 'web'));
  const box = items[0].items.find((it) => it.t === 'web');
  assert.equal(box.url, 'https://site.test/box');
  assert.equal(items[0].web, undefined, 'a box does not turn the whole slide into the site');
  // 상자를 옆으로 옮기고 작게: 발표에서 상자 밖을 누를 자리가 생긴다
  if (process.env.WEB_SHOT) await page.screenshot({path: process.env.WEB_SHOT + '-box-editor.png'});
  await page.locator('.cv-show-btn').click();
  const site = page.frameLocator('.cv-show-stage .fi-web.live iframe');
  await site.locator('#b').waitFor();
  await boxReady(page);
  // 상자 안: 모드 없이 바로 누르고 친다(글쇠는 사이트로)
  await site.locator('#b').click();
  assert.equal(await site.locator('#out').textContent(), '눌렀어요');
  await site.locator('#t').click();
  await page.keyboard.press('ArrowRight');
  assert.match(await count(page), /^1 \//);
  if (process.env.WEB_SHOT) await page.screenshot({path: process.env.WEB_SHOT + '-box-show.png'});
  // 상자 밖으로 마우스를 옮기면 글쇠를 돌려받는다 → 다음 장
  await page.mouse.move(8, 400);
  await page.waitForFunction(() => document.activeElement?.tagName !== 'IFRAME');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  // 돌아와서 상자 밖을 누르면 다음 장
  await page.keyboard.press('ArrowLeft');
  await site.locator('#b').waitFor();
  await boxReady(page);
  await page.mouse.click(8, 400);
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  assert.deepEqual(errors, []);
});
