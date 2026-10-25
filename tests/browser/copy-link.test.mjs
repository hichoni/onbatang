// 복사 링크: 내보내기의 "링크 공유"(호스트 copyAction · GBE-AI Lab 회원만)와 공용 온바탕이 ?copy=코드 를 열어 사본을 받는 길(copyLink).
// 서버(GBE-AI Lab의 onbatang_copy_info · onbatang_copy_part · 영상 자리)는 이 시험의 작은 서버가 흉내 낸다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 180000};
const CODE = 'abcdef123456', SHA = 'a'.repeat(32);
const seen = "try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}";
const host = (withAction) => `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName} from '/app/store.js';
${seen}
setStorageName('copy-host');
const record=newRecord('16:9');record.name='알림장';record.slides=[record.slides[0],{...record.slides[0],id:'p2copy01'}];await putDesign(record);
window.opened=[];
await startMinican({storage:'copy-host',${withAction ? "copyAction:{open:async(context)=>{const records=await context.records();window.opened.push({designId:context.designId,title:context.title,ids:records.map(r=>r.id),slides:records.map(r=>r.slides.length)});}}" : ''}});
await openSavedDesign(record.id);window.designId=record.id;window.ready=true;
</script>`;
const taker = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';
${seen}
await startMinican({storage:'copy-taker',copyLink:{url:location.origin+'/sb',key:'test-key'},resume:true});window.ready=true;
</script>`;
const slide = (id, text, more = {}) => ({id, bg: '#ffffff', items: [{id: 'e' + id.slice(1), t: 'text', x: 10, y: 10, w: 60, h: 10, text}], ...more});
const sha = 'b'.repeat(64), asset = 'a' + sha.slice(0, 24);
const src = {kind: 'pptx', sourceDocumentId: 's' + sha.slice(0, 24), assetId: asset, filename: '발명.pptx', sha256: sha};
const pptx = (id, name, slides) => ({id, schemaVersion: 1, revision: 0, name, size: {width: 1280, height: 720, unit: 'px'}, source: src, assetRefs: [asset],
  assets: [{id: asset, kind: 'source', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sha256: sha}], slides, updatedAt: 5});
const parts = [
  pptx('d1111111aa', '발명 수업 · 1', [slide('p1copy01', '첫 쪽', {video: {src: SHA + '-d1111111aa', dur: 3}}), slide('p2copy01', '둘째 쪽')]),
  pptx('d1111111bb', '발명 수업 · 2', [slide('p3copy01', '셋째 쪽')]),
];

async function serve(t) {
  const calls = [];
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/host.html' || path === '/plain.html') { res.setHeader('Content-Type', 'text/html'); return res.end(host(path === '/host.html')); }
      if (path === '/app/index.html') { res.setHeader('Content-Type', 'text/html'); return res.end(taker); }
      if (path.startsWith('/sb/')) {
        let body = ''; for await (const chunk of req) body += chunk;
        calls.push([path, req.headers.apikey, body && JSON.parse(body)]);
        if (path === '/sb/rest/v1/rpc/onbatang_copy_info') { const args = JSON.parse(body); if (args.p_code !== CODE) { res.writeHead(400, {'Content-Type': 'application/json'}); return res.end(JSON.stringify({message: 'onbatang_copy_not_found'})); } res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({title: '발명 수업', parts: 2, version: 3, slides: 3})); }
        if (path === '/sb/rest/v1/rpc/onbatang_copy_part') { const args = JSON.parse(body); res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(parts[args.p_n])); }
        if (path === `/sb/storage/v1/object/onbatang-copy-videos/${CODE}/${SHA}`) { res.setHeader('Content-Type', 'video/mp4'); return res.end(Buffer.from('fake video bytes')); }
        res.writeHead(404); return res.end();
      }
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
  return {base: `http://127.0.0.1:${server.address().port}`, browser, calls};
}

test('export dialog: 링크 공유 opens the host with every saved part; without a host it says members only', options, async t => {
  const {base, browser} = await serve(t);
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/host.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-down-btn').click();
  await page.locator('.cv-down-format[data-type=link]').click();
  const save = page.locator('[data-download-save]');
  assert.match(await save.textContent(), /링크 만들기/);
  assert.equal(await save.isDisabled(), false);
  assert.match(await page.locator('.cv-down-body').innerText(), /로그인 없이 바로 고칠 수 있어요/);
  await save.click();
  await page.waitForFunction(() => window.opened.length === 1);
  const opened = await page.evaluate(() => window.opened[0]);
  assert.deepEqual([opened.designId, opened.title, opened.ids, opened.slides], [await page.evaluate(() => window.designId), '알림장', [await page.evaluate(() => window.designId)], [2]]);
  assert.equal(await page.locator('.download-panel').count(), 0, 'the export dialog closes for the host dialog');

  const plain = await browser.newPage({viewport: {width: 1280, height: 800}});
  await plain.goto(base + '/plain.html');
  await plain.waitForFunction(() => window.ready);
  await plain.locator('.cv-down-btn').click();
  await plain.locator('.cv-down-format[data-type=link]').click();
  assert.equal(await plain.locator('[data-download-save]').isDisabled(), true);
  assert.match(await plain.locator('[data-copy-members]').innerText(), /GBE-AI Lab 회원만/);
  assert.deepEqual(errors, []);
});

test('public 온바탕: ?copy= takes every part into this browser as a new copy, opens it editable, and opening again reuses it', options, async t => {
  const {base, browser, calls} = await serve(t);
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/app/index.html?copy=${CODE.toUpperCase()}`);
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-slide-list [data-material-page]').nth(2).waitFor({timeout: 30000});
  assert.equal(await page.locator('.cv-slide-list [data-material-page]').count(), 3, 'both parts join into one deck');
  assert.doesNotMatch(page.url(), /copy=/, 'the code leaves the address');
  assert.deepEqual(calls.filter(c => c[0].includes('/rpc/')).map(c => [c[0].split('/').pop(), c[1], c[2].p_n ?? null, c[2].p_version ?? null]),
    [['onbatang_copy_info', 'test-key', null, null], ['onbatang_copy_part', 'test-key', 0, 3], ['onbatang_copy_part', 'test-key', 1, 3]]);
  const stored = await page.evaluate(async () => { const {listDesigns} = await import('/app/store.js'); return (await listDesigns()).map(r => ({id: r.id, name: r.name, source: r.source?.sourceDocumentId, video: r.slides[0].video?.src || null})); });
  assert.equal(stored.length, 2);
  for (const r of stored) { assert.ok(!['d1111111aa', 'd1111111bb'].includes(r.id), 'new ids: a copy, not the sender\'s drawing'); assert.notEqual(r.source, src.sourceDocumentId); }
  assert.equal(stored[0].source, stored[1].source, 'the parts still belong together');
  const first = stored.find(r => r.name === '발명 수업 · 1');
  assert.match(first.video, /^v[a-z0-9]+$/, 'the background video is saved on this device under a local key');
  // Edit the copy, then open the same link again: no second download, the edited copy opens.
  await page.goto(`${base}/app/index.html?copy=${CODE}`);
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-slide-list [data-material-page]').nth(2).waitFor({timeout: 30000});
  assert.equal(calls.filter(c => c[0].endsWith('onbatang_copy_info')).length, 1, 'the second visit reuses the copy');
  assert.equal(await page.evaluate(async () => { const {listDesigns} = await import('/app/store.js'); return (await listDesigns()).length; }), 2);
  // A switched-off link says so and leaves the home screen usable.
  await page.goto(`${base}/app/index.html?copy=000000000000`);
  await page.waitForFunction(() => window.ready);
  await page.getByText('열 수 없는 링크예요').waitFor();
  assert.deepEqual(errors, []);
});
