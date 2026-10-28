// 목소리 녹음 발표(브라우저): 발표 화면 "녹음"(V) → 말하며 넘기고 누른다(크롬의 가짜 마이크: 삐 소리) → 끝내면 장마다 저장할지 묻는다 →
// 녹음 파일은 이 기기에, 장에는 구간(voice)이 남는다 → 장 메뉴에 "녹음 듣기 · 지우기" → 영상으로 내려받으면 녹음한 시간만큼 머물고 목소리가 담긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 180000};
const text = (id, value, patch = {}) => ({id, t: 'text', text: value, x: 50, y: 30, w: 50, size: 5, ...patch});
const slides = [
  {id: 'pvoice0001', bg: '#ffffff', items: [text('etitle0001', '첫째 장')]},
  {id: 'pvoice0002', bg: '#fff4d6', items: [text('ebody00001', '둘째 장'), text('eclick0001', '누르면 나와요', {y: 70, an: 'fade', aw: true})]},
];
const fixture = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('voice-fixture');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
const seed=newRecord('16:9');seed.name='녹음 발표 검수';seed.slides=${JSON.stringify(slides)};
await putDesign(seed);window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'voice-fixture'});window.ready=true;
</script>`;

test('voice: record while presenting, save per slide, listen, and the video keeps the recorded timing and voice', options, async (t) => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise((done) => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  // 가짜 마이크(삐 소리) · 허락 창 없이
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']});
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, acceptDownloads: true});
  await context.grantPermissions(['microphone'], {origin});
  await context.route('**/*', (route) => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? route.abort() : route.continue());
  const page = await context.newPage();page.setDefaultTimeout(30000);
  const errors = [];page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(origin + '/fixture.html');await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();await page.locator('.cv-canvas .fe-stage').waitFor();

  // 발표 → 녹음(V) → 첫째 장에서 말하고 → 둘째 장 → 누르기 → 끝내기
  await page.locator('.cv-show-btn').click();await page.locator('.cv-show').waitFor();
  const rec = page.locator('[data-show-voice]');
  assert.equal(await rec.getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('v');
  await page.locator('.cv-voice-rec:not([hidden])').waitFor();
  assert.equal(await rec.getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.cv-voice-rec').innerText(), /녹음 중 · 이 장 0:0\d · 전체/);
  await page.waitForTimeout(1600);
  if (process.env.VOICE_SHOT) await page.screenshot({path: process.env.VOICE_SHOT + '-show.png'});
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(1200);
  await page.keyboard.press('ArrowRight');        // 누를 때 나오는 요소
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});
  const offer = page.locator('[data-voice-offer]');await offer.waitFor();
  assert.match(await offer.locator('h2').innerText(), /^녹음 · 모두 0:0\d$/);
  assert.equal(await offer.locator('li').count(), 2);
  if (process.env.VOICE_SHOT) await page.screenshot({path: process.env.VOICE_SHOT + '-offer.png'});
  await offer.locator('[data-voice-save]').click();
  await offer.waitFor({state: 'detached'});

  // 저장: 두 장이 한 녹음 파일의 이어진 구간을 쓴다. 둘째 장에는 누른 때가 하나.
  let saved;
  for (let end = Date.now() + 15000; Date.now() < end; await page.waitForTimeout(200)) { saved = await page.evaluate(() => window.readSaved()); if (saved.slides.every((s) => s.voice)) break; }
  const [a, b] = saved.slides.map((s) => s.voice);
  assert.ok(a && b, 'both slides keep their voice');
  assert.equal(a.src, b.src, 'one recording, two parts');
  assert.ok(a.ms >= 1400 && a.ms < 4000, 'first slide length ' + a.ms);
  assert.ok(Math.abs(b.at - (a.at + a.ms / 1000)) < 0.2, 'the second part follows the first');
  assert.equal(b.steps?.length, 1);assert.ok(b.steps[0] > 900 && b.steps[0] < b.ms, 'the click time ' + b.steps[0]);
  const file = await page.evaluate((key) => new Promise((done) => { const q = indexedDB.open('voice-fixture-voices'); q.onsuccess = () => { const g = q.result.transaction('voices').objectStore('voices').get(key); g.onsuccess = () => done({size: g.result?.blob?.size || 0, type: g.result?.blob?.type || ''}); }; }), a.src);
  assert.ok(file.size > 1000, 'the recording is kept on this device: ' + JSON.stringify(file));

  // 장 띠 · 장 메뉴
  assert.match(await page.locator('.cv-strip').innerHTML(), /녹음 0:0\d/, 'the strip marks recorded slides');
  await page.locator('.cv-strip .cv-slide[data-slide="0"]').click({button: 'right'});
  await page.getByRole('menuitem', {name: /녹음 듣기 \(0:0\d\)/}).waitFor();
  assert.equal(await page.getByRole('menuitem', {name: '녹음 지우기'}).count(), 1);
  await page.keyboard.press('Escape');

  // 영상: 녹음한 시간대로 · 목소리가 담긴다
  await page.locator('.cv-down-btn').click();await page.locator('.cv-down-ask').waitFor();
  await page.locator('[data-type=video]').click();
  assert.equal(await page.locator('[data-voice-count]').getAttribute('data-voice-count'), '2');
  assert.equal(await page.locator('[data-voice="on"]').getAttribute('aria-pressed'), 'true');
  if (process.env.VOICE_SHOT) { await page.locator('[data-voice-count]').scrollIntoViewIfNeeded(); await page.screenshot({path: process.env.VOICE_SHOT + '-video.png'}); }
  const sizes = page.locator('[data-vsize]');if (await sizes.count()) await sizes.first().click();
  const pending = page.waitForEvent('download', {timeout: 120000});
  await page.locator('[data-download-save]').click();
  const save = page.locator('.cv-film-save, [data-film-save]');
  await Promise.race([pending, save.first().waitFor({timeout: 120000}).then(() => save.first().click())]);
  const video = await readFile(await (await pending).path());
  const heard = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const sound = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes.buffer);
    const data = sound.getChannelData(0);let loud = 0;for (let i = 0; i < data.length; i += 10) if (Math.abs(data[i]) > 0.02) loud++;
    return {seconds: sound.duration, loud: loud / (data.length / 10)};
  }, video.toString('base64'));
  // 녹음 파일 자체의 소리(가짜 마이크는 짧은 삐 소리를 되풀이한다)와 견준다: 영상에도 그만큼 들어 있어야 한다.
  const own = await page.evaluate((key) => new Promise((done) => { const q = indexedDB.open('voice-fixture-voices'); q.onsuccess = () => { const g = q.result.transaction('voices').objectStore('voices').get(key); g.onsuccess = async () => {
    const sound = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(await g.result.blob.arrayBuffer());
    const data = sound.getChannelData(0);let loud = 0;for (let i = 0; i < data.length; i += 10) if (Math.abs(data[i]) > 0.02) loud++;
    done({seconds: sound.duration, loud: loud / (data.length / 10)}); }; }; }), a.src);
  const total = (a.ms + b.ms) / 1000;
  assert.ok(Math.abs(heard.seconds - total) < 0.6, `the video is as long as the recording (${heard.seconds} vs ${total})`);
  assert.ok(own.loud > 0.01, 'the fake microphone was heard: ' + JSON.stringify(own));
  assert.ok(heard.loud > own.loud * 0.6, `the recorded voice is in the video (${heard.loud} vs recording ${own.loud})`);
  assert.deepEqual(errors, []);
});
