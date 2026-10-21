// Local-only browser contract for right-click menus: the slide menu around and on the card,
// slide thumbnails, style copy/paste, photo replace and centring. No accounts or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('menu-fixture');
const canvas=document.createElement('canvas');canvas.width=40;canvas.height=20;const c=canvas.getContext('2d');c.fillStyle='#1c7ed6';c.fillRect(0,0,40,20);
const seed=newRecord('16:9');seed.name='우클릭 검수';
seed.slides=[{id:'pmenu00001',bg:'#ffffff',items:[
 {id:'etexta0001',t:'text',text:'빨간 굵은 글',x:25,y:20,w:40,size:5,color:'#e03131',bold:true},
 {id:'etextb0001',t:'text',text:'보통 글',x:75,y:20,w:30,size:4,color:'#1d2433'},
 {id:'ephoto0001',t:'image',url:canvas.toDataURL('image/png'),x:30,y:65,w:30,h:30}]},
 {id:'pmenu00002',bg:'#ffffff',items:[{id:'etextc0001',t:'text',text:'둘째 쪽',x:50,y:50,w:50,size:5}]}];
await putDesign(seed);window.seedId=seed.id;window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'menu-fixture'});window.ready=true;
</script>`;

async function setup(t) {
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
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 800}});
  await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? (external.push(route.request().url()), route.abort()) : route.continue());
  const page = await context.newPage();
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  return {page, external};
}
const menuItems = page => page.locator('.fe-menu .fe-mi-name').allTextContents();
const center = async locator => { const b = await locator.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
async function rightClick(page, x, y) { await page.mouse.click(x, y, {button: 'right'}); await page.locator('.fe-menu').waitFor(); }
const choose = (page, name) => page.locator('.fe-menu .fe-mi').filter({hasText: name}).first().click();

test('the gray area around the card and slide thumbnails open the slide menu instead of the browser menu', options, async t => {
  const {page, external} = await setup(t);
  const canvas = await page.locator('.cv-canvas').boundingBox(), card = await page.locator('.cv-canvas .fe-stage').boundingBox();
  // A point inside the canvas area but left of the card.
  await rightClick(page, (canvas.x + card.x) / 2, card.y + card.height / 2);
  const around = await menuItems(page);
  for (const name of ['붙여넣기', '실행 취소', '바탕색 바꾸기', '틀 고르기', '발표자 노트 적기', '새 장 더하기', '이 장 복제', '이 장부터 발표', '이 장 지우기']) assert.ok(around.includes(name), name);
  await page.keyboard.press('Escape');
  // Every other blank spot of the editor screen gives the same slide menu: side panel, tool bar, top bar.
  for (const selector of ['.cv-side', '.cv-tools', '.cv-bar']) {
    const spot = await page.evaluate(sel => {
      const box = document.querySelector(sel).getBoundingClientRect();
      for (let y = box.bottom - 4; y > box.top; y -= 6) for (let x = box.right - 4; x > box.left; x -= 6) {
        const n = document.elementFromPoint(x, y);
        if (n && n.closest(sel) && !n.closest('button, input, textarea, select, a, [contenteditable], .fe-tb, .fe-layout, .cv-shape')) return [x, y];
      }
      return null;
    }, selector);
    assert.ok(spot, `blank spot in ${selector}`);
    await rightClick(page, spot[0], spot[1]);
    assert.ok((await menuItems(page)).includes('새 장 더하기'), selector);
    await page.keyboard.press('Escape');
  }
  // A host page that leaves bare page background around the editor (가이랩 iframe): the same menu.
  await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 200, clientY: 200})));
  await page.locator('.fe-menu').waitFor({timeout: 5000});
  assert.ok((await menuItems(page)).includes('새 장 더하기'), 'page background');
  await page.keyboard.press('Escape');
  // Text fields keep the browser menu (paste, spelling).
  const name = await page.locator('.cv-name').boundingBox();
  await page.mouse.click(name.x + 5, name.y + name.height / 2, {button: 'right'});
  assert.equal(await page.locator('.fe-menu').count(), 0);
  await page.keyboard.press('Escape');
  await rightClick(page, (canvas.x + card.x) / 2, card.y + card.height / 2);
  await choose(page, '발표자 노트 적기');
  assert.equal(await page.locator('.fe-notes').getAttribute('open'), '');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('fe-notes-input')), true);
  // Empty part of the card shows the same slide items after paste/undo (the notes panel moved the card).
  const moved = await page.locator('.cv-canvas .fe-stage').boundingBox();
  await rightClick(page, moved.x + moved.width - 20, moved.y + moved.height - 20);
  assert.ok((await menuItems(page)).includes('새 장 더하기'));
  await page.keyboard.press('Escape');
  // Thumbnail: selects that slide, then duplicate it from the menu.
  const slides = page.locator('.cv-slide-list .cv-slide:not(.add)');
  assert.equal(await slides.count(), 2);
  const [tx, ty] = await center(slides.nth(1));
  await rightClick(page, tx, ty);
  const strip = await menuItems(page);
  assert.ok(strip.includes('이 장 복제') && strip.includes('뒤로 옮기기') && !strip.includes('바탕색 바꾸기'));
  assert.match(await page.locator('.cv-slide-count').textContent(), /^2 \/ 2/);
  await choose(page, '이 장 복제');
  await page.waitForFunction(() => document.querySelectorAll('.cv-slide-list .cv-slide:not(.add)').length === 3);
  // Delete from the menu removes it at once (the strip button still needs two presses).
  const [dx, dy] = await center(page.locator('.cv-slide-list .cv-slide:not(.add)').nth(2));
  await rightClick(page, dx, dy);
  await choose(page, '이 장 지우기');
  await page.waitForFunction(() => document.querySelectorAll('.cv-slide-list .cv-slide:not(.add)').length === 2);
  assert.deepEqual(external, []);
});

test('element menu: style copy and paste, centre on page, crop entry and photo replace keeping the frame', options, async t => {
  const {page, external} = await setup(t);
  const texts = page.locator('.cv-canvas .fe-card .fi-text');
  const [ax, ay] = await center(texts.nth(0));
  await rightClick(page, ax, ay);
  const textMenu = await menuItems(page);
  assert.ok(textMenu.includes('스타일 복사') && textMenu.includes('페이지 가운데로') && !textMenu.includes('사진 바꾸기'));
  assert.equal(await page.locator('.fe-menu .fe-mi').filter({hasText: '스타일 붙여넣기'}).isDisabled(), true);
  await choose(page, '스타일 복사');
  const [bx, by] = await center(texts.nth(1));
  await rightClick(page, bx, by);
  await choose(page, '스타일 붙여넣기');
  await page.waitForFunction(() => { const n = document.querySelectorAll('.cv-canvas .fe-card .fi-text')[1]; return n && getComputedStyle(n).color === 'rgb(224, 49, 49)'; });
  assert.equal(await texts.nth(1).textContent(), '보통 글');
  // Undo restores the old look in one step.
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => getComputedStyle(document.querySelectorAll('.cv-canvas .fe-card .fi-text')[1]).color !== 'rgb(224, 49, 49)');
  // Centre on page.
  const [cx, cy] = await center(texts.nth(1));
  await rightClick(page, cx, cy);
  await choose(page, '페이지 가운데로');
  const card = await page.locator('.cv-canvas .fe-stage').boundingBox();
  await page.waitForFunction(([x, y]) => { const b = document.querySelectorAll('.cv-canvas .fe-card .fi-text')[1].getBoundingClientRect(); return Math.abs(b.x + b.width / 2 - x) < 2 && Math.abs(b.y + b.height / 2 - y) < 2; }, [card.x + card.width / 2, card.y + card.height / 2]);
  // Photo: menu shows crop / replace / background; replacing keeps the frame and swaps the picture.
  const photo = page.locator('.cv-canvas .fe-card .fi-image').first();
  const srcOf = () => page.evaluate(() => { const n = document.querySelector('.cv-canvas .fe-card .fi-image'); return n.tagName === 'IMG' ? n.getAttribute('src') : n.querySelector('img').getAttribute('src'); });
  const frame = () => page.evaluate(() => { const st = document.querySelector('.cv-canvas .fe-card .fi-image').style; return [st.left, st.top, st.width, st.height, st.transform]; });
  const before = await frame(), oldSrc = await srcOf();
  const [px, py] = await center(photo);
  await rightClick(page, px, py);
  const photoMenu = await menuItems(page);
  for (const name of ['자르기', '사진 바꾸기', '바탕으로 깔기', '스타일 복사']) assert.ok(photoMenu.includes(name), name);
  const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 20; c.height = 40; const x = c.getContext('2d'); x.fillStyle = '#e03131'; x.fillRect(0, 0, 20, 40); return c.toDataURL('image/png').slice(22); }), 'base64');
  const chooser = page.waitForEvent('filechooser');
  await choose(page, '사진 바꾸기');
  await (await chooser).setFiles({name: 'tall.png', mimeType: 'image/png', buffer: png});
  await page.waitForFunction(old => { const n = document.querySelector('.cv-canvas .fe-card .fi-image'); return n && (n.tagName === 'IMG' ? n : n.querySelector('img'))?.getAttribute('src') !== old; }, oldSrc);
  // A tall picture in a wide frame is cropped to fill it, not stretched.
  assert.equal(await page.locator('.cv-canvas .fe-card .fi-image.fi-cropped').count(), 1);
  // The frame keeps its exact place, size and rotation (only the picture inside changed).
  assert.deepEqual(await frame(), before);
  assert.deepEqual(external, []);
});
