// 내 그림 목록(브라우저): 한 PPT 를 나눠 담은 파트들은 한 칸(PPT · 모두 몇 장 · 파트 몇 개)으로 묶이고, 펼치면 파트 칸이 보인다.
// 거르기(전체 · PPT · 직접 만든 것) · 이름 찾기 · 늘어놓는 차례(최근 고친 · 만든 · 이름)를 고르면 목록이 바뀌고, 고른 것은 기억한다.
// 발표: 아래 막대와 화살표는 마우스를 가만히 두면 사라지고 움직이면 나온다. MINICAN_PLAYWRIGHT_PATH 가 없으면 건너뛴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const fixture = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord,migrateRecord} from '/app/designs.js';import {putDesign,setStorageName} from '/app/store.js';
setStorageName('v73-home');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
const sha='a'.repeat(64),asset='a'+sha.slice(0,24),src={kind:'pptx',sourceDocumentId:'s'+sha.slice(0,24),assetId:asset,filename:'캠프.pptx',sha256:sha};
const part=(n,pages)=>migrateRecord({id:'d'+String(n).repeat(24).slice(0,24),schemaVersion:1,revision:0,name:'메이커 캠프 · '+n,size:{width:1280,height:720,unit:'px'},source:src,assetRefs:[asset],assets:[{id:asset,kind:'source',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',sha256:sha}],
  slides:Array.from({length:pages},(_,k)=>({id:'p'+n+'x'+k+'0000000',bg:'#ffffff',items:[{id:'e'+n+'x'+k+'0000000',t:'text',text:'파트 '+n+' · '+(k+1),x:50,y:50,w:60,size:6}]})),updatedAt:0});
for(const [n,pages] of [[1,2],[2,2],[3,3]])await putDesign(part(n,pages));
const a=newRecord('16:9',1,Date.now()-86400000);a.name='가을 소풍';a.slides=[{items:[{id:'etxt0000001',t:'text',text:'가을',x:50,y:50,w:50,size:6}]},{items:[]}];await putDesign(a);
const b=newRecord('1:1',2,Date.now()-3600000);b.name='나무 관찰';await putDesign(b);
await startMinican({storage:'v73-home'});window.ready=true;
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
const names = (page) => page.locator('.cv-list > .cv-item .cv-item-name').allTextContents();

test('the parts of one PPT are one card; filter, search and sort change the list and are remembered', options, async t => {
  const {page, errors, origin} = await setup(t);
  assert.match(await page.locator('.cv-mine h2').textContent(), /내 그림 3개/);
  const deck = page.locator('.cv-deck');
  assert.equal(await deck.count(), 1);
  assert.equal(await deck.locator('.cv-item-name').textContent(), '메이커 캠프');
  assert.equal(await deck.locator('.cv-pages').textContent(), '7장');
  assert.match(await deck.locator('.cv-item-when').textContent(), /파트 3개/);
  if (process.env.HOME_SHOT) await page.screenshot({path: process.env.HOME_SHOT + '-list.png', fullPage: true});
  // 파트 보기: 그 아래 줄에 파트 칸 셋
  await deck.locator('.cv-deck-parts').click();
  assert.deepEqual(await page.locator('.cv-deck-open .cv-item-name').allTextContents(), ['메이커 캠프 · 1', '메이커 캠프 · 2', '메이커 캠프 · 3']);
  if (process.env.HOME_SHOT) await page.screenshot({path: process.env.HOME_SHOT + '-parts.png', fullPage: true});
  await deck.locator('.cv-deck-parts').click();
  assert.equal(await page.locator('.cv-deck-open').count(), 0);
  // 거르기
  await page.locator('.cv-list-seg [data-home-kind="ppt"]').click();
  assert.deepEqual(await names(page), ['메이커 캠프']);
  await page.locator('.cv-list-seg [data-home-kind="mine"]').click();
  assert.deepEqual(await names(page), ['나무 관찰', '가을 소풍'], 'recently edited first');
  // 이름 순 · 찾기
  await page.locator('.cv-list-sort').selectOption('name');
  assert.deepEqual(await names(page), ['가을 소풍', '나무 관찰']);
  await page.locator('.cv-list-seg [data-home-kind="all"]').click();
  await page.locator('.cv-list-find').fill('나무');
  assert.deepEqual(await names(page), ['나무 관찰']);
  await page.locator('.cv-list-find').fill('없는 이름');
  assert.match(await page.locator('.cv-list-none').textContent(), /맞는 그림이 없어요/);
  await page.locator('.cv-list-find').fill('');
  // 고른 차례는 다시 열어도 그대로(찾는 말은 비운다)
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-list .cv-item').first().waitFor();
  assert.equal(await page.locator('.cv-list-sort').inputValue(), 'name');
  // 묶음 칸을 열면 첫 파트가 열린다
  await page.locator('.cv-deck .cv-item-open').click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  assert.equal(await page.locator('input.cv-name').inputValue(), '메이커 캠프 · 1');
  assert.deepEqual(errors, []);
});

test('the show bar and pointer fade after the mouse rests and come back when it moves', options, async t => {
  const {page, errors} = await setup(t);
  await page.locator('.cv-list > .cv-item', {hasText: '가을 소풍'}).locator('.cv-item-open').click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show').waitFor();
  const opacity = () => page.evaluate(() => getComputedStyle(document.querySelector('.cv-show-bar')).opacity);
  await page.mouse.move(640, 300);
  await page.waitForTimeout(400);
  assert.equal(await opacity(), '1', 'shown while the mouse moves');
  await page.waitForFunction(() => document.querySelector('.cv-show')?.hasAttribute('data-calm'), null, {timeout: 6000});
  await page.waitForTimeout(500);
  assert.equal(await opacity(), '0', 'hidden after the mouse rests');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.cv-show')).cursor), 'none');
  // 리모컨 글쇠로 넘겨도 다시 나오지 않는다
  await page.keyboard.press('ArrowRight');
  assert.ok(await page.evaluate(() => document.querySelector('.cv-show').hasAttribute('data-calm')));
  await page.mouse.move(600, 320);
  await page.waitForFunction(() => !document.querySelector('.cv-show').hasAttribute('data-calm'));
  // 막대 위에 마우스가 있으면 사라지지 않는다
  const box = await page.locator('.cv-show-bar').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(3200);
  assert.equal(await page.evaluate(() => document.querySelector('.cv-show').hasAttribute('data-calm')), false);
  assert.deepEqual(errors, []);
});

// 한도는 칸 수로 센다: 파트가 많은 PPT 하나는 한 칸이라 새 그림을 막지 않고, 직접 만든 그림이 한도만큼 차면 막는다.
const crowd = (parts, mine) => fixture.replace("for(const [n,pages] of [[1,2],[2,2],[3,3]])await putDesign(part(n,pages));",
  `for(let n=1;n<=${parts};n++)await putDesign(migrateRecord({...part(1,1),id:'dp'+String(n).padStart(23,'0'),name:'메이커 캠프 · '+n,slides:[{id:'pp'+String(n).padStart(20,'0'),items:[]}]}));
   for(let n=1;n<=${mine};n++){const r=newRecord('1:1',n+10,Date.now()-n*1000);r.name='내 그림 '+n;await putDesign(r);}`);
test('the design limit counts a many-part PPT as one card', options, async t => {
  const {page, errors} = await setup(t, crowd(70, 3));
  assert.match(await page.locator('.cv-mine h2').textContent(), /내 그림 6개/);
  assert.equal(await page.locator('.cv-hero .cv-new-btn').isDisabled(), false, 'a 70-part PPT does not fill the list');
  assert.equal(await page.locator('.cv-hero-full').count(), 0);
  assert.deepEqual(errors, []);
});
test('sixty cards fill the list and say so', options, async t => {
  const {page, errors} = await setup(t, crowd(0, 58));
  assert.match(await page.locator('.cv-mine h2').textContent(), /내 그림 60개/);
  assert.equal(await page.locator('.cv-hero .cv-new-btn').isDisabled(), true);
  assert.match(await page.locator('.cv-hero-full').textContent(), /60개까지 저장돼요\(PPT 하나는 파트가 여럿이어도 1개\)/);
  assert.deepEqual(errors, []);
});

// "모든 장에 똑같이"(움직임 칸): 여러 파트로 된 PPT 전체 자료이면 다른 파트의 장들에도 전환 효과가 적히고 이 기기에 저장된다.
const deckFixture = fixture.replace("await startMinican({storage:'v73-home'});",
  `const {getDesign}=await import('/app/store.js');const ids=['d'+'1'.repeat(24),'d'+'2'.repeat(24),'d'+'3'.repeat(24)];window.readPart=id=>getDesign(id);window.partIds=ids;
   await startMinican({storage:'v73-home',materialNavigation:{load:async()=>{const documents=[];for(const id of ids)documents.push(await getDesign(id));return {title:'메이커 캠프',documents,materialRef:{id:'mdeck0000000000000000001',documentId:ids[0],revision:0},pageOrder:documents.flatMap(d=>d.slides.map(p=>p.id))};}}});`);
test('motion "same on every slide" reaches the other parts of a whole PPT', options, async t => {
  const {page, errors} = await setup(t, deckFixture);
  await page.locator('.cv-deck .cv-item-open').click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 7);
  await page.locator('.fe-tab[data-tab="motion"]').click();
  await page.locator('[data-group="tr"] [data-motion="zoomblur"]').click();
  const all = page.locator('.fe-motion-all');
  await all.click();
  await all.click();
  await page.waitForFunction(async () => { const parts = await Promise.all(window.partIds.slice(1).map((id) => window.readPart(id))); return parts.every((r) => r.slides.every((p) => p.tr === 'zoomblur')); }, null, {timeout: 10000});
  assert.match(await page.locator('#toast').textContent(), /다른 6장도 맞췄어요\(다른 파트 2개 포함\)/);
  // 다른 파트로 가도 그 효과가 그대로다
  await page.locator('[data-material-page]').nth(6).click();
  await page.waitForFunction(() => document.querySelector('input.cv-name')?.value === '메이커 캠프 · 3');
  assert.equal(await page.locator('[data-group="tr"] .fe-mo.on').getAttribute('data-motion'), 'zoomblur');
  assert.deepEqual(errors, []);
});

test('a whole PPT has its "새 장" button: the new slide lands right after the current one, and a copy too', options, async t => {
  const {page, errors} = await setup(t, deckFixture);
  await page.locator('.cv-deck .cv-item-open').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 7);
  const add = page.locator('[data-material-add]');
  assert.equal(await add.isEnabled(), true);
  // 두 번째 쪽(첫 파트의 끝 장)을 골라 새 장을 더한다 → 3쪽에 빈 장, 그 뒤는 그대로
  await page.locator('[data-material-page="1"]').click();
  await add.click();
  await page.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 8);
  assert.match(await page.locator('[data-material-count]').innerText(), /^3 \/ 8쪽/);
  assert.equal(await page.locator('[data-material-page="2"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.cv-canvas .fe-stage .fi').count(), 0, 'a blank slide');
  // 다음 쪽은 원래 3쪽(둘째 파트의 첫 장)
  await page.locator('[data-material-page="3"]').click();
  await page.waitForFunction(() => document.querySelector('input.cv-name')?.value === '메이커 캠프 · 2');
  assert.match(await page.locator('.cv-canvas .fe-stage').innerText(), /파트 2 · 1/);
  // 오른쪽 누르기 메뉴의 "새 장 더하기"도 켜져 있다
  await page.locator('.cv-canvas').click({button: 'right', position: {x: 6, y: 6}});
  const menuAdd = page.getByRole('menuitem', {name: /새 장 더하기/});
  if (await menuAdd.count()) assert.equal(await menuAdd.isDisabled(), false);
  await page.keyboard.press('Escape');
  // 복제도 그 장 바로 뒤에
  await page.evaluate(() => document.querySelectorAll('.cv-slide-tool')[2].click());   // 오른쪽 누르기 메뉴의 "이 장 복제"가 누르는 단추
  await page.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 9);
  assert.match(await page.locator('[data-material-count]').innerText(), /^5 \/ 9쪽/);
  assert.match(await page.locator('.cv-canvas .fe-stage').innerText(), /파트 2 · 1/);
  assert.deepEqual(errors, []);
});

// 다른 기기에서 계정으로 받아 온 PPT 파트(이 기기에 원본 · 전체 자료가 없다): 호스트의 load 가 null 을 돌려줘도 같은 PPT 의 모든 쪽을 잇는다.
const looseFixture = fixture.replace("await startMinican({storage:'v73-home'});",
  `const {getDesign}=await import('/app/store.js');window.readPart=getDesign;window.partIds=['d'+'1'.repeat(24),'d'+'2'.repeat(24),'d'+'3'.repeat(24)];
   await startMinican({storage:'v73-home',materialNavigation:{load:async()=>null,reorder:async()=>{window.reordered=true;throw Error('no');}}});`);
test('a PPT synced from another device still shows every page; fixed-material actions say why they wait', options, async t => {
  const {page, errors} = await setup(t, looseFixture);
  await page.locator('.cv-deck .cv-item-open').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 7);
  assert.match(await page.locator('#toast').textContent(), /이 기기에는 원본이 없어요/);
  // 다른 파트의 쪽으로 가서 고치면 그 파트에 저장되고, 모든 쪽이 그대로 이어진다.
  await page.locator('[data-material-page="6"]').click();
  await page.waitForFunction(() => document.querySelector('input.cv-name')?.value === '메이커 캠프 · 3');
  await page.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 7);
  await page.locator('[data-material-add]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 8);
  await page.waitForFunction(async () => (await window.readPart(window.partIds[2])).slides.length === 3, null, {timeout: 10000});
  // 쪽 차례 바꾸기는 원본이 있는 기기에서: 막고 알려 준다.
  await page.locator('[data-material-page="7"]').focus(); await page.keyboard.press('Alt+ArrowLeft');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.reordered || false), false);
  assert.deepEqual(errors, []);
});

// 다른 파트의 장으로 넘길 때 계정에 올리기를 기다리지 않는다(이 기기에만 바로 저장하고 넘어간다).
const slowSyncFixture = deckFixture.replace("await startMinican({storage:'v73-home',", "window.pushes=0;await startMinican({storage:'v73-home',sync:{pull:async()=>({records:[],deleted:[]}),push:()=>{window.pushes++;return new Promise(()=>{});},drop:async()=>{}},");
test('moving to a page in another part saves on this device and goes on without waiting for the account', options, async t => {
  const {page, errors} = await setup(t, slowSyncFixture);
  await page.locator('.cv-deck .cv-item-open').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 7);
  await page.locator('.cv-canvas .fe-stage').click({position: {x: 30, y: 30}});
  await page.locator('[data-material-add]').click();          // 고친 것이 있는 채로 넘긴다
  await page.waitForFunction(() => document.querySelectorAll('[data-material-page]').length === 8);
  const started = Date.now();
  await page.locator('[data-material-page="6"]').click();
  await page.waitForFunction(() => document.querySelector('input.cv-name')?.value === '메이커 캠프 · 3', null, {timeout: 4000});
  assert.ok(Date.now() - started < 4000, 'did not wait for the stuck account upload');
  await page.waitForFunction(async () => (await window.readPart(window.partIds[0])).slides.length === 3, null, {timeout: 5000});
  // 다음 장 · 앞 장도 바로바로
  await page.locator('[data-material-page="1"]').click();
  await page.waitForFunction(() => document.querySelector('input.cv-name')?.value === '메이커 캠프 · 1', null, {timeout: 4000});
  assert.deepEqual(errors, []);
});
