// 장 글의 기본 글꼴 · 자간(브라우저): 장(카드)이 글꼴과 자간을 바깥 화면에서 물려받지 않는다.
// 온바탕 편집기 화면(brand.css)과, 글꼴 · 자간이 전혀 다른 화면(공유 링크처럼 player.css 만 넣은 곳)에 같은 장을 넣어도 글 너비와 줄 수가 같아야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const page = (head, bodyAttrs) => `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css">${head}<body ${bodyAttrs}><div id="host" style="width:1280px"></div><script type="module">
import {designView} from '/src/render.js';
const design={bg:'#152040',items:[{id:'e1',t:'text',text:'함께 만들고 나누기',x:62,y:50,w:21,size:2.5},{id:'e2',t:'text',text:'쉽고 정확한 업무',x:20,y:50,w:21,size:2.5}]};
const card=designView(design);card.style.setProperty('--fe-ratio','1.7778');document.getElementById('host').append(card);
await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
window.measure=[...card.querySelectorAll('.fi-text')].map(n=>{const r=document.createRange();r.selectNodeContents(n);const rects=[...r.getClientRects()].filter(q=>q.width>1);return {lines:new Set(rects.map(q=>Math.round(q.top))).size,width:Math.round(Math.max(...rects.map(q=>q.right))-Math.min(...rects.map(q=>q.left))),family:getComputedStyle(n).fontFamily,spacing:getComputedStyle(n).letterSpacing};});
</script>`;
const PAGES = {
  '/editor-like.html': page('<link rel="stylesheet" href="/app/brand.css">', 'class="mc-app" style="font-family:var(--font)"'),
  '/share-like.html': page('<link rel="stylesheet" href="/app/player.css">', 'style="font-family:Georgia,serif;letter-spacing:.2em"'),
};

test('a slide card keeps its own default font and letter spacing on any host page', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (PAGES[path]) { res.setHeader('Content-Type', 'text/html'); return res.end(PAGES[path]); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch(process.env.MINICAN_CHROMIUM ? {executablePath: process.env.MINICAN_CHROMIUM, headless: true} : {channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const measure = async (path) => { const p = await browser.newPage(); await p.goto(origin + path); await p.waitForFunction(() => window.measure); const m = await p.evaluate(() => window.measure); await p.close(); return m; };
  const editor = await measure('/editor-like.html'), share = await measure('/share-like.html');
  for (const m of [...editor, ...share]) {
    assert.match(m.family, /^"?Onbatang UI"?/, 'the card brings its own font');
    assert.equal(m.lines, 1, 'one line, as in the editor');
  }
  assert.deepEqual(share.map(m => [m.width, m.spacing]), editor.map(m => [m.width, m.spacing]), 'same width and spacing on both pages');
});
