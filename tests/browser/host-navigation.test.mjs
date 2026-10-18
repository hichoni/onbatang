// Optional browser regression: set MINICAN_PLAYWRIGHT_PATH to an installed Playwright module.
// node --test tests/browser/host-navigation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname, sep } from 'node:path';

test('host home saves latest edits, waits for sync, and keeps unsaved work after storage failure', {
  skip: !process.env.MINICAN_PLAYWRIGHT_PATH,
}, async () => {
  const { chromium } = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const harness = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/brand.css">
    <body class="mc-app"><main id="app"></main><script type="module">
      import { startMinican } from '/app/app.js';
      window.events = [];
      startMinican({brand:{name:'학교',logo:'/app/brand/symbol.svg'},
        onBrandClick:()=>{window.events.push('home');document.body.dataset.home='yes';},
        sync:{pull:async()=>[],drop:async()=>{},push:async(record)=>{
          window.events.push('push:'+record.name);
          if(window.holdSync)await new Promise(r=>window.releaseSync=r);
          window.events.push('synced');
        }}
      });
    </script>`;
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/navigation.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(harness); }
      const file = resolve(root, '.' + decodeURIComponent(pathname));
      if (!file.startsWith(resolve(root) + sep)) { res.writeHead(403); return res.end(); }
      res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.MINICAN_BROWSER || 'msedge', headless: true });
    const page = await browser.newPage({ viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce' });
    const url = `http://127.0.0.1:${server.address().port}/navigation.html`;
    await page.goto(url);
    await page.locator('.cv-start').first().click();
    await page.locator('.cv-name').waitFor();
    // Click in the same event loop as the last edit, before the 500ms autosave.
    await page.evaluate(() => {
      window.holdSync = true;
      const name = document.querySelector('.cv-name'); name.value = '나가기 직전 수정';
      name.dispatchEvent(new Event('input', {bubbles:true}));
      document.querySelector('.cv-brand-link').click();
    });
    await page.waitForFunction(() => !!window.releaseSync);
    assert.equal(await page.locator('body').getAttribute('data-home'), null);
    await page.evaluate(() => window.releaseSync());
    await page.waitForFunction(() => document.body.dataset.home === 'yes');
    assert.deepEqual(await page.evaluate(() => window.events), ['push:나가기 직전 수정', 'synced', 'home']);
    await page.reload();
    await page.getByRole('button', {name:'나가기 직전 수정 열기', exact:true}).click();
    await page.locator('.cv-name').waitFor();
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.getByRole('button', {name:'학교 홈으로', exact:true}).isVisible());
    await page.evaluate(() => {
      window.realTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(store, mode, ...args) {
        if (mode === 'readwrite') throw new DOMException('test full storage', 'QuotaExceededError');
        return window.realTransaction.call(this, store, mode, ...args);
      };
      const name = document.querySelector('.cv-name'); name.value = '실패해도 남는 수정';
      name.dispatchEvent(new Event('input', {bubbles:true}));
      document.querySelector('.cv-brand-link').click();
    });
    await page.getByText('저장하지 못해 이동하지 않았어요.', {exact:false}).waitFor();
    assert.equal(await page.locator('body').getAttribute('data-home'), null);
    assert.equal(await page.locator('.cv-name').inputValue(), '실패해도 남는 수정');
    assert.equal(await page.locator('.cv-app-root').evaluate(el => el.inert), false);
    await page.evaluate(() => { IDBDatabase.prototype.transaction = window.realTransaction; });
    // Existing back button still returns to the drawings, without leaving for the host.
    await page.locator('.cv-back').click();
    await page.getByRole('button', {name:'실패해도 남는 수정 열기', exact:true}).click();
    await page.getByRole('button', {name:'학교 홈으로', exact:true}).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.body.dataset.home === 'yes');
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
});
