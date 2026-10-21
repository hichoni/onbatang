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
