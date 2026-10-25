// 글자 효과(src/live.js): 움직이는 바탕을 고르면 그 장의 글에 어울리는 빛이 입혀져 꾸미기 판 · 발표에서 순간마다 바뀐다. 37가지 중에서 골라 쓸 수 있고
// (움직이는 바탕이 없는 장도), 없음을 고르면 글은 제 모습(테두리 그대로)으로 돌아온다. 그림에는 멈춘 모습의 빛이, 영상에는 프레임마다 빛이 글 둘레에 들어간다. 바깥 요청은 없다.
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

test('text looks: matched to the moving background or picked from 37, on any slide, off with none, and into pictures and every video frame', options, async t => {
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
  const slide = async () => page.evaluate(async (id) => (await window.getDesign(id)).slides[0], await page.evaluate(() => window.recordId));
  const until = async (test) => { for (let i = 0; i < 40; i++) { const d = await slide(); if (test(d)) return d; await page.waitForTimeout(250); } assert.fail(JSON.stringify(await slide())); };
  const glowing = () => page.waitForFunction(() => (document.querySelector('.cv-canvas .fe-stage .fi-text').style.textShadow || '').split('rgba').length > 2);

  // 레트로 노을을 고르면 글에 바탕에 맞는 네온 빛이 입혀지고(테두리는 그대로), 순간마다 바뀐다.
  await page.locator('.fe-tb.pagebg, [class*="pagebg"]').first().click();
  await page.locator('[data-live-tile=synthwave]').click();
  await page.waitForFunction(() => document.querySelector('.cv-canvas .fe-stage .fi-text').style.textShadow.split('rgba').length > 3);
  const a = await shadow();
  assert.ok(a.startsWith(own), `keeps the outline first: ${a}`);
  assert.match(a, /rgba\((255, (150, 235|60, 190)|170, 245, 255|60, 210, 255), [\d.]+\)/, 'a neon pink or cyan glow');
  let b = a;
  for (let i = 0; i < 20 && b === a; i++) { await page.waitForTimeout(150); b = await shadow(); }
  assert.notEqual(a, b, 'the glow breathes in the editor');
  // 고르는 칸: 없음 · 바탕에 맞게 + 37가지(세 묶음). 바탕에 맞게가 골라져 있다.
  assert.equal(await page.locator('[data-look-tile]').count(), 39);
  assert.equal(await page.locator('[data-look-tile=auto]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('[data-look-tile=auto]').innerText(), /네온사인/);
  assert.notEqual(await page.locator('[data-look-tile=rainbow] .fe-look-sample').evaluate(n => n.style.textShadow), '', 'each tile shows its look');

  // 없음: 저장되고, 글은 제 그림자(테두리)만 남는다.
  await page.locator('[data-look-tile=none]').click();
  assert.deepEqual((await until(d => d.look === 'none')).live, {id: 'synthwave'});
  await page.waitForFunction((own) => document.querySelector('.cv-canvas .fe-stage .fi-text').style.textShadow === own, own);
  assert.equal(await text.evaluate(n => n.style.translate), '');

  // 무지개 빛: 바탕과 상관없이 고른 효과가 들어가고, 빛깔이 바뀌어 간다.
  await page.locator('[data-look-tile=rainbow]').click();
  await until(d => d.look === 'rainbow');
  await glowing();
  const hues = new Set();
  // 가장 진한 빛(첫 겹)의 빛깔: 테두리 뒤에 오는 겹들 중 처음 것.
  for (let i = 0; i < 16; i++) { hues.add((await shadow()).slice(own.length).match(/rgba?\((\d+, \d+, \d+)/)?.[1]); await page.waitForTimeout(200); }
  assert.ok(hues.size >= 3, `rainbow colours change: ${[...hues].join(' / ')}`);

  // 바탕에 맞게로 돌리고 물결을 고르면 글이 살짝 둥실거린다(translate).
  await page.locator('[data-look-tile=auto]').click();
  assert.equal('look' in await until(d => !('look' in d)), false);
  await page.locator('[data-live-tile=waves]').click();
  await until(d => d.live?.id === 'waves');
  await page.waitForFunction(() => /em/.test(document.querySelector('.cv-canvas .fe-stage .fi-text').style.translate));

  // 움직이는 바탕 없이: 바탕을 "없음"으로 하고, 같은 칸에서 통통 튀기 → 불꽃 글자를 고른다.
  await page.locator('[data-live-tile=none]').click();
  await until(d => !d.live);
  assert.equal(await page.locator('[data-look-tile=auto]').count(), 0, 'no "match the background" without one');
  await page.waitForFunction(() => document.querySelector('.cv-canvas .fe-stage .fi-text').style.translate === '');
  await page.locator('[data-look-tile=bounce]').click();
  assert.equal((await until(d => d.look === 'bounce')).live, undefined);
  await page.locator('[data-look-tile=fire]').click();
  await until(d => d.look === 'fire');
  await glowing();

  // 발표: 움직이는 바탕이 없어도 글에 효과가 입혀진다.
  await page.keyboard.press('Escape');
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show .fe-card[data-look=fire]').waitFor();
  await page.waitForFunction(() => (document.querySelector('.cv-show .fi-text')?.style.textShadow || '').split('rgba').length > 3);
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});

  // 그림: 멈춘 모습의 빛이 글 둘레에 있다(끈 것과 다르다). 영상: 켠 것은 글 둘레가 빛나고, 순간마다 빛이 다르다.
  const out = await page.evaluate(async () => {
    const {designToCanvas, createFilm} = await import('/src/index.js');
    const make = (text) => ({ id: 'plook0001', bg: '#0b0d24', live: { id: 'fireflies', ...(text ? {} : { text: false }) }, items: [{ id: 'elook0001', t: 'text', text: '오늘의 하늘', x: 50, y: 50, w: 60, size: 8, color: '#ffffff' }] });
    // 글자 바로 위 · 아래(글이 없는 곳)의 밝기 합: 빛이 퍼지면 밝다.
    const halo = (cv) => { const g = cv.getContext('2d'), w = cv.width, h = cv.height; let sum = 0; for (const y of [0.37, 0.4, 0.6, 0.63]) { const d = g.getImageData(w * 0.3, h * y, w * 0.4, 1).data; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; } return sum; };
    const pngOn = await designToCanvas(make(true), { width: 640, aspect: 16 / 9 }), pngOff = await designToCanvas(make(false), { width: 640, aspect: 16 / 9 });
    const frames = async (design) => { const film = createFilm([design], { width: 640, height: 360, stay: 4 }); await film.ready(0); const r = []; for (const ms of [1000, 2300]) { film.draw(0, ms); r.push(halo(film.canvas)); } film.close(); return r; };
    const plain = (look) => ({ id: 'plook0002', bg: '#141821', ...(look ? { look } : {}), items: [{ id: 'elook0001', t: 'text', text: '오늘의 하늘', x: 50, y: 50, w: 60, size: 8, color: '#ffffff' }] });
    return { png: [halo(pngOn.canvas), halo(pngOff.canvas)], on: await frames(make(true)), off: await frames(make(false)), gold: await frames(plain('gold')), bare: await frames(plain('')) };
  });
  assert.ok(out.png[0] > out.png[1] * 1.08, `the picture has the glow: ${out.png}`);
  assert.ok(out.on[0] > out.off[0] * 1.1 || out.on[1] > out.off[1] * 1.1, `video frames glow: ${JSON.stringify(out)}`);
  assert.notEqual(out.on[0] - out.off[0], out.on[1] - out.off[1], 'the glow differs from moment to moment');
  assert.ok(out.gold[0] > out.bare[0] * 1.08, `a chosen look glows without a moving background: ${JSON.stringify(out)}`);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});
