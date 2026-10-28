// 같이 고치기(브라우저): 시작한 사람이 "같이 고치기"를 열어 링크를 만들고 → 링크를 연 사람이 이름을 적고 들어오면 그림의 사본이 열린다 →
// 한쪽이 고친 것(요소 옮기기 · 글 · 새 장)이 다른 쪽 화면 · 저장에 바로 들어온다 → 다른 사람이 고른 요소는 색 테두리 · 고를 수 없다 → 끝내면 사본이 남는다.
// 통로는 같은 브라우저의 BroadcastChannel 로 흉내 낸다(실제로는 GBE-AI Lab의 실시간 통로).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = { skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 180000 };
const text = (id, value, patch = {}) => ({ id, t: 'text', text: value, x: 30, y: 30, w: 30, size: 6, ...patch });
const slides = [
  { id: 'pcoedit001', bg: '#ffffff', items: [text('ecoa000001', '함께 고칠 글'), text('ecob000001', '둘째 글', { x: 70, y: 70 })] },
  { id: 'pcoedit002', bg: '#fff4d6', items: [text('ecoc000001', '둘째 장')] },
];
const fixture = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,listDesigns,setStorageName} from '/app/store.js';
const who=new URLSearchParams(location.search).get('s');
const storage='co-'+who;setStorageName(storage);try{for(const k of ['editor','home','news-0.45'])localStorage.setItem('onbatang-tour-seen-v1:'+k,'1');}catch{}
if(who==='host'){const seed=newRecord('16:9');seed.id='dcoedithost1';seed.name='모둠 발표';seed.slides=${JSON.stringify(slides)};await putDesign(seed);}
window.readAll=()=>listDesigns();window.read=(id)=>getDesign(id);
// 통로 흉내: 같은 브라우저의 다른 창과 BroadcastChannel 로 주고받는다(보낸 창에는 오지 않는다)
const coEdit={open:async(code)=>{const bc=new BroadcastChannel('co:'+code);const fns=new Set();bc.onmessage=(e)=>{for(const fn of fns)fn(e.data);};
  return {send:(m)=>bc.postMessage(m),on:(fn)=>{fns.add(fn);return()=>fns.delete(fn);},close:()=>bc.close(),qr:async()=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="2" height="2"/></svg>'};},
  link:(code)=>location.origin+'/fixture.html?s=guest&co='+code};
await startMinican({storage,coEdit});window.ready=true;
</script>`;

test('co-edit: start, join by link, edit together, locks, and the copy stays after the end', options, async (t) => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' })[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise((done) => server.close(done)));
  const { chromium } = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({ channel: process.env.MINICAN_BROWSER || 'msedge', headless: true });
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await context.route('**/*', (route) => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? route.abort() : route.continue());
  const errors = [];
  const open = async (url) => { const p = await context.newPage(); p.setDefaultTimeout(20000); p.on('pageerror', (e) => errors.push(String(e))); await p.goto(url); await p.waitForFunction(() => window.ready); return p; };
  const shot = async (p, name) => { if (process.env.CO_SHOT) await p.screenshot({ path: `${process.env.CO_SHOT}-${name}.png` }); };

  // 시작한 사람: 그림을 열고 → 같이 고치기 → 이름 → 시작하기 → 링크
  const host = await open(origin + '/fixture.html?s=host');
  await host.locator('.cv-item .cv-thumb').first().click();
  await host.locator('.cv-canvas .fe-stage').waitFor();
  await host.locator('[data-co-edit]').click();
  await host.locator('[data-co-name]').fill('선생님');
  await host.locator('[data-co-start]').click();
  const link = await host.locator('[data-co-link]').inputValue();
  assert.match(link, /\?s=guest&co=[0-9a-f]{40}$/);
  await host.locator('[data-co-qr] svg').waitFor();
  assert.equal(await host.locator('[data-co-people]').getAttribute('data-co-people'), '1');
  await shot(host, 'host-start');

  // 들어오는 사람: 링크 → 이름 → 들어가기 → 사본이 열린다
  const guest = await open(link);
  await guest.locator('[data-co-name]').fill('민지');
  await guest.locator('[data-co-join]').click();
  await guest.locator('.cv-canvas .fe-stage').waitFor();
  await guest.locator('.cv-co-btn.on').waitFor();
  assert.equal(await guest.locator('.cv-name').inputValue(), '(같이 고치기) 모둠 발표');
  assert.equal(await guest.locator('.cv-strip .cv-slide[data-slide]').count(), 2);
  await host.locator('[data-co-people="2"]').waitFor();
  assert.match(await host.locator('.cv-co-btn').innerText(), /같이 고치는 중 · 2명/);

  // 들어온 사람이 요소를 옮긴다 → 시작한 사람의 화면 · 저장에 들어온다
  const hostItem = () => host.evaluate(async () => (await window.read('dcoedithost1')).slides[0].items.find((it) => it.id === 'ecoa000001'));
  const before = await hostItem();
  await guest.locator('.cv-canvas .fe-card > .fi-text').first().click();
  for (let i = 0; i < 5; i++) await guest.keyboard.press('Shift+ArrowRight');
  await host.waitForFunction(async (x) => (await window.read('dcoedithost1')).slides[0].items.find((it) => it.id === 'ecoa000001').x > x + 3, before.x);

  // 고르고 있는 요소: 시작한 사람에게는 민지의 색 테두리 · 고를 수 없다
  await host.locator('.fe-other .fe-other-name', { hasText: '민지' }).waitFor();
  await host.locator('.cv-canvas .fe-card > .fi-text').first().click({ force: true });
  assert.equal(await host.locator('.cv-canvas .fe-card > .fi-text.on, .cv-canvas .fe-card > .fi-text.sel').count(), 0, 'a locked item cannot be picked');
  await shot(host, 'host-lock');

  // 시작한 사람이 새 장을 더한다 → 들어온 사람의 띠에도 생긴다 · 사본에 저장된다
  await host.getByRole('button', { name: '새 장 더하기', exact: true }).click();
  await guest.waitForFunction(() => document.querySelectorAll('.cv-strip .cv-slide[data-slide]').length === 3);
  await host.locator('.cv-strip .cv-slide[data-slide="0"]').click();

  // 시작한 사람이 둘째 글을 옮긴다 → 들어온 사람의 사본에 저장된다
  await host.locator('.cv-canvas .fe-card > .fi-text').nth(1).click();
  for (let i = 0; i < 4; i++) await host.keyboard.press('Shift+ArrowDown');
  const copyId = await guest.evaluate(async () => (await window.readAll()).find((r) => r.name.startsWith('(같이 고치기)')).id);
  await guest.waitForFunction(async ({ id }) => { const r = await window.read(id); return r.slides.length === 3 && r.slides[0].items.find((it) => it.id === 'ecob000001').y > 72; }, { id: copyId });
  await shot(guest, 'guest');

  // 끝내기 → 들어온 사람에게 알리고, 사본은 그대로 남는다
  await host.locator('[data-co-edit]').click();
  await host.locator('[data-co-end]').click();
  await guest.locator('.cv-co-btn:not(.on)').waitFor();
  const kept = await guest.evaluate(async (id) => (await window.read(id)).slides.length, copyId);
  assert.equal(kept, 3);
  assert.equal(new URL(guest.url()).searchParams.has('co'), false, 'the link is taken off the address after the end');
  assert.deepEqual(errors, []);
});
