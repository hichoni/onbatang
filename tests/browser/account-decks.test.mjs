// 온바탕 파일로 연 여러 파트 자료는 계정을 거쳐 다른 기기에서도 한 자료로 묶인다(예전에는 처음 연 기기의 localStorage 에만
// 묶음이 있어 다른 기기에서는 파트마다 따로 보였다). 예전에 연 묶음은 다음 맞추기 때 파트 기록에 적어 계정에 올린다.
// 새 기기는 계정의 그림을 몇 개씩 함께 받으며 몇 개째인지 알린다.
// 기기마다 저장소 이름을 달리 하고, 계정은 같은 출처의 localStorage 로 흉내 낸다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 180000};
const cloud = `export function fakeSync({delay=0}={}){
 const read=()=>JSON.parse(localStorage.getItem('fake-cloud')||'{}'),write=v=>localStorage.setItem('fake-cloud',JSON.stringify(v));
 window.pushed=[];window.loads=0;
 return {pull:async()=>({records:Object.values(read()),deleted:[]}),
  push:async r=>{const c=read();c[r.id]=JSON.parse(JSON.stringify(r));write(c);window.pushed.push(r.id);},
  drop:async id=>{const c=read();delete c[id];write(c);},
  load:async r=>{if(delay)await new Promise(ok=>setTimeout(ok,delay));window.loads++;return r;}};
}
export function parts(title,n,at){
 return Array.from({length:n},(_,i)=>({id:'d'+(at+i).toString(16).padStart(24,'0'),schemaVersion:1,name:title+' · '+(i+1),ratio:'16:9',
  slides:[{id:'p'+(at+i).toString(16).padStart(10,'0'),bg:'paper',items:[{id:'e'+(at+i).toString(16).padStart(10,'0'),t:'text',x:50,y:50,w:60,size:6,text:title+' '+(i+1)}]}],updatedAt:1792900000000+i}));
}`;
const head = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {setStorageName,putDesign} from '/app/store.js';import {packOnbatang} from '/app/onbatang-file.js';import {fakeSync,parts} from '/cloud.js';
import {markTourSeen,NEWS_KEY} from '/app/tour.js';for(const n of ['home','editor',NEWS_KEY])markTourSeen(n);
const q=new URLSearchParams(location.search),storage=q.get('s');`;
const pages = {
  '/cloud.js': cloud,
  // 계정이 있는 기기. ?delay= 이면 계정의 그림 하나를 받는 데 그만큼 걸린다.
  '/device.html': `${head}
window.deckFile=await packOnbatang({title:'발명 수업',records:parts('발명 수업',2,0x1000),deck:{title:'발명 수업'},app:'test'});
await startMinican({storage,sync:fakeSync({delay:Number(q.get('delay')||0)})});window.ready=true;</script>`,
  // 0.141.0 전 기기: 묶음이 그 기기의 localStorage 에만 있고 파트 기록에는 없다. 계정 없이 먼저 적어 둔다.
  '/legacy-seed.html': `${head}
setStorageName(storage);const old=parts('옛 연수',2,0x2000);for(const r of old)await putDesign(r);
localStorage.setItem('onbatang-file-decks-v1:'+storage,JSON.stringify([{id:'f'+old[0].id,title:'옛 연수',documents:old.map(r=>r.id),createdAt:1}]));
window.ready=true;</script>`,
};

test('a multi-part deck opened from a file shows as one deck on another device, old decks are shared on the next sync, and a new device pulls several at once', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (pages[path]) { res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html'); return res.end(pages[path]); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const page = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const open = async (path) => { await page.goto(origin + path); await page.waitForFunction(() => window.ready); };
  const cloudRecords = () => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('fake-cloud') || '{}')));
  const decks = () => page.locator('.cv-home .cv-deck');

  // 1. 기기 A: 두 파트 온바탕 파일을 연다 → 파트 기록마다 묶음이 적혀 계정에 올라간다.
  await open('/device.html?s=deck-a');
  await page.locator('[data-onbatang-file-open]:not([disabled])').waitFor({state: 'attached'});
  await page.evaluate(() => { const input = document.querySelector('[data-onbatang-file-input]'), dt = new DataTransfer(); dt.items.add(new File([window.deckFile], '발명 수업.onbatang')); input.files = dt.files; input.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.pushed.length >= 2, null, {timeout: 20000});
  const sent = await cloudRecords();
  assert.deepEqual(sent.map(r => [r.name, r.fileDeck?.part, r.fileDeck?.parts, r.fileDeck?.title]).sort(), [['발명 수업 · 1', 0, 2, '발명 수업'], ['발명 수업 · 2', 1, 2, '발명 수업']]);
  assert.equal(new Set(sent.map(r => r.fileDeck.id)).size, 1);

  // 2. 기기 B(새 기기): 계정에서 받으면 한 자료(파트 2개)로 보인다.
  await open('/device.html?s=deck-b');
  await page.locator('.cv-account-text').filter({hasText: '내 계정에 저장돼요'}).waitFor();
  await decks().first().waitFor();
  assert.equal(await decks().count(), 1);
  assert.match(await decks().first().innerText(), /발명 수업/);
  assert.equal(await page.locator('.cv-home .cv-item:not(.cv-deck)').filter({hasText: '발명 수업 · 1'}).count(), 0, '파트가 따로 보이지 않는다');

  // 3. 예전 기기 C: 묶음이 localStorage 에만 있던 파트들 → 계정과 맞추면 파트 기록에 묶음을 적어 올린다(고친 때는 1ms 만 늦춘다).
  await open('/legacy-seed.html?s=deck-c');
  await open('/device.html?s=deck-c');
  // 맞추기가 먼저 이 기기에만 있던 두 파트를 올리고, 그 뒤 묶음을 적은 판을 올리기 줄로 올린다.
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('fake-cloud') || '{}')).filter(r => r.fileDeck?.title === '옛 연수').length === 2, null, {timeout: 20000});
  const old = (await cloudRecords()).filter(r => r.name.startsWith('옛 연수'));
  assert.deepEqual(old.map(r => [r.fileDeck?.part, r.fileDeck?.parts, r.fileDeck?.title, r.updatedAt]).sort(), [[0, 2, '옛 연수', 1792900000001], [1, 2, '옛 연수', 1792900000002]]);

  // 4. 새 기기 D: 계정의 그림 4개(두 묶음)를 함께 받으며 몇 개째인지 알리고, 두 묶음 모두 한 자료로 보인다.
  await open('/device.html?s=deck-d&delay=600');
  await page.waitForFunction(() => /계정에서 그림을 받는 중이에요 \(\d\/4\)/.test(document.querySelector('.cv-account-text')?.textContent || ''), null, {timeout: 5000});
  await page.locator('.cv-account-text').filter({hasText: '내 계정에 저장돼요'}).waitFor();
  assert.ok(await page.evaluate(() => window.loads) === 4);
  await page.waitForFunction(() => document.querySelectorAll('.cv-home .cv-deck').length === 2);
  assert.deepEqual((await decks().allInnerTexts()).map(t => /발명 수업/.test(t) ? '발명' : /옛 연수/.test(t) ? '옛' : t).sort(), ['발명', '옛']);
  assert.deepEqual(errors, []);
});
