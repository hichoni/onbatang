import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPresentationState, connectHtmlPresentation} from '../src/html-presentation.js';
import {htmlFileSource} from '../src/html-file.js';

class Events {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  fire(type, value = {}) { for (const fn of this.listeners.get(type) || []) fn(value); }
}
test('rapid targets ignore stale, forged and cross-frame state; closing releases listeners', () => {
  const host = new Events(), frame = new Events(), messages = [], updates = [], keys = [];
  host.crypto = {randomUUID: () => '12345678-1234-4321-8765-123456789012'};
  frame.contentWindow = {postMessage: message => messages.push(message)};
  const bridge = connectHtmlPresentation(frame, {window: host, onState: state => updates.push(state), onKey: key => keys.push(key)});
  assert.equal(bridge.step(1), true, 'do not close a loading HTML deck');
  frame.fire('load');
  const envelope = messages[0];
  const emit = (data, source = frame.contentWindow) => host.fire('message', {source, data: {...envelope, type:'state', sequence:0, ...data}});
  const state = {index:0,total:49,cues:Array.from({length:49},(_,i)=>({title:`Cue ${i + 1}`,notes:`Note ${i + 1}`}))};
  emit({state}, {}); assert.equal(bridge.state, null);
  emit({state,channel:'forged'}); assert.equal(bridge.state, null);
  emit({state});
  for (let i=0;i<18;i++) bridge.step(1);
  for (let i=0;i<5;i++) bridge.step(-1);
  assert.equal(bridge.state.index,13);
  emit({state:{...state,index:1},sequence:1}); assert.equal(bridge.state.index,13);
  emit({state:{...state,index:13},sequence:23}); assert.equal(bridge.state.index,13);
  emit({type:'key',key:'v',code:'KeyV'}); assert.equal(keys.length,0);
  emit({type:'key',key:'PageDown',code:'PageDown'}); assert.equal(keys.length,1);
  bridge.go(48); assert.equal(bridge.step(1,true),true); assert.equal(bridge.step(1),false);
  bridge.go(0); assert.equal(bridge.step(-1,true),true);
  bridge.destroy(); assert.equal(host.listeners.get('message').size,0); assert.equal(frame.listeners.get('load').size,0);
});
test('unadapted HTML retains the ordinary outer-slide behavior; state limits are strict', () => {
  for (const raw of [{index:0,total:501},{index:-1,total:49},{index:49,total:49},{index:0,total:NaN}]) assert.equal(cleanPresentationState(raw),null);
  const state=cleanPresentationState({index:0,total:1,title:'x'.repeat(500),notes:'n'.repeat(9000)});
  assert.equal(state.title.length,160);assert.equal(state.notes.length,4000);
  const html='<!doctype html><html lang="ko"><body><svg viewBox="0 0 1920 1080"></svg></body></html>';
  assert.ok(htmlFileSource(html).endsWith(html), 'source bytes are not rasterized or rewritten');
});
