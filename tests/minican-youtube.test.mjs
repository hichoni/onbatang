// 유튜브 영상: 주소 읽기 · 시작 시각 · 저장하는 모양(영상의 이름표와 시작 시각, "바로 틀기"만).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYouTube, ytStart, ytEmbed, ytWatch, ytTime, isYouTubeId } from '../src/youtube.js';
import { cleanItem, newYouTube, itemLabel, configure, settings } from '../src/model.js';

const ID = 'dQw4w9WgXcQ';

test('주소 읽기: 여러 모양의 유튜브 주소에서 영상과 시작 시각을 찾는다', () => {
  for (const url of [`https://youtu.be/${ID}`, `youtu.be/${ID}?si=abc`, `https://www.youtube.com/watch?v=${ID}&list=x`, `https://m.youtube.com/watch?v=${ID}`,
    `https://youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}`, `https://www.youtube.com/live/${ID}`, `https://music.youtube.com/watch?v=${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`, `  이 영상 보세요 https://youtu.be/${ID}  `]) {
    assert.deepEqual(parseYouTube(url), { id: ID }, url);
  }
  assert.deepEqual(parseYouTube(`https://youtu.be/${ID}?t=90`), { id: ID, start: 90 });
  assert.deepEqual(parseYouTube(`https://www.youtube.com/watch?v=${ID}&t=1m30s`), { id: ID, start: 90 });
  assert.deepEqual(parseYouTube(`https://www.youtube.com/embed/${ID}?start=75`), { id: ID, start: 75 });
  for (const bad of ['', 'hello', `https://evil.com/watch?v=${ID}`, `https://youtube.com.evil.com/watch?v=${ID}`, 'https://youtu.be/short', `javascript:alert(1)//youtu.be/${ID}`,
    `https://www.youtube.com/watch?v=${ID}x`, `https://www.youtube.com/channel/${ID}`]) {
    assert.equal(parseYouTube(bad), null, bad);
  }
});

test('시작 시각: 초 · 1m30s · 1:30 · 1:02:03 을 읽고, 12시간에서 자른다', () => {
  assert.equal(ytStart(90), 90);
  assert.equal(ytStart('90s'), 90);
  assert.equal(ytStart('1m30s'), 90);
  assert.equal(ytStart('1h2m3s'), 3723);
  assert.equal(ytStart('1:30'), 90);
  assert.equal(ytStart('1:02:03'), 3723);
  assert.equal(ytStart('abc'), 0);
  assert.equal(ytStart(-5), 0);
  assert.equal(ytStart(10 ** 9), 43200);
  assert.equal(ytTime(90), '1:30');
  assert.equal(ytTime(3723), '1:02:03');
});

test('트는 주소는 개인 정보 보호 모드이고, 조종 신호를 받을 때만 enablejsapi 와 origin 을 붙인다', () => {
  assert.equal(ytEmbed(ID), `https://www.youtube-nocookie.com/embed/${ID}?rel=0&playsinline=1`);
  assert.equal(ytEmbed(ID, { start: 30, api: true, origin: 'https://hichoni.github.io' }),
    `https://www.youtube-nocookie.com/embed/${ID}?rel=0&playsinline=1&start=30&enablejsapi=1&origin=https%3A%2F%2Fhichoni.github.io`);
  assert.equal(ytWatch(ID, 90), `https://www.youtube.com/watch?v=${ID}&t=90s`);
  // 끝 시각(시작보다 뒤일 때만) · 자막(켜고 말을 고른다 · 'on' 은 영상 자막 그대로)
  assert.equal(ytEmbed(ID, { start: 30, end: 90, cc: 'ko' }), `https://www.youtube-nocookie.com/embed/${ID}?rel=0&playsinline=1&start=30&end=90&cc_load_policy=1&cc_lang_pref=ko&hl=ko`);
  assert.equal(ytEmbed(ID, { start: 30, end: 20, cc: 'on' }), `https://www.youtube-nocookie.com/embed/${ID}?rel=0&playsinline=1&start=30&cc_load_policy=1`);
  assert.equal(ytEmbed(ID, { cc: 'xx<' }), `https://www.youtube-nocookie.com/embed/${ID}?rel=0&playsinline=1`);
});

test('저장하는 모양: 이름표 · 시작 시각 · 바로 틀기만 남기고, 모르는 이름표나 주소는 버린다', () => {
  configure({ aspect: 16 / 9 });
  try {
    const it = cleanItem({ t: 'yt', yt: ID, start: '1:30', auto: true, w: 50, h: 50, fx: true, url: 'https://evil.example/x', title: '<b>x</b>' });
    assert.deepEqual(Object.keys(it).sort(), ['auto', 'h', 'lock', 'op', 'rot', 't', 'w', 'x', 'y', 'yt'].concat('start').sort());
    assert.equal(it.start, 90);
    assert.equal(it.auto, true);
    assert.equal(cleanItem({ t: 'yt', yt: 'nope' }), null);
    // 재생 설정: 끝 시각(시작보다 뒤) · 화면 가득 · 자막 · 되풀이. 모르는 값은 버린다.
    const set = cleanItem({ t: 'yt', yt: ID, start: 30, end: '2:00', full: true, cc: 'en', loop: true });
    assert.deepEqual([set.end, set.full, set.cc, set.loop], [120, true, 'en', true]);
    const bad = cleanItem({ t: 'yt', yt: ID, start: 90, end: 60, full: 'yes', cc: 'fr', loop: 1 });
    for (const k of ['end', 'full', 'cc', 'loop']) assert.equal(k in bad, false, k);
    assert.equal(itemLabel({ ...set, start: 0 }), '유튜브 영상 · 화면 가득 · 자막');
    assert.equal(cleanItem({ t: 'yt', yt: `${ID}<` }), null);
    const placed = newYouTube(ID);
    // 16:9 영상: 카드 너비의 60%, 높이는 카드 비율에 맞춰 영상의 비율을 지킨다.
    assert.equal(placed.w, 60);
    assert.ok(Math.abs((placed.w / placed.h) * settings().aspect - 16 / 9) < 0.01);
    assert.equal(placed.start, undefined);
    assert.equal(newYouTube('bad'), null);
    assert.equal(itemLabel(placed), '유튜브 영상');
    assert.equal(itemLabel({ ...placed, start: 90 }), '유튜브 영상 (1:30부터)');
    assert.ok(isYouTubeId(ID));
  } finally { configure({ aspect: 1 }); }
});

test('발표: 스페이스 바가 아직 틀지 않은 영상을 틀고, 틀고 있으면 멈추기 · 다시 틀기를 한다', () => {
  const app = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  assert.match(app, /const waiting = tube\.find\(\(p\) => !p\.started\);\n      if \(waiting\) \{ waiting\.play\(\); return; \}/);
  assert.match(app, /if \(e\.key === ' ' && tubeNow\(\)\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); tubeNow\(\)\.toggle\(\); return; \}/);
  const render = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.match(render, /postMessage\(JSON\.stringify\(\{ event: 'command', func, args \}\), YT_ORIGIN\)/, '조종 신호는 유튜브(nocookie)에만 보낸다');
  assert.match(render, /if \(e\.source !== frame\.contentWindow \|\| e\.origin !== YT_ORIGIN\) return;/, '그 영상에서 온 신호만 듣는다');
});
