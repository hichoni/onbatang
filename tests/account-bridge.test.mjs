// GBE-AI Lab 계정으로 이어 쓰기(app/account-bridge.js): 연결 창과의 신호 · 가져올지 정하기.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountBridge, importPlan} from '../app/account-bridge.js';

function fakeHost() {
  const listeners = [], sent = [];
  const popup = {closed: false, focus() {}, close() { this.closed = true; }, postMessage(message, origin) { sent.push({message, origin}); }};
  const host = {location: {origin: 'https://onbatang.web.app'}, opened: [], addEventListener: (type, fn) => listeners.push(fn),
    open(url, name, features) { host.opened.push({url, name, features}); return popup; }};
  const emit = (data, over = {}) => listeners.forEach((fn) => fn({origin: 'https://gai-lab.netlify.app', source: popup, data, ...over}));
  return {host, popup, sent, emit};
}

test('the bridge opens the GBE-AI Lab window with this origin, waits for ready, and only trusts that window', async () => {
  const f = fakeHost(), bridge = createAccountBridge({host: f.host});
  assert.throws(() => createAccountBridge({url: 'http://evil.example/x', host: f.host}), /주소/);
  await assert.rejects(bridge.list(), /먼저 연결/);
  const connecting = bridge.connect();
  const opened = new URL(f.host.opened[0].url), params = new URLSearchParams(opened.hash.slice(1));
  assert.equal(opened.origin + opened.pathname, 'https://gai-lab.netlify.app/onbatang-account-connect.html');
  assert.equal(params.get('origin'), 'https://onbatang.web.app');
  const channel = params.get('channel');
  f.emit({type: 'onbatang-account', channel, event: 'ready'}, {origin: 'https://evil.example'});
  f.emit({type: 'onbatang-account', channel: 'other', event: 'ready'});
  f.emit({type: 'onbatang-account', channel, event: 'ready'}, {source: {}});
  assert.equal(bridge.connected, false, 'look-alike signals are ignored');
  f.emit({type: 'onbatang-account', channel, event: 'ready'});
  await connecting;
  assert.equal(bridge.connected, true);
  const listing = bridge.list();
  const ask = f.sent[0];
  assert.equal(ask.origin, 'https://gai-lab.netlify.app');
  assert.equal(ask.message.action, 'list');
  f.emit({type: 'onbatang-account', channel, request: ask.message.request, event: 'result', result: [{id: 'd1234567', name: '집에서', updatedAt: 5, slides: 2}]});
  assert.deepEqual(await listing, [{id: 'd1234567', name: '집에서', updatedAt: 5, slides: 2}]);
  const putting = bridge.put([{id: 'd1234567'}]);
  f.emit({type: 'onbatang-account', channel, request: f.sent[1].message.request, event: 'error', message: 'GBE-AI Lab 계정에 그림을 더 둘 수 없어요.'});
  await assert.rejects(putting, /더 둘 수 없어요/);
  bridge.close();
  assert.equal(f.popup.closed, true);
  assert.equal(bridge.connected, false);
});

test('a blocked popup is a clear error', async () => {
  const f = fakeHost();
  f.host.open = () => null;
  await assert.rejects(createAccountBridge({host: f.host}).connect(), /팝업을 허용/);
});

test('import plan: new drawings and newer account copies come in; equal or newer device copies stay', () => {
  const plan = importPlan(
    [{id: 'd1111111', updatedAt: 10}, {id: 'd2222222', updatedAt: 20}, {id: 'd3333333', updatedAt: 30}, {id: 'bad', updatedAt: 1}],
    [{id: 'd2222222', updatedAt: 25}, {id: 'd3333333', updatedAt: 5}]);
  assert.deepEqual(plan.map((r) => [r.id, r.state]), [['d1111111', 'new'], ['d2222222', 'same'], ['d3333333', 'newer']]);
});
