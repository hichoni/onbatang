// 7일 링크(공용 온바탕 · 누구나): 내려받기의 "링크 공유"가 GBE-AI Lab 회원이 아니어도 링크를 만든다. 두 가지: 보기 링크(재생기 · 고칠 수 없다) · 고치기 링크(사본). 7일 · 20MB · 하루 5개 · 영상은 빠진다고 알리고,
// 바탕 영상 · 올려 둔 사진 목록 없이 파트를 올리고, 1200×630 미리보기 그림을 보내고, 링크는 GBE-AI Lab의 복사 링크 페이지 주소다.
// 다시 열면 그 링크를 보여 주고(다시 올리기는 같은 열쇠로), 지우면 새로 만들게 한다. 하루 개수 · 서버 준비 전 · 기간이 지난 링크는 쉬운 말로 알린다.
// GBE-AI Lab 서버(onbatang_guest_copy_*)는 이 시험의 작은 서버가 흉내 낸다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 180000};
const VIEW = 'abcdef123456', EDIT = 'abcdef654321', TOKENS = {[VIEW]: 'a'.repeat(64), [EDIT]: 'b'.repeat(64)};
const seen = "try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}";
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const host = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName} from '/app/store.js';
${seen}
setStorageName('guest-host');
const record=newRecord('16:9');record.name='우리 반 알림장';record.uploads=['${photo}'];
record.slides=[{id:'p1guest01',bg:'#fde68a',items:[{id:'e1guest01',t:'text',x:50,y:40,w:70,size:9,text:'가을 소풍'}]},{id:'p2guest01',bg:'#ffffff',video:{src:'vguestkey1',dur:3},items:[]}];
await putDesign(record);
await startMinican({storage:'guest-host',copyLink:{url:location.origin+'/sb',key:'test-key'}});
await openSavedDesign(record.id);window.designId=record.id;window.ready=true;
</script>`;
const taker = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';
${seen}
await startMinican({storage:'guest-taker',copyLink:{url:location.origin+'/sb',key:'test-key'}});window.ready=true;
</script>`;

test('7-day links: anyone makes a view link and an edit link, no video, says when they end, reopens, re-sends, removes and explains limits', options, async t => {
  const calls = [], state = {links: {}, fail: null, info: null};
  const reply = (res, status, body) => { res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(body)); };
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/host.html' || path === '/taker.html') { res.setHeader('Content-Type', 'text/html'); return res.end(path === '/host.html' ? host : taker); }
      if (path.startsWith('/sb/rest/v1/rpc/')) {
        let body = ''; for await (const chunk of req) body += chunk;
        const name = path.split('/').pop(), args = JSON.parse(body || '{}');
        calls.push([name, args, req.headers.apikey]);
        if (state.fail) return reply(res, 400, {message: state.fail, code: state.fail === 'PGRST202' ? 'PGRST202' : 'P0001'});
        if (name === 'onbatang_copy_info') return reply(res, 200, state.info);
        const link = state.links[args.p_code], mine = link && !link.removed && args.p_token === TOKENS[args.p_code];
        const out = (l) => ({code: l.code, title: l.title, version: l.version, takes: l.takes, mode: l.mode, expiresAt: '2026-11-01T06:00:00+00:00'});
        if (name === 'onbatang_guest_copy_publish') {
          if (args.p_code) { if (!mine) return reply(res, 400, {message: 'onbatang_copy_not_found'}); link.version++; link.title = args.p_title; return reply(res, 200, out(link)); }
          const mode = args.p_mode === 'view' ? 'view' : 'edit', code = mode === 'view' ? VIEW : EDIT;
          state.links[code] = {code, mode, title: args.p_title, version: 1, takes: 0, records: []};
          return reply(res, 200, {...out(state.links[code]), token: TOKENS[code]});
        }
        if (!mine) return reply(res, 400, {message: 'onbatang_copy_not_found'});
        if (name === 'onbatang_guest_copy_put') { link.records[args.p_n] = args.p_record; return reply(res, 200, out(link)); }
        if (name === 'onbatang_guest_copy_card') { link.card = args.p_card; return reply(res, 200, {code: link.code, card: true}); }
        if (name === 'onbatang_guest_copy_get') return reply(res, 200, {...out(link), takes: 3});
        if (name === 'onbatang_guest_copy_remove') { link.removed = true; return reply(res, 200, null); }
        return reply(res, 404, {message: 'missing'});
      }
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
  const origin = `http://127.0.0.1:${server.address().port}`, errors = [], external = [], played = [];
  const context = await browser.newContext({viewport: {width: 1280, height: 860}, timezoneId: 'Asia/Seoul', locale: 'ko-KR'});
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin});
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin === origin || ['data:', 'blob:', 'about:'].includes(u.protocol)) return route.continue();
    if (u.href.startsWith('https://gbe.ai.kr/onbatang-play.html')) { played.push(u.href); return route.fulfill({contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:,"><title>재생</title>'}); }
    external.push(u.href); return route.abort();
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(origin + '/host.html');
  await page.waitForFunction(() => window.ready);

  // 내려받기 → 링크 공유: 회원만이라는 말 대신 두 가지 링크와 7일 링크의 조건을 알리고, 만들 수 있다.
  const openLink = async () => { await page.locator('.cv-down-btn').click(); await page.locator('.cv-down-format[data-type=link]').click(); await page.locator('[data-download-save]').click(); };
  await page.locator('.cv-down-btn').click(); await page.locator('.cv-down-format[data-type=link]').click();
  const body = await page.locator('.cv-down-body').innerText();
  assert.match(body, /보기 링크: 받은 사람이 발표처럼 그대로 봐요/); assert.match(body, /고치기 링크: 받은 사람의 온바탕에 사본이 생겨/);
  assert.match(body, /7일 동안만 열려요/); assert.match(body, /사진 포함 20MB까지, 하루에 5개까지/);
  assert.match(body, /바탕 영상 1개는 7일 링크에 실리지 않아요/);
  assert.equal(await page.locator('[data-copy-members]').count(), 0);
  const save = page.locator('[data-download-save]');
  assert.equal(await save.isDisabled(), false);
  assert.match(await page.locator('.cv-down-summary').innerText(), /누구나 만드는 7일 링크/);
  await save.click();
  const dialog = page.locator('[data-guest-link]');
  await dialog.waitFor();
  // 처음에는 보기 링크
  assert.equal(await dialog.locator('[data-guest-mode=view]').getAttribute('aria-pressed'), 'true');
  assert.equal(await dialog.locator('[data-guest-title]').inputValue(), '우리 반 알림장');
  assert.match(await dialog.innerText(), /보낼 자료: 2쪽/);
  await dialog.locator('[data-guest-title]').fill('가을 소풍 안내');
  await dialog.locator('[data-guest-create]').click();
  await dialog.locator('[data-guest-url]').waitFor();
  assert.equal(await dialog.locator('[data-guest-url]').innerText(), `https://gbe.ai.kr/onbatang-play.html?c=${VIEW}`, 'a view link opens the player');
  assert.match(await dialog.locator('[data-guest-until]').innerText(), /11월 1일 \(일\) 오후 3:00까지 열려요/);
  assert.match(await dialog.innerText(), /보기 링크를 만들었어요/);
  assert.match(await dialog.innerText(), /바탕 영상 1개는 링크에 실리지 않았어요/);
  assert.deepEqual(calls.map(c => c[0]), ['onbatang_guest_copy_publish', 'onbatang_guest_copy_put', 'onbatang_guest_copy_card']);
  assert.deepEqual(calls[0][1], {p_title: '가을 소풍 안내', p_parts: 1, p_mode: 'view'});
  assert.ok(calls.every(c => c[2] === 'test-key'), 'only the public key goes with the request');
  const sent = state.links[VIEW].records[0];
  assert.equal('uploads' in sent, false, 'the upload list stays home');
  assert.equal(sent.slides.some(s => 'video' in s), false, 'no background video');
  assert.equal(sent.slides[0].items[0].text, '가을 소풍');
  const pixels = await page.evaluate(async b64 => {
    const bmp = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + b64)).blob()), c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    return {size: [bmp.width, bmp.height], badge: [...g.getImageData(1000, 580, 1, 1).data].slice(0, 3), slide: [...g.getImageData(900, 580, 1, 1).data].slice(0, 3)};
  }, state.links[VIEW].card);
  assert.deepEqual(pixels.size, [1200, 630]);
  // 오른쪽 아래 구석에 온바탕 표(흰 알약 위 로고)가 작게 들어 있다. 그 옆은 장의 바탕(노랑)이다.
  assert.ok(pixels.badge.every(v => v > 230), `a white badge: ${pixels.badge}`);
  assert.ok(pixels.slide[2] < 170, `the slide around it: ${pixels.slide}`);

  // 고치기 링크: 따로 만든다(사본 받는 주소)
  calls.length = 0;
  await dialog.locator('[data-guest-mode=edit]').click();
  await dialog.locator('[data-guest-create]').click();
  await dialog.locator('[data-guest-url]').waitFor();
  assert.equal(await dialog.locator('[data-guest-url]').innerText(), `https://gbe.ai.kr/onbatang-copy.html?c=${EDIT}`);
  assert.deepEqual(calls[0][1], {p_title: '우리 반 알림장', p_parts: 1});
  await dialog.locator('[data-guest-copy]').click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `https://gbe.ai.kr/onbatang-copy.html?c=${EDIT}`);

  // 다시 열면 두 링크가 그대로(본 · 받은 횟수와 함께) · 다시 올리기는 같은 링크 · 같은 열쇠
  await page.keyboard.press('Escape'); await dialog.waitFor({state: 'detached'});
  calls.length = 0;
  await openLink(); await dialog.waitFor();
  await dialog.getByText('본 횟수 3').waitFor();
  assert.deepEqual(calls.map(c => [c[0], c[1].p_code, c[1].p_token]), [['onbatang_guest_copy_get', VIEW, TOKENS[VIEW]]]);
  await dialog.locator('[data-guest-mode=edit]').click();
  await dialog.getByText('받은 횟수 3').waitFor();
  await dialog.locator('[data-guest-resend]').click();
  await dialog.getByText('지금 자료로 다시 올렸어요.').waitFor();
  assert.deepEqual(calls.find(c => c[0] === 'onbatang_guest_copy_publish')[1], {p_title: '우리 반 알림장', p_parts: 1, p_code: EDIT, p_token: TOKENS[EDIT]});
  assert.equal(state.links[EDIT].version, 2);

  // 고치기 링크 지우기 → 그 칸만 새로 만드는 칸, 보기 링크는 그대로
  await dialog.locator('[data-guest-remove]').click();
  await dialog.getByText('링크를 지웠어요.').waitFor();
  assert.equal(state.links[EDIT].removed, true);
  await dialog.locator('[data-guest-create]').waitFor();
  await dialog.locator('[data-guest-mode=view]').click();
  assert.equal(await dialog.locator('[data-guest-url]').innerText(), `https://gbe.ai.kr/onbatang-play.html?c=${VIEW}`);

  // 하루 개수 · 서버 준비 전은 쉬운 말로
  await dialog.locator('[data-guest-mode=edit]').click();
  state.fail = 'onbatang_guest_limit';
  await dialog.locator('[data-guest-create]').click();
  await dialog.getByText(/하루에 5개까지 만들 수 있어요/).waitFor();
  state.fail = 'PGRST202';
  await dialog.locator('[data-guest-create]').click();
  await dialog.getByText(/링크 서버가 아직 준비되지 않았어요/).waitFor();
  state.fail = null;

  // 받는 쪽: 7일이 지난 링크는 그렇다고 알리고, 보기 링크는 사본으로 받지 않고 재생 화면으로 보낸다
  state.info = {expired: true, title: '우리 반 알림장', expiresAt: '2026-10-01T00:00:00+00:00', mode: 'edit'};
  const other = await context.newPage(); other.on('pageerror', e => errors.push(e.message));
  await other.goto(`${origin}/taker.html?copy=${EDIT}`);
  await other.waitForFunction(() => /7일이 지나 사라진 링크예요/.test(document.getElementById('toast')?.textContent || ''));
  state.info = {title: '가을 소풍 안내', parts: 1, version: 1, slides: 1, mode: 'view'};
  const viewer = await context.newPage(); viewer.on('pageerror', e => errors.push(e.message));
  await viewer.goto(`${origin}/taker.html?copy=${VIEW}`);
  await viewer.waitForURL(`https://gbe.ai.kr/onbatang-play.html?c=${VIEW}`);
  assert.deepEqual(played, [`https://gbe.ai.kr/onbatang-play.html?c=${VIEW}`]);
  assert.equal(calls.filter(c => c[0] === 'onbatang_copy_part').length, 0, 'a view link is not taken as a copy');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});
