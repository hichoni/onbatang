// 첫 화면에 파일 끌어다 놓기: 온바탕 파일(.onbatang) · PPT(.pptx) · PDF 를 내 그림 어디에 놓아도 '파일 가져오기'의 단추와 같은 길로 연다.
// 끌고 들어오면 무엇을 놓을 수 있는지 덮어 알려 주고, 나가면 걷는다. 열 수 없는 파일 · 여러 파일은 알리기만 하고 브라우저가 파일로 넘어가지 않게 막는다.
// 꾸미는 화면에서는 건드리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {setStorageName} from '/app/store.js';import {packOnbatang} from '/app/onbatang-file.js';
import {markTourSeen,NEWS_KEY} from '/app/tour.js';for(const name of ['home','editor',NEWS_KEY])markTourSeen(name);
setStorageName('home-drop');
const record=newRecord('16:9');record.name='끌어다 놓은 자료';
window.onbatangBlob=await packOnbatang({title:record.name,records:[record],app:'test'});
window.pptFiles=[];
await startMinican({storage:'home-drop',importAction:{label:'PPTX 가져오기',homeFile:true,hideHome:true,open:async({file})=>{window.pptFiles.push(file?.name);return {};}}});
// 끌어다 놓기 신호: 바탕 화면에서 파일을 끌어오는 것과 같은 DataTransfer(types 에 'Files')를 실어 보낸다. 돌려주는 값은 막았는지(preventDefault).
window.dragFiles=(type,files,at='.cv-start-list')=>{const dt=new DataTransfer();for(const f of files)dt.items.add(f);
 const ev=new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:dt});(document.querySelector(at)||document.body).dispatchEvent(ev);return ev.defaultPrevented;};
window.ready=true;
</script>`;

test('home screen: dropping an .onbatang file, a PPTX or a PDF anywhere opens it like the import menu; other drops are explained, the editor is left alone', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/drop.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`, errors = [];
  const context = await browser.newContext({viewport: {width: 1280, height: 820}});
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/drop.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('[data-onbatang-file-open]:not([disabled])').waitFor({state: 'attached'});
  const zone = page.locator('.cv-drop-zone');
  const toast = text => page.locator('#toast').filter({hasText: text}).waitFor({state: 'attached'});

  // 끌고 들어오면 안내가 덮고(놓을 수 있는 것 셋), 창 밖으로 나가면 걷힌다. 안쪽 요소를 지나도 깜빡이지 않는다.
  assert.ok(await page.evaluate(() => window.dragFiles('dragenter', [new File(['x'], 'a.txt')])));
  await zone.waitFor();
  assert.equal(await zone.locator('b').textContent(), '여기에 놓으면 열어요');
  assert.equal(await zone.locator('.cv-drop-kinds').textContent(), '온바탕 파일(.onbatang) · PPT(.pptx) · PDF');
  assert.ok(await page.evaluate(() => window.dragFiles('dragover', [new File(['x'], 'a.txt')])), 'the home screen accepts the drag');
  assert.equal(await zone.evaluate(z => getComputedStyle(z).pointerEvents), 'none');
  await page.evaluate(() => { window.dragFiles('dragenter', [new File(['x'], 'a.txt')], '.cv-hero'); window.dragFiles('dragleave', [new File(['x'], 'a.txt')]); });
  assert.equal(await zone.isVisible(), true, 'moving onto an inner element keeps the guide');
  await page.evaluate(() => window.dragFiles('dragleave', [new File(['x'], 'a.txt')], '.cv-hero'));
  await zone.waitFor({state: 'hidden'});

  // 열 수 없는 파일 · 여러 파일: 막고 알려 준다(브라우저가 파일로 넘어가지 않는다).
  assert.ok(await page.evaluate(() => window.dragFiles('drop', [new File(['x'], '메모.txt')])));
  await toast('여기에는 온바탕 파일(.onbatang) · PPT(.pptx) · PDF만 놓을 수 있어요.');
  assert.ok(await page.evaluate(() => window.dragFiles('drop', [new File(['x'], 'a.pdf'), new File(['y'], 'b.pdf')])));
  await toast('파일은 한 번에 하나씩 놓아 주세요.');
  assert.equal(new URL(page.url()).pathname, '/drop.html');

  // PPTX: 첫 화면의 'PPT 가져오기'와 같은 가져오기 화면으로 넘긴다.
  await page.evaluate(() => window.dragFiles('drop', [new File(['pk'], '발명 수업.pptx')]));
  await page.waitForFunction(() => window.pptFiles.length === 1);
  assert.deepEqual(await page.evaluate(() => window.pptFiles), ['발명 수업.pptx']);
  await page.locator('.cv-account-home').getByRole('button', {name: '내 그림으로 돌아가기'}).click();
  await page.locator('[data-onbatang-file-open]:not([disabled])').waitFor({state: 'attached'});

  // PDF: 'PDF 가져오기'처럼 가져올 쪽을 묻는 창이 뜬다.
  const maker = await context.newPage();
  await maker.setContent('<p style="font:40px sans-serif">안내문 한 쪽</p>');
  const pdf = await maker.pdf({format: 'A4'}); await maker.close();
  await page.evaluate(bytes => window.dragFiles('drop', [new File([new Uint8Array(bytes)], '안내문.pdf', {type: 'application/pdf'})]), [...pdf]);
  await page.locator('#cv-pdf-title').waitFor();
  await page.getByText('"안내문.pdf" · 1쪽', {exact: false}).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#cv-pdf-title').waitFor({state: 'detached'});

  // 온바탕 파일: '온바탕 파일 열기'처럼 고친 그대로 열어 꾸미는 화면으로 들어간다.
  await page.evaluate(() => window.dragFiles('drop', [new File([window.onbatangBlob], '끌어다 놓은 자료.onbatang')]));
  await toast("'끌어다 놓은 자료' 1쪽을 고친 그대로 열었어요.");
  await page.waitForFunction(() => document.getElementById('app').dataset.view === 'edit');

  // 꾸미는 화면에서는 끌어다 놓기를 받지 않는다(안내도 뜨지 않는다).
  assert.equal(await page.evaluate(() => window.dragFiles('dragover', [new File(['x'], 'b.onbatang')], 'body')), false);
  assert.equal(await page.evaluate(() => window.dragFiles('dragenter', [new File(['x'], 'b.onbatang')], 'body')), false);
  assert.equal(await zone.isVisible(), false);
  assert.deepEqual(errors, []);
});
