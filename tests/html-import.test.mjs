import test from 'node:test';
import assert from 'node:assert/strict';
import {readHtmlFile} from '../app/html-import.js';
import {HTML_FILE_MAX_BYTES, cleanHtmlFile, isHtmlFile} from '../src/html-file.js';
import {cleanDesign} from '../src/model.js';
import {migrateRecord} from '../app/designs.js';
import {packOnbatang, readOnbatang} from '../app/onbatang-file.js';
import {createHtmlLesson} from '../app/html-lesson.js';
const html = '<!doctype html><meta charset="utf-8"><title>수업</title><button onclick="this.textContent=\'완료\'">눌러요</button>';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';

test('HTML and HTM import losslessly and survive cleaning, backup and offline lesson serialization', async () => {
  for (const name of ['수업.html', '수업.HTM']) {
    const record = await readHtmlFile(new File([html], name));
    assert.equal(record.name, '수업'); assert.equal(record.slides.length, 1);
    assert.deepEqual(cleanDesign(record.slides[0]).web, {html, filename: name});
    assert.deepEqual(migrateRecord(JSON.parse(JSON.stringify(record))), record);
    const backup = await readOnbatang(await packOnbatang({records: [record], title: record.name, app: '0.146.0'}), {app: '0.146.0'});
    assert.equal(backup.records[0].slides[0].web.html, html);
    const exported = await createHtmlLesson({title: record.name, pages: [{id: record.slides[0].id, image, aspect: 16/9, web: record.slides[0].web}]}).text();
    const seed = JSON.parse(exported.match(/id="onbatang-lesson-data">([\s\S]*?)<\/script>/)[1]);
    assert.equal(seed.pages[0].web.html, html);
    assert.ok(!exported.includes('<button onclick='), 'source remains JSON data, never host markup');
  }
});
test('invalid, empty and oversized files fail before saving; MIME and uppercase extensions work', async () => {
  assert.ok(isHtmlFile({name: 'LESSON.HTML'})); assert.ok(isHtmlFile({name: 'lesson', type: 'text/html; charset=utf-8'}));
  await assert.rejects(readHtmlFile(new File([html], 'lesson.txt')), /HTML 파일/);
  await assert.rejects(readHtmlFile(new File([], 'lesson.html')), /빈 HTML/);
  await assert.rejects(readHtmlFile(new File(['not an HTML file'], 'lesson.html')), /HTML 내용/);
  await assert.rejects(readHtmlFile({name: 'large.html', size: HTML_FILE_MAX_BYTES + 1, arrayBuffer() {throw Error('must not read');}}), /50MB/);
  assert.equal(cleanHtmlFile({html: '<p>\0binary', filename: 'bad.html'}), null);
  assert.equal((await readHtmlFile(new File([html], 'lesson', {type: 'text/html'}))).slides[0].web.html, html);
});

test('HTML accepts exactly 50 MiB and rejects UTF-8 bytes beyond the limit', async () => {
  assert.equal(HTML_FILE_MAX_BYTES, 50 * 1024 * 1024);
  const prefix = '<!doctype html><p>50MB 경계</p><!--', suffix = '-->';
  const padding = HTML_FILE_MAX_BYTES - new TextEncoder().encode(prefix + suffix).length;
  const html = prefix + 'x'.repeat(padding) + suffix;
  const file = new File([html], '50MB.html');
  assert.equal(file.size, HTML_FILE_MAX_BYTES);
  const record = await readHtmlFile(file);
  assert.equal(record.slides[0].web.html, html);
  assert.equal(cleanDesign(record.slides[0]).web.html, html);
  assert.equal(cleanHtmlFile({html: html + '가', filename:'too-large.html'}), null);
  await assert.rejects(readHtmlFile(new File([html + 'x'], 'too-large.html')), /50MB/);
});
