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

test('the first screen opens behind a branded splash, and the bare root address goes straight to the app', async () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  // The splash sits outside #app (the app replaces #app) and is styled inline, so it looks right before any stylesheet arrives.
  assert.match(html, /<div class="onba-splash" id="onba-splash"[^>]*>[\s\S]*<p class="onba-splash-slogan">생각을 <b>바로<\/b>, 작품으로\.<\/p>[\s\S]*<\/div>\s*<main id="app"><\/main>/);
  assert.match(html, /<style>[\s\S]*\.onba-splash\{position:fixed;inset:0/);
  assert.equal((html.match(/<ul class="onba-splash-tips"[\s\S]*?<\/ul>/)[0].match(/<li>/g) || []).length, 5);
  // It lifts after the app (home list or the reopened drawing) and fonts are ready, even if starting fails.
  assert.match(html, /resume: true,\s*\}\)\.then\(\(\) => Promise\.race\(\[Promise\.all\(\[sheets\(\), uiFont, document\.fonts\?\.ready\]\),[\s\S]*\.finally\(\(\) => requestAnimationFrame\(lift\)\)/);
  // Every stylesheet the first screen needs is in the head (none injected later), and the UI font starts downloading at once.
  assert.match(html, /<link rel="stylesheet" href="\.\/pptx-import\/style\.css\?v=[^"]+" \/>/);
  assert.match(html, /<link rel="preload" href="\.\/brand\/noto-sans-kr\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
  assert.match(readFileSync(new URL('../app/app.css', import.meta.url), 'utf8'), /#app\.cv-standalone-shell \{ max-width: none; margin: 0; padding: 0; \}/);
  const root = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(root, /<script>location\.replace\('app\/' \+ location\.search \+ location\.hash\);<\/script>/);
  assert.doesNotMatch(root, />온바탕 열기</, 'no bare link flashes in the corner');
  const hosting = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8')).hosting;
  assert.deepEqual(hosting.redirects, [{source: '/', destination: '/app/', type: 302}]);
  const {ONBATANG_TIPS} = await import('../app/loading.js');
  assert.ok(ONBATANG_TIPS.length >= 5 && ONBATANG_TIPS.every(t => typeof t === 'string' && t.length > 8));
});
