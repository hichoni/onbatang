// Local-only browser contract for a host share button (GBE-AI Lab 공유 링크): startMinican({ shareAction }).
// The button sits in the editor bar, opens the host with a flush and goTo (slide + 내 자료 · 유튜브), and every local save calls saved(record).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName} from '/app/store.js';
try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
setStorageName('share-fixture');
const record=newRecord('16:9');record.name='알림장';record.slides=[record.slides[0],{...record.slides[0],id:'p2share01'}];await putDesign(record);
window.opened=[];window.saved=[];
await startMinican({storage:'share-fixture',shareAction:{label:'링크로 공유',open:async(context)=>{const flushed=await context.flush();window.opened.push({designId:context.designId,slides:flushed.slides.length});window.goTo=context.goTo;},saved:(record)=>window.saved.push(record.id)}});
await openSavedDesign(record.id);window.ready=true;
</script>`;

test('a host share button: in the bar, flushes before opening, goTo opens a slide and the YouTube tab, saves call saved', options, async t => {
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
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);
  const share = page.locator('[data-share-action]');
  await share.waitFor();
  assert.match(await share.textContent(), /링크로 공유/);
  if (!await page.locator('.fe-textadd.title').isVisible()) await page.locator('.fe-tab[data-tab="text"]').click();
  await page.locator('.fe-textadd.title').click();
  await share.click();
  await page.waitForFunction(() => window.opened.length === 1);
  assert.deepEqual(await page.evaluate(() => window.opened[0].slides), 2);
  await page.waitForFunction(() => window.saved.length > 0);
  await page.evaluate(() => window.goTo(1, {upload: 'youtube'}));
  await page.locator('.fe-upload-tab.on[data-upload-tab="video"]').waitFor();
  assert.deepEqual(errors, []);
});

