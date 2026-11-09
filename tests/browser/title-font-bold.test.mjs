// 이미 아주 굵은 한 굵기 제목 글꼴(도현 · 주아 · 베이글)에 '굵게'를 켜도 브라우저가 가짜 굵게로 덧그리지 않는다(브라우저).
// 덧그리면 '를' · '틀' · '률'처럼 가로획이 촘촘한 글자의 속이 메워져 검은 덩어리가 된다. 화면(designView)과 그림 내보내기(designToCanvas) 둘 다 본다.
// 다른 글꼴(고운돋움)은 예전처럼 '굵게'가 보이게 남는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const fixture = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><body style="margin:0;background:#fff"><div id="host" style="width:960px"></div><script type="module">
import {configure, cleanDesign} from '/src/model.js';
import {registerFonts} from '/src/fonts.js';
import {designView} from '/src/render.js';
import {designToCanvas} from '/src/export.js';
import {ONBATANG_FONTS} from '/app/fonts.js';
configure({aspect: 16 / 9, fonts: ONBATANG_FONTS});
registerFonts(ONBATANG_FONTS);
const TEXT = '다를까 틀릴 률흘';
const design = (font, bold) => cleanDesign({bg: '#ffffff', items: [{t: 'text', layout: 'slide', id: 'e1', text: TEXT, x: 50, y: 50, w: 90, size: 9, font, bold, color: '#111111', align: 'c'}]});
// 화면: 같은 자리에 그린 장을 하나씩 찍는다(굵게 끔 / 켬)
window.card = (font, bold) => { const host = document.getElementById('host'); const c = designView(design(font, bold)); c.style.setProperty('--fe-ratio', String(16 / 9)); host.replaceChildren(c); return document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
// 그림 내보내기: 픽셀을 문자열로 줄여 돌려준다
window.exported = async (font, bold) => { const out = await designToCanvas(design(font, bold), {width: 640}); const cv = out.canvas || out; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let h = 0, ink = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; if (v < 384) ink++; h = (h * 31 + v) >>> 0; } return {hash: h, ink}; };
window.faces = () => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } }).map((r) => r.cssText).filter((t) => t.startsWith('@font-face'));
window.ready = true;
</script>`;

test('heavy one-weight title fonts are not faux-bolded on screen or in picture export', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch(process.env.MINICAN_CHROMIUM ? {executablePath: process.env.MINICAN_CHROMIUM, headless: true} : {channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1000, height: 700}});
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', r => r.request().url().startsWith(origin + '/') ? r.continue() : r.abort());
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);

  // @font-face: 세 글꼴만 모든 굵기를 한 파일이 맡는다고 알린다
  const faces = await page.evaluate(() => window.faces());
  const ranged = faces.filter(f => /font-weight: 100 900/.test(f)).map(f => f.match(/font-family: "?([\w-]+)/)[1]).sort();
  assert.deepEqual(ranged, ['mc-bagel-fat-one', 'mc-do-hyeon', 'mc-jua']);

  const shot = async (font, bold) => { await page.evaluate(([f, b]) => window.card(f, b), [font, bold]); return page.locator('#host .fi-text').screenshot(); };
  for (const font of ['do-hyeon', 'jua', 'bagel-fat-one']) {
    assert.ok((await shot(font, true)).equals(await shot(font, false)), `${font}: '굵게'를 켜도 화면 글자가 그대로`);
    assert.deepEqual(await page.evaluate(([f]) => window.exported(f, true), [font]), await page.evaluate(([f]) => window.exported(f, false), [font]), `${font}: 내보낸 그림도 그대로`);
  }
  // 다른 글꼴은 예전처럼 '굵게'가 보인다(가짜 굵게라도)
  assert.ok(!(await shot('gowun-dodum', true)).equals(await shot('gowun-dodum', false)), '고운돋움은 굵게가 보인다');
  const thin = await page.evaluate(() => window.exported('gowun-dodum', false)), thick = await page.evaluate(() => window.exported('gowun-dodum', true));
  assert.ok(thick.ink > thin.ink, '고운돋움을 굵게 내보내면 잉크가 늘어난다');
  assert.deepEqual(errors, []);
});
