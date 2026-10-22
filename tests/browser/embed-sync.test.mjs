// Local-only browser contract for a host that saves drawings itself (가이랩 받은함): startMinican({ embed, sync, syncDelay }).
// The editor opens straight away with the host's button label and no close button, edits go up after the given delay,
// and a newer record from the host wins when the drawing opens.
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
setStorageName('box-fixture');
const local=newRecord('9:16');local.name='내 작품';local.updatedAt=1000;await putDesign(local);
// The host (server) has a newer copy of the same drawing with one word on it.
const server={...structuredClone(local),updatedAt:Date.now(),slides:[{...local.slides[0],items:[{id:'eserver001',t:'text',text:'서버에 있던 글',x:50,y:30,w:60,size:6,color:'#1d2433'}]}]};
// The host puts the newer copy on the device before it opens the drawing (startMinican merges only in the background).
await putDesign(server);
window.pushed=[];window.done=[];
await startMinican({storage:'box-fixture',syncDelay:800,
 sync:{pull:async()=>({records:[server]}),push:async(record)=>{window.pushed.push(structuredClone(record));},drop:async()=>{}},
 embed:{doneLabel:'선생님께 보내기',done:async(id)=>{window.done.push(id);}}});
await openSavedDesign(local.id);window.ready=true;
</script>`;

test('a host that saves drawings: its own button label, no close, edits go up after the delay, the newer host copy opens', options, async t => {
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
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);
  const done = page.locator('[data-embed-done]');
  await done.waitFor();
  assert.match(await done.textContent(), /선생님께 보내기/);
  assert.equal(await page.locator('[data-embed-close]').count(), 0, 'no close button when the host gives none');
  assert.equal(await page.locator('[data-share-action]').count(), 0, 'no share button unless the host gives one');
  assert.equal(await page.locator('.cv-canvas .fe-card .fi-text').textContent(), '서버에 있던 글', 'the newer host copy opened');
  // An edit goes up once, after the delay (not at once).
  if (!await page.locator('.fe-textadd.title').isVisible()) await page.locator('.fe-tab[data-tab="text"]').click();
  await page.locator('.fe-textadd.title').click();
  const before = await page.evaluate(() => window.pushed.length);
  await page.waitForFunction((n) => window.pushed.length > n, before, {timeout: 8000});
  const last = await page.evaluate(() => window.pushed.at(-1));
  assert.equal(last.slides[0].items.filter(it => it.t === 'text').length, 2);
  await done.click();
  await page.waitForFunction(() => window.done.length === 1);
  assert.match(await done.textContent(), /선생님께 보내기/, 'the label comes back after sending');
});
