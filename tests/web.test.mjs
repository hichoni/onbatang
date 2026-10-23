// 웹사이트 장: 주소 정리 · 퍼가기 주소로 바꾸기 · 막아 둔 사이트 알기 · 저장.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanWebUrl, embedOf, blockedSite, isYouTubePage, webHost, designWeb } from '../src/web.js';
import { cleanDesign } from '../src/model.js';
import { migrateRecord, newRecord } from '../app/designs.js';

test('only https addresses; a bare address gets https://', () => {
  assert.equal(cleanWebUrl('padlet.com/me/board'), 'https://padlet.com/me/board');
  assert.equal(cleanWebUrl(' https://phet.colorado.edu/ko/ '), 'https://phet.colorado.edu/ko/');
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'data:text/html,hi', 'https://user:pw@example.com', 'localhost', '', 'https://a b.com', 'x'.repeat(2100)]) assert.equal(cleanWebUrl(bad), '', bad);
});

test('known share addresses become the embed address their site allows', () => {
  assert.equal(embedOf('https://docs.google.com/presentation/d/1AbC_d-9/edit#slide=id.p'), 'https://docs.google.com/presentation/d/1AbC_d-9/embed?start=false&loop=false');
  assert.equal(embedOf('https://docs.google.com/presentation/d/e/2PACX-1x/pub?start=false'), 'https://docs.google.com/presentation/d/e/2PACX-1x/embed?start=false&loop=false');
  assert.equal(embedOf('https://docs.google.com/document/d/XYZ/edit?usp=sharing'), 'https://docs.google.com/document/d/XYZ/preview');
  assert.equal(embedOf('https://docs.google.com/forms/d/e/1FAIp/viewform'), 'https://docs.google.com/forms/d/e/1FAIp/viewform?embedded=true');
  assert.equal(embedOf('https://drive.google.com/file/d/FILE1/view?usp=sharing'), 'https://drive.google.com/file/d/FILE1/preview');
  assert.equal(embedOf('https://www.canva.com/design/DAF1/abcD/edit?utm_content=1'), 'https://www.canva.com/design/DAF1/abcD/view?embed');
  assert.equal(embedOf('https://www.geogebra.org/classic/abc'), 'https://www.geogebra.org/classic/abc');
});

test('well-known sites that refuse to be framed are named; YouTube pages go to the video tool', () => {
  assert.equal(blockedSite('https://m.naver.com/'), '네이버');
  assert.equal(blockedSite('https://www.google.com/search?q=a'), '구글 검색');
  assert.equal(blockedSite('https://docs.google.com/document/d/X/preview'), '', 'Google Docs embeds are fine');
  assert.equal(blockedSite('https://padlet.com/a/b'), '');
  assert.equal(isYouTubePage('https://www.youtube.com/watch?v=abc'), true);
  assert.equal(isYouTubePage('https://youtu.be/abc'), true);
  assert.equal(webHost('https://www.geogebra.org/x'), 'geogebra.org');
});

test('a web slide survives cleaning, saving and reopening; a bad address is dropped', () => {
  assert.deepEqual(designWeb({ web: { url: 'https://padlet.com/a/b', junk: 1 } }), { web: { url: 'https://padlet.com/a/b' } });
  assert.deepEqual(designWeb({ web: { url: 'http://padlet.com' } }), {});
  assert.deepEqual(cleanDesign({ items: [], web: { url: 'https://padlet.com/a/b' } }).web, { url: 'https://padlet.com/a/b' });
  const record = newRecord('16:9');
  record.slides = [{ items: [], web: { url: 'https://phet.colorado.edu/ko/' } }, { items: [], web: { url: 'javascript:1' } }];
  const again = migrateRecord(JSON.parse(JSON.stringify(migrateRecord(record))));
  assert.deepEqual(again.slides[0].web, { url: 'https://phet.colorado.edu/ko/' });
  assert.equal(again.slides[1].web, undefined);
});
