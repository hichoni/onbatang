// 글상자마다 글자 효과(src/live.js 의 itemLook): 글을 누르고 "효과" 칸에서 고르면 그 글상자에만 들어가고(장의 효과보다 먼저),
// "없음"은 그 글만 효과를 뺀다. 장의 효과가 없어도 고른 글상자는 꾸미기 판 · 발표에서 움직이고, 그림 · 영상에도 그 글만 효과가 들어간다. 바깥 요청은 없다.
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
setStorageName('text-look-item');
const record=newRecord('16:9');record.name='글상자 효과';record.slides=[{id:'pitem0001',bg:'#141821',items:[
 {id:'eitem0001',t:'text',text:'제목',x:50,y:30,w:60,size:9,color:'#ffffff'},
 {id:'eitem0002',t:'text',text:'둘째 글',x:50,y:55,w:60,size:5,color:'#ffffff'},
 {id:'eitem0003',t:'text',text:'셋째 글',x:50,y:78,w:60,size:5,color:'#ffffff'}]}];await putDesign(record);
window.recordId=record.id;window.getDesign=getDesign;await startMinican({storage:'text-look-item'});await openSavedDesign(record.id);window.ready=true;
</script>`;

test('per text box looks: picked in the text effects panel, ahead of the slide look, none for one box, moving without a slide look, into pictures and video', options, async t => {
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
  const texts = page.locator('.cv-canvas .fe-stage .fi-text');
  const shadows = () => texts.evaluateAll(ns => ns.map(n => n.style.textShadow || ''));
  const slide = async () => page.evaluate(async (id) => (await window.getDesign(id)).slides[0], await page.evaluate(() => window.recordId));
  const until = async (test) => { for (let i = 0; i < 40; i++) { const d = await slide(); if (test(d)) return d; await page.waitForTimeout(250); } assert.fail(JSON.stringify(await slide())); };
  const lit = (sh) => sh.split('rgba').length > 2;

  // 장의 효과가 없는 장: 제목만 골라 불꽃 글자 → 제목만 빛나고, 꾸미기 판에서 순간마다 바뀐다.
  await texts.nth(0).click();
  await page.locator('.fe-bar button').filter({hasText: '효과'}).click();
  assert.equal(await page.locator('[data-item-look]').count(), 39, 'follow the slide · none · 37 looks');
  assert.match(await page.locator('[data-item-look=auto]').innerText(), /장 효과 따르기 · 없음/);
  assert.equal(await page.locator('[data-item-look=auto]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-item-look=fire]').click();
  assert.deepEqual((await until(d => d.items[0].lk === 'fire')).items.map(i => i.lk), ['fire', undefined, undefined]);
  assert.equal((await slide()).look, undefined, 'the slide look is untouched');
  await page.waitForFunction(() => document.querySelector('.cv-canvas .fe-stage .fi-text').style.textShadow.split('rgba').length > 2);
  const a = await shadows();
  assert.ok(lit(a[0]) && !lit(a[1]) && !lit(a[2]), `only the title glows: ${a}`);
  let b = a;
  for (let i = 0; i < 20 && b[0] === a[0]; i++) { await page.waitForTimeout(150); b = await shadows(); }
  assert.notEqual(a[0], b[0], 'the picked look moves in the editor');
  assert.equal(await page.locator('[data-item-look=fire]').getAttribute('aria-pressed'), 'true');

  // 장 전체에 황금빛(바탕색 칸): 둘째 · 셋째도 빛나고, 제목은 따로 고른 불꽃 그대로. 셋째만 "없음".
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.fe-tb.pagebg, [class*="pagebg"]').first().click();
  await page.locator('[data-look-tile=gold]').click();
  await until(d => d.look === 'gold');
  await page.waitForFunction(() => [...document.querySelectorAll('.cv-canvas .fe-stage .fi-text')].every(n => n.style.textShadow.split('rgba').length > 2));
  await page.keyboard.press('Escape');
  await texts.nth(2).click();
  await page.locator('.fe-bar button').filter({hasText: '효과'}).click();
  assert.match(await page.locator('[data-item-look=auto]').innerText(), /장 효과 따르기 · 황금빛/);
  await page.locator('[data-item-look=none]').click();
  assert.deepEqual((await until(d => d.items[2].lk === 'none')).items.map(i => i.lk), ['fire', undefined, 'none']);
  await page.waitForFunction(() => !document.querySelectorAll('.cv-canvas .fe-stage .fi-text')[2].style.textShadow);
  const c = await shadows();
  assert.ok(lit(c[0]) && lit(c[1]) && !lit(c[2]), `title fire, second gold, third none: ${c}`);
  assert.match(c[0], /rgba\(255, 140, 40/, 'the title keeps its fire');
  assert.match(c[1], /rgba\(255, 205, 90/, 'the second follows the slide gold');
  // 장 효과 따르기로 돌리면 그 값이 지워진다.
  await page.locator('[data-item-look=auto]').click();
  assert.deepEqual((await until(d => d.items[2].lk === undefined)).items.map(i => i.lk), ['fire', undefined, undefined]);
  await page.locator('[data-item-look=none]').click();
  await until(d => d.items[2].lk === 'none');

  // 발표: 글상자마다 제 효과.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show .fe-card[data-looks]').waitFor();
  await page.waitForFunction(() => { const ns = [...document.querySelectorAll('.cv-show .fi-text')]; return ns.length === 3 && ns[0].style.textShadow.includes('rgba(255, 140, 40') && ns[1].style.textShadow.split('rgba').length > 2 && !ns[2].style.textShadow; });
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});

  // 그림 · 영상: 장의 효과가 없어도 고른 글상자 둘레만 빛난다.
  const out = await page.evaluate(async () => {
    const {designToCanvas, createFilm} = await import('/src/index.js');
    const design = { id: 'pitem0002', bg: '#141821', items: [
      { id: 'eitem0001', t: 'text', text: '빛나는 글', x: 50, y: 30, w: 60, size: 8, color: '#ffffff', lk: 'fireflies' },
      { id: 'eitem0002', t: 'text', text: '그냥 글', x: 50, y: 70, w: 60, size: 8, color: '#ffffff' }] };
    // 글 바로 위 · 아래(글이 없는 곳)의 밝기 합.
    const halo = (cv, cy) => { const g = cv.getContext('2d'), w = cv.width, h = cv.height; let sum = 0; for (const dy of [-0.11, -0.09, 0.09, 0.11]) { const d = g.getImageData(w * 0.3, h * (cy + dy), w * 0.4, 1).data; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; } return sum; };
    const png = await designToCanvas(design, { width: 640, aspect: 16 / 9 });
    const film = createFilm([design], { width: 640, height: 360, stay: 3 });
    await film.ready(0); film.draw(0, 1000);
    const frame = [halo(film.canvas, 0.3), halo(film.canvas, 0.7)];
    film.close();
    return { png: [halo(png.canvas, 0.3), halo(png.canvas, 0.7)], frame };
  });
  assert.ok(out.png[0] > out.png[1] * 1.1, `the picture glows around the picked box only: ${JSON.stringify(out)}`);
  assert.ok(out.frame[0] > out.frame[1] * 1.1, `the video frame glows around the picked box only: ${JSON.stringify(out)}`);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});
