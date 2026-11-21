// 재생기(보기 · 공유 링크가 쓰는 app/player.js)와 장면 단위로 넘기는 HTML 발표(src/html-presentation.js):
// next() · prev() 가 HTML 의 장면부터 넘기고, 끝 장면에서 다음 장으로 간다. 장면 번호는 onChange 의 cue 로 온다.
// HTML 안을 눌러 넘기거나 그 안에서 키를 눌러도 같은 번호가 된다. 장면 규약이 없는 HTML 은 예전처럼 장 하나다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const deck = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#123;color:#fff}</style><button id="advance">다음</button><p id="cue"></p><script>
let index=0;const cues=Array.from({length:5},(_,i)=>({title:'장면 '+(i+1),notes:''}));
function go(i){index=Math.max(0,Math.min(4,i));document.getElementById('cue').textContent=cues[index].title;dispatchEvent(new Event('onbatang:change'));}
window.onbatangPresentation={getState:()=>({index,total:5,title:cues[index].title,notes:'',cues}),go};
document.getElementById('advance').onclick=()=>go(index+1);
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){window.ownKeys=(window.ownKeys||0)+1;go(index+1);}});go(0);
</script>`;
const plain = '<!doctype html><meta charset="utf-8"><p id="plain">그냥 HTML</p>';
const slides = [
  {id: 'phtmldeck1', web: {html: deck, filename: 'deck.html'}, items: []},
  {id: 'phtmlplain1', web: {html: plain, filename: 'plain.html'}, items: []},
  {id: 'phtmlend1', items: [{id: 'thtmlend1', t: 'text', x: 10, y: 10, w: 50, h: 20, text: '끝'}]},
];
const fixture = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/player.css">
<body style="margin:0"><main id="stage" style="width:960px;height:540px"></main><script type="module">
import {mountPlayer} from '/app/player.js';
window.changes=[];
window.player=mountPlayer(document.getElementById('stage'),{slides:${JSON.stringify(slides).replaceAll('</', '<\\/')},aspect:16/9,onChange:c=>window.changes.push(c)});
window.ready=true;
</script>`;

test('player steps through an HTML deck\'s scenes before the next slide and reports the scene number', {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000}, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
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
  const page = await browser.newPage({viewport: {width: 1000, height: 700}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);
  const last = () => page.evaluate(() => { const c = window.changes.at(-1); return {at: c.at, cue: c.cue && [c.cue.index, c.cue.total, c.cue.title]}; });
  const waitCue = index => page.waitForFunction(i => window.changes.at(-1)?.cue?.index === i, index);
  const inside = () => page.frames().find(f => f.url() === 'about:srcdoc' && f !== page.mainFrame());

  await waitCue(0);
  assert.deepEqual(await last(), {at: 0, cue: [0, 5, '장면 1']});
  const frame = inside();
  assert.equal(await frame.evaluate(() => document.documentElement.dataset.onbatangPresentation), 'connected', 'the HTML knows Onbatang drives it');

  assert.equal(await page.evaluate(() => window.player.next()), true);
  assert.equal(await page.evaluate(() => window.player.next()), true);
  await waitCue(2);
  assert.equal(await frame.locator('#cue').textContent(), '장면 3');
  await page.evaluate(() => window.player.prev());
  await waitCue(1);

  // HTML 안을 누르거나 그 안에서 키를 눌러도 같은 번호가 된다(키는 한 번만 넘긴다).
  // 재생기만 띄운 이 시험에서는 웹 장 위에 덮개가 있어(보기 링크는 덮개를 걷는다) HTML 안에서 직접 누른다.
  await frame.locator('#advance').evaluate(button => button.click());
  await waitCue(2);
  await frame.locator('#advance').evaluate(button => button.focus());
  await page.keyboard.press('ArrowRight');
  await waitCue(3);
  assert.equal(await frame.evaluate(() => window.ownKeys || 0), 0, 'the HTML\'s own key handler does not also move');
  assert.equal(await frame.locator('#cue').textContent(), '장면 4');

  // 바로 가기와 끝 장면 다음은 다음 장.
  await page.evaluate(() => window.player.cue(4));
  await waitCue(4);
  await page.evaluate(() => window.player.next());
  await page.waitForFunction(() => window.changes.at(-1)?.at === 1);
  // 규약이 없는 HTML: 불러온 뒤에는 장 하나로 넘긴다.
  await page.waitForFunction(() => [...document.querySelectorAll('#stage > .fe-card:last-child iframe')].length === 1);
  await page.waitForTimeout(800);
  assert.equal((await last()).cue, null);
  assert.equal(await page.evaluate(() => window.player.next()), true);
  await page.waitForFunction(() => window.changes.at(-1)?.at === 2);
  // 불러오는 HTML 장에서는 누름을 잠깐 붙든다(장면 발표를 건너뛰지 않게). 불러온 뒤에는 바로 앞 장으로.
  await page.evaluate(() => window.player.prev());
  await page.waitForFunction(() => window.changes.at(-1)?.at === 1);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.player.prev());
  await page.waitForFunction(() => window.changes.at(-1)?.at === 0);
  await waitCue(0);
  assert.deepEqual(errors, []);
});
