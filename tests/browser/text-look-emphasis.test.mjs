// 글자 효과의 강조 움직임(src/live.js 의 emphasisAt): 글상자의 "누를 때 강조하기"를 켜면 움직임 칸의 누를 때 차례에 들고,
// 발표에서 그 차례에 누르면 그 효과답게 한 번 크게 움직였다가 돌아온다(넘기기는 그다음 누름). 영상은 그 차례에 저절로. 바깥 요청은 없다.
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
setStorageName('text-look-emphasis');
const record=newRecord('16:9');record.name='강조 움직임';record.slides=[
 {id:'pem000001',bg:'#141821',items:[{id:'eem000001',t:'text',text:'폴짝 뛰는 글',x:50,y:40,w:60,size:8,color:'#ffffff',lk:'bounce'},{id:'eem000002',t:'text',text:'효과 없는 글',x:50,y:75,w:60,size:5,color:'#ffffff'}]},
 {id:'pem000002',bg:'#141821',items:[{id:'eem000003',t:'text',text:'둘째 장',x:50,y:50,w:60,size:8,color:'#ffffff'}]}];await putDesign(record);
window.recordId=record.id;window.getDesign=getDesign;await startMinican({storage:'text-look-emphasis'});await openSavedDesign(record.id);window.ready=true;
</script>`;

test('text look emphasis: a toggle per text box, a click step in the show, then the next press moves on; in video at its turn', options, async t => {
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
  const fx = () => page.locator('.fe-bar button').filter({hasText: '효과'}).click();

  // 효과 없는 글은 강조를 켤 수 없다.
  await texts.nth(1).click();
  await fx();
  assert.equal(await page.locator('[data-look-em=on]').isDisabled(), true);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  // 효과 있는 글(통통 튀기): "누를 때 강조하기"를 켜면 저장되고, 꾸미기 판에서 한 번 폴짝 뛰어 보인다.
  await texts.nth(0).click();
  await fx();
  assert.match(await page.locator('.fe-poshead', {hasText: '누를 때 강조'}).innerText(), /폴짝 뛰기/);
  await page.locator('[data-look-em=on]').click();
  for (let i = 0; i < 40 && (await slide()).items[0].lkem !== true; i++) await page.waitForTimeout(250);
  assert.equal((await slide()).items[0].lkem, true);
  await page.waitForFunction(() => /-[\d.]+em\s*$/.test(document.querySelector('.cv-canvas .fe-stage .fi-text').style.translate), null, {timeout: 2000});
  // 움직임 칸의 이 장의 차례에 "누름 1 · 강조 · 글자 효과(폴짝 뛰기)"가 든다.
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.locator('.fe-tab[data-tab="motion"]').click();
  assert.match(await page.locator('.fe-timeline').innerText(), /누름 1[\s\S]*강조 · 글자 효과\(폴짝 뛰기\)/);

  // 발표: 첫 누름은 강조(장은 그대로, 글이 위로 뛴다), 다음 누름에 (사라지는 움직임 뒤) 둘째 장.
  await page.locator('.cv-show-btn').click();
  await page.waitForFunction(() => document.querySelector('.cv-show .fi-text')?.textContent === '폴짝 뛰는 글');
  await page.waitForTimeout(1500);
  await page.keyboard.press('ArrowRight');
  const ys = [];
  for (let k = 0; k < 10; k++) { ys.push(await page.evaluate(() => { const m = /(-?[\d.]+)em\s*$/.exec(document.querySelector('.cv-show .fi-text').style.translate || ''); return m ? Number(m[1]) : 0; })); await page.waitForTimeout(40); }
  assert.ok(Math.min(...ys) < -0.3, `the text hops on the click: ${ys}`);
  assert.equal(await page.evaluate(() => document.querySelector('.cv-show .fi-text').textContent), '폴짝 뛰는 글', 'still on the first slide');
  await page.waitForTimeout(1100);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => [...document.querySelectorAll('.cv-show .fi-text')].some(n => n.textContent === '둘째 장'), null, {timeout: 3000});
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});

  // 영상: 강조 차례(누를 때 차례가 저절로 오는 때)에 글이 위로 뛰어, 글 위쪽 띠가 밝아진다.
  const out = await page.evaluate(async () => {
    const {createFilm, cleanDesign, filmPlan, LOOK_EM} = await import('/src/index.js');
    const design = cleanDesign({ id: 'pem000003', bg: '#141821', items: [{ id: 'eem000004', t: 'text', text: '폴짝', x: 50, y: 60, w: 60, size: 10, color: '#ffffff', lk: 'bounce', lkem: true }] });
    const m = filmPlan([design], { stay: 3 }).slides[0].moves.find((v) => v.emphasis === LOOK_EM);
    const band = (cv) => { const d = cv.getContext('2d').getImageData(cv.width * 0.2, cv.height * 0.4, cv.width * 0.6, cv.height * 0.1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2] - 77; return s; };
    const film = createFilm([design], { width: 640, height: 360, stay: 3 });
    await film.ready(0);
    film.draw(0, m.start - 100); const before = band(film.canvas);
    film.draw(0, m.start + 250); const hop = band(film.canvas);
    film.close();
    return { before, hop, start: m.start };
  });
  assert.ok(out.hop > out.before * 1.5 + 1000, `the text hops up in the video: ${JSON.stringify(out)}`);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});
