// 모션그래픽(브라우저): 사라지기 · 빠르기 · 늦추기를 움직임 칸에서 고르면 저장되고, 움직임 차례에서 조각을 고를 수 있으며,
// 발표에서 누르면 사라지고(앞 장으로 돌아와도 사라진 채), 흐림 · 늘이기 효과가 실제로 화면에 걸리는지.
// MINICAN_PLAYWRIGHT_PATH 가 없으면 건너뛴다(emphasis-auto-gif.test.mjs 와 같다).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const fixture = slides => `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('v71-fixture');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
const seed=newRecord('16:9');seed.name='모션그래픽 검수';seed.slides=${JSON.stringify(slides)};
await putDesign(seed);window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'v71-fixture'});window.ready=true;
</script>`;
const text = (id, value, patch = {}) => ({id, t: 'text', text: value, x: 50, y: 30, w: 50, size: 5, ...patch});
const shape = (id, patch = {}) => ({id, t: 'shape', shape: 'circle', x: 30, y: 65, w: 16, h: 24, color: '#3d4bc0', ...patch});

async function setup(t, slides) {
  const html = fixture(slides);
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
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? route.abort() : route.continue());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  return {page, errors};
}
async function saved(page, check) {
  for (let end = Date.now() + 15000; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (check(await page.evaluate(() => window.readSaved()))) return;
  assert.fail('saved record never matched');
}
const anims = (page, sel) => page.evaluate(s => document.querySelector(s).getAnimations().map(a => [a.playState, a.effect.getTiming().duration, a.effect.getTiming().iterations]), sel);

test('사라지기 · 빠르기 · 늦추기: picked in the panel they are saved, the timeline lists every step and picks its piece', options, async t => {
  const {page, errors} = await setup(t, [
    {id: 'pmogr00001', bg: '#ffffff', pa: 'kinetic', items: [text('etitle0001', '제목', {size: 9}), text('ebody00001', '설명 글', {y: 60}), shape('ecircle001', {aw: true})]},
  ]);
  await page.locator('.fe-tab[data-tab="motion"]').click();
  // The timeline: two pieces come in when the slide opens, one waits for a click.
  const rows = page.locator('.fe-timeline .fe-tl-pick');
  await rows.first().waitFor();
  assert.equal(await rows.count(), 3);
  assert.match(await page.locator('.fe-timeline').textContent(), /쾅 내려앉기[\s\S]*줄 아래서 솟기[\s\S]*누름 1/);
  // Picking a row selects that piece and shows its own motion choices.
  await page.locator('.fe-timeline [data-timeline="1"]').click();
  await page.locator('.fe-head', {hasText: '고른 조각 · 텍스트: 설명 글'}).waitFor();
  await page.locator('.fe-motions[data-group="exit"] .fe-mo[data-motion="away"]').click();
  await saved(page, r => r.slides[0].items[1].ex === 'away');
  await page.locator('.fe-motion-speed [data-speed="slow"]').click();
  await saved(page, r => r.slides[0].items[1].sp === 'slow');
  await page.locator('.fe-motion-delay [data-delay="0.6"]').click();
  await saved(page, r => r.slides[0].items[1].dl === 0.6);
  assert.match(await page.locator('.fe-tabbody').textContent(), /0\.6초 늦게 나와요/);
  // The exit now shows up as its own click step, after the circle (reading order).
  assert.match(await page.locator('.fe-timeline').textContent(), /누름 2[\s\S]*사라지기 · 휙 날아가기/);
  // Previewing an exit on the card brings the piece back afterwards (editing goes on).
  await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(() => document.querySelectorAll('.cv-canvas .fe-card .fi-text')[1].style.visibility), '');
  // "보통" and "늦추지 않기" clear the values.
  await page.locator('.fe-motion-speed [data-speed="normal"]').click();
  await page.locator('.fe-motion-delay [data-delay="0"]').click();
  await saved(page, r => !('sp' in r.slides[0].items[1]) && !('dl' in r.slides[0].items[1]) && r.slides[0].items[1].ex === 'away');
  assert.deepEqual(errors, []);
});

test('in the show a click makes a piece leave and it stays gone, also when coming back; blur and stretch really run', options, async t => {
  const {page, errors} = await setup(t, [
    {id: 'pmogr00002', bg: '#ffffff', items: [text('etitle0002', '제목', {an: 'blur'}), shape('ecircle002', {an: 'stretch', ex: 'fade'})]},
    {id: 'pmogr00003', bg: '#ffffff', items: [text('enext00003', '둘째')]},
  ]);
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  await page.waitForTimeout(120);
  const keyframes = (sel) => page.evaluate((s) => document.querySelector(s).getAnimations().map((a) => a.effect.getKeyframes()), sel);
  const [blur] = await keyframes('.cv-show-stage .fi-text');
  assert.match(blur[0].filter, /^blur\(/);
  const [stretch] = await keyframes('.cv-show-stage .fi-shape');
  assert.match(stretch[0].transform, /scale\(0\.2, 1\.5\)/);
  await page.waitForTimeout(1200);
  const piece = '.cv-show-stage .fi-shape';
  const vis = () => page.evaluate((s) => getComputedStyle(document.querySelector(s)).visibility, piece);
  assert.equal(await vis(), 'visible');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(60);
  assert.equal(await page.locator('.cv-show-count').textContent(), '1 / 2', 'the click was the exit, not the next slide');
  await page.waitForFunction((s) => getComputedStyle(document.querySelector(s)).visibility === 'hidden', piece);
  assert.deepEqual(await page.evaluate((s) => document.querySelector(s).getAnimations().length, piece), 0, 'nothing is left holding it');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '2 / 2');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '1 / 2');
  await page.waitForTimeout(900);
  assert.equal(await vis(), 'hidden', 'coming back shows the slide as it was left');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
});

test('타자 치듯 in the show opens up to where each character really sits, also on a turned element', options, async t => {
  const {page, errors} = await setup(t, [
    {id: 'pmogr00004', bg: '#ffffff', items: [text('etype00001', '한 글자씩 써져요 Hello', {an: 'type', w: 40, size: 6}), text('etype00002', '돌린 글', {an: 'type', y: 75, rot: 30})]},
  ]);
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  await page.waitForTimeout(60);
  const frames = (n) => page.evaluate((k) => document.querySelectorAll('.cv-show-stage .fi-text')[k].getAnimations()[0]?.effect.getKeyframes().map((f) => f.clipPath), n);
  const first = await frames(0);
  assert.equal(first.length, 13, 'twelve characters (spaces ride along) and the end');
  const xs = first.slice(1, -1).map((c) => Number(/,\s*(-?[\d.]+)% (-?[\d.]+)%,\s*(-?[\d.]+)% (-?[\d.]+)%,\s*-25%/.exec(c)?.[3]));
  assert.ok(xs.every(Number.isFinite), String(first[1]));
  // It wraps into two lines: x goes up along a line and starts again on the next line.
  assert.ok(xs.some((x, n) => n && x < xs[n - 1]), 'a second line starts again from the left');
  // The turned element gets the same cuts as if it were straight (the mask turns with it).
  const turned = await frames(1);
  assert.equal(turned.length, 4);
  const straight = await page.evaluate(async () => {
    const {measureType} = await import('/src/motion.js');
    const n = document.querySelectorAll('.cv-show-stage .fi-text')[1];
    return measureType(n);
  });
  assert.equal(straight.length, 3);
  assert.ok(straight.every((s, n) => !n || s.x > straight[n - 1].x));
  assert.ok(straight[2].x <= 101 && straight[0].x > 0);
  assert.match(turned[1], new RegExp(`${straight[0].x}% `));
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
});

test('임팩트: new combo, effects and transitions are picked in the panel, saved, and really play in the show', options, async t => {
  const {page, errors} = await setup(t, [
    {id: 'pmogr00010', bg: '#16324f', items: [text('etitle0010', '임팩트!', {size: 10, color: '#ffffff'}), text('ebody00010', '끼익 미끄러져 서는 글', {y: 60, color: '#ffffff'}), shape('ecircle010', {x: 75})]},
    {id: 'pmogr00011', bg: '#f2c14e', items: [text('enext00011', '둘째 장', {size: 9})]},
  ]);
  await page.locator('.fe-tab[data-tab="motion"]').click();
  await page.locator('.fe-motions[data-group="combo"] .fe-mo[data-motion="impact"]').click();
  await saved(page, r => r.slides[0].pa === 'impact');
  assert.match(await page.locator('.fe-timeline').textContent(), /확 박히기[\s\S]*끼익 멈추기/);
  // 둘째 장에 회오리 전환, 첫 장의 동그라미에 강조 · 사라지기.
  await page.locator('.cv-slide').nth(1).click();
  await page.locator('.fe-motions[data-group="tr"] .fe-mo[data-motion="spin"]').click();
  await saved(page, r => r.slides[1].tr === 'spin');
  // 장 넘김과 조합은 함께 쓴다: 둘 다 고르면 무엇이 어떤 차례로 움직이는지 보여 주고 함께 미리 본다.
  await page.locator('.fe-motions[data-group="combo"] .fe-mo[data-motion="storm"]').click();
  await saved(page, r => r.slides[1].tr === 'spin' && r.slides[1].pa === 'storm');
  assert.match(await page.locator('[data-motion-both]').innerText(), /회오리 로 넘어온 뒤 → 휘몰아치기/);
  await page.locator('.cv-slide').nth(0).click();
  await page.locator('.cv-canvas .fe-card .fi-shape').click();
  await page.locator('.fe-motions[data-group="emph"] .fe-mo[data-motion="boom"]').click();
  await page.locator('.fe-motions[data-group="exit"] .fe-mo[data-motion="blast"]').click();
  await saved(page, r => r.slides[0].items[2].em === 'boom' && r.slides[0].items[2].ex === 'blast');
  // 저장된 그림에 모두 남아 있다(새 값을 정리하며 버리지 않는다).
  const after = await page.evaluate(() => window.readSaved());
  assert.deepEqual([after.slides[0].pa, after.slides[1].tr, after.slides[0].items[2].em, after.slides[0].items[2].ex], ['impact', 'spin', 'boom', 'blast']);
  await page.locator('.cv-show-btn').click(); await page.locator('.cv-show').waitFor();
  await page.waitForTimeout(80);
  const [shock] = await page.evaluate(() => document.querySelector('.cv-show-stage .fi-text').getAnimations().map((a) => a.effect.getKeyframes()));
  assert.match(shock[0].transform, /scale\(3\.2, 3\.2\)/); assert.match(shock[0].filter, /^blur\(/);
  await page.waitForTimeout(1500);
  for (let n = 0; n < 2; n++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(700); }   // 강조 · 사라지기
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const turning = await page.evaluate(() => [...document.querySelectorAll('.cv-show-stage, .cv-show-stage *')].flatMap((n) => n.getAnimations()).map((a) => a.effect.getKeyframes()[0].transform || '').filter((v) => v.includes('rotate(')));
  assert.ok(turning.some((v) => /rotate\(-200deg\)/.test(v)), `the next slide spins in: ${turning}`);
  await page.screenshot({path: resolve(root, 'work/impact-spin.png')});
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '2 / 2');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
});
