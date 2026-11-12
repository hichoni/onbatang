// Local-only browser contract for the AI-G 도우미 side panel. The AI connection is a stand-in (a fake appMaker):
// a request leaves as text and layout only, the answer is previewed and applied only on a click, and one Ctrl+Z
// takes every changed slide back. The rule-based 움직임 자동 다듬기 works without any connection. No accounts or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const maker = `,appMaker:{connect:async()=>({label:'AI-G 연결됨'}),generate:async(input,{signal,onProgress}={})=>{
 (window.asked||=[]).push(JSON.parse(JSON.stringify(input)));onProgress?.({message:'AI-G가 장을 다듬고 있어요.'});
 if(window.failNext){const text=window.failNext;window.failNext='';throw Error(text);}
 if(window.holdNext){await new Promise((done,stop)=>{window.release=done;signal?.addEventListener('abort',()=>stop(new DOMException('요청을 취소했어요.','AbortError')));});}
 const s=input.slides[0],pick=role=>s.items.find(i=>i.role===role)?.key;
 return {kind:'slides',say:'숫자가 주인공이라 쿵 찍히게 했어요.',receipt:'질문권 1회 사용 · 오늘 9회 남음',ops:[
  {op:'text',item:pick('closing'),text:'다른 점이 분명해야 합니다',why:'짧게'},
  {op:'move',item:pick('number'),an:'stomp',dl:1.5,why:'숫자는 쿵'},
  {op:'move',item:pick('arrow'),lp:'blink'},
  {op:'slide',slide:s.key,tr:'pushup',notes:'손을 들어 물어봅니다.'},
  ...input.slides.slice(1).map(x=>({op:'slide',slide:x.key,tr:'zoomblur'})),
  {op:'move',item:'p9.9',an:'fade'},{op:'move',item:pick('number'),an:'teleport'},{op:'erase',item:pick('title')}]};
}}`;
const html = (ai = '') => `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('assist-fixture');
const T=(id,text,x,y,w,size,o={})=>({id,t:'text',text,x,y,w,size,color:'#121a3a',align:'c',...o});
const seed=newRecord('16:9');seed.name='도우미 검수';
seed.slides=[{id:'passist0001',bg:'#f7f5ef',topic:'1부',items:[
  T('eassist0001','검색, 검색, 검색',50,17,86,5,{align:'l'}),
  T('eassist0002','40 ~ 70%',30,52,30,9),
  {id:'eassist0003',t:'shape',shape:'arrow',x:50,y:52,w:4,h:6,color:'#ffc93c'},
  {id:'eassist0004',t:'image',url:'${PHOTO}',x:74,y:52,w:28,h:34,mask:'none',alt:'특허 검색 화면'},
  T('eassist0005','비슷한 것은 있지만, 내 것만의 다른 점이 분명해야 합니다',50,88,90,2.6,{bold:true})]},
 {id:'passist0002',bg:'navy',topic:'2부',items:[T('eassist0006','둘째 장',50,40,60,8,{color:'#ffffff'})]},
 {id:'passist0003',bg:'#f7f5ef',topic:'2부',items:[T('eassist0007','셋째 장',50,20,80,5),T('eassist0008','25개',50,60,30,9)]}];
await putDesign(seed);window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'assist-fixture'${ai}});window.ready=true;
</script>`;

// 여러 파트로 나뉜 자료(같은 PPT 에서 온 파트 둘, 온바탕 파일의 묶음): 장 목록 띠는 네 장을 한 자료로 보여 준다.
const partsHtml = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('assist-parts');
const page=(id,text,extra={})=>({id,bg:'#f7f5ef',items:[{id:'e'+id.slice(1),t:'text',layout:'slide',text,x:50,y:20,w:80,size:5,color:'#121a3a',align:'c'}],...extra});
const order=['ppartone001','ppartone002','pparttwo001','pparttwo002'];
const part=(id,n,slides)=>({...newRecord('16:9'),id,name:'연수 자료 · '+(n+1),updatedAt:Date.now()-n,slides,source:{kind:'pptx',sourceDocumentId:'sassistdeck0001'},fileDeck:{id:'kassistdeck0001',title:'연수 자료',part:n,parts:2,pageOrder:order}});
await putDesign(part('dassistpart001',0,[page('ppartone001','첫 파트 첫 장',{topic:'여는 말'}),page('ppartone002','첫 파트 둘째 장')]));
await putDesign(part('dassistpart002',1,[page('pparttwo001','둘째 파트 첫 장',{topic:'1부'}),page('pparttwo002','둘째 파트 둘째 장')]));
window.readParts=async()=>[await getDesign('dassistpart001'),await getDesign('dassistpart002')];
await startMinican({storage:'assist-parts'${maker}});window.ready=true;
</script>`;

async function setup(t, page0 = '/fixture-ai.html') {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html()); }
      if (path === '/fixture-ai.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html(maker)); }
      if (path === '/fixture-parts.html') { res.setHeader('Content-Type', 'text/html'); return res.end(partsHtml); }
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
  const origin = `http://127.0.0.1:${server.address().port}`, external = [], errors = [];
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 800}});
  await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? (external.push(route.request().url()), route.abort()) : route.continue());
  await context.addInitScript(() => { try { localStorage.setItem('onbatang-tour-seen-v1:editor', '1'); localStorage.setItem('onbatang-tour-seen-v1:news-0.45', '1'); } catch {} });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(origin + page0);
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  return {page, external, errors};
}
async function saved(page, check) {
  for (let end = Date.now() + 15000; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (check(await page.evaluate(() => window.readSaved()))) return;
  assert.fail('saved record never matched');
}
// What a teacher would call 'the same slides': words, places, motion, notes and topics (the first save also writes default fields, so records are not compared whole).
const core = record => JSON.parse(JSON.stringify(record.slides.map(s => ({id: s.id, bg: s.bg, tr: s.tr, pa: s.pa, notes: s.notes, topic: s.topic,
  items: s.items.map(it => ({id: it.id, text: it.text, x: it.x, y: it.y, w: it.w, an: it.an, dl: it.dl, lp: it.lp, aw: it.aw, em: it.em, runs: it.runs}))}))));
const motion = slide => slide.items.map(it => [it.an, it.dl, it.lp].filter(v => v !== undefined).join('/'));
const shot = async (page, name) => { if (process.env.ASSIST_SHOT) await page.screenshot({path: `${process.env.ASSIST_SHOT}-${name}.png`}); };

test('AI-G polishes the current slide: text and layout go out, the answer is previewed, applied on a click and undone with one Ctrl+Z', options, async t => {
  const {page, external, errors} = await setup(t);
  const before = await page.evaluate(() => window.readSaved());
  const toggle = page.locator('[data-assist-toggle]'), panel = page.locator('.cv-assist');
  assert.equal(await panel.isVisible(), false);
  await toggle.click();
  await panel.locator('.cv-assist-box').waitFor();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.match(await panel.locator('.cv-assist-scope').first().textContent(), /지금 장\(1장\)/);
  const ask = panel.locator('[data-assist-ask]');
  assert.match(await ask.textContent(), /AI-G에게 부탁하기\s*질문권 1회/);
  // What will be sent can be read first: words and places, never the picture.
  await panel.locator('.cv-assist-peek summary').click();
  const peek = await panel.locator('.cv-assist-sent').textContent();
  assert.ok(peek.includes('검색, 검색, 검색') && peek.includes('특허 검색 화면') && !peek.includes('base64'));
  await panel.locator('.cv-assist-wish').fill('6학년이 읽기 쉽게');
  await ask.click();
  const card = panel.locator('[data-assist-card]');
  await card.waitFor();
  const asked = await page.evaluate(() => window.asked);
  assert.equal(asked.length, 1);
  const sent = JSON.stringify(asked[0]);
  assert.ok(!sent.includes('base64') && !sent.includes('data:image'), 'no picture data in the request');
  assert.deepEqual([asked[0].kind, asked[0].task, asked[0].want, asked[0].prompt, asked[0].slides.length, asked[0].deck.count], ['slides', 'polish', ['text', 'motion', 'notes'], '6학년이 읽기 쉽게', 1, 3]);
  assert.deepEqual(asked[0].slides[0].items.map(i => i.role), ['title', 'number', 'arrow', 'photo', 'closing']);
  assert.deepEqual(asked[0].around, [{no: 2, title: '둘째 장'}]);
  assert.ok(asked[0].catalog.enter.some(([id]) => id === 'stomp'));
  // The preview: what would change, in words, with small before and after pictures. Nothing is changed yet.
  assert.equal(await card.locator('.cv-assist-count').textContent(), '바꿀 것 4가지 · 1장');
  assert.deepEqual(await card.locator('.cv-assist-lines li span').allTextContents(), [
    '글: "비슷한 것은 있지만, 내 것만의 다른 점이 분명해야…" → "다른 점이 분명해야 합니다"',
    '"40 ~ 70%": 나타나기 ‘쿵 찍기’ · 1.5초 늦게',
    '도형: 화살표: 계속 ‘반짝반짝’',
    '전환: 위로 밀기 · 발표자 노트: "손을 들어 물어봅니다."',
  ]);
  assert.equal(await card.locator('.cv-assist-pair .fe-card').count(), 2);
  assert.match(await card.locator('.cv-assist-note').textContent(), /지시 3개는 온바탕이 쓸 수 없는 것이라 뺐어요/);
  assert.match(await card.locator('.cv-assist-tail').textContent(), /질문권 1회 사용/);
  assert.equal(await card.locator('.cv-assist-actions').textContent(), '움직임 보기적용버리기질문권 1회 사용 · 오늘 9회 남음');
  assert.equal(await panel.locator('.cv-assist-bubble.me').textContent(), '1장 · 글 · 움직임 · 발표자 노트\n6학년이 읽기 쉽게');
  await shot(page, 'preview');
  await page.waitForTimeout(1200);
  assert.deepEqual(core(await page.evaluate(() => window.readSaved())), core(before), 'only a preview so far');
  // Leave the text as it is, take the rest.
  await card.locator('[data-assist-line="0"]').uncheck();
  assert.equal(await card.locator('.cv-assist-count').textContent(), '바꿀 것 3가지 · 1장');
  await card.locator('[data-assist-play]').click();
  await card.locator('[data-assist-apply]').click();
  assert.equal(await card.getAttribute('data-state'), 'applied');
  await saved(page, r => r.slides[0].tr === 'pushup');
  let r = await page.evaluate(() => window.readSaved());
  assert.deepEqual(motion(r.slides[0]), ['', 'stomp/1.5', 'blink', '', '']);
  assert.deepEqual([r.slides[0].notes, r.slides[0].items[4].text, r.slides[0].topic], ['손을 들어 물어봅니다.', before.slides[0].items[4].text, '1부']);
  assert.deepEqual(core(r).slice(1), core(before).slice(1), 'other slides untouched');
  await shot(page, 'applied');
  // One Ctrl+Z from the panel takes all of it back; Ctrl+Y puts it on again.
  await page.keyboard.press('Control+z');
  await saved(page, s => !s.slides[0].tr);
  assert.deepEqual(core(await page.evaluate(() => window.readSaved())), core(before));
  await page.keyboard.press('Control+y');
  await saved(page, s => s.slides[0].tr === 'pushup' && s.slides[0].items[1].an === 'stomp');
  // The card's own 되돌리기 does the same while that change is still the last thing done.
  await card.locator('[data-assist-undo]').click();
  await saved(page, s => !s.slides[0].tr);
  assert.equal(await card.getAttribute('data-state'), 'undone');
  assert.deepEqual(core(await page.evaluate(() => window.readSaved())), core(before));
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});

test('several chosen slides go in one request and come back as one undo step; a failed or stopped request changes nothing', options, async t => {
  const {page, errors} = await setup(t);
  const before = await page.evaluate(() => window.readSaved());
  await page.locator('[data-assist-toggle]').click();
  const panel = page.locator('.cv-assist');
  await panel.locator('input[value="pick"]').check();
  await panel.locator('[data-assist-pick="1"]').check();
  await panel.locator('[data-assist-pick="2"]').check();
  assert.match(await panel.locator('.cv-assist-pick-count').textContent(), /^3장 고름/);
  await panel.locator('[data-assist-want="text"]').click();
  await panel.locator('[data-assist-ask]').click();
  const card = panel.locator('[data-assist-card]').last();
  await card.waitFor();
  const asked = await page.evaluate(() => window.asked);
  assert.deepEqual([asked[0].slides.map(s => s.no), asked[0].want, asked[0].around], [[1, 2, 3], ['motion', 'notes'], []]);
  assert.equal(await card.locator('.cv-assist-count').textContent(), '바꿀 것 6가지 · 3장');
  await card.locator('[data-assist-apply]').click();
  await saved(page, r => r.slides[2].tr === 'zoomblur' && r.slides[0].items[1].an === 'stomp');
  let r = await page.evaluate(() => window.readSaved());
  assert.deepEqual(r.slides.map(s => s.tr), ['pushup', 'zoomblur', 'zoomblur']);
  assert.equal(r.slides[0].items[4].text, '다른 점이 분명해야 합니다');
  await page.keyboard.press('Control+z');
  await saved(page, s => s.slides.every(x => !x.tr));
  assert.deepEqual(core(await page.evaluate(() => window.readSaved())), core(before), 'three slides back with one undo');
  // The server says no (out of tickets): the words are shown, nothing changes.
  await page.evaluate(() => { window.failNext = '오늘의 제작 한도에 도달했어요.'; });
  await panel.locator('[data-assist-ask]').click();
  await panel.locator('.cv-assist-bubble.note').filter({hasText: '오늘의 제작 한도에 도달했어요.'}).waitFor();
  assert.equal(await panel.locator('[data-assist-card][data-state="ready"]').count(), 0);
  // Stopping while waiting.
  await page.evaluate(() => { window.holdNext = true; });
  await panel.locator('[data-assist-ask]').click();
  await page.waitForFunction(() => /그만두기/.test(document.querySelector('[data-assist-ask]').textContent));
  await panel.locator('[data-assist-ask]').click();
  await panel.locator('.cv-assist-bubble.note').filter({hasText: '부탁을 그만뒀어요'}).waitFor();
  assert.match(await panel.locator('[data-assist-ask]').textContent(), /AI-G에게 부탁하기/);
  await page.waitForTimeout(800);
  assert.deepEqual(core(await page.evaluate(() => window.readSaved())), core(before));
  assert.deepEqual(errors, []);
});

test('without an AI connection the panel still polishes motion by rule, for the whole deck, with the same preview and undo', options, async t => {
  const {page, external, errors} = await setup(t, '/fixture.html');
  const before = await page.evaluate(() => window.readSaved());
  await page.locator('[data-assist-toggle]').click();
  const panel = page.locator('.cv-assist');
  await panel.locator('[data-assist-no-ai]').waitFor();
  assert.equal(await panel.locator('[data-assist-ask]').count(), 0, 'no AI button where no connection was given');
  await panel.locator('.cv-assist-select').selectOption('all');
  await panel.locator('[data-assist-polish]').click();
  const card = panel.locator('[data-assist-card]');
  await card.waitFor();
  assert.match(await card.locator('.cv-assist-count').textContent(), /^바꿀 것 \d+가지 · 3장$/);
  assert.equal(await card.locator('.cv-assist-change').count(), 3);
  assert.equal(await card.locator('.cv-assist-actions').textContent(), '움직임 보기적용버리기', 'only the buttons: no stray text where a receipt would be');
  await shot(page, 'polish');
  await card.locator('[data-assist-apply]').click();
  await saved(page, r => r.slides[0].items[1].an === 'stomp');
  const r = await page.evaluate(() => window.readSaved());
  assert.deepEqual(motion(r.slides[0]), ['blur', 'stomp/0.4', 'blink', '', '']);
  assert.deepEqual([r.slides[1].tr, r.slides[2].tr, r.slides[2].items[1].an], ['zoomblur', undefined, 'stomp']);
  // Again: nothing left to do.
  await panel.locator('[data-assist-polish]').click();
  await panel.locator('.cv-assist-bubble.ai').filter({hasText: '더 입힐 움직임이 없어요'}).waitFor();
  await page.keyboard.press('Control+z');
  await saved(page, s => !s.slides[0].items[1].an);
  assert.deepEqual(core(await page.evaluate(() => window.readSaved())), core(before));
  // The panel closes with its button and gives the properties column back.
  await panel.locator('.cv-assist-close').click();
  assert.equal(await panel.isVisible(), false);
  assert.equal(await page.locator('[data-assist-toggle]').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});

test('a deck in several parts is one deck to the helper: every slide can be chosen, parts change together and come back with one undo', options, async t => {
  const {page, errors} = await setup(t, '/fixture-parts.html');
  const parts = () => page.evaluate(() => window.readParts());
  const look = list => list.map(r => r.slides.map(s => [s.items[0].text, s.tr || '', s.notes || '']));
  const before = look(await parts());
  await page.waitForFunction(() => document.querySelectorAll('.cv-slide-list .cv-slide:not(.add)').length === 4);   // the rail shows both parts
  await page.locator('[data-assist-toggle]').click();
  const panel = page.locator('.cv-assist');
  await panel.locator('input[value="pick"]').check();
  assert.deepEqual(await panel.locator('.cv-assist-pick span').allTextContents(), ['1장 (지금)', '2장', '3장', '4장'], 'the slides of the other part are listed too');
  for (const i of [1, 2, 3]) await panel.locator(`[data-assist-pick="${i}"]`).check();
  assert.match(await panel.locator('.cv-assist-pick-count').textContent(), /^4장 고름/);
  await panel.locator('[data-assist-ask]').click();
  const card = panel.locator('[data-assist-card]');
  await card.waitFor();
  const asked = await page.evaluate(() => window.asked);
  assert.deepEqual(asked[0].slides.map(s => [s.no, s.items[0].text]), [[1, '첫 파트 첫 장'], [2, '첫 파트 둘째 장'], [3, '둘째 파트 첫 장'], [4, '둘째 파트 둘째 장']]);
  assert.equal(asked[0].deck.count, 4);
  assert.equal(await card.locator('.cv-assist-count').textContent(), '바꿀 것 4가지 · 4장');
  await card.locator('[data-assist-apply]').click();
  await page.waitForFunction(() => document.querySelector('[data-assist-card]').dataset.state === 'applied');
  for (let end = Date.now() + 15000; ; await new Promise(r => setTimeout(r, 200))) {
    const now = look(await parts());
    if (now.flat().every(row => row[1])) break;
    assert.ok(Date.now() < end, 'both parts are saved with the change');
  }
  assert.deepEqual(look(await parts()).map(p => p.map(row => row[1])), [['pushup', 'zoomblur'], ['zoomblur', 'zoomblur']]);
  assert.equal(look(await parts())[0][0][2], '손을 들어 물어봅니다.');
  // One Ctrl+Z: the open part and the stored part both go back.
  await page.keyboard.press('Control+z');
  for (let end = Date.now() + 15000; ; await new Promise(r => setTimeout(r, 200))) {
    if (JSON.stringify(look(await parts())) === JSON.stringify(before)) break;
    assert.ok(Date.now() < end, 'one undo takes both parts back');
  }
  // And again forward, then the rule-based polish over the whole deck reaches the other part as well.
  await page.keyboard.press('Control+y');
  for (let end = Date.now() + 15000; ; await new Promise(r => setTimeout(r, 200))) {
    if (look(await parts()).flat().every(row => row[1])) break;
    assert.ok(Date.now() < end, 'redo puts both parts on again');
  }
  await page.keyboard.press('Control+z');
  for (let end = Date.now() + 15000; ; await new Promise(r => setTimeout(r, 200))) {
    if (JSON.stringify(look(await parts())) === JSON.stringify(before)) break;
    assert.ok(Date.now() < end);
  }
  await panel.locator('.cv-assist-select').selectOption('all');
  await panel.locator('[data-assist-polish]').click();
  const polish = panel.locator('[data-assist-card]').last();
  await polish.waitFor();
  assert.match(await polish.locator('.cv-assist-count').textContent(), /· 4장$/);
  await polish.locator('[data-assist-apply]').click();
  for (let end = Date.now() + 15000; ; await new Promise(r => setTimeout(r, 200))) {
    const now = await parts();
    if (now.every(r => r.slides.every(s => s.items[0].an === 'blur'))) break;
    assert.ok(Date.now() < end, 'titles in both parts get their entrance');
  }
  assert.deepEqual(errors, []);
});
