// 꾸미는 화면의 Delete · Ctrl+Z: 그림판 밖(도구 막대 · 옆 칸 · 페이지 바탕 · 장 목록)에 초점이 있어도 듣고,
// 되돌리기는 자료 전체의 차례로 한다(다른 장에서 한 일은 그 장으로 가서, 장을 더하고 · 지우고 · 옮긴 일도 되돌린다).
// 글을 쓰는 칸에서는 그 칸의 글쇠 그대로다. 계정 · 네트워크 없이 이 기기에서만 본다.
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
setStorageName('undo-keys');
const seed=newRecord('16:9');seed.name='글쇠 검수';
seed.slides=[{id:'pundo000001',bg:'#ffffff',items:[
 {id:'etexta0001',t:'text',text:'첫째 글',x:30,y:25,w:40,size:5,color:'#1d2433'},
 {id:'eshape0001',t:'shape',shape:'rect',x:70,y:60,w:20,h:20,color:'#1c7ed6'},
 {id:'eshape0002',t:'shape',shape:'circle',x:30,y:70,w:14,h:25,color:'#e03131'}]},
 {id:'pundo000002',bg:'#fff3bf',items:[{id:'etextb0001',t:'text',text:'둘째 장',x:50,y:50,w:50,size:5}]},
 {id:'pundo000003',bg:'#ffffff',items:[{id:'etextc0001',t:'text',text:'셋째 장',x:50,y:50,w:50,size:5}]}];
await putDesign(seed);window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'undo-keys'});window.ready=true;
</script>`;

// 여러 파트로 나뉜 PPT(전체 자료): 온바탕 파일로 연 것처럼 두 그림 기록을 한 자료로 묶어 둔다(쪽 차례는 이 기기에 적는다).
const sha = 'c'.repeat(64), asset = 'a' + sha.slice(0, 24);
const part = (id, name, slides) => ({id, schemaVersion: 1, revision: 2, name, size: {width: 1280, height: 720, unit: 'px'}, source: {kind: 'pptx', sourceDocumentId: 's' + sha.slice(0, 24), assetId: asset, filename: '연수.pptx', sha256: sha},
  assetRefs: [asset], uploads: [], assets: [{id: asset, kind: 'source', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sha256: sha}], slides, updatedAt: 1792900000000});
const pageOf = (id, text) => ({id, bg: '#ffffff', items: [{id: 'e' + id.slice(1), t: 'text', x: 50, y: 25, w: 60, size: 6, text, color: '#1d2433'}, {id: 's' + id.slice(1), t: 'shape', shape: 'rect', x: 50, y: 70, w: 20, h: 20, color: '#1c7ed6'}]});
const parts = [part('dundo0001aa', '연수 · 1', [pageOf('pmat000001', '첫 쪽'), pageOf('pmat000002', '둘째 쪽')]), part('dundo0001bb', '연수 · 2', [pageOf('pmat000003', '셋째 쪽')])];
const deckHtml = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('undo-deck');window.getDesign=getDesign;
for(const r of ${JSON.stringify(parts)})await putDesign(r);
localStorage.setItem('onbatang-file-decks-v1:undo-deck',JSON.stringify([{id:'fundo',title:'연수',documents:['dundo0001aa','dundo0001bb'],pageOrder:['pmat000001','pmat000002','pmat000003'],createdAt:1}]));
await startMinican({storage:'undo-deck'});window.ready=true;
</script>`;

async function setup(t, {source = html, open = '.cv-item .cv-thumb'} = {}) {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(source); }
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
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1440, height: 900}});
  await context.addInitScript(() => { try { for (const k of ['editor', 'home', 'news-0.45']) localStorage.setItem('onbatang-tour-seen-v1:' + k, '1'); } catch {} });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);
  await page.locator(open).first().click();
  await page.locator('.cv-canvas .fe-stage .fi').first().waitFor();
  // 지금 화면: 그림판의 요소 수 · 글 · 장 수 · 보고 있는 장
  const see = () => page.evaluate(() => ({
    items: document.querySelectorAll('.cv-canvas .fe-stage .fi').length,
    text: [...document.querySelectorAll('.cv-canvas .fe-stage .fi-text')].map(n => n.innerText.trim()).join('|'),
    slides: document.querySelectorAll('.cv-slide:not(.add)').length,
    at: Number(document.querySelector('.cv-slide.on')?.dataset.slide ?? -1),
  }));
  const until = async (want, why) => {
    try { await page.waitForFunction(w => {
      const got = {items: document.querySelectorAll('.cv-canvas .fe-stage .fi').length, slides: document.querySelectorAll('.cv-slide:not(.add)').length, at: Number(document.querySelector('.cv-slide.on')?.dataset.slide ?? -1)};
      return Object.keys(w).every(k => got[k] === w[k]);
    }, want, {timeout: 5000}); } catch { assert.deepEqual(await see(), want, why); }
  };
  const item = i => page.locator('.cv-canvas .fe-stage .fi').nth(i);
  const tool = i => page.evaluate(k => document.querySelectorAll('.cv-slide-tool')[k].click(), i);   // 0 앞으로 · 1 뒤로 · 2 복제 · 3 지우기(접힌 메뉴 안에 있다)
  return {page, errors, see, until, item, tool};
}

test('Delete and Ctrl+Z work from the toolbar, the side panel and the page background, and leave text fields alone', options, async t => {
  const {page, errors, until, item} = await setup(t);
  const focusOn = {
    'a side-panel tab': () => page.evaluate(() => [...document.querySelectorAll('.fe-tabs button')].find(n => n.offsetParent).focus()),
    'a toolbar button': () => page.evaluate(() => [...document.querySelectorAll('.fe-bar button')].find(n => n.offsetParent && !n.disabled).focus()),
    'the page background': () => page.evaluate(() => document.activeElement?.blur()),
  };
  for (const [where, focus] of Object.entries(focusOn)) {
    for (const key of ['Delete', 'Backspace']) {
      await item(1).click();
      await focus();
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.fe-stage')), false, `focus is outside the canvas (${where})`);
      await page.keyboard.press(key);
      await until({items: 2, slides: 3, at: 0}, `${key} with focus on ${where} removes the selected element`);
      await focus();
      await page.keyboard.press('Control+z');
      await until({items: 3, slides: 3, at: 0}, `Ctrl+Z with focus on ${where} brings it back`);
    }
  }
  // 다시 실행: Ctrl+Y 와 Ctrl+Shift+Z
  await item(1).click(); await page.keyboard.press('Delete'); await until({items: 2, slides: 3, at: 0});
  await focusOn['the page background']();
  await page.keyboard.press('Control+z'); await until({items: 3, slides: 3, at: 0});
  await page.keyboard.press('Control+y'); await until({items: 2, slides: 3, at: 0}, 'Ctrl+Y redoes from the page background');
  await page.keyboard.press('Control+z'); await until({items: 3, slides: 3, at: 0});
  await page.keyboard.press('Control+Shift+z'); await until({items: 2, slides: 3, at: 0}, 'Ctrl+Shift+Z redoes too');
  await page.keyboard.press('Control+z'); await until({items: 3, slides: 3, at: 0});
  // 글을 쓰는 칸(그림 이름)에서는 그 칸의 글자만 지운다
  await item(1).click();
  const name = page.locator('.cv-name');
  await name.click(); await name.press('End'); await name.press('Backspace'); await name.press('Delete');
  assert.equal(await name.inputValue(), '글쇠 검', 'Backspace in the name field edits the name');
  await until({items: 3, slides: 3, at: 0}, 'typing keys in a text field never delete canvas elements');
  // 고른 것이 없으면 아무 일도 없다
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur());
  await page.locator('.cv-canvas .fe-stage').click({position: {x: 4, y: 4}});
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Delete');
  await until({items: 3, slides: 3, at: 0}, 'Delete with nothing selected does nothing');
  assert.deepEqual(errors, []);
});

test('Ctrl+Z follows the whole deck: edits on other slides, and adding, copying, moving and deleting slides', options, async t => {
  const {page, errors, see, until, item, tool} = await setup(t);
  // 1장에서 글을 지우고 2장으로 가서 2장의 글도 지운다
  await item(0).click(); await page.keyboard.press('Delete'); await until({items: 2, slides: 3, at: 0});
  await page.locator('.cv-slide[data-slide="1"]').click(); await until({items: 1, slides: 3, at: 1});
  await item(0).click(); await page.keyboard.press('Delete'); await until({items: 0, slides: 3, at: 1});
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Control+z'); await until({items: 1, slides: 3, at: 1}, 'the latest edit (slide 2) is undone first');
  await page.keyboard.press('Control+z'); await until({items: 3, slides: 3, at: 0}, 'the next undo goes back to slide 1 and restores its text');
  assert.equal((await see()).text, '첫째 글');
  await page.keyboard.press('Control+y'); await until({items: 2, slides: 3, at: 0}, 'redo replays slide 1');
  await page.keyboard.press('Control+y'); await until({items: 0, slides: 3, at: 1}, 'redo then replays slide 2');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await until({items: 3, slides: 3, at: 0});

  // 장 지우기(단추: 한 번 더 눌러야 지워진다) → 되돌리기 → 다시 실행
  await page.locator('.cv-slide[data-slide="1"]').click(); await until({items: 1, slides: 3, at: 1});
  await tool(3); await tool(3); await until({items: 1, slides: 2, at: 1}, 'the delete tool removes slide 2');
  assert.equal((await see()).text, '셋째 장');
  await page.keyboard.press('Control+z'); await until({items: 1, slides: 3, at: 1}, 'Ctrl+Z brings the deleted slide back');
  assert.equal((await see()).text, '둘째 장', 'the restored slide is shown with its content');
  await page.keyboard.press('Control+y'); await until({items: 1, slides: 2, at: 1}, 'redo deletes it again');
  await page.keyboard.press('Control+z'); await until({items: 1, slides: 3, at: 1});

  // 장 목록에서 장을 누른 뒤 Delete: 그 장을 지운다(고른 요소가 있으면 요소가 먼저)
  await page.locator('.cv-slide[data-slide="2"]').click(); await until({items: 1, slides: 3, at: 2});
  await page.keyboard.press('Delete'); await until({items: 1, slides: 2, at: 1}, 'Delete after picking a slide in the list removes that slide');
  await page.locator('.toast, [role=status]').filter({hasText: 'Ctrl+Z'}).first().waitFor();
  await page.keyboard.press('Control+z'); await until({items: 1, slides: 3, at: 2}, 'and Ctrl+Z restores it');
  assert.equal((await see()).text, '셋째 장');
  await item(0).click(); await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Delete'); await until({items: 0, slides: 3, at: 2}, 'after clicking the canvas, Delete removes the element, not the slide');
  await page.keyboard.press('Control+z'); await until({items: 1, slides: 3, at: 2});

  // 새 장 · 복제 · 옮기기
  await page.locator('.cv-slide.add').click(); await until({items: 0, slides: 4, at: 3}, 'a new slide is added after the current one');
  await page.keyboard.press('Control+z'); await until({items: 1, slides: 3, at: 2}, 'undo removes the added slide');
  await tool(2); await until({items: 1, slides: 4, at: 3}, 'copy duplicates the slide');
  await page.keyboard.press('Control+z'); await until({items: 1, slides: 3, at: 2}, 'undo removes the copy');
  await tool(0); await until({items: 1, slides: 3, at: 1}, 'move forward');
  assert.equal((await see()).text, '셋째 장');
  await page.keyboard.press('Control+z'); await until({items: 1, slides: 3, at: 2}, 'undo moves it back');

  // 되돌린 뒤의 모습이 그대로 저장된다
  await page.waitForFunction(async () => { const r = await window.readSaved(); return r.slides.length === 3 && r.slides[0].items.length === 3 && r.slides[1].items.length === 1 && r.slides[2].items.length === 1; }, null, {timeout: 15000});
  const saved = await page.evaluate(() => window.readSaved().then(r => r.slides.map(s => s.id)));
  assert.deepEqual(saved, ['pundo000001', 'pundo000002', 'pundo000003'], 'the saved deck is the original order again');
  assert.deepEqual(errors, []);
});

test('in a deck split into parts, Ctrl+Z crosses parts, and undoes page order and page deletion', options, async t => {
  const {page, errors, item, tool} = await setup(t, {source: deckHtml, open: '.cv-deck .cv-item-open'});
  await page.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 3);
  const see = () => page.evaluate(() => ({
    items: document.querySelectorAll('.cv-canvas .fe-stage .fi').length,
    pages: [...document.querySelectorAll('[data-material-page]')].map(n => n.dataset.pageId.slice(-1)).join(''),
    on: document.querySelector('.cv-slide.on')?.dataset.pageId.slice(-1) || '',
  }));
  const until = async (want, why) => {
    try { await page.waitForFunction(w => {
      const got = {items: document.querySelectorAll('.cv-canvas .fe-stage .fi').length, pages: [...document.querySelectorAll('[data-material-page]')].map(n => n.dataset.pageId.slice(-1)).join(''), on: document.querySelector('.cv-slide.on')?.dataset.pageId.slice(-1) || ''};
      return !document.querySelector('#app').inert && Object.keys(w).every(k => got[k] === w[k]);
    }, want, {timeout: 8000}); } catch { assert.deepEqual(await see(), want, why); }
  };
  const blur = () => page.evaluate(() => document.activeElement?.blur());
  await until({items: 2, pages: '123', on: '1'});
  // 1쪽(첫 파트)에서 글을 지우고, 3쪽(둘째 파트)으로 가서 도형을 지운다
  await item(0).click(); await page.keyboard.press('Delete'); await until({items: 1, pages: '123', on: '1'});
  await page.locator('[data-material-page="2"]').click(); await until({items: 2, pages: '123', on: '3'}, 'the page of the other part opens');
  await item(1).click(); await page.keyboard.press('Delete'); await until({items: 1, pages: '123', on: '3'});
  await blur();
  await page.keyboard.press('Control+z'); await until({items: 2, pages: '123', on: '3'}, 'the edit in the second part is undone first');
  await page.keyboard.press('Control+z'); await until({items: 2, pages: '123', on: '1'}, 'the next undo returns to the first part and restores its text');
  assert.match(await page.locator('.cv-canvas .fe-stage').innerText(), /첫 쪽/);
  await page.keyboard.press('Control+y'); await until({items: 1, pages: '123', on: '1'}, 'redo replays the first part');
  await page.keyboard.press('Control+y'); await until({items: 1, pages: '123', on: '3'}, 'redo crosses to the second part again');
  await page.keyboard.press('Control+z'); await until({items: 2, pages: '123', on: '3'});
  await page.keyboard.press('Control+z'); await until({items: 2, pages: '123', on: '1'});
  // 쪽 차례 바꾸기(뒤로) → 되돌리기 → 다시 실행
  await tool(1); await until({items: 2, pages: '213', on: '1'}, 'the page moves back one place');
  await page.keyboard.press('Control+z'); await until({items: 2, pages: '123', on: '1'}, 'Ctrl+Z restores the page order');
  await page.keyboard.press('Control+y'); await until({items: 2, pages: '213', on: '1'}, 'redo moves it again');
  await page.keyboard.press('Control+z'); await until({items: 2, pages: '123', on: '1'});
  // 장 목록에서 2쪽을 누르고 Delete → 되돌리기
  await page.locator('[data-material-page="1"]').click(); await until({items: 2, pages: '123', on: '2'});
  await page.keyboard.press('Delete'); await until({items: 2, pages: '13', on: '1'}, 'Delete removes the picked page');
  await page.keyboard.press('Control+z'); await until({items: 2, pages: '123', on: '2'}, 'Ctrl+Z brings the page back in place');
  assert.match(await page.locator('.cv-canvas .fe-stage').innerText(), /둘째 쪽/);
  assert.deepEqual(errors, []);
});
