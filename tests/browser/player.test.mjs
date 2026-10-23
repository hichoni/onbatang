// 발표처럼 트는 재생기(app/player.js · 공유 링크): 조합 효과로 나타나고, 누를 때 나오는 것은 next() 가 먼저 하나씩,
// 다음 장은 전환 효과로 넘어가며, 머무는 동안 계속 움직이기는 그 장에서만 돌고, 앞 장 · go · destroy 가 깔끔하다(브라우저).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const slides = [
  {id: 'pplay00001', bg: '#ffffff', pa: 'motion', items: [
    {id: 'eplay00001', t: 'text', text: '우리 동네', x: 50, y: 25, w: 60, size: 8},
    {id: 'eplay00002', t: 'shape', shape: 'circle', x: 25, y: 70, w: 12, h: 20, color: '#3d4bc0'},
    {id: 'eplay00003', t: 'text', text: '누르면 나와요', x: 50, y: 80, w: 60, size: 5, aw: true}]},
  {id: 'pplay00002', bg: '#fff4e6', tr: 'slide', items: [{id: 'eplay00004', t: 'text', text: '둘째 장', x: 50, y: 50, w: 60, size: 8}]},
  {id: 'pplay00003', bg: '#e7f5ff', items: [{id: 'eplay00005', t: 'text', text: '셋째 장', x: 50, y: 50, w: 60, size: 8}]},
];
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/player.css">
<body style="margin:0;background:#222"><main id="stage" style="--ob-player-height:600px"></main><script type="module">
import {mountPlayer} from '/app/player.js';
window.changes=[];window.player=mountPlayer(document.getElementById('stage'),{slides:${JSON.stringify(slides)},aspect:16/9,onChange:c=>window.changes.push(c)});window.ready=true;
</script>`;

test('player: combo entrance, click reveal before turning, transition, idle loops only on their slide, prev · go · destroy', options, async t => {
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
  const page = await browser.newPage({viewport: {width: 1100, height: 700}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);
  const loops = () => page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming?.().iterations === Infinity && a.playState === 'running').length);
  // 첫 장: 모션그래픽 조합으로 나타나는 중, 도형은 계속 움직이기(저절로), 누를 것 하나가 숨어 있다.
  assert.deepEqual(await page.evaluate(() => window.changes.at(-1)), {at: 0, total: 3, left: 1});
  assert.ok(await page.evaluate(() => document.getAnimations().length > 0), 'something is moving');
  await page.waitForTimeout(1300);
  assert.equal(await loops(), 1, 'the small shape loops on its own');
  // next(): 먼저 누를 것을 보이고(장은 그대로), 그다음 둘째 장으로 전환.
  assert.equal(await page.evaluate(() => window.player.next()), true);
  assert.deepEqual(await page.evaluate(() => window.changes.at(-1)), {at: 0, total: 3, left: 0});
  assert.equal(await page.evaluate(() => window.player.next()), true);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#stage > .fe-card').length), 2, 'both slides are drawn while the transition runs');
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#stage > .fe-card').length), 1);
  assert.match(await page.locator('#stage').innerText(), /둘째 장/);
  assert.equal(await loops(), 0, 'loops stop when their slide is left');
  // go · prev · 마지막에서 더 못 감
  assert.equal(await page.evaluate(() => window.player.go(2)), true);
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.player.next()), false, 'nothing after the last slide');
  assert.equal(await page.evaluate(() => window.player.go(0)), true);
  await page.waitForTimeout(900);
  assert.match(await page.locator('#stage').innerText(), /누르면 나와요/, 'coming back shows the slide settled');
  assert.equal(await loops(), 1, 'and its loops run again');
  assert.equal(await page.evaluate(() => window.player.prev()), false);
  await page.evaluate(() => window.player.destroy());
  assert.equal(await page.evaluate(() => document.querySelectorAll('#stage > *').length), 0);
  assert.equal(await loops(), 0);
  assert.deepEqual(errors, []);
});
