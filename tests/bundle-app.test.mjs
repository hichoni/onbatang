import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
import {bundleApp,pinModuleUrl,keepOwnFile,ENTRY,CHUNK_PREFIX,PAGE} from '../tools/bundle-app.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const page=(start,extra='')=>`<!doctype html><html><head><link rel="stylesheet" href="../src/editor.css?v=1" />\n</head><body><main id="app"></main>${extra}<script type="module">${start}</script></body></html>`;

test('a module keeps its own address: import.meta.url and computed relative imports point at the original file', () => {
  assert.equal(pinModuleUrl('export const a = 1;', '../src/x.js'), null, 'nothing to change');
  assert.equal(pinModuleUrl("const u = new URL('./m.svg', import.meta.url);", '../src/x.js'), 'const u = new URL(\'./m.svg\', (new URL("../src/x.js",import.meta.url).href));');
  assert.equal(pinModuleUrl('const p = (n) => import(`./art/${n}`);', '../src/art.js'), 'const p = (n) => import(new URL(`./art/${n}`,new URL("../src/art.js",import.meta.url).href).href);');
  assert.equal(pinModuleUrl("const u = `${BASE}x.mjs`; import(u); // import.meta.url", 'x.js'), null, 'comments and absolute imports stay');
  assert.equal(pinModuleUrl("import('./y.js'); const s = 'import.meta.url';", 'x.js'), null, 'a literal import is bundled; a string is not code');
  assert.throws(() => pinModuleUrl("import.meta.resolve('./y.js');", 'x.js'), /import\.meta/);
  assert.equal(keepOwnFile('app/pdf/vendor/pdf.min.mjs'), true);
  assert.equal(keepOwnFile('app/pptx-import/vendor/pptx-worker.js'), true);
  assert.equal(keepOwnFile('app/html-lesson-bundle.js'), true);
  assert.equal(keepOwnFile('src/editor.js'), false);
});

test('the public 온바탕 page loads one bundle instead of ninety modules found one level at a time', async () => {
  const files = unzipSync(execFileSync('git', ['archive', '--format=zip', 'HEAD', 'app', 'src'], {cwd: root, maxBuffer: 64 * 1024 * 1024}));
  const r = await bundleApp(files, {version: '9.9.9'});
  assert.ok(r.modules > 90, 'bundles the whole graph: ' + r.modules);
  const names = Object.keys(r.outputs);
  assert.ok(names.includes(ENTRY) && names.every((f) => f === ENTRY || (f.startsWith(CHUNK_PREFIX) && f.endsWith('.js'))), names.join(', '));
  assert.match(r.page, /<script type="module" src="\.\/index\.bundle\.js\?v=9\.9\.9"><\/script>/);
  assert.doesNotMatch(r.page, /<script type="module">/, 'the inline start script moved into the bundle');
  assert.match(r.page, /<link rel="stylesheet" href="\.\.\/src\/editor\.css\?v=/, 'styles stay');
  const listed = [...r.page.matchAll(/<link rel="modulepreload" href="\.\/([^"?]+)/g)].map((m) => 'app/' + m[1]);
  assert.deepEqual(listed, r.preload); assert.equal(listed[0], ENTRY);
  assert.ok(r.externals.includes('app/html-lesson-bundle.js') && r.externals.includes('app/pdf/vendor/pdf.min.mjs'), 'shipped builds stay their own files');
  const all = Object.values(r.outputs).join('\n');
  for (const file of ['src/math-dialog.js', 'app/pdf-import.js', 'app/fonts.js', 'src/export.js', 'app/pptx-import/client.js']) {
    const own = posix.relative('app', file);
    assert.ok(r.pinned.includes(file) && all.includes(`new URL(${JSON.stringify(own)},import.meta.url)`), 'pinned: ' + file);
    assert.equal(posix.normalize(posix.join('app', own)), file);
  }
  assert.ok(!/import\(`\.\.?\//.test(all), 'no computed relative import resolves against the bundle');
  assert.ok(!all.includes('__name('), 'no name helpers inside written-out functions');
  assert.ok(r.serialized >= 2, 'checks the functions written into exported apps');
  assert.ok(all.includes('온바탕'), 'Korean text stays as it is');
});

test('the bundle stops instead of shipping a page that would break', async () => {
  // 다른 모듈 스크립트가 묶인 모듈을 따로 부르면 같은 모듈이 둘이 된다
  const twice = {[PAGE]: page("import {count} from './store.js'; count();", '<script type="module" src="./notice.js"></script>'),
    'app/store.js': 'let n = 0; export const count = () => ++n;', 'app/notice.js': "import {count} from './store.js'; count();"};
  await assert.rejects(bundleApp(twice), /app\/notice\.js 가 묶음 안의 app\/store\.js/);
  // 이름이 겹쳐 바뀐 함수의 .name 을 읽는다
  const named = {[PAGE]: page("import {a} from './a.js'; import {b} from './b.js'; console.log(a(), b());"),
    'app/a.js': 'function open() { return 1; } export const a = () => open.name;', 'app/b.js': 'function open() { return 2; } export const b = () => open();'};
  await assert.rejects(bundleApp(named), /\.name 을 읽어요: open/);
  named['app/a.js'] = 'function open() { return 1; } export const a = () => open();';
  assert.equal((await bundleApp(named)).renamed, 1);
  // 글로 꺼내 쓰는 함수의 이름이 바뀐다
  const written = {[PAGE]: page("import {page} from './page.js'; import {edit} from './edit.js'; console.log(page(), edit());"),
    'app/page.js': "export function helper() { return 1; }\nexport const page = () => '<script>' + helper.toString() + '</script>';", 'app/edit.js': 'function helper() { return 2; } export const edit = () => helper();'};
  await assert.rejects(bundleApp(written), /helper → helper2/);
  await assert.rejects(bundleApp({[PAGE]: '<html><body></body></html>'}), /시작 스크립트/);
  await assert.rejects(bundleApp({[PAGE]: page("import './missing.js';")}), /없는 모듈 app\/missing\.js/);
});
