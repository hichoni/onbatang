import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cleanWallActivity, newWallActivity, wallCover, wallCode, formatWallCode, WALL_ADDRESS } from '../src/wall.js';
import { cleanActivity } from '../src/activity.js';
import { cleanDesign } from '../src/model.js';
import { newRecord, migrateRecord, copyRecord, copySlide } from '../app/designs.js';
import { materialPageDescription } from '../app/material-preview.js';

const WALL = { id: '0f8b5a3e-9c1d-4e2f-8a7b-6c5d4e3f2a1b', title: '삼척 연수 · 오늘 만든 것 나누기', code: '415468' };
const base = () => newWallActivity(WALL);

test('a wall slide keeps only which wall it is: server id, title and the six-digit join code', () => {
  const w = base();
  assert.deepEqual(Object.keys(w), ['version', 'kind', 'id', 'wall', 'title', 'code']);
  assert.equal(w.wall, WALL.id); assert.equal(w.code, '415468');
  assert.deepEqual(cleanWallActivity(JSON.parse(JSON.stringify(w))), w);
  assert.deepEqual(cleanActivity(w), w, 'slides carry it like the other activities');
  assert.equal(cleanWallActivity({ ...w, title: '  두 줄\n제목  ' }).title, '두 줄 제목');
  assert.equal(cleanWallActivity({ ...w, code: '415 468' }).code, '415468');
  for (const change of [a => { a.version = 2; }, a => { a.kind = 'board'; }, a => { a.id = 'x'; }, a => { a.wall = 'not-a-uuid'; }, a => { a.title = '  '; },
    a => { a.title = '가'.repeat(61); }, a => { a.code = '012345'; }, a => { a.code = '12345'; }, a => { a.code = 'ABCDEF'; }, a => { a.token = 'x'; a.code = undefined; }]) {
    const bad = structuredClone(w); change(bad);
    assert.throws(() => cleanWallActivity(bad), { code: 'INVALID_ACTIVITY' });
  }
  assert.equal(Object.hasOwn(cleanWallActivity({ ...w, token: 'f'.repeat(64), url: 'https://x' }), 'token'), false, 'nothing but the four fields is kept');
  assert.equal(wallCode(' 415 468 '), '415468'); assert.equal(formatWallCode('415468'), '415 468'); assert.equal(wallCode('41546'), '');
});

test('wall slides survive the record sanitizers, and copies keep the same wall but get their own activity id', () => {
  let record = newRecord('16:9'); record.slides[0] = { ...record.slides[0], ...wallCover(base(), 16 / 9), activity: base() };
  const original = structuredClone(record.slides[0].activity);
  for (let i = 0; i < 2; i++) record = migrateRecord(JSON.parse(JSON.stringify({ ...record, slides: record.slides.map(page => cleanDesign(page)) })));
  assert.deepEqual(record.slides[0].activity, original);
  const copied = copyRecord(record).slides[0].activity, duplicated = copySlide(record.slides, 0)[0][1].activity;
  assert.notEqual(copied.id, original.id); assert.equal(copied.wall, original.wall);
  assert.notEqual(duplicated.id, original.id); assert.equal(duplicated.code, original.code);
  assert.equal(materialPageDescription(record.slides[0]), '담벼락');
});

test('the cover is ordinary elements that show the join address and the big code on wide and tall slides', () => {
  for (const aspect of [16 / 9, 9 / 16]) {
    const cover = wallCover(base(), aspect), texts = cover.items.filter(i => i.t === 'text').map(i => i.text);
    assert.ok(texts.includes('담벼락')); assert.ok(texts.includes(WALL.title)); assert.ok(texts.includes('415 468'));
    assert.ok(texts.some(t => t.includes(WALL_ADDRESS)), 'laptops type the address and the code instead of scanning a QR');
    for (const item of cover.items) {
      assert.ok(cleanDesign({ items: [item] }).items.length, 'every cover item is an ordinary element');
      assert.ok(item.x - item.w / 2 >= 0 && item.x + item.w / 2 <= 100);
    }
  }
});

test('the editor only offers walls when the host provides wallAction, and presents them through it', async () => {
  const app = await readFile(new URL('../app/app.js', import.meta.url), 'utf8'), wall = await readFile(new URL('../app/wall.js', import.meta.url), 'utf8');
  assert.match(app, /activityAuthoring&&wallAction&&el\('button',\{class:'btn cv-activity-add',type:'button',dataset:\{addWall:''\}/);
  assert.match(app, /if \(walling && \['create', 'list', 'mount'\]\.every\(\(k\) => typeof walling\[k\] === 'function'\)\) wallAction = walling;/);
  assert.match(app, /if\(design\.activity&&\(design\.activity\.kind!=='wall'\|\|wallAction\)\)\{/, 'without a host the cover is shown as an ordinary slide');
  assert.match(app, /pixel=mountWall\(host,\{activity:design\.activity,wallAction\}\);/);
  assert.match(app, /'\.cv-show-activity:not\(\[data-quiz\]\):not\(\[data-wall\]\)'/, 'arrow keys still move slides after pressing a board button');
  assert.doesNotMatch(wall, /fetch\(|https?:\/\/|supabase/i, 'the editor holds no server address or credential');
  const runtime = await readFile(new URL('../app/html-lesson-runtime.js', import.meta.url), 'utf8');
  assert.match(runtime, /if \(page\.activity && page\.activity\.kind !== 'wall'\) scene\.append/, 'downloaded lessons show only the cover');
});
