// Local-only browser contract for v0.37: 이어 움직이기(Magic Move), topics with the zooming overview,
// and the presenter camera bubble (Chromium's fake camera). No accounts or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep, join} from 'node:path';
import {createHtmlLesson} from '../../app/html-lesson.js';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
// Slide 2 is a duplicate of slide 1 (copySlide keeps origin.elementId) with the circle moved and grown.
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord,copySlide} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('keynote-fixture');
const seed=newRecord('16:9');seed.name='키노트 검수';
const first={id:'pkey000001',bg:'#ffffff',items:[{id:'ecircle001',t:'shape',shape:'circle',x:20,y:30,w:10,h:10,color:'#3d4bc0'},{id:'etitle0001',t:'text',text:'처음 제목',x:60,y:20,w:40,size:5}]};
const [two]=copySlide([first],0);const moved=two[1];moved.tr='move';moved.items[0]={...moved.items[0],x:80,y:70,w:20,h:20};moved.items[1]={...moved.items[1],text:'바뀐 글'};
seed.slides=[first,moved,{id:'pkey000003',bg:'#fff3bf',items:[{id:'ethird0001',t:'text',text:'셋째 장',x:50,y:50,w:50,size:5}]},{id:'pkey000004',bg:'#ffffff',items:[{id:'efourth001',t:'text',text:'넷째 장',x:50,y:50,w:50,size:5}]}];
await putDesign(seed);window.seedId=seed.id;window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'keynote-fixture'});window.ready=true;
</script>`;

async function setup(t, {motion = 'no-preference'} = {}) {
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
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']});
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`, external = [];
  const context = await browser.newContext({reducedMotion: motion, viewport: {width: 1280, height: 800}, permissions: ['camera']});
  await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? (external.push(route.request().url()), route.abort()) : route.continue());
  await context.addInitScript(() => { try { localStorage.setItem('onbatang-tour-seen-v1:editor', '1'); } catch {} });
  const page = await context.newPage();
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  return {page, external};
}
async function saved(page, check) {
  for (let end = Date.now() + 15000; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (check(await page.evaluate(() => window.readSaved()))) return;
  assert.fail('saved record never matched');
}
async function slideMenu(page) {
  const canvas = await page.locator('.cv-canvas').boundingBox(), card = await page.locator('.cv-canvas .fe-stage').boundingBox();
  await page.mouse.click((canvas.x + card.x) / 2, card.y + card.height / 2, {button: 'right'});
  await page.locator('.fe-menu').waitFor();
}
const choose = (page, name) => page.locator('.fe-menu .fe-mi').filter({hasText: name}).first().click();
const tiles = page => page.locator('.cv-slide-list .cv-slide:not(.add)');
const count = page => page.locator('.cv-show-count').textContent();

test('이어 움직이기 moves the duplicated element from its old place to its new one, then the slide settles', options, async t => {
  const {page, external} = await setup(t);
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  // Geometry of the circle on slide 1, relative to the stage.
  const where = () => page.evaluate(() => {
    const cards = [...document.querySelectorAll('.cv-show-stage > .fe-card')], top = cards.at(-1), stage = document.querySelector('.cv-show-stage').getBoundingClientRect();
    const n = top.querySelector('.fi-shape').getBoundingClientRect();
    return {cards: cards.length, morphing: top.classList.contains('fe-morphing'), back: !!top.querySelector('.fe-morph-back'), x: (n.left + n.width / 2 - stage.left) / stage.width, w: n.width / stage.width, moved: top.querySelector('.fi-shape').dataset.moved || ''};
  });
  await page.waitForTimeout(400);
  const start = await where();
  assert.ok(Math.abs(start.x - .2) < .03, `start ${start.x}`);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(380);
  const mid = await where();
  assert.equal(mid.cards, 2);
  assert.equal(mid.morphing, true);
  assert.equal(mid.back, true);
  assert.equal(mid.moved, '1');
  assert.ok(mid.x > .25 && mid.x < .75, `mid ${mid.x}`);
  assert.ok(mid.w > .1 && mid.w < .2, `mid width ${mid.w}`);
  // Smooth: the moving element animates only transform/opacity (no layout properties), on a promoted layer.
  const props = await page.evaluate(() => { const n = [...document.querySelectorAll('.cv-show-stage > .fe-card')].at(-1).querySelector('.fi-shape'); return {keys: [...new Set(n.getAnimations().flatMap(a => a.effect.getKeyframes().flatMap(Object.keys)))].sort(), will: n.style.willChange}; });
  assert.deepEqual(props.keys.filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)), ['opacity', 'transform']);
  assert.equal(props.will, 'transform, opacity');
  await page.waitForFunction(() => document.querySelectorAll('.cv-show-stage > .fe-card').length === 1);
  const end = await where();
  assert.equal(end.morphing, false);
  assert.equal(end.back, false);
  assert.ok(Math.abs(end.x - .8) < .03 && Math.abs(end.w - .2) < .02, `end ${end.x} ${end.w}`);
  assert.equal(await count(page), '2 / 4');
  assert.match(await page.locator('.cv-show').textContent(), /바뀐 글/);
  // Going back plays the same move in reverse and lands on slide 1.
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelectorAll('.cv-show-stage > .fe-card').length === 1 && document.querySelector('.cv-show-count').textContent === '1 / 4');
  assert.ok(Math.abs((await where()).x - .2) < .03);
  await page.keyboard.press('Escape');
  assert.deepEqual(external, []);
});

test('topics: named in the slide menu, tagged on the strip, grouped in the overview where a topic zooms in', options, async t => {
  const {page, external} = await setup(t);
  await tiles(page).nth(2).click();
  await slideMenu(page);
  await choose(page, '여기서 주제 시작');
  await page.locator('input[aria-label="주제 이름"]').fill('  활동 해 보기 ');
  await page.locator('input[aria-label="주제 이름"]').press('Enter');
  await page.waitForFunction(() => document.querySelector('.cv-slide-list .cv-slide[data-slide="2"] .cv-slide-topic')?.textContent === '활동 해 보기');
  await saved(page, r => r.slides[2].topic === '활동 해 보기' && !r.slides[0].topic);
  await slideMenu(page);
  assert.equal(await page.locator('.fe-menu .fe-mi').filter({hasText: '주제 이름 고치기'}).count(), 1);
  await page.keyboard.press('Escape');
  await tiles(page).nth(0).click();
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  await page.keyboard.press('g');
  await page.locator('.ost-panel.open').waitFor();
  assert.deepEqual(await page.locator('.ost-topic-head').allTextContents(), ['처음1–2쪽', '활동 해 보기3–4쪽']);
  assert.equal(await page.locator('.ost-topic').nth(1).locator('.ost-tile').count(), 2);
  // Choosing a topic zooms its first slide up to the stage, then shows it.
  await page.waitForFunction(() => !document.querySelector('.ost-panel.ost-zooming'));
  await page.locator('.ost-topic-head').nth(1).click();
  assert.equal(await page.evaluate(() => !!document.querySelector('.ost-panel.ost-zooming .ost-tile.ost-zoom')), true);
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '3 / 4');
  assert.equal(await page.locator('.ost-panel.open').count(), 0);
  // A tile works the same way.
  await page.keyboard.press('g');
  await page.locator('.ost-panel.open').waitFor();
  await page.locator('.ost-tile').nth(3).click();
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '4 / 4');
  await page.keyboard.press('Escape');
  assert.deepEqual(external, []);
});

test('the camera bubble shows the presenter without a microphone, moves, resizes and stops the camera', options, async t => {
  const {page, external} = await setup(t, {motion: 'reduce'});
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  await page.keyboard.press('c');
  await page.locator('.ost-cam.on').waitFor();
  await page.waitForFunction(() => document.querySelector('.ost-cam video')?.srcObject?.getVideoTracks().length === 1 && document.querySelector('.ost-cam video').videoWidth > 0);
  assert.equal(await page.evaluate(() => document.querySelector('.ost-cam video').srcObject.getAudioTracks().length), 0);
  assert.equal(await page.locator('.cv-show-key[aria-label^="내 얼굴 카메라"]').getAttribute('aria-pressed'), 'true');
  const box = await page.locator('.ost-cam').boundingBox(), stage = await page.locator('.cv-show').boundingBox();
  assert.ok(box.x + box.width > stage.x + stage.width * .8 && box.y + box.height > stage.y + stage.height * .7, 'starts bottom-right');
  // Dragging moves it and does not turn the page.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + 200, stage.y + 200, {steps: 5});
  await page.mouse.up();
  const after = await page.locator('.ost-cam').boundingBox();
  assert.ok(after.x < box.x - 300, `moved ${after.x}`);
  assert.equal(await count(page), '1 / 4');
  await page.locator('.ost-cam').dblclick();
  assert.ok((await page.locator('.ost-cam').boundingBox()).width > after.width * 1.4);
  assert.equal(await count(page), '1 / 4');
  // Black screen covers it as well.
  await page.keyboard.press('b');
  const covered = await page.evaluate(() => { const c = document.querySelector('.ost-cam').getBoundingClientRect(); return document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)?.className; });
  assert.match(covered, /ost-curtain/);
  await page.keyboard.press('b');
  await page.evaluate(() => { window.track = document.querySelector('.ost-cam video').srcObject.getVideoTracks()[0]; });
  await page.keyboard.press('c');
  await page.waitForFunction(() => !document.querySelector('.ost-cam.on') && window.track.readyState === 'ended');
  // Turning it on again and ending the show also stops the camera.
  await page.keyboard.press('c');
  await page.waitForFunction(() => document.querySelector('.ost-cam video')?.srcObject);
  await page.evaluate(() => { window.track = document.querySelector('.ost-cam video').srcObject.getVideoTracks()[0]; });
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});
  assert.equal(await page.evaluate(() => window.track.readyState), 'ended');
  assert.deepEqual(external, []);
});

test('a downloaded HTML lesson groups its overview by topic and offers the camera key', options, async t => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const pages = [{id: 'pslide00001', image: png, aspect: 16 / 9}, {id: 'pslide00002', image: png, aspect: 16 / 9, topic: '탐구'}, {id: 'pslide00003', image: png, aspect: 16 / 9}];
  const file = join(await mkdtemp(join(tmpdir(), 'onbatang-topic-')), 'lesson.html');
  await writeFile(file, await createHtmlLesson({title: '주제 수업', pages}).text());
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 800}}), external = [];
  await context.route('**/*', route => /^https?:/.test(route.request().url()) ? (external.push(route.request().url()), route.abort()) : route.continue());
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.locator('.lesson-present').click();
  await page.locator('.lesson-show').waitFor();
  await page.keyboard.press('g');
  assert.deepEqual(await page.locator('.ost-topic-head').allTextContents(), ['처음1쪽', '탐구2–3쪽']);
  await page.locator('.ost-topic-head').nth(1).click();
  await page.waitForFunction(() => document.querySelector('.lesson-show-count')?.textContent === '2 / 3');
  await page.keyboard.press('?');
  assert.match(await page.locator('.ost-help-list').textContent(), /카메라/);
  assert.equal(await page.locator('.lesson-show-key', {hasText: '카메라'}).count(), 1);
  assert.deepEqual(external, []);
});
