// Local-only playable fixture: real morph/idle runtime and JSON save/reopen. No account/network service.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = { skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 90000 };
const fixture = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>움직임 묶음 검수</title>
<link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/player.css"><link rel="stylesheet" href="/app/app.css">
<style>body{margin:20px;background:#dfe8e5;font:16px sans-serif}#stage{width:960px;max-width:95vw}button,select{font:inherit;padding:12px;margin:4px}</style>
<select id="set" aria-label="움직임 묶음"></select><button id="prev">앞 장</button><button id="next">다음 장</button><button id="save">예시 수정·저장</button><button id="panel">묶음 창 열기</button><span id="position"></span><main id="stage"></main>
<script type="module">
import {MOTION_SETS,createMotionSequence} from '/app/motion-sets.js';
import {openMotionSetPanel} from '/app/motion-set-panel.js';
import {configure} from '/src/model.js';import {cleanRecord,newRecord} from '/app/designs.js';import {mountPlayer} from '/app/player.js';
configure({aspect:16/9});const picker=document.querySelector('#set');for(const s of MOTION_SETS)picker.add(new Option(s.name,s.id));
let p=null,record;const stage=document.querySelector('#stage');
function draw(id){p?.destroy();record=id?{...newRecord('16:9'),slides:createMotionSequence(id)}:cleanRecord(JSON.parse(localStorage.getItem('motion-story')));p=mountPlayer(stage,{slides:record.slides,onChange:s=>document.querySelector('#position').textContent=(s.at+1)+' / '+s.total});window.player=p;window.story=record;}
picker.onchange=()=>draw(picker.value);document.querySelector('#next').onclick=()=>p.next();document.querySelector('#prev').onclick=()=>p.prev();
document.querySelector('#save').onclick=()=>{record.slides[1].items.find(x=>x.t==='text'&&x.text==='질문을 열어요').text='내 수업의 질문';localStorage.setItem('motion-story',JSON.stringify(cleanRecord(record)));};
window.applyCalls=[];window.createCalls=[];document.querySelector('#panel').onclick=()=>openMotionSetPanel({aspect:16/9,scopeLabel:'현재 3장',onApply:async(id,opts)=>{window.applyCalls.push({id,opts});await new Promise(r=>setTimeout(r,100));if(window.applyCalls.length===1)throw Error('시험: 저장 실패');},onCreate:async(id,opts)=>window.createCalls.push({id,opts})});
draw(localStorage.getItem('motion-story')?null:'atlas');window.ready=true;
</script></html>`;

async function setup(t, reducedMotion = 'no-preference') {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(fixture); }
      const file = resolve(root, '.' + decodeURIComponent(path));
      if (!file.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const { chromium } = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({ channel: process.env.MINICAN_BROWSER || 'msedge', headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ reducedMotion, viewport: { width: 1200, height: 820 } });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  return { page, errors };
}

test('motion story actually morphs shared pieces, breathes, and keeps edited content after reopening', options, async t => {
  const { page, errors } = await setup(t);
  const first = () => page.locator('#stage > .fe-card').last().locator('.fi-shape').first();
  const before = await first().boundingBox();
  await page.getByRole('button', { name: '다음 장' }).click();
  await page.waitForFunction(() => document.querySelector('#stage').querySelectorAll(':scope > .fe-card').length === 2);
  const moving = await page.locator('#stage > .fe-card').last().evaluate(node => node.getAnimations({ subtree: true }).some(a => a.playState === 'running'));
  assert.equal(moving, true, 'real Web Animations morph is running');
  await page.waitForFunction(() => document.querySelector('#stage').querySelectorAll(':scope > .fe-card').length === 1);
  const after = await first().boundingBox();
  assert.ok(after.width > before.width * 2, 'same card grows from overview into focus');
  assert.ok(after.x > before.x, 'same card moves into the focus position');
  const idle = await first().evaluate(node => node.getAnimations().some(a => a.effect.getTiming().iterations === Infinity));
  assert.equal(idle, true, 'symbol keeps breathing after morph');
  await page.getByRole('button', { name: '예시 수정·저장' }).click();
  await page.reload(); await page.waitForFunction(() => window.ready);
  await page.getByRole('button', { name: '다음 장' }).click();
  await page.waitForFunction(() => document.querySelector('#stage').querySelectorAll(':scope > .fe-card').length === 1 && window.player.at === 1);
  assert.match(await page.locator('#stage').textContent(), /내 수업의 질문/);
  assert.deepEqual(errors, []);
});

test('all six stories run without losing content, and reduced-motion removes animation', options, async t => {
  const { page, errors } = await setup(t, 'reduce');
  for (const id of ['atlas','orbit','ribbon','focus','stage','breath']) {
    await page.getByLabel('움직임 묶음').selectOption(id);
    await page.getByRole('button', { name: '다음 장' }).click();
    assert.equal(await page.locator('#position').textContent(), '2 / 5');
    assert.equal(await page.locator('#stage').evaluate(node => node.getAnimations({ subtree: true }).length), 0);
    await page.evaluate(() => window.player.go(4));
    assert.match(await page.locator('#stage').textContent(), /다시 연결해 보세요/);
  }
  assert.deepEqual(errors, []);
});

test('motion set panel works at phone width, previews the real flow and preserves choices on save failure', options, async t => {
  const { page, errors } = await setup(t);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '묶음 창 열기' }).click();
  const dialog = page.getByRole('dialog', { name: '움직임 묶음' });
  await dialog.getByRole('button', { name: '생각의 궤도', exact: true }).click();
  assert.equal(await dialog.locator('.ms-tile[aria-pressed="true"]').count(), 1);
  await dialog.getByRole('button', { name: '다음 장 →', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ms-position').textContent.startsWith('2 / 5'));
  await page.waitForFunction(() => document.querySelector('.ms-stage').querySelectorAll(':scope > .fe-card').length === 1);
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, `phone dialog stays inside viewport: ${JSON.stringify(bounds)}`);
  await dialog.getByLabel('요소 움직임 빠르기').selectOption('slow');
  await dialog.getByLabel('차분하게', { exact: true }).check();
  await dialog.getByRole('button', { name: '현재 3장에 움직임 적용' }).click();
  await page.waitForFunction(() => document.querySelector('.ms-status')?.textContent.includes('저장 실패'));
  assert.equal(await dialog.getByLabel('요소 움직임 빠르기').inputValue(), 'slow');
  assert.equal(await dialog.getByLabel('차분하게', { exact: true }).isChecked(), true);
  assert.equal(await dialog.locator('.ms-tile[aria-pressed="true"]').getAttribute('aria-label'), '생각의 궤도');
  assert.deepEqual(await page.evaluate(() => window.applyCalls[0]), { id: 'orbit', opts: { speed: 'slow', breathing: true, calm: true, topics: ['질문을 열어요', '함께 살펴봐요', '생각을 나눠요'] } });
  await page.evaluate(() => { window.oldStage = document.querySelector('.ms-stage'); document.querySelector('.ms-apply').click(); document.querySelector('.ms-apply').click(); });
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.applyCalls.length), 2, 'duplicate clicks are suppressed');
  assert.equal(await page.evaluate(() => window.oldStage.getAnimations({ subtree: true }).length), 0, 'closing destroys player and animations');
  await page.getByRole('button', { name: '묶음 창 열기' }).click();
  await page.getByRole('button', { name: '5장 예제로 새 그림' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.createCalls.length), 1);
  assert.deepEqual(errors, []);
});
