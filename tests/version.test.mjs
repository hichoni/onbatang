import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ONBATANG_VERSION} from '../app/version.js';

test('the shown version and every stylesheet release key match package.json', () => {
  const {version} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(ONBATANG_VERSION, version);
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/\.css\?v=([^"']+)/g)].map(m => m[1]);
  assert.ok(keys.length >= 3);
  assert.deepEqual([...new Set(keys)], [version]);
  const standalone = readFileSync(new URL('../app/standalone.js', import.meta.url), 'utf8');
  assert.doesNotMatch(standalone, /\?v=\d/, 'standalone styles use ONBATANG_VERSION, not a hand-written key');
});

test('shared links show a title, description and a 1200×630 PNG preview (KakaoTalk, Facebook, X)', () => {
  for (const [file, url] of [['../index.html', 'https://onbatang.web.app/'], ['../app/index.html', 'https://onbatang.web.app/app/']]) {
    const html = readFileSync(new URL(file, import.meta.url), 'utf8');
    const meta = (key) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]+)"`))?.[1];
    assert.match(meta('og:title'), /^온바탕/, file);
    assert.ok(meta('og:description').length > 30, file);
    assert.equal(meta('og:url'), url);
    assert.equal(meta('og:image'), 'https://onbatang.web.app/app/brand/og-image.png');
    assert.equal(meta('twitter:card'), 'summary_large_image');
    assert.equal(meta('description'), meta('og:description'));
  }
  const png = readFileSync(new URL('../app/brand/og-image.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  assert.ok(png.length < 300000);
});
