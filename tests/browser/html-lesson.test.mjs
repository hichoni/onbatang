import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createHtmlLesson } from '../../app/html-lesson.js';
import { newPixelActivity } from '../../src/pixel-art.js';

const options = { skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 90000 };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
async function setup(t, unavailable = false, pageCount = 3) {
  const { chromium } = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({ channel: process.env.MINICAN_BROWSER || 'msedge', headless: true }); t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, offline: true });
  if (unavailable) await context.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('disabled'); }; Storage.prototype.setItem = () => { throw new Error('disabled'); }; });
  const dir = fileURLToPath(new URL('../../work/', import.meta.url)); await mkdir(dir, { recursive: true });
  const work = await mkdtemp(join(dir, 'html-lesson-test-')), path = join(work, 'lesson.html');
  const pages = [{ id: 'pfirst123', image, aspect: 16 / 9 }, { id: 'pactivity123', image, aspect: 16 / 9, activity: newPixelActivity() }, { id: 'plast123', image, aspect: 16 / 9 }];
  for (let n = pages.length; n < pageCount; n++) pages.push({ id: `pextra${String(n).padStart(5, '0')}`, image, aspect: 16 / 9 });
  await writeFile(path, Buffer.from(await createHtmlLesson({ title: '내 실과 수업', pages }).arrayBuffer()));
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url()));
  await page.goto(pathToFileURL(path).href);
  return { page, work, errors, requests, context };
}

test('offline HTML plays pixel activity, saves next-slide result, restores and re-exports a working whole lesson', options, async t => {
  const { page, work, errors, requests, context } = await setup(t);
  assert.equal(await page.locator('.lesson-count').textContent(), '1 / 3쪽');
  await page.getByRole('button', { name: '다음', exact: true }).click(); await page.getByRole('button', { name: '활동 시작', exact: true }).click();
  await page.getByRole('button', { name: '3번 색 #ef6461', exact: true }).click(); await page.locator('[data-pixel="0"]').click();
  await page.locator('[data-pixel="1"]').focus(); await page.keyboard.press('Space');
  assert.match(await page.locator('[data-pixel="1"]').getAttribute('aria-label'), /3번 색/);
  assert.equal(await page.locator('.lesson-count').textContent(), '2 / 3쪽 · 활동');
  await page.screenshot({ path: join(work, 'activity-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '결과를 다음 슬라이드에 저장', exact: true }).click();
  assert.equal(await page.locator('.lesson-count').textContent(), '3 / 4쪽 · 결과');
  assert.ok(await page.locator('.lesson-slide').evaluate(image => image.complete && image.naturalWidth === 1280));
  await page.getByRole('button', { name: '이전', exact: true }).click(); await page.getByRole('button', { name: '활동 시작', exact: true }).click();
  await page.getByRole('button', { name: '결과를 다음 슬라이드에 저장', exact: true }).click();
  assert.equal(await page.locator('.lesson-count').textContent(), '3 / 4쪽 · 결과', 'unchanged activity result is not duplicated in the same session');
  await page.reload(); assert.equal(await page.locator('.lesson-count').textContent(), '3 / 4쪽 · 결과');
  await page.getByRole('button', { name: '이전', exact: true }).click(); await page.getByRole('button', { name: '활동 시작', exact: true }).click();
  assert.match(await page.locator('[data-pixel="0"]').getAttribute('aria-label'), /3번 색/);
  await page.getByRole('button', { name: '활동 화면 닫기', exact: true }).click();
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: '현재 수업 내려받기', exact: true }).click();
  const download = await downloaded, copy = join(work, 'with-results.html'); await download.saveAs(copy);
  const fresh = await context.browser().newContext({ offline: true, viewport: { width: 1024, height: 768 } }); t.after(() => fresh.close());
  const again = await fresh.newPage(); await again.goto(pathToFileURL(copy).href);
  assert.equal(await again.locator('.lesson-count').textContent(), '1 / 4쪽');
  await again.getByRole('button', { name: '다음', exact: true }).click(); await again.getByRole('button', { name: '활동 시작', exact: true }).click();
  assert.match(await again.locator('[data-pixel="1"]').getAttribute('aria-label'), /3번 색/);
  assert.deepEqual(errors, []); assert.ok(requests.every(url => url.startsWith('file:') || url.startsWith('data:')));
});

test('HTML with unavailable browser storage preserves in-memory result and reports download recovery', options, async t => {
  const { page, errors } = await setup(t, true);
  await page.getByRole('button', { name: '다음', exact: true }).click(); await page.getByRole('button', { name: '활동 시작', exact: true }).click();
  await page.locator('[data-pixel="0"]').click(); await page.getByRole('button', { name: '결과를 다음 슬라이드에 저장', exact: true }).click();
  assert.equal(await page.locator('.lesson-count').textContent(), '3 / 4쪽 · 결과');
  assert.match(await page.locator('.lesson-status').textContent(), /브라우저에 저장하지 못했어요/);
  assert.equal(await page.getByRole('button', { name: '현재 수업 내려받기', exact: true }).isEnabled(), true);
  assert.deepEqual(errors, []);
});

test('a 500-page HTML lesson rejects another result before mutation and remains downloadable', options, async t => {
  const { page, work, errors } = await setup(t, false, 500);
  await page.getByRole('button', { name: '다음', exact: true }).click(); await page.getByRole('button', { name: '활동 시작', exact: true }).click();
  await page.locator('[data-pixel="0"]').click(); await page.getByRole('button', { name: '결과를 다음 슬라이드에 저장', exact: true }).click();
  assert.equal(await page.locator('.lesson-count').textContent(), '2 / 500쪽 · 활동');
  assert.match(await page.locator('.pixel-status').textContent(), /최대 500쪽/);
  assert.match(await page.locator('[data-pixel="0"]').getAttribute('aria-label'), /1번 색/);
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '현재 수업 내려받기', exact: true }).click();
  const copy = join(work, 'limit-recovery.html'); await (await pending).saveAs(copy);
  const fresh = await page.context().browser().newContext({ offline: true }); t.after(() => fresh.close()); const again = await fresh.newPage();
  await again.goto(pathToFileURL(copy).href);
  assert.equal(await again.locator('.lesson-count').textContent(), '1 / 500쪽');
  await again.getByRole('button', { name: '다음', exact: true }).click(); await again.getByRole('button', { name: '활동 시작', exact: true }).click();
  assert.match(await again.locator('[data-pixel="0"]').getAttribute('aria-label'), /1번 색/);
  assert.deepEqual(errors, []);
});
