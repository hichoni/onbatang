// 발표 화면의 마우스 휠(브라우저): 아래로 굴리면 다음(누를 때 나오는 것도 한 차례), 위로 굴리면 앞.
// 한 번 굴림(잇따르는 신호)은 한 차례만 넘긴다. 마지막 장에서 휠을 더 굴려도 발표는 끝나지 않는다(누르면 끝난다).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const fixture = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName} from '/app/store.js';
setStorageName('show-wheel');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
const r=newRecord('16:9');r.name='휠';r.slides=[1,2,3].map(n=>({items:[{id:'etext0000'+n,t:'text',text:n+'장',x:50,y:40,w:60,size:6},...(n===2?[{id:'ereveal0001',t:'text',text:'누르면 나와요',x:50,y:70,w:60,size:4,aw:true}]:[])]}));
await putDesign(r);await startMinican({storage:'show-wheel'});window.ready=true;
</script>`;

test('mouse wheel moves the show: down = next step, up = back, one spin = one step, no exit at the end', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch(process.env.MINICAN_CHROMIUM ? {executablePath: process.env.MINICAN_CHROMIUM, headless: true} : {channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-list .cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  const at = () => page.locator('.cv-show-count').textContent();
  const shown = () => page.evaluate(() => { const n = [...document.querySelectorAll('.cv-show .fi-text')].find(x => x.textContent === '누르면 나와요'); return !!n && getComputedStyle(n).visibility !== 'hidden'; });
  const spin = async (dy, ticks = 1) => { await page.mouse.move(640, 400); for (let k = 0; k < ticks; k++) { await page.mouse.wheel(0, dy); await page.waitForTimeout(30); } await page.waitForTimeout(450); };
  assert.match(await at(), /^1 \//);
  await spin(100);
  assert.match(await at(), /^2 \//, 'wheel down = next slide');
  assert.equal(await shown(), false);
  await spin(100);
  assert.match(await at(), /^2 \//, 'the click-reveal step comes first');
  assert.equal(await shown(), true);
  await spin(-100);
  assert.match(await at(), /^1 \//, 'wheel up = back');
  // 트랙패드처럼 잘게 잇따르는 신호 한 번은 한 차례만
  await spin(8, 12);
  assert.match(await at(), /^2 \//, 'one spin, one step');
  await spin(100); await spin(100); await spin(100); await spin(100);
  assert.match(await at(), /^3 \//);
  assert.equal(await page.locator('.cv-show').count(), 1, 'spinning past the last slide does not end the show');
  assert.deepEqual(errors, []);
});
