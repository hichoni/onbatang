// 공용 온바탕의 휴대폰 리모컨: 호스트의 리모컨이 없어도(phoneRemote) 발표 막대에 단추가 있고, 누르면 리모컨 판(GBE-AI Lab 판 대신 시험용 판)을
// 오른쪽 위 작은 창으로 띄운다. 판이 건넨 넘기기로 장이 넘어가고, 장이 바뀌면 판에 지금 장을 알린다. 모르는 신호 · 다른 창의 신호는 버린다.
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
setStorageName('remote-fixture');
const text=(id,t)=>({id,t:'text',text:t,x:50,y:40,w:60,size:6});
const record=newRecord('16:9');record.name='리모컨 수업';record.slides=['첫째','둘째','셋째'].map((t,k)=>({id:'prm0000'+k,bg:'#ffffff',items:[text('erm0000'+k,t+' 장')],notes:t+' 노트'}));await putDesign(record);
await startMinican({storage:'remote-fixture',phoneRemote:{url:location.origin+'/relay.html'}});await openSavedDesign(record.id);window.ready=true;
</script>`;
// 시험용 판: GBE-AI Lab 판과 같은 신호로 답한다(받은 지금 장을 window.seen 에 모은다).
const relay = `<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="panel" style="height:240px">판</div><script>
const p=new URLSearchParams(location.hash.slice(1)),origin=p.get('origin'),channel=p.get('channel');window.seen=[];
const post=(event,more={})=>parent.postMessage({type:'onbatang-remote-relay',channel,event,...more},origin);
addEventListener('message',e=>{const d=e.data;if(e.source!==parent||d?.channel!==channel)return;if(d.action==='open'){window.seen.push(d.state);post('size',{height:260});post('ready');}else if(d.action==='state')window.seen.push(d.state);});
window.send=cmd=>post('cmd',{cmd});window.hide=()=>post('hidden');post('loaded');
</script>`;

test('public 온바탕 phone remote: the show bar button opens the relay panel, its commands turn slides and the slide state goes back', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/fixture.html' || path === '/relay.html') { res.setHeader('Content-Type', 'text/html'); return res.end(path === '/relay.html' ? relay : html); }
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
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-show-btn').click();
  const count = page.locator('.cv-show-count');
  await count.waitFor();
  await page.locator('[data-show-remote]').click();
  const frame = page.locator('iframe.cv-phone-remote');
  await frame.waitFor();
  await page.waitForFunction(() => document.querySelector('iframe.cv-phone-remote')?.style.height === '260px');
  const panel = page.frames().find(f => f.url().includes('/relay.html'));
  assert.ok(panel);
  assert.match(panel.url(), /#origin=http%3A%2F%2F127\.0\.0\.1%3A\d+&channel=[0-9a-f-]{36}$/);
  await panel.waitForFunction(() => window.seen.length >= 1);
  const first = await panel.evaluate(() => window.seen[0]);
  assert.deepEqual([first.at, first.total, first.page, first.next, first.notes], [0, 3, '첫째 장', '둘째 장', '첫째 노트']);
  await panel.evaluate(() => window.send({action: 'next'}));
  await page.waitForFunction(() => document.querySelector('.cv-show-count').textContent.startsWith('2 /'));
  await panel.waitForFunction(() => window.seen.at(-1)?.at === 1);
  await panel.evaluate(() => window.send({action: 'go', at: 2}));
  await page.waitForFunction(() => document.querySelector('.cv-show-count').textContent.startsWith('3 /'));
  // Unknown or out-of-range commands do nothing.
  await panel.evaluate(() => { window.send({action: 'go', at: 9}); window.send({action: 'delete'}); window.send(null); });
  await page.waitForTimeout(300);
  assert.match(await count.textContent(), /^3 \//);
  await panel.evaluate(() => window.send({action: 'prev'}));
  await page.waitForFunction(() => document.querySelector('.cv-show-count').textContent.startsWith('2 /'));
  // The panel can hide itself; the bar button brings it back; ending the show removes it.
  await panel.evaluate(() => window.hide());
  await frame.waitFor({state: 'hidden'});
  await page.locator('[data-show-remote]').click();
  await frame.waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.cv-show').waitFor({state: 'detached'});
  assert.equal(await page.locator('iframe.cv-phone-remote').count(), 0);
  assert.deepEqual(errors, []);
});
