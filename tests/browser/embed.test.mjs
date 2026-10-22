// Local-only browser contract for 들여쓰기: another origin opens Onbatang with embed.js, gets a PNG and the record back,
// closes without saving (the draft stays on the device) and reopens a record. No accounts or network beyond the two local origins.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 180000};

async function setup(t) {
  let port = 0;
  // The calling app lives on "localhost", Onbatang on "127.0.0.1": two origins, as in real use.
  const host = () => `<!doctype html><meta charset="utf-8"><body><h1>꿈마당</h1><script src="http://127.0.0.1:${port}/app/embed.js"></script><script>
window.go=(o)=>{window.result=undefined;window.failed=undefined;Onbatang.open(o).then(r=>{window.result=r===null?null:{type:r.png.type,size:r.png.size,blob:r.png instanceof Blob,record:r.record};}).catch(e=>{window.failed=String(e.message);});};
</script>`;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/host.html') { res.setHeader('Content-Type', 'text/html'); return res.end(host()); }
      const f = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  port = server.address().port;
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true, args: ['--host-resolver-rules=MAP localhost 127.0.0.1']});
  t.after(() => browser.close());
  const external = [];
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 800}});
  await context.route('**/*', route => { const u = route.request().url(); return /^https?:/.test(u) && !u.startsWith(`http://127.0.0.1:${port}/`) && !u.startsWith(`http://localhost:${port}/`) ? (external.push(u), route.abort()) : route.continue(); });
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/host.html`);
  return {page, external, frame: () => page.frameLocator('iframe[title^="온바탕"]')};
}
const result = (page) => page.waitForFunction(() => window.result !== undefined || window.failed !== undefined).then(() => page.evaluate(() => window.failed ? {failed: window.failed} : window.result));

test('another app opens Onbatang, gets a PNG and the record on 다 했어요, and nothing on 닫기 (the draft stays)', options, async t => {
  const {page, external, frame} = await setup(t);
  await page.evaluate(() => window.go({ratio: '9:16', title: '우리 앱 화면', template: 'band', tools: 'simple', png: {width: 360}}));
  const f = frame();
  const done = f.locator('[data-embed-done]');
  await done.waitFor();
  // A light editor: close and done instead of home, shape, show and download; no motion or background video.
  assert.equal(await f.locator('.cv-back, .cv-down-btn, .cv-show-btn, .cv-shapes').count(), 0);
  assert.equal(await f.locator('.fe-tab[data-tab="motion"], .fe-tab[data-tab="video"]').count(), 0);
  assert.equal(await f.locator('.cv-name').inputValue(), '우리 앱 화면');
  assert.ok(await f.locator('.cv-canvas .fe-card .fi-text').count() >= 2, 'the starting layout');
  await done.click();
  const r = await result(page);
  assert.equal(r.blob, true);
  assert.equal(r.type, 'image/png');
  assert.ok(r.size > 500);
  assert.deepEqual([r.record.ratio, r.record.name], ['9:16', '우리 앱 화면']);
  assert.ok(r.record.slides[0].items.some(it => it.t === 'text'));
  assert.equal(await page.locator('iframe').count(), 0, 'the frame goes away');
  // After 다 했어요 the draft is gone: a fresh drawing opens. Add a word, then 닫기: nothing comes back.
  await page.evaluate(() => window.go({ratio: '1:1', title: '두 번째'}));
  await f.locator('[data-embed-close]').waitFor();
  assert.equal(await f.locator('.cv-name').inputValue(), '두 번째');
  assert.equal(await f.locator('.cv-canvas .fe-card .fi').count(), 0, 'a fresh, empty drawing');
  assert.equal(await f.locator('.fe-tab[data-tab="motion"]').count(), 0, 'simple tools by default');
  await f.locator('.fe-tab[data-tab="text"]').click();
  await f.locator('.fe-textadd.title').click();
  await f.locator('.cv-canvas .fe-card .fi-text').waitFor();
  await f.locator('[data-embed-close]').click();
  assert.equal(await result(page), null);
  // Called again, the draft that was closed comes back.
  await page.evaluate(() => window.go({ratio: '1:1', title: '두 번째', tools: 'full'}));
  await f.locator('[data-embed-done]').waitFor();
  assert.equal(await f.locator('.cv-canvas .fe-card .fi-text').count(), 1, 'the closed draft');
  assert.equal(await f.locator('.fe-tab[data-tab="motion"]').count(), 1, 'full tools');
  await f.locator('[data-embed-done]').click();
  const second = await result(page);
  // A record given back opens as it was, to change it again.
  await page.evaluate((record) => window.go({record}), r.record);
  await f.locator('[data-embed-done]').waitFor();
  assert.equal(await f.locator('.cv-name').inputValue(), '우리 앱 화면');
  assert.equal(await f.locator('.cv-canvas .fe-card .fi-text').count(), r.record.slides[0].items.filter(it => it.t === 'text').length);
  await f.locator('[data-embed-close]').click();
  assert.equal(await result(page), null);
  assert.ok(second.record.slides[0].items.some(it => it.t === 'text'));
  assert.deepEqual(external, []);
});
