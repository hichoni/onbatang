import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_SETS, applyMotionSet, createMotionSequence } from '../app/motion-sets.js';
import { configure, cleanDesign } from '../src/model.js';
import { cleanRecord, newRecord } from '../app/designs.js';
import { matchItems, planMotion, idleTime } from '../src/motion.js';

test('six motion stories keep fresh page/element identities and real continuity through save/reopen', () => {
  for (const set of MOTION_SETS) {
    const slides = createMotionSequence(set.id);
    const seed = { ...newRecord('16:9'), slides };
    const saved = cleanRecord(JSON.parse(JSON.stringify(seed)));
    assert.equal(saved.slides.length, 5, set.id);
    const allIds = saved.slides.flatMap(page => [page.id, ...page.items.map(item => item.id)]);
    assert.equal(new Set(allIds).size, allIds.length, `${set.id}: document-wide unique IDs`);
    for (let n = 1; n < saved.slides.length; n++) {
      const before = saved.slides[n - 1], after = saved.slides[n];
      assert.equal(after.tr, 'move');
      const matches = matchItems(before.items, after.items);
      const sceneItems = after.items.filter(item => item.origin?.elementId);
      assert.ok(sceneItems.length >= 10, `${set.id}: a coherent scene is present`);
      assert.equal(matches.filter(([, index]) => after.items[index].origin?.elementId).length, sceneItems.length, `${set.id}: every scene piece stays matched`);
      assert.ok(matches.some(([a, b]) => before.items[a].x !== after.items[b].x || before.items[a].w !== after.items[b].w), `${set.id}: actual movement`);
    }
    assert.ok(saved.slides[0].notes.includes(set.name) || saved.slides[0].items.some(item => item.text?.includes(set.name)));
    assert.ok(saved.slides.every(page => page.items.length <= 40));
  }
});

test('all sequences work at original custom aspect ratios and survive editor cleanup', () => {
  for (const aspect of [0.25, 9 / 16, 4 / 5, 1, 4 / 3, 16 / 9, 2.3, 4]) {
    configure({ aspect });
    for (const { id } of MOTION_SETS) {
      const slides = createMotionSequence(id, { aspect });
      for (const page of slides) {
        const cleaned = cleanDesign(page);
        assert.equal(cleaned.items.length, page.items.length, `${id}/${aspect}: no missing elements`);
        assert.equal(cleaned.tr, 'move');
        for (const item of cleaned.items) {
          assert.ok(Number.isFinite(item.x) && item.x >= -500 && item.x <= 500);
          assert.ok(Number.isFinite(item.y) && item.y >= -500 && item.y <= 500);
          assert.ok(Number.isFinite(item.w) && item.w > 0);
          const original = page.items.find(value => value.id === item.id);
          for (const key of ['x','y','w','h']) if (original[key] !== undefined) assert.ok(Math.abs(item[key]-original[key]) < .001, `${id}/${aspect}: cleanup keeps spatial ${key}`);
        }
      }
    }
  }
  configure({ aspect: 1 });
});

test('apply preserves actual imported content, layout, source IDs, notes, activity and assets without mutating', () => {
  const imported = [{
    id: 'psource01', source: { kind: 'pptx', slide: 11 }, origin: { pageId: 'porigin1' }, assetRefs: ['asource1'],
    notes: '교사만 보는 메모', video: { src: 'vlocal01', dur: 60 }, activity: { kind: 'pixel-art' },
    items: [
      { id: 'esource01', t: 'text', text: '원본 문장과 줄바꿈\n그대로', x: 21, y: 34, w: 43, size: 5, runs: [{ start: 0, end: 2, bold: true }], source: { kind: 'pptx' }, an: 'pop', aw: true, em: 'tada', ex: 'sink', lp: 'wave', sp: 'fast', dl: 2 },
      { id: 'eimage001', t: 'image', x: 50, y: 50, w: 82, url: 'data:image/png;base64,AAAA', assetRefs: ['asource1'] },
      { id: 'eshape001', t: 'shape', x: 80, y: 70, w: 6, shape: 'circle' },
    ],
  }];
  const original = structuredClone(imported);
  const out = applyMotionSet(imported, 'atlas', { speed: 'slow' });
  assert.deepEqual(imported, original, 'original input was not changed');
  assert.notEqual(out, imported);
  assert.notEqual(out[0].items[0], imported[0].items[0]);
  const strip = page => ({ ...page, pa: undefined, tr: undefined, items: page.items.map(item => Object.fromEntries(Object.entries(item).filter(([key]) => !['an','aw','em','ex','lp','sp','dl'].includes(key)))) });
  assert.deepEqual(strip(out[0]), strip(imported[0]));
  assert.equal(out[0].items[2].lp, 'breathe');
  assert.equal(out[0].items[0].lp, 'none', 'reading text never breathes');
  assert.equal(out[0].items[1].lp, 'none', 'photo content never breathes');
  assert.equal(out[0].items[0].sp, 'slow');
  assert.equal(out[0].tr, 'move');
  assert.equal(out[0].pa, 'fade');
});

test('calm and breathing controls really suppress loops while keeping the slides/content', () => {
  for (const set of MOTION_SETS) {
    const calm = createMotionSequence(set.id, { calm: true });
    assert.ok(calm.every(page => page.tr === 'fade'));
    assert.ok(calm.every(page => page.items.every(item => !item.lp || item.lp === 'none')));
    const noBreathing = createMotionSequence(set.id, { breathing: false });
    assert.ok(noBreathing.every(page => page.items.every(item => !item.lp || item.lp === 'none')));
    const applied = applyMotionSet(calm, set.id, { calm: true });
    assert.ok(applied.every(page => page.items.every(item => !item.lp || item.lp === 'none')));
  }
});

test('generated stories can change topic order and use the existing slower breathing timeline', () => {
  const topics = ['실행', '관찰', '질문'];
  const slides = createMotionSequence('atlas', { topics, speed: 'slow' });
  assert.ok(slides[1].items.some(item => item.text === topics[0]));
  assert.ok(slides[2].items.some(item => item.text === topics[1]));
  const ornament = slides[1].items.find(item => item.lp === 'breathe');
  assert.equal(idleTime('breathe', ornament), 4800);
  const plan = planMotion(slides[1]);
  assert.ok(plan.some ? plan.some(item => item.lp === 'breathe') : JSON.stringify(plan).includes('breathe'));
  assert.throws(() => createMotionSequence('missing'), RangeError);
  assert.throws(() => applyMotionSet(null, 'atlas'), TypeError);
});

test('the same complete scene follows one affine camera instead of shuffling cards or replacing labels with numbers', () => {
  const near = (a,b) => Math.abs(a-b) < .012;
  for (const set of MOTION_SETS) {
    const slides=createMotionSequence(set.id);
    for (let page=1;page<slides.length;page++) {
      const before=slides[page-1],after=slides[page];
      const pairs=matchItems(before.items,after.items).filter(([,j])=>after.items[j].origin?.elementId);
      const first=pairs[0],factor=after.items[first[1]].w/before.items[first[0]].w;
      const dx=after.items[first[1]].x-before.items[first[0]].x*factor;
      const dy=after.items[first[1]].y-before.items[first[0]].y*factor;
      for (const [i,j] of pairs) {
        const a=before.items[i],b=after.items[j];
        assert.equal(a.t,b.t);
        assert.equal(a.text,b.text, `${set.id}: annotation text is stable`);
        assert.equal(a.shape,b.shape, `${set.id}: the silhouette is stable`);
        assert.equal(a.color,b.color, `${set.id}: material color is stable`);
        assert.ok(near(b.x,a.x*factor+dx), `${set.id}: scene-wide camera x`);
        assert.ok(near(b.y,a.y*factor+dy), `${set.id}: scene-wide camera y`);
        assert.ok(near(b.w,a.w*factor), `${set.id}: scene-wide camera size`);
      }
    }
  }
});

test('six directions have different graphic structures; breathing stays on at most two tiny ornaments', () => {
  for (const set of MOTION_SETS) {
    for (const page of createMotionSequence(set.id)) {
      const loops=page.items.filter(item=>item.lp&&item.lp!=='none');
      assert.ok(loops.length<=2);
      assert.ok(loops.every(item=>item.t==='shape'&&item.w<5));
      assert.equal(page.items.filter(item=>item.t==='shape'&&item.shape==='round').length,set.id==='stage'?1:0);
    }
  }
  assert.ok(createMotionSequence('ribbon')[1].items.some(item=>item.text==='01'&&item.size>=20));
  assert.ok(createMotionSequence('focus')[0].items.some(item=>item.shape==='leaf'));
  assert.ok(createMotionSequence('orbit')[0].items.filter(item=>item.shape==='circle').length>=10);
  assert.ok(createMotionSequence('atlas')[0].items.some(item=>item.shape==='tri'));
});
