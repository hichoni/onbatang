// 바탕 영상을 누를 때 틀기(브라우저): 발표에서 영상이 첫 모습으로 기다리다가(틀기 표시) 다음을 누르면 틀어지고, 한 번 더 누르면 다음 장으로 간다.
// "장이 열리면 바로"로 정한 영상은 저절로 튼다. 꾸미기에서는 내 자료 → 영상 한 칸에 바탕 영상과 유튜브가 함께 있다. MINICAN_PLAYWRIGHT_PATH 가 없으면 건너뛴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const fixture = (auto) => `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';import {saveVideo} from '/app/videos.js';
setStorageName('v72-standby');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
const blob=await (await fetch('/tests/fixtures/vp8-opus.webm')).blob();
const seed=newRecord('16:9');seed.name='영상 기다리기';
const key=await saveVideo({blob:new Blob([blob],{type:'video/webm'}),design:seed.id,seconds:1});
seed.slides=[{id:'pvideo0001',bg:'#000000',video:{src:key,dur:1${auto ? ',auto:true' : ''}},items:[{id:'etitle0001',t:'text',text:'국민의례',x:50,y:20,w:60,size:6,color:'#ffffff'}]},{id:'pvideo0002',bg:'#ffffff',items:[{id:'enext00001',t:'text',text:'둘째',x:50,y:50,w:50,size:5}]}];
await putDesign(seed);window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'v72-standby'});window.ready=true;
</script>`;

async function setup(t, auto = false) {
  const html = fixture(auto);
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webm': 'video/webm', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required']});
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
const live = (page) => page.evaluate(() => { const v = document.querySelector('.cv-show-stage .fe-scene-live'); return v ? {paused: v.paused, time: v.currentTime} : null; });

test('a background video waits on its first frame in the show and plays on the next press; the press after goes on', options, async t => {
  const {page, errors} = await setup(t);
  // One place for videos: 내 자료 → 영상 holds this slide's background video and YouTube; there is no separate rail tab.
  assert.equal(await page.locator('.fe-tab[data-tab="video"]').count(), 0);
  await page.locator('.fe-tab[data-tab="upload"]').click();
  await page.locator('[data-upload-tab="video"]').click();
  const pane = page.locator('[data-upload-panel="video"]');
  assert.match(await pane.innerText(), /이 장의 바탕 영상[\s\S]*발표할 때[\s\S]*유튜브 영상/);
  assert.equal(await pane.locator('.fe-video-start.on').getAttribute('data-start'), 'click', 'waiting for a press is the default');
  if (process.env.STANDBY_SHOT) await page.screenshot({path: process.env.STANDBY_SHOT + '-panel.png'});
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  await page.locator('.cv-show-stage .fe-scene.fe-standby').waitFor();
  await page.waitForFunction(() => document.querySelector('.cv-show-stage .fe-scene-live')?.readyState >= 1);
  await page.waitForTimeout(700);
  const still = await live(page);
  if (process.env.STANDBY_SHOT) await page.screenshot({path: process.env.STANDBY_SHOT + '-show.png'});
  assert.ok(still.paused && still.time < 0.1, `standing by on the first frame, not playing: ${JSON.stringify(still)}`);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => { const v = document.querySelector('.cv-show-stage .fe-scene-live'); return v && !v.paused && v.currentTime > 0; }, null, {timeout: 10000});
  assert.equal(await page.locator('.cv-show-stage .fe-scene.fe-standby').count(), 0);
  assert.equal(await page.locator('.cv-show-count').textContent(), '1 / 2', 'the press started the video, it did not turn the slide');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '2 / 2');
  await page.keyboard.press('Escape');
  // Switching to "장이 열리면 바로" is saved.
  await page.locator('.fe-video-start[data-start="auto"]').click();
  for (let end = Date.now() + 10000; Date.now() < end; await page.waitForTimeout(200)) if ((await page.evaluate(() => window.readSaved())).slides[0].video.auto === true) break;
  assert.equal((await page.evaluate(() => window.readSaved())).slides[0].video.auto, true);
  assert.deepEqual(errors, []);
});

test('a video set to "장이 열리면 바로" plays by itself', options, async t => {
  const {page, errors} = await setup(t, true);
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  await page.waitForFunction(() => { const v = document.querySelector('.cv-show-stage .fe-scene-live'); return v && v.currentTime > 0; }, null, {timeout: 10000});
  assert.equal(await page.locator('.cv-show-stage .fe-scene.fe-standby').count(), 0);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '2 / 2');
  assert.deepEqual(errors, []);
});
