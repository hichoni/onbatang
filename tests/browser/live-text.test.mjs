// 움직이는 바탕의 글자 효과(src/live.js): 바탕을 고르면 그 장의 글에 어울리는 빛이 입혀져 꾸미기 판 · 발표에서 순간마다 바뀌고,
// 끄면 저장되고 글은 제 모습(테두리 그대로)으로 돌아온다. 그림에는 멈춘 모습의 빛이, 영상에는 프레임마다 빛이 글 둘레에 들어간다. 바깥 요청은 없다.
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
setStorageName('live-text-fixture');
const record=newRecord('16:9');record.name='글자 효과';record.slides=[{id:'plook0001',bg:'#ffffff',items:[{id:'elook0001',t:'text',text:'오늘의 하늘',x:50,y:50,w:60,size:8,color:'#ffffff',stroke:'#000000'}]}];await putDesign(record);
window.recordId=record.id;window.getDesign=getDesign;await startMinican({storage:'live-text-fixture'});await openSavedDesign(record.id);window.ready=true;
</script>`;

test('text looks on moving backgrounds: glow follows the style, changes over time, can be turned off, and goes into pictures and every video frame', options, async t => {
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
  const text = page.locator('.cv-canvas .fe-stage .fi-text');
  const shadow = () => text.evaluate(n => n.style.textShadow);
  const own = await shadow();
  assert.match(own, /rgb\(0, 0, 0\)/, 'the outline is drawn as shadows');
  const saved = async () => (await page.evaluate(async (id) => (await window.getDesign(id)).slides[0], await page.evaluate(() => window.recordId))).live;

  // 레트로 노을을 고르면 글에 네온 빛이 입혀지고(테두리는 그대로), 순간마다 바뀐다.
  await page.locator('.fe-tb.pagebg, [class*="pagebg"]').first().click();
  await page.locator('[data-live-tile=synthwave]').click();
  await page.waitForFunction(() => /em\)?.*rgba\(/.test(document.querySelector('.cv-canvas .fe-stage .fi-text').style.textShadow) && document.querySelector('.cv-canvas .fe-stage .fi-text').style.textShadow.split('rgba').length > 3);
  const a = await shadow();
  assert.ok(a.startsWith(own), `keeps the outline first: ${a}`);
  assert.match(a, /rgba\((255, (150, 235|60, 190)|170, 245, 255|60, 210, 255), [\d.]+\)/, 'a neon pink or cyan glow');
  let b = a;
  for (let i = 0; i < 20 && b === a; i++) { await page.waitForTimeout(150); b = await shadow(); }
  assert.notEqual(a, b, 'the glow breathes in the editor');
  assert.equal(await page.locator('[data-live-text=on]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.fe-poshead', {hasText: '글자 효과'}).innerText(), /네온사인/);

  // 끄기: 저장되고, 글은 제 그림자(테두리)만 남는다. 다시 켜면 돌아온다.
  await page.locator('[data-live-text=off]').click();
  for (let i = 0; i < 40 && (await saved())?.text !== false; i++) await page.waitForTimeout(250);
  assert.deepEqual(await saved(), {id: 'synthwave', text: false});
  await page.waitForFunction((own) => document.querySelector('.cv-canvas .fe-stage .fi-text').style.textShadow === own, own);
  assert.equal(await text.evaluate(n => n.style.translate), '');
  await page.locator('[data-live-text=on]').click();
  for (let i = 0; i < 40 && (await saved())?.text === false; i++) await page.waitForTimeout(250);
  assert.deepEqual(await saved(), {id: 'synthwave'});

  // 물결은 글이 살짝 둥실거린다(translate). 다른 바탕을 고르면 글자 효과는 다시 켜진다.
  await page.locator('[data-live-text=off]').click();
  await page.locator('[data-live-tile=waves]').click();
  for (let i = 0; i < 40 && (await saved())?.id !== 'waves'; i++) await page.waitForTimeout(250);
  assert.deepEqual(await saved(), {id: 'waves'});
  await page.waitForFunction(() => /em/.test(document.querySelector('.cv-canvas .fe-stage .fi-text').style.translate));

  // 발표: 장이 열리면 글에도 빛 · 움직임이 입혀진다.
  await page.locator('[data-live-tile=synthwave]').click();
  await page.keyboard.press('Escape');
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show .fe-card .fe-live-canvas').waitFor();
  await page.waitForFunction(() => (document.querySelector('.cv-show .fi-text')?.style.textShadow || '').split('rgba').length > 3);
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});

  // 그림: 멈춘 모습의 빛이 글 둘레에 있다(끈 것과 다르다). 영상: 켠 것은 글 둘레가 빛나고, 순간마다 빛이 다르다.
  const out = await page.evaluate(async () => {
    const {designToCanvas, createFilm} = await import('/src/index.js');
    const make = (text) => ({ id: 'plook0001', bg: '#0b0d24', live: { id: 'fireflies', ...(text ? {} : { text: false }) }, items: [{ id: 'elook0001', t: 'text', text: '오늘의 하늘', x: 50, y: 50, w: 60, size: 8, color: '#ffffff' }] });
    // 글자 바로 위 · 아래(글이 없는 곳)의 밝기 합: 빛이 퍼지면 밝다.
    const halo = (cv) => { const g = cv.getContext('2d'), w = cv.width, h = cv.height; let sum = 0; for (const y of [0.37, 0.4, 0.6, 0.63]) { const d = g.getImageData(w * 0.3, h * y, w * 0.4, 1).data; for (let i = 0; i < d.length; i += 4) sum += d[i + 1]; } return sum; };
    const pngOn = await designToCanvas(make(true), { width: 640, aspect: 16 / 9 }), pngOff = await designToCanvas(make(false), { width: 640, aspect: 16 / 9 });
    const frames = async (design) => { const film = createFilm([design], { width: 640, height: 360, stay: 4 }); await film.ready(0); const r = []; for (const ms of [1000, 2300]) { film.draw(0, ms); r.push(halo(film.canvas)); } film.close(); return r; };
    return { png: [halo(pngOn.canvas), halo(pngOff.canvas)], on: await frames(make(true)), off: await frames(make(false)) };
  });
  assert.ok(out.png[0] > out.png[1] * 1.15, `the picture has the glow: ${out.png}`);
  assert.ok(out.on[0] > out.off[0] * 1.1 || out.on[1] > out.off[1] * 1.1, `video frames glow: ${JSON.stringify(out)}`);
  assert.notEqual(out.on[0] - out.off[0], out.on[1] - out.off[1], 'the glow differs from moment to moment');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});
