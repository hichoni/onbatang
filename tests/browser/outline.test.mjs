// Local-only browser contract for 개요로 장 만들기: an outline typed in the dialog becomes titled slides after the current one,
// or fills the current slide when it is empty; Tab indents inside the box. No accounts or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = (ai = '') => `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('outline-fixture');
const seed=newRecord('16:9');seed.name='개요 검수';
seed.slides=[{id:'poutline001',bg:'navy',tr:'fade',items:[{id:'etexta0001',t:'text',text:'우리 반 발표',x:50,y:40,w:60,size:8,color:'#ffffff'}]},
 {id:'poutline002',bg:'#ffffff',items:[]}];
await putDesign(seed);window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'outline-fixture'${ai}});window.ready=true;
</script>`;

async function setup(t, page0 = '/fixture.html') {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html()); }
      // 가이X 를 이어 준 곳처럼: 개요 부탁을 받아 두고, 정해 둔 답을 돌려준다(두 번째 부탁은 개요가 아닌 답).
      if (path === '/fixture-ai.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html(`,activityAuthoring:true,appMaker:{connect:async()=>({label:'가이X 연결됨'}),generate:async(input)=>{(window.asked||=[]).push(input);return window.asked.length===1?{kind:'outline',outline:'좋아요!\\n\\n\\u0060\\u0060\\u0060outline\\n1. **우리 동네 시장**\\n  - 무엇을 파나요\\n  - 누가 일하나요\\n> 사진을 보여 주며\\n2장: 정리\\n\\u0060\\u0060\\u0060'}:{kind:'answer',answer:'무엇을 도와드릴까요?'};}}`)); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`, external = [];
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 800}});
  await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? (external.push(route.request().url()), route.abort()) : route.continue());
  await context.addInitScript(() => { try { localStorage.setItem('onbatang-tour-seen-v1:editor', '1'); localStorage.setItem('onbatang-tour-seen-v1:news-0.45', '1'); } catch {} });
  const page = await context.newPage();
  await page.goto(origin + page0);
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  return {page, external};
}
async function slideMenu(page) {
  const canvas = await page.locator('.cv-canvas').boundingBox(), card = await page.locator('.cv-canvas .fe-stage').boundingBox();
  await page.mouse.click((canvas.x + card.x) / 2, card.y + card.height / 2, {button: 'right'});
  await page.locator('.fe-menu').waitFor();
}
async function saved(page, check) {
  for (let end = Date.now() + 15000; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (check(await page.evaluate(() => window.readSaved()))) return;
  assert.fail('saved record never matched');
}
const tiles = page => page.locator('.cv-slide-list .cv-slide:not(.add)');
const words = slide => slide.items.filter(it => it.t === 'text').map(it => it.text);

test('an outline becomes titled slides after the current one, or fills an empty slide, in its colours and motion', options, async t => {
  const {page, external} = await setup(t);
  // From the slide menu: three slides after the first one.
  await slideMenu(page);
  await page.locator('.fe-menu .fe-mi').filter({hasText: '개요로 장 만들기'}).click();
  const box = page.locator('.cv-outline-box'), input = box.locator('.cv-outline-input'), make = box.locator('[data-outline-make]');
  await input.waitFor();
  assert.equal(await make.isDisabled(), true, 'nothing to make yet');
  await input.fill('물의 순환\n  - 증발\n  - 비\n> 그림을 먼저 보여 줘요\n식물\n  싹\n마무리');
  await page.waitForFunction(() => /지금 장 뒤에 3장/.test(document.querySelector('.cv-outline-box [role=status]').textContent));
  assert.equal(await make.textContent(), '3장 만들기');
  assert.deepEqual(await box.locator('.cv-outline-list li b').allTextContents(), ['물의 순환', '식물', '마무리']);
  await make.click();
  await box.waitFor({state: 'detached'});
  await saved(page, r => r.slides.length === 5);
  let r = await page.evaluate(() => window.readSaved());
  assert.deepEqual(r.slides.map(s => words(s)[0]), ['우리 반 발표', '물의 순환', '식물', '마무리', undefined]);
  assert.deepEqual(words(r.slides[1]), ['물의 순환', '• 증발', '• 비']);
  assert.equal(r.slides[1].notes, '그림을 먼저 보여 줘요');
  assert.deepEqual([r.slides[1].bg, r.slides[1].tr, r.slides[1].items[0].color], ['navy', 'fade', '#ffffff'], 'colours and motion of the current slide');
  assert.equal(await tiles(page).nth(1).getAttribute('class').then(c => /\bon\b/.test(c)), true, 'the first new slide is open');
  // On the empty last slide, from the 틀 panel: the sample fills it (and goes on after it).
  await tiles(page).nth(4).click();
  await page.locator('[data-outline-start]').click();
  await box.locator('[data-outline-sample]').click();
  await page.waitForFunction(() => /비어 있는 지금 장부터/.test(document.querySelector('.cv-outline-box [role=status]').textContent));
  if (process.env.OUTLINE_SHOT) await page.screenshot({path: `${process.env.OUTLINE_SHOT}-dialog.png`});
  // Tab indents the line the caret is on, Shift+Tab takes it back.
  await input.press('Control+End');
  await input.press('Tab');
  assert.match(await input.inputValue(), /\n {2}정리해 볼까요\?$/);
  await input.press('Shift+Tab');
  assert.match(await input.inputValue(), /\n정리해 볼까요\?$/);
  await make.click();
  await saved(page, r => r.slides.length === 7);
  if (process.env.OUTLINE_SHOT) { await tiles(page).nth(4).click(); await page.waitForTimeout(400); await page.screenshot({path: `${process.env.OUTLINE_SHOT}-slide.png`}); }
  r = await page.evaluate(() => window.readSaved());
  assert.deepEqual(r.slides.slice(4).map(s => words(s)[0]), ['식물의 한살이', '물의 순환', '정리해 볼까요?']);
  assert.ok(words(r.slides[4]).includes('◦ 햇빛을 받아 양분을 만들어요'), 'second level line');
  assert.equal(r.slides[4].bg, '#ffffff');
  assert.deepEqual(external, []);
});

test('where 가이X is joined, the outline dialog asks it for an outline by topic and slide count, fills the box and can go back', options, async t => {
  const {page, external} = await setup(t, '/fixture-ai.html');
  await slideMenu(page);
  await page.locator('.fe-menu .fe-mi').filter({hasText: '개요로 장 만들기'}).click();
  const box = page.locator('.cv-outline-box'), input = box.locator('.cv-outline-input'), topic = box.locator('.cv-outline-topic'), ask = box.locator('[data-outline-ask]');
  await topic.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('cv-outline-topic')), true, 'the topic box is ready to type in');
  await ask.click();
  assert.match(await box.locator('.cv-outline-ai [role=status]').textContent(), /3자 넘게/);
  await topic.fill('초등 3학년 사회 — 우리 동네 시장');
  await box.locator('.cv-outline-count').selectOption('4');
  await input.fill('내가 먼저 쓴 개요');
  await ask.click();
  await page.waitForFunction(() => /가이X가 쓴 개요예요/.test(document.querySelector('.cv-outline-ai [role=status]').textContent));
  if (process.env.OUTLINE_SHOT) await page.screenshot({path: `${process.env.OUTLINE_SHOT}-ai.png`});
  assert.deepEqual(await page.evaluate(() => window.asked), [{kind: 'outline', prompt: '초등 3학년 사회 — 우리 동네 시장', slides: 4}]);
  assert.equal(await input.inputValue(), '우리 동네 시장\n  - 무엇을 파나요\n  - 누가 일하나요\n> 사진을 보여 주며\n정리');
  assert.deepEqual(await box.locator('.cv-outline-list li b').allTextContents(), ['우리 동네 시장', '정리']);
  // The earlier outline can come back.
  await box.locator('[data-outline-undo]').click();
  assert.equal(await input.inputValue(), '내가 먼저 쓴 개요');
  // An answer that is not an outline leaves the box as it is.
  await ask.click();
  await page.waitForFunction(() => /개요 모양의 답을 받지 못했어요/.test(document.querySelector('.cv-outline-ai [role=status]').textContent));
  assert.equal(await input.inputValue(), '내가 먼저 쓴 개요');
  assert.deepEqual(external, []);
});

test('without 가이X the outline dialog has no ask box', options, async t => {
  const {page} = await setup(t);
  await slideMenu(page);
  await page.locator('.fe-menu .fe-mi').filter({hasText: '개요로 장 만들기'}).click();
  await page.locator('.cv-outline-input').waitFor();
  assert.equal(await page.locator('.cv-outline-ai').count(), 0);
});
