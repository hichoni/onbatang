// 올린 HTML 의 2D canvas 는 온바탕이 건드리지 않는다(html-file.js). 0.157.1 은 아이폰에서 붙기 전 · SVG foreignObject 안 canvas 를
// willReadFrequently(가속하지 않음)로 열어 사파리의 그리는 순서를 맞췄지만, 같은 장면이 60fps 에서 17fps 로 떨어져 0.158.0 에서 뺐다.
// 순서가 중요한 canvas 는 작성자가 직접 willReadFrequently 로 연다(그 값은 그대로 간다). 크로미움으로는 순서를 볼 수 없어 문맥 속성을 잰다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const deck = '<!doctype html><svg width="400" height="200" viewBox="0 0 400 200"><foreignObject id="fo" width="400" height="200"></foreignObject><text y="100">front</text></svg>'
  + '<canvas id="plain"></canvas><p id="out"></p><script>'
  + 'const read=c=>!!c.getContextAttributes().willReadFrequently;'
  + 'const detached=document.createElement("canvas").getContext("2d");'
  + 'const later=document.createElement("canvas");document.getElementById("fo").append(later);'
  + 'const own=document.createElement("canvas").getContext("2d",{willReadFrequently:true});'
  + 'const alpha=document.createElement("canvas").getContext("2d",{alpha:false});'
  + 'document.getElementById("out").textContent=JSON.stringify({detached:read(detached),foreign:read(later.getContext("2d")),plain:read(document.getElementById("plain").getContext("2d")),'
  + 'own:read(own),alpha:alpha.getContextAttributes().alpha,ua:navigator.userAgent});</script>';
const fixture = `<!doctype html><meta charset="utf-8"><body><script type="module">
import {htmlFileSource, HTML_FILE_SANDBOX} from '/src/html-file.js';
const f = document.createElement('iframe'); f.sandbox = HTML_FILE_SANDBOX; f.srcdoc = htmlFileSource(${JSON.stringify(deck).replaceAll('</', '<\\/')}); document.body.append(f);
</script>`;

test('uploaded HTML keeps its 2D canvases accelerated on iPhone too, and the author\'s willReadFrequently goes through', {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 60000}, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  // 크로미움은 sandbox iframe 을 따로 띄우고, 처음 스크립트가 돌 때는 페이지에 준 userAgent 가 아직 안 들어가 있다. 아이폰은 브라우저 시작 옵션으로 준다.
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true, args: [`--user-agent=${IPHONE}`]});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  let doc;
  while (!(doc = page.frames().find(f => f.url() === 'about:srcdoc'))) await page.waitForTimeout(50);
  await doc.waitForFunction(() => document.getElementById('out')?.textContent);
  const out = JSON.parse(await doc.evaluate(() => document.getElementById('out').textContent));
  assert.deepEqual(errors, []);
  assert.equal(out.ua, IPHONE, 'the HTML sees the iPhone from its first script');
  assert.deepEqual([out.detached, out.foreign, out.plain], [false, false, false], 'Onbatang leaves canvases accelerated (software canvases cost 60 to 17 fps on an iPhone)');
  assert.equal(out.own, true, 'the author\'s own willReadFrequently goes through');
  assert.equal(out.alpha, false, 'other context options pass through');
});
