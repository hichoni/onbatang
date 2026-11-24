// 유튜브 자막 '끄기'(기본): 유튜브는 이 브라우저에서 전에 켠 자막을 기억했다가 알아서 켠다.
// 그래서 자막을 고르지 않은 영상은 유튜브가 자막 기능을 불러왔다고 알릴 때 끄는 신호를 보낸다(발표 · 꾸미기 판의 미리 보기).
// 자막을 고른 영상에는 보내지 않는다. 유튜브에는 실제로 접속하지 않고, 같은 신호를 주고받는 가짜 영상 틀을 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName} from '/app/store.js';
try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
setStorageName('yt-cc-fixture');
const record=newRecord('16:9');record.name='자막 수업';record.slides=[{id:'pcc00001',bg:'#ffffff',items:[
  {id:'ecc00001',t:'yt',yt:'dQw4w9WgXcQ',x:5,y:10,w:40,h:40},
  {id:'ecc00002',t:'yt',yt:'aqz-KE-bpKQ',x:55,y:10,w:40,h:40,cc:'ko'}]}];await putDesign(record);
window.recordId=record.id;await startMinican({storage:'yt-cc-fixture'});await openSavedDesign(record.id);window.ready=true;
</script>`;
// 가짜 유튜브 틀: 진짜처럼 '듣는 중' 인사에 답하고, 영상을 틀기 시작하면(틀기 신호 · autoplay) 자막 기능을 불러왔다고 알린다. 받은 신호를 적어 둔다.
const fakePlayer = `<!doctype html><meta charset="utf-8"><script>
window.got=[];let heard=false,loaded=false;
const say=(m)=>parent.postMessage(JSON.stringify({...m,id:1,channel:'widget'}),'*');
const start=()=>{if(loaded)return;loaded=true;say({event:'apiInfoDelivery',info:{namespaces:['captions']}});say({event:'infoDelivery',info:{playerState:1}});};
addEventListener('message',(e)=>{let d;try{d=JSON.parse(e.data)}catch{return}
  if(d.event==='listening'){if(heard)return;heard=true;say({event:'initialDelivery',info:{playerState:-1}});say({event:'onReady'});if(/[?&]autoplay=1/.test(location.search))start();}
  else if(d.event==='command'){window.got.push([d.func,d.args]);if(d.func==='playVideo')start();}});
</script>`;

test("YouTube captions stay off by default: the show and the editor preview tell the player to turn captions off, but not for a video with chosen captions", options, async t => {
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
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // 유튜브의 영상 틀은 가짜로 바꾸고, 그 밖의 바깥 주소(썸네일 등)는 막는다.
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin === origin || ['data:', 'blob:', 'about:'].includes(u.protocol)) return route.continue();
    if (u.origin === 'https://www.youtube-nocookie.com' && u.pathname.startsWith('/embed/')) return route.fulfill({contentType: 'text/html', body: fakePlayer});
    return route.abort();
  });
  const frameOf = async (part) => {
    for (let i = 0; i < 40; i++) { const f = page.frames().find(x => x.url().includes(part)); if (f) return f; await page.waitForTimeout(250); }
    throw Error(`no frame: ${part}`);
  };
  const turnedOff = (got) => got.some(([func, args]) => func === 'setOption' && JSON.stringify(args) === '["captions","track",{}]');
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);

  // 꾸미기 판의 미리 보기: 자막을 고르지 않은 영상은 신호를 받는 주소로 열고 자막을 끈다.
  await page.locator('.cv-canvas .fe-stage .fi-yt').first().dblclick();
  await page.locator('.fe-yt-preview-btn').click();
  assert.match(await page.locator('.fe-yt-preview-frame').getAttribute('src'), /embed\/dQw4w9WgXcQ\?.*enablejsapi=1.*autoplay=1/);
  const preview = await frameOf('/embed/dQw4w9WgXcQ');
  await preview.waitForFunction(() => window.got.length > 0);
  assert.ok(turnedOff(await preview.evaluate(() => window.got)), 'the preview turns captions off');
  await page.locator('.fe-yt-preview-close').click();
  await page.keyboard.press('Escape');

  // 발표: 두 영상을 차례로 튼다(스페이스 바). 자막을 고르지 않은 영상만 끄는 신호를 받는다.
  await page.locator('.cv-show-btn').click();
  await page.locator('.cv-show .fi-yt-frame').first().waitFor({state: 'attached'});   // 틀기 전에는 썸네일에 가려 있다
  const plain = await frameOf('/embed/dQw4w9WgXcQ'), chosen = await frameOf('/embed/aqz-KE-bpKQ');
  assert.doesNotMatch(plain.url(), /cc_load_policy/);
  assert.match(chosen.url(), /cc_load_policy=1&cc_lang_pref=ko/);
  await page.keyboard.press(' ');
  await plain.waitForFunction(() => window.got.some(([func]) => func === 'setOption'));
  const plainGot = await plain.evaluate(() => window.got);
  assert.ok(turnedOff(plainGot), JSON.stringify(plainGot));
  assert.ok(plainGot.findIndex(([f]) => f === 'playVideo') < plainGot.findIndex(([f]) => f === 'setOption'), 'it turns captions off after the video starts loading, when the player listens');
  await page.locator('.cv-show .fi-yt').nth(1).dispatchEvent('click');   // 영상의 덮개를 눌러 튼다
  await chosen.waitForFunction(() => window.got.some(([func]) => func === 'playVideo'));
  await page.waitForTimeout(500);
  const chosenGot = await chosen.evaluate(() => window.got);
  assert.equal(chosenGot.some(([func]) => func === 'setOption'), false, JSON.stringify(chosenGot));
  assert.deepEqual(errors, []);
});
