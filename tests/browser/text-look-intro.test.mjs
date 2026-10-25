// 글자 효과의 나타나는 움직임(src/live.js 의 introAt): 글이 나타날 때 그 효과답게 한 번 움직이고 자리 잡는다.
// 발표: 처음부터 보이는 글은 장이 열리면, 누를 때 나오는 글은 누른 뒤에 한다. 따로 나타나기 효과가 있는 글은 자리 · 크기를 그 효과에 맡긴다.
// 영상: 같은 때에 같은 모습(처음 순간은 아직 흐리고, 다 나온 뒤에는 또렷하다). 꾸미기 판: 효과를 고르면 한 번 보여 준다. 바깥 요청은 없다.
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
setStorageName('text-look-intro');
const record=newRecord('16:9');record.name='나타나는 움직임';record.slides=[{id:'pintr0001',bg:'#141821',items:[
 {id:'eintr0001',t:'text',text:'쾅 찍기',x:50,y:25,w:60,size:8,color:'#ffffff',lk:'pop'},
 {id:'eintr0002',t:'text',text:'따로 나타나기',x:50,y:50,w:60,size:5,color:'#ffffff',lk:'bounce',an:'fade'},
 {id:'eintr0003',t:'text',text:'누르면 켜지는 네온',x:50,y:75,w:60,size:5,color:'#ffffff',lk:'synthwave',aw:true}]}];await putDesign(record);
window.recordId=record.id;window.getDesign=getDesign;await startMinican({storage:'text-look-intro'});await openSavedDesign(record.id);window.ready=true;
</script>`;

test('text look intros: on slide open, on click for click-to-appear text, handed to an own entrance, the same in video, replayed once when picked', options, async t => {
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

  // 꾸미기 판: 효과를 고르면(여기서는 다른 효과로 바꾸면) 그 글이 다시 한 번 나타나는 움직임을 한다.
  const stage = (i) => `.cv-canvas .fe-stage .fi-text >> nth=${i}`;
  await page.locator(stage(0)).click();
  await page.locator('.fe-bar button').filter({hasText: '효과'}).click();
  assert.match(await page.locator('[data-item-look=pop]').getAttribute('title'), /나타날 때 쾅 찍기/);
  await page.locator('[data-item-look=longshadow]').click();
  await page.locator('[data-item-look=pop]').click();
  await page.waitForFunction(() => document.querySelector('.cv-canvas .fe-stage .fi-text').style.scale !== '', null, {timeout: 3000});
  await page.waitForFunction(() => document.querySelector('.cv-canvas .fe-stage .fi-text').style.scale === '' && !document.querySelector('.cv-canvas .fe-stage .fi-text').style.filter);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // 발표: 처음부터 보이는 "쾅 찍기"는 장이 열리면 크게서 찍히고(scale), 다 나오면 제 모습이다.
  await page.locator('.cv-show-btn').click();
  const show = (i) => page.evaluate((i) => { const n = document.querySelectorAll('.cv-show .fi-text')[i]; return n ? { scale: n.style.scale, filter: n.style.filter, translate: n.style.translate } : null; }, i);
  const early = [];
  for (let k = 0; k < 12; k++) { early.push(await show(0)); await page.waitForTimeout(40); }
  assert.ok(early.some((s) => s && s.scale && Number(s.scale) !== 1), `the stamp scales in: ${JSON.stringify(early)}`);
  // 따로 나타나기(fade)가 있는 글: 떨어져 튀는 자리 옮김은 하지 않는다(그 효과에 맡긴다).
  const drops = [];
  for (let k = 0; k < 15; k++) { drops.push(await show(1)); await page.waitForTimeout(50); }
  const ys = drops.map((s) => { const m = /(-?[\d.]+)em\)?\s*$/.exec(s?.translate || ''); return m ? Number(m[1]) : 0; });
  assert.ok(ys.every((y) => y > -0.3), `no bounce drop over its own entrance: ${ys}`);
  await page.waitForTimeout(1200);
  assert.deepEqual([(await show(0)).scale, (await show(0)).filter], ['', ''], 'settled after the intro');
  // 누를 때 나오는 네온: 누르기 전에는 켜지기 전 모습으로 기다리고, 누른 뒤 켜지며 깜빡이고 자리 잡는다.
  assert.match((await show(2)).filter, /opacity\(0\.12\)/, 'the neon waits switched off until the click');
  await page.keyboard.press(' ');
  await page.waitForTimeout(1700);
  assert.equal((await show(2)).filter, '', 'the neon is on after its intro');
  assert.ok((await page.evaluate(() => document.querySelectorAll('.cv-show .fi-text')[2].style.textShadow)).split('rgba').length > 2);
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});

  // 영상: 첫 순간(0.03초)의 황금빛(피어나기)은 아직 흐릿해서 다 나온 뒤(2초)보다 글 자리가 어둡다. 다 나온 뒤는 그림(멈춘 모습)과 거의 같다.
  const out = await page.evaluate(async () => {
    const {createFilm, designToCanvas} = await import('/src/index.js');
    const design = { id: 'pintr0002', bg: '#141821', items: [{ id: 'eintr0001', t: 'text', text: '황금빛', x: 50, y: 50, w: 60, size: 10, color: '#ffffff', lk: 'gold' }] };
    const bright = (cv) => { const d = cv.getContext('2d').getImageData(cv.width * 0.25, cv.height * 0.35, cv.width * 0.5, cv.height * 0.3).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s; };
    const film = createFilm([design], { width: 640, height: 360, stay: 3 });
    await film.ready(0);
    const at = (ms) => { film.draw(0, ms); return bright(film.canvas); };
    const r = { start: at(30), mid: at(300), end: at(2000) };
    film.close();
    r.still = bright((await designToCanvas(design, { width: 640, aspect: 16 / 9 })).canvas);
    return r;
  });
  assert.ok(out.start < out.end * 0.6, `the video starts faint: ${JSON.stringify(out)}`);
  assert.notEqual(out.mid, out.end);
  assert.ok(Math.abs(out.end - out.still) < out.still * 0.15, `settled like the picture: ${JSON.stringify(out)}`);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});
