// 글자 효과의 계속 움직이기(src/live.js 의 loopAt): 글상자의 "계속 움직이기"를 켜면 나타난 뒤 머무는 동안 그 효과답게 계속 움직인다.
// 꾸미기 판 · 발표에서 순간마다 자리가 바뀌고(콩콩 뛰기), 움직임 칸의 차례에 "계속 움직이는 조각"으로 적힌다. 영상도 같은 때에 같은 모습. 바깥 요청은 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 150000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName,getDesign} from '/app/store.js';
try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
setStorageName('text-look-loop');
const record=newRecord('16:9');record.name='계속 움직이기';record.slides=[
 {id:'ploop0001',bg:'#141821',items:[{id:'eloop0001',t:'text',text:'콩콩 뛰는 글',x:50,y:40,w:60,size:8,color:'#ffffff',lk:'bounce'},{id:'eloop0002',t:'text',text:'가만한 글',x:50,y:75,w:60,size:5,color:'#ffffff',lk:'gold'}]}];await putDesign(record);
window.recordId=record.id;window.getDesign=getDesign;await startMinican({storage:'text-look-loop'});await openSavedDesign(record.id);window.ready=true;
</script>`;

test('text look loops: a toggle per text box, moving all the time in the editor and the show, listed in the timeline, the same in video', options, async t => {
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
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  const errors = [], external = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === origin || ['data:', 'blob:', 'about:'].includes(u.protocol)) return route.continue(); external.push(u.origin); return route.abort(); });
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  const slide = async () => page.evaluate(async (id) => (await window.getDesign(id)).slides[0], await page.evaluate(() => window.recordId));
  const texts = page.locator('.cv-canvas .fe-stage .fi-text');
  // 글의 세로 옮김(em). translate 가 없으면 0.
  const ySeries = (sel, k = 12) => page.evaluate(async ({ sel, k }) => { const out = []; for (let i = 0; i < k; i++) { const m = /(-?[\d.]+)em\s*$/.exec(document.querySelector(sel)?.style.translate || ''); out.push(m ? Number(m[1]) : 0); await new Promise((r) => setTimeout(r, 70)); } return out; }, { sel, k });

  // "콩콩 뛰는 글"을 골라 "계속 움직이기"를 켜면 저장된다. 고르는 중에는 가만히 있고(손잡이와 어긋나지 않게), 고르기를 풀면 콩콩 뛴다.
  await texts.nth(0).click();
  await page.locator('.fe-bar button').filter({hasText: '효과'}).click();
  assert.match(await page.locator('.fe-poshead', {hasText: '계속 움직이기'}).innerText(), /콩콩 뛰기/);
  await page.locator('[data-look-loop=on]').click();
  for (let i = 0; i < 40 && (await slide()).items[0].lkloop !== true; i++) await page.waitForTimeout(250);
  assert.deepEqual((await slide()).items.map((it) => it.lkloop), [true, undefined]);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const ed = await ySeries('.cv-canvas .fe-stage .fi-text');
  assert.ok(Math.min(...ed) < -0.15 && new Set(ed.map((v) => v.toFixed(2))).size > 3, `hops in the editor: ${ed}`);
  // 움직임 칸의 차례: 머무는 동안 계속 움직이는 조각에 적힌다.
  await page.locator('.fe-tab[data-tab="motion"]').click();
  assert.match(await page.locator('.fe-note', {hasText: '머무는 동안 계속 움직이는 조각'}).innerText(), /글자 효과 · 콩콩 뛰기/);

  // 발표: 나타나는 움직임(떨어져 튀기)이 끝난 뒤에도 계속 콩콩 뛴다. 켜지 않은 글은 자리를 옮기지 않는다.
  await page.locator('.cv-show-btn').click();
  await page.waitForFunction(() => document.querySelector('.cv-show .fi-text')?.textContent === '콩콩 뛰는 글');
  await page.waitForTimeout(2000);
  const sh = await ySeries('.cv-show .fi-text');
  assert.ok(Math.min(...sh) < -0.15 && new Set(sh.map((v) => v.toFixed(2))).size > 3, `keeps hopping in the show: ${sh}`);
  const still = await ySeries('.cv-show .fi-text:nth-of-type(2), .cv-show .fi-text ~ .fi-text', 6);
  assert.ok(still.every((v) => v === 0), `the other text stays: ${still}`);
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});

  // 영상: 나타나는 움직임이 끝난 뒤의 두 순간에 글의 자리가 다르다(글 위쪽 띠의 밝기가 다르다).
  const out = await page.evaluate(async () => {
    const {createFilm, cleanDesign} = await import('/src/index.js');
    const design = cleanDesign({ id: 'ploop0002', bg: '#141821', items: [{ id: 'eloop0003', t: 'text', text: '콩콩', x: 50, y: 60, w: 60, size: 10, color: '#ffffff', lk: 'bounce', lkloop: true }] });
    const band = (cv) => { const d = cv.getContext('2d').getImageData(cv.width * 0.2, cv.height * 0.4, cv.width * 0.6, cv.height * 0.1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2] - 77; return s; };
    const film = createFilm([design], { width: 640, height: 360, stay: 4 });
    await film.ready(0);
    const at = (ms) => { film.draw(0, ms); return band(film.canvas); };
    const r = [2000, 2150, 2300, 2450, 2600].map(at);
    film.close();
    return r;
  });
  assert.ok(Math.max(...out) > Math.min(...out) * 1.5 + 1000, `the text keeps moving in the video: ${out}`);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});
