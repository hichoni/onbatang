// Local-only browser contract for v0.36 quick wins: hidden slides, find & replace, editor shortcut table,
// text effects, photo alt text and PDF/print layouts. No accounts or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('quick-fixture');
const canvas=document.createElement('canvas');canvas.width=40;canvas.height=20;const c=canvas.getContext('2d');c.fillStyle='#1c7ed6';c.fillRect(0,0,40,20);
const seed=newRecord('16:9');seed.name='빠른 개선 검수';
seed.slides=[{id:'pquick00001',bg:'#ffffff',notes:'사과 이야기',items:[
 {id:'etexta0001',t:'text',text:'사과 한 개',x:30,y:20,w:40,size:5,color:'#1d2433'},
 {id:'ephoto0001',t:'image',url:canvas.toDataURL('image/png'),x:30,y:65,w:30,h:30}]},
 {id:'pquick00002',bg:'#fff3bf',items:[{id:'etextb0001',t:'text',text:'둘째 장 사과',x:50,y:50,w:50,size:5}]},
 {id:'pquick00003',bg:'#ffffff',items:[{id:'etextc0001',t:'text',text:'셋째 장',x:50,y:50,w:50,size:5}]}];
await putDesign(seed);window.seedId=seed.id;window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'quick-fixture'});window.ready=true;
</script>`;

async function setup(t) {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
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
  const origin = `http://127.0.0.1:${server.address().port}`, external = [];
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 800}});
  await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? (external.push(route.request().url()), route.abort()) : route.continue());
  // The print iframe's print() would open a system dialog: record what it would print instead.
  await context.addInitScript(() => {
    try { localStorage.setItem('onbatang-tour-seen-v1:editor', '1'); localStorage.setItem('onbatang-tour-seen-v1:news-0.45', '1'); } catch {}
    new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.classList?.contains('cv-print-frame')) {
      n.contentWindow.print = () => {
        const doc = n.contentDocument;
        window.printed = {html: doc.documentElement.outerHTML, images: [...doc.images].map(i => [i.naturalWidth, i.naturalHeight, i.src.slice(0, 5)])};
        n.contentWindow.dispatchEvent(new Event('afterprint'));
      };
    } }).observe(document, {childList: true, subtree: true});
  });
  const page = await context.newPage();
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  return {page, external};
}
const center = async locator => { const b = await locator.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
async function slideMenu(page) {
  const canvas = await page.locator('.cv-canvas').boundingBox(), card = await page.locator('.cv-canvas .fe-stage').boundingBox();
  await page.mouse.click((canvas.x + card.x) / 2, card.y + card.height / 2, {button: 'right'});
  await page.locator('.fe-menu').waitFor();
}
const choose = (page, name) => page.locator('.fe-menu .fe-mi').filter({hasText: name}).first().click();
// The saved record is written after a short delay: poll it from here (an async page predicate would resolve at once).
async function saved(page, check) {
  for (let end = Date.now() + 15000; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (check(await page.evaluate(() => window.readSaved()))) return;
  assert.fail('saved record never matched');
}
const tiles = page => page.locator('.cv-slide-list .cv-slide:not(.add)');

test('hidden slides stay in the editor but the show skips them; find & replace and the shortcut table work from the slide menu', options, async t => {
  const {page, external} = await setup(t);
  // ? opens the editor shortcut table.
  await page.locator('.cv-canvas').click({position: {x: 5, y: 5}});
  await page.keyboard.press('?');
  await page.locator('.cv-keys-box').waitFor();
  assert.match(await page.locator('.cv-keys').textContent(), /Ctrl\+Z/);
  await page.waitForFunction(() => document.activeElement?.classList.contains('cv-keys-box'));
  await page.keyboard.press('Escape');
  await page.locator('.cv-keys-box').waitFor({state: 'detached'});
  // Find & replace across slides and notes.
  await slideMenu(page);
  await choose(page, '찾아 바꾸기');
  const box = page.locator('.cv-find-box');
  await box.locator('input[aria-label="찾을 글"]').fill('사과');
  await page.waitForFunction(() => /2장에서 3곳/.test(document.querySelector('.cv-find-box [role=status]').textContent));
  assert.deepEqual(await box.locator('.cv-find-hits button').allTextContents(), ['1장 · 2곳', '2장 · 1곳']);
  await box.locator('input[aria-label="바꿀 글"]').fill('배');
  await box.getByRole('button', {name: '모두 바꾸기'}).click();
  await page.waitForFunction(() => /3곳을 바꿨어요/.test(document.querySelector('.cv-find-box [role=status]').textContent));
  await page.locator('.cv-find-box input[aria-label="바꿀 글"]').press('Escape');
  await page.locator('.cv-find-box').waitFor({state: 'detached'});
  assert.equal(await page.locator('.cv-canvas .fe-card .fi-text').first().textContent(), '배 한 개');
  await saved(page, r => r.slides[1].items[0].text === '둘째 장 배' && r.slides[0].notes === '배 이야기');
  // Hide slide 2 from its own slide menu.
  await tiles(page).nth(1).click();
  await slideMenu(page);
  await choose(page, '발표에서 숨기기');
  await page.waitForFunction(() => document.querySelectorAll('.cv-slide-list .cv-slide.skip').length === 1);
  assert.equal(await tiles(page).nth(1).locator('.cv-slide-skip').textContent(), '숨김');
  await saved(page, r => r.slides[1].hidden === true);
  await slideMenu(page);
  assert.equal(await page.locator('.fe-menu .fe-mi').filter({hasText: '숨기기 풀기'}).count(), 1);
  await page.keyboard.press('Escape');
  // The show counts only shown slides and jumps from 1 to 3.
  await tiles(page).nth(0).click();
  await page.locator('.cv-show-btn').click();
  const count = () => page.locator('.cv-show-count').textContent();
  await page.locator('.cv-show').waitFor();
  assert.equal(await count(), '1 / 2');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent === '2 / 2');
  assert.match(await page.locator('.cv-show').textContent(), /셋째 장/);
  assert.doesNotMatch(await page.locator('.cv-show').textContent(), /둘째 장/);
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});
  assert.equal(await tiles(page).count(), 3);
  assert.deepEqual(external, []);
});

test('text effects and photo alt text render, save and round-trip through editable PPTX', options, async t => {
  const {page, external} = await setup(t);
  const text = page.locator('.cv-canvas .fe-card .fi-text').first();
  await text.click();
  await page.locator('.fe-bar button').filter({hasText: '효과'}).click();
  await page.locator('[data-stroke="white"]').click();
  await page.locator('[data-shadow="on"]').click();
  await page.locator('[data-line-spacing="1.5"]').click();
  await page.waitForFunction(() => { const s = getComputedStyle(document.querySelector('.cv-canvas .fe-card .fi-text')); return /rgba\(0, 0, 0, 0\.5\)/.test(s.textShadow) && /rgb\(255, 255, 255\)/.test(s.textShadow); });
  await saved(page, r => { const it = r.slides[0].items[0]; return it.stroke === '#ffffff' && it.shadow === true && it.lh === 1.5; });
  // Photo alt text: written in the pop, shown to screen readers on the canvas.
  await page.keyboard.press('Escape');
  const [px, py] = await center(page.locator('.cv-canvas .fe-card .fi-image').first());
  await page.mouse.click(px, py);
  await page.locator('.fe-bar button').filter({hasText: '설명'}).click();
  await page.locator('.fe-alt-input').fill('파란 네모 그림');
  await page.locator('.fe-alt-input').press('Enter');
  await page.waitForFunction(() => { const n = document.querySelector('.cv-canvas .fe-card .fi-image'); return (n.tagName === 'IMG' ? n : n.querySelector('img'))?.alt === '파란 네모 그림'; });
  assert.equal(await page.locator('.fe-bar button').filter({hasText: '설명 ✓'}).count(), 1);
  await saved(page, r => r.slides[0].items[1].alt === '파란 네모 그림');
  // Editable PPTX → the app's own importer keeps the alt text and the hidden flag.
  const back = await page.evaluate(async () => {
    const {createPptx, PPTX_MIME} = await import('/app/pptx.js');
    const {convertPptx} = await import('/app/pptx-import/client.js');
    const saved = await window.readSaved();
    const slides = saved.slides.map((s, i) => (i === 2 ? {...s, hidden: true} : s));
    const {bytes} = await createPptx({slides, aspect: 16 / 9});
    const result = await convertPptx(new File([bytes], 'back.pptx', {type: PPTX_MIME}));
    return result.document.slides.map(s => ({hidden: !!s.hidden, alts: s.items.filter(v => v.t === 'image').map(v => v.alt)}));
  });
  assert.deepEqual(back, [{hidden: false, alts: ['파란 네모 그림']}, {hidden: false, alts: []}, {hidden: true, alts: []}]);
  assert.deepEqual(external, []);
});

test('PDF·인쇄 builds the chosen layout from shown slides only and hands it to the print dialog', options, async t => {
  const {page, external} = await setup(t);
  await tiles(page).nth(1).click();
  await slideMenu(page);
  await choose(page, '발표에서 숨기기');
  await page.waitForFunction(() => document.querySelectorAll('.cv-slide-list .cv-slide.skip').length === 1);
  const print = async layout => {
    await page.evaluate(() => { window.printed = null; });
    await page.locator('.cv-down-btn').click();
    await page.locator('.cv-down-format[data-type="pdf"]').click();
    await page.locator(`[data-print-layout="${layout}"]`).click();
    assert.equal(await page.locator('[data-download-save]').textContent(), '인쇄 창 열기');
    await page.locator('[data-download-save]').click();
    await page.waitForFunction(() => window.printed, null, {timeout: 30000});
    return page.evaluate(() => window.printed);
  };
  const slides = await print('slides');
  assert.match(slides.html, /size: A4 landscape/);
  assert.equal(slides.images.length, 2);
  for (const [w, h, scheme] of slides.images) { assert.ok(w > 100 && h > 50, `${w}×${h}`); assert.equal(scheme, 'blob:'); }
  const notes = await print('notes');
  assert.match(notes.html, /size: A4 portrait/);
  assert.match(notes.html, /사과 이야기/);
  assert.equal((notes.html.match(/class="sheet notes"/g) || []).length, 2);
  const h6 = await print('h6');
  assert.equal((h6.html.match(/class="sheet grid"/g) || []).length, 1);
  assert.equal(h6.images.length, 2);
  // The iframe is removed after printing.
  await page.waitForFunction(() => !document.querySelector('.cv-print-frame'));
  assert.deepEqual(external, []);
});
