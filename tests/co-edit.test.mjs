// 같이 고치기(app/co-edit.js): 차이 구하기 · 끼워 넣기 · 큰 것 나눠 보내기 · 여럿이 동시에 고쳐도 모두 같은 그림이 되는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { diffState, applyOps, cleanOps, skipPending, stateHash, createWire, createCoSession, cleanName, coCode, newCoCode, shareSlide } from '../app/co-edit.js';

const text = (id, extra = {}) => ({ id, t: 'text', text: '글', x: 50, y: 50, w: 40, size: 5, ...extra });
const deck = () => ({
  ratio: '16:9', size: { width: 16, height: 9, unit: 'px' },
  slides: [
    { id: 'p1', bg: '#fff', items: [text('a'), text('b', { y: 70 })] },
    { id: 'p2', bg: '#000', items: [text('c')], notes: '노트', voice: { src: 'avoice0001', at: 0, ms: 2000 } },
  ],
});
const clone = (v) => structuredClone(v);

test('the difference between two drawings, applied to the first, gives the second', () => {
  const before = deck();
  const after = clone(before);
  after.slides[0].items[0].x = 20;                       // 옮기기
  delete after.slides[0].items[1].size;                  // 칸 지우기
  after.slides[0].items.push(text('d', { text: '새 글' })); // 넣기
  after.slides[0].items.reverse();                       // 차례
  after.slides[1].items = [];                            // 지우기
  after.slides[1].bg = '#123456';
  delete after.slides[1].notes;
  after.slides.unshift({ id: 'p3', bg: '#eee', items: [text('e')] });   // 새 장
  after.ratio = '4:3'; after.size = { width: 4, height: 3, unit: 'px' };
  const ops = diffState(before, after);
  assert.deepEqual(new Set(ops.map((o) => o.o)), new Set(['ratio', 'slide', 'set', 'add', 'item', 'del', 'order', 'slides']));
  const item = ops.find((o) => o.o === 'item' && o.i === 'a');
  assert.deepEqual(item.set, { x: 20 }, 'only the changed field goes');
  const { state, changed, slides, ratio } = applyOps(before, ops);
  assert.deepEqual(state, after);
  assert.ok(slides && ratio);
  assert.deepEqual([...changed.get('p1').added], ['d']);
  assert.ok(changed.get('p1').order);
  assert.deepEqual([...changed.get('p2').fields].sort(), ['bg', 'notes']);
  assert.deepEqual(before, deck(), 'the old state is not touched');
  assert.deepEqual(diffState(after, clone(after)), [], 'nothing changed, nothing to send');
});

test('the recorded voice stays on this device', () => {
  const before = deck();
  const after = clone(before);
  after.slides[1].voice = { src: 'avoice0002', at: 1, ms: 3000 };
  assert.deepEqual(diffState(before, after), []);
  assert.equal(shareSlide(before.slides[1]).voice, undefined);
  const theirs = applyOps(before, [{ o: 'set', s: 'p2', set: { voice: { src: 'x' }, bg: '#fff' } }, { o: 'slide', s: 'p2', d: { bg: '#fff', items: [] } }]).state;
  assert.deepEqual(theirs.slides[1].voice, before.slides[1].voice, 'my recording is kept when someone replaces the slide');
  assert.equal(stateHash(before), stateHash(after), 'the fingerprint ignores it too');
});

test('a reorder keeps what someone else added meanwhile, and removal is explicit', () => {
  const s = deck();
  const out = applyOps(s, [{ o: 'add', s: 'p1', i: 'x', d: text('x') }, { o: 'order', s: 'p1', ids: ['b', 'a'] }, { o: 'slides', ids: ['p2'] }]).state;
  assert.deepEqual(out.slides[1].items.map((it) => it.id), ['b', 'a', 'x']);
  assert.deepEqual(out.slides.map((d) => d.id), ['p2', 'p1'], 'an unlisted slide stays');
  const gone = applyOps(s, [{ o: 'drop', s: 'p1' }, { o: 'item', s: 'p1', i: 'a', set: { x: 1 } }, { o: 'item', s: 'p2', i: 'nope', set: { x: 1 } }]).state;
  assert.deepEqual(gone.slides.map((d) => d.id), ['p2'], 'changes to missing things are skipped');
});

test('only well-formed changes are taken from others', () => {
  const ops = cleanOps([null, 'x', { o: 'evil' }, { o: 'item', s: 'p1', i: '../../a', set: { x: 1 } }, { o: 'item', s: 'p1', i: 'a', set: { x: 1 }, unset: ['y', 5] },
    { o: 'slides', ids: ['p1', 'bad id!', 'p2'] }, { o: 'add', s: 'p1', i: 'z', d: [] }, { o: 'set', s: 'p1', set: 'no' }]);
  assert.deepEqual(ops, [{ o: 'item', s: 'p1', i: 'a', set: { x: 1 }, unset: ['y'] }, { o: 'slides', ids: ['p1', 'p2'] }, { o: 'set', s: 'p1', set: undefined, unset: undefined }]);
  assert.equal(cleanOps(Array.from({ length: 5000 }, () => ({ o: 'drop', s: 'p1' }))).length, 2000);
  assert.equal(cleanName('  철수\u0000​ 영희  '), '철수 영희');
  assert.equal(cleanName('가'.repeat(30)).length, 16);
  assert.equal(coCode(newCoCode().toUpperCase()).length, 40);
  assert.equal(coCode('abc'), '');
});

test('my unconfirmed change wins over a concurrent one on the same field only', () => {
  const pending = new Map([['i:p1:a:x', 1], ['o:p1', 1]]);
  const out = skipPending([{ o: 'item', s: 'p1', i: 'a', set: { x: 9, y: 9 } }, { o: 'order', s: 'p1', ids: [] }, { o: 'item', s: 'p1', i: 'b', set: { x: 9 } }], pending);
  assert.deepEqual(out, [{ o: 'item', s: 'p1', i: 'a', set: { y: 9 }, unset: [] }, { o: 'item', s: 'p1', i: 'b', set: { x: 9 } }]);
  assert.equal(skipPending(out, new Map()), out, 'nothing waiting: everything goes');
});

// 통로 흉내: 보낸 것은 다른 모두에게 간다(나에게는 오지 않는다). 보내는 사람마다 차례는 지키고, 늦게 오기도 한다.
function bus() {
  const ends = new Set();
  return {
    join() {
      const fns = new Set();
      const lines = new Map();       // 받는 사람마다 한 줄(보낸 차례대로 간다)
      const me = {
        deliver: (m) => { for (const fn of fns) fn(structuredClone(m)); },
        send(m) {
          const copy = structuredClone(m);
          for (const other of ends) if (other !== me) {
            lines.set(other, (lines.get(other) || Promise.resolve()).then(() => wait(Math.random() * 8)).then(() => { if (ends.has(other)) other.deliver(copy); }));
          }
        },
        on(fn) { fns.add(fn); return () => fns.delete(fn); },
        close() { ends.delete(me); },
      };
      ends.add(me);
      return me;
    },
  };
}
function fakeDoc(state = null) {
  const doc = {
    state,
    read: () => clone(doc.state),
    ready: () => true,
    apply(ops) { doc.state = applyOps(doc.state, ops).state; },
    async open(s) { await new Promise((r) => setTimeout(r, 15)); doc.state = clone(s); },
    replace(s) { doc.state = clone(s); },
    info: () => ({ name: '모둠 그림' }),
  };
  return doc;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (ok, ms = 4000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(20)) if (ok()) return; assert.fail('timed out'); };
const fast = { delay: 5, beat: 60, helloEvery: 30, joinMs: 3000 };

test('three people editing at once all end up with the same drawing', async (t) => {
  const b = bus();
  const hostDoc = fakeDoc(deck());
  const host = createCoSession({ role: 'host', wire: createWire(b.join(), { me: 'host00000001', max: 300, rate: 400 }), me: { id: 'host00000001', name: '선생님' }, doc: hostDoc, ...fast });
  const docs = [fakeDoc(), fakeDoc()];
  const opened = [];
  const guests = docs.map((doc, k) => createCoSession({ role: 'guest', wire: createWire(b.join(), { me: `guest0000000${k}`, max: 300, rate: 400 }), me: { id: `guest0000000${k}`, name: `친구${k}` }, doc: { ...doc, read: doc.read, apply: doc.apply, open: async (s, info) => { opened.push(info.name); await doc.open(s); }, replace: doc.replace, ready: doc.ready }, ...fast }));
  t.after(() => { host.close(); guests.forEach((g) => g.close()); });
  await until(() => guests.every((g) => g.live()));
  assert.deepEqual(opened, ['모둠 그림', '모둠 그림']);
  assert.equal(host.peers().length, 3);
  assert.deepEqual(docs[0].state, clone({ ...hostDoc.state, slides: hostDoc.state.slides.map(shareSlide) }), 'the guest got the drawing (without the voice)');

  // 동시에: 셋이 같은 요소의 같은 칸 · 다른 칸 · 새 요소 · 새 장 · 장의 차례
  const edit = (doc, session, fn) => { fn(doc.state); session.changed(); };
  edit(hostDoc, host, (s) => { s.slides[0].items[0].x = 11; s.slides[1].bg = '#111111'; });
  edit(docs[0], guests[0], (s) => { s.slides[0].items[0].x = 22; s.slides[0].items[0].text = '친구0'; s.slides[0].items.push(text('g0', { text: '사진처럼 큰 '.repeat(80) })); });
  edit(docs[1], guests[1], (s) => { s.slides[0].items[1].y = 33; s.slides.push({ id: 'p9', bg: '#999', items: [text('g1')] }); s.slides.reverse(); });
  for (let round = 0; round < 6; round++) {
    await wait(Math.random() * 15);
    const k = round % 3;
    const [doc, session] = k === 2 ? [hostDoc, host] : [docs[k], guests[k]];
    edit(doc, session, (s) => { const d = s.slides[round % s.slides.length]; if (d.items[0]) d.items[0].w = 10 + round; });
  }
  const shared = () => stateHash(hostDoc.state);
  await until(() => docs.every((d) => stateHash(d.state) === shared()), 6000);
  assert.ok(hostDoc.state.slides.some((d) => d.id === 'p9'), 'the new slide is everywhere');
  assert.ok(hostDoc.state.slides.flatMap((d) => d.items).some((it) => it.id === 'g0'), 'the big item came through in pieces');
  assert.equal(hostDoc.state.slides.find((d) => d.id === 'p2').voice.src, 'avoice0001', 'the host keeps the voice');
  const a = hostDoc.state.slides.find((d) => d.id === 'p1').items.find((it) => it.id === 'a');
  assert.equal(a.text, '친구0');

  // 고른 것 나누기 → 다른 사람에게는 잠긴다
  guests[0].select('p1', 'a');
  await until(() => host.lockedBy('p1', 'a')?.name === '친구0' && guests[1].lockedBy('p1', 'a')?.name === '친구0');
  assert.equal(guests[0].lockedBy('p1', 'a'), null, 'not locked for myself');

  // 나가기 · 끝내기
  const ended = [];
  guests[1].close();
  await until(() => host.peers().length === 2);
  const g0 = guests[0];
  const done = new Promise((r) => { const t = setInterval(() => { if (!g0.live()) { clearInterval(t); r(); } }, 10); });
  host.close();
  await done;
  ended.push('ok');
  assert.deepEqual(ended, ['ok']);
});

test('a guest that missed a change asks again and catches up', async () => {
  const b = bus();
  const hostDoc = fakeDoc(deck());
  const host = createCoSession({ role: 'host', wire: createWire(b.join(), { me: 'host00000001' }), me: { id: 'host00000001', name: '선생님' }, doc: hostDoc, ...fast });
  const doc = fakeDoc();
  const end = b.join();
  let drop = false;
  const lossy = { send: (m) => end.send(m), on: (fn) => end.on((m) => { if (drop && m.k === 'commit') return; fn(m); }), close: () => end.close() };
  const guest = createCoSession({ role: 'guest', wire: createWire(lossy, { me: 'guest0000001' }), me: { id: 'guest0000001', name: '친구' }, doc, ...fast });
  await until(() => guest.live());
  drop = true;
  hostDoc.state.slides[0].bg = '#abcdef'; host.changed();
  await wait(40);
  drop = false;
  hostDoc.state.slides[0].items[0].x = 5; host.changed();
  await until(() => stateHash(doc.state) === stateHash(hostDoc.state));
  assert.equal(doc.state.slides[0].bg, '#abcdef');
  host.close(); guest.close();
});

test('a guest with no host gives up with a clear message', async () => {
  const b = bus();
  let message = '';
  const guest = createCoSession({ role: 'guest', wire: createWire(b.join(), { me: 'guest0000001' }), me: { id: 'guest0000001', name: '친구' }, doc: fakeDoc(), on: { error: (m) => { message = m; } }, ...fast, joinMs: 100 });
  await until(() => message);
  assert.match(message, /시작한 사람의 화면이 열려 있는지/);
  assert.equal(guest.live(), false);
});

test('the wire splits a big message and joins it again in order', async () => {
  const b = bus();
  const [x, y] = [b.join(), b.join()];
  const a = createWire(x, { me: 'aaaa', max: 100, rate: 1000 });
  const c = createWire(y, { me: 'cccc', max: 100, rate: 1000 });
  const got = [];
  const seen = [];
  c.on((m) => got.push(m));
  c.progress((p) => seen.push(p.got));
  a.send({ k: 'full', to: 'cccc', data: '가'.repeat(950) });
  a.send({ k: 'here', slide: 'p1' });
  await until(() => got.length === 2);
  assert.equal(got[0].data.length, 950);
  assert.equal(got[0].from, 'aaaa');
  assert.equal(got[1].k, 'here');
  assert.ok(seen.length >= 9 && seen.at(-1) === seen.length);
  const other = createWire(b.join(), { me: 'dddd', max: 100, rate: 1000 });
  const theirs = [];
  other.on((m) => theirs.push(m));
  a.send({ k: 'full', to: 'cccc', data: 'x'.repeat(500) });
  await until(() => got.length === 3);
  assert.equal(theirs.length, 0, 'pieces meant for someone else are not kept');
  a.close(); c.close(); other.close();
});
