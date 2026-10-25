// 글자 효과의 사라지는 움직임(src/live.js 의 outroAt · leaveLooks): 다음 장으로 넘기면 효과 글이 그 효과답게 사라진 뒤 넘어간다.
// 사라지는 동안 또 누르면 바로 넘어가고, 그 장에서 끄면(바탕색 · 효과 칸의 "넘길 때 사라지기") 기다리지 않는다. 공유 링크 재생기도 같다.
// 영상: 장이 끝나기 조금 앞에서 사라진다(마지막 장은 그대로). 바깥 요청은 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 150000};
const slides = `[
 {id:'pout00001',bg:'#141821',items:[{id:'eout00001',t:'text',text:'첫째 장',x:50,y:50,w:60,size:8,color:'#ffffff',lk:'bounce'}]},
 {id:'pout00002',bg:'#141821',items:[{id:'eout00002',t:'text',text:'둘째 장',x:50,y:50,w:60,size:8,color:'#ffffff',lk:'gold'}]},
 {id:'pout00003',bg:'#141821',items:[{id:'eout00003',t:'text',text:'셋째 장',x:50,y:50,w:60,size:8,color:'#ffffff'}]}]`;
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName,getDesign} from '/app/store.js';
try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
setStorageName('text-look-outro');
const record=newRecord('16:9');record.name='사라지는 움직임';record.slides=${slides};await putDesign(record);
window.recordId=record.id;window.getDesign=getDesign;await startMinican({storage:'text-look-outro'});await openSavedDesign(record.id);window.ready=true;
</script>`;

test('text look outros: the show waits for the look to leave, a second press skips it, off per slide, the share player too, and video fades before the cut', options, async t => {
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
  const shownText = () => page.evaluate(() => [...document.querySelectorAll('.cv-show .fi-text')].map(n => n.textContent).join('|'));

  // 발표: 첫째 장(통통 튀기)에서 넘기면 바로 넘어가지 않고, 글이 튀어 올라 사라진 뒤 둘째 장이 열린다.
  await page.locator('.cv-show-btn').click();
  await page.waitForFunction(() => document.querySelector('.cv-show .fi-text')?.textContent === '첫째 장');
  await page.waitForTimeout(1500);                      // 나타나는 움직임이 끝나게
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  assert.equal(await shownText(), '첫째 장', 'still on the first slide while it leaves');
  const leaving = await page.evaluate(() => { const n = document.querySelector('.cv-show .fi-text'); return { translate: n.style.translate, filter: n.style.filter }; });
  assert.ok(/-?[\d.]+em/.test(leaving.translate) || leaving.filter, `the text is leaving: ${JSON.stringify(leaving)}`);
  await page.waitForFunction(() => [...document.querySelectorAll('.cv-show .fi-text')].some(n => n.textContent === '둘째 장'), null, {timeout: 3000});
  // 둘째 장(황금빛): 사라지는 동안 또 누르면 기다리지 않고 바로 셋째 장으로.
  await page.waitForTimeout(1500);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(80);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => [...document.querySelectorAll('.cv-show .fi-text')].some(n => n.textContent === '셋째 장'), null, {timeout: 600});
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});

  // 끄기: 첫째 장의 바탕색 칸에서 "넘길 때 사라지기"를 끄면 저장되고, 넘기면 바로 넘어간다.
  await page.locator('.fe-tb.pagebg, [class*="pagebg"]').first().click();
  assert.equal(await page.locator('[data-look-flow=lkout]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-look-flow=lkout]').click();
  for (let i = 0; i < 40; i++) { const d = await page.evaluate(async (id) => (await window.getDesign(id)).slides[0], await page.evaluate(() => window.recordId)); if (d.lkout === false) break; if (i === 39) assert.fail('not saved'); await page.waitForTimeout(250); }
  assert.equal(await page.locator('[data-look-flow=lkout]').getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('Escape');
  await page.locator('.cv-show-btn').click();
  await page.waitForFunction(() => document.querySelector('.cv-show .fi-text')?.textContent === '첫째 장');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => [...document.querySelectorAll('.cv-show .fi-text')].some(n => n.textContent === '둘째 장'), null, {timeout: 600});
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});

  // 공유 링크 재생기: next() 는 사라지는 동안 기다렸다가 넘기고, 그사이 또 next() 하면 바로 넘긴다.
  const player = await page.evaluate(async (slides) => {
    const {mountPlayer} = await import('/app/player.js');
    const stage = document.createElement('div'); stage.style.cssText = 'position:fixed;inset:0;width:800px;height:450px;z-index:99'; document.body.append(stage);
    const p = mountPlayer(stage, { slides });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(1500);
    p.next(); await wait(200); const during = p.at;
    await wait(900); const after = p.at;
    await wait(1500); p.next(); await wait(60); p.next(); const skipped = p.at;
    p.destroy(); stage.remove();
    return { during, after, skipped };
  }, eval(slides));
  assert.deepEqual(player, { during: 0, after: 1, skipped: 2 });

  // 영상: 첫째 장이 끝나기 0.1초 앞에서는 글이 사라졌고(통통 → 튀어 올라 사라지기), 마지막 장은 끝까지 보인다.
  const out = await page.evaluate(async (slides) => {
    const {createFilm, cleanDesign, filmPlan} = await import('/src/index.js');
    const designs = slides.map((s) => cleanDesign(s));
    const plan = filmPlan(designs, { stay: 3 });
    // 글 자리의 밝기에서 바탕(#141821)의 밝기를 뺀 것: 글 · 빛이 있는 만큼.
    const bright = (cv) => { const d = cv.getContext('2d').getImageData(cv.width * 0.2, cv.height * 0.3, cv.width * 0.6, cv.height * 0.4).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2] - 77; return s; };
    const film = createFilm(designs, { width: 640, height: 360, stay: 3 });
    const at = async (n, ms) => { await film.ready(n); film.draw(n, ms); return bright(film.canvas); };
    const r = { mid: await at(0, 1500), end: await at(0, plan.slides[0].ms - 60), lastEnd: await at(2, plan.slides[2].ms - 60), lastMid: await at(2, 1500) };
    film.close();
    return r;
  }, eval(slides));
  assert.ok(out.end < out.mid * 0.35, `the first slide's text has left before the cut: ${JSON.stringify(out)}`);
  assert.ok(Math.abs(out.lastEnd - out.lastMid) < out.lastMid * 0.02, `the last slide keeps its text: ${JSON.stringify(out)}`);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});
