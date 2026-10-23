import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 60000};
async function setup(t, {width = 1440, documentImport = true, library = true} = {}) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/upload-tabs.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="fixture" style="max-width:1050px;margin:16px auto;padding:12px"></main></body></html>');
      }
      const file = resolve(root, '.' + decodeURIComponent(pathname)); if (!file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'})[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done)); t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true}); t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width, height: 1000}, reducedMotion: 'reduce'}), errors = [], external = [];
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    // The fixture tests a YouTube element's local insertion, never a live video.
    if (url.hostname === 'i.ytimg.com') return route.fulfill({status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')});
    if (url.origin === origin || ['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue();
    external.push(url.origin); return route.abort();
  });
  page.on('pageerror', error => errors.push(error.message)); await page.goto(origin + '/upload-tabs.html');
  await page.evaluate(async ({documentImport, library}) => {
    const {createEditor} = await import('/src/editor.js'), {configure} = await import('/src/model.js');
    configure({maxUploads: library ? 20 : 0}); window.notices = []; window.importCalls = 0; window.holdImport = false; window.holdUpload = false;
    window.makeEditor = () => {
      window.editor?.destroy();
      window.editor = createEditor({design: {items: []}, notify: text => window.notices.push(text),
        uploadImage: async made => {
          if (window.holdUpload) await new Promise(done => window.finishUpload = done);
          const url = await new Promise((done, fail) => { const reader = new FileReader(); reader.onload = () => done(reader.result); reader.onerror = fail; reader.readAsDataURL(made.blob); }); return {url};
        },
        documentImport: documentImport ? {label: '내 PPT 올리기', open: async () => { window.importCalls++; if (window.holdImport) await new Promise(done => window.finishImport = done); }} : null});
      window.editor.mount(document.querySelector('#fixture')); window.editor.openTab('upload');
    }; window.makeEditor();
  }, {documentImport, library});
  return {page, errors, external};
}
const selected = (page, name) => page.locator(`[data-upload-tab="${name}"]`);
const activePanel = page => page.locator('[data-upload-panel]:visible');
async function assertSelected(page, name, focused = false) {
  assert.equal(await page.locator('[data-upload-tab][aria-selected="true"]').count(), 1);
  assert.equal(await page.locator('[data-upload-tab][tabindex="0"]').count(), 1);
  assert.equal(await selected(page, name).getAttribute('aria-selected'), 'true');
  assert.equal(await activePanel(page).getAttribute('data-upload-panel'), name);
  if (focused) assert.equal(await selected(page, name).evaluate(node => document.activeElement === node), true);
}

test('material tabs default to photos, expose real ARIA panels, retain selection/focus through redraw and reset for a new editor', options, async t => {
  const f = await setup(t), {page} = f;
  assert.match(await page.locator('.fe-panel-desc').textContent(), /사진·PPT·영상을 넣어요\./);
  assert.equal(await page.locator('[data-upload-tab]').count(), 3); await assertSelected(page, 'photo');
  assert.equal(await page.locator('[data-document-import]').count(), 0); assert.equal(await page.locator('.fe-yt-input').count(), 0);
  assert.match(await activePanel(page).textContent(), /아직 올린 사진이 없어요/);
  assert.equal(await page.locator('[data-upload-help=photo]').evaluate(node => node.open), false);
  const relationships = await page.locator('[data-upload-tab]').evaluateAll(nodes => nodes.every(node => {
    const target = document.getElementById(node.getAttribute('aria-controls'));
    return target?.getAttribute('role') === 'tabpanel' && target.getAttribute('aria-labelledby') === node.id;
  })); assert.equal(relationships, true);
  await selected(page, 'photo').focus(); await page.keyboard.press('ArrowRight'); await assertSelected(page, 'ppt', true);
  assert.match(await activePanel(page).textContent(), /PPT를 온바탕으로/); assert.match(await activePanel(page).textContent(), /원본 비율로 자동 맞춤/);
  assert.equal(await page.locator('[data-upload-help=ppt]').evaluate(node => node.open), false);
  assert.equal(await page.getByRole('button', {name: '사진 올리기', exact: true}).count(), 0);
  await page.keyboard.press('ArrowRight'); await assertSelected(page, 'video', true);
  await page.keyboard.press('Home'); await assertSelected(page, 'photo', true);
  await page.keyboard.press('End'); await assertSelected(page, 'video', true);
  await page.keyboard.press('ArrowLeft'); await assertSelected(page, 'ppt', true);
  await page.evaluate(() => window.editor.refresh()); await assertSelected(page, 'ppt', true);
  await page.locator('.fe-tab[data-tab=text]').click(); await page.locator('.fe-tab[data-tab=upload]').click(); await assertSelected(page, 'ppt');
  await page.evaluate(() => { window.editor.setDesign({items: []}); window.editor.openTab('upload'); }); await assertSelected(page, 'ppt');
  await page.evaluate(() => window.makeEditor()); await assertSelected(page, 'photo');
  assert.deepEqual(f.errors, []); assert.deepEqual(f.external, []);
});

test('photo upload preserves its input/list through tab switches and asynchronous redraw while YouTube entry and stage paste still work', options, async t => {
  const f = await setup(t), {page} = f;
  const image = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 12; canvas.getContext('2d').fillRect(0, 0, 20, 12); return canvas.toDataURL().split(',')[1]; });
  await page.evaluate(() => { window.holdUpload = true; window.photoInput = document.querySelector('.fe-panel input[type=file]'); });
  await page.locator('.fe-panel input[type=file]').first().setInputFiles({name: 'self-authored.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64')});
  await page.waitForFunction(() => typeof window.finishUpload === 'function');
  await selected(page, 'ppt').click(); assert.equal(await page.locator('[data-document-import]').isDisabled(), true);
  await selected(page, 'video').click(); await page.getByLabel('유튜브 영상 주소', {exact: true}).fill('https://youtu.be/abcdefghijk');
  await page.evaluate(() => { window.typedInput = document.activeElement; window.holdUpload = false; window.finishUpload(); });
  await page.waitForFunction(() => window.editor.getUploads().length === 1);
  await assertSelected(page, 'video'); assert.equal(await page.getByLabel('유튜브 영상 주소', {exact: true}).inputValue(), 'https://youtu.be/abcdefghijk');
  assert.equal(await page.evaluate(() => document.activeElement === window.typedInput), true, 'an asynchronously inserted photo must not steal the newer video-input focus');
  assert.equal(await page.evaluate(() => document.querySelector('.fe-panel input[type=file]') === window.photoInput), true);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.editor.getDesign().items.filter(item => item.t === 'yt').length), 1);
  await page.evaluate(() => { const data = new DataTransfer(); data.setData('text/plain', 'https://youtu.be/123456789ab'); window.editor.stage.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true})); });
  assert.equal(await page.evaluate(() => window.editor.getDesign().items.filter(item => item.t === 'yt').length), 2);
  await selected(page, 'photo').click(); assert.equal(await page.locator('.fe-file-view').count(), 1);
  assert.equal(await page.locator('.fe-files-count').textContent(), '1/20');
  assert.deepEqual(f.errors, []); assert.deepEqual(f.external, []);
});

test('narrow material tabs keep PPT busy guards, show only selected content and support the two-tab embed without PPT import', options, async t => {
  const f = await setup(t, {width: 390}), {page} = f;
  for (const mode of ['photo', 'ppt', 'video']) {
    await selected(page, mode).click(); await assertSelected(page, mode);
    assert.equal(await page.locator('.fe-panel').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
    assert.equal(await page.locator('[data-upload-help]:visible').evaluate(node => node.open), false);
    if (process.env.MINICAN_SCREENSHOT_DIR) { await mkdir(process.env.MINICAN_SCREENSHOT_DIR, {recursive: true}); await page.screenshot({path: resolve(process.env.MINICAN_SCREENSHOT_DIR, `upload-tabs-narrow-${mode}.png`), fullPage: true}); }
  }
  await selected(page, 'ppt').click(); await page.evaluate(() => { window.holdImport = true; });
  await page.locator('[data-document-import]').click(); assert.equal(await page.locator('[data-document-import]').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('[data-upload-tab]:disabled').count(), 3);
  await page.evaluate(() => window.editor.refresh()); assert.equal(await page.locator('[data-document-import]').isDisabled(), true);
  await page.evaluate(() => { window.holdImport = false; window.finishImport(); }); await page.waitForFunction(() => !document.querySelector('[data-document-import]').disabled);
  assert.equal(await page.locator('[data-upload-tab]:disabled').count(), 0); assert.equal(await page.evaluate(() => window.importCalls), 1);
  assert.deepEqual(f.errors, []); assert.deepEqual(f.external, []);
  const plain = await setup(t, {width: 390, documentImport: false, library: false});
  assert.equal(await plain.page.locator('[data-upload-tab]').count(), 2); assert.equal(await selected(plain.page, 'ppt').count(), 0);
  assert.match(await plain.page.locator('.fe-panel-desc').textContent(), /사진·영상을 넣어요\./);
  await selected(plain.page, 'photo').focus(); await plain.page.keyboard.press('ArrowLeft'); await assertSelected(plain.page, 'video', true);
  assert.deepEqual(plain.errors, []); assert.deepEqual(plain.external, []);
});
