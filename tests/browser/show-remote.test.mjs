// Local-only browser contract for a host phone remote (가이랩 휴대폰 리모컨): startMinican({ showRemote }).
// The presentation bar gets 휴대폰 리모컨; the host gets the state (slide, titles, notes) on every turn and its commands turn slides.
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
setStorageName('remote-fixture');
const record=newRecord('16:9');record.name='리모컨 발표';
record.slides=[{id:'premote001',bg:'#ffffff',notes:'첫 장에서 물어보기',items:[{id:'eremote001',t:'text',text:'우리 동네',x:50,y:30,w:60,size:8}]},
 {id:'premote002',bg:'#ffffff',items:[{id:'eremote002',t:'text',text:'시장 가는 길',x:50,y:30,w:60,size:8}]},
 {id:'premote003',bg:'#ffffff',items:[]}];
await putDesign(record);
window.updates=[];window.opened=0;window.remoteClosed=0;
await startMinican({storage:'remote-fixture',showRemote:{open:async({state,command})=>{window.opened++;window.command=command;window.firstState=state();return {update:(s)=>window.updates.push(s),close:()=>{window.remoteClosed++;}};}}});
await openSavedDesign(record.id);window.ready=true;
</script>`;

test('a host phone remote: a button in the show bar, state on every turn, next/prev/go/black commands, closed with the show', options, async t => {
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
  page.on('console', m => { if (process.env.DEBUG_REMOTE) console.log('console', m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready).catch(e => { console.log('errors', errors); throw e; });
  await page.locator('.cv-show-btn').click();
  const count = page.locator('.cv-show-count');
  await count.waitFor();
  const button = page.locator('[data-show-remote]');
  assert.match(await button.textContent(), /휴대폰 리모컨/);
  await button.click();
  await page.waitForFunction(() => window.opened === 1 && window.updates.length > 0);
  assert.deepEqual(await page.evaluate(() => window.firstState), {at: 0, total: 3, title: '리모컨 발표', page: '우리 동네', next: '시장 가는 길', notes: '첫 장에서 물어보기'});
  await button.click();
  assert.equal(await page.evaluate(() => window.opened), 1, 'a second press does not open another remote');
  await page.evaluate(() => window.command({action: 'next'}));
  assert.equal(await count.textContent(), '2 / 3');
  await page.waitForFunction(() => window.updates.at(-1).at === 1);
  assert.deepEqual(await page.evaluate(() => window.updates.at(-1)), {at: 1, total: 3, title: '리모컨 발표', page: '시장 가는 길', next: '', notes: ''});
  await page.evaluate(() => window.command({action: 'go', at: 2}));
  assert.equal(await count.textContent(), '3 / 3');
  await page.evaluate(() => window.command({action: 'prev'}));
  assert.equal(await count.textContent(), '2 / 3');
  // Black screen: the next press lifts it first (like the keyboard), the one after turns the slide.
  await page.evaluate(() => window.command({action: 'black'}));
  await page.evaluate(() => window.command({action: 'next'}));
  assert.equal(await count.textContent(), '2 / 3');
  await page.evaluate(() => window.command({action: 'next'}));
  assert.equal(await count.textContent(), '3 / 3');
  await page.evaluate(() => { window.command({action: 'nope'}); window.command(null); window.command({action: 'go', at: 'x'}); });
  assert.equal(await count.textContent(), '3 / 3');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.remoteClosed === 1);
  assert.equal(await page.locator('.cv-show').count(), 0);
  assert.deepEqual(errors, []);
});
