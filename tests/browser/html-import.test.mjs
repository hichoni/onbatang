import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';
import {createHtmlLesson} from '../../app/html-lesson.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = `<!doctype html><meta charset="utf-8"><style>body{background:#e6f4ef;font:24px sans-serif}button{font:inherit;padding:20px}</style><h1>HTML 수업</h1><button id="count">눌러요</button><p id="status"></p><script>
count.onclick=()=>count.textContent='완료';
try{parent.document.body.dataset.compromised='yes';status.textContent='unsafe';}catch{document.getElementById('status').textContent='isolated';}
try{localStorage.setItem('html-import-secret','stolen');}catch{}
</script>`;
const fixture = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {listDesigns,putDesign} from '/app/store.js';import {markTourSeen,NEWS_KEY} from '/app/tour.js';
for(const name of ['home','editor',NEWS_KEY])markTourSeen(name);window.listDesigns=listDesigns;window.putDesign=putDesign;
await startMinican({storage:'html-import-test'});window.ready=true;</script>`;
test('choose and drop HTML, reopen, run isolated interactions, export an executable offline HTML', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const p = new URL(req.url, 'http://x').pathname;
      if (p === '/fixture.html') {res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(fixture);}
      const f = resolve(root, '.' + decodeURIComponent(p)); if (!f.startsWith(resolve(root) + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch {res.writeHead(404); res.end();}
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done)); t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true}); t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1280, height: 820}}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`); await page.waitForFunction(() => window.ready);
  await page.locator('[data-home-menu=import] > summary').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-html-open]').click()]);
  await chooser.setFiles({name: '수업.HTML', mimeType: 'text/html', buffer: Buffer.from(html)});
  await page.locator('.cv-canvas .fe-web-host').filter({hasText: '수업.HTML'}).waitFor();
  await page.locator('[data-html-now]').filter({hasText: '수업.HTML'}).waitFor();
  assert.equal(await page.getByRole('tab', {name: 'HTML 자료', exact: true}).getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByRole('textbox', {name: '웹사이트 주소', exact: true}).count(), 0);
  assert.equal(await page.evaluate(() => document.body.dataset.compromised), undefined);
  assert.equal(await page.locator('iframe[srcdoc]').count(), 0, 'no uploaded code runs in the editor');
  await page.locator('.cv-back').click(); await page.reload(); await page.waitForFunction(() => window.ready);
  assert.equal((await page.evaluate(() => window.listDesigns()))[0].slides[0].web.html, html);
  await page.evaluate(async () => {
    const [record] = await window.listDesigns();
    record.slides[0].web.keep = true;
    record.slides.push({id: 'pnext001', items: []});
    await window.putDesign(record);
  });
  await page.reload(); await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click(); await page.locator('.cv-show-btn').click();
  const frame = page.frameLocator('[data-show-web] iframe');
  await frame.locator('#status').filter({hasText: 'isolated'}).waitFor();
  assert.ok(!(await page.locator('[data-show-web] iframe').getAttribute('sandbox')).includes('allow-same-origin'));
  assert.equal(await page.getByRole('switch', {name: 'HTML 조작', exact: true}).getAttribute('aria-checked'), 'true');
  await frame.locator('#count').click();
  assert.equal(await frame.locator('#count').textContent(), '완료');
  // Even after intentionally switching to slide navigation, returning to kept HTML restores direct use.
  await page.getByRole('switch', {name: 'HTML 조작', exact: true}).click();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('1 /'));
  assert.equal(await page.getByRole('switch', {name: 'HTML 조작', exact: true}).getAttribute('aria-checked'), 'true');
  assert.equal(await frame.locator('#count').textContent(), '완료', 'kept HTML retains its state');
  await frame.locator('#count').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('html-import-secret')), null);
  await mkdir(resolve(root, 'work'), {recursive: true});
  await page.screenshot({path: resolve(root, 'work/html-import-presentation.png')});
  await page.reload(); await page.waitForFunction(() => window.ready);
  await page.setViewportSize({width:390, height:844});
  await page.evaluate(source => {
    const dt = new DataTransfer(); dt.items.add(new File([source], '둘째.htm', {type: 'text/html'}));
    document.querySelector('#app').dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:dt}));
  }, html);
  await page.locator('.cv-canvas .fe-web-host').filter({hasText: '둘째.htm'}).waitFor();
  assert.equal((await page.evaluate(() => window.listDesigns())).length, 2);
  await page.locator('.cv-back').click();
  await page.locator('[data-home-menu=import] > summary').click();
  await page.screenshot({path: resolve(root, 'work/html-import-mobile.png'), fullPage:true});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.locator('[data-html-input]').setInputFiles({name:'empty.html',mimeType:'text/html',buffer:Buffer.alloc(0)});
  await page.locator('#toast').filter({hasText:'빈 HTML'}).waitFor();
  assert.equal((await page.evaluate(() => window.listDesigns())).length, 2);
  // Exported lessons retain the uploaded document as executable data, including script escaping.
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
  const exported = await createHtmlLesson({title:'HTML 수업', pages:[{id:'phtml001',image,aspect:16/9,web:{html,filename:'수업.html'}}]}).text();
  const file = resolve(root,'work/html-import-lesson.html'); await writeFile(file, exported);
  await page.context().setOffline(true); await page.goto(pathToFileURL(file).href);
  await page.getByRole('button',{name:'HTML 열기',exact:true}).click();
  const offline = page.frameLocator('.lesson-activity iframe');
  await offline.locator('#status').filter({hasText:'isolated'}).waitFor();
  await offline.locator('#count').click(); assert.equal(await offline.locator('#count').textContent(),'완료');
  assert.deepEqual(errors, []);
});
