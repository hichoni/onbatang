// 가이랩 계정으로 이어 쓰기(브라우저): 집 컴퓨터에서 그림을 계정에 올리고, 다른(빈) 컴퓨터에서 가져온다.
// 가이랩 연결 창은 다른 주소(localhost)의 시험용 창이 맡는다(계정 보관은 그 서버의 메모리). 바깥 요청은 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const app = (connectUrl) => `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';
try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');localStorage.setItem('onbatang-tour-seen-v1:home','1');}catch{}
await startMinican({storage:'bridge-fixture',accountBridge:{url:${JSON.stringify(connectUrl)}}});window.ready=true;
</script>`;
// 시험용 가이랩 연결 창: 허락을 누르면 ready, list · get · put 은 서버 메모리의 계정 보관함을 쓴다.
const connect = `<!doctype html><meta charset="utf-8"><title>가이랩 계정 연결(시험)</title><button id="ok">허락하고 온바탕에 연결</button><script>
const p=new URLSearchParams(location.hash.slice(1)),origin=p.get('origin'),channel=p.get('channel');
const call=async(path,body)=>(await fetch(path,{method:'POST',body:JSON.stringify(body)})).json();
document.getElementById('ok').onclick=()=>opener.postMessage({type:'onbatang-account',channel,event:'ready'},origin);
addEventListener('message',async e=>{const d=e.data;if(e.origin!==origin||e.source!==opener||d?.type!=='onbatang-account'||d.channel!==channel)return;
 const result=await call('/account/'+d.action,d);opener.postMessage({type:'onbatang-account',channel,request:d.request,event:'result',result},origin);});
</script>`;

test('home → 가이랩 계정에 올리기, then an empty computer takes it from the account and opens it', options, async t => {
  const account = new Map();
  const gai = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/onbatang-account-connect.html') { res.setHeader('Content-Type', 'text/html'); return res.end(connect); }
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    res.setHeader('Content-Type', 'application/json');
    if (path === '/account/list') return res.end(JSON.stringify([...account.values()].map(r => ({id: r.id, name: r.name, updatedAt: r.updatedAt, slides: r.slides.length}))));
    if (path === '/account/get') return res.end(JSON.stringify(body.ids.map(id => account.get(id)).filter(Boolean)));
    if (path === '/account/put') { for (const r of body.records) account.set(r.id, r); return res.end(JSON.stringify({saved: body.records.map(r => r.id), failed: []})); }
    res.writeHead(404); res.end();
  });
  await new Promise(done => gai.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => gai.close(done)));
  const connectUrl = `http://localhost:${gai.address().port}/onbatang-account-connect.html`;
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(app(connectUrl)); }
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
  const errors = [];
  async function computer() {
    const context = await browser.newContext({viewport: {width: 1280, height: 860}});
    const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
    await page.waitForFunction(() => window.ready);
    return {context, page};
  }
  async function link({context, page}) {
    await page.locator('[data-account-bridge]').click();
    const [popup] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', {name: '가이랩 계정 연결', exact: true}).click()]);
    await popup.getByRole('button', {name: '허락하고 온바탕에 연결'}).click();
    await page.getByText('가이랩 계정에 연결했어요.', {exact: true}).waitFor();
    return popup;
  }
  // 집: 그림을 하나 만들고(제목 하나) 첫 화면으로 돌아와 계정에 올린다.
  const home = await computer();
  await home.page.locator('.cv-hero .cv-new-btn').click();
  if (!await home.page.locator('.fe-textadd.title').isVisible()) await home.page.locator('.fe-tab[data-tab="text"]').click();
  await home.page.locator('.fe-textadd.title').click();
  await home.page.locator('.cv-back').click();
  await home.page.locator('[data-account-bridge]').waitFor();
  const homePopup = await link(home);
  await home.page.getByRole('button', {name: '골라서 계정에 올리기', exact: true}).click();
  await home.page.getByText(/1개를 가이랩 계정에 올렸어요/).waitFor();
  assert.equal(account.size, 1);
  const [stored] = account.values();
  assert.equal(stored.slides[0].items.filter(it => it.t === 'text').length, 1);
  await home.page.getByRole('button', {name: '다 했어요 · 연결 끊기', exact: true}).click();
  await home.page.waitForFunction(() => true);
  for (let i = 0; i < 50 && !homePopup.isClosed(); i++) await new Promise(r => setTimeout(r, 100));
  assert.equal(homePopup.isClosed(), true, 'done closes the 가이랩 window');
  // 학교(빈 컴퓨터): 계정에서 가져와 첫 화면에 보이고 연다.
  const school = await computer();
  assert.equal(await school.page.locator('.cv-card, [data-design]').count(), 0);
  await link(school);
  const list = school.page.getByRole('list', {name: '가져올 그림'});
  assert.equal(await list.locator('input[type=checkbox]:checked').count(), 1, 'new drawings are picked by default');
  await school.page.getByRole('button', {name: '골라서 이 기기로 가져오기', exact: true}).click();
  await school.page.getByText(/1개를 이 기기로 가져왔어요/).waitFor();
  assert.equal(await list.locator('input[type=checkbox]:disabled').count(), 1, 'after taking it, the device copy is the same');
  if (process.env.BRIDGE_SHOT) await school.page.screenshot({path: process.env.BRIDGE_SHOT});
  await school.page.getByRole('button', {name: '다 했어요 · 연결 끊기', exact: true}).click();
  const stored2 = await school.page.evaluate(async () => (await import('/app/store.js')).listDesigns());
  assert.deepEqual(stored2.map(r => r.id), [stored.id]);
  assert.deepEqual(errors, []);
});
