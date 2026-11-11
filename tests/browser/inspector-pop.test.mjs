// 속성 칸에서 펼치는 칸(색 팔레트 · 테두리 · 모서리 · 위치 …)은 누른 단추가 있는 줄 바로 아래에 펴진다.
// 전에는 모든 단추의 맨 아래에 펴져, 노트북 화면에서는 색을 누르고도 팔레트를 찾아 한참 내려가야 했다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName} from '/app/store.js';
setStorageName('inspector-pop');
const seed=newRecord('16:9');seed.name='팝업 검수';
seed.slides=[{id:'ppop0000001',bg:'#ffffff',items:[
 {id:'etexta0001',t:'text',text:'첫째 글',x:30,y:25,w:40,size:5,color:'#1d2433'},
 {id:'eshape0001',t:'shape',shape:'rect',x:70,y:60,w:20,h:20,color:'#1c7ed6'}]}];
await putDesign(seed);
await startMinican({storage:'inspector-pop'});window.ready=true;
</script>`;

test('a property popup opens right under the button that was pressed and is scrolled into view', options, async t => {
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
  // 흔한 노트북 화면: 전에는 팔레트의 대부분이 화면 아래로 나갔다
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1366, height: 768}});
  await context.addInitScript(() => { try { for (const k of ['editor', 'home', 'news-0.45']) localStorage.setItem('onbatang-tour-seen-v1:' + k, '1'); } catch {} });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage .fi').first().waitFor();
  const item = i => page.locator('.cv-canvas .fe-stage .fi').nth(i);
  const place = () => page.evaluate(() => {
    const on = document.querySelector('.cv-properties .fe-bar .fe-tb.has-pop.on'), pop = document.querySelector('.cv-properties .fe-pop:not([hidden])');
    if (!on || !pop) return null;
    const b = on.getBoundingClientRect(), p = pop.getBoundingClientRect(), box = document.querySelector('.cv-properties').getBoundingClientRect();
    return {gap: Math.round(p.top - b.bottom), inBar: !!pop.closest('.fe-bar'), top: Math.round(p.top), bottom: Math.round(p.bottom), boxTop: Math.round(box.top), boxBottom: Math.round(box.bottom), height: Math.round(p.height), button: Math.round(b.top)};
  });
  const open = async name => { await page.locator('.cv-properties .fe-bar .fe-tb.has-pop', {hasText: name}).first().click(); await page.waitForTimeout(150); return place(); };

  // 도형: 채우기 색 → 팔레트가 단추 바로 아래, 속성 칸 안에 다 보인다
  await item(1).click();
  let at = await open('채우기');
  assert.ok(at, 'the fill popup is open');
  assert.equal(at.inBar, true, 'the popup sits among the buttons, not after all of them');
  assert.ok(at.gap >= 0 && at.gap <= 16, `the palette starts right under the pressed button (gap ${at.gap}px)`);
  assert.ok(at.top >= at.boxTop && at.bottom <= at.boxBottom + 1, `the whole palette is visible in the property panel (${at.top}–${at.bottom} in ${at.boxTop}–${at.boxBottom})`);
  assert.equal(await page.locator('.cv-properties .fe-pop .fe-swatch, .cv-properties .fe-pop [class*="swatch"], .cv-properties .fe-pop .fe-palette-color').first().isVisible(), true, 'colour chips are on screen');
  // 다른 단추로 바꾸면 그 단추 아래로 옮겨 간다
  at = await open('위치');
  assert.ok(at.gap >= 0 && at.gap <= 16 && at.inBar, `the position popup follows its own button (gap ${at.gap}px)`);
  // 닫으면 사라지고, 단추들은 제자리로
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.cv-properties .fe-pop:not([hidden])').count(), 0, 'Escape closes the popup');
  // 팔레트에서 색을 눌러도(막대를 다시 그려도) 그 자리에 그대로
  await open('채우기');
  const before = await place();
  await page.locator('.cv-properties .fe-pop button[title="#e03131"], .cv-properties .fe-pop [aria-label*="빨강"]').first().click();
  await page.waitForTimeout(150);
  const after = await place();
  assert.ok(after && after.inBar && after.gap === before.gap, 'picking a colour keeps the palette under its button');
  await page.keyboard.press('Escape');

  // 글: 글자 색(단추가 넷째 줄쯤에 있다) → 그 줄 바로 아래
  await item(0).click();
  await page.locator('.cv-properties .fe-bar .fe-tb.has-pop[aria-label="글자 색"], .cv-properties .fe-bar .fe-tb.has-pop[title*="글자 색"]').first().click();
  await page.waitForTimeout(150);
  at = await place();
  assert.ok(at && at.inBar && at.gap >= 0 && at.gap <= 16, `the text colour palette opens under its button (gap ${at?.gap}px)`);
  // 다 보이거나, 속성 칸보다 길면 누른 단추가 칸의 맨 위에 온다(팔레트가 단추 바로 아래에서 시작해 화면에 가장 많이 보인다)
  assert.ok(at.top >= at.boxTop && (at.bottom <= at.boxBottom + 1 || at.button <= at.boxTop + 1), `and is scrolled into view (${JSON.stringify(at)})`);
  // 아주 긴 칸(효과)은 누른 단추를 맨 위에 두고 아래로 이어진다
  at = await open('효과');
  assert.ok(at.height > at.boxBottom - at.boxTop, 'the effects popup is taller than the panel');
  assert.ok(at.gap >= 0 && at.gap <= 16 && at.button >= at.boxTop - 1 && at.button < at.boxTop + 80, `its button stays at the top of the panel (button ${at.button}, panel ${at.boxTop})`);
  await page.keyboard.press('Escape');

  // 아무것도 고르지 않았을 때의 바탕색도 같다
  await page.locator('.cv-canvas .fe-stage').click({position: {x: 5, y: 5}});
  at = await open('바탕색');
  assert.ok(at && at.inBar && at.gap >= 0 && at.gap <= 16, `the page background popup opens under its button (gap ${at?.gap}px)`);
  assert.deepEqual(errors, []);
});
