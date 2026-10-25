// 영상 내보내기의 담을 쪽: PPT 면 모든 파트를 이어 담고, 발표에서 숨긴 장은 빼고, 범위(쪽 번호)를 고를 수 있다.
// 읽기 시간 점검: 머무는 시간 안에 글을 다 읽기 어려운 쪽을 알려 주고, 그 쪽만 영상에서 더 머물게 한다(편집 자료는 그대로).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 180000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '/app/app.js';import {migrateRecord} from '/app/designs.js';import {putDesign,setStorageName,getDesign} from '/app/store.js';
try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
setStorageName('video-scope');
const sha='c'.repeat(64),asset='a'+sha.slice(0,24),src={kind:'pptx',sourceDocumentId:'s'+sha.slice(0,24),assetId:asset,filename:'수업.pptx',sha256:sha};
const page=(n,k,text,more={})=>({id:'p'+n+'x'+k+'0000000',bg:'#ffffff',items:[{id:'e'+n+'x'+k+'0000000',t:'text',text,x:50,y:50,w:70,size:4}],...more});
const part=(n,slides)=>migrateRecord({id:'d'+String(n).repeat(24).slice(0,24),schemaVersion:1,revision:0,name:'영상 수업 · '+n,size:{width:1280,height:720,unit:'px'},source:src,assetRefs:[asset],
  assets:[{id:asset,kind:'source',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',sha256:sha}],slides,updatedAt:1});
await putDesign(part(1,[page(1,0,'첫 쪽'),page(1,1,'숨긴 쪽',{hidden:true}),page(1,2,'가'.repeat(60))]));
await putDesign(part(2,[page(2,0,'넷째 쪽'),page(2,1,'다섯째 쪽')]));
window.firstId='d'+'1'.repeat(24);window.getDesign=getDesign;
await startMinican({storage:'video-scope'});await openSavedDesign(window.firstId);window.ready=true;
</script>`;

test('video scope: every PPT part, hidden slides left out, a page range, and the reading-time check that only lengthens the video', options, async t => {
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
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-slide-list [data-material-page]').nth(4).waitFor({timeout: 30000});
  await page.locator('.cv-down-btn').click();
  await page.locator('.cv-down-format[data-type=video]').click();
  const body = page.locator('.cv-down-body');
  const count = () => page.locator('[data-film-count]').getAttribute('data-film-count');
  assert.equal(await count(), '4', 'five pages over two parts, one hidden');
  assert.match(await body.innerText(), /PPT 의 모든 파트를 이어요\. 발표에서 숨긴 장 1개는 빼요\./);
  // Reading time: page 3 (60 characters) needs ~15 s, more than 5 s.
  await page.locator('.cv-down-chips [data-stay="5"]').click();
  assert.equal(await page.locator('[data-read-short]').getAttribute('data-read-short'), '1');
  assert.match(await body.innerText(), /3쪽\(읽는 데 약 15초 · 지금 5초\)/);
  const seconds = async () => Number(/약 (\d+)초/.exec(await page.locator('.cv-down-summary small').innerText())?.[1] || /약 (\d+)분 (\d+)초/.exec(await page.locator('.cv-down-summary small').innerText()).slice(1).reduce((m, s) => m * 60 + Number(s), 0));
  const fitted = await seconds();
  await page.locator('[data-read-fit=off]').click();
  const plain = await seconds();
  assert.ok(fitted >= plain + 9, `fitting lengthens the video: ${fitted} vs ${plain}`);
  await page.locator('[data-read-fit=on]').click();
  // A range in page numbers (as in the slide list): 4~5 → two pages, nothing to fix.
  await page.locator('[data-film-scope=range]').click();
  await page.locator('[data-film-range=from]').fill('4');
  await page.locator('[data-film-range=from]').press('Tab');
  assert.equal(await count(), '2');
  assert.equal(await page.locator('[data-read-short]').getAttribute('data-read-short'), '0');
  assert.match(await page.locator('.cv-down-summary b').innerText(), /4~5쪽 · 2쪽/);
  // Range 2~2 is only the hidden page: nothing to film, the button is off.
  await page.locator('[data-film-range=from]').fill('2'); await page.locator('[data-film-range=from]').press('Tab');
  await page.locator('[data-film-range=to]').fill('2'); await page.locator('[data-film-range=to]').press('Tab');
  assert.equal(await count(), '0');
  assert.equal(await page.locator('[data-download-save]').isDisabled(), true);
  // Film page 3 alone: the video holds it long enough to read (~15 s) and the drawing is not changed.
  await page.locator('[data-film-range=to]').fill('3'); await page.locator('[data-film-range=to]').press('Tab');
  await page.locator('[data-film-range=from]').fill('3'); await page.locator('[data-film-range=from]').press('Tab');
  assert.equal(await count(), '1');
  await page.locator('[data-download-save]').click();
  await page.locator('.cv-film-save').waitFor({timeout: 150000});
  const facts = await page.locator('.cv-film-label').innerText();
  const [, s] = /(\d+)초/.exec(facts) || [];
  assert.ok(Number(s) >= 15 && Number(s) <= 17, facts);
  assert.equal(await page.evaluate(async () => (await window.getDesign(window.firstId)).slides[2].dur), undefined, 'the saved slide keeps no duration');
  assert.deepEqual(errors, []);
});
