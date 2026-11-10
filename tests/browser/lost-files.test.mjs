// 브라우저가 큰 그림을 따로 두는 저장 파일(IndexedDB 의 .blob 폴더)이 지워져도(청소 프로그램 등) 나머지 그림은 그대로 보인다.
// 예전에는 그런 그림이 하나만 있어도 목록 읽기가 통째로 실패해 "이 창에서는 기기에 저장할 수 없어요"가 뜨고 내 그림 · 계정 맞추기 ·
// 온바탕 파일 열기가 모두 막혔다. 이제 읽을 수 없는 그림만 빼고 몇 개인지 알리며, 계정이 있으면 계정의 것으로 다시 받아 덮어쓴다.
// 실제로 브라우저를 닫고 저장 파일을 지운 뒤 다시 연다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, readdir, rm, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep, join} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 180000};
// 세 그림: 작은 것 둘(A · C)과 사진이 커서 브라우저가 따로 파일로 두는 것 하나(B). 계정에 있는 B 도 같은 이름표 · 이름으로 다시 만든다(사진은 새 잡음).
const records = `import {newRecord} from '/app/designs.js';
export function seedRecords(){
 const a=newRecord('16:9',1,1792900000000);a.id='dlostaaaaaaaaaaaaaaaaaaaa';a.name='작은 그림 가';
 const c=newRecord('16:9',3,1792900000300);c.id='dlostcccccccccccccccccccc';c.name='작은 그림 다';
 return [a,c];
}
export function bigRecord(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=640;const g=canvas.getContext('2d'),img=g.createImageData(640,640);
 for(let i=0;i<img.data.length;i+=65536)crypto.getRandomValues(img.data.subarray(i,i+65536));for(let i=3;i<img.data.length;i+=4)img.data[i]=255;g.putImageData(img,0,0);
 const b=newRecord('16:9',2,1792900000200);b.id='dlostbbbbbbbbbbbbbbbbbbbb';b.name='큰 그림 나';
 b.slides[0].items=[{id:'elostimg01',t:'image',x:50,y:50,w:40,h:40,url:canvas.toDataURL('image/png')}];
 return b;
}`;
const head = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">';
const pages = {
  '/records.js': records,
  '/seed.html': `${head}import {putDesign,setStorageName,getDesign} from '/app/store.js';import {seedRecords,bigRecord} from '/records.js';
setStorageName('lost-files');for(const r of [...seedRecords(),bigRecord()])await putDesign(r);
window.bigLength=(await getDesign('dlostbbbbbbbbbbbbbbbbbbbb')).slides[0].items[0].url.length;window.ready=true;</script>`,
  '/device.html': `${head}import {startMinican} from '/app/app.js';import {markTourSeen,NEWS_KEY} from '/app/tour.js';for(const n of ['home','editor',NEWS_KEY])markTourSeen(n);
await startMinican({storage:'lost-files'});window.ready=true;</script>`,
  '/account.html': `${head}import {startMinican} from '/app/app.js';import {markTourSeen,NEWS_KEY} from '/app/tour.js';import {bigRecord} from '/records.js';for(const n of ['home','editor',NEWS_KEY])markTourSeen(n);
window.pushed=[];await startMinican({storage:'lost-files',sync:{pull:async()=>({records:[bigRecord()],deleted:[]}),push:async r=>{window.pushed.push(r.id);},drop:async()=>{}}});window.ready=true;</script>`,
};

test('a drawing whose browser storage file was deleted no longer hides the others; the account copy replaces it', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (pages[path]) { res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html'); return res.end(pages[path]); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const port = server.address().port, origin = `http://127.0.0.1:${port}`;
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const profile = await mkdtemp(join(tmpdir(), 'onbatang-lost-'));
  t.after(() => rm(profile, {recursive: true, force: true}));
  const launch = () => chromium.launchPersistentContext(profile, {channel: process.env.MINICAN_BROWSER || 'msedge', headless: true, viewport: {width: 1280, height: 820}});

  // 1. 세 그림을 저장하고 브라우저를 닫는다. 큰 그림 B 는 브라우저가 따로 파일로 둔다.
  let context = await launch(), page = context.pages()[0] || await context.newPage();
  t.after(() => context.close().catch(() => {}));
  await page.goto(origin + '/seed.html'); await page.waitForFunction(() => window.ready);
  assert.ok(await page.evaluate(() => window.bigLength) > 500000, 'the big drawing is large enough to be kept in a separate file');
  await context.close();
  const blobDir = join(profile, 'Default', 'IndexedDB', `http_127.0.0.1_${port}.indexeddb.blob`);
  const files = (await readdir(blobDir, {recursive: true, withFileTypes: true})).filter(e => e.isFile());
  assert.ok(files.length >= 1, 'the browser kept the big drawing in a separate file');
  // 2. 청소 프로그램이 한 것처럼 그 파일들을 지운다.
  for (const f of files) await rm(join(f.parentPath, f.name));

  // 3. 이 기기만 쓰는 온바탕: 나머지 두 그림은 보이고, 못 읽는 그림 1개를 알린다. 기기에 저장할 수 없다는 글은 없다.
  context = await launch(); page = context.pages()[0] || await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/device.html'); await page.waitForFunction(() => window.ready);
  const notice = page.locator('[data-unreadable]');
  await notice.waitFor();
  assert.equal(await notice.getAttribute('data-unreadable'), '1');
  assert.match(await notice.textContent(), /이 기기에 저장된 그림 1개를 읽을 수 없어요\. .*내려받아 둔 온바탕 파일이 있으면 다시 열어 주세요\./);
  const names = async () => (await page.locator('.cv-home').innerText());
  assert.match(await names(), /작은 그림 가/); assert.match(await names(), /작은 그림 다/);
  assert.doesNotMatch(await names(), /큰 그림 나/);
  assert.doesNotMatch(await names(), /이 창에서는 기기에 저장할 수 없어요/);

  // 4. 계정이 있는 온바탕: 계정 맞추기가 계정의 B 를 받아 덮어쓰므로 세 그림이 다 보이고 알림이 사라진다. 이 기기에만 있던 A · C 는 계정에 올린다.
  await page.goto(origin + '/account.html'); await page.waitForFunction(() => window.ready);
  await page.locator('.cv-home').filter({hasText: '큰 그림 나'}).waitFor();
  await notice.waitFor({state: 'detached'});
  assert.match(await names(), /작은 그림 가/); assert.match(await names(), /작은 그림 다/);
  assert.deepEqual((await page.evaluate(() => window.pushed)).sort(), ['dlostaaaaaaaaaaaaaaaaaaaa', 'dlostcccccccccccccccccccc']);
  // 다시 열어도 B 를 제대로 읽는다(덮어쓴 것이 새 파일로 저장됐다).
  await page.goto(origin + '/device.html'); await page.waitForFunction(() => window.ready);
  await page.locator('.cv-home').filter({hasText: '큰 그림 나'}).waitFor();
  assert.equal(await notice.count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});
