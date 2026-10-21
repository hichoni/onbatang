// Run against the source app, then MINICAN_HOST_ROOT=<g-ai-lab/dist> for the real host boot page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname, sep } from 'node:path';
// 공용 첫 쪽은 새로 고치면 꾸미던 그림을 다시 연다(v0.42). 목록에서 다시 여는 것을 보려고 그때는 내 그림으로 나간다.
const reloadToList=async page=>{await page.reload();await page.waitForFunction(()=>!document.getElementById('onba-splash'));if(await page.evaluate(()=>document.body.classList.contains('cv-editing'))){await page.locator('.cv-back').click();await page.locator('.cv-home-title').waitFor();}};

test('actual app migrates, edits, saves twice, reopens, copies, reorders and displays 4:3 without data loss', {
  skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 60000,
}, async t => {
  const { chromium } = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const hosted = !!process.env.MINICAN_HOST_ROOT;
  const root = resolve(process.env.MINICAN_HOST_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
  const base = hosted ? '/minican' : '';
  const dbName = hosted ? 'gailab-minican' : 'minican';
  const sample = JSON.parse(await readFile(new URL('../../app/samples/studio-document.json', import.meta.url)));
  const legacy = { id: 'dlegacybrowser', name: '이전 그림', ratio: '4:3', design: { bg: 'mint', items: [{t:'text',text:'예전 내용 그대로',x:40,y:35,w:70}] }, updatedAt: 1, recoverableExtra: '원문 보존' };
  const rejected = { id:'dlimitbrowser', name:'21쪽 원본', slides:Array.from({length:21},()=>({items:[]})),updatedAt:2 };
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/seed.html') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><body>seed</body>'); }
      const file = resolve(root, '.' + decodeURIComponent(pathname));
      if (!file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
      res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const browser = await chromium.launch({channel:process.env.MINICAN_BROWSER || 'msedge',headless:true});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin + '/seed.html');
  await page.evaluate(async ({dbName, records}) => {
    await new Promise((done, reject) => {
      const q = indexedDB.open(dbName,1);
      q.onupgradeneeded = () => q.result.createObjectStore('designs');
      q.onerror = () => reject(q.error);
      q.onsuccess = () => {
        const db = q.result, tx = db.transaction('designs','readwrite');
        records.forEach(r => tx.objectStore('designs').put(r,r.id));
        tx.oncomplete = () => { db.close(); done(); }; tx.onerror = () => reject(tx.error);
      };
    });
    localStorage.setItem('minican.tour.edit','1');
  }, {dbName,records:[sample,legacy,rejected]});
  const url = origin + (hosted ? '/minican-app.html' : '/app/index.html');
  await page.goto(url);
  await page.getByText('21쪽 원본: 지금 열 수 없는 자료예요', {exact:false}).waitFor();
  await page.getByRole('button',{name:'이전 그림 열기',exact:true}).click();
  await page.locator('.cv-name').waitFor();
  // Close optional first-open tour without relying on a guessed persistence key.
  await page.evaluate(async base => (await import(base + '/app/tour.js')).stopTour(), base);
  const old = await page.evaluate(async ({base,id}) => (await import(base+'/app/store.js')).getDesign(id), {base,id:legacy.id});
  assert.equal(old.slides[0].items[0].text, legacy.design.items[0].text);
  assert.deepEqual(await page.evaluate(async ({base,id}) => (await import(base+'/app/store.js')).getOriginalDesign(id), {base,id:legacy.id}), legacy);
  await page.locator('.cv-back').click();
  await page.getByRole('button',{name:sample.name+' 열기',exact:true}).click();
  await page.locator('.cv-name').waitFor();
  const busy = await page.evaluate(async ({base,id}) => {
    try { await (await import(base+'/app/app.js')).openSavedDesign(id); return 'opened'; }
    catch (error) { return error.message; }
  }, {base,id:legacy.id});
  assert.equal(busy,'EDITOR_BUSY','host imports cannot replace the active editor');
  assert.equal(await page.locator('.cv-name').inputValue(),sample.name);
  await page.evaluate(async base => (await import(base+'/app/tour.js')).stopTour(),base);
  // A referenced source cannot become an unsavable dangling asset in another drawing.
  await page.locator('.cv-canvas .fi-text').first().click();
  await page.keyboard.press('Control+c');
  await page.locator('.cv-back').click();
  await page.getByRole('button',{name:'이전 그림 열기',exact:true}).click();
  await page.locator('.cv-name').waitFor();
  await page.locator('.cv-canvas .fe-card').first().click({position:{x:8,y:8}});
  await page.keyboard.press('Control+v');
  await page.getByText('이 그림에 없는 원본 자료가 연결되어 있어요.',{exact:false}).waitFor();
  await page.locator('.cv-back').click();
  const afterPaste = await page.evaluate(async ({base,id}) => (await import(base+'/app/store.js')).getDesign(id), {base,id:legacy.id});
  assert.equal(afterPaste.slides[0].items.length,1);
  await page.getByRole('button',{name:sample.name+' 열기',exact:true}).click();
  await page.locator('.cv-name').waitFor();
  const ratio = await page.locator('.cv-canvas .fe-card').first().evaluate(el => {const r=el.getBoundingClientRect();return r.width/r.height;});
  assert.ok(Math.abs(ratio-4/3)<0.01, `actual canvas ratio ${ratio}`);
  if (process.env.MINICAN_SCREENSHOT) await page.screenshot({path:process.env.MINICAN_SCREENSHOT,fullPage:true});
  for (const name of ['첫 저장', '두 번째 저장']) {
    await page.locator('.cv-name').fill(name);
    const flushed = await page.evaluate(async ({base,id}) => (await import(base+'/app/app.js')).flushSavedDesign(id), {base,id:sample.id});
    assert.equal(flushed.name,name,'explicit host save includes edits before the autosave debounce');
    assert.equal(await page.locator('.cv-name').inputValue(),name,'flushing leaves the editor open');
    // Host account controls may leave no width for this secondary status. The
    // flush result, committed IDB value and full reload below prove persistence.
    await page.locator('.cv-status.ok').filter({hasText:'이 기기에 저장했어요'}).waitFor({state:hosted?'attached':'visible'});
    assert.equal(await page.evaluate(async ({base,id}) => (await (await import(base+'/app/store.js')).getDesign(id)).name,{base,id:sample.id}),name,'committed value before reload');
    await reloadToList(page);
    await page.getByRole('button',{name:name+' 열기',exact:true}).click();
    await page.locator('.cv-name').waitFor();
  }
  const saved = await page.evaluate(async ({base,id}) => (await import(base+'/app/store.js')).getDesign(id), {base,id:sample.id});
  assert.equal(saved.revision,2);
  assert.deepEqual(saved.originalSize,sample.originalSize); assert.deepEqual(saved.source,sample.source);
  assert.deepEqual(saved.assets,sample.assets);
  assert.deepEqual(saved.slides.map(p=>[p.id,p.items.map(e=>[e.id,e.source,e.assetRefs])]),sample.slides.map(p=>[p.id,p.items.map(e=>[e.id,e.source,e.assetRefs])]));
  // Native slide controls use the same stable page identity.
  await page.locator('.cv-tray-menu>summary').click();await page.getByRole('button',{name:'이 장을 뒤로 옮기기',exact:true}).click();
  await page.locator('.cv-back').click();
  const moved = await page.evaluate(async ({base,id}) => (await import(base+'/app/store.js')).getDesign(id), {base,id:sample.id});
  assert.equal(moved.slides[1].id,sample.slides[0].id);
  await page.locator(`[data-id="${sample.id}"]`).getByRole('button',{name:'복사',exact:true}).click();
  await page.getByRole('button',{name:'두 번째 저장 복사 열기',exact:true}).waitFor();
  const copy = await page.evaluate(async base => (await (await import(base+'/app/store.js')).listDesigns()).find(r=>r.name==='두 번째 저장 복사'),base);
  assert.notEqual(copy.id,sample.id); assert.equal(copy.origin.documentId,sample.id);
  const original = await page.evaluate(async ({base,id}) => (await import(base+'/app/store.js')).getOriginalDesign(id), {base,id:rejected.id});
  assert.equal(original.slides.length,21);
  await page.evaluate(async ({base,id}) => (await import(base+'/app/app.js')).openSavedDesign(id), {base,id:sample.id});
  await page.locator('.cv-name').waitFor();
  const mismatch = await page.evaluate(async ({base,id}) => {
    try { await (await import(base+'/app/app.js')).flushSavedDesign(id); return 'saved'; } catch (error) { return error.message; }
  },{base,id:legacy.id});
  assert.equal(mismatch,'EDITOR_MISMATCH');
  await page.evaluate(() => { window.savedTransaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')throw new DOMException('test quota','QuotaExceededError');return window.savedTransaction.apply(this,args);}; });
  await page.locator('.cv-name').fill('저장 실패 뒤 남겨야 할 편집');
  const failed = await page.evaluate(async ({base,id}) => {
    try { await (await import(base+'/app/app.js')).flushSavedDesign(id); return 'saved'; } catch(error) { return error.message; }
  },{base,id:sample.id});
  assert.equal(failed,'EDITOR_SAVE_FAILED');assert.equal(await page.locator('.cv-name').inputValue(),'저장 실패 뒤 남겨야 할 편집');
  await page.evaluate(() => {IDBDatabase.prototype.transaction=window.savedTransaction;delete window.savedTransaction;});
  const recovered = await page.evaluate(async ({base,id}) => {
    const api=await import(base+'/app/app.js');const [a,b]=await Promise.all([api.flushSavedDesign(id),api.flushSavedDesign(id)]);return [a,b];
  },{base,id:sample.id});
  assert.deepEqual(recovered[0],recovered[1]);assert.equal(recovered[0].name,'저장 실패 뒤 남겨야 할 편집');
  assert.deepEqual(errors,[]);
});
