// 계정 다시 맞추기: 다른 기기에서 계정에 올린 그림을 새로 고침 없이 받는다.
// 창으로 돌아올 때(보이게 될 때 · 초점)와 꾸미기를 마치고 내 그림으로 돌아올 때만 하고, 서버에 주기적으로 묻지 않는다.
// 마지막으로 맞춘 지 얼마 안 됐으면(resyncGap) 다시 묻지 않고, 받을 것이 없으면 첫 화면을 건드리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';
import {markTourSeen,NEWS_KEY} from '/app/tour.js';for(const n of ['home','editor',NEWS_KEY])markTourSeen(n);
const q=new URLSearchParams(location.search);
// 가짜 계정: 다른 기기가 올린 것처럼 시험이 바깥에서 그림을 넣는다(window.cloudPut). 계정에 물은 횟수를 센다(window.pulls).
const cloud={};window.pulls=0;window.pushed=[];
window.cloudPut=(id,name,at)=>{cloud[id]={id,schemaVersion:1,name,ratio:'16:9',slides:[{id:'p'+id.slice(1,11),bg:'paper',items:[{id:'e'+id.slice(1,11),t:'text',x:50,y:50,w:60,size:6,text:name}]}],updatedAt:at};};
window.cloudPut('d000000000000000000000a1','처음부터 있던 그림',1792900000000);
const sync={pull:async()=>{window.pulls++;return {records:Object.values(cloud),deleted:[]};},push:async r=>{cloud[r.id]=JSON.parse(JSON.stringify(r));window.pushed.push(r.id);},drop:async id=>{delete cloud[id];},load:async r=>r};
await startMinican({storage:'resync-'+q.get('s'),sync,resyncGap:Number(q.get('gap')||0)});
window.names=()=>[...document.querySelectorAll('.cv-item .cv-item-name, .cv-item [class*=name]')].map(n=>n.textContent.trim()).filter(Boolean);
window.ready=true;
</script>`;

async function setup(t, query) {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/device.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
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
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 820}});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/device.html?${query}`);
  await page.waitForFunction(() => window.ready);
  const shown = name => page.waitForFunction(n => document.querySelector('#app').innerText.includes(n), name, {timeout: 8000});
  const back = () => page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
  return {page, errors, shown, back};
}

test('coming back to the window pulls what another device saved, without a reload', options, async t => {
  const {page, errors, shown, back} = await setup(t, 's=a&gap=0');
  await shown('처음부터 있던 그림');
  const first = await page.evaluate(() => window.pulls);
  assert.equal(first, 1, 'the account is asked once when the home screen opens');
  // 다른 기기가 새 그림을 올렸다. 가만히 있으면(주기적으로 묻지 않으므로) 오지 않는다.
  await page.evaluate(() => window.cloudPut('d000000000000000000000b2', '다른 기기에서 만든 그림', 1792900009000));
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => window.pulls), first, 'nothing polls the account while the window just sits there');
  assert.equal(await page.evaluate(() => document.querySelector('#app').innerText.includes('다른 기기에서 만든 그림')), false);
  // 창으로 돌아오면 받는다
  await back();
  await shown('다른 기기에서 만든 그림');
  assert.ok(await page.evaluate(() => window.pulls) > first, 'the return asks the account again');
  // 받을 것이 없을 때는 첫 화면을 다시 그리지 않는다(검색 칸에 치던 글 · 초점이 그대로)
  const mark = await page.evaluate(() => { const n = document.querySelector('.cv-start-list') || document.querySelector('#app > *'); n.dataset.kept = 'yes'; return window.pulls; });
  await back();
  await page.waitForFunction(n => window.pulls > n, mark);
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => (document.querySelector('.cv-start-list') || document.querySelector('#app > *')).dataset.kept), 'yes', 'an empty resync leaves the home screen untouched');
  // 꾸미는 동안에는 받지 않고, 내 그림으로 돌아올 때 받는다
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  await page.evaluate(() => window.cloudPut('d000000000000000000000c3', '꾸미는 사이에 온 그림', 1792900019000));
  const editing = await page.evaluate(() => window.pulls);
  await back();
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.pulls), editing, 'no pull while a drawing is being edited');
  await page.locator('[data-home], .cv-back, button[title*="내 그림"]').first().click();
  await shown('꾸미는 사이에 온 그림');
  assert.deepEqual(errors, []);
});

test('a resync waits for the gap since the last sync', options, async t => {
  const {page, errors, shown, back} = await setup(t, 's=b&gap=60000');
  await shown('처음부터 있던 그림');
  const first = await page.evaluate(() => window.pulls);
  await page.evaluate(() => window.cloudPut('d000000000000000000000d4', '조금 뒤에 온 그림', 1792900009000));
  await back(); await back();
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => window.pulls), first, 'returning again within the gap does not ask the account');
  assert.deepEqual(errors, []);
});
