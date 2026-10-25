// 온바탕 파일: 내려받기 창의 "온바탕 파일"로 이 자료(PPT 면 모든 파트) · 바탕 영상 · 쪽 차례를 고친 그대로 받고,
// 다른 온바탕(저장소가 다른 브라우저)의 첫 화면 "온바탕 파일 열기"로 열면 모든 칸이 한 글자도 다르지 않게 돌아온다.
// 같은 자료가 이미 있으면 바꾸기 · 사본으로 따로 열기를 묻는다. 바깥 요청은 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 180000};
const seen = "try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');localStorage.setItem('onbatang-tour-seen-v1:home','1');}catch{}";
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const sha = 'b'.repeat(64), asset = 'a' + sha.slice(0, 24);
const src = {kind: 'pptx', sourceDocumentId: 's' + sha.slice(0, 24), assetId: asset, filename: '발명.pptx', sha256: sha};
const slide = (id, text, more = {}) => ({id, bg: '#0b0d24', notes: `${text} 노트`, live: {id: 'synthwave'}, pa: 'pop', tr: 'morph', items: [
  {id: 'e' + id.slice(1), t: 'text', x: 50, y: 20, w: 60, size: 8, text, color: '#ffffff', lk: 'fire', lkem: true, lkloop: true, an: 'rise', runs: [{s: 0, e: 1, b: true}]},
  {id: 'i' + id.slice(1), t: 'image', x: 30, y: 70, w: 20, h: 20, url: photo, alt: '사진', crop: {x: 0.1, y: 0.1, w: 0.8, h: 0.8}},
], ...more});
const pptx = (id, name, slides) => ({id, schemaVersion: 1, revision: 4, name, size: {width: 1280, height: 720, unit: 'px'}, source: src, assetRefs: [asset], uploads: [photo],
  assets: [{id: asset, kind: 'source', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sha256: sha}], slides, updatedAt: 1792900000000});
const parts = [
  pptx('d1111111aa', '발명 수업 · 1', [slide('p1file01', '첫 쪽', {video: {src: 'vfilekey01', dur: 3, auto: true}}), slide('p2file01', '둘째 쪽', {hidden: true, look: 'gold'})]),
  pptx('d1111111bb', '발명 수업 · 2', [slide('p3file01', '셋째 쪽', {topic: '마무리', dur: 9, items: [{id: 'efont0001', t: 'text', x: 50, y: 50, w: 60, size: 8, text: '셋째 쪽 학교 글꼴', font: 'gai-test'}]})]),
];
const order = ['p3file01', 'p1file01', 'p2file01'];        // 첫 기기에서 보이던 쪽 차례(파트를 넘나든다)
const page = (storage, seed) => `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '/app/app.js';import {putDesign,setStorageName,getDesign} from '/app/store.js';import {placeVideo,loadVideo} from '/app/videos.js';
${seen}
setStorageName('${storage}');window.getDesign=getDesign;window.loadVideo=loadVideo;
${seed ? `for(const r of ${JSON.stringify(parts)})await putDesign(r);
await placeVideo({key:'vfilekey01',blob:await (await fetch('/tests/fixtures/vp8-opus.webm')).blob(),design:'d1111111aa',seconds:3,at:1792800000000});
localStorage.setItem('onbatang-file-decks-v1:${storage}',JSON.stringify([{id:'fseed',title:'발명 수업',documents:['d1111111aa','d1111111bb'],pageOrder:${JSON.stringify(order)},createdAt:1}]));` : ''}
await startMinican({storage:'${storage}'${seed ? ",fonts:[{id:'gai-test',name:'시험 학교 글꼴',desc:'호스트에만 있는 글꼴',url:'/app/fonts/jua.woff2',exportFamily:'Jua',license:'/app/fonts/jua-OFL.txt'}]" : ''}});
${seed ? "await openSavedDesign('d1111111aa');" : ''}window.ready=true;
</script>`;

test('온바탕 파일: every part, page, field, background video and page order goes into one file and opens exactly the same elsewhere', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/a.html' || path === '/b.html') { res.setHeader('Content-Type', 'text/html'); return res.end(path === '/a.html' ? page('file-a', true) : page('file-b', false)); }
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
  const origin = `http://127.0.0.1:${server.address().port}`, errors = [], external = [];
  const context = await browser.newContext({acceptDownloads: true, viewport: {width: 1280, height: 820}});
  await context.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === origin || ['data:', 'blob:', 'about:'].includes(u.protocol)) return route.continue(); external.push(u.origin); return route.abort(); });
  const a = await context.newPage(); a.on('pageerror', e => errors.push(e.message));
  await a.goto(origin + '/a.html');
  await a.waitForFunction(() => window.ready);
  await a.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 3);

  // 내려받기: 온바탕 파일 → 모든 쪽 · 파트 수를 알리고 내려받는다.
  await a.locator('.cv-down-btn').click();
  await a.locator('.cv-down-format[data-type=onbatang]').click();
  const body = await a.locator('.cv-down-body').innerText();
  assert.match(body, /이 자료 전체 3쪽\(파트 2개\)/);
  assert.match(body, /온바탕 파일 열기/);
  const save = a.locator('[data-download-save]');
  assert.match(await save.textContent(), /온바탕 파일 내려받기/);
  const [download] = await Promise.all([a.waitForEvent('download'), save.click()]);
  // 파일 이름은 자료 이름(UTF-8 로캘이 없는 리눅스의 헤드리스 브라우저는 한글 이름을 'download'로 바꾼다)
  assert.match(download.suggestedFilename(), /^(발명 수업\.onbatang|download)$/);
  const file = await download.path();
  const before = await a.evaluate(async () => ({records: await Promise.all(['d1111111aa', 'd1111111bb'].map(id => window.getDesign(id))), video: [...new Uint8Array(await (await window.loadVideo('vfilekey01')).arrayBuffer())]}));
  await a.waitForFunction(() => /온바탕 파일을 내려받았어요/.test(document.getElementById('toast')?.textContent || ''));

  // 다른 온바탕(저장소가 빈 곳)에서 첫 화면 "온바탕 파일 열기"
  const b = await context.newPage(); b.on('pageerror', e => errors.push(e.message));
  await b.goto(origin + '/b.html');
  await b.waitForFunction(() => window.ready);
  const pick = async () => { const [chooser] = await Promise.all([b.waitForEvent('filechooser'), b.locator('[data-onbatang-file-open]').click()]); await chooser.setFiles(file); };
  await pick();
  await b.waitForFunction(() => document.querySelector('input.cv-name')?.value === '발명 수업 · 1');
  await b.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 3);
  const after = await b.evaluate(async () => ({records: await Promise.all(['d1111111aa', 'd1111111bb'].map(id => window.getDesign(id))), video: [...new Uint8Array(await (await window.loadVideo('vfilekey01')).arrayBuffer())]}));
  assert.deepEqual(after.records, before.records, 'every record is identical, field for field');
  assert.deepEqual(after.video, before.video, 'the background video is the same file under the same key');
  assert.match(await b.locator('#toast').textContent(), /3쪽을 고친 그대로 열었어요\(바탕 영상 1개 포함\)/);
  // 쪽 차례도 첫 기기와 같다: 첫 쪽은 둘째 파트의 "셋째 쪽"
  await b.locator('[data-material-page="0"]').click();
  await b.waitForFunction(() => document.querySelector('input.cv-name')?.value === '발명 수업 · 2');
  assert.match(await b.locator('.cv-canvas .fe-stage').innerText(), /셋째 쪽/);
  await b.locator('[data-material-page="1"]').click();
  await b.waitForFunction(() => /첫 쪽/.test(document.querySelector('.cv-canvas .fe-stage')?.innerText || ''));
  // 바탕 영상이 이 기기에서도 보인다(그 장면의 그림이 깔리고, "이 기기에는 영상이 없어요"가 아니다)
  await b.waitForFunction(() => document.querySelector('.cv-canvas .fe-scene:not(.loading) .fe-scene-still'), null, {timeout: 20000});
  assert.equal(await b.locator('.cv-canvas .fe-scene.missing').count(), 0);

  // 쪽 차례 바꾸기도 된다(PPT 원본이 없는 기기여도 이 기기에 적어 두고, 새로 고쳐도 그대로): 고른 "첫 쪽"을 맨 앞으로
  await b.locator('[data-material-page="1"]').focus(); await b.keyboard.press('Alt+ArrowLeft');
  await b.waitForFunction(() => JSON.parse(localStorage.getItem('onbatang-file-decks-v1:file-b') || '[]')[0]?.pageOrder?.join() === 'p1file01,p3file01,p2file01');
  assert.deepEqual(await b.evaluate(() => window.getDesign('d1111111aa')), before.records[0], 'reordering pages never rewrites the records');

  // 이 온바탕에 없던 글꼴(호스트의 글꼴)도 파일에 담겨 와서, 그 글꼴로 보이고 글꼴 목록에도 있다. 새로 고쳐도 그대로다.
  const fontOf = () => b.evaluate(() => { const n = [...document.querySelectorAll('.cv-canvas .fe-stage .fi-text')].find(x => /학교 글꼴/.test(x.textContent)); return n && getComputedStyle(n).fontFamily; });
  await b.locator('[data-material-page="1"]').click();
  await b.waitForFunction(() => /학교 글꼴/.test(document.querySelector('.cv-canvas .fe-stage')?.innerText || ''));
  assert.match(await fontOf(), /mc-gai-test/);
  await b.waitForFunction(() => document.fonts.check('16px "mc-gai-test"'), null, {timeout: 10000});
  // 그 글을 고쳐도 글꼴이 기본 글꼴로 바뀌지 않는다
  await b.locator('.cv-canvas .fe-stage .fi-text', {hasText: '학교 글꼴'}).click();
  await b.keyboard.press('ArrowRight'); await b.waitForTimeout(400);
  await b.evaluate(async () => { const {flushSavedDesign} = await import('/app/app.js'); await flushSavedDesign('d1111111bb'); });
  assert.equal((await b.evaluate(() => window.getDesign('d1111111bb'))).slides[0].items.find(it => it.id === 'efont0001').font, 'gai-test');
  const fontsBefore = await b.evaluate(async () => (await import('/app/file-fonts.js')).listFileFonts().then(l => l.map(f => [f.id, f.name, f.blob.size, /SIL OPEN FONT LICENSE/i.test(f.license)])));
  assert.equal(fontsBefore.length, 1); assert.equal(fontsBefore[0][0], 'gai-test'); assert.equal(fontsBefore[0][1], '시험 학교 글꼴'); assert.ok(fontsBefore[0][2] > 1000); assert.equal(fontsBefore[0][3], true, 'the OFL text travels with the font');
  await b.reload(); await b.waitForFunction(() => window.ready);
  await b.locator('.cv-deck .cv-item-open').click();
  await b.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 3);
  await b.locator('[data-material-page="1"]').click();
  await b.waitForFunction(() => /학교 글꼴/.test(document.querySelector('.cv-canvas .fe-stage')?.innerText || ''));
  assert.match(await fontOf(), /mc-gai-test/, 'the font is still there after a reload');

  // 같은 자료를 한 번 더 열면 묻는다 → 사본으로 따로 열기: 새 이름표, 같은 내용, 첫 화면에 두 묶음
  await b.locator('.cv-back').click();
  await b.locator('.cv-home-title').waitFor();
  assert.equal(await b.locator('.cv-deck').count(), 1, 'the two parts are one PPT on the list');
  await pick();
  await b.locator('[data-file-clash]').waitFor();
  await b.locator('[data-file-choice=copy]').click();
  await b.waitForFunction(() => document.querySelector('input.cv-name')?.value === '발명 수업 · 1');
  await b.locator('.cv-back').click();
  await b.locator('.cv-home-title').waitFor();
  assert.equal(await b.locator('.cv-deck').count(), 2, 'the copy is its own PPT');
  const ids = await b.locator('.cv-item[data-id]').evaluateAll(n => n.map(x => x.dataset.id));
  const fresh = ids.find(id => !['d1111111aa', 'd1111111bb'].includes(id));
  assert.ok(fresh, `a copy with a new id: ${ids}`);
  const copied = await b.evaluate(id => window.getDesign(id), fresh);
  assert.deepEqual(copied.slides[0].items, before.records[0].slides[0].items, 'the copy has the same content');

  // 바꾸기: 이 기기에서 고친 것을 파일에 담긴 모습으로 되돌린다
  await b.evaluate(async () => { const {putDesign} = await import('/app/store.js'); const r = await window.getDesign('d1111111bb'); await putDesign({...r, name: '바뀐 이름 · 2', slides: [{...r.slides[0], items: []}]}); });
  await b.reload(); await b.waitForFunction(() => window.ready);
  await pick();
  await b.locator('[data-file-clash]').waitFor();
  await b.locator('[data-file-choice=replace]').click();
  await b.waitForFunction(() => document.querySelector('input.cv-name')?.value === '발명 수업 · 1');
  assert.deepEqual(await b.evaluate(() => window.getDesign('d1111111bb')), before.records[1], 'restored exactly');

  // 온바탕 파일이 아닌 것은 열지 않고 까닭을 알린다
  await b.locator('.cv-back').click();
  await b.locator('.cv-home-title').waitFor();
  const [chooser] = await Promise.all([b.waitForEvent('filechooser'), b.locator('[data-onbatang-file-open]').click()]);
  await chooser.setFiles({name: '그림.png', mimeType: 'image/png', buffer: Buffer.from('not a zip')});
  await b.waitForFunction(() => /온바탕 파일\(\.onbatang\)이 아니에요/.test(document.getElementById('toast')?.textContent || ''));
  assert.equal(await b.evaluate(() => document.body.classList.contains('cv-editing')), false);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});
