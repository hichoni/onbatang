// 글상자 부분 서식(브라우저): 글을 고치며 한 구간을 고르고 도구 막대의 B · 글자 색을 누르면 그 구간만 바뀐다(나머지 글은 그대로).
// Ctrl+B 도 고른 구간에만. 고르지 않고 누르면 글상자 전체. 다시 열어도 그대로이고 발표 화면에도 같은 모양이다. MINICAN_PLAYWRIGHT_PATH 가 없으면 건너뛴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const fixture = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('v74-runs');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
const r=newRecord('16:9');r.name='부분 서식';r.slides=[{items:[{id:'etext0000001',t:'text',text:'[선택] 도전! 우리 가족 아침 걷기'+String.fromCharCode(10)+'아침식사 및 휴식',x:50,y:50,w:80,size:5,color:'#1d2433'}]}];
await putDesign(r);window.readSaved=()=>getDesign(r.id);
await startMinican({storage:'v74-runs'});window.ready=true;
</script>`;

async function setup(t, html = fixture) {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? route.abort() : route.continue());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-list .cv-item').first().waitFor();
  return {page, errors, origin};
}
const saved = (page) => page.evaluate(async () => (await window.readSaved()).slides[0].items[0]);
// 이 기기 저장은 조금 늦게 된다: 저장된 글상자가 조건을 맞출 때까지 기다린다.
async function until(page, check, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) { const item = await saved(page); if (check(item)) return item; if (Date.now() > end) throw Error('not saved: ' + JSON.stringify(item)); await page.waitForTimeout(150); }
}

test('style only the chosen letters from the toolbar and with Ctrl+B, keep them after reopening and in the show', options, async t => {
  const {page, errors} = await setup(t);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  const text = page.locator('.fe-stage .fi-text').first();
  await text.dblclick();
  await page.locator('.fe-stage .fi-text.editing').waitFor();
  // 맨 앞의 "[선택]"(4글자)을 고른다
  await page.keyboard.press('Control+Home');
  for (let k = 0; k < 4; k++) await page.keyboard.press('Shift+ArrowRight');
  await page.locator('.fe-tb.b').click();
  await until(page, (it) => it.runs?.length === 1);
  assert.deepEqual((await saved(page)).runs, [{s: 0, e: 4, b: true}]);
  assert.equal((await saved(page)).bold, false, 'the rest of the box stays normal');
  // 같은 구간에 글자 색(구간은 다시 골라져 있다)
  await page.locator('.fe-tb.color').click();
  await page.locator('.fe-swatches .fe-sw').nth(3).click();
  const picked = await page.locator('.fe-swatches .fe-sw').nth(3).evaluate((n) => getComputedStyle(n).backgroundColor).catch(() => '');
  await until(page, (it) => !!it.runs?.[0]?.c);
  const one = await saved(page);
  assert.equal(one.runs.length, 1); assert.equal(one.runs[0].s, 0); assert.equal(one.runs[0].e, 4); assert.equal(one.runs[0].b, true);
  assert.notEqual(one.runs[0].c, one.color);
  // Ctrl+B: 고친 글의 "아침식사"만
  await page.locator('.fe-stage .fi-text').first().dblclick();
  await page.locator('.fe-stage .fi-text.editing').waitFor();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Home');
  for (let k = 0; k < 4; k++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Control+b');
  await until(page, (it) => it.runs?.length === 2);
  const two = await saved(page);
  assert.equal(two.text.slice(two.runs[1].s, two.runs[1].e), '아침식사');
  assert.equal(two.runs[1].b, true);
  // 쳐 넣은 글은 앞 글자를 따른다: "[선택]" 뒤에 "!" 를 치면 굵은 구간이 늘어난다
  await page.keyboard.press('Control+Home');
  for (let k = 0; k < 4; k++) await page.keyboard.press('ArrowRight');
  await page.keyboard.type('!');
  await page.keyboard.press('Escape');
  await until(page, (it) => it.text.startsWith('[선택]!'));
  assert.deepEqual((await saved(page)).runs.map((r) => [r.s, r.e]), [[0, 5], [22, 26]]);
  // 화면: 굵은 조각은 900, 나머지는 500
  const weights = await page.locator('.fe-stage .fi-text').first().evaluate((n) => [...n.querySelectorAll('.fi-run')].map((s) => [s.textContent, getComputedStyle(s).fontWeight]));
  assert.deepEqual(weights, [['[선택]!', '900'], ['아침식사', '900']]);
  if (process.env.RUNS_SHOT) await page.locator('.cv-canvas').screenshot({path: process.env.RUNS_SHOT + '-editor.png'});
  // 고르지 않고 B 를 누르면 글상자 전체가 굵게(부분 굵게는 지워진다)
  await page.locator('.fe-tb.b').click();
  await until(page, (it) => it.bold === true);
  assert.equal((await saved(page)).runs?.some((r) => 'b' in r) ?? false, false);
  // 발표 화면에도 색 조각이 있다
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show-stage .fi-run').first().waitFor();
  assert.equal(await page.locator('.cv-show-stage .fi-run').first().textContent(), '[선택]!');
  assert.deepEqual(errors, []);
  void picked;
});
