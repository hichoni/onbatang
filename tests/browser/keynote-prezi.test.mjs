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
  await context.addInitScript(() => { try { localStorage.setItem('onbatang-tour-seen-v1:editor', '1'); localStorage.setItem('onbatang-tour-seen-v1:news-0.44', '1'); } catch {} });
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
  // Real values, not a stretched picture: size is animated as width/height and the transform never scales.
  const props = await page.evaluate(() => { const n = [...document.querySelectorAll('.cv-show-stage > .fe-card')].at(-1).querySelector('.fi-shape'); const frames = n.getAnimations().flatMap(a => a.effect.getKeyframes()); return {keys: [...new Set(frames.flatMap(Object.keys))].sort(), transforms: frames.map(f => f.transform).filter(Boolean), will: n.style.willChange}; });
  assert.ok(props.keys.includes('width') && props.keys.includes('height') && props.keys.includes('transform'), props.keys.join());
  assert.ok(props.transforms.every(t => /scale\(1, 1\)$/.test(t)), props.transforms.join(' | '));
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

test('exported video: 이어 움직이기 glides the duplicated element across the transition frames', options, async t => {
  const {page, external} = await setup(t, {motion: 'reduce'});
  const spots = await page.evaluate(async () => {
    const {createFilm} = await import('/src/video.js');
    const {cleanDesign, configure} = await import('/src/model.js');
    configure({aspect: 16 / 9});
    const saved = await window.readSaved();
    const film = createFilm(saved.slides.slice(0, 2), {width: 640, height: 360});
    await film.ready(0); await film.ready(1);
    const ms = film.plan.slides[1].turn.ms, ctx = film.canvas.getContext('2d');
    // Blue circle: slide 1 at (20%, 30%) size 10%, slide 2 at (80%, 70%) size 20%. Find the blue pixels' centre.
    const blue = () => {
      const {data} = ctx.getImageData(0, 0, 640, 360); let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < 360; y += 2) for (let x = 0; x < 640; x += 2) { const q = (y * 640 + x) * 4; if (data[q + 2] > 150 && data[q] < 110 && data[q + 1] < 120) { sx += x; sy += y; n++; } }
      return n ? [Math.round(sx / n), Math.round(sy / n), n] : null;
    };
    const at = local => { film.draw(1, local); return blue(); };
    const out = {pairs: film.plan.slides[1].turn.pairs, start: at(0), mid: at(ms / 2), end: at(ms - 1), after: at(ms + 50)};
    film.close();
    return out;
  });
  assert.deepEqual(spots.pairs, [[0, 0], [1, 1]]);
  assert.ok(Math.abs(spots.start[0] - 128) < 8 && Math.abs(spots.start[1] - 108) < 8, `start ${spots.start}`);
  assert.ok(spots.mid[0] > 250 && spots.mid[0] < 390 && spots.mid[1] > 150 && spots.mid[1] < 230, `mid ${spots.mid}`);
  assert.ok(spots.mid[2] > spots.start[2] * 1.5 && spots.mid[2] < spots.end[2], `grows ${spots.start[2]} ${spots.mid[2]} ${spots.end[2]}`);
  assert.ok(Math.abs(spots.end[0] - 512) < 10 && Math.abs(spots.end[1] - 252) < 10, `end ${spots.end}`);
  assert.ok(Math.abs(spots.after[0] - 512) < 6 && Math.abs(spots.after[1] - 252) < 6, `after ${spots.after}`);
  assert.deepEqual(external, []);
});

test('이어 움직이기 carries every look smoothly: rounded corners, border and fill change gradually, live and in video', options, async t => {
  const {page, external} = await setup(t);
  // Replace the deck with a rounded box that changes corner, border and colour on the duplicated slide.
  await page.evaluate(async () => {
    const {copySlide} = await import('/app/designs.js');
    const first = {id: 'pround0001', bg: '#ffffff', items: [{id: 'eround0001', t: 'shape', shape: 'round', x: 25, y: 35, w: 20, h: 26, color: '#3d4bc0', r: 10}]};
    const [two] = copySlide([first], 0); const next = two[1]; next.tr = 'move';
    next.items[0] = {...next.items[0], x: 70, y: 60, w: 30, h: 36, r: 100, color: '#e03131', line: 1.5, lc: '#ffc93c'};
    window.roundDeck = [first, next];
  });
  const look = await page.evaluate(async () => {
    const {createFilm} = await import('/src/video.js');
    const {configure, cleanDesign} = await import('/src/model.js');
    const {playTransition} = await import('/src/motion.js');
    const {designView} = await import('/src/render.js');
    configure({aspect: 16 / 9});
    // Live: two cards stacked like the show, sample the new piece halfway.
    const stage = document.createElement('div'); Object.assign(stage.style, {position: 'fixed', left: '0', top: '0', width: '800px', display: 'grid'}); document.body.append(stage);
    const [a, b] = window.roundDeck.map(d => cleanDesign(d, {keepSpaces: true}));
    const oldCard = designView(a), newCard = designView(b);
    for (const c of [oldCard, newCard]) { c.style.gridArea = '1 / 1'; c.style.setProperty('--fe-ratio', String(16 / 9)); stage.append(c); }
    const node = newCard.querySelector('.fi-shape'), end = getComputedStyle(node);
    const final = {radius: parseFloat(end.borderTopLeftRadius), border: parseFloat(end.borderTopWidth), fill: end.backgroundColor};
    const turn = playTransition(oldCard, newCard, 'move', 1, {from: a, to: b});
    for (const anim of node.getAnimations()) { anim.pause(); anim.currentTime = 500; }
    const mid = getComputedStyle(node);
    const live = {radius: parseFloat(mid.borderTopLeftRadius), border: parseFloat(mid.borderTopWidth), fill: mid.backgroundColor, final};
    turn.finish(); stage.remove();
    // Video: the halfway frame's centre colour sits between blue and red.
    const film = createFilm(window.roundDeck, {width: 640, height: 360});
    await film.ready(0); await film.ready(1);
    const ms = film.plan.slides[1].turn.ms, ctx = film.canvas.getContext('2d');
    film.draw(1, ms / 2);
    const {data} = ctx.getImageData(0, 0, 640, 360); let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) { const q = (y * 640 + x) * 4; if (data[q] + data[q + 1] + data[q + 2] < 600) { sx += x; sy += y; n++; } }
    const [cx, cy] = [Math.round(sx / n), Math.round(sy / n)], centre = [...ctx.getImageData(cx, cy, 1, 1).data].slice(0, 3);
    const steps = film.plan.slides[1].turn.pairs.length;
    film.close();
    return {live, centre, steps};
  });
  const {live} = look, start = 10;
  assert.ok(live.radius > 0 && live.radius < live.final.radius * .95, `corner halfway ${live.radius} of ${live.final.radius}`);
  assert.ok(live.border > 0.2 && live.border < live.final.border, `border halfway ${live.border} of ${live.final.border}`);
  const [r, g, b] = live.fill.match(/\d+/g).map(Number);
  assert.ok(r > 61 + 20 && r < 224 - 20 && b > 49 + 20 && b < 192 - 20, `fill halfway ${live.fill}`);
  const [vr, , vb] = look.centre;
  assert.ok(vr > 90 && vr < 200 && vb > 60 && vb < 170, `video fill halfway ${look.centre}`);
  assert.equal(look.steps, 1);
  assert.ok(start < live.final.radius);
  assert.deepEqual(external, []);
});
