import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanVoice, slideVoice, VOICE_LIMITS } from '../src/document.js';
import { cleanDesign } from '../src/model.js';
import { filmPlan, readCheck } from '../src/film.js';
import { newRecord, migrateRecord, slideExtra, deckVoices } from '../app/designs.js';
import { voiceSlides, voiceType, startVoice, VOICE_LEAST_MS } from '../app/voice-record.js';
import { newVoiceKey } from '../app/voices.js';

test('a slide keeps only a well-formed part of a recording', () => {
  assert.deepEqual(cleanVoice({ src: 'a1b2c3d4', at: 1.23456, ms: 4200.4, steps: [3000, 1000, 99999, -1, 'x'] }), { src: 'a1b2c3d4', at: 1.235, ms: 4200, steps: [1000, 3000] });
  assert.deepEqual(cleanVoice({ src: 'a1b2c3d4', at: 0, ms: 900 }), { src: 'a1b2c3d4', at: 0, ms: 900 }, 'no clicks, no steps');
  for (const bad of [null, 'x', [], { src: 'bad key!', at: 0, ms: 2000 }, { src: 'a1b2c3d4', at: -1, ms: 2000 }, { src: 'a1b2c3d4', at: 0, ms: 100 }, { src: 'a1b2c3d4', at: 0, ms: VOICE_LIMITS.ms + 1 }]) assert.equal(cleanVoice(bad), null, JSON.stringify(bad));
  assert.equal(cleanVoice({ src: 'a1b2c3d4', at: 0, ms: 5000, steps: Array.from({ length: 200 }, (_, i) => i) }).steps.length, VOICE_LIMITS.steps);
  assert.deepEqual(slideVoice({ voice: { src: 'nope' } }), {});
  assert.match(newVoiceKey(1700000000000, 0.5), /^a[0-9a-z]+$/);
});

test('the voice survives the editor sanitizer, the stored record and slide rebuilding', () => {
  const voice = { src: 'avoice0001', at: 2.5, ms: 6000, steps: [1500] };
  assert.deepEqual(cleanDesign({ bg: '#fff', items: [], voice }).voice, voice);
  assert.deepEqual(slideExtra({ id: 'p000000001', bg: '#fff', items: [], voice }).voice, voice);
  const record = newRecord('16:9');
  record.slides = [{ ...record.slides[0], voice }, { ...record.slides[0], id: 'p000000002', voice: { ...voice, at: 8.5 } }];
  const back = migrateRecord(JSON.parse(JSON.stringify(migrateRecord(record))));
  assert.deepEqual(back.slides.map((s) => s.voice), [voice, { ...voice, at: 8.5 }]);
  assert.deepEqual(deckVoices(back.slides), ['avoice0001'], 'one file for both parts');
});

test('visits become one part per slide: the last real visit wins, quick pass-throughs do not count', () => {
  const parts = voiceSlides([
    { index: 0, start: 0, end: 4000, steps: [] },
    { index: 1, start: 4000, end: 4500, steps: [] },                  // 지나치기만 했다
    { index: 2, start: 4500, end: 9000, steps: [1200, 9999] },
    { index: 1, start: 9000, end: 12000, steps: [500] },               // 돌아와서 말했다
  ]);
  assert.deepEqual([...parts.keys()].sort(), [0, 1, 2]);
  assert.deepEqual(parts.get(0), { at: 0, ms: 4000 });
  assert.deepEqual(parts.get(1), { at: 9, ms: 3000, steps: [500] });
  assert.deepEqual(parts.get(2), { at: 4.5, ms: 4500, steps: [1200] }, 'a click after leaving is dropped');
  assert.equal(voiceSlides([{ index: 0, start: 0, end: VOICE_LEAST_MS - 1, steps: [] }]).size, 0);
});

test('the video keeps the recorded time of each voiced slide and shows clicks when they were pressed', () => {
  const text = (id, extra = {}) => ({ id, t: 'text', text: '글', x: 50, y: 50, w: 40, size: 5, ...extra });
  const designs = [
    { bg: '#fff', items: [text('e000000001')], voice: { src: 'avoice0001', at: 0, ms: 4200 } },
    { bg: '#fff', items: [text('e000000002'), text('e000000003', { an: 'fade', aw: true }), text('e000000004', { an: 'fade', aw: true })], voice: { src: 'avoice0001', at: 4.2, ms: 9000, steps: [2500] } },
    { bg: '#fff', items: [text('e000000005')] },
  ].map((d) => cleanDesign(d));
  const plan = filmPlan(designs, { stay: 5 });
  assert.equal(plan.slides[0].ms, 4200, 'exactly as recorded');
  assert.equal(plan.slides[1].ms, 9000);
  assert.deepEqual(plan.slides[1].voice, { src: 'avoice0001', at: 4.2, ms: 9000 });
  const clicks = plan.slides[1].moves.filter((m) => m.click).map((m) => m.start);
  assert.equal(clicks[0], 2500, 'the pressed click comes at the pressed time');
  assert.ok(clicks[1] > 2500 && clicks[1] < 9000, 'the unpressed one comes after, inside the slide');
  assert.equal(plan.slides[2].voice, undefined);
  assert.equal(plan.slides[2].ms, 5000, 'other slides keep the chosen stay');
  // 읽기 시간 점검은 녹음한 장의 시간을 바꾸지 않는다
  const wordy = cleanDesign({ bg: '#fff', items: [text('e000000009', { text: '가'.repeat(200) })], voice: { src: 'avoice0001', at: 0, ms: 2000 } });
  const check = readCheck([wordy], { stay: 3 });
  assert.equal(check.short.length, 0);assert.equal(check.fit[0].dur, undefined);
});

test('the recorder notes slide changes and clicks against one continuous recording', async () => {
  let clock = 0;
  const stopped = [];
  class FakeRecorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(stream, options) { this.mimeType = options.mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; queueMicrotask(() => this.onstart?.()); }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['abc'], { type: this.mimeType }) }); queueMicrotask(() => this.onstop?.()); }
  }
  const media = { getUserMedia: async (c) => { assert.equal(c.audio.echoCancellation, true); return { getTracks: () => [{ stop: () => stopped.push(1) }] }; } };
  assert.equal(voiceType(FakeRecorder), 'audio/webm;codecs=opus');
  const rec = await startVoice({ index: 0, media, Recorder: FakeRecorder, now: () => clock });
  clock = 3000; rec.changed(1);
  clock = 4200; rec.step();
  clock = 7000; assert.equal(rec.here(), 4000); assert.equal(rec.all(), 7000);
  const take = await rec.stop();
  assert.equal(take.type, 'audio/webm;codecs=opus'); assert.equal(take.seconds, 7);
  assert.deepEqual(take.visits, [{ index: 0, start: 0, steps: [], end: 3000 }, { index: 1, start: 3000, steps: [1200], end: 7000 }]);
  assert.equal(stopped.length, 1, 'the microphone is released');
  assert.equal(await rec.stop(), null, 'stopping twice is harmless');
});
