// 계정 저장(app/sync.js): 이 기기와 계정을 맞추는 규칙과 올리기 줄 세우기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeAccount, createPusher, syncsRecord } from '../app/sync.js';
import { newDesignId } from '../app/designs.js';

const rec = (id, updatedAt, name = '그림') => ({ id, name, ratio: '1:1', slides: [{ bg: 'paper', items: [{ t: 'text', x: 50, y: 50, w: 80, text: name }] }], uploads: [], updatedAt });
function localStore(list) {
  const m = new Map(list.map((r) => [r.id, r]));
  return { m, list: async () => [...m.values()], put: async (r) => { m.set(r.id, r); return r; }, remove: async (id) => { m.delete(id); } };
}

test('optional account policy preserves local PPT originals through refresh/deletions without pushing or loading them', async () => {
  const ids=[1,2,3,4].map(n=>newDesignId(1800000000000+n,n/10));
  const localPpt={...rec(ids[0],100,'기기 PPT'),source:{kind:'pptx'}},drawing=rec(ids[1],200,'기존 그림');
  const store=localStore([localPpt,drawing]),sent=[],loaded=[];
  const out=await mergeAccount({accepts:r=>r.source?.kind!=='pptx',
    pull:async()=>({records:[{...localPpt,source:{kind:'local'},updatedAt:999},rec(ids[2],300),{...rec(ids[3],400),source:{kind:'pptx'}}],deleted:[{id:ids[0],at:2000}]}),
    push:async r=>sent.push(r.id),load:async r=>(loaded.push(r.id),r),drop:async()=>{}},store);
  assert.deepEqual(out,{got:1,sent:1,removed:0});assert.deepEqual(sent,[drawing.id]);assert.deepEqual(loaded,[ids[2]]);
  assert.deepEqual(store.m.get(localPpt.id),localPpt);assert.equal(store.m.has(ids[3]),false);
});

test('optional account policy excludes PPT from background pusher and fails closed on a host policy error', async () => {
  const calls=[],done=[],p=createPusher({accepts:r=>r.source?.kind!=='pptx',push:async r=>calls.push(r.id)},{delay:10000,onDone:(...args)=>done.push(args)});
  const local={...rec(newDesignId(),100),source:{kind:'pptx'}},drawing=rec(newDesignId(1800000000009,.8),200);
  p.queue(local);assert.equal(p.pending(),false);await p.flush(local.id);assert.deepEqual(done,[]);
  p.queue(drawing);await p.flush(drawing.id);assert.deepEqual(calls,[drawing.id]);assert.deepEqual(done,[[drawing.id,true]]);
  assert.equal(syncsRecord({accepts:()=>{throw Error('policy unavailable');}},drawing),false);
  assert.equal(syncsRecord({},local),true,'legacy hosts without a policy retain their exact sync contract');
});

test('맞추기: 더 늦게 고친 쪽이 이기고, 한쪽에만 있는 그림은 다른 쪽으로 간다', async () => {
  const [a, b, c, d] = [1, 2, 3, 4].map((n) => newDesignId(1700000000000 + n, n / 10));
  const store = localStore([rec(a, 100, '이 기기가 새것'), rec(b, 100, '계정이 새것'), rec(c, 100, '이 기기에만')]);
  const sent = [];
  const sync = { pull: async () => ({ records: [rec(a, 50), rec(b, 200, '계정 판'), rec(d, 300, '계정에만')], deleted: [] }), push: async (r) => { sent.push(r.id); }, drop: async () => {} };
  const out = await mergeAccount(sync, store);
  assert.deepEqual(out, { got: 2, sent: 2, removed: 0 });
  assert.equal(store.m.get(b).name, '계정 판');
  assert.ok(store.m.has(d));
  assert.deepEqual(sent.sort(), [a, c].sort());
});

test('다른 기기에서 지운 그림은 이 기기에서도 지운다. 지운 뒤에 이 기기에서 고친 것은 남겨서 다시 올린다', async () => {
  const [a, b] = [1, 2].map((n) => newDesignId(1700000000000 + n, n / 10));
  const store = localStore([rec(a, 100), rec(b, 900)]);
  const sent = [];
  const sync = { pull: async () => ({ records: [], deleted: [{ id: a, at: 500 }, { id: b, at: 500 }] }), push: async (r) => { sent.push(r.id); }, drop: async () => {} };
  const out = await mergeAccount(sync, store);
  assert.equal(out.removed, 1);
  assert.ok(!store.m.has(a));
  assert.deepEqual(sent, [b]);
});

test('계정의 기록은 이 기기에 적기 직전에 load 로 완성한다(필요한 것만)', async () => {
  const [a, b] = [1, 2].map((n) => newDesignId(1700000000010 + n, n / 10));
  const store = localStore([rec(a, 500)]);
  const loaded = [];
  const sync = { pull: async () => ({ records: [rec(a, 100), { ...rec(b, 300), name: '사진 없음' }], deleted: [] }), push: async () => {}, drop: async () => {},
    load: async (r) => { loaded.push(r.id); return { ...r, name: '받은 판' }; } };
  await mergeAccount(sync, store);
  assert.deepEqual(loaded, [b], '이 기기가 더 새것인 그림은 받지 않는다');
  assert.equal(store.m.get(b).name, '받은 판');
});

test('계정이 망가진 기록을 주면 버리고, 받기에 실패하면 이 기기는 그대로다', async () => {
  const a = newDesignId(1700000000001, 0.1);
  const store = localStore([rec(a, 100)]);
  await mergeAccount({ pull: async () => ({ records: [{ id: 'nope' }, null, 3], deleted: [{ id: a }] }), push: async () => {}, drop: async () => {} }, store);
  assert.ok(store.m.has(a), '지운 때가 없는 표시는 무시한다');
  await assert.rejects(mergeAccount({ pull: async () => { throw new Error('offline'); }, push: async () => {}, drop: async () => {} }, store));
  assert.ok(store.m.has(a));
});

test('올리기 줄: 짧은 사이의 저장은 마지막 것만 올리고, 실패하면 한 번 더, 지운 그림은 올리지 않는다', async () => {
  const sent = [];
  let fail = 1;
  const done = [];
  const p = createPusher({ push: async (r) => { if (fail-- > 0) throw new Error('net'); sent.push(r.name); } }, { delay: 5, retry: 10, onDone: (id, ok) => done.push(ok) });
  const id = newDesignId(1700000000002, 0.2);
  p.queue(rec(id, 1, '첫째'));
  p.queue(rec(id, 2, '둘째'));
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(sent, ['둘째'], '첫 시도는 실패하고, 다시 해서 마지막 것만 올라간다');
  assert.deepEqual(done, [false, true]);
  const gone = newDesignId(1700000000003, 0.3);
  p.queue(rec(gone, 3, '지울 것'));
  p.cancel(gone);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!sent.includes('지울 것'));
  assert.equal(p.pending(), false);
});

test('앱은 sync 가 있으면 저장 뒤에 계정으로 올리고, 지울 때 계정에서도 지우고, 시작할 때 맞춘다', () => {
  const app = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(accountFor\(kept\)\) pusher\.queue\(kept\);/);
  assert.match(app, /if \(pusher\) pusher\.cancel\(record\.id\);\n\s+if \(sync && syncsRecord\(sync, record\)\) sync\.drop\(record\.id\)/);
  assert.match(app, /render\(\);\n  syncAccount\(\);\n\}/);
  assert.match(app, /\['pull', 'push', 'drop'\]\.every/);
});
