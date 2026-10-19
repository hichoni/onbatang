import test from 'node:test';
import assert from 'node:assert/strict';
import { newPixelActivity, cleanPixelActivity, pixelArtCover, pixelArtResult } from '../src/pixel-art.js';
import { cleanDesign } from '../src/model.js';
import {newRecord,migrateRecord,copyRecord,copySlide} from '../app/designs.js';

test('pixel activity survives JSON twice without changing identity or painted cells', () => {
  const value = newPixelActivity({ size: 16 }); value.cells[13] = 3; value.cells[255] = 7;
  const snapshot = JSON.stringify(value);
  let next = value;
  for (let n = 0; n < 2; n++) next = cleanPixelActivity(JSON.parse(JSON.stringify(next)));
  assert.deepEqual(next, value); next.cells[13] = 1;
  assert.equal(JSON.stringify(value), snapshot);
  assert.equal(cleanPixelActivity(undefined), undefined);
});

test('activity survives record and editor sanitizers; copies have new activity identity',()=>{
  let record=newRecord('16:9');record.slides[0].activity=newPixelActivity();record.slides[0].activity.cells[31]=4;
  const original=structuredClone(record);
  for(let i=0;i<2;i++)record=migrateRecord(JSON.parse(JSON.stringify({...record,slides:record.slides.map(page=>cleanDesign(page))})));
  assert.deepEqual(record.slides[0].activity,original.slides[0].activity);
  assert.notEqual(copyRecord(record).slides[0].activity.id,record.slides[0].activity.id);
  assert.notEqual(copySlide(record.slides,0)[0][1].activity.id,record.slides[0].activity.id);
  const unsupported=structuredClone(record);unsupported.slides[0].activity.kind='script';
  assert.throws(()=>migrateRecord(unsupported),{code:'INVALID_ACTIVITY'});
});

test('invalid activity rejects unknown versions, scripts and lossy dimensions instead of truncating', () => {
  for (const change of [a => a.version = 2, a => a.kind = 'iframe', a => a.id = 'bad', a => a.size = 10,
    a => a.cells.pop(), a => a.cells[0] = 8, a => a.cells[0] = -2, a => a.palette[0] = 'url(https://example.com)',
    a => a.title = '', a => a.title = 'a'.repeat(81), a => a.instructions = 'a'.repeat(401)]) {
    const a = newPixelActivity(); change(a);
    const before = JSON.stringify(a);
    assert.throws(() => cleanPixelActivity(a), { code: 'INVALID_ACTIVITY' });
    assert.equal(JSON.stringify(a), before);
  }
  assert.throws(() => cleanPixelActivity(null), { code: 'INVALID_ACTIVITY' });
  const sparse = newPixelActivity(); delete sparse.cells[1];
  assert.throws(() => cleanPixelActivity(sparse), { code: 'INVALID_ACTIVITY' });
  assert.throws(() => newPixelActivity({ size: 1_000_000 }), { code: 'INVALID_ACTIVITY' });
});

test('activity cover and result remain ordinary editor/export elements with compact image result', () => {
  const a = newPixelActivity(), png = 'data:image/png;base64,iVBORw0KGgo=';
  for (const aspect of [.25, .8, 1, 4/3, 16/9, 4]) {
    const cover = pixelArtCover(a, aspect);
    assert.ok(cover.items.length <= 40);
    assert.equal(cleanDesign(cover).items.length, cover.items.length);
    const page = pixelArtResult(a, a.cells, aspect, png), cleaned = cleanDesign(page);
    assert.equal(cleaned.items.length, 3); assert.equal(cleaned.source.kind, 'result');
    assert.equal(cleaned.items[1].url, png); assert.equal(cleaned.activity, undefined);
    assert.ok(cleaned.items[1].h <= 68.001);
  }
  assert.throws(() => pixelArtResult(a, a.cells, 1, 'https://example.com/image.png'), { code: 'INVALID_ACTIVITY_IMAGE' });
});
